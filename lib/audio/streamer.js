// lib/audio/streamer.js — AirPlay audio streaming to HomePod
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const log = require('../logger');

let airplaySender;
try {
  airplaySender = require('@lox-audioserver/node-airplay-sender');
} catch (err) {
  log.warn('@lox-audioserver/node-airplay-sender not installed — audio streaming disabled');
}

function findBinary(name) {
  const paths = [name, `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`];
  for (const p of paths) {
    try { require('child_process').execFileSync('which', [p], { stdio: 'pipe' }); return p; } catch {}
    try { require('fs').accessSync(p, require('fs').constants.X_OK); return p; } catch {}
  }
  return name;
}

const FFMPEG = findBinary('ffmpeg');

class AudioStreamer extends EventEmitter {
  constructor() {
    super();
    this.sender = null;
    this.ffmpeg = null;
    this.playing = false;
    this.paused = false;
    this.currentTrack = null;
    this.volume = 50;
    this._connected = false;
    this._trackTimer = null;
    this._trackStartTime = null;
  }

  getHomePodConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.json'), 'utf8'));
      return config.audio?.homepod || { ip: '192.168.0.28', name: 'Office' };
    } catch {
      return { ip: '192.168.0.28', name: 'Office' };
    }
  }

  // Connect to HomePod
  async connect() {
    if (!airplaySender) throw new Error('AirPlay sender is not installed');
    if (this._connected && this.sender) return;

    const homepod = this.getHomePodConfig();
    log.info(`Connecting to HomePod "${homepod.name}" at ${homepod.ip}...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Resolve anyway after timeout — connection may work even without explicit ready
        this._connected = true;
        resolve();
      }, 5000);

      this.sender = airplaySender.start(
        {
          host: homepod.ip,
          port: 7000,
          airplay2: true,
          volume: this.volume,
          name: 'Hue Lines',
          log: (level, msg) => {
            if (level === 'error') log.error(`AirPlay: ${msg}`);
          },
        },
        (event) => {
          if (event.event === 'device' && (event.message === 'ready' || event.message === 'playing')) {
            this._connected = true;
            clearTimeout(timeout);
            resolve();
          } else if (event.event === 'error') {
            log.error(`HomePod error: ${event.message}`);
          }
        }
      );
    });
  }

  // Stream a single audio file — returns a promise that resolves when the track
  // finishes playing (based on duration), not when ffmpeg finishes decoding.
  async streamFile(trackInfo) {
    if (!this.sender) await this.connect();

    // Stop any current playback
    this._stopFfmpeg();
    this._clearTrackTimer();

    this.currentTrack = trackInfo;
    this.playing = true;
    this.paused = false;
    this._trackStartTime = Date.now();

    log.info(`Streaming: ${trackInfo.artist} - ${trackInfo.title} (${trackInfo.duration}s)`);
    this.emit('trackStarted', trackInfo);

    // Set metadata on the HomePod
    if (this.sender.setMetadata) {
      this.sender.setMetadata({
        title: trackInfo.title,
        artist: trackInfo.artist,
        album: trackInfo.album,
        durationMs: (trackInfo.duration || 0) * 1000,
        elapsedMs: 0,
      });
    }

    // Decode audio to raw PCM via ffmpeg
    this.ffmpeg = spawn(FFMPEG, [
      '-i', trackInfo.path,
      '-f', 's16le',
      '-ar', '44100',
      '-ac', '2',
      '-acodec', 'pcm_s16le',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Feed PCM chunks to the sender manually (don't use pipeStream)
    this.ffmpeg.stdout.on('data', (chunk) => {
      if (this.sender && this.playing) {
        this.sender.sendPcm(chunk);
      }
    });

    this.ffmpeg.stderr.on('data', () => {});

    this.ffmpeg.on('error', (err) => {
      log.error(`ffmpeg error: ${err.message}`);
    });

    // Return a promise that resolves when the track duration elapses
    return new Promise((resolve) => {
      const durationMs = (trackInfo.duration || 180) * 1000;
      // Add a small buffer (2s) to let audio finish playing on the HomePod
      const waitMs = durationMs + 2000;

      this._trackTimer = setTimeout(() => {
        this._trackTimer = null;
        if (this.playing && this.currentTrack?.id === trackInfo.id) {
          log.info(`Track finished: ${trackInfo.title}`);
          this.emit('trackEnded', trackInfo);
          resolve('ended');
        } else {
          resolve('stopped');
        }
      }, waitMs);
    });
  }

  _stopFfmpeg() {
    if (this.ffmpeg) {
      this.ffmpeg.stdout.removeAllListeners('data');
      this.ffmpeg.kill('SIGTERM');
      this.ffmpeg = null;
    }
  }

  _clearTrackTimer() {
    if (this._trackTimer) {
      clearTimeout(this._trackTimer);
      this._trackTimer = null;
    }
  }

  stop() {
    this.playing = false;
    this.paused = false;
    this._stopFfmpeg();
    this._clearTrackTimer();

    if (this.sender) {
      try { this.sender.stop(); } catch (err) {
        log.warn(`AirPlay stop error: ${err.message}`);
      }
      this.sender = null;
      this._connected = false;
    }

    this.currentTrack = null;
    this._trackStartTime = null;
    this.emit('stopped');
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.sender) {
      this.sender.setVolume(this.volume);
    }
  }

  getStatus() {
    let elapsed = null;
    if (this._trackStartTime && this.playing) {
      elapsed = Math.floor((Date.now() - this._trackStartTime) / 1000);
    }
    return {
      playing: this.playing,
      paused: this.paused,
      currentTrack: this.currentTrack,
      volume: this.volume,
      connected: this._connected,
      elapsed,
    };
  }
}

// Singleton
const streamer = new AudioStreamer();

module.exports = streamer;
