// ChaseGroupCard.js — expandable chase group with play/stop, colors, speed, playlist
const { useState, useEffect } = React;

function ChaseGroupCard({ group, playlists, buttonDevices, onDelete, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(group.running || false);
  const [speed, setSpeed] = useState(group.speed || 1000);
  const [bgColor, setBgColor] = useState(group.bgColor || '#800080');
  const [headColor, setHeadColor] = useState(group.headColor || '#0000ff');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editName, setEditName] = useState(group.name);

  useEffect(() => {
    setRunning(group.running || false);
    setSpeed(group.speed || 1000);
    setBgColor(group.bgColor || '#800080');
    setHeadColor(group.headColor || '#0000ff');
    setEditName(group.name);
  }, [group]);

  const togglePlay = async () => {
    setLoading(true);
    try {
      if (running) {
        await fetch(`/api/chase-groups/${group.id}/stop`, { method: 'PUT' });
        setRunning(false);
      } else {
        await fetch(`/api/chase-groups/${group.id}/play`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speed, bgColor, headColor })
        });
        setRunning(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSpeedChange = async (e) => {
    const inverted = 3200 - parseInt(e.target.value);
    setSpeed(inverted);
    if (running) {
      await fetch(`/api/chase-groups/${group.id}/speed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: inverted })
      });
    }
    onUpdate(group.id, { speed: inverted });
  };

  const handleColorChange = async (type, value) => {
    const updates = {};
    if (type === 'bg') { setBgColor(value); updates.bgColor = value; }
    else { setHeadColor(value); updates.headColor = value; }

    if (running) {
      await fetch(`/api/chase-groups/${group.id}/colors`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bgColor: type === 'bg' ? value : bgColor, headColor: type === 'head' ? value : headColor })
      });
    }
    onUpdate(group.id, updates);
  };

  const handlePlaylistChange = (e) => {
    const val = e.target.value || null;
    onUpdate(group.id, { playlistId: val });
  };

  const handleButtonChange = (e) => {
    const val = e.target.value || null;
    onUpdate(group.id, { buttonId: val });
  };

  const saveName = () => {
    setEditing(false);
    if (editName !== group.name) onUpdate(group.id, { name: editName });
  };

  const memberLabel = (m) => {
    if (m.type === 'sequence') return `${m.name || 'Sequence'} (${m.lightCount || '?'} lights)`;
    return m.name || 'Light Strip';
  };

  const linkedPlaylist = (playlists || []).find(p => p.id === group.playlistId);

  // Build flat list of all buttons across devices for the dropdown
  const allButtons = [];
  (buttonDevices || []).forEach(dev => {
    (dev.buttons || []).forEach(btn => {
      allButtons.push({
        id: btn.id,
        label: `${dev.name} — Button ${btn.controlId}`,
      });
    });
  });

  return (
    <div className={`cg-card${running ? ' cg-running' : ''}`}>
      {/* Collapsed row — always visible */}
      <div className="cg-row" onClick={() => setExpanded(!expanded)}>
        <button
          className={`cg-play-btn${running ? ' running' : ''}`}
          onClick={e => { e.stopPropagation(); togglePlay(); }}
          disabled={loading}
          title={running ? 'Stop' : 'Play'}
        >
          <i className={`fas ${loading ? 'fa-spinner fa-spin' : running ? 'fa-stop' : 'fa-play'}`}></i>
        </button>

        {editing ? (
          <input
            type="text"
            className="cg-name-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') { setEditName(group.name); setEditing(false); }
            }}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="cg-name" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }} title="Double-click to rename">
            {group.name}
          </span>
        )}

        <span className="cg-member-count">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</span>

        {/* Playlist indicator */}
        {linkedPlaylist && (
          <span className="cg-playlist-badge" title={`Playlist: ${linkedPlaylist.name}`}>
            <i className="fas fa-music"></i>
          </span>
        )}

        {/* Inline color swatches */}
        <div className="cg-color-preview" onClick={e => e.stopPropagation()}>
          <span className="cg-swatch-mini" style={{ background: bgColor }} title="Background color"></span>
          <span className="cg-swatch-mini" style={{ background: headColor }} title="Chase color"></span>
        </div>

        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} cg-chevron`}></i>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="cg-details">
          {/* Members list */}
          <div className="cg-members">
            <span className="cg-section-label">Members</span>
            {group.members.map((m, i) => (
              <div key={m.id} className="cg-member-row">
                <i className={`fas ${m.type === 'sequence' ? 'fa-link' : 'fa-grip-lines'}`}></i>
                <span>{memberLabel(m)}</span>
              </div>
            ))}
          </div>

          {/* Playlist picker */}
          <div className="cg-control-row">
            <span className="cg-section-label">
              <i className="fas fa-music" style={{ marginRight: 4 }}></i> Playlist
            </span>
            <select
              className="cg-playlist-select"
              value={group.playlistId || ''}
              onChange={handlePlaylistChange}
              onClick={e => e.stopPropagation()}
            >
              <option value="">None (lights only)</option>
              {(playlists || []).map(pl => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.trackIds.length} tracks)
                </option>
              ))}
            </select>
          </div>

          {/* Tap button picker */}
          <div className="cg-control-row">
            <span className="cg-section-label">
              <i className="fas fa-hand-pointer" style={{ marginRight: 4 }}></i> Tap Button
            </span>
            <select
              className="cg-playlist-select"
              value={group.buttonId || ''}
              onChange={handleButtonChange}
              onClick={e => e.stopPropagation()}
            >
              <option value="">None</option>
              {allButtons.map(btn => (
                <option key={btn.id} value={btn.id}>{btn.label}</option>
              ))}
            </select>
          </div>

          {/* Speed slider */}
          <div className="cg-control-row">
            <span className="cg-section-label">Speed</span>
            <div className="cg-speed-slider">
              <span>Slow</span>
              <input
                type="range"
                min="200"
                max="3000"
                value={3200 - speed}
                onChange={handleSpeedChange}
                title={`Speed: ${speed}ms`}
              />
              <span>Fast</span>
              <span className="cg-speed-val">{speed}ms</span>
            </div>
          </div>

          {/* Color pickers */}
          <div className="cg-control-row">
            <span className="cg-section-label">Colors</span>
            <div className="cg-colors">
              <label className="cg-color-pick">
                <span>Background</span>
                <input type="color" value={bgColor} onChange={e => handleColorChange('bg', e.target.value)} />
              </label>
              <label className="cg-color-pick">
                <span>Chase</span>
                <input type="color" value={headColor} onChange={e => handleColorChange('head', e.target.value)} />
              </label>
            </div>
          </div>

          {/* Delete */}
          <div className="cg-footer">
            <button className="cg-delete-btn" onClick={() => onDelete(group.id)}>
              <i className="fas fa-trash-alt"></i> Delete Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
