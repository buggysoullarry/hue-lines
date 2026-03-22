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
        reject(new Error('Connection to HomePod timed out'));
      }, 15000);

      this.sender = airplaySender.start(
        {
          host: homepod.ip,
          port: 7000,
          airplay2: true,
          volume: this.volume,
          name: 'Hue Lines',
          log: (level, msg) => {
            if (level === 'error') log.error(`AirPlay: ${msg}`);
            else log.info(`AirPlay: ${msg}`);
          },
        },
        (event) => {
          if (event.event === 'device') {
            log.info(`HomePod: ${event.message}`);
            if (event.message === 'ready' || event.message === 'playing') {
              this._connected = true;
              clearTimeout(timeout);
              resolve();
            }
          } else if (event.event === 'buffer') {
            if (event.message === 'playing') {
              this._connected = true;
              clearTimeout(timeout);
              resolve();
            }
          } else if (event.event === 'error') {
            log.error(`HomePod error: ${event.message}`);
            clearTimeout(timeout);
            reject(new Error(event.message));
          }
        }
      );

      // Also resolve after a brief delay if no explicit ready event
      setTimeout(() => {
        if (!this._connected) {
          this._connected = true;
          clearTimeout(timeout);
          resolve();
        }
      }, 3000);
    });
  }

  // Stream a single audio file
  async streamFile(trackInfo) {
    if (!this.sender) await this.connect();

    // Stop any current ffmpeg process
    this._stopFfmpeg();

    this.currentTrack = trackInfo;
    this.playing = true;
    this.paused = false;

    log.info(`Streaming: ${trackInfo.artist} - ${trackInfo.title}`);
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

    return new Promise((resolve, reject) => {
      // Decode audio to raw PCM (16-bit LE, 44100Hz, stereo) via ffmpeg
      this.ffmpeg = spawn(FFMPEG, [
        '-i', trackInfo.path,
        '-f', 's16le',
        '-ar', '44100',
        '-ac', '2',
        '-acodec', 'pcm_s16le',
        'pipe:1'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      // Pipe PCM data to AirPlay sender
      this.sender.pipeStream(this.ffmpeg.stdout);

      this.ffmpeg.stderr.on('data', () => {
        // ffmpeg writes progress to stderr, ignore it
      });

      this.ffmpeg.on('close', (code) => {
        this.ffmpeg = null;
        if (this.playing && !this.paused) {
          log.info(`Track ended: ${trackInfo.title}`);
          this.emit('trackEnded', trackInfo);
          resolve('ended');
        } else {
          resolve('stopped');
        }
      });

      this.ffmpeg.on('error', (err) => {
        log.error(`ffmpeg error: ${err.message}`);
        this.emit('error', err);
        reject(err);
      });
    });
  }

  _stopFfmpeg() {
    if (this.ffmpeg) {
      this.ffmpeg.stdout.unpipe();
      this.ffmpeg.kill('SIGTERM');
      this.ffmpeg = null;
    }
  }

  stop() {
    this.playing = false;
    this.paused = false;
    this._stopFfmpeg();

    if (this.sender) {
      try { this.sender.stop(); } catch (err) {
        log.warn(`AirPlay stop error: ${err.message}`);
      }
      this.sender = null;
      this._connected = false;
    }

    this.currentTrack = null;
    this.emit('stopped');
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.sender) {
      this.sender.setVolume(this.volume);
    }
  }

  getStatus() {
    return {
      playing: this.playing,
      paused: this.paused,
      currentTrack: this.currentTrack,
      volume: this.volume,
      connected: this._connected,
    };
  }
}

// Singleton
const streamer = new AudioStreamer();

module.exports = streamer;
