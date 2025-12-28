// Room.js — room wrapper with drag handle
function Room({ room, dragHandleProps }) {
  return (
    <div className="room">
      <div className="room-header" style={{ display: 'flex', alignItems: 'center', background: 'rgba(20,30,50,0.18)', borderRadius: '8px 8px 0 0', padding: '8px 12px', marginBottom: '10px', cursor: 'default' }}>
        <span
          className="drag-handle"
          onMouseDown={dragHandleProps.onMouseDown}
          onMouseUp={dragHandleProps.onMouseUp}
          onTouchStart={dragHandleProps.onTouchStart}
          onTouchEnd={dragHandleProps.onTouchEnd}
          title="Drag to reorder room"
          aria-label="Drag to reorder room"
          tabIndex={0}
          style={{ ...dragHandleProps.style, marginRight: '12px', fontSize: '1.5em', background: 'none', border: 'none', outline: 'none' }}
        >
          <i className="fas fa-bars" aria-hidden="true"></i>
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontWeight: 600, fontSize: '1.15em', color: '#e6eef8' }}>{room.name}</h2>
        </div>
      </div>
      <hr style={{ marginBottom: '20px' }}></hr>
      <div className="lights-grid">
        {room.lights.map(light => <LightCard key={light.id} light={light} />)}
      </div>
    </div>
  );
}
