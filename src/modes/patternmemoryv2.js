// src/modes/patternmemory.js
import { AudioSchedulerPM } from '../audioPatternMemory.js';

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, onGameEnd, debug = false, customPattern = null } = {}) {
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
  if (difficulty.level === 'noob' || difficulty.level === 'ez') maxTile = 3;
  else if (difficulty.level === 'veteran' || difficulty.level === 'experienced') maxTile = 5;
  else if (difficulty.level === 'expert') maxTile = 6;
  else if (difficulty.level === 'pro') maxTile = 7;

  let state = 'idle'; // idle, countdown, showing, input, gameover
  let currentRound = 0;
  let totalRounds = difficulty.level === 'noob' ? 5 :
                   difficulty.level === 'ez' ? 6 :
                   difficulty.level === 'veteran' ? 7 :
                   difficulty.level === 'experienced' ? 8 :
                   difficulty.level === 'expert' ? 9 :
                   difficulty.level === 'pro' ? 10 : 10;
  let customTiles = customPattern ? customPattern.filter(t => t > 0) : [];
  let currentTile = null;
  let currentTileFlashTime = 1;
  let inputStartedAt = 0;
  let expectedClickTimes = [];
  let userPresses = [];
  let clickCount = 0;
  let requiredClicks = 1;
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
    if (state === 'input') {
      ctx.fillText(`Presses: ${clickCount}/${requiredClicks}`, 12, 100);
      ctx.fillText('Reproduce the beat now', 12, 120);
    }

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

    // Pick a tile: use custom tiles if available, otherwise random
    if (customTiles.length > 0 && currentRound < customTiles.length) {
      currentTile = customTiles[currentRound];
    } else {
      currentTile = Math.floor(Math.random() * maxTile) + 1;
    }
    hasPlayerInput = false;
    currentTileFlashTime = safeNow();

    // Play the tile's beat
    pmAudioScheduler.playTileBeat(currentTile);
    hasPlayerInput = false;

    state = 'showing';

    // After show duration, go to input phase
    setTimeout(() => {
      state = 'input';
      inputStartedAt = safeNow();
      const patternDelays = pmAudioScheduler.getBeatPattern(currentTile);
      expectedClickTimes = patternDelays.map((delay) => inputStartedAt + delay);
      userPresses = [];
      clickCount = 0;
      requiredClicks = expectedClickTimes.length || 1;
      hasPlayerInput = false;
      inputTimeout = setTimeout(() => {
        evaluateRound();
      }, inputWindow * 1000);
    }, (leadTime + showDuration) * 1000);
  }

  function onKeyDown(e) {
    if (state !== 'input' || e.ctrlKey || e.altKey || e.metaKey || hasPlayerInput) return;
    const clickTime = safeNow();
    if (!validateClickTiming(clickTime)) {
      triggerGameOver();
      return;
    }
    userPresses.push(clickTime);
    clickCount += 1;
    if (clickCount >= requiredClicks) {
      hasPlayerInput = true;
      evaluateRound();
    }
  }

  function evaluateRound() {
    if (inputTimeout) {
      clearTimeout(inputTimeout);
      inputTimeout = null;
    }

    let judgement = 'Miss';
    if (devInjectJudgement) {
      judgement = devInjectJudgement;
      devInjectJudgement = null;
    } else if (clickCount === requiredClicks && userPresses.length === requiredClicks) {
      const tolerance = getTimingTolerance();
      let allPerfect = true;
      let allGood = true;

      for (let i = 0; i < requiredClicks; i++) {
        const diff = userPresses[i] - expectedClickTimes[i];
        if (Math.abs(diff) <= tolerance.perfect) {
          continue;
        }
        if (Math.abs(diff) <= tolerance.good) {
          allPerfect = false;
          continue;
        }
        allGood = false;
        allPerfect = false;
        break;
      }

      if (allPerfect) {
        judgement = 'Perfect';
      } else if (allGood) {
        judgement = 'Good';
      }
    }

    if (judgement === 'Miss') {
      triggerGameOver();
      return;
    }

    applyJudgement(judgement);
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

    if (devAddScore) {
      score += devAddScore;
      devAddScore = 0;
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
    if (state !== 'input' || hasPlayerInput) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;

    // Only register clicks on the left side
    if (px < canvas.width / 2) {
      const clickTime = safeNow();
      if (!validateClickTiming(clickTime)) {
        triggerGameOver();
        return;
      }
      userPresses.push(clickTime);
      clickCount += 1;
      if (clickCount >= requiredClicks) {
        hasPlayerInput = true;
        evaluateRound();
      }
    }
  }

  function triggerGameOver() {
    if (state !== 'input') return;
    state = 'gameover';
    lastJudgement = 'Game Over';
    onUpdateHUDSafe();
    if (inputTimeout) {
      clearTimeout(inputTimeout);
      inputTimeout = null;
    }
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

    pmAudioScheduler.setBPM(difficulty.bpm || 120);
    pmAudioScheduler.init().then(() => {
      pmAudioScheduler.start();
    }).catch(() => {
      // Ignore audio resume errors if autoplay is blocked.
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
    if (inputTimeout) {
      clearTimeout(inputTimeout);
      inputTimeout = null;
    }
    state = 'idle';
    pmAudioScheduler.stop();
  }

  function getState() {
    return {
      score,
      combo,
      lastJudgement,
      totals: {
        totalJudgements,
        perfectCount,
        goodCount,
        totalOffset
      },
      currentRound,
      state
    };
  }

  function validateClickTiming(clickTime) {
    if (clickCount >= requiredClicks) {
      return false;
    }

    const allowedEarly = getTimingTolerance().good;
    const expectedTime = expectedClickTimes[clickCount];
    const diff = clickTime - expectedTime;

    if (diff < -allowedEarly || diff > allowedEarly) {
      return false;
    }
    if (clickCount > 0 && clickTime <= userPresses[clickCount - 1]) {
      return false;
    }

    return true;
  }

  function getTimingTolerance() {
    const difficultyLevel = difficulty.level || 'noob';
    const thresholds = {
      noob: { perfect: 0.42, good: 0.55 },
      ez: { perfect: 0.37, good: 0.5 },
      veteran: { perfect: 0.29, good: 0.45 },
      experienced: { perfect: 0.25, good: 0.4 },
      expert: { perfect: 0.21, good: 0.35 },
      pro: { perfect: 0.19, good: 0.3 }
    };
    return thresholds[difficultyLevel] || thresholds.noob;
  }

  // Developer control methods
  function devForceTile(tile) {
    if (state === 'idle' || state === 'countdown') return;
    currentTile = tile;
    currentTileFlashTime = safeNow();
    console.log(`%c🔧 Dev: Forced tile to ${tile}`, 'color: #ff0000;');
  }

  function devInjectJudgementFunc(judgement) {
    devInjectJudgement = judgement;
    console.log(`%c🔧 Dev: Injected judgement ${judgement}`, 'color: #ff0000;');
    if (state === 'input' && !hasPlayerInput) {
      evaluateRound();
    }
  }

  function devAddScoreFunc(amount) {
    devAddScore += amount;
    console.log(`%c🔧 Dev: Added ${amount} score`, 'color: #ff0000;');
  }

  function reset() {
    stop();
    console.log('%c🔧 Dev: Game reset', 'color: #ff0000;');
    setTimeout(() => start(), 100);
  }

  return { start, stop, getState, devForceTile, devInjectJudgementFunc, devAddScoreFunc, reset };
}
