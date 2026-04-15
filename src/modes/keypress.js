// src/modes/keypress.js
// Key-Press mode: displays labeled beat cues and requires matching key presses.

import { getJudgement } from '../utils.js';

export default function startKeyPress({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, keybinds = {}, pattern = null, debug = false } = {}) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let cues = []; // {beatTime, spawnTime, hit, label, code}
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let totalOffset = 0;

  const leadTime = difficulty.leadTime || 0.6;
  const beatCount = difficulty.patternBeats || 8;
  const availableLabels = Object.keys(keybinds).length ? Object.keys(keybinds) : ['A', 'S', 'D', 'F'];

  function generatePattern(startTime, count = beatCount) {
    const spb = audioScheduler.secondsPerBeat;
    const patternData = [];
    for (let i = 0; i < count; i++) {
      const label = availableLabels[i % availableLabels.length];
      const code = keybinds[label] || `Key${label}`;
      patternData.push({ beatTime: startTime + i * spb, label, code, spawnTime: startTime + i * spb - leadTime, hit: false });
    }
    return patternData;
  }

  function spawnPattern(patternData) {
    cues = patternData.map((cue) => ({ ...cue }));
  }

  function onBeat(_beatTime) {
    // Do nothing; the pattern is pre-generated.
  }

  function start() {
    const now = audioScheduler.getCurrentTime();
    const startAt = now + 0.5;
    const patternData = pattern ? pattern.map((offset, index) => {
      const label = availableLabels[index % availableLabels.length];
      return { beatTime: startAt + offset, label, code: keybinds[label] || `Key${label}`, spawnTime: startAt + offset - leadTime, hit: false };
    }) : generatePattern(startAt, beatCount);
    spawnPattern(patternData);
    audioScheduler.onBeat(onBeat);
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function updateStats(diff) {
    const judgement = getJudgement(diff);
    totalJudgements += 1;
    totalOffset += Math.abs(diff);
    if (judgement.label === 'Perfect') perfectCount += 1;
    if (judgement.label === 'Good') goodCount += 1;
    if (judgement.label === 'Miss') combo = 0;
    return judgement;
  }

  function handleInput(eventTime, keyCode) {
    let nearest = null;
    let bestDiff = Infinity;
    for (const cue of cues) {
      if (cue.hit || cue.code !== keyCode) continue;
      const diff = Math.abs(eventTime - cue.beatTime);
      if (diff < bestDiff && diff <= 0.2) {
        bestDiff = diff;
        nearest = cue;
      }
    }
    if (!nearest) {
      combo = 0;
      lastJudgement = 'Miss';
      onUpdateHUD({ score, combo, lastJudgement, accuracy: totalJudgements ? Math.round(((perfectCount + goodCount) / totalJudgements) * 100) : 0, precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0 });
      return;
    }

    const diff = eventTime - nearest.beatTime;
    const judgement = updateStats(diff);
    nearest.hit = true;
    lastJudgement = judgement.label;
    if (judgement.points > 0) {
      score += judgement.points;
      combo += 1;
    } else {
      combo = 0;
    }
    onUpdateHUD({ score, combo, lastJudgement, accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100), precision: Math.round((totalOffset / totalJudgements) * 1000) });
  }

  window.addEventListener('keydown', (e) => {
    if (['Space', 'Enter', 'Backspace'].includes(e.code)) return;
    const now = audioScheduler.getCurrentTime();
    if (Object.values(keybinds).includes(e.code)) {
      e.preventDefault();
      handleInput(now, e.code);
    }
  });

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const now = audioScheduler.getCurrentTime();

    ctx.fillStyle = '#e6eef6';
    ctx.font = '18px system-ui';
    ctx.fillText('Key-Press Rhythm Trainer', 12, 24);
    ctx.font = '14px system-ui';
    ctx.fillText('Press the key shown inside the circle at the beat.', 12, 46);

    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i];
      const t = (now - cue.spawnTime) / (cue.beatTime - cue.spawnTime || 1);
      if (now > cue.beatTime + 0.4) {
        if (!cue.hit) {
          combo = 0;
          lastJudgement = 'Miss';
          totalJudgements += 1;
          onUpdateHUD({ score, combo, lastJudgement, accuracy: totalJudgements ? Math.round(((perfectCount + goodCount) / totalJudgements) * 100) : 0, precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0 });
        }
        cues.splice(i, 1);
        continue;
      }

      const progress = Math.min(Math.max(t, 0), 1);
      const x = w * 0.1 + (1 - progress) * (w * 0.8);
      const y = h / 2;
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fillStyle = cue.hit ? 'rgba(126,252,106,0.9)' : 'rgba(34,193,195,0.9)';
      ctx.fill();
      ctx.strokeStyle = cue.hit ? '#8de6a3' : '#72d4ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#071226';
      ctx.font = '18px system-ui';
      ctx.fillText(cue.label, x - 7, y + 7);
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
