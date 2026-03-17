// api/rooms.js — API routes for rooms
const express = require('express');
const router = express.Router();
const { getRooms, startPlay, stopPlay } = require('../lib/hue');
const log = require('../lib/logger');

// GET /api/rooms — Get all rooms with their lights
router.get('/', async (req, res) => {
  try {
    const rooms = await getRooms();
    res.json(rooms);
  } catch (error) {
    log.error(`Failed to fetch rooms: ${error.message}`);
    res.status(502).json({
      error: 'Failed to reach Hue bridge',
      message: error.message,
      bridgeIp: error.config?.url || 'unknown'
    });
  }
});

// PUT /api/lights/:id/play — Start play for a light
router.put('/:id/play', async (req, res) => {
  const { id } = req.params;
  try {
    await startPlay(id);
    res.json({ success: true, message: `Started play for light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to start play for light ${id}: ${error.message}` });
  }
});

// PUT /api/lights/:id/stop — Stop play for a light
router.put('/:id/stop', async (req, res) => {
  const { id } = req.params;
  try {
    await stopPlay(id);
    res.json({ success: true, message: `Stopped play for light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to stop play for light ${id}: ${error.message}` });
  }
});

module.exports = router;