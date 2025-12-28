// lib/hue.js — Placeholder functions for Hue API integration
const axios = require('axios');
const https = require('https');
const config = require('../config.json');

// TODO: Update config.json with your actual Hue bridge IP and username
const HUE_BRIDGE_IP = config.hue.bridgeIp;
const HUE_USERNAME = config.hue.username;
const HUE_APPKEY = config.hue.appkey;

const baseUrl = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}`;
const baseUrlV2 = `https://${HUE_BRIDGE_IP}/clip/v2`;

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
    let lightIdMap = {};
    try {
      const lightsV2Response = await axios.get(`${baseUrlV2}/resource/light`, {
        headers: { 'hue-application-key': HUE_APPKEY },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 5000
      });
      lightsV2Response.data.data.forEach(light => {
        const v1Id = light.id_v1.split('/').pop();
        lightIdMap[v1Id] = light.id;
      });
    } catch (v2Error) {
      console.warn('Hue API v2 not available, gradients may not work:', v2Error.message);
    }
 
    
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
            uuid: lightIdMap[lightId] || null,
            name: light.name,
            on: light.state.on,
            bri: light.state.bri,
            modelid: light.modelid,
            productname: light.productname,
            manufacturername: light.manufacturername,
            isStrip: light.productname && light.productname.toLowerCase().includes('omniglow'),
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

// Placeholder: Rename a light
async function setLightName(lightId, newName) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}`, {
      name: newName
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error renaming light ${lightId}:`, error);
    throw error;
  }
}

// Placeholder: Set light brightness
async function setLightBrightness(lightId, brightness) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      on: true,
      bri: brightness
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error setting brightness for light ${lightId}:`, error);
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

// Helper: Convert hex to HSL
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

// Helper: Convert hex to xy (CIE 1931)
function hexToXy(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  // Apply gamma correction (reverse sRGB)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Convert to XYZ
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // Convert to xy
  const x = X / (X + Y + Z);
  const y = Y / (X + Y + Z);

  return { x, y };
}

// Placeholder: Set light color
async function setLightColor(lightId, hue, sat) {
  try {
    await axios.put(`${baseUrl}/lights/${lightId}/state`, {
      hue: hue,
      sat: sat
    }, { timeout: 5000 });
  } catch (error) {
    console.error(`Error setting color for light ${lightId}:`, error);
    throw error;
  }
}

// Placeholder: Set light gradient for strips
async function setLightGradient(lightId, colors) {
  try {
    const points = colors.map(hex => ({ color: { xy: hexToXy(hex) } }));
    await axios.put(`${baseUrlV2}/resource/light/${lightId}`, {
      gradient: {
        points: points
      }
    }, {
      headers: { 'hue-application-key': HUE_APPKEY },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 5000
    });
  } catch (error) {
    console.error(`Error setting gradient for light ${lightId}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('No response:', error);
    }
    throw error;
  }
}

module.exports = { getLights, getRooms, startPlay, stopPlay, setLightOn, setLightOff, setLightName, setLightBrightness, setLightColor, setLightGradient };