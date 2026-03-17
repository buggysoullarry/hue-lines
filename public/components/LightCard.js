// LightCard.js — compact single-row light control
const { useState, useEffect, useRef } = React;

function LightCard({ light }) {
  const [isOn, setIsOn] = useState(light.on);
  const [playState, setPlayState] = useState('stopped');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(light.name || `Light ${light.id}`);
  const [brightness, setBrightness] = useState(light.bri || 254);
  const [color, setColor] = useState(validateColor(light.color));
  const [expanded, setExpanded] = useState(false);

  // Strip gradient state
  const [stripColors, setStripColors] = useState(
    light.isStrip ? createGradientColors(validateColor(light.color), 5) : []
  );
  const pickerRef = useRef(null);
  const [picker, setPicker] = useState(null);
  const updatingPicker = useRef(false);
  const gradientTimeoutRef = useRef(null);

  // OmniGlow chase state
  const [chaseRunning, setChaseRunning] = useState(false);
  const chaseSpeedKey = `hue-chase-speed-${light.uuid || light.id}`;
  const [chaseSpeed, setChaseSpeed] = useState(() => {
    const saved = localStorage.getItem(chaseSpeedKey);
    return saved ? parseInt(saved) : 1000;
  });
  const chaseBgKey = `hue-chase-bg-${light.uuid || light.id}`;
  const chaseHeadKey = `hue-chase-head-${light.uuid || light.id}`;
  const [chaseBgColor, setChaseBgColor] = useState(() => localStorage.getItem(chaseBgKey) || '#800080');
  const [chaseHeadColor, setChaseHeadColor] = useState(() => localStorage.getItem(chaseHeadKey) || '#0000ff');

  const isExpandable = light.isStrip || light.isOmniGlow;

  // Track last user interaction — skip poll sync during grace period
  const lastUserAction = useRef({ on: 0, bri: 0, color: 0 });
  const GRACE_MS = 6000;

  // Sync from props (poll), respecting optimistic grace
  useEffect(() => {
    const now = Date.now();
    if (now - lastUserAction.current.on > GRACE_MS) setIsOn(light.on);
    setEditName(light.name || `Light ${light.id}`);
    if (now - lastUserAction.current.bri > GRACE_MS) setBrightness(light.bri || 254);
    if (now - lastUserAction.current.color > GRACE_MS) {
      setColor(validateColor(light.color));
      if (light.isStrip) {
        setStripColors(createGradientColors(validateColor(light.color), 5));
      }
    }
  }, [light.on, light.name, light.bri, light.color, light.isStrip]);

  // Persist chase settings
  useEffect(() => { localStorage.setItem(chaseSpeedKey, chaseSpeed); }, [chaseSpeed]);
  useEffect(() => { localStorage.setItem(chaseBgKey, chaseBgColor); }, [chaseBgColor]);
  useEffect(() => { localStorage.setItem(chaseHeadKey, chaseHeadColor); }, [chaseHeadColor]);

  // Init iro picker — container stays in DOM (hidden when collapsed)
  useEffect(() => {
    if (light.isStrip && pickerRef.current && !picker) {
      const newPicker = new iro.ColorPicker(pickerRef.current, {
        width: 180,
        colors: stripColors,
        layout: [{ component: iro.ui.Wheel }]
      });
      newPicker.on('input:end', () => {
        if (updatingPicker.current) return;
        const newColors = newPicker.colors.map(c => c.hexString);
        lastUserAction.current.color = Date.now();
        setStripColors(newColors);
        setColor(newColors[0]);
        handleStripGradientChange(newColors);
      });
      setPicker(newPicker);
    }
  }, [light.isStrip, picker]);

  // Sync picker colors
  useEffect(() => {
    if (picker && light.isStrip) {
      updatingPicker.current = true;
      picker.setColors(stripColors.map(c => new iro.Color(c)));
      updatingPicker.current = false;
    }
  }, [stripColors, picker]);

  // ---- Handlers ----

  const toggleOnOff = async () => {
    const newState = !isOn;
    lastUserAction.current.on = Date.now();
    setIsOn(newState);
    try {
      const resp = await fetch(`/api/lights/${light.id}/${newState ? 'on' : 'off'}`, { method: 'PUT' });
      if (!resp.ok) throw new Error('Failed');
    } catch (err) {
      console.error('Toggle error:', err);
      setIsOn(!newState);
    }
  };

  // Generic play/stop — only for non-OmniGlow lights
  const togglePlay = async () => {
    const wasPlaying = playState === 'playing';
    setPlayState(wasPlaying ? 'stopped' : 'playing');
    try {
      const action = wasPlaying ? 'stop' : 'play';
      const resp = await fetch(`/api/lights/${light.id}/${action}`, { method: 'PUT' });
      if (!resp.ok) throw new Error('Failed');
    } catch (err) {
      console.error('Play error:', err);
      setPlayState(wasPlaying ? 'playing' : 'stopped');
    }
  };

  // Chase toggle — for OmniGlow lights, used by the row play button
  const handleChaseToggle = async () => {
    const lightId = light.uuid || light.id;
    if (chaseRunning) {
      try {
        await fetch(`/api/lights/${lightId}/chase/stop`, { method: 'PUT' });
        setChaseRunning(false);
      } catch (err) { console.error('Chase stop error:', err); }
    } else {
      try {
        const resp = await fetch(`/api/lights/${lightId}/chase/start`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: chaseSpeed, bgColor: chaseBgColor, headColor: chaseHeadColor })
        });
        if (!resp.ok) throw new Error('Failed');
        setChaseRunning(true);
      } catch (err) { console.error('Chase start error:', err); }
    }
  };

  const handleDoubleClick = () => setIsEditing(true);

  const handleNameSubmit = async () => {
    setIsEditing(false);
    if (editName === (light.name || `Light ${light.id}`)) return;
    try {
      const resp = await fetch(`/api/lights/${light.id}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName })
      });
      if (!resp.ok) throw new Error('Failed');
    } catch (err) {
      console.error('Rename error:', err);
      setEditName(light.name || `Light ${light.id}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleNameSubmit();
    else if (e.key === 'Escape') {
      setEditName(light.name || `Light ${light.id}`);
      setIsEditing(false);
    }
  };

  const handleBrightnessInput = (e) => {
    lastUserAction.current.bri = Date.now();
    setBrightness(parseInt(e.target.value));
  };

  const handleBrightnessRelease = async () => {
    try {
      const resp = await fetch(`/api/lights/${light.id}/brightness`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brightness })
      });
      if (!resp.ok) throw new Error('Failed');
    } catch (err) {
      console.error('Brightness error:', err);
      setBrightness(light.bri || 254);
    }
  };

  const handleColorChange = async (e) => {
    const newColor = e.target.value;
    lastUserAction.current.color = Date.now();
    setColor(newColor);
    const [h, s] = hexToHsl(newColor);
    try {
      const resp = await fetch(`/api/lights/${light.id}/color`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hue: Math.round(h * 65535), sat: Math.round(s * 254) })
      });
      if (!resp.ok) throw new Error('Failed');
    } catch (err) {
      console.error('Color error:', err);
      setColor(validateColor(light.color));
    }
  };

  const handleStripGradientChange = async (colors) => {
    const validated = colors.map(c => validateColor(c));
    lastUserAction.current.color = Date.now();
    setColor(validated[0]);
    const lightId = light.uuid || light.id;
    if (gradientTimeoutRef.current) clearTimeout(gradientTimeoutRef.current);
    gradientTimeoutRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/lights/${lightId}/gradient`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors: validated })
        });
        if (!resp.ok) throw new Error('Failed');
      } catch (err) {
        console.error('Gradient error:', err);
      }
    }, 300);
  };

  const handleChaseSpeedChange = async (e) => {
    const newSpeed = parseInt(e.target.value);
    setChaseSpeed(newSpeed);
    if (chaseRunning) {
      const lightId = light.uuid || light.id;
      try {
        await fetch(`/api/lights/${lightId}/chase/speed`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed: newSpeed })
        });
      } catch (err) { console.error('Speed error:', err); }
    }
  };

  // Clicking strip swatch opens the expanded section
  const handleSwatchClick = () => {
    if (light.isStrip) {
      setExpanded(!expanded);
    }
  };

  // ---- Render ----
  const briPct = Math.round((brightness / 254) * 100);
  const hiddenStyle = { height: 0, overflow: 'hidden', padding: 0, borderTop: 'none', opacity: 0 };

  return (
    <div className="light-row">
      <div className={`light-row-main${isOn ? '' : ' off'}`}>
        {/* Color swatch */}
        <label
          className="light-swatch"
          style={{
            background: color,
            boxShadow: isOn ? `0 0 10px ${color}50` : 'none',
            cursor: light.isStrip ? 'pointer' : 'pointer'
          }}
          title={light.isStrip ? 'Show color picker' : 'Change color'}
          onClick={light.isStrip ? handleSwatchClick : undefined}
        >
          {!light.isStrip && (
            <input
              type="color"
              value={color}
              onChange={handleColorChange}
              tabIndex={-1}
            />
          )}
        </label>

        {/* Name */}
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="light-name-input"
          />
        ) : (
          <span className="light-name" onDoubleClick={handleDoubleClick} title="Double-click to rename">
            {editName}
          </span>
        )}

        {/* Brightness */}
        <div className="light-brightness">
          <input
            type="range"
            min="0"
            max="254"
            value={brightness}
            onInput={handleBrightnessInput}
            onMouseUp={handleBrightnessRelease}
            onTouchEnd={handleBrightnessRelease}
            title={`Brightness: ${briPct}%`}
          />
          <span className="bri-pct">{briPct}%</span>
        </div>

        {/* Play button — for OmniGlow it controls chase, for others it's generic play */}
        {light.isOmniGlow ? (
          <button
            className={`row-btn${chaseRunning ? ' playing' : ''}`}
            onClick={handleChaseToggle}
            title={chaseRunning ? 'Stop chase' : 'Start chase'}
          >
            <i className={`fas ${chaseRunning ? 'fa-stop' : 'fa-bolt'}`}></i>
          </button>
        ) : (
          <button
            className={`row-btn${playState === 'playing' ? ' playing' : ''}`}
            onClick={togglePlay}
            title={playState === 'playing' ? 'Stop' : 'Play'}
          >
            <i className={`fas ${playState === 'playing' ? 'fa-pause' : 'fa-play'}`}></i>
          </button>
        )}

        {/* On/Off toggle */}
        <button
          className={`light-toggle${isOn ? ' on' : ''}`}
          onClick={toggleOnOff}
          title={isOn ? 'Turn off' : 'Turn on'}
          aria-label={isOn ? 'Turn off' : 'Turn on'}
        />

        {/* Expand chevron for strip/OmniGlow */}
        {isExpandable && (
          <button
            className={`row-btn${expanded ? ' active' : ''}`}
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'More controls'}
          >
            <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
          </button>
        )}
      </div>

      {/* Expanded section — always in DOM for strips (iro picker), hidden when collapsed */}
      {isExpandable && (
        <div className="light-expanded" style={expanded ? undefined : hiddenStyle}>
          {/* Iro color wheel for strips */}
          {light.isStrip && (
            <div ref={pickerRef} className="iro-picker"></div>
          )}

          {/* Chase settings for OmniGlow — speed + BG/Head colors */}
          {light.isOmniGlow && (
            <div className="chase-controls">
              <div className="chase-speed">
                <span>Slow</span>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  value={1100 - chaseSpeed}
                  onChange={e => {
                    const inverted = 1100 - parseInt(e.target.value);
                    handleChaseSpeedChange({ target: { value: inverted } });
                  }}
                  title={`Speed: ${chaseSpeed}ms`}
                />
                <span>Fast</span>
              </div>
              <div className="chase-colors">
                <label className="chase-color-swatch">
                  <span>BG</span>
                  <input
                    type="color"
                    value={chaseBgColor}
                    onChange={e => setChaseBgColor(e.target.value)}
                  />
                </label>
                <label className="chase-color-swatch">
                  <span>Head</span>
                  <input
                    type="color"
                    value={chaseHeadColor}
                    onChange={e => setChaseHeadColor(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
