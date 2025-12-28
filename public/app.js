// app.js — React app for Hue Lines

const { useState, useEffect } = React;

const sampleRooms = [
  {
    id: '1',
    name: 'Living Room',
    lights: [
      { id: '1', name: 'Ceiling Light', on: true, color: '#ffd166' },
      { id: '2', name: 'Lamp', on: false, color: '#06d6a0' }
    ]
  },
  {
    id: '2',
    name: 'Bedroom',
    lights: [
      { id: '3', name: 'Bedside Lamp', on: true, color: '#118ab2' }
    ]
  }
];

// Helper: Convert HSL to hex
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

// Helper: Create gradient colors
function createGradientColors(baseColor, num) {
  const [h, s, l] = hexToHsl(baseColor);
  return Array(num).fill().map((_, i) => {
    const newH = (h + i * 30) % 360; // vary hue by 30 degrees each
    return hslToHex(newH, s, l);
  });
}

async function fetchRooms() {
  try {
    const resp = await fetch('/api/rooms');
    if (!resp.ok) throw new Error('Network response was not ok');
    const data = await resp.json();
    if (Array.isArray(data) && data.length) return data;
  } catch (err) {
    console.warn('Could not fetch /api/rooms — using sample data', err);
  }
  await new Promise((r) => setTimeout(r, 120));
  return sampleRooms;
}

function LightCard({ light }) {
  const [onOffText, setOnOffText] = useState(light.on ? 'On' : 'Off');
  const [playText, setPlayText] = useState('Play');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(light.name || `Light ${light.id}`);
  const [brightness, setBrightness] = useState(light.bri || 254);
  const [color, setColor] = useState(light.color || '#ffffff');
  const [stripColors, setStripColors] = useState(light.isStrip ? createGradientColors(light.color || '#ffffff', 5) : []);
  const pickerRef = React.useRef(null);
  const [picker, setPicker] = useState(null);
  const updatingPicker = React.useRef(false);
  const gradientTimeoutRef = React.useRef(null);
  const [chaseRunning, setChaseRunning] = useState(false);
  const [chaseSpeed, setChaseSpeed] = useState(5000);

  useEffect(() => {
    setOnOffText(light.on ? 'On' : 'Off');
    setEditName(light.name || `Light ${light.id}`);
    setBrightness(light.bri || 254);
    setColor(light.color || '#ffffff');
    if (light.isStrip) {
      setStripColors(createGradientColors(light.color || '#ffffff', 5));
    }
  }, [light.on, light.name, light.bri, light.color, light.isStrip]);

  useEffect(() => {
    if (light.isStrip && pickerRef.current && !picker) {
      const newPicker = new iro.ColorPicker(pickerRef.current, {
        width: 200,
        colors: stripColors,
        layout: [
          {
            component: iro.ui.Wheel,
          },
        ],
      });
      newPicker.on('input:end', () => {
        if (updatingPicker.current) return;
        const newStripColors = newPicker.colors.map(c => c.hexString);
        setStripColors(newStripColors);
        // Set the gradient
        handleStripGradientChange(newStripColors);
      });
      setPicker(newPicker);
    }
  }, [light.isStrip, stripColors, picker]);

  useEffect(() => {
    if (picker && light.isStrip) {
      updatingPicker.current = true;
      picker.setColors(stripColors.map(c => new iro.Color(c)));
      updatingPicker.current = false;
    }
  }, [stripColors, picker]);

  const toggleOnOff = async () => {
    const newState = onOffText === 'On' ? 'Off' : 'On';
    setOnOffText(newState);
    try {
      const resp = await fetch(`/api/lights/${light.id}/${newState.toLowerCase()}`, { method: 'PUT' });
      if (!resp.ok) throw new Error(`Failed to turn ${newState.toLowerCase()}`);
      console.log(`${newState} ${light.name}`);
    } catch (err) {
      console.error(`Error turning ${newState.toLowerCase()}:`, err);
      setOnOffText(onOffText); // Revert
    }
  };

  const togglePlay = async () => {
    const newText = playText === 'Play' ? 'Stop' : 'Play';
    setPlayText(newText);
    try {
      const action = newText === 'Stop' ? 'play' : 'stop';
      const resp = await fetch(`/api/lights/${light.id}/${action}`, { method: 'PUT' });
      if (!resp.ok) throw new Error(`Failed to ${action}`);
      console.log(`${action === 'play' ? 'Started' : 'Stopped'} play for ${light.name}`);
    } catch (err) {
      console.error(`Error ${playText.toLowerCase()}ing play:`, err);
      setPlayText(playText); // Revert
    }
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleNameChange = (e) => {
    setEditName(e.target.value);
  };

  const handleNameSubmit = async () => {
    try {
      const resp = await fetch(`/api/lights/${light.id}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName })
      });
      if (!resp.ok) throw new Error('Failed to rename');
      console.log(`Renamed light ${light.id} to ${editName}`);
      setIsEditing(false);
    } catch (err) {
      console.error('Error renaming:', err);
      setEditName(light.name || `Light ${light.id}`); // Revert
      setIsEditing(false);
    }
  };

  const handleBrightnessChange = async (e) => {
    const newBrightness = parseInt(e.target.value);
    setBrightness(newBrightness);
    try {
      const resp = await fetch(`/api/lights/${light.id}/brightness`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brightness: newBrightness })
      });
      if (!resp.ok) throw new Error('Failed to set brightness');
      console.log(`Set brightness for ${light.name} to ${newBrightness}`);
    } catch (err) {
      console.error('Error setting brightness:', err);
      setBrightness(light.bri || 254); // Revert
    }
  };

  const handleColorChange = async (e) => {
    const newColor = e.target.value;
    setColor(newColor);
    // Convert hex to HSL
    const [h, s] = hexToHsl(newColor);
    const hue = Math.round(h * 65535);
    const sat = Math.round(s * 254);
    try {
      const resp = await fetch(`/api/lights/${light.id}/color`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hue, sat })
      });
      if (!resp.ok) throw new Error('Failed to set color');
      console.log(`Set color for ${light.name} to ${newColor}`);
    } catch (err) {
      console.error('Error setting color:', err);
      setColor(light.color || '#ffffff'); // Revert
    }
  };

  const handleStripGradientChange = async (colors) => {
    setColor(colors[0]); // Update main color to first
    const lightId = light.uuid || light.id; // Use uuid for v2, fallback to id
    if (gradientTimeoutRef.current) {
      clearTimeout(gradientTimeoutRef.current);
    }
    gradientTimeoutRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/lights/${lightId}/gradient`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors })
        });
        if (!resp.ok) throw new Error('Failed to set gradient');
        console.log(`Set gradient for ${light.name} to ${colors.join(', ')}`);
      } catch (err) {
        console.error('Error setting gradient:', err);
        // Revert to previous colors if error
        setStripColors(light.isStrip ? createGradientColors(light.color || '#ffffff', 5) : []);
      }
    }, 300); // 300ms delay
  };

  const handleChaseToggle = async () => {
    const lightId = light.uuid || light.id;
    if (chaseRunning) {
      try {
        const resp = await fetch(`/api/lights/${lightId}/chase/stop`, { method: 'PUT' });
        if (!resp.ok) throw new Error('Failed to stop chase');
        setChaseRunning(false);
      } catch (err) {
        console.error('Error stopping chase:', err);
      }
    } else {
      try {
        const resp = await fetch(`/api/lights/${lightId}/chase/start`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: chaseSpeed })
        });
        if (!resp.ok) throw new Error('Failed to start chase');
        setChaseRunning(true);
      } catch (err) {
        console.error('Error starting chase:', err);
      }
    }
  };

  const handleChaseSpeedChange = async (e) => {
    const newSpeed = parseInt(e.target.value);
    setChaseSpeed(newSpeed);
    if (chaseRunning) {
      const lightId = light.uuid || light.id;
      try {
        const resp = await fetch(`/api/lights/${lightId}/chase/speed`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: newSpeed })
        });
        if (!resp.ok) throw new Error('Failed to update speed');
      } catch (err) {
        console.error('Error updating chase speed:', err);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditName(light.name || `Light ${light.id}`);
      setIsEditing(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={handleNameChange}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="light-name-input"
          />
        ) : (
          <div className="light-name" onDoubleClick={handleDoubleClick}>
            {editName}
          </div>
        )}
        <div className="swatch" style={{ background: light.color || '#999' }}></div>
      </div>
      <div className="row">
        <button className="btn on-off" onClick={toggleOnOff} title={onOffText}>
          <i className={`fas ${onOffText === 'On' ? 'fa-lightbulb' : 'fa-power-off'}`}></i>
        </button>
        <div className="controls">
          <button className="btn play-stop" onClick={togglePlay} title={playText}>
            <i className={`fas ${playText === 'Play' ? 'fa-play' : 'fa-pause'}`}></i>
          </button>
        </div>
      </div>
      <div className="brightness-slider">
        <span>0%</span>
        <input
          type="range"
          min="0"
          max="254"
          value={brightness}
          onChange={handleBrightnessChange}
          title={`Brightness: ${Math.round((brightness / 254) * 100)}%`}
        />
        <span>100%</span>
      </div>
      {light.isOmniGlow && (
        <div className="animation-controls">
          <button className="btn animation" onClick={handleChaseToggle} title={chaseRunning ? 'Stop Chase' : 'Start Chase'}>
            <i className={`fas ${chaseRunning ? 'fa-stop' : 'fa-play'}`}></i> Chase
          </button>
          <div className="speed-slider">
            <span>Fast</span>
            <input
              type="range"
              min="100"
              max="10000"
              value={chaseSpeed}
              onChange={handleChaseSpeedChange}
              title={`Speed: ${chaseSpeed}ms`}
            />
            <span>Slow</span>
          </div>
        </div>
      )}
      {light.isStrip && (
        <div ref={pickerRef} className="iro-picker"></div>
      )}
    </div>
  );
}

function Room({ room }) {
  return (
    <div className="room">
      <h2>{room.name}</h2>
      <div className="lights-grid">
        {room.lights.map(light => <LightCard key={light.id} light={light} />)}
      </div>
    </div>
  );
}

function App() {
  const [rooms, setRooms] = useState([]);

  const loadRooms = async () => {
    const data = await fetchRooms();
    setRooms(data);
  };

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rooms-container" aria-live="polite">
      {rooms.length === 0 ? 'No rooms found.' : rooms.map(room => <Room key={room.id} room={room} />)}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('rooms'));
root.render(<App />);
