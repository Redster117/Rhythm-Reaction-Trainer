import { playKeyPressBeat } from './audioKeyPress.js';

export class AudioScheduler {
  constructor(soundProfile = 'default') {
    this.audioCtx = null;
    this.bpm = 120;
    this.interval = 60 / this.bpm;
    this.secondsPerBeat = 60 / this.bpm;
    this.soundProfile = soundProfile;
    this.soundEnabled = true;
    this.isRunning = false;
    this._lookahead = 0.1; // seconds
    this._scheduleAheadTime = 0.5; // seconds
    this._nextNoteTime = 0;
    this._timerID = null;
    this._callbacks = [];
  }

  async init() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // small silent buffer to unlock audio on some browsers
    const buffer = this.audioCtx.createBuffer(1, 1, 22050);
    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioCtx.destination);
    src.start();
    this._nextNoteTime = this.audioCtx.currentTime + 0.1;
    this.startScheduler();
  }

  startScheduler() {
    if (this.isRunning) return;
    this.isRunning = true;
    const scheduler = () => {
      while (this._nextNoteTime < this.audioCtx.currentTime + this._scheduleAheadTime) {
        this._emitBeat(this._nextNoteTime);
        this._nextNoteTime += this.interval;
      }
      this._timerID = setTimeout(scheduler, this._lookahead * 1000);
    };
    scheduler();
  }

  async stopScheduler() {
    this.isRunning = false;
    if (this._timerID) clearTimeout(this._timerID);
    if (this.audioCtx && this.audioCtx.state === 'running') {
      await this.audioCtx.suspend();
    }
  }

  onBeat(callback) {
    this._callbacks.push(callback);
  }

  setSoundProfile(profile) {
    this.soundProfile = profile;
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  _emitBeat(time) {
    if (this.soundEnabled) {
      if (this.soundProfile === 'keypress') {
        playKeyPressBeat(this.audioCtx, time);
      } else {
        this._playDefaultBeat(time);
      }
    }
    // notify listeners with scheduled time
    this._callbacks.forEach(cb => cb(time));
  }

  _playDefaultBeat(time) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  getCurrentTime() {
    return this.audioCtx.currentTime;
  }

  setBPM(bpm) {
    this.bpm = bpm;
    this.interval = 60 / bpm;
    this.secondsPerBeat = 60 / bpm;
  }
}
