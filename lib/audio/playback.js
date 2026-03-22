// lib/audio/playback.js — High-level playback controller (queue + streamer)
const streamer = require('./streamer');
const { getTrack } = require('./library');
const { getPlaylist, PlaybackQueue } = require('./playlist');
const log = require('../logger');

let queue = null;
let shuffled = false;
let currentPlaylistId = null;
let generation = 0; // incremented on each play/skip/prev to cancel stale loops

// Start playing a playlist from the beginning (or a specific track index)
async function play(playlistId, { trackIndex = 0, shuffle = false } = {}) {
  const playlist = getPlaylist(playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
  if (playlist.trackIds.length === 0) throw new Error('Playlist is empty');

  // Cancel any current playback
  generation++;
  streamer._stopFfmpeg();
  streamer._clearTrackTimer();

  currentPlaylistId = playlistId;
  shuffled = shuffle;
  queue = new PlaybackQueue(playlist.trackIds, shuffled);
  if (trackIndex > 0) queue.jumpTo(trackIndex);

  playLoop(generation);
}

// Play tracks sequentially until the queue is exhausted or stopped
async function playLoop(gen) {
  while (queue && gen === generation) {
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

    // If this loop is stale (new play/skip/prev started), exit silently
    if (gen !== generation) return;

    // If stopped or skipped externally, exit this loop
    if (result === 'skipped' || result === 'stopped') return;

    // Track ended naturally — advance to next
    if (result === 'ended') {
      queue.nextTrackId();
    }
  }
}

async function skip() {
  if (!queue) return;
  queue.nextTrackId();
  generation++;
  streamer._stopFfmpeg();
  streamer._clearTrackTimer();
  playLoop(generation);
}

async function prev() {
  if (!queue) return;
  queue.prevTrackId();
  generation++;
  streamer._stopFfmpeg();
  streamer._clearTrackTimer();
  playLoop(generation);
}

function stop() {
  generation++;
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
