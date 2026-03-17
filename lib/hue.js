// lib/hue.js — Hue API integration with dynamic config
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.json');

function getConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function getBridgeIp() { return getConfig().hue.bridgeIp; }
function getUsername() { return getConfig().hue.username; }

async function hueV2(method, resource, data, retries = 2) {
  const ip = getBridgeIp();
  const key = getUsername();
  const opts = {
    method,
    url: `https://${ip}/clip/v2${resource}`,
    headers: { 'hue-application-key': key },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 5000
  };
  if (data) opts.data = data;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios(opts);
    } catch (err) {
      const isLast = attempt === retries;
      const isRetryable = !err.response || err.code === 'ECONNRESET' ||
        err.code === 'EHOSTUNREACH' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED';

      if (isLast || !isRetryable) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      const log = require('./logger');
      log.warn(`Hue API ${method} ${resource} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Get all lights from Hue bridge (v1 API)
async function getLights() {
  const ip = getBridgeIp();
  const user = getUsername();
  const response = await axios.get(`http://${ip}/api/${user}/lights`, { timeout: 5000 });
  const lights = Object.entries(response.data).map(([id, light]) => ({
    id,
    name: light.name,
    on: light.state.on,
    color: hslToHex(light.state.hue / 65535, light.state.sat / 254, light.state.bri / 254)
  }));
  return lights;
}

// Get all rooms from Hue bridge using v2 API
async function getRooms() {
  const [roomsResponse, lightsResponse, devicesResponse] = await Promise.all([
    hueV2('get', '/resource/room'),
    hueV2('get', '/resource/light'),
    hueV2('get', '/resource/device')
  ]);

  const deviceMap = {};
  devicesResponse.data.data.forEach(device => {
    deviceMap[device.id] = device;
  });

  const lightsMap = {};
  lightsResponse.data.data.forEach(light => {
    const device = deviceMap[light.owner?.rid];
    const productName = device?.product_data?.product_name || '';
    const archetype = device?.product_data?.product_archetype || '';

    lightsMap[light.id] = {
      id: light.id,
      name: device?.metadata?.name || light.metadata?.name || 'Unknown',
      on: light.on?.on || false,
      bri: Math.round((light.dimming?.brightness || 0) * 2.54),
      modelid: device?.product_data?.model_id || '',
      productname: productName,
      manufacturername: device?.product_data?.manufacturer_name || '',
      isStrip: productName.toLowerCase().includes('strip') || archetype === 'lightstrip',
      isOmniGlow: productName.toLowerCase().includes('omniglow') || (archetype === 'lightstrip' && light.gradient),
      color: light.color ? xyToHex(light.color.xy.x, light.color.xy.y, (light.dimming?.brightness || 100) / 100) : '#ffffff'
    };
  });

  const rooms = roomsResponse.data.data.map(room => {
    const roomLights = [];
    const deviceIds = room.children
      .filter(child => child.rtype === 'device')
      .map(child => child.rid);

    deviceIds.forEach(deviceId => {
      const device = deviceMap[deviceId];
      if (device && device.services) {
        const lightServices = device.services.filter(service => service.rtype === 'light');
        lightServices.forEach(service => {
          const light = lightsMap[service.rid];
          if (light) roomLights.push(light);
        });
      }
    });

    return {
      id: room.id,
      name: room.metadata.name,
      lights: roomLights
    };
  });

  return rooms;
}

async function startPlay(lightId) {
  await hueV2('put', `/resource/light/${lightId}`, {
    on: { on: true },
    dynamics: { duration: 0 },
    color_temperature: { mirek: 250 }
  });
}

async function stopPlay(lightId) {
  await hueV2('put', `/resource/light/${lightId}`, {
    dynamics: { duration: 0 }
  });
}

async function setLightOn(lightId) {
  await hueV2('put', `/resource/light/${lightId}`, { on: { on: true } });
}

async function setLightOff(lightId) {
  await hueV2('put', `/resource/light/${lightId}`, { on: { on: false } });
}

async function setLightName(lightId, newName) {
  const lightResponse = await hueV2('get', `/resource/light/${lightId}`);
  const deviceId = lightResponse.data.data[0]?.owner?.rid;
  if (deviceId) {
    await hueV2('put', `/resource/device/${deviceId}`, { metadata: { name: newName } });
  }
}

async function setLightBrightness(lightId, brightness) {
  const brightnessPercent = Math.round((brightness / 254) * 100);
  await hueV2('put', `/resource/light/${lightId}`, {
    on: { on: true },
    dimming: { brightness: brightnessPercent }
  });
}

// Helper: Convert xy to hex
function xyToHex(x, y, brightness = 1) {
  const z = 1.0 - x - y;
  const Y = brightness;
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

  r = r <= 0.0031308 ? 12.92 * r : (1.0 + 0.055) * Math.pow(r, (1.0 / 2.4)) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : (1.0 + 0.055) * Math.pow(g, (1.0 / 2.4)) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : (1.0 + 0.055) * Math.pow(b, (1.0 / 2.4)) - 0.055;

  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  b = Math.max(0, Math.min(1, b));

  const rInt = Math.round(r * 255);
  const gInt = Math.round(g * 255);
  const bInt = Math.round(b * 255);

  return `#${rInt.toString(16).padStart(2,'0')}${gInt.toString(16).padStart(2,'0')}${bInt.toString(16).padStart(2,'0')}`;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 1/6) { r = c; g = x; b = 0; }
  else if (1/6 <= h && h < 2/6) { r = x; g = c; b = 0; }
  else if (2/6 <= h && h < 3/6) { r = 0; g = c; b = x; }
  else if (3/6 <= h && h < 4/6) { r = 0; g = x; b = c; }
  else if (4/6 <= h && h < 5/6) { r = x; g = 0; b = c; }
  else if (5/6 <= h && h < 1) { r = c; g = 0; b = x; }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hexToXy(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  const x = X / (X + Y + Z);
  const y = Y / (X + Y + Z);

  return { x, y };
}

async function setLightColor(lightId, hue, sat) {
  const h = hue / 65535;
  const s = sat / 254;
  const hex = hslToHex(h, s, 0.5);
  const xy = hexToXy(hex);
  await hueV2('put', `/resource/light/${lightId}`, { color: { xy } });
}

async function setLightGradient(lightId, colors) {
  const points = colors.map(hex => ({ color: { xy: hexToXy(hex) } }));
  await hueV2('put', `/resource/light/${lightId}`, { gradient: { points } });
}

async function getLightV2(lightId) {
  const response = await hueV2('get', `/resource/light/${lightId}`);
  return response.data.data[0];
}

module.exports = {
  getLights, getRooms, startPlay, stopPlay,
  setLightOn, setLightOff, setLightName, setLightBrightness,
  setLightColor, setLightGradient, getLightV2, hexToXy,
  getConfig, configPath
};
