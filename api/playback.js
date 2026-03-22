// api/playback.js — Playback control endpoints
const express = require('express');
const router = express.Router();
const playback = require('../lib/audio/playback');

// PUT /api/playback/play — Start playing a playlist
router.put('/play', async (req, res) => {
  const { playlistId, trackIndex } = req.body;
  if (!playlistId) return res.status(400).json({ error: 'playlistId is required' });

  try {
    await playback.play(playlistId, trackIndex || 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/playback/stop — Stop playback
router.put('/stop', (req, res) => {
  playback.stop();
  res.json({ success: true });
});

// PUT /api/playback/skip — Next track
router.put('/skip', async (req, res) => {
  try {
    await playback.skip();
    res.json({ success: true, status: playback.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/playback/prev — Previous track
router.put('/prev', async (req, res) => {
  try {
    await playback.prev();
    res.json({ success: true, status: playback.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/playback/volume — Set volume
router.put('/volume', (req, res) => {
  const { volume } = req.body;
  if (volume === undefined || volume < 0 || volume > 100) {
    return res.status(400).json({ error: 'Volume must be 0-100' });
  }
  playback.setVolume(volume);
  res.json({ success: true });
});

// PUT /api/playback/shuffle — Toggle shuffle
router.put('/shuffle', (req, res) => {
  const { enabled } = req.body;
  playback.setShuffle(!!enabled);
  res.json({ success: true });
});

// PUT /api/playback/repeat — Set repeat mode
router.put('/repeat', (req, res) => {
  const { mode } = req.body;
  if (!['none', 'all', 'one'].includes(mode)) {
    return res.status(400).json({ error: 'Mode must be none, all, or one' });
  }
  playback.setRepeat(mode);
  res.json({ success: true });
});

// GET /api/playback/status — Current playback status
router.get('/status', (req, res) => {
  res.json(playback.getStatus());
});

module.exports = router;
