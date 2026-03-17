// lib/logger.js — Simple file + console logger
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
const logFile = path.join(logsDir, 'hue-lines.log');

// Ensure logs directory exists
try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function rotateIfNeeded() {
  try {
    const stats = fs.statSync(logFile);
    if (stats.size > MAX_LOG_SIZE) {
      const backup = logFile + '.old';
      try { fs.unlinkSync(backup); } catch {}
      fs.renameSync(logFile, backup);
    }
  } catch {}
}

function write(level, msg) {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${msg}\n`;

  // Write to file
  try {
    rotateIfNeeded();
    fs.appendFileSync(logFile, line);
  } catch {}

  // Also write to console for development
  if (level === 'ERROR') console.error(line.trim());
  else if (level === 'WARN') console.warn(line.trim());
  else console.log(line.trim());
}

module.exports = {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg)
};
