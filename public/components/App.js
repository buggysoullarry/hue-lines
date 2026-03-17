// App.js — top-level app with tabs (Rooms / Chase Groups)
const { useState, useEffect } = React;
let dragAllowed = false;

function App() {
  const [tab, setTab] = useState(() => localStorage.getItem('hue-tab') || 'rooms');
  const [rooms, setRooms] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [chaseGroups, setChaseGroups] = useState([]);
  const [bridgeError, setBridgeError] = useState(null);
  const roomOrderKey = 'hue-room-order';

  const saveTab = (t) => { setTab(t); localStorage.setItem('hue-tab', t); };

  const loadRooms = async () => {
    const result = await fetchRooms();
    if (result.error) {
      setBridgeError(result.error);
      setRooms([]);
    } else {
      setBridgeError(null);
      const data = result.rooms;
      const savedOrder = JSON.parse(localStorage.getItem(roomOrderKey) || '[]');
      if (savedOrder.length) {
        data.sort((a, b) => {
          const ai = savedOrder.indexOf(a.id);
          const bi = savedOrder.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
      setRooms(data);
    }
  };

  const loadSequences = async () => {
    try {
      const resp = await fetch('/api/sequences');
      if (resp.ok) setSequences(await resp.json());
    } catch (err) {
      console.warn('Could not load sequences:', err.message);
    }
  };

  const loadChaseGroups = async () => {
    try {
      const resp = await fetch('/api/chase-groups');
      if (resp.ok) setChaseGroups(await resp.json());
    } catch (err) {
      console.warn('Could not load chase groups:', err.message);
    }
  };

  const loadAll = () => { loadRooms(); loadSequences(); loadChaseGroups(); };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const onReconnect = () => loadAll();

  // Sequence handlers (used by Room component)
  const handleSeqCreate = async (data) => {
    try {
      const resp = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (resp.ok) loadSequences();
    } catch (err) { console.error('Failed to create sequence:', err); }
  };

  const handleSeqDelete = async (id) => {
    try {
      await fetch(`/api/sequences/${id}`, { method: 'DELETE' });
      loadSequences();
    } catch (err) { console.error('Failed to delete sequence:', err); }
  };

  const handleSeqUpdate = async (id, updates) => {
    try {
      await fetch(`/api/sequences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      loadSequences();
    } catch (err) { console.error('Failed to update sequence:', err); }
  };

  // Room drag-and-drop
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [draggableIdx, setDraggableIdx] = useState(null);

  const onHeaderMouseDown = (idx) => { dragAllowed = true; setDraggableIdx(idx); };
  const onHeaderTouchStart = (idx) => { dragAllowed = true; setDraggableIdx(idx); };
  const clearDragAllowed = () => { dragAllowed = false; setDraggableIdx(null); };

  const onDragStart = (e, idx) => {
    if (!dragAllowed) { e.preventDefault(); return; }
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('room-idx', idx);
    clearDragAllowed();
  };
  const onDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); e.dataTransfer.dropEffect = 'move'; };
  const onDragLeave = () => { setDragOverIdx(null); };
  const onDrop = (e, idx) => {
    const fromIdx = parseInt(e.dataTransfer.getData('room-idx'));
    if (fromIdx === idx) { setDraggedIdx(null); setDragOverIdx(null); return; }
    const newRooms = [...rooms];
    const [moved] = newRooms.splice(fromIdx, 1);
    newRooms.splice(idx, 0, moved);
    setRooms(newRooms);
    localStorage.setItem(roomOrderKey, JSON.stringify(newRooms.map(r => r.id)));
    setDraggedIdx(null);
    setDragOverIdx(null);
  };
  const onDragEnd = () => { setDraggedIdx(null); setDragOverIdx(null); clearDragAllowed(); };

  const [debugOpen, setDebugOpen] = useState(false);

  return (
    <>
      {/* Header with logo, centered tabs, and debug */}
      <header className="site-header">
        <div className="header-logo">
          <img src="logo-horizontal.png" alt="Hue Lines" className="logo-desktop" />
          <img src="logo-box-2.png" alt="Hue Lines" className="logo-mobile" />
        </div>
        <nav className="header-tabs">
          <button className={`header-tab${tab === 'rooms' ? ' active' : ''}`} onClick={() => saveTab('rooms')}>
            <i className="fas fa-home"></i> Rooms
          </button>
          <button className={`header-tab${tab === 'chase-groups' ? ' active' : ''}`} onClick={() => saveTab('chase-groups')}>
            <i className="fas fa-bolt"></i> Chase Groups
          </button>
        </nav>
        <button className="debug-btn" onClick={() => setDebugOpen(!debugOpen)} title="Debug log">
          <i className="fas fa-bug"></i>
        </button>
      </header>

      {debugOpen && <DebugModal onClose={() => setDebugOpen(false)} />}

      {bridgeError && <BridgeBanner error={bridgeError} onReconnect={onReconnect} />}

      {/* Rooms tab */}
      {tab === 'rooms' && (
        <div className="rooms-container" aria-live="polite">
          {rooms.length === 0 && !bridgeError ? (
            <div className="empty-state">
              <i className="fas fa-lightbulb"></i>
              <p>No rooms found</p>
              <p className="hint">Connect to a Hue bridge to get started</p>
            </div>
          ) : rooms.map((room, idx) => {
            const isDragOver = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
            return (
              <div
                key={room.id}
                className={`room-draggable${isDragOver ? ' drag-over' : ''}`}
                draggable={draggableIdx === idx}
                onDragStart={e => onDragStart(e, idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, idx)}
                onDragEnd={onDragEnd}
              >
                <Room
                  room={room}
                  groups={sequences}
                  onGroupCreate={handleSeqCreate}
                  onGroupDelete={handleSeqDelete}
                  onGroupUpdate={handleSeqUpdate}
                  dragHandleProps={{
                    onMouseDown: () => onHeaderMouseDown(idx),
                    onMouseUp: clearDragAllowed,
                    onTouchStart: () => onHeaderTouchStart(idx),
                    onTouchEnd: clearDragAllowed,
                    style: { cursor: 'grab' }
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Chase Groups tab */}
      {tab === 'chase-groups' && (
        <ChaseGroupsTab
          chaseGroups={chaseGroups}
          sequences={sequences}
          rooms={rooms}
          onRefresh={loadChaseGroups}
        />
      )}
    </>
  );
}
