// App.js — top-level app component
const { useState, useEffect } = React;
let dragAllowed = false; // gate drag start to header bar only

function App() {
  const [rooms, setRooms] = useState([]);
  const roomOrderKey = 'hue-room-order';

  const loadRooms = async () => {
    const data = await fetchRooms();
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
  };

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 30000);
    return () => clearInterval(interval);
  }, []);

  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const onHeaderMouseDown = () => { dragAllowed = true; };
  const onHeaderTouchStart = () => { dragAllowed = true; };
  const clearDragAllowed = () => { dragAllowed = false; };

  const onDragStart = (e, idx) => {
    if (!dragAllowed) {
      e.preventDefault();
      return;
    }
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('room-idx', idx);
    e.currentTarget.classList.add('room-draggable');
    clearDragAllowed();
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
    e.dataTransfer.dropEffect = 'move';
  };
  const onDragLeave = () => {
    setDragOverIdx(null);
  };
  const onDrop = (e, idx) => {
    const fromIdx = parseInt(e.dataTransfer.getData('room-idx'));
    if (fromIdx === idx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newRooms = [...rooms];
    const [moved] = newRooms.splice(fromIdx, 1);
    newRooms.splice(idx, 0, moved);
    setRooms(newRooms);
    localStorage.setItem(roomOrderKey, JSON.stringify(newRooms.map(r => r.id)));
    setDraggedIdx(null);
    setDragOverIdx(null);
  };
  const onDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
    clearDragAllowed();
  };

  return (
    <div className="rooms-container" aria-live="polite">
      {rooms.length === 0 ? 'No rooms found.' : rooms.map((room, idx) => {
        const isDragged = draggedIdx === idx;
        const isDragOver = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
        return (
          <div
            key={room.id}
            className={`room-draggable${isDragOver ? ' drag-over' : ''}`}
            draggable
            onDragStart={e => onDragStart(e, idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, idx)}
            onDragEnd={onDragEnd}
            aria-grabbed={isDragged}
            aria-dropeffect="move"
          >
            <Room room={room} dragHandleProps={{
              onMouseDown: onHeaderMouseDown,
              onMouseUp: clearDragAllowed,
              onTouchStart: onHeaderTouchStart,
              onTouchEnd: clearDragAllowed,
              style: { cursor: 'grab' }
            }} />
          </div>
        );
      })}
    </div>
  );
}
