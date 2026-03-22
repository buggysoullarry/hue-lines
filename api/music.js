// api/music.js — Music library and playlist endpoints
const express = require('express');
const router = express.Router();
const { getLibrary, rescanLibrary, searchLibrary, getMusicDir } = require('../lib/audio/library');
const { getPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist } = require('../lib/audio/playlist');

// GET /api/music/library — List all tracks (with optional search)
router.get('/library', (req, res) => {
  const { q } = req.query;
  const tracks = q ? searchLibrary(q) : getLibrary();
  res.json({ tracks, total: tracks.length, musicDir: getMusicDir() });
});

// POST /api/music/library/rescan — Re-scan music directory
router.post('/library/rescan', async (req, res) => {
  try {
    const tracks = await rescanLibrary();
    res.json({ success: true, total: tracks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/music/playlists — List all playlists
router.get('/playlists', (req, res) => {
  const playlists = getPlaylists();
  res.json(playlists);
});

// GET /api/music/playlists/:id — Get single playlist with track details
router.get('/playlists/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  const library = getLibrary();
  const tracks = playlist.trackIds.map(id => library.find(t => t.id === id)).filter(Boolean);
  res.json({ ...playlist, tracks });
});

// POST /api/music/playlists — Create playlist
router.post('/playlists', (req, res) => {
  const { name, trackIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const playlist = createPlaylist(name, trackIds || []);
  res.json(playlist);
});

// PUT /api/music/playlists/:id — Update playlist
router.put('/playlists/:id', (req, res) => {
  const updated = updatePlaylist(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Playlist not found' });
  res.json(updated);
});

// DELETE /api/music/playlists/:id — Delete playlist
router.delete('/playlists/:id', (req, res) => {
  const deleted = deletePlaylist(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Playlist not found' });
  res.json({ success: true });
});

module.exports = router;
