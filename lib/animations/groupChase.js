// lib/animations/groupChase.js — Chase animation across grouped individual bulbs
const { setLightColor } = require('../hue');
const log = require('../logger');

const timers = new Map();

function hexToHueSat(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  if (max === min) {
    h = 0; s = 0;
  } else {
    const d = max - min;
    s = d / max;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { hue: Math.round(h * 65535), sat: Math.round(s * 254) };
}

async function startGroupChase(groupId, lightIds, speed = 1000, bgColor = '#800080', headColor = '#0000ff') {
  stopGroupChase(groupId);

  if (!lightIds || lightIds.length < 2) {
    throw new Error('Group must have at least 2 lights');
  }

  const bg = hexToHueSat(bgColor);
  const head = hexToHueSat(headColor);
  let headPos = 0;

  const tick = async () => {
    try {
      if (!timers.has(groupId)) return;

      const promises = lightIds.map((lightId, idx) => {
        const color = idx === headPos ? head : bg;
        return setLightColor(lightId, color.hue, color.sat).catch(() => {});
      });

      await Promise.all(promises);
      headPos = (headPos + 1) % lightIds.length;

      if (timers.has(groupId)) {
        const entry = timers.get(groupId);
        const timer = setTimeout(tick, entry.speed);
        timers.set(groupId, { ...entry, timer, head: headPos });
      }
    } catch (error) {
      log.error(`Group chase tick failed for ${groupId}: ${error.message}`);
      stopGroupChase(groupId);
    }
  };

  const timer = setTimeout(tick, speed);
  timers.set(groupId, { timer, speed, head: 0, lightIds, bgColor: bg, headColor: head });
}

function stopGroupChase(groupId) {
  const existing = timers.get(groupId);
  if (existing) {
    clearTimeout(existing.timer);
    timers.delete(groupId);
  }
}

function updateGroupChaseSpeed(groupId, newSpeed) {
  const existing = timers.get(groupId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.speed = newSpeed;
    startGroupChase(groupId, existing.lightIds, newSpeed);
  }
}

function isGroupChaseRunning(groupId) {
  return timers.has(groupId);
}

module.exports = { startGroupChase, stopGroupChase, updateGroupChaseSpeed, isGroupChaseRunning };
