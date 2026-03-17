// helpers.js — shared utilities

function validateColor(color) {
  if (!color || typeof color !== 'string') return '#ffffff';
  if (!color.match(/^#[0-9A-Fa-f]{6}$/)) return '#ffffff';
  if (color.toLowerCase().includes('nan')) return '#ffffff';
  return color;
}

// Helper: Convert HSL to hex
function hslToHex(h, s, l) {
  // Validate inputs
  h = isNaN(h) ? 0 : Math.max(0, Math.min(1, h));
  s = isNaN(s) ? 0 : Math.max(0, Math.min(1, s));
  l = isNaN(l) ? 0.5 : Math.max(0, Math.min(1, l));
  
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
  // Validate hex format
  if (!hex || typeof hex !== 'string' || !hex.match(/^#[0-9A-Fa-f]{6}$/)) {
    return [0, 0, 0.5]; // default to gray
  }
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

// Helper: Create gradient colors
function createGradientColors(baseColor, num) {
  // Validate baseColor
  if (!baseColor || typeof baseColor !== 'string' || !baseColor.match(/^#[0-9A-Fa-f]{6}$/)) {
    baseColor = '#ffffff';
  }
  const [h, s, l] = hexToHsl(baseColor);
  return Array(num).fill().map((_, i) => {
    // h is 0-1, so add fraction of rotation (30/360 = 0.0833 per step)
    const newH = (h + (i * 30 / 360)) % 1;
    return hslToHex(newH, s, l);
  });
}

async function fetchRooms() {
  try {
    const resp = await fetch('/api/rooms');
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const msg = errBody.message || `HTTP ${resp.status}`;
      return { rooms: [], error: { message: msg, status: resp.status } };
    }
    const data = await resp.json();
    if (Array.isArray(data) && data.length) return { rooms: data, error: null };
    return { rooms: [], error: null };
  } catch (err) {
    return { rooms: [], error: { message: err.message, status: 0 } };
  }
}
