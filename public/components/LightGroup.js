// LightGroup.js — compact group with chase controls
const { useState, useEffect } = React;

function LightGroup({ group, lights, onDelete, onUpdate }) {
  const [chaseRunning, setChaseRunning] = useState(group.chaseRunning || false);
  const [speed, setSpeed] = useState(group.speed || 1000);
  const [bgColor, setBgColor] = useState(group.bgColor || '#800080');
  const [headColor, setHeadColor] = useState(group.headColor || '#0000ff');
  const [orderedIds, setOrderedIds] = useState(group.lightIds);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

  useEffect(() => {
    setOrderedIds(group.lightIds);
    setChaseRunning(group.chaseRunning || false);
  }, [group]);

  const orderedLights = orderedIds.map(id => lights.find(l => l.id === id)).filter(Boolean);

  const toggleChase = async () => {
    if (chaseRunning) {
      await fetch(`/api/groups/${group.id}/chase/stop`, { method: 'PUT' });
      setChaseRunning(false);
    } else {
      await fetch(`/api/groups/${group.id}/chase/start`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed, bgColor, headColor })
      });
      setChaseRunning(true);
    }
  };

  const handleSpeedChange = async (e) => {
    const newSpeed = parseInt(e.target.value);
    setSpeed(newSpeed);
    if (chaseRunning) {
      await fetch(`/api/groups/${group.id}/chase/speed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: newSpeed })
      });
    }
    onUpdate(group.id, { speed: newSpeed });
  };

  const handleColorChange = (type, value) => {
    if (type === 'bg') setBgColor(value);
    else setHeadColor(value);
    onUpdate(group.id, { [type === 'bg' ? 'bgColor' : 'headColor']: value });
  };

  const moveLight = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= orderedIds.length) return;
    const newOrder = [...orderedIds];
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setOrderedIds(newOrder);
    onUpdate(group.id, { lightIds: newOrder });
  };

  const saveName = () => {
    setEditing(false);
    if (editName !== group.name) onUpdate(group.id, { name: editName });
  };

  return (
    <div className={`light-group${chaseRunning ? ' group-chasing' : ''}`}>
      {/* Header */}
      <div className="group-header">
        <div className="group-header-left">
          <i className="fas fa-layer-group group-icon"></i>
          {editing ? (
            <input
              type="text"
              className="group-name-input"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setEditName(group.name); setEditing(false); }
              }}
              autoFocus
            />
          ) : (
            <span className="group-name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
              {group.name}
            </span>
          )}
          <span className="group-count">{orderedLights.length} lights</span>
        </div>
        <div className="group-header-right">
          <button className="group-delete-btn" onClick={() => onDelete(group.id)} title="Delete group">
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      {/* Light order */}
      <div className="group-lights-list">
        {orderedLights.map((light, idx) => (
          <div key={light.id} className="group-light-row">
            <span className="pill-num">{idx + 1}</span>
            <span className="pill-swatch" style={{ background: validateColor(light.color) }}></span>
            <span className="pill-name">{light.name}</span>
            <div className="reorder-arrows">
              <button className="arrow-btn" onClick={() => moveLight(idx, -1)} disabled={idx === 0} title="Move up">
                <i className="fas fa-chevron-up"></i>
              </button>
              <button className="arrow-btn" onClick={() => moveLight(idx, 1)} disabled={idx === orderedLights.length - 1} title="Move down">
                <i className="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Chase controls */}
      <div className="group-chase-bar">
        <button className={`group-chase-btn${chaseRunning ? ' chasing' : ''}`} onClick={toggleChase}>
          <i className={`fas ${chaseRunning ? 'fa-stop' : 'fa-play'}`}></i>
          {chaseRunning ? ' Stop' : ' Chase'}
        </button>

        <div className="group-speed-slider">
          <span>Slow</span>
          <input
            type="range"
            min="200"
            max="3000"
            value={3200 - speed}
            onChange={e => {
              const inverted = 3200 - parseInt(e.target.value);
              handleSpeedChange({ target: { value: inverted } });
            }}
            title={`Speed: ${speed}ms`}
          />
          <span>Fast</span>
          <span className="group-speed-val">{speed}ms</span>
        </div>

        <div className="group-colors">
          <label className="group-color-swatch">
            <span>BG</span>
            <input type="color" value={bgColor} onChange={e => handleColorChange('bg', e.target.value)} />
          </label>
          <label className="group-color-swatch">
            <span>Head</span>
            <input type="color" value={headColor} onChange={e => handleColorChange('head', e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
}
