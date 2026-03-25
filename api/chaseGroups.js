// api/chaseGroups.js — Chase group CRUD and unified chase control
// A chase group contains chase sequences and/or strips, with shared settings.
// When activated, it pushes its settings to all members and handles conflicts.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { startGroupChase, stopGroupChase, updateGroupChaseSpeed, isGroupChaseRunning } = require('../lib/animations/groupChase');
const { startChase, stopChase, updateChaseSpeed, updateChaseColors, isStripChaseRunning } = require('../lib/animations/omniglowChase');
const { getLightV2, setLightColor, setLightOn } = require('../lib/hue');
const log = require('../lib/logger');
const playback = require('../lib/audio/playback');
const { snapshotLightStates, restoreLightStates } = require('../lib/lightSnapshot');

const cgPath = path.join(__dirname, '..', 'chaseGroups.json');
const seqPath = path.join(__dirname, '..', 'sequences.json');
const buttonStatePath = path.join(__dirname, '..', 'buttonState.json');

function setButtonState(cgId, running) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(buttonStatePath, 'utf8')); } catch {}
  state[cgId] = running;
  fs.writeFileSync(buttonStatePath, JSON.stringify(state), 'utf8');
}

// Track which chase group is active for each member (for conflict resolution)
// memberId -> chaseGroupId
const activeMembership = new Map();

function readChaseGroups() {
  try { return JSON.parse(fs.readFileSync(cgPath, 'utf8')); }
  catch { return []; }
}

function writeChaseGroups(cgs) {
  fs.writeFileSync(cgPath, JSON.stringify(cgs, null, 2) + '\n', 'utf8');
}

function readSequences() {
  try { return JSON.parse(fs.readFileSync(seqPath, 'utf8')); }
  catch { return []; }
}

// Get all light IDs involved in a chase group
function getChaseGroupLightIds(chaseGroup) {
  const seqs = readSequences();
  const lightIds = new Set();

  for (const member of chaseGroup.members) {
    if (member.type === 'sequence') {
      const seq = seqs.find(s => s.id === member.id);
      if (seq) seq.lightIds.forEach(id => lightIds.add(id));
    } else if (member.type === 'strip') {
      lightIds.add(member.id);
    }
  }
  return [...lightIds];
}

// snapshotLightStates and restoreLightStates are in lib/lightSnapshot.js

// Stop any chase groups that conflict with the given members
function resolveConflicts(chaseGroupId, members) {
  const conflictingGroups = new Set();

  for (const member of members) {
    const activeGroup = activeMembership.get(member.id);
    if (activeGroup && activeGroup !== chaseGroupId) {
      conflictingGroups.add(activeGroup);
    }
  }

  for (const conflictId of conflictingGroups) {
    log.info(`Conflict: stopping chase group ${conflictId} (overlap with ${chaseGroupId})`);
    stopChaseGroupById(conflictId);
  }
}

// Stop a chase group by ID (used internally for conflict resolution)
function stopChaseGroupById(chaseGroupId) {
  const cgs = readChaseGroups();
  const cg = cgs.find(g => g.id === chaseGroupId);
  if (!cg) return;

  const seqs = readSequences();

  for (const member of cg.members) {
    if (member.type === 'sequence') {
      stopGroupChase(member.id);
    } else if (member.type === 'strip') {
      stopChase(member.id);
    }
    activeMembership.delete(member.id);
  }

  // Restore states
  restoreLightStates(chaseGroupId);
}

// PUT /api/chase-groups/stop-all — Stop everything (must be before /:id routes)
router.put('/stop-all', async (req, res) => {
  const cgs = readChaseGroups();
  for (const cg of cgs) {
    for (const member of cg.members) {
      if (member.type === 'sequence') stopGroupChase(member.id);
      else if (member.type === 'strip') stopChase(member.id);
      activeMembership.delete(member.id);
    }
    await restoreLightStates(cg.id);
  }
  // Stop any music playback
  playback.stop();
  res.json({ success: true });
});

// PUT /api/chase-groups/play-all — Start all chase groups
router.put('/play-all', async (req, res) => {
  const cgs = readChaseGroups();
  const seqs = readSequences();
  const errors = [];

  for (const cg of cgs) {
    // Skip if already running
    const alreadyRunning = cg.members.every(m => {
      if (m.type === 'sequence') return isGroupChaseRunning(m.id);
      if (m.type === 'strip') return isStripChaseRunning(m.id);
      return false;
    });
    if (alreadyRunning) continue;

    const speed = cg.speed || 1000;
    const bgColor = cg.bgColor || '#800080';
    const headColor = cg.headColor || '#0000ff';

    // Snapshot light states
    const lightIds = getChaseGroupLightIds(cg);
    await snapshotLightStates(cg.id, lightIds);

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
        errors.push(`${member.id}: ${err.message}`);
      }
    }
  }

  // Play the playlist from the first chase group that has one
  const firstWithPlaylist = cgs.find(cg => cg.playlistId);
  if (firstWithPlaylist) {
    try {
      playback.play(firstWithPlaylist.playlistId, { shuffle: true });
      log.info(`Started playlist ${firstWithPlaylist.playlistId} from chase group ${firstWithPlaylist.name}`);
    } catch (err) {
      errors.push(`playlist: ${err.message}`);
    }
  }

  res.json({ success: true, ...(errors.length && { warnings: errors }) });
});

// GET /api/chase-groups
router.get('/', (req, res) => {
  const cgs = readChaseGroups();
  const seqs = readSequences();

  const withStatus = cgs.map(cg => {
    // A chase group is "running" if any of its members are running
    const running = cg.members.some(m => {
      if (m.type === 'sequence') return isGroupChaseRunning(m.id);
      if (m.type === 'strip') return isStripChaseRunning(m.id);
      return false;
    });

    // Resolve member names
    const resolvedMembers = cg.members.map(m => {
      if (m.type === 'sequence') {
        const seq = seqs.find(s => s.id === m.id);
        return { ...m, name: seq?.name || m.name || 'Unknown', lightCount: seq?.lightIds?.length || 0 };
      }
      // Strip — use saved name, fall back to ID
      return { ...m, name: m.name || m.id };
    });

    return { ...cg, members: resolvedMembers, running };
  });

  res.json(withStatus);
});

// POST /api/chase-groups
router.post('/', (req, res) => {
  const { name, members } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!members || !Array.isArray(members) || members.length < 1) {
    return res.status(400).json({ error: 'At least 1 member is required' });
  }

  const cgs = readChaseGroups();
  const cg = {
    id: `cg-${Date.now()}`,
    name,
    members, // [{ type: 'sequence'|'strip', id: '...' }]
    bgColor: '#800080',
    headColor: '#0000ff',
    speed: 1000,
    createdAt: new Date().toISOString()
  };
  cgs.push(cg);
  writeChaseGroups(cgs);
  res.json(cg);
});

// PUT /api/chase-groups/:id
router.put('/:id', (req, res) => {
  const cgs = readChaseGroups();
  const idx = cgs.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Chase group not found' });

  const { name, members, bgColor, headColor, speed, playlistId, buttonId } = req.body;
  if (name !== undefined) cgs[idx].name = name;
  if (members !== undefined) cgs[idx].members = members;
  if (bgColor !== undefined) cgs[idx].bgColor = bgColor;
  if (headColor !== undefined) cgs[idx].headColor = headColor;
  if (speed !== undefined) cgs[idx].speed = speed;
  if (playlistId !== undefined) cgs[idx].playlistId = playlistId || null;
  if (buttonId !== undefined) cgs[idx].buttonId = buttonId || null;

  writeChaseGroups(cgs);
  res.json(cgs[idx]);
});

// DELETE /api/chase-groups/:id
router.delete('/:id', (req, res) => {
  stopChaseGroupById(req.params.id);
  let cgs = readChaseGroups();
  cgs = cgs.filter(g => g.id !== req.params.id);
  writeChaseGroups(cgs);
  res.json({ success: true });
});

// PUT /api/chase-groups/:id/play — Start all members with group settings
router.put('/:id/play', async (req, res) => {
  const cgs = readChaseGroups();
  const cg = cgs.find(g => g.id === req.params.id);
  if (!cg) return res.status(404).json({ error: 'Chase group not found' });

  const seqs = readSequences();
  const speed = req.body.speed || cg.speed || 1000;
  const bgColor = req.body.bgColor || cg.bgColor || '#800080';
  const headColor = req.body.headColor || cg.headColor || '#0000ff';

  // Resolve conflicts first
  resolveConflicts(cg.id, cg.members);

  // Snapshot light states before starting
  const lightIds = getChaseGroupLightIds(cg);
  await snapshotLightStates(cg.id, lightIds);

  // Ensure all lights are on before starting chase
  for (const lightId of lightIds) {
    try { await setLightOn(lightId); } catch {}
  }

  // Start all members with the group's settings
  const errors = [];
  for (const member of cg.members) {
    try {
      if (member.type === 'sequence') {
        const seq = seqs.find(s => s.id === member.id);
        if (seq) {
          // Stop any individual chase on this sequence first
          stopGroupChase(seq.id);
          startGroupChase(seq.id, seq.lightIds, speed, bgColor, headColor);
        }
      } else if (member.type === 'strip') {
        stopChase(member.id);
        await startChase(member.id, speed, bgColor, headColor);
      }
      activeMembership.set(member.id, cg.id);
    } catch (err) {
      errors.push(`${member.id}: ${err.message}`);
    }
  }

  // Start linked playlist if one is set
  if (cg.playlistId) {
    try {
      playback.play(cg.playlistId, { shuffle: true });
      log.info(`Started playlist ${cg.playlistId} for chase group ${cg.name}`);
    } catch (err) {
      errors.push(`playlist: ${err.message}`);
    }
  }

  setButtonState(cg.id, true);

  if (errors.length) {
    res.json({ success: true, warnings: errors });
  } else {
    res.json({ success: true });
  }
});

// PUT /api/chase-groups/:id/stop — Stop all members and restore states
router.put('/:id/stop', async (req, res) => {
  const cgs = readChaseGroups();
  const cg = cgs.find(g => g.id === req.params.id);
  if (!cg) return res.status(404).json({ error: 'Chase group not found' });

  for (const member of cg.members) {
    if (member.type === 'sequence') {
      stopGroupChase(member.id);
    } else if (member.type === 'strip') {
      stopChase(member.id);
    }
    activeMembership.delete(member.id);
  }

  // Stop music if this chase group had a playlist
  if (cg.playlistId) {
    playback.stop();
  }

  setButtonState(cg.id, false);

  await restoreLightStates(cg.id);
  res.json({ success: true });
});

// PUT /api/chase-groups/:id/speed — Update speed for all running members
router.put('/:id/speed', (req, res) => {
  const { speed } = req.body;
  if (!speed || speed < 100 || speed > 30000) {
    return res.status(400).json({ error: 'Speed must be 100-30000ms' });
  }

  const cgs = readChaseGroups();
  const cg = cgs.find(g => g.id === req.params.id);
  if (!cg) return res.status(404).json({ error: 'Chase group not found' });

  const seqs = readSequences();

  for (const member of cg.members) {
    if (member.type === 'sequence') {
      updateGroupChaseSpeed(member.id, speed);
    } else if (member.type === 'strip') {
      updateChaseSpeed(member.id, speed);
    }
  }

  // Persist
  cg.speed = speed;
  writeChaseGroups(cgs);
  res.json({ success: true });
});

// PUT /api/chase-groups/:id/colors — Update colors for all running members
router.put('/:id/colors', (req, res) => {
  const { bgColor, headColor } = req.body;

  const cgs = readChaseGroups();
  const cg = cgs.find(g => g.id === req.params.id);
  if (!cg) return res.status(404).json({ error: 'Chase group not found' });

  if (bgColor !== undefined) cg.bgColor = bgColor;
  if (headColor !== undefined) cg.headColor = headColor;
  writeChaseGroups(cgs);

  // Update running members — need to restart them with new colors
  const seqs = readSequences();
  for (const member of cg.members) {
    if (member.type === 'sequence') {
      if (isGroupChaseRunning(member.id)) {
        const seq = seqs.find(s => s.id === member.id);
        if (seq) {
          stopGroupChase(member.id);
          startGroupChase(member.id, seq.lightIds, cg.speed, cg.bgColor, cg.headColor);
        }
      }
    } else if (member.type === 'strip') {
      if (isStripChaseRunning(member.id)) {
        updateChaseColors(member.id, cg.bgColor, cg.headColor);
      }
    }
  }

  res.json({ success: true });
});

module.exports = router;
