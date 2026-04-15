// src/modes/patternmemory.js
// Pattern Memory mode: Shows a sequence of beats, then player must repeat the timing.

import { getJudgement } from '../utils.js';

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, debug = false } = {}) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let pattern = []; // array of beat times for the pattern
  let playerInputs = []; // player's attempted timings
  let state = 'idle'; // 'showing', 'waiting', 'input', 'feedback', 'done'
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let level = 1;
  let patternLength = difficulty.patternStart || 3; // starts with difficulty-based length
  let showIndex = 0; // which beat in pattern we're currently showing
  let inputIndex = 0; // which beat the player is trying to match
  let patternStartTime = 0;
  let inputStartTime = 0;
  let feedbackTimeout = null;
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let totalOffset = 0;

  const spb = audioScheduler.secondsPerBeat;
  const cueRadius = 25;
  const perfectWindow = difficulty.perfect || 0.04; // 40ms perfect window
  const goodWindow = difficulty.good || 0.08; // 80ms good window

  function generatePattern(length) {
    const now = audioScheduler.getCurrentTime();
    const arr = [];
    for (let i = 0; i < length; i++) {
      arr.push(now + 1.0 + i * spb); // start after 1 second, spaced by beat interval
    }
    return arr;
  }

  function start() {
    resetGame();
    state = 'showing';
    pattern = generatePattern(patternLength);
    patternStartTime = audioScheduler.getCurrentTime();
    showIndex = 0;
    rafId = requestAnimationFrame(render);
    if (debug) console.log('Pattern Memory: Starting level', level, 'with pattern:', pattern);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
  }

  function resetGame() {
    pattern = [];
    playerInputs = [];
    showIndex = 0;
    inputIndex = 0;
    state = 'idle';
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
  }

  function handlePlayerInput() {
    if (state !== 'input') return;

    const now = audioScheduler.getCurrentTime();
    const expectedTime = pattern[inputIndex];
    const diff = now - expectedTime;
    const absDiff = Math.abs(diff);

    playerInputs.push({ time: now, expectedTime, diff });
    totalJudgements += 1;
    totalOffset += absDiff;

    let judgement;
    if (absDiff <= perfectWindow) {
      judgement = { label: 'Perfect', points: 300, css: 'judgement-perfect' };
      perfectCount += 1;
    } else if (absDiff <= goodWindow) {
      judgement = { label: 'Good', points: 100, css: 'judgement-good' };
      goodCount += 1;
    } else {
      judgement = { label: 'Miss', points: 0, css: 'judgement-miss' };
      combo = 0;
    }

    if (judgement.points > 0) {
      score += judgement.points;
      combo += 1;
    }

    lastJudgement = judgement.label;
    onUpdateHUD({
      score,
      combo,
      lastJudgement,
      accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
      precision: Math.round((totalOffset / totalJudgements) * 1000)
    });

    inputIndex++;

    if (debug) console.log(`Input ${inputIndex}/${patternLength}: diff=${diff.toFixed(3)}s, judgement=${judgement.label}`);

    if (inputIndex >= patternLength) {
      evaluatePattern();
    }
  }

  function evaluatePattern() {
    state = 'feedback';
    const missCount = playerInputs.filter((input) => Math.abs(input.diff) > goodWindow).length;
    const successCount = playerInputs.length - missCount;

    if (debug) console.log(`Pattern complete: Success=${successCount}, Miss=${missCount}`);

    if (missCount === 0 && successCount >= Math.ceil(patternLength * 0.8)) {
      level++;
      patternLength = Math.min(8, difficulty.patternIncrease ? patternLength + 1 : 3 + Math.floor((level - 1) / 2));
      lastJudgement = `Level ${level}!`;
      score += 500;
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
        precision: Math.round((totalOffset / totalJudgements) * 1000)
      });

      feedbackTimeout = setTimeout(() => {
        start();
      }, 2000);
    } else {
      state = 'done';
      lastJudgement = 'Game Over';
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
        precision: Math.round((totalOffset / totalJudgements) * 1000)
      });
    }
  }

  // Input handlers
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      handlePlayerInput();
    }
  });

  canvas.addEventListener('pointerdown', () => {
    handlePlayerInput();
  });

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const now = audioScheduler.getCurrentTime();

    // Title and status
    ctx.fillStyle = '#e6eef6';
    ctx.font = '18px system-ui';
    ctx.fillText('Pattern Memory', 12, 24);
    ctx.font = '14px system-ui';
    ctx.fillText(`Level: ${level} | Length: ${patternLength}`, 12, 48);
    ctx.fillText(`State: ${state}`, 12, 68);

    if (state === 'showing') {
      // Show the pattern sequence
      ctx.fillText('Watch the pattern...', 12, 100);

      // Draw pattern cues
      pattern.forEach((beatTime, index) => {
        const timeUntilBeat = beatTime - now;
        if (timeUntilBeat > 0 && timeUntilBeat < 0.5) {
          // Cue is about to appear
          const alpha = Math.max(0, 1 - (timeUntilBeat / 0.5));
          ctx.globalAlpha = alpha;
        } else if (timeUntilBeat <= 0 && timeUntilBeat > -0.2) {
          // Cue is active
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.3;
        }

        const x = w * 0.2 + (index * w * 0.15);
        const y = h * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, cueRadius, 0, Math.PI * 2);
        ctx.fillStyle = index === showIndex ? '#ff6b6b' : '#4ecdc4';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;

      // Move to next beat in pattern
      if (showIndex < pattern.length && now >= pattern[showIndex]) {
        showIndex++;
        if (showIndex >= pattern.length) {
          // Pattern showing complete, now wait for player input
          state = 'input';
          inputStartTime = now;
          inputIndex = 0;
          playerInputs = [];
          if (debug) console.log('Pattern Memory: Showing complete, waiting for input');
        }
      }

    } else if (state === 'input') {
      // Player input phase
      ctx.fillText('Repeat the pattern!', 12, 100);

      // Show expected beat positions
      pattern.forEach((beatTime, index) => {
        const x = w * 0.2 + (index * w * 0.15);
        const y = h * 0.6;

        // Highlight current expected input
        if (index === inputIndex) {
          ctx.strokeStyle = '#ff6b6b';
          ctx.lineWidth = 3;
        } else if (index < inputIndex) {
          // Already completed
          ctx.strokeStyle = '#4ecdc4';
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 1;
        }

        ctx.beginPath();
        ctx.arc(x, y, cueRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Show timing feedback for completed inputs
        if (index < playerInputs.length) {
          const input = playerInputs[index];
          const absDiff = Math.abs(input.diff);
          if (absDiff <= perfectWindow) {
            ctx.fillStyle = '#4ecdc4'; // green for perfect
          } else if (absDiff <= goodWindow) {
            ctx.fillStyle = '#ffa500'; // orange for good
          } else {
            ctx.fillStyle = '#ff6b6b'; // red for miss
          }
          ctx.beginPath();
          ctx.arc(x, y, cueRadius * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

    } else if (state === 'feedback') {
      ctx.fillText('Pattern Complete!', 12, 100);
      ctx.fillText('Preparing next level...', 12, 120);
    } else if (state === 'done') {
      ctx.fillText('Game Over!', 12, 100);
      ctx.fillText(`Final Score: ${score}`, 12, 120);
      ctx.fillText('Click Start to play again', 12, 140);
    }

    rafId = requestAnimationFrame(render);
  }

  return {
    start,
    stop,
    getState: () => ({ score, combo, lastJudgement, state, level, patternLength }),
    setDebug: (v) => { debug = !!v; },
    reset: resetGame
  };
}
