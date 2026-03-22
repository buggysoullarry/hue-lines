// api/buttons.js — Button mapping CRUD + button device discovery
const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const { getConfig } = require('../lib/hue');
const { readButtonMap, writeButtonMap } = require('../lib/hueEventStream');

// GET /api/buttons/devices — List all button devices from the bridge
router.get('/devices', async (req, res) => {
  try {
    const config = getConfig();
    const ip = config.hue.bridgeIp;
    const key = config.hue.username;
    const agent = new https.Agent({ rejectUnauthorized: false });

    const [devicesResp, buttonsResp] = await Promise.all([
      axios.get(`https://${ip}/clip/v2/resource/device`, {
        headers: { 'hue-application-key': key }, httpsAgent: agent, timeout: 5000
      }),
      axios.get(`https://${ip}/clip/v2/resource/button`, {
        headers: { 'hue-application-key': key }, httpsAgent: agent, timeout: 5000
      }),
    ]);

    const devices = devicesResp.data.data || [];
    const buttons = buttonsResp.data.data || [];

    // Find devices that have button services
    const buttonDevices = devices.filter(d =>
      d.services?.some(s => s.rtype === 'button')
    ).map(d => {
      const deviceButtons = buttons
        .filter(b => b.owner?.rid === d.id)
        .sort((a, b) => (a.metadata?.control_id || 0) - (b.metadata?.control_id || 0))
        .map(b => ({
          id: b.id,
          controlId: b.metadata?.control_id,
        }));

      return {
        id: d.id,
        name: d.metadata?.name || 'Unknown',
        model: d.product_data?.model_id || '',
        productName: d.product_data?.product_name || '',
        buttons: deviceButtons,
      };
    });

    res.json(buttonDevices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buttons/map — Get current button-to-chase-group mappings
router.get('/map', (req, res) => {
  res.json(readButtonMap());
});

// PUT /api/buttons/map — Update button mappings
// Body: { "buttonId": { "action": "toggle", "chaseGroupId": "cg-xxx" }, ... }
router.put('/map', (req, res) => {
  const map = req.body;
  if (!map || typeof map !== 'object') {
    return res.status(400).json({ error: 'Invalid button map' });
  }
  writeButtonMap(map);
  res.json({ success: true });
});

// PUT /api/buttons/map/:buttonId — Map a single button
router.put('/map/:buttonId', (req, res) => {
  const { buttonId } = req.params;
  const { action, chaseGroupId } = req.body;

  const map = readButtonMap();
  if (!action || !chaseGroupId) {
    // Remove mapping
    delete map[buttonId];
  } else {
    map[buttonId] = { action, chaseGroupId };
  }
  writeButtonMap(map);
  res.json({ success: true });
});

// DELETE /api/buttons/map/:buttonId — Remove a button mapping
router.delete('/map/:buttonId', (req, res) => {
  const map = readButtonMap();
  delete map[req.params.buttonId];
  writeButtonMap(map);
  res.json({ success: true });
});

module.exports = router;
