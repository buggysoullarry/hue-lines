// lib/hueEventStream.js — Subscribe to Hue Bridge EventStream for button events
const https = require('https');
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const BUTTON_MAP_PATH = path.join(__dirname, '..', 'buttonMap.json');
let activeReq = null;
let onButtonPress = null;
let onRotaryTurn = null;
let reconnectTimer = null;

function getHueConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    return { ip: config.hue.bridgeIp, key: config.hue.username };
  } catch {
    return null;
  }
}

function readButtonMap() {
  try { return JSON.parse(fs.readFileSync(BUTTON_MAP_PATH, 'utf8')); }
  catch { return {}; }
}

function writeButtonMap(map) {
  fs.writeFileSync(BUTTON_MAP_PATH, JSON.stringify(map, null, 2) + '\n', 'utf8');
}

function connect(handler, rotaryHandler) {
  onButtonPress = handler;
  onRotaryTurn = rotaryHandler || null;
  const hue = getHueConfig();
  if (!hue) {
    log.warn('EventStream: No Hue config found, skipping');
    return;
  }

  log.info(`EventStream: Connecting to bridge at ${hue.ip}...`);

  const req = https.request({
    hostname: hue.ip,
    port: 443,
    path: '/eventstream/clip/v2',
    method: 'GET',
    headers: {
      'hue-application-key': hue.key,
      'Accept': 'text/event-stream',
    },
    rejectUnauthorized: false,
  }, (res) => {
    if (res.statusCode !== 200) {
      log.error(`EventStream: Unexpected status ${res.statusCode}`);
      scheduleReconnect();
      return;
    }

    log.info('EventStream: Connected');
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // keep incomplete part

      for (const part of parts) {
        const dataLine = part.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;

        try {
          const events = JSON.parse(dataLine.slice(6));
          for (const event of events) {
            if (event.type !== 'update') continue;
            for (const item of event.data) {
              if (item.type === 'button' && item.button?.last_event) {
                const buttonEvent = {
                  buttonId: item.id,
                  deviceId: item.owner?.rid,
                  event: item.button.last_event,
                };
                log.info(`EventStream: Button ${item.id} → ${buttonEvent.event}`);
                // Fire on initial_press (Hue Tap Switch only sends this)
                // or short_release (newer switches like Tap Dial)
                if ((buttonEvent.event === 'initial_press' || buttonEvent.event === 'short_release') && onButtonPress) {
                  onButtonPress(buttonEvent);
                }
              }
              // Handle rotary dial events (Hue Tap Dial Switch)
              if (item.type === 'relative_rotary' && item.relative_rotary?.last_event) {
                const rotary = item.relative_rotary.last_event;
                const rotaryEvent = {
                  rotaryId: item.id,
                  deviceId: item.owner?.rid,
                  direction: rotary.rotation?.direction, // 'clock_wise' or 'counter_clock_wise'
                  steps: rotary.rotation?.steps || 0,
                  duration: rotary.rotation?.duration || 0,
                };
                log.info(`EventStream: Rotary ${item.id} → ${rotaryEvent.direction} (${rotaryEvent.steps} steps)`);
                if (onRotaryTurn) onRotaryTurn(rotaryEvent);
              }
            }
          }
        } catch (err) {
          // Ignore parse errors from partial data
        }
      }
    });

    res.on('end', () => {
      log.warn('EventStream: Disconnected');
      scheduleReconnect();
    });

    res.on('error', (err) => {
      log.error(`EventStream response error: ${err.message}`);
      scheduleReconnect();
    });
  });

  req.on('error', (err) => {
    log.error(`EventStream connection error: ${err.message}`);
    scheduleReconnect();
  });

  // Keep-alive timeout — if no data in 120s, reconnect
  req.setTimeout(120000, () => {
    log.warn('EventStream: Timeout, reconnecting...');
    req.destroy();
    scheduleReconnect();
  });

  req.end();
  activeReq = req;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(onButtonPress, onRotaryTurn);
  }, 5000);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeReq) {
    activeReq.destroy();
    activeReq = null;
  }
}

module.exports = { connect, disconnect, readButtonMap, writeButtonMap };
