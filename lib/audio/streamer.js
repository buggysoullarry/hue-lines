// lib/audio/streamer.js — AirPlay audio streaming to HomePod via node-airtunes2
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const log = require('../logger');

// AirTunes setup
let AirTunes;
try {
  AirTunes = require('node-airtunes2');
} catch (err) {
  log.warn('node-airtunes2 not installed — audio streaming disabled');
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
    this.airtunes = null;
    this.device = null;
    this.ffmpeg = null;
    this.playing = false;
    this.paused = false;
    this.currentTrack = null;
    this.volume = 50;
    this._deviceReady = false;
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
    if (!AirTunes) throw new Error('node-airtunes2 is not installed');

    const homepod = this.getHomePodConfig();
    log.info(`Connecting to HomePod "${homepod.name}" at ${homepod.ip}...`);

    this.airtunes = new AirTunes();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection to HomePod timed out'));
      }, 15000);

      this.device = this.airtunes.add(homepod.ip, {
        port: 7000,
        volume: this.volume,
      });

      this.device.on('status', (status) => {
        log.info(`HomePod status: ${status}`);
        if (status === 'ready') {
          this._deviceReady = true;
          clearTimeout(timeout);
          resolve();
        } else if (status === 'stopped') {
          this._deviceReady = false;
        }
      });

      this.device.on('error', (err) => {
        log.error(`HomePod error: ${err.message}`);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Stream a single audio file
  async streamFile(trackInfo) {
    if (!this.airtunes) await this.connect();

    // Stop any current playback
    this._stopFfmpeg();

    this.currentTrack = trackInfo;
    this.playing = true;
    this.paused = false;

    log.info(`Streaming: ${trackInfo.artist} - ${trackInfo.title}`);
    this.emit('trackStarted', trackInfo);

    return new Promise((resolve, reject) => {
      // Decode audio to raw PCM (16-bit LE, 44100Hz, stereo) via ffmpeg
      this.ffmpeg = spawn(FFMPEG, [
        '-i', trackInfo.path,
        '-f', 's16le',       // raw PCM signed 16-bit little-endian
        '-ar', '44100',       // 44.1kHz sample rate
        '-ac', '2',           // stereo
        '-acodec', 'pcm_s16le',
        'pipe:1'              // output to stdout
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      // Pipe PCM data to AirTunes
      this.ffmpeg.stdout.pipe(this.airtunes);

      this.ffmpeg.stderr.on('data', () => {
        // ffmpeg writes progress to stderr, ignore it
      });

      this.ffmpeg.on('close', (code) => {
        this.ffmpeg = null;
        if (this.playing && !this.paused) {
          // Track finished naturally
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

    if (this.airtunes) {
      this.airtunes.stopAll(() => {
        log.info('AirTunes stopped');
      });
      this.airtunes = null;
      this.device = null;
      this._deviceReady = false;
    }

    this.currentTrack = null;
    this.emit('stopped');
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.device) {
      this.device.setVolume(this.volume);
    }
  }

  getStatus() {
    return {
      playing: this.playing,
      paused: this.paused,
      currentTrack: this.currentTrack,
      volume: this.volume,
      connected: this._deviceReady,
    };
  }
}

// Singleton
const streamer = new AudioStreamer();

module.exports = streamer;
