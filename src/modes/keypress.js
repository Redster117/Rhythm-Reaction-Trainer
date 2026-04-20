// src/modes/keypress.js
import { playKeyPressBeat } from '../audioKeyPress.js';

export default function startKeyPress({ canvas, audioScheduler, onUpdateHUD, onGameEnd, difficulty = {}, keybinds = {}, pattern = null, debug = false, keyboardOnly = true } = {}) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let cues = [];
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let totalOffset = 0;
  let gameEnded = false;
  let forcedJudgement = null;
  let pendingScoreAdd = 0;

  const leadTime = typeof difficulty.leadTime === 'number' ? difficulty.leadTime : 0.6;
  const beatCount = typeof difficulty.patternBeats === 'number' ? difficulty.patternBeats : 8;
  const perfectWindow = typeof difficulty.perfect === 'number' ? difficulty.perfect : 0.12;
  const goodWindow = typeof difficulty.good === 'number' ? difficulty.good : 0.22;
  const maxWindow = goodWindow;
  const difficultyLevel = difficulty.level || 'noob';

  let availableLabels = Object.keys(keybinds).length ? Object.keys(keybinds) : ['A', 'S', 'D', 'F'];
  const normalizedKeybinds = {};
  Object.keys(keybinds).forEach((label) => {
    normalizedKeybinds[label] = keybinds[label];
  });

  if (['veteran', 'experienced', 'expert', 'pro'].includes(difficultyLevel) && Math.random() > 0.5) {
    availableLabels = availableLabels.slice().sort(() => Math.random() - 0.5);
  }

  let keyHandler = null;
  let pointerHandler = null;

  function safeNow() {
    return audioScheduler && typeof audioScheduler.getCurrentTime === 'function' ? audioScheduler.getCurrentTime() : performance.now() / 1000;
  }

  function getDisplayKey(code) {
    if (code.startsWith('Key')) {
      return code.slice(3).toUpperCase();
    }
    if (code.startsWith('Digit')) {
      return code.slice(5);
    }
    if (code === 'Minus') {
      return '-';
    }
    if (code === 'Period') {
      return '.';
    }
    return code;
  }

  function getKeyColor(label) {
    const colorMap = {
      'A': { unhit: 'rgba(255, 71, 87, 0.9)', hit: 'rgba(255, 150, 160, 0.9)', stroke: '#ff6b7a' },
      'S': { unhit: 'rgba(52, 211, 153, 0.9)', hit: 'rgba(110, 231, 183, 0.9)', stroke: '#34d399' },
      'D': { unhit: 'rgba(59, 130, 246, 0.9)', hit: 'rgba(147, 197, 253, 0.9)', stroke: '#3b82f6' },
      'F': { unhit: 'rgba(250, 204, 21, 0.9)', hit: 'rgba(253, 230, 138, 0.9)', stroke: '#facc15' }
    };
    return colorMap[label] || { unhit: 'rgba(34,193,195,0.9)', hit: 'rgba(126,252,106,0.9)', stroke: '#72d4ff' };
  }

  function getJudgementForDiff(diff) {
    const abs = Math.abs(diff);
    if (abs <= perfectWindow) return { label: 'Perfect', points: 300 };
    if (abs <= goodWindow) return { label: 'Good', points: 100 };
    return { label: 'Miss', points: 0 };
  }

  function generatePattern(startTime, count = beatCount) {
    const spb = audioScheduler && typeof audioScheduler.secondsPerBeat === 'number'
      ? audioScheduler.secondsPerBeat
      : (audioScheduler && typeof audioScheduler.interval === 'number' ? audioScheduler.interval : 0.5);
    return Array.from({ length: count }, (_, index) => {
      const label = availableLabels[index % availableLabels.length];
      const code = normalizedKeybinds[label] || `Key${label}`;
      const beatTime = startTime + index * spb;
      return { beatTime, label, code, spawnTime: beatTime - leadTime, hit: false };
    });
  }

  function spawnPattern(patternData) {
    cues = patternData.map(cue => ({ ...cue }));
  }

  function updateHUD() {
    if (typeof onUpdateHUD === 'function') {
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: totalJudgements ? Math.round(((perfectCount + goodCount) / totalJudgements) * 100) : 0,
        precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
      });
    }
  }

  function handleInput(eventTime, keyCode) {
    if (gameEnded) return;
    let nearest = null;
    let bestDiff = Infinity;

    for (const cue of cues) {
      if (cue.hit) continue;
      const expectedCodes = [cue.code];
      if (/^[A-Z]$/.test(cue.code) || cue.code === `Key${cue.label}`) {
        expectedCodes.push(`Key${cue.label}`);
      }
      if (!expectedCodes.includes(keyCode)) continue;

      const diff = Math.abs(eventTime - cue.beatTime);
      if (diff < bestDiff && diff <= maxWindow) {
        bestDiff = diff;
        nearest = cue;
      }
    }

    if (!nearest) {
      combo = 0;
      lastJudgement = 'Miss';
      totalJudgements += 1;
      totalOffset += maxWindow;
      updateHUD();
      return;
    }

    const diffSigned = eventTime - nearest.beatTime;
    nearest.hit = true;
    totalJudgements += 1;
    totalOffset += Math.abs(diffSigned);

    let judgement;
    if (forcedJudgement) {
      judgement = { label: forcedJudgement, points: forcedJudgement === 'Perfect' ? 300 : forcedJudgement === 'Good' ? 100 : 0 };
      lastJudgement = forcedJudgement;
      if (forcedJudgement === 'Perfect') {
        score += judgement.points;
        perfectCount += 1;
        combo += 1;
      } else if (forcedJudgement === 'Good') {
        score += judgement.points;
        goodCount += 1;
        combo += 1;
      } else {
        combo = 0;
      }
      forcedJudgement = null;
    } else {
      judgement = getJudgementForDiff(diffSigned);
      lastJudgement = judgement.label;
      if (judgement.label === 'Perfect') {
        score += judgement.points;
        perfectCount += 1;
        combo += 1;
      } else if (judgement.label === 'Good') {
        score += judgement.points;
        goodCount += 1;
        combo += 1;
      } else {
        combo = 0;
      }
    }

    if (pendingScoreAdd) {
      score += pendingScoreAdd;
      pendingScoreAdd = 0;
    }

    updateHUD();
  }

  function handleKeyDown(e) {
    if (['Space', 'Enter', 'Backspace'].includes(e.code)) return;
    const nowKey = safeNow();
    const boundCodes = Object.values(normalizedKeybinds);
    if (boundCodes.length) {
      const normalizedCode = e.code;
      const accepted = boundCodes.some((code) => code === normalizedCode || (code.length === 1 && normalizedCode === `Key${code}`));
      if (!accepted) return;
    }
    e.preventDefault();
    handleInput(nowKey, e.code);
  }

  function handlePointerDown() {
    const nowPtr = safeNow();
    let nearest = null;
    let bestDiff = Infinity;
    for (const cue of cues) {
      if (cue.hit) continue;
      const diff = Math.abs(nowPtr - cue.beatTime);
      if (diff < bestDiff && diff <= maxWindow) {
        bestDiff = diff;
        nearest = cue;
      }
    }
    if (!nearest) {
      combo = 0;
      lastJudgement = 'Miss';
      totalJudgements += 1;
      totalOffset += maxWindow;
      updateHUD();
      return;
    }
    handleInput(nowPtr, nearest.code);
  }

  function start() {
    stop();
    score = 0;
    combo = 0;
    lastJudgement = '—';
    totalJudgements = 0;
    perfectCount = 0;
    goodCount = 0;
    totalOffset = 0;
    gameEnded = false;
    forcedJudgement = null;
    pendingScoreAdd = 0;
    cues = [];

    const now = safeNow();
    const startAt = now + 0.5;
    const patternData = pattern
      ? pattern.map((offset, index) => {
          const label = availableLabels[index % availableLabels.length];
          const code = normalizedKeybinds[label] || `Key${label}`;
          return { beatTime: startAt + offset, label, code, spawnTime: startAt + offset - leadTime, hit: false };
        })
      : generatePattern(startAt, beatCount);

    spawnPattern(patternData);

    // Schedule audio beats directly at cue beat times
    if (audioScheduler && audioScheduler.audioCtx && audioScheduler.audioCtx.state !== 'closed') {
      patternData.forEach((cue) => {
        // Calculate the audio context time when the cue should play
        const timeUntilBeat = cue.beatTime - safeNow();
        const audioScheduleTime = audioScheduler.audioCtx.currentTime + timeUntilBeat;
        playKeyPressBeat(audioScheduler.audioCtx, audioScheduleTime);
      });
    }

    keyHandler = handleKeyDown;
    window.addEventListener('keydown', keyHandler);

    if (!keyboardOnly) {
      pointerHandler = (e) => handlePointerDown(e);
      canvas.addEventListener('pointerdown', pointerHandler);
    }

    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (pointerHandler) {
      canvas.removeEventListener('pointerdown', pointerHandler);
      pointerHandler = null;
    }
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const now = safeNow();

    ctx.fillStyle = '#e6eef6';
    ctx.font = '18px system-ui';
    ctx.fillText('Key-Press Rhythm Trainer', 105, 24);
    ctx.font = '14px system-ui';
    ctx.fillText('Press the key shown inside the circle when it reaches the bottom.', 205, 46);

    const targetY = h * 0.9;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(w, targetY);
    ctx.stroke();

    // Map lane indices to x positions (4 columns: A, S, D, F)
    const getLaneX = (label) => {
      const laneIndex = availableLabels.indexOf(label);
      return w * (laneIndex + 0.5) / 4; // Center each cue in its lane
    };

    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i];
      const denom = (cue.beatTime - cue.spawnTime) || 1;
      const t = (now - cue.spawnTime) / denom;

      if (now > cue.beatTime + maxWindow) {
        if (!cue.hit) {
          combo = 0;
          lastJudgement = 'Miss';
          totalJudgements += 1;
          totalOffset += Math.abs(now - cue.beatTime);
          updateHUD();
        }
        cues.splice(i, 1);
        continue;
      }

      const progress = Math.min(Math.max(t, 0), 1);
      const x = getLaneX(cue.label);
      const y = h * 0.1 + progress * (h * 0.8);

      const keyColor = getKeyColor(cue.label);
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fillStyle = cue.hit ? keyColor.hit : keyColor.unhit;
      ctx.fill();
      ctx.strokeStyle = keyColor.stroke;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#071226';
      ctx.font = '18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getDisplayKey(cue.code), x, y);
    }

    if (cues.length === 0 && totalJudgements > 0 && !gameEnded) {
      gameEnded = true;
      if (onGameEnd) {
        setTimeout(() => onGameEnd(), 1000);
      }
    }

    rafId = requestAnimationFrame(render);
  }

  function getState() {
    return {
      score,
      combo,
      lastJudgement,
      cues: cues.slice(),
      totals: { totalJudgements, perfectCount, goodCount, totalOffset }
    };
  }

  function devInjectJudgementFunc(judgement) {
    forcedJudgement = judgement;
  }

  function devAddScoreFunc(amount) {
    pendingScoreAdd += amount;
  }

  function reset() {
    stop();
    score = 0;
    combo = 0;
    lastJudgement = '—';
    totalJudgements = 0;
    perfectCount = 0;
    goodCount = 0;
    totalOffset = 0;
    gameEnded = false;
    cues = [];
    forcedJudgement = null;
    pendingScoreAdd = 0;
    start();
  }

  return {
    start,
    stop,
    getState,
    devInjectJudgementFunc,
    devAddScoreFunc,
    reset,
    setDebug: (v) => { debug = !!v; }
  };
}
