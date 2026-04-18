// src/modes/patternmemory.js
import { getJudgement } from '../utils.js';
import { AudioSchedulerPM } from '../audioPatternMemory.js';

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, onGameEnd, debug = false } = {}) {
  const ctx = canvas.getContext('2d');

  const COLOURS = [
    '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6', '#af52de'
  ];
  const LABELS = ['R1', 'O2', 'Y3', 'G4', 'B5', 'Pu6', 'Pi7'];

  let pmAudioScheduler = new AudioSchedulerPM();

  let rafId = null;
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let totalOffset = 0;

  const leadTime = 0.8;
  const showDuration = 1.0;
  const inputWindow = 3.0;

  let maxTile = 7;
  if (difficulty.level === 'ez') maxTile = 2;
  else if (difficulty.level === 'veteran' || difficulty.level === 'experienced') maxTile = 4;
  else if (difficulty.level === 'expert') maxTile = 6;
  else if (difficulty.level === 'pro') maxTile = 7;

  let state = 'idle'; // idle, countdown, showing, input, gameover
  let currentRound = 0;
  let totalRounds = 10;
  let currentTile = null;
  let currentTileFlashTime = 1;
  let hasPlayerInput = false;
  let devInjectJudgement = null;
  let devAddScore = 0;
  let inputTimeout = null;

  const countdown = document.getElementById('countdown');

  function safeNow() {
    return pmAudioScheduler ? pmAudioScheduler.getCurrentTime() : performance.now() / 1000;
  }

  function render() {
    const now = safeNow();
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, w, h);

    // Left side: clickable area
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, w / 2, h);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w / 2, h);

    ctx.fillStyle = '#e6eef6';
    ctx.font = '20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Press keys to the beat', w / 4, h / 2);

    // Right side: tile display
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(w / 2, 0, w / 2, h);

    if (state === 'showing' && currentTile) {
      const tileSize = Math.min(w / 4, h / 2);
      const tileX = w / 2 + (w / 4 - tileSize / 2);
      const tileY = h / 2 - tileSize / 2;

      // Flash animation
      const timeSinceSpawn = now - currentTileFlashTime;
      const progress = Math.min(timeSinceSpawn / leadTime, 1);

      if (timeSinceSpawn < leadTime) {
        // Expanding circle before beat
        const radius = (tileSize / 2) * (0.3 + 0.4 * (1 - progress));
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = COLOURS[currentTile - 1];
        ctx.beginPath();
        ctx.arc(w / 2 + w / 4, h / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (timeSinceSpawn < leadTime + showDuration) {
        // Highlight the tile box
        ctx.fillStyle = COLOURS[currentTile - 1];
        ctx.fillRect(tileX + 6, tileY + 6, tileSize - 12, tileSize - 12);
      }

      // Draw tile box
      ctx.fillStyle = COLOURS[currentTile - 1];
      ctx.fillRect(tileX, tileY, tileSize, tileSize);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.strokeRect(tileX, tileY, tileSize, tileSize);

      // Draw label
      ctx.fillStyle = '#071226';
      ctx.font = `bold ${Math.max(24, tileSize * 0.3)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(LABELS[currentTile - 1], w / 2 + w / 4, h / 2);
    }

    // HUD info
    ctx.fillStyle = '#e6eef6';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Round: ${currentRound + 1}/${totalRounds}`, 12, 20);
    ctx.fillText(`Score: ${score}`, 12, 40);
    ctx.fillText(`Last: ${lastJudgement}`, 12, 60);
    ctx.fillText(`State: ${state}`, 12, 80);

    rafId = requestAnimationFrame(render);
  }

  function showCountdown() {
    countdown.style.display = 'block';
    countdown.textContent = '3';
    setTimeout(() => countdown.textContent = '2', 1000);
    setTimeout(() => countdown.textContent = '1', 2000);
    setTimeout(() => {
      countdown.style.display = 'none';
      startRound();
    }, 3000);
  }

  function startRound() {
    if (currentRound >= totalRounds) {
      triggerGameOver();
      return;
    }

    // Pick a random tile (1-maxTile)
    currentTile = Math.floor(Math.random() * maxTile) + 1;
    hasPlayerInput = false;
    currentTileFlashTime = safeNow();

    // Play the tile's beat
    pmAudioScheduler.playTileBeat(currentTile);
    hasPlayerInput = false;

    state = 'showing';

    // After show duration, go to input phase
    setTimeout(() => {
      state = 'input';
      inputTimeout = setTimeout(() => {
        evaluateRound();
      }, inputWindow * 1000);
    }, (leadTime + showDuration) * 1000);
  }

  function onKeyDown(e) {
    if (state !== 'input' || e.ctrlKey || e.altKey || e.metaKey) return;
    userPresses.push(safeNow());
  }

  function applyJudgement(judgementLabel) {
    totalJudgements++;

    const judgement = { label: judgementLabel };

    if (judgement.label === 'Perfect') {
      perfectCount++;
      score += 300;
      combo += 1;
    } else if (judgement.label === 'Good') {
      goodCount++;
      score += 100;
      combo += 1;
    } else {
      combo = 0;
    }

    lastJudgement = judgement.label;

    onUpdateHUDSafe();

    currentRound++;
    setTimeout(() => startRound(), 500);
  }

  function onUpdateHUDSafe() {
    if (typeof onUpdateHUD === 'function') {
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: totalJudgements ? Math.round(((perfectCount + goodCount) / totalJudgements) * 100) : 100,
        precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0,
        level: currentRound + 1,
        step: currentRound + 1,
        totalSteps: totalRounds
      });
    }
  }

  function onPointerDown(e) {
    if (state !== 'input') return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;

    // Only register clicks on the left side
    if (px < canvas.width / 2) {
      userPresses.push(safeNow());
    }
  }

  function triggerGameOver() {
    state = 'gameover';
    lastJudgement = 'Game Over';
    onUpdateHUDSafe();
    canvas.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 420 });
    setTimeout(() => {
      stop();
      if (typeof onGameEnd === 'function') onGameEnd();
    }, 600);
  }

  function start() {
    canvas.classList.add('pattern-memory-mode');
    canvas.width = canvas.height = 400;
    canvas.style.width = canvas.style.height = '400px';

    pmAudioScheduler.setBPM(120);
    pmAudioScheduler.init().then(() => {
      pmAudioScheduler.start();
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    state = 'countdown';
    currentRound = 0;
    score = 0;
    combo = 0;
    lastJudgement = '—';
    totalJudgements = 0;
    perfectCount = 0;
    goodCount = 0;
    totalOffset = 0;

    showCountdown();
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (canvas) {
      canvas.classList.remove('pattern-memory-mode');
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.width = 800;
      canvas.height = 500;
    }
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    state = 'idle';
    pmAudioScheduler.stop();
  }

  // Developer control methods
  function devForceTile(tile) {
    if (state === 'idle' || state === 'countdown') return;
    currentTile = tile;
    console.log(`%c🔧 Dev: Forced tile to ${tile}`, 'color: #ff0000;');
  }

  function devInjectJudgementFunc(judgement) {
    devInjectJudgement = judgement;
    console.log(`%c🔧 Dev: Injected judgement ${judgement}`, 'color: #ff0000;');
  }

  function devAddScoreFunc(amount) {
    devAddScore = amount;
    console.log(`%c🔧 Dev: Added ${amount} score`, 'color: #ff0000;');
  }

  function reset() {
    stop();
    // Restart with same params - but params not stored, so just stop for now
    console.log('%c🔧 Dev: Game reset (stopped)', 'color: #ff0000;');
  }

  return { start, stop, devForceTile, devInjectJudgementFunc, devAddScoreFunc, reset };
}
