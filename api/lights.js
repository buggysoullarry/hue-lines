// api/lights.js — API routes for individual light controls
const express = require('express');
const router = express.Router();
const { startPlay, stopPlay, setLightOn, setLightOff, setLightName, setLightBrightness, setLightColor, setLightGradient } = require('../lib/hue');

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

// PUT /api/lights/:id/name — Rename a light
router.put('/:id/name', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    await setLightName(id, name);
    res.json({ success: true, message: `Renamed light ${id} to ${name}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to rename light ${id}: ${error.message}` });
  }
});

// PUT /api/lights/:id/brightness — Set light brightness
router.put('/:id/brightness', async (req, res) => {
  const { id } = req.params;
  const { brightness } = req.body;
  if (brightness === undefined || brightness < 0 || brightness > 254) return res.status(400).json({ error: 'Brightness must be between 0 and 254' });
  try {
    await setLightBrightness(id, brightness);
    res.json({ success: true, message: `Set brightness for light ${id} to ${brightness}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to set brightness for light ${id}: ${error.message}` });
  }
});

// PUT /api/lights/:id/color — Set light color
router.put('/:id/color', async (req, res) => {
  const { id } = req.params;
  const { hue, sat } = req.body;
  if (hue === undefined || sat === undefined || hue < 0 || hue > 65535 || sat < 0 || sat > 254) return res.status(400).json({ error: 'Hue must be 0-65535, sat 0-254' });
  try {
    await setLightColor(id, hue, sat);
    res.json({ success: true, message: `Set color for light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to set color for light ${id}: ${error.message}` });
  }
});

// PUT /api/lights/:id/gradient — Set light gradient for strips
router.put('/:id/gradient', async (req, res) => {
  const { id } = req.params;
  const { colors } = req.body;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > 5) return res.status(400).json({ error: 'Colors must be an array of 1-5 hex colors' });
  try {
    await setLightGradient(id, colors);
    res.json({ success: true, message: `Set gradient for light ${id}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to set gradient for light ${id}: ${error.message}` });
  }
});

module.exports = router;