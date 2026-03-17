// Room.js — collapsible room with drag handle, groups, and group creation
const { useState } = React;

function Room({ room, dragHandleProps, groups, onGroupCreate, onGroupDelete, onGroupUpdate }) {
  const collapseKey = `hue-room-collapsed-${room.id}`;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(collapseKey) === 'true');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedLights, setSelectedLights] = useState([]);
  const [groupName, setGroupName] = useState('');

  const roomGroups = (groups || []).filter(g => g.roomId === room.id);

  // Room-level on/off: check if any light is on
  const anyLightOn = room.lights.some(l => l.on);
  const [roomOn, setRoomOn] = useState(anyLightOn);

  // Sync from props
  React.useEffect(() => { setRoomOn(anyLightOn); }, [anyLightOn]);

  const toggleRoom = async (e) => {
    e.stopPropagation();
    const turnOn = !roomOn;
    setRoomOn(turnOn); // optimistic
    const action = turnOn ? 'on' : 'off';
    try {
      await Promise.all(
        room.lights.map(light =>
          fetch(`/api/lights/${light.id}/${action}`, { method: 'PUT' })
        )
      );
    } catch (err) {
      console.error(`Error turning room ${action}:`, err);
      setRoomOn(!turnOn);
    }
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(collapseKey, next);
  };

  const toggleSelect = (lightId) => {
    setSelectedLights(prev =>
      prev.includes(lightId) ? prev.filter(id => id !== lightId) : [...prev, lightId]
    );
  };

  const createGroup = () => {
    if (selectedLights.length < 2) return;
    const name = groupName.trim() || `Group ${roomGroups.length + 1}`;
    onGroupCreate({ name, roomId: room.id, lightIds: selectedLights });
    setSelectMode(false);
    setSelectedLights([]);
    setGroupName('');
  };

  const cancelSelect = () => {
    setSelectMode(false);
    setSelectedLights([]);
    setGroupName('');
  };

  return (
    <div className={`room${collapsed ? ' collapsed' : ''}`}>
      {/* Room header */}
      <div className="room-header" onClick={toggleCollapse}>
        <span
          className="drag-handle"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); dragHandleProps.onMouseDown(e); }}
          onMouseUp={dragHandleProps.onMouseUp}
          onTouchStart={e => { e.stopPropagation(); dragHandleProps.onTouchStart(e); }}
          onTouchEnd={dragHandleProps.onTouchEnd}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          tabIndex={0}
        >
          <i className="fas fa-grip-vertical" aria-hidden="true"></i>
        </span>
        <i className="fas fa-chevron-down room-chevron" aria-hidden="true"></i>
        <h2 className="room-name">{room.name}</h2>
        <span className="room-count">{room.lights.length} light{room.lights.length !== 1 ? 's' : ''}</span>
        <div className="room-actions" onClick={e => e.stopPropagation()}>
          {!selectMode && !collapsed && (
            <button className="group-create-btn" onClick={() => setSelectMode(true)} title="Create light group">
              <i className="fas fa-object-group"></i> Group
            </button>
          )}
          <button
            className={`room-toggle${roomOn ? ' on' : ''}`}
            onClick={toggleRoom}
            title={roomOn ? 'Turn all off' : 'Turn all on'}
            aria-label={roomOn ? 'Turn all off' : 'Turn all on'}
          />
        </div>
      </div>

      {/* Room body */}
      <div className="room-body">
        {/* Group creation bar */}
        {selectMode && (
          <div className="group-select-bar">
            <span className="group-select-label">Select lights (min 2):</span>
            <div className="group-select-actions">
              <input
                type="text"
                className="group-name-input-bar"
                placeholder="Group name"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
              />
              <button
                className="btn group-save-btn"
                onClick={createGroup}
                disabled={selectedLights.length < 2}
              >
                <i className="fas fa-check"></i> Create ({selectedLights.length})
              </button>
              <button className="btn group-cancel-btn" onClick={cancelSelect}>
                <i className="fas fa-times"></i> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Light groups */}
        {roomGroups.length > 0 && (
          <div className="room-groups">
            {roomGroups.map(group => (
              <LightGroup
                key={group.id}
                group={group}
                lights={room.lights}
                onDelete={onGroupDelete}
                onUpdate={onGroupUpdate}
              />
            ))}
          </div>
        )}

        {/* Lights list */}
        <div className="lights-list">
          {room.lights.map(light => (
            <div
              key={light.id}
              className={`light-row-wrapper${selectMode ? ' selectable' : ''}${selectedLights.includes(light.id) ? ' selected' : ''}`}
              onClick={selectMode ? () => toggleSelect(light.id) : undefined}
            >
              {selectMode && (
                <div className="light-select" style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
                  <div className="light-select-check">
                    {selectedLights.includes(light.id) && <i className="fas fa-check"></i>}
                  </div>
                  {selectedLights.includes(light.id) && (
                    <span className="light-select-order">{selectedLights.indexOf(light.id) + 1}</span>
                  )}
                </div>
              )}
              <div style={selectMode ? { paddingLeft: selectedLights.includes(light.id) ? 52 : 32 } : {}}>
                <LightCard light={light} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
