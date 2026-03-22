// lib/audio/library.js — Scan music directory and build track index
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const log = require('../logger');

const LIBRARY_PATH = path.join(__dirname, '..', '..', 'musicLibrary.json');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.wma', '.alac']);

let library = [];

function loadLibrary() {
  try {
    library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  } catch {
    library = [];
  }
  return library;
}

function saveLibrary() {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf8');
}

function getMusicDir() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.json'), 'utf8'));
    return config.audio?.musicDir || '/Users/plex/Music/coding';
  } catch {
    return '/Users/plex/Music/coding';
  }
}

// Get metadata from a single file using ffprobe
function findBinary(name) {
  const paths = [name, `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`];
  for (const p of paths) {
    try { require('child_process').execFileSync('which', [p], { stdio: 'pipe' }); return p; } catch {}
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return name;
}

const FFPROBE = findBinary('ffprobe');

function probeFile(filePath) {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const data = JSON.parse(stdout);
        const tags = data.format?.tags || {};
        // Tag keys can be uppercase or lowercase depending on format
        const get = (key) => tags[key] || tags[key.toUpperCase()] || tags[key.toLowerCase()] || '';
        resolve({
          artist: get('artist') || get('ARTIST') || 'Unknown Artist',
          album: get('album') || get('ALBUM') || 'Unknown Album',
          title: get('title') || get('TITLE') || path.basename(filePath, path.extname(filePath)),
          duration: parseFloat(data.format?.duration) || 0,
          track: parseInt(get('track')) || 0,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Recursively find all audio files
function findAudioFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findAudioFiles(fullPath));
      } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    log.warn(`Could not read directory ${dir}: ${err.message}`);
  }
  return results;
}

// Scan music directory and build library
async function rescanLibrary() {
  const musicDir = getMusicDir();
  log.info(`Scanning music directory: ${musicDir}`);

  const files = findAudioFiles(musicDir);
  log.info(`Found ${files.length} audio files`);

  const tracks = [];
  for (const filePath of files) {
    try {
      const meta = await probeFile(filePath);
      tracks.push({
        id: Buffer.from(filePath).toString('base64url'),
        path: filePath,
        artist: meta.artist,
        album: meta.album,
        title: meta.title,
        duration: Math.round(meta.duration),
        track: meta.track,
      });
    } catch (err) {
      log.warn(`Could not probe ${filePath}: ${err.message}`);
      // Add with filename-based metadata
      tracks.push({
        id: Buffer.from(filePath).toString('base64url'),
        path: filePath,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        title: path.basename(filePath, path.extname(filePath)),
        duration: 0,
        track: 0,
      });
    }
  }

  // Sort by artist, album, track number
  tracks.sort((a, b) =>
    a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) ||
    a.track - b.track
  );

  library = tracks;
  saveLibrary();
  log.info(`Library scan complete: ${tracks.length} tracks indexed`);
  return tracks;
}

function getLibrary() {
  if (library.length === 0) loadLibrary();
  return library;
}

function getTrack(trackId) {
  if (library.length === 0) loadLibrary();
  return library.find(t => t.id === trackId) || null;
}

function searchLibrary(query) {
  const q = query.toLowerCase();
  return getLibrary().filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.artist.toLowerCase().includes(q) ||
    t.album.toLowerCase().includes(q)
  );
}

module.exports = { getLibrary, getTrack, rescanLibrary, searchLibrary, getMusicDir };
