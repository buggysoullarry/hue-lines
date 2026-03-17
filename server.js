// server.js — Express server with API routes and static serving
const express = require('express');
const path = require('path');
const roomsRouter = require('./api/rooms');
const lightsRouter = require('./api/lights');
const bridgeRouter = require('./api/bridge');
const sequencesRouter = require('./api/sequences');
const chaseGroupsRouter = require('./api/chaseGroups');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', async (req, res) => {
  const { getConfig } = require('./lib/hue');
  const axios = require('axios');
  const https = require('https');
  const { isGroupChaseRunning } = require('./lib/animations/groupChase');
  const { isStripChaseRunning } = require('./lib/animations/omniglowChase');

  const config = getConfig();
  const ip = config.hue.bridgeIp;
  let bridgeReachable = false;

  try {
    await axios.get(`https://${ip}/clip/v2/resource/bridge`, {
      headers: { 'hue-application-key': config.hue.username },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 3000
    });
    bridgeReachable = true;
  } catch {}

  res.json({
    status: bridgeReachable ? 'ok' : 'degraded',
    bridge: { ip, reachable: bridgeReachable },
    uptime: Math.floor(process.uptime())
  });
});

// API routes
app.use('/api/rooms', roomsRouter);
app.use('/api/lights', lightsRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/sequences', sequencesRouter);
app.use('/api/groups', sequencesRouter); // backwards compat
app.use('/api/chase-groups', chaseGroupsRouter);

// Fallback for SPA (serve index.html for non-API routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const log = require('./lib/logger');

app.listen(PORT, () => {
  log.info(`Server running at http://localhost:${PORT}/`);
});
