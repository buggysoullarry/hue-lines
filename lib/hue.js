// lib/hue.js — Placeholder functions for Hue API integration
const axios = require('axios');
const config = require('../config.json');

// TODO: Update config.json with your actual Hue bridge IP and username
const HUE_BRIDGE_IP = config.hue.bridgeIp;
const HUE_USERNAME = config.hue.username;

const baseUrl = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}`;

// Placeholder: Get all lights from Hue bridge
async function getLights() {
  try {
    const response = await axios.get(`${baseUrl}/lights`, { timeout: 5000 });
    // Transform Hue API response to our format
    const lights = Object.entries(response.data).map(([id, light]) => ({
      id,
      name: light.name,
      on: light.state.on,
      color: hslToHex(light.state.hue / 65535, light.state.sat / 254, light.state.bri / 254)
    }));
    return lights;
  } catch (error) {
    console.error('Error fetching lights from Hue:', error);
    throw error;
  }
}

// Placeholder: Get all rooms from Hue bridge
async function getRooms() {
  try {
    const groupsResponse = await axios.get(`${baseUrl}/groups`, { timeout: 5000 });
    const lightsResponse = await axios.get(`${baseUrl}/lights`, { timeout: 5000 });
    const lights = lightsResponse.data;
    // Filter groups to only rooms
    const rooms = Object.entries(groupsResponse.data)
      .filter(([id, group]) => group.type === 'Room')
      .map(([id, room]) => ({
        id,
        name: room.name,
        lights: room.lights.map(lightId => {
          const light = lights[lightId];
          return {
            id: lightId,
            name: light.name,
            on: light.state.on,
            color: hslToHex(light.state.hue / 65535, light.state.sat / 254, light.state.bri / 254)
          };
        })
      }));
    return rooms;
  } catch (error) {
    console.error('Error fetching rooms from Hue:', error);
    throw error;
  }
}

// Placeholder: Start a play/effect on a light
async function startPlay(lightId) {
  // TODO: Implement Hue effect or scene activation
  try {
    // Example: Turn on and set to a color loop or something
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      on: true,
      effect: 'colorloop' // Or whatever effect you want
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error starting play for light ${lightId}:`, error);
    throw error;
  }
}

// Placeholder: Stop the play/effect on a light
async function stopPlay(lightId) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      on: true,
      effect: 'none' // Stop effect
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error stopping play for light ${lightId}:`, error);
    throw error;
  }
}

// Placeholder: Turn on a light
async function setLightOn(lightId) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      on: true
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error turning on light ${lightId}:`, error);
    throw error;
  }
}

// Placeholder: Turn off a light
async function setLightOff(lightId) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      on: false
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error turning off light ${lightId}:`, error);
    throw error;
  }
}

// Helper: Convert HSL to hex (rough approximation)
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

module.exports = { getLights, getRooms, startPlay, stopPlay, setLightOn, setLightOff };