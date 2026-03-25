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

  const { startGroupChase, stopGroupChase } = require('./lib/animations/groupChase');
  const { startChase, stopChase } = require('./lib/animations/omniglowChase');
  const { setLightOn } = require('./lib/hue');
  const playback = require('./lib/audio/playback');
  const { snapshotLightStates, restoreLightStates } = require('./lib/lightSnapshot');
  const { activeMembership, resolveConflicts } = chaseGroupsRouter;

  connectEventStream(async (buttonEvent) => {
    // Find which chase group has this button assigned
    let cgs = [];
    try { cgs = JSON.parse(fs.readFileSync(path.join(__dirname, 'chaseGroups.json'), 'utf8')); } catch {}
    let seqs = [];
    try { seqs = JSON.parse(fs.readFileSync(path.join(__dirname, 'sequences.json'), 'utf8')); } catch {}

    const cg = cgs.find(g => g.buttonId === buttonEvent.buttonId);
    if (!cg) {
      log.info(`Button ${buttonEvent.buttonId} pressed but not mapped to any chase group`);
      return;
    }

    const state = getButtonState();
    const isRunning = state[cg.id] || false;

    if (isRunning) {
      // STOP
      log.info(`Tap button → stopping chase group "${cg.name}"`);
      setButtonState(cg.id, false);

      for (const member of cg.members) {
        if (member.type === 'sequence') stopGroupChase(member.id);
        else if (member.type === 'strip') stopChase(member.id);
        activeMembership.delete(member.id);
      }
      if (cg.playlistId) playback.stop();
      await restoreLightStates(cg.id);
    } else {
      // PLAY
      log.info(`Tap button → starting chase group "${cg.name}"`);

      // Stop any conflicting chase groups that share members
      resolveConflicts(cg.id, cg.members);

      setButtonState(cg.id, true);

      const speed = cg.speed || 1000;
      const bgColor = cg.bgColor || '#800080';
      const headColor = cg.headColor || '#0000ff';

      // Snapshot light states before changing anything
      const allLightIds = [];
      for (const member of cg.members) {
        if (member.type === 'sequence') {
          const seq = seqs.find(s => s.id === member.id);
          if (seq) allLightIds.push(...seq.lightIds);
        } else if (member.type === 'strip') {
          allLightIds.push(member.id);
        }
      }
      await snapshotLightStates(cg.id, allLightIds);

      // Turn on all lights first
      for (const member of cg.members) {
        if (member.type === 'sequence') {
          const seq = seqs.find(s => s.id === member.id);
          if (seq) {
            for (const lightId of seq.lightIds) {
              try { await setLightOn(lightId); } catch {}
            }
          }
        } else if (member.type === 'strip') {
          try { await setLightOn(member.id); } catch {}
        }
      }

      // Start chases
      for (const member of cg.members) {
        try {
          if (member.type === 'sequence') {
            const seq = seqs.find(s => s.id === member.id);
            if (seq) {
              stopGroupChase(seq.id);
              startGroupChase(seq.id, seq.lightIds, speed, bgColor, headColor);
            }
          } else if (member.type === 'strip') {
            stopChase(member.id);
            await startChase(member.id, speed, bgColor, headColor);
          }
          activeMembership.set(member.id, cg.id);
        } catch (err) {
          log.error(`Button chase start error: ${err.message}`);
        }
      }

      // Start playlist
      if (cg.playlistId) {
        try {
          playback.play(cg.playlistId, { shuffle: true });
          log.info(`Started playlist for "${cg.name}"`);
        } catch (err) {
          log.error(`Button playlist start error: ${err.message}`);
        }
      }
    }
  }, (rotaryEvent) => {
    // Rotary dial controls music volume
    const status = playback.getStatus();
    if (!status.playing) return;

    const currentVol = status.volume;
    // ~3% per event — middle ground between too jumpy and too sluggish
    const delta = rotaryEvent.direction === 'clock_wise' ? 3 : -3;
    const newVol = Math.min(100, Math.max(0, currentVol + delta));

    if (newVol !== currentVol) {
      playback.setVolume(newVol);
    }
  });
});
