// lib/animations/omniglowChase.js — Chase animation for OmniGlow strips
const { getLightV2, setLightGradient, hexToXy } = require('../hue');

const timers = new Map(); // lightId -> { timer, interval, head }

const purpleHex = '#800080';
const blueHex = '#0000ff';
const purpleXy = hexToXy(purpleHex);
const blueXy = hexToXy(blueHex);

async function startChase(lightId, speed = 5000) {
  // Stop any existing
  stopChase(lightId);

  try {
    const light = await getLightV2(lightId);
    const numPoints = light.gradient?.points?.length || 5; // fallback to 5
    let head = 0;

    const tick = async () => {
      try {
        // If stopped, do not continue or send requests
        if (!timers.has(lightId)) return;
        const colors = Array(numPoints).fill(purpleHex);
        colors[head] = blueHex;
        await setLightGradient(lightId, colors);
        //console.log(`Chase tick for ${lightId}: head at ${head}`);
        head = (head + 1) % numPoints;
        // Only schedule next tick if not stopped
        if (timers.has(lightId)) {
          const timer = setTimeout(tick, speed);
          timers.set(lightId, { timer, speed, head });
        }
      } catch (error) {
        console.error(`Chase tick failed for ${lightId}:`, error);
        stopChase(lightId);
      }
    };

    // Start first tick
    const timer = setTimeout(tick, speed);
    timers.set(lightId, { timer, speed, head: 0 });
    console.log(`Started chase for ${lightId} with speed ${speed}ms`);
  } catch (error) {
    console.error(`Failed to start chase for ${lightId}:`, error);
    throw error;
  }
}

function stopChase(lightId) {
  const existing = timers.get(lightId);
  if (existing) {
    clearTimeout(existing.timer);
    timers.delete(lightId);
    console.log(`Stopped chase for ${lightId}`);
  }
}

function updateChaseSpeed(lightId, newSpeed) {
  const existing = timers.get(lightId);
  if (existing) {
    stopChase(lightId);
    startChase(lightId, newSpeed);
  }
}

module.exports = { startChase, stopChase, updateChaseSpeed };