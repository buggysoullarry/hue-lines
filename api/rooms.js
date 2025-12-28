// api/rooms.js — API routes for rooms
const express = require('express');
const router = express.Router();
const { getRooms, startPlay, stopPlay } = require('../lib/hue');

// GET /api/rooms — Get all rooms with their lights
router.get('/', async (req, res) => {
  console.log('GET /api/rooms called');
  try {
    const rooms = await getRooms();
    res.json(rooms);
  } catch (error) {
    // Fallback to sample data if Hue API fails
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
    console.warn('Using sample rooms due to Hue API error:', error.message);
    res.json(sampleRooms);
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