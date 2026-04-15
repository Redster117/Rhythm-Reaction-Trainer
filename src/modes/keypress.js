// src/modes/keypress.js
// Simple Key-Press mode: shows a sequence of beats to press keys to.
// This is a minimal scaffold for Sprint 2+; it uses the same judgement logic as beatclick.

import { getJudgement } from '../utils.js';

export default function createKeyPressMode({ canvas, audioScheduler, onUpdateHUD, pattern = null, debug = false } = {}) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let cues = []; // {beatTime, hit, id}
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  const leadTime = 0.6;

  // If no pattern provided, generate a simple 8-beat pattern at scheduler BPM
  function generatePattern(startTime, count = 8) {
    const spb = audioScheduler.secondsPerBeat;
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push(startTime + i * spb);
    }
    return arr;
  }

  function spawnPattern(beatTimes) {
    for (const bt of beatTimes) {
      cues.push({ id: Math.random().toString(36).slice(2,9), beatTime: bt, spawnTime: bt - leadTime, hit: false });
    }
  }

  function onBeat(beatTime) {
    // For KeyPress mode we don't spawn on every metronome beat; spawn only when pattern exists.
    // Keep this handler minimal; pattern spawn is done once at start.
  }

  function start() {
    // prepare pattern
    const now = audioScheduler.getCurrentTime();
    const startAt = now + 0.5;
    const beatTimes = pattern ? pattern.map(offset => startAt + offset) : generatePattern(startAt, 8);
    spawnPattern(beatTimes);

    audioScheduler.onBeat(onBeat);
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function handleInput(eventTime) {
    let nearest = null;
    let bestDiff = Infinity;
    for (const cue of cues) {
      if (cue.hit) continue;
      const diff = eventTime - cue.beatTime;
      const abs = Math.abs(diff);
      if (abs < bestDiff && abs <= 0.2) {
        bestDiff = abs;
        nearest = cue;
      }
    }
    if (!nearest) {
      combo = 0;
      lastJudgement = 'Miss';
      onUpdateHUD({ score, combo, lastJudgement });
      return;
    }

    const judgement = getJudgement(eventTime - nearest.beatTime);
    nearest.hit = true;
    if (judgement.points > 0) {
      score += judgement.points;
      combo += 1;
    } else {
      combo = 0;
    }
    lastJudgement = judgement.label;
    if (debug) console.log('keypress hit diff', (eventTime - nearest.beatTime).toFixed(3), judgement.label);
    onUpdateHUD({ score, combo, lastJudgement, judgementCss: judgement.css });
  }

  // input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyK' || e.code === 'Enter') {
      e.preventDefault();
      handleInput(audioScheduler.getCurrentTime());
    }
  });

  canvas.addEventListener('pointerdown', () => {
    handleInput(audioScheduler.getCurrentTime());
  });

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const now = audioScheduler.getCurrentTime();

    // Draw a simple timeline of upcoming cues
    ctx.fillStyle = '#e6eef6';
    ctx.font = '14px system-ui';
    ctx.fillText('Key-Press Mode', 12, 20);

    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i];
      const t = (now - cue.spawnTime) / (cue.beatTime - cue.spawnTime || 1);
      if (now > cue.beatTime + 0.3) {
        if (!cue.hit) {
          combo = 0;
          lastJudgement = 'Miss';
          onUpdateHUD({ score, combo, lastJudgement });
        }
        cues.splice(i,1);
        continue;
      }

      const x = w * 0.1 + (1 - Math.min(Math.max(t,0),1)) * (w * 0.8);
      const y = h / 2;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI*2);
      ctx.fillStyle = cue.hit ? 'rgba(126,252,106,0.9)' : 'rgba(34,193,195,0.9)';
      ctx.fill();
      ctx.fillStyle = '#071226';
      ctx.fillText(Math.max(0, (cue.beatTime - now)).toFixed(2), x - 12, y + 6);
    }

    rafId = requestAnimationFrame(render);
  }

  return {
    start,
    stop,
    getState: () => ({ score, combo, lastJudgement, cues: cues.slice() }),
    setDebug: (v) => { debug = !!v; }
  };
}
