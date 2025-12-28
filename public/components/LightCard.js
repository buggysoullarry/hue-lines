// LightCard.js — individual light card
const { useState, useEffect } = React;

function LightCard({ light }) {
  const [onOffText, setOnOffText] = useState(light.on ? 'On' : 'Off');
  const [playText, setPlayText] = useState('Play');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(light.name || `Light ${light.id}`);
  const [brightness, setBrightness] = useState(light.bri || 254);
  const [color, setColor] = useState(validateColor(light.color));
  const [stripColors, setStripColors] = useState(light.isStrip ? createGradientColors(validateColor(light.color), 5) : []);
  const pickerRef = React.useRef(null);
  const [picker, setPicker] = useState(null);
  const updatingPicker = React.useRef(false);
  const gradientTimeoutRef = React.useRef(null);
  const [chaseRunning, setChaseRunning] = useState(false);
  const chaseSpeedKey = `hue-chase-speed-${light.uuid || light.id}`;
  const [chaseSpeed, setChaseSpeed] = useState(() => {
    const saved = localStorage.getItem(chaseSpeedKey);
    return saved ? parseInt(saved) : 1000;
  });

  useEffect(() => {
    localStorage.setItem(chaseSpeedKey, chaseSpeed);
  }, [chaseSpeed, chaseSpeedKey]);

  useEffect(() => {
    setOnOffText(light.on ? 'On' : 'Off');
    setEditName(light.name || `Light ${light.id}`);
    setBrightness(light.bri || 254);
    setColor(validateColor(light.color));
    if (light.isStrip) {
      setStripColors(createGradientColors(validateColor(light.color), 5));
    }
  }, [light.on, light.name, light.bri, light.color, light.isStrip]);

  useEffect(() => {
    if (light.isStrip && pickerRef.current && !picker) {
      const newPicker = new iro.ColorPicker(pickerRef.current, {
        width: 200,
        colors: stripColors,
        layout: [ { component: iro.ui.Wheel } ]
      });
      newPicker.on('input:end', () => {
        if (updatingPicker.current) return;
        const newStripColors = newPicker.colors.map(c => c.hexString);
        setStripColors(newStripColors);
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
      setOnOffText(onOffText);
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
      setPlayText(playText);
    }
  };

  const handleDoubleClick = () => setIsEditing(true);
  const handleNameChange = (e) => setEditName(e.target.value);

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
      setEditName(light.name || `Light ${light.id}`);
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
      setBrightness(light.bri || 254);
    }
  };

  const handleColorChange = async (e) => {
    const newColor = e.target.value;
    setColor(newColor);
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
      setColor(validateColor(light.color));
    }
  };

  const handleStripGradientChange = async (colors) => {
    const validatedColors = colors.map(c => validateColor(c));
    setColor(validatedColors[0]);
    const lightId = light.uuid || light.id;
    if (gradientTimeoutRef.current) clearTimeout(gradientTimeoutRef.current);
    gradientTimeoutRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/lights/${lightId}/gradient`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors: validatedColors })
        });
        if (!resp.ok) throw new Error('Failed to set gradient');
        console.log(`Set gradient for ${light.name} to ${validatedColors.join(', ')}`);
      } catch (err) {
        console.error('Error setting gradient:', err);
        setStripColors(light.isStrip ? createGradientColors(validateColor(light.color), 5) : []);
      }
    }, 300);
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
        <label className="swatch" style={{ background: validateColor(light.color), cursor: !light.isStrip ? 'pointer' : 'default', position: 'relative', display: 'inline-block' }} title={!light.isStrip ? 'Set color' : ''}>
          {!light.isStrip && (
            <input
              type="color"
              value={color}
              onChange={handleColorChange}
              style={{ opacity: 0, width: '100%', height: '100%', position: 'absolute', left: 0, top: 0, cursor: 'pointer', zIndex: 2 }}
              tabIndex={-1}
            />
          )}
        </label>
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
              max="1000"
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
