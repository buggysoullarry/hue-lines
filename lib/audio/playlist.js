// lib/audio/playlist.js — Playlist CRUD and queue management
const fs = require('fs');
const path = require('path');

const PLAYLISTS_PATH = path.join(__dirname, '..', '..', 'playlists.json');

function readPlaylists() {
  try { return JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf8')); }
  catch { return []; }
}

function writePlaylists(playlists) {
  fs.writeFileSync(PLAYLISTS_PATH, JSON.stringify(playlists, null, 2) + '\n', 'utf8');
}

function getPlaylists() {
  return readPlaylists();
}

function getPlaylist(id) {
  return readPlaylists().find(p => p.id === id) || null;
}

let _playlistCounter = 0;

function createPlaylist(name, trackIds = [], folder = null) {
  const playlists = readPlaylists();
  const playlist = {
    id: `pl-${Date.now()}-${++_playlistCounter}`,
    name,
    trackIds,
    folder,  // if set, this playlist is auto-managed from a folder
    createdAt: new Date().toISOString(),
  };
  playlists.push(playlist);
  writePlaylists(playlists);
  return playlist;
}

function updatePlaylist(id, updates) {
  const playlists = readPlaylists();
  const idx = playlists.findIndex(p => p.id === id);
  if (idx === -1) return null;

  if (updates.name !== undefined) playlists[idx].name = updates.name;
  if (updates.trackIds !== undefined) playlists[idx].trackIds = updates.trackIds;
  writePlaylists(playlists);
  return playlists[idx];
}

function deletePlaylist(id) {
  const playlists = readPlaylists();
  const filtered = playlists.filter(p => p.id !== id);
  if (filtered.length === playlists.length) return false;
  writePlaylists(filtered);
  return true;
}

// Queue — in-memory playback state for a playlist
class PlaybackQueue {
  constructor(trackIds, shuffle = false) {
    this.originalOrder = [...trackIds];
    this.queue = [...trackIds];
    this.index = 0;
    this.repeat = 'all'; // 'none' | 'all' | 'one'
    if (shuffle) this.fullShuffle();
  }

  currentTrackId() {
    if (this.index < 0 || this.index >= this.queue.length) return null;
    return this.queue[this.index];
  }

  nextTrackId() {
    if (this.repeat === 'one') return this.currentTrackId();

    this.index++;
    if (this.index >= this.queue.length) {
      if (this.repeat === 'all') {
        this.index = 0;
      } else {
        return null; // end of playlist
      }
    }
    return this.currentTrackId();
  }

  prevTrackId() {
    this.index = Math.max(0, this.index - 1);
    return this.currentTrackId();
  }

  // Full shuffle — randomize entire queue (used when starting fresh)
  fullShuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.index = 0;
  }

  // Shuffle keeping current track at position 0 (used mid-playback)
  shuffle() {
    const current = this.currentTrackId();
    const rest = this.queue.filter((_, i) => i !== this.index);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = current ? [current, ...rest] : rest;
    this.index = 0;
  }

  unshuffle() {
    const current = this.currentTrackId();
    this.queue = [...this.originalOrder];
    this.index = current ? Math.max(0, this.queue.indexOf(current)) : 0;
  }

  setRepeat(mode) {
    this.repeat = mode;
  }

  jumpTo(index) {
    if (index >= 0 && index < this.queue.length) {
      this.index = index;
      return this.currentTrackId();
    }
    return null;
  }

  get length() { return this.queue.length; }
  get position() { return this.index; }
}

module.exports = {
  getPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist,
  PlaybackQueue,
};
