// src/audioPatternMemory.js
// Audio scheduler for Pattern Memory mode with 7 tile beat patterns

export class AudioSchedulerPM {
  constructor() {
    this.audioContext = null;
    this.currentTime = 0;
    this.isPlaying = false;
    this.bpm = 146;
    this.secondsPerBeat = 0.5;
    this.onBeatCallbacks = [];
    this.startTime = 0;

    // Define beat patterns for each tile (1-7)
    // Each pattern is an array of { frequency, duration, delayFromStart }
    this.beatPatterns = {
      1: [ // R1: Short single beat
        { frequency: 440, duration: 0.1, delayFromStart: 0 }
      ],
      2: [ // O2: Two beats
        { frequency: 440, duration: 0.1, delayFromStart: 0 },
        { frequency: 440, duration: 0.1, delayFromStart: 0.50 }
      ],
      3: [ // Y3: Three beats ascending
        { frequency: 440, duration: 0.1, delayFromStart: 0 },
        { frequency: 440, duration: 0.1, delayFromStart: 0.70 },
        { frequency: 440, duration: 0.1, delayFromStart: 0.80 }
      ],
      4: [ // G4: Quick double beat
        { frequency: 440, duration: 0.08, delayFromStart: 0 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.20 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.40 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.60 }
      ],
      5: [ // B5: Four beats (syncopated)
        { frequency: 440, duration: 0.08, delayFromStart: 0 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.30 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.40 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.50 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.80 }
      ],
      6: [ // Pu6: Descending pattern
        { frequency: 440, duration: 0.08, delayFromStart: 0 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.20 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.40 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.50 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.70 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.80 }
      ],
      7: [ // Pi7: Long pattern with multiple notes
        { frequency: 440, duration: 0.08, delayFromStart: 0 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.20 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.40 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.50 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.70 },
        { frequency: 440, duration: 0.08, delayFromStart: 0.90 },
        { frequency: 440, duration: 0.08, delayFromStart: 1.00 }
      ]
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
    this.secondsPerBeat = 146 / bpm;
  }

  getCurrentTime() {
    if (!this.audioContext) return 0;
    return this.audioContext.currentTime - this.startTime;
  }

  playTileBeat(tileNumber) {
    // tileNumber: 1-7 (R1-Pi7)
    if (!this.audioContext || !this.beatPatterns[tileNumber]) return;

    const pattern = this.beatPatterns[tileNumber];
    const now = this.audioContext.currentTime;

    // Play each note in the pattern
    for (const note of pattern) {
      const noteStartTime = now + note.delayFromStart;
      this.playNote(note.frequency, note.duration, noteStartTime);
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
    return this.beatPatterns[tileNumber]?.map(note => note.delayFromStart) || [];
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
