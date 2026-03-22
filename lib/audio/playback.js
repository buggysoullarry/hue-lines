// lib/audio/playback.js — High-level playback controller (queue + streamer)
const streamer = require('./streamer');
const { getTrack } = require('./library');
const { getPlaylist, PlaybackQueue } = require('./playlist');
const log = require('../logger');

let queue = null;
let shuffled = false;
let currentPlaylistId = null;

// Start playing a playlist from the beginning (or a specific track index)
async function play(playlistId, { trackIndex = 0, shuffle = false } = {}) {
  const playlist = getPlaylist(playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
  if (playlist.trackIds.length === 0) throw new Error('Playlist is empty');

  // Stop any current playback first
  streamer.stop();

  currentPlaylistId = playlistId;
  shuffled = shuffle;
  queue = new PlaybackQueue(playlist.trackIds, shuffled);
  if (trackIndex > 0) queue.jumpTo(trackIndex);

  // Don't await — let it play in the background
  playLoop();
}

// Play tracks sequentially until the queue is exhausted or stopped
async function playLoop() {
  while (queue) {
    const trackId = queue.currentTrackId();
    if (!trackId) {
      log.info('Playback complete — end of playlist');
      stop();
      return;
    }

    const track = getTrack(trackId);
    if (!track) {
      log.warn(`Track ${trackId} not found in library, skipping`);
      queue.nextTrackId();
      continue;
    }

    const result = await streamer.streamFile(track);

    // If stopped externally (skip, stop, etc.), the loop will exit
    if (result !== 'ended') return;

    // Advance to next track
    queue.nextTrackId();
  }
}

async function skip() {
  if (!queue) return;
  queue.nextTrackId();
  // Stop current track (breaks the playLoop await), then restart the loop
  streamer._stopFfmpeg();
  streamer._clearTrackTimer();
  playLoop();
}

async function prev() {
  if (!queue) return;
  queue.prevTrackId();
  streamer._stopFfmpeg();
  streamer._clearTrackTimer();
  playLoop();
}

function stop() {
  queue = null;
  currentPlaylistId = null;
  shuffled = false;
  streamer.stop();
}

function setVolume(vol) {
  streamer.setVolume(vol);
}

function setShuffle(enabled) {
  shuffled = enabled;
  if (queue) {
    if (enabled) queue.shuffle();
    else queue.unshuffle();
  }
}

function setRepeat(mode) {
  if (queue) queue.setRepeat(mode);
}

function getStatus() {
  const s = streamer.getStatus();
  return {
    ...s,
    playlistId: currentPlaylistId,
    queuePosition: queue ? queue.position : null,
    queueLength: queue ? queue.length : null,
    shuffle: shuffled,
    repeat: queue ? queue.repeat : 'all',
  };
}

module.exports = { play, skip, prev, stop, setVolume, setShuffle, setRepeat, getStatus };
