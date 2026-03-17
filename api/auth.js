// api/auth.js — Login/logout API routes
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const {
  getPasswordHash,
  setPassword,
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
  createSession,
  destroySession,
  isValidSession,
  SESSION_COOKIE,
} = require('../lib/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many failed attempts. Try again in 15 minutes.'
    });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  const hash = getPasswordHash();

  // First-time setup: no password set yet
  if (!hash) {
    setPassword(password);
    const token = createSession();
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ success: true, message: 'Password created' });
  }

  // Verify password
  if (bcrypt.compareSync(password, hash)) {
    clearFailedAttempts(ip);
    const token = createSession();
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ success: true });
  }

  recordFailedAttempt(ip);
  return res.status(401).json({ error: 'Wrong password' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// GET /api/auth/status
router.get('/status', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const authenticated = isValidSession(token);
  const hasPassword = !!getPasswordHash();
  res.json({ authenticated, hasPassword });
});

module.exports = router;
