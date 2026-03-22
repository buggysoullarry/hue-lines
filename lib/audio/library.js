// lib/audio/library.js — Scan music directory and build track index + folder-based playlists
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const log = require('../logger');
const { getPlaylists, createPlaylist, updatePlaylist, deletePlaylist } = require('./playlist');

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

// Find audio files, returning { filePath, folder } where folder is the immediate subfolder name
function findAudioFiles(musicDir) {
  const results = [];

  function scan(dir, folderName) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // If we're at the top level, this directory name becomes the folder/playlist name
          // If we're already in a subfolder, keep the same folder name
          const name = folderName || entry.name;
          scan(fullPath, name);
        } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          results.push({ filePath: fullPath, folder: folderName || null });
        }
      }
    } catch (err) {
      log.warn(`Could not read directory ${dir}: ${err.message}`);
    }
  }

  scan(musicDir, null);
  return results;
}

// Scan music directory, build library, and auto-create playlists from subfolders
async function rescanLibrary() {
  const musicDir = getMusicDir();
  log.info(`Scanning music directory: ${musicDir}`);

  const files = findAudioFiles(musicDir);
  log.info(`Found ${files.length} audio files`);

  const tracks = [];
  const folderTracks = {}; // folderName -> [trackId]

  for (const { filePath, folder } of files) {
    let meta;
    try {
      meta = await probeFile(filePath);
    } catch (err) {
      log.warn(`Could not probe ${filePath}: ${err.message}`);
      meta = {
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        title: path.basename(filePath, path.extname(filePath)),
        duration: 0,
        track: 0,
      };
    }

    const track = {
      id: Buffer.from(filePath).toString('base64url'),
      path: filePath,
      folder: folder,
      artist: meta.artist,
      album: meta.album,
      title: meta.title,
      duration: Math.round(meta.duration),
      track: meta.track,
    };
    tracks.push(track);

    if (folder) {
      if (!folderTracks[folder]) folderTracks[folder] = [];
      folderTracks[folder].push(track.id);
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

  // Sync folder-based playlists
  syncFolderPlaylists(folderTracks);

  log.info(`Library scan complete: ${tracks.length} tracks indexed, ${Object.keys(folderTracks).length} playlists from folders`);
  return tracks;
}

// Create/update/remove playlists to match folder structure
function syncFolderPlaylists(folderTracks) {
  const existing = getPlaylists();
  const folderNames = Object.keys(folderTracks);

  // Update or create playlists for each folder
  for (const folder of folderNames) {
    const trackIds = folderTracks[folder];
    const match = existing.find(p => p.folder === folder);
    if (match) {
      // Update track list if changed
      updatePlaylist(match.id, { trackIds });
      log.info(`Updated playlist "${folder}" (${trackIds.length} tracks)`);
    } else {
      // Create new folder-based playlist
      createPlaylist(folder, trackIds, folder);
      log.info(`Created playlist "${folder}" (${trackIds.length} tracks)`);
    }
  }

  // Remove folder-based playlists whose folders no longer exist
  for (const pl of existing) {
    if (pl.folder && !folderNames.includes(pl.folder)) {
      deletePlaylist(pl.id);
      log.info(`Removed playlist "${pl.name}" (folder "${pl.folder}" no longer exists)`);
    }
  }
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
