// api/bridge.js — Bridge discovery, validation, and pairing
const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { getConfig, configPath } = require('../lib/hue');

// GET /api/bridge/status — Current bridge config and connection status
router.get('/status', async (req, res) => {
  const config = getConfig();
  const ip = config.hue.bridgeIp;
  const key = config.hue.username;

  const status = { bridgeIp: ip, hasKey: !!key, reachable: false, authenticated: false };

  if (!ip) return res.json(status);

  // Check reachability
  try {
    await axios.get(`https://${ip}/clip/v2/resource/bridge`, {
      headers: { 'hue-application-key': key || 'test' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 3000
    });
    status.reachable = true;
    status.authenticated = true;
  } catch (err) {
    if (err.response) {
      // Bridge responded — it's reachable but key may be bad
      status.reachable = true;
      status.authenticated = err.response.status !== 403 && err.response.status !== 401;
    }
    // Otherwise not reachable
  }

  res.json(status);
});

// GET /api/bridge/discover — Find bridges on the network
router.get('/discover', async (req, res) => {
  try {
    const response = await axios.get('https://discovery.meethue.com/', { timeout: 5000 });
    const bridges = response.data.map(b => ({
      id: b.id,
      ip: b.internalipaddress,
      port: b.port || 443
    }));
    res.json({ bridges });
  } catch (err) {
    res.status(502).json({ error: 'Cloud discovery failed', message: err.message });
  }
});

// GET /api/bridge/validate — Check if key works against a specific bridge IP
router.get('/validate', async (req, res) => {
  const ip = req.query.ip || getConfig().hue.bridgeIp;
  const key = req.query.key || getConfig().hue.username;

  if (!ip) return res.json({ valid: false, error: 'No bridge IP configured' });
  if (!key) return res.json({ valid: false, error: 'No API key configured' });

  try {
    const response = await axios.get(`https://${ip}/clip/v2/resource/bridge`, {
      headers: { 'hue-application-key': key },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 3000
    });
    res.json({ valid: true, bridgeIp: ip });
  } catch (err) {
    if (err.response && (err.response.status === 403 || err.response.status === 401)) {
      res.json({ valid: false, error: 'API key is not authorized', bridgeIp: ip });
    } else if (err.response) {
      res.json({ valid: false, error: `Bridge returned ${err.response.status}`, bridgeIp: ip });
    } else {
      res.json({ valid: false, error: `Cannot reach bridge at ${ip}: ${err.message}`, bridgeIp: ip });
    }
  }
});

// POST /api/bridge/pair — Register with bridge (requires physical button press)
router.post('/pair', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ success: false, error: 'Bridge IP is required' });

  try {
    const response = await axios.post(`http://${ip}/api`, {
      devicetype: 'hue-lines#user',
      generateclientkey: true
    }, { timeout: 5000 });

    const result = response.data[0];
    if (result.error) {
      return res.json({
        success: false,
        error: result.error.description,
        type: result.error.type
      });
    }

    if (result.success) {
      return res.json({
        success: true,
        username: result.success.username,
        clientkey: result.success.clientkey
      });
    }

    res.json({ success: false, error: 'Unexpected response from bridge' });
  } catch (err) {
    res.status(502).json({ success: false, error: `Cannot reach bridge: ${err.message}` });
  }
});

// POST /api/bridge/save — Save bridge config
router.post('/save', (req, res) => {
  const { bridgeIp, username, appkey } = req.body;

  try {
    const config = getConfig();
    if (bridgeIp) config.hue.bridgeIp = bridgeIp;
    if (username) config.hue.username = username;
    if (appkey) config.hue.appkey = appkey;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to save config: ${err.message}` });
  }
});

module.exports = router;
