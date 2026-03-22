// lib/auth.js — Authentication middleware with rate limiting
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions.json');
const SESSION_COOKIE = 'hue_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// File-backed session store — survives server restarts
let sessions = new Map();

function loadSessions() {
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    sessions = new Map(Object.entries(data));
    // Purge expired sessions on load
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (now - session.created > SESSION_MAX_AGE) sessions.delete(token);
    }
  } catch {
    sessions = new Map();
  }
}

function saveSessions() {
  const obj = Object.fromEntries(sessions);
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

// Load on startup
loadSessions();

// Rate limiting: track failed attempts by IP
const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getPasswordHash() {
  const config = getConfig();
  return config.auth?.passwordHash || null;
}

function setPassword(plaintext) {
  const config = getConfig();
  const hash = bcrypt.hashSync(plaintext, 12);
  config.auth = config.auth || {};
  config.auth.passwordHash = hash;
  saveConfig(config);
  return hash;
}

function isRateLimited(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (record.count >= MAX_ATTEMPTS) {
    const elapsed = Date.now() - record.lastAttempt;
    if (elapsed < LOCKOUT_DURATION) {
      return true;
    }
    // Lockout expired, reset
    failedAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(ip) {
  const record = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now() });
  saveSessions();
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.created > SESSION_MAX_AGE) {
    sessions.delete(token);
    saveSessions();
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
  saveSessions();
}

// Public paths that don't require auth
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/status',
  '/api/health',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/site.webmanifest',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
];

function authMiddleware(req, res, next) {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

  // No password set = no auth required (first-time setup)
  if (!getPasswordHash()) {
    return next();
  }

  // Check session cookie
  const token = req.cookies?.[SESSION_COOKIE];
  if (isValidSession(token)) {
    return next();
  }

  // Not authenticated
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Redirect to login page
  res.redirect('/login');
}

module.exports = {
  cookieParser,
  authMiddleware,
  getPasswordHash,
  setPassword,
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
  createSession,
  destroySession,
  isValidSession,
  SESSION_COOKIE,
};
