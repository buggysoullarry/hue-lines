// MusicTab.js — Music library, playlists, and playback controls
const { useState, useEffect, useRef } = React;

function MusicTab() {
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playback, setPlayback] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const pollRef = useRef(null);

  const loadLibrary = async () => {
    try {
      const resp = await fetch('/api/music/library');
      if (resp.ok) {
        const data = await resp.json();
        setTracks(data.tracks || []);
      }
    } catch (err) { console.error('Failed to load library:', err); }
  };

  const loadPlaylists = async () => {
    try {
      const resp = await fetch('/api/music/playlists');
      if (resp.ok) setPlaylists(await resp.json());
    } catch (err) { console.error('Failed to load playlists:', err); }
  };

  const loadPlayback = async () => {
    try {
      const resp = await fetch('/api/playback/status');
      if (resp.ok) setPlayback(await resp.json());
    } catch (err) { console.error('Failed to load playback:', err); }
  };

  useEffect(() => {
    loadLibrary();
    loadPlaylists();
    loadPlayback();
    // Poll playback status while playing
    pollRef.current = setInterval(loadPlayback, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      await fetch('/api/music/library/rescan', { method: 'POST' });
      await loadLibrary();
    } catch (err) { console.error('Rescan failed:', err); }
    setScanning(false);
  };

  // Playlist CRUD
  const createPlaylist = async () => {
    if (!newPlaylistName.trim() || selectedTracks.length === 0) return;
    try {
      await fetch('/api/music/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim(), trackIds: selectedTracks })
      });
      setCreating(false);
      setNewPlaylistName('');
      setSelectedTracks([]);
      loadPlaylists();
    } catch (err) { console.error('Failed to create playlist:', err); }
  };

  const deletePlaylist = async (id) => {
    try {
      await fetch(`/api/music/playlists/${id}`, { method: 'DELETE' });
      loadPlaylists();
    } catch (err) { console.error('Failed to delete playlist:', err); }
  };

  // Playback controls
  const playPlaylist = async (playlistId) => {
    setLoadingAction(`play-${playlistId}`);
    try {
      await fetch('/api/playback/play', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId })
      });
      await loadPlayback();
    } catch (err) { console.error('Failed to play:', err); }
    setLoadingAction(null);
  };

  const stopPlayback = async () => {
    setLoadingAction('stop');
    try {
      await fetch('/api/playback/stop', { method: 'PUT' });
      await loadPlayback();
    } catch (err) { console.error('Failed to stop:', err); }
    setLoadingAction(null);
  };

  const skipTrack = async () => {
    try {
      await fetch('/api/playback/skip', { method: 'PUT' });
      await loadPlayback();
    } catch (err) { console.error('Failed to skip:', err); }
  };

  const prevTrack = async () => {
    try {
      await fetch('/api/playback/prev', { method: 'PUT' });
      await loadPlayback();
    } catch (err) { console.error('Failed to go prev:', err); }
  };

  const setVolume = async (vol) => {
    try {
      await fetch('/api/playback/volume', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: parseInt(vol) })
      });
      setPlayback(prev => prev ? { ...prev, volume: parseInt(vol) } : prev);
    } catch (err) { console.error('Failed to set volume:', err); }
  };

  const toggleTrackSelection = (trackId) => {
    setSelectedTracks(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  };

  const selectAll = () => {
    const filtered = filteredTracks();
    setSelectedTracks(filtered.map(t => t.id));
  };

  const filteredTracks = () => {
    if (!search.trim()) return tracks;
    const q = search.toLowerCase();
    return tracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  };

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isPlaying = playback?.playing;
  const currentTrack = playback?.currentTrack;

  return (
    <div className="music-tab">
      {/* Now Playing bar */}
      {isPlaying && currentTrack && (
        <div className="now-playing">
          <div className="now-playing-info">
            <span className="now-playing-title">{currentTrack.title}</span>
            <span className="now-playing-artist">{currentTrack.artist} — {currentTrack.album}</span>
          </div>
          <div className="now-playing-controls">
            <button className="np-btn" onClick={prevTrack} title="Previous">
              <i className="fas fa-step-backward"></i>
            </button>
            <button className="np-btn np-stop" onClick={stopPlayback} title="Stop"
              disabled={loadingAction === 'stop'}>
              <i className={`fas ${loadingAction === 'stop' ? 'fa-spinner fa-spin' : 'fa-stop'}`}></i>
            </button>
            <button className="np-btn" onClick={skipTrack} title="Next">
              <i className="fas fa-step-forward"></i>
            </button>
            <div className="np-volume">
              <i className="fas fa-volume-up"></i>
              <input type="range" min="0" max="100"
                value={playback?.volume || 50}
                onChange={e => setVolume(e.target.value)}
                title={`Volume: ${playback?.volume || 50}%`}
              />
            </div>
          </div>
          <div className="now-playing-progress">
            <span>{formatDuration(playback?.elapsed)}</span>
            <span className="np-sep">/</span>
            <span>{formatDuration(currentTrack.duration)}</span>
            {playback?.queuePosition != null && (
              <span className="np-queue">Track {playback.queuePosition + 1} of {playback.queueLength}</span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="cg-tab-header">
        <button className="cg-create-btn" onClick={() => setCreating(!creating)}>
          <i className={`fas ${creating ? 'fa-times' : 'fa-plus'}`}></i>
          {creating ? ' Cancel' : ' New Playlist'}
        </button>
        <button className="music-rescan-btn" onClick={rescan} disabled={scanning} title="Rescan music folder">
          <i className={`fas ${scanning ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
          {scanning ? ' Scanning...' : ' Rescan'}
        </button>
      </div>

      {/* Create playlist form */}
      {creating && (
        <div className="cg-create-form">
          <input
            type="text"
            className="cg-create-name"
            placeholder="Playlist name"
            value={newPlaylistName}
            onChange={e => setNewPlaylistName(e.target.value)}
          />

          <div className="music-search-row">
            <input
              type="text"
              className="music-search"
              placeholder="Search tracks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="music-select-all" onClick={selectAll}>Select All</button>
          </div>

          <div className="music-track-list">
            {filteredTracks().map(track => (
              <label key={track.id} className={`cg-create-option${selectedTracks.includes(track.id) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedTracks.includes(track.id)}
                  onChange={() => toggleTrackSelection(track.id)}
                />
                <div className="music-track-info">
                  <span className="music-track-title">{track.title}</span>
                  <span className="music-track-detail">{track.artist} — {track.album}</span>
                </div>
                <span className="music-track-duration">{formatDuration(track.duration)}</span>
              </label>
            ))}
            {filteredTracks().length === 0 && (
              <div className="music-empty">
                {tracks.length === 0 ? 'No tracks found. Click Rescan to index your music folder.' : 'No matching tracks.'}
              </div>
            )}
          </div>

          <button
            className="cg-create-save"
            onClick={createPlaylist}
            disabled={!newPlaylistName.trim() || selectedTracks.length === 0}
          >
            <i className="fas fa-check"></i> Create Playlist ({selectedTracks.length} track{selectedTracks.length !== 1 ? 's' : ''})
          </button>
        </div>
      )}

      {/* Playlists */}
      {playlists.length === 0 && !creating ? (
        <div className="empty-state">
          <i className="fas fa-music"></i>
          <p>No playlists yet</p>
          <p className="hint">Create a playlist to start streaming to your HomePod</p>
        </div>
      ) : (
        <div className="cg-list">
          {playlists.map(pl => (
            <div key={pl.id} className={`cg-card${playback?.playlistId === pl.id && isPlaying ? ' cg-running' : ''}`}>
              <div className="cg-row">
                <button
                  className={`cg-play-btn${playback?.playlistId === pl.id && isPlaying ? ' running' : ''}`}
                  onClick={() => {
                    if (playback?.playlistId === pl.id && isPlaying) stopPlayback();
                    else playPlaylist(pl.id);
                  }}
                  disabled={loadingAction !== null}
                  title={playback?.playlistId === pl.id && isPlaying ? 'Stop' : 'Play'}
                >
                  <i className={`fas ${
                    loadingAction === `play-${pl.id}` ? 'fa-spinner fa-spin' :
                    playback?.playlistId === pl.id && isPlaying ? 'fa-stop' : 'fa-play'
                  }`}></i>
                </button>
                <span className="cg-name">{pl.name}</span>
                <span className="cg-member-count">{pl.trackIds.length} track{pl.trackIds.length !== 1 ? 's' : ''}</span>
                <button className="music-delete-btn" onClick={() => deletePlaylist(pl.id)} title="Delete playlist">
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
