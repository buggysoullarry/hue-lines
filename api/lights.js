// api/lights.js — API routes for individual light controls
const express = require('express');
const router = express.Router();
const { startPlay, stopPlay, setLightOn, setLightOff } = require('../lib/hue');

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

// PUT /api/lights/:id/on — Turn on a light
router.put('/:id/on', async (req, res) => {
  const { id } = req.params;
  try {
    await setLightOn(id);
    res.json({ success: true, message: `Turned on light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to turn on light ${id}: ${error.message}` });
  }
});

// PUT /api/lights/:id/off — Turn off a light
router.put('/:id/off', async (req, res) => {
  const { id } = req.params;
  try {
    await setLightOff(id);
    res.json({ success: true, message: `Turned off light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to turn off light ${id}: ${error.message}` });
  }
});

module.exports = router;