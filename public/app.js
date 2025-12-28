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

  useEffect(() => {
    setOnOffText(light.on ? 'On' : 'Off');
  }, [light.on]);

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

  return (
    <div className="card">
      <div className="row">
        <div className="light-name">{light.name || `Light ${light.id}`}</div>
        <div className="swatch" style={{ background: light.color || '#999' }}></div>
      </div>
      <div className="row">
        <button className="btn on-off" onClick={toggleOnOff}>{onOffText}</button>
        <div className="controls">
          <button className="btn play-stop" onClick={togglePlay}>{playText}</button>
        </div>
      </div>
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
