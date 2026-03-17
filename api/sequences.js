// api/sequences.js — Chase sequence CRUD and individual sequence chase control
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { startGroupChase, stopGroupChase, updateGroupChaseSpeed, isGroupChaseRunning } = require('../lib/animations/groupChase');

const seqPath = path.join(__dirname, '..', 'sequences.json');

function readSequences() {
  try {
    return JSON.parse(fs.readFileSync(seqPath, 'utf8'));
  } catch {
    return [];
  }
}

function writeSequences(seqs) {
  fs.writeFileSync(seqPath, JSON.stringify(seqs, null, 2) + '\n', 'utf8');
}

// GET /api/sequences
router.get('/', (req, res) => {
  const seqs = readSequences();
  const withStatus = seqs.map(s => ({
    ...s,
    chaseRunning: isGroupChaseRunning(s.id)
  }));
  res.json(withStatus);
});

// POST /api/sequences
router.post('/', (req, res) => {
  const { name, roomId, lightIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!lightIds || !Array.isArray(lightIds) || lightIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 light IDs are required' });
  }

  const seqs = readSequences();
  const seq = {
    id: `seq-${Date.now()}`,
    name,
    roomId: roomId || null,
    lightIds,
    bgColor: '#800080',
    headColor: '#0000ff',
    speed: 1000,
    createdAt: new Date().toISOString()
  };
  seqs.push(seq);
  writeSequences(seqs);
  res.json(seq);
});

// PUT /api/sequences/:id
router.put('/:id', (req, res) => {
  const seqs = readSequences();
  const idx = seqs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sequence not found' });

  const { name, lightIds, bgColor, headColor, speed } = req.body;
  if (name !== undefined) seqs[idx].name = name;
  if (lightIds !== undefined) seqs[idx].lightIds = lightIds;
  if (bgColor !== undefined) seqs[idx].bgColor = bgColor;
  if (headColor !== undefined) seqs[idx].headColor = headColor;
  if (speed !== undefined) seqs[idx].speed = speed;

  writeSequences(seqs);
  res.json(seqs[idx]);
});

// DELETE /api/sequences/:id
router.delete('/:id', (req, res) => {
  stopGroupChase(req.params.id);
  let seqs = readSequences();
  seqs = seqs.filter(s => s.id !== req.params.id);
  writeSequences(seqs);
  res.json({ success: true });
});

// PUT /api/sequences/:id/chase/start
router.put('/:id/chase/start', (req, res) => {
  const seqs = readSequences();
  const seq = seqs.find(s => s.id === req.params.id);
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const speed = req.body.speed || seq.speed || 1000;
  const bgColor = req.body.bgColor || seq.bgColor || '#800080';
  const headColor = req.body.headColor || seq.headColor || '#0000ff';

  try {
    startGroupChase(seq.id, seq.lightIds, speed, bgColor, headColor);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/sequences/:id/chase/stop
router.put('/:id/chase/stop', (req, res) => {
  stopGroupChase(req.params.id);
  res.json({ success: true });
});

// PUT /api/sequences/:id/chase/speed
router.put('/:id/chase/speed', (req, res) => {
  const { speed } = req.body;
  if (!speed || speed < 100 || speed > 30000) {
    return res.status(400).json({ error: 'Speed must be 100-30000ms' });
  }
  updateGroupChaseSpeed(req.params.id, speed);

  const seqs = readSequences();
  const seq = seqs.find(s => s.id === req.params.id);
  if (seq) {
    seq.speed = speed;
    writeSequences(seqs);
  }

  res.json({ success: true });
});

module.exports = router;
