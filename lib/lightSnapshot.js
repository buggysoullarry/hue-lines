// lib/lightSnapshot.js — Snapshot and restore light states for chase groups
const axios = require('axios');
const https = require('https');
const { getLightV2, getConfig } = require('./hue');
const log = require('./logger');

const stateSnapshots = new Map();

async function snapshotLightStates(chaseGroupId, lightIds) {
  const states = {};
  for (const lightId of lightIds) {
    try {
      const light = await getLightV2(lightId);
      states[lightId] = {
        on: light.on?.on,
        brightness: light.dimming?.brightness,
        color: light.color?.xy ? { x: light.color.xy.x, y: light.color.xy.y } : null
      };
    } catch (err) {
      log.warn(`Could not snapshot light ${lightId}: ${err.message}`);
    }
  }
  stateSnapshots.set(chaseGroupId, { lights: states });
}

async function restoreLightStates(chaseGroupId) {
  const snapshot = stateSnapshots.get(chaseGroupId);
  if (!snapshot) return;

  const config = getConfig();
  const ip = config.hue.bridgeIp;
  const key = config.hue.username;

  for (const [lightId, state] of Object.entries(snapshot.lights)) {
    try {
      const body = {};
      if (state.on !== undefined) body.on = { on: state.on };
      if (state.brightness !== undefined) body.dimming = { brightness: state.brightness };
      if (state.color) body.color = { xy: state.color };

      await axios.put(`https://${ip}/clip/v2/resource/light/${lightId}`, body, {
        headers: { 'hue-application-key': key },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 5000
      });
    } catch (err) {
      log.warn(`Could not restore light ${lightId}: ${err.message}`);
    }
  }

  stateSnapshots.delete(chaseGroupId);
}

module.exports = { snapshotLightStates, restoreLightStates };
