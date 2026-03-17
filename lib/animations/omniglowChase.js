// lib/animations/omniglowChase.js — Chase animation for OmniGlow strips
const { getLightV2, setLightGradient } = require('../hue');
const log = require('../logger');

const timers = new Map();

async function startChase(lightId, speed = 5000, bgColor = '#800080', headColor = '#0000ff') {
  stopChase(lightId);

  const light = await getLightV2(lightId);
  const numPoints = light.gradient?.points?.length || 5;
  let head = 0;

  const tick = async () => {
    try {
      if (!timers.has(lightId)) return;
      const entry = timers.get(lightId);
      const colors = Array(numPoints).fill(entry.bgColor);
      colors[head] = entry.headColor;
      await setLightGradient(lightId, colors);
      head = (head + 1) % numPoints;
      if (timers.has(lightId)) {
        const timer = setTimeout(tick, entry.speed);
        timers.set(lightId, { ...entry, timer, head });
      }
    } catch (error) {
      log.error(`Strip chase tick failed for ${lightId}: ${error.message}`);
      stopChase(lightId);
    }
  };

  const timer = setTimeout(tick, speed);
  timers.set(lightId, { timer, speed, head: 0, bgColor, headColor });
}

function stopChase(lightId) {
  const existing = timers.get(lightId);
  if (existing) {
    clearTimeout(existing.timer);
    timers.delete(lightId);
  }
}

function updateChaseSpeed(lightId, newSpeed) {
  const existing = timers.get(lightId);
  if (existing) {
    stopChase(lightId);
    startChase(lightId, newSpeed, existing.bgColor, existing.headColor);
  }
}

function updateChaseColors(lightId, bgColor, headColor) {
  const existing = timers.get(lightId);
  if (existing) {
    existing.bgColor = bgColor;
    existing.headColor = headColor;
  }
}

function isStripChaseRunning(lightId) {
  return timers.has(lightId);
}

module.exports = { startChase, stopChase, updateChaseSpeed, updateChaseColors, isStripChaseRunning };
