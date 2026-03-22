// lib/audio/playback.js — High-level playback controller (queue + streamer)
const streamer = require('./streamer');
const { getTrack } = require('./library');
const { getPlaylist, PlaybackQueue } = require('./playlist');
const log = require('../logger');

let queue = null;
let shuffled = false;

// Start playing a playlist from the beginning (or a specific track index)
async function play(playlistId, trackIndex = 0) {
  const playlist = getPlaylist(playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
  if (playlist.trackIds.length === 0) throw new Error('Playlist is empty');

  queue = new PlaybackQueue(playlist.trackIds, shuffled);
  if (trackIndex > 0) queue.jumpTo(trackIndex);

  await playCurrentTrack();
}

async function playCurrentTrack() {
  if (!queue) return;

  const trackId = queue.currentTrackId();
  if (!trackId) {
    log.info('Playback complete — end of playlist');
    streamer.stop();
    return;
  }

  const track = getTrack(trackId);
  if (!track) {
    log.warn(`Track ${trackId} not found in library, skipping`);
    return skip();
  }

  const result = await streamer.streamFile(track);

  // If track ended naturally, advance to next
  if (result === 'ended') {
    await playCurrentTrack();
  }
}

// Listen for trackEnded to auto-advance
streamer.on('trackEnded', async () => {
  if (queue) {
    const nextId = queue.nextTrackId();
    if (nextId) {
      await playCurrentTrack();
    } else {
      log.info('Playlist finished');
      streamer.stop();
    }
  }
});

async function skip() {
  if (!queue) return;
  queue.nextTrackId();
  await playCurrentTrack();
}

async function prev() {
  if (!queue) return;
  queue.prevTrackId();
  await playCurrentTrack();
}

function stop() {
  queue = null;
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
    queuePosition: queue ? queue.position : null,
    queueLength: queue ? queue.length : null,
    shuffle: shuffled,
    repeat: queue ? queue.repeat : 'all',
  };
}

module.exports = { play, skip, prev, stop, setVolume, setShuffle, setRepeat, getStatus };
