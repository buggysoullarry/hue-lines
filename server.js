// server.js — Express server with API routes and static serving
const express = require('express');
const path = require('path');
const { cookieParser, authMiddleware } = require('./lib/auth');
const authRouter = require('./api/auth');
const roomsRouter = require('./api/rooms');
const lightsRouter = require('./api/lights');
const bridgeRouter = require('./api/bridge');
const sequencesRouter = require('./api/sequences');
const chaseGroupsRouter = require('./api/chaseGroups');
const musicRouter = require('./api/music');
const playbackRouter = require('./api/playback');
const buttonsRouter = require('./api/buttons');
const { connect: connectEventStream } = require('./lib/hueEventStream');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting by real IP
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Auth routes (before auth middleware)
app.use('/api/auth', authRouter);

// Login page (before auth middleware)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Public assets needed by login page (before auth middleware)
const publicAssets = ['/logo-horizontal.png', '/favicon.svg', '/favicon-96x96.png', '/favicon.ico'];
publicAssets.forEach(asset => {
  app.get(asset, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', asset));
  });
});

// Auth middleware — everything below requires authentication
app.use(authMiddleware);

// Static files (protected)
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

// Deploy timestamp
const fs = require('fs');
const deployTimestampPath = path.join(__dirname, 'deploy-timestamp.txt');
app.get('/api/deploy-info', (req, res) => {
  try {
    const ts = fs.readFileSync(deployTimestampPath, 'utf8').trim();
    res.json({ deployedAt: ts });
  } catch {
    res.json({ deployedAt: null });
  }
});

// API routes
app.use('/api/rooms', roomsRouter);
app.use('/api/lights', lightsRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/sequences', sequencesRouter);
app.use('/api/groups', sequencesRouter); // backwards compat
app.use('/api/chase-groups', chaseGroupsRouter);
app.use('/api/music', musicRouter);
app.use('/api/playback', playbackRouter);
app.use('/api/buttons', buttonsRouter);

// Fallback for SPA (serve index.html for non-API routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const log = require('./lib/logger');

app.listen(PORT, () => {
  log.info(`Server running at http://localhost:${PORT}/`);

  // Connect to Hue Bridge EventStream for button press handling
  // Track which chase groups are active (file-backed so it survives restarts)
  const buttonStatePath = path.join(__dirname, 'buttonState.json');
  function getButtonState() {
    try { return JSON.parse(fs.readFileSync(buttonStatePath, 'utf8')); }
    catch { return {}; }
  }
  function setButtonState(cgId, running) {
    const state = getButtonState();
    state[cgId] = running;
    fs.writeFileSync(buttonStatePath, JSON.stringify(state), 'utf8');
  }

  connectEventStream((buttonEvent) => {
    // Find which chase group has this button assigned
    let cgs = [];
    try { cgs = JSON.parse(fs.readFileSync(path.join(__dirname, 'chaseGroups.json'), 'utf8')); } catch {}

    const cg = cgs.find(g => g.buttonId === buttonEvent.buttonId);
    if (!cg) {
      log.info(`Button ${buttonEvent.buttonId} pressed but not mapped to any chase group`);
      return;
    }

    const state = getButtonState();
    const isRunning = state[cg.id] || false;
    const endpoint = isRunning ? 'stop' : 'play';

    log.info(`Tap button pressed → ${endpoint} chase group "${cg.name}"`);
    setButtonState(cg.id, !isRunning);

    // Use internal HTTP to trigger play/stop (reuses all existing logic including music)
    const http = require('http');
    const reqOpts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/chase-groups/${cg.id}/${endpoint}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(reqOpts);
    if (endpoint === 'play') {
      r.write(JSON.stringify({ speed: cg.speed, bgColor: cg.bgColor, headColor: cg.headColor }));
    }
    r.end();
  });
});
