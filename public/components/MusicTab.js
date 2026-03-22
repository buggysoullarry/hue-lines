// MusicTab.js — Music library, folder-based playlists, and playback controls
const { useState, useEffect, useRef } = React;

function MusicTab() {
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playback, setPlayback] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [expandedPlaylist, setExpandedPlaylist] = useState(null);
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
    pollRef.current = setInterval(loadPlayback, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      await fetch('/api/music/library/rescan', { method: 'POST' });
      await loadLibrary();
      await loadPlaylists();
    } catch (err) { console.error('Rescan failed:', err); }
    setScanning(false);
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
      // Poll until playback starts
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const resp = await fetch('/api/playback/status');
        if (resp.ok) {
          const status = await resp.json();
          if (status.playing) { setPlayback(status); break; }
        }
      }
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

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isPlaying = playback?.playing;
  const currentTrack = playback?.currentTrack;

  // Get tracks for a playlist
  const getPlaylistTracks = (pl) => {
    return pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  };

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
              <span className="np-volume-pct">{playback?.volume || 50}%</span>
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
        <span className="music-info">
          <i className="fas fa-folder-open"></i> {tracks.length} tracks in {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
        </span>
        <button className="music-rescan-btn" onClick={rescan} disabled={scanning} title="Rescan music folder">
          <i className={`fas ${scanning ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
          {scanning ? ' Scanning...' : ' Rescan'}
        </button>
      </div>

      <p className="music-hint">
        Playlists are created automatically from subfolders in the music directory.
        Drop files into a subfolder and hit Rescan.
      </p>

      {/* Playlists */}
      {playlists.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-music"></i>
          <p>No playlists yet</p>
          <p className="hint">Create subfolders in your music directory and add audio files, then hit Rescan</p>
        </div>
      ) : (
        <div className="cg-list">
          {playlists.map(pl => {
            const plTracks = getPlaylistTracks(pl);
            const isExpanded = expandedPlaylist === pl.id;
            const isThisPlaying = playback?.playlistId === pl.id && isPlaying;

            return (
              <div key={pl.id} className={`cg-card${isThisPlaying ? ' cg-running' : ''}`}>
                <div className="cg-row" onClick={() => setExpandedPlaylist(isExpanded ? null : pl.id)}>
                  <button
                    className={`cg-play-btn${isThisPlaying ? ' running' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      if (isThisPlaying) stopPlayback();
                      else playPlaylist(pl.id);
                    }}
                    disabled={loadingAction !== null}
                    title={isThisPlaying ? 'Stop' : 'Play'}
                  >
                    <i className={`fas ${
                      loadingAction === `play-${pl.id}` ? 'fa-spinner fa-spin' :
                      isThisPlaying ? 'fa-stop' : 'fa-play'
                    }`}></i>
                  </button>
                  <span className="cg-name">
                    <i className="fas fa-folder" style={{ marginRight: 6, opacity: 0.5 }}></i>
                    {pl.name}
                  </span>
                  <span className="cg-member-count">{pl.trackIds.length} track{pl.trackIds.length !== 1 ? 's' : ''}</span>
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} cg-chevron`}></i>
                </div>

                {isExpanded && (
                  <div className="cg-details">
                    <div className="music-track-list-compact">
                      {plTracks.map((t, i) => (
                        <div key={t.id} className={`music-track-row${isThisPlaying && playback?.queuePosition === i ? ' music-track-active' : ''}`}>
                          <span className="music-track-num">{i + 1}</span>
                          <div className="music-track-info">
                            <span className="music-track-title">{t.title}</span>
                            <span className="music-track-detail">{t.artist}</span>
                          </div>
                          <span className="music-track-duration">{formatDuration(t.duration)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
