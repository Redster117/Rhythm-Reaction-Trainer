// src/audioPatternMemory.js
// Audio scheduler for Pattern Memory mode with stable beat timelines per tile.

export class AudioSchedulerPM {
  constructor() {
    this.audioContext = null;
    this.currentTime = 0;
    this.isPlaying = false;
    this.bpm = 146;
    this.secondsPerBeat = 60 / this.bpm;
    this.onBeatCallbacks = [];
    this.startTime = 0;

    this.beatPatterns = {
      1: [0.00],
      2: [0.00, 0.50],
      3: [0.00, 0.70, 0.80],
      4: [0.00, 0.20, 0.40, 0.60],
      5: [0.00, 0.30, 0.40, 0.50, 0.80],
      6: [0.00, 0.20, 0.40, 0.53, 0.73, 0.86],
      7: [0.00, 0.20, 0.40, 0.50, 0.70, 0.90, 1.00]
    };
  }

  async init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setBPM(bpm) {
    this.bpm = bpm;
    this.secondsPerBeat = 60 / bpm;
  }

  getCurrentTime() {
    if (!this.audioContext) return 0;
    return Math.max(0, this.audioContext.currentTime - this.startTime);
  }

  playTileBeat(tileNumber, startAt = null, speedMultiplier = 1) {
    if (!this.audioContext || !this.beatPatterns[tileNumber]) return;

    const delays = this.beatPatterns[tileNumber];
    const now = this.audioContext.currentTime;
    const safeMultiplier = Number(speedMultiplier) || 1;
    const effectiveSpeed = Math.max(0.1, safeMultiplier);
    const baseOffset = (typeof startAt === 'number') ? (startAt - this.getCurrentTime()) : 0;

    for (const delay of delays) {
      const noteStartTime = now + baseOffset + (delay / effectiveSpeed);
      this.playNote(440, 0.08 / effectiveSpeed, noteStartTime);
    }
  }

  playNote(frequency, duration, startTime) {
    // Play a single note at a specific time
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.frequency.value = frequency;
    osc.type = 'sine';

    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  start() {
    this.startTime = this.audioContext.currentTime;
    this.isPlaying = true;
  }

  stop() {
    if (this.audioContext) {
      this.isPlaying = false;
    }
  }

  getBeatPattern(tileNumber) {
    return this.beatPatterns[tileNumber] ? this.beatPatterns[tileNumber].slice() : [];
  }

  getBeatPatternMs(tileNumber, speedMultiplier = 1) {
    const safeMultiplier = Number(speedMultiplier) || 1;
    const effectiveSpeed = Math.max(0.1, safeMultiplier);
    return (this.beatPatterns[tileNumber] || []).map((delay) => Math.round((delay / effectiveSpeed) * 1000));
  }

  // Set a custom beat pattern for a tile
  setTilePattern(tileNumber, pattern) {
    if (tileNumber >= 1 && tileNumber <= 7 && Array.isArray(pattern)) {
      this.beatPatterns[tileNumber] = pattern;
    }
  }

  // Get current pattern for a tile
  getTilePattern(tileNumber) {
    return this.beatPatterns[tileNumber] || [];
  }
}
