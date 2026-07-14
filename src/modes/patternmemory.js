// src/modes/patternmemory.js
import { AudioSchedulerPM } from '../audioPatternMemory.js';
import PatternGuide from '../patternGuide.js';

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, onGameEnd, debug = false, customPattern = null, showGuide = true } = {}) {
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

  let leadTime = 0.8;
  const showDuration = 1.0;
  const inputWindow = 3.0;

  let maxTile = 7;
  if (difficulty.level === 'noob' || difficulty.level === 'ez') maxTile = 3;
  else if (difficulty.level === 'veteran' || difficulty.level === 'experienced') maxTile = 5;
  else if (difficulty.level === 'expert') maxTile = 6;
  else if (difficulty.level === 'pro') maxTile = 7;

  let state = 'idle'; // idle, countdown, preview, input, gameover
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
  let devInjectPersistent = false;
  let devAddScore = 0;
  let inputTimeout = null;
  // Latency calibration / rolling offset (seconds). Positive means display lags real time.
  let rollingOffset = 0; // seconds
  const offsetSamples = [];
  let scheduledTimelineTimes = [];
  let scheduledTimelineTimesInput = [];
  let scheduledBeatStart = null;
  let scheduledPreviewStart = null;
  let scheduledInputGhostTimeouts = [];

  const countdown = document.getElementById('countdown');

  // Create a reusable guide instance (keeps rendering logic in one place)
  const guideCanvas = document.getElementById('pattern-guide-canvas');
  const guideCtx = guideCanvas ? guideCanvas.getContext('2d') : null;
  const guide = new PatternGuide(guideCtx, guideCanvas, { xPct: 0.5, y: 16, minWidth: 320, height: 96 });

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

    if (state === 'preview' && currentTile) {
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

    if (guideCanvas) {
      guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
      guideCanvas.hidden = true;
    }

    if (showGuide && currentTile && (state === 'preview' || state === 'input') && guideCanvas) {
      guideCanvas.hidden = false;
      let timelineTimes = [];
      if (state === 'preview') {
        timelineTimes = scheduledTimelineTimes.slice();
      } else if (state === 'input') {
        timelineTimes = scheduledTimelineTimesInput.slice();
      }
      const guidePreBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
      const renderOffset = state === 'input' ? -guidePreBuffer : 0;

      // Update and draw the centralized guide renderer in the separate guide canvas
      // Do not apply rollingOffset during preview (it anticipates user input and can desync audio preview)
      const applyRolling = state === 'preview' ? 0 : rollingOffset;
      guide.update({ timelineTimes, userPresses, rollingOffset: applyRolling, renderOffset, leadTime, tolerance: getTimingTolerance(), visible: true });
      guide.draw(now);
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

    // Mini guide indicator during preview phase
    if (state === 'preview') {
      const remaining = scheduledBeatStart ? Math.max(0, scheduledBeatStart - now) : 0;
      ctx.fillStyle = '#e6eef6';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Watch the guide', w * 0.75, 40);
      if (remaining > 0) {
        ctx.font = '14px system-ui';
        ctx.fillText(`${Math.max(0, Math.round(remaining * 1000))} ms`, w * 0.75, 62);
      }
    }

    rafId = requestAnimationFrame(render);
  }

  function getCurrentRenderOffset() {
    const guidePreBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
    return state === 'input' ? -guidePreBuffer : 0;
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

    // Guide phase: show the guide first, then play the beat at scheduled beatStart
    const patternDelays = pmAudioScheduler.getBeatPattern(currentTile);
    const now = safeNow();
    const preBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
    const guideStart = now;
    const beatStart = guideStart + preBuffer;
    scheduledBeatStart = beatStart;
    scheduledPreviewStart = guideStart;
    // align tile flash to the guide timing so the visual matches the beats
    currentTileFlashTime = beatStart - leadTime;
    scheduledTimelineTimes = patternDelays.map(d => beatStart + d);

    // Schedule audio to play at scheduler time 'beatStart'
    pmAudioScheduler.playTileBeat(currentTile, beatStart);

    state = 'preview';
    scheduledPreviewStart = guideStart;

    // After the preview pattern has finished playing, transition to input phase
    const patternDuration = (patternDelays.length ? patternDelays[patternDelays.length - 1] : 0) + 0.25;
    const inputStart = beatStart + patternDuration;
    setTimeout(() => {
      state = 'input';
      inputStartedAt = safeNow();
      // clear any input ghost timeouts that might remain
      if (scheduledInputGhostTimeouts && scheduledInputGhostTimeouts.length) {
        scheduledInputGhostTimeouts.forEach(id => clearTimeout(id));
        scheduledInputGhostTimeouts = [];
      }
      expectedClickTimes = patternDelays.map((delay) => inputStartedAt + delay);
      scheduledTimelineTimesInput = expectedClickTimes.slice();
      userPresses = [];
      clickCount = 0;
      requiredClicks = expectedClickTimes.length || 1;
      hasPlayerInput = false;
      inputTimeout = setTimeout(() => {
        evaluateRound();
      }, inputWindow * 1000);

      // ghost presses removed: do not inject synthetic presses during input
    }, Math.max(0, (inputStart - safeNow()) * 1000));
  }

  function onKeyDown(e) {
    if (state !== 'input' || e.ctrlKey || e.altKey || e.metaKey || hasPlayerInput) return;
    const clickTime = safeNow();
    // Only reject strictly invalid clicks (duplicates or overflow); otherwise accept
    if (!validateClickTiming(clickTime)) return;
    // Diagnostic logging
    try {
      console.log('%c[PM] KeyDown click', 'color: #66d9ef;', {
        clickTime, safeNow: safeNow(), rollingOffset, renderOffset: getCurrentRenderOffset(), expectedClickTimes, clickCountBefore: clickCount
      });
    } catch (err) {}
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
    // Diagnostic: show current timing arrays and offsets
    try {
      console.log('%c[PM] Evaluating round', 'color: #9b59b6;', {
        state, requiredClicks, clickCount, expectedClickTimes, userPresses, rollingOffset, tolerance: getTimingTolerance()
      });
    } catch (err) {}
    if (devInjectJudgement) {
      judgement = devInjectJudgement;
      if (!devInjectPersistent) {
        devInjectJudgement = null;
      }
    } else if (clickCount === requiredClicks && userPresses.length === requiredClicks) {
      const tolerance = getTimingTolerance();
      let allPerfect = true;
      let allGood = true;

      // Compare adjusted press times (apply rollingOffset) to expectedClickTimes
      const measuredOffsets = [];
      for (let i = 0; i < requiredClicks; i++) {
        const adjustedPress = userPresses[i] + rollingOffset;
        const diff = adjustedPress - expectedClickTimes[i];
        try {
          console.log('%c[PM] Press compare', 'color: #8ae234;', { index: i, rawPress: userPresses[i], adjustedPress, expected: expectedClickTimes[i], diff });
        } catch (err) {}
        // collect raw offset for calibration (expected - actual)
        measuredOffsets.push(expectedClickTimes[i] - userPresses[i]);
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

      // Update rolling offset using exponential moving average of measured offsets
      if (measuredOffsets.length) {
        const avgMeasured = measuredOffsets.reduce((a, b) => a + b, 0) / measuredOffsets.length;
        offsetSamples.push(avgMeasured);
        // keep sample history short
        if (offsetSamples.length > 30) offsetSamples.shift();
        // EMA smoothing
        const oldRolling = rollingOffset;
        rollingOffset = rollingOffset * 0.88 + avgMeasured * 0.12;
        try { console.log('%c[PM] Rolling offset updated', 'color: #f6c177;', { oldRolling, newRolling: rollingOffset, avgMeasured }); } catch (err) {}

        // Adaptive leadTime: if users are consistently late, increase leadTime; if early, decrease
        const recentAvg = offsetSamples.reduce((a, b) => a + b, 0) / offsetSamples.length;
        if (recentAvg < -0.06) {
          // user tends to be late (negative measured expected - actual), increase leadTime
          leadTime = Math.min(1.5, leadTime + 0.05);
        } else if (recentAvg > 0.06) {
          // user early, decrease leadTime slightly
          leadTime = Math.max(0.3, leadTime - 0.05);
        }
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
    if (guideCanvas) {
      guideCanvas.hidden = false;
      guideCanvas.width = 360;
      guideCanvas.height = 120;
      guideCanvas.style.width = '360px';
      guideCanvas.style.height = '120px';
    }

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
    if (guideCanvas) {
      guideCanvas.hidden = true;
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
    // Do not immediately fail the player for being slightly early/late.
    // Only enforce ordering (no repeated/earlier presses) and bounds.
    if (clickCount > 0 && clickTime <= userPresses[clickCount - 1]) {
      return false;
    }

    // Optional: reject clicks that are wildly outside the expected window
    if (expectedClickTimes && expectedClickTimes.length) {
      // Enforce per-beat gating: clicks should correspond to the next expected
      // beat within a reasonable tolerance window. This prevents spam clicks
      // from filling later slots and producing false "Perfect" judgements.
      const tol = getTimingTolerance();
      const nextIdx = clickCount;
      const nextExpected = expectedClickTimes[nextIdx];
      if (typeof nextExpected === 'number') {
        const relaxedWindow = tol.good * 2;
        const earliest = nextExpected - relaxedWindow; // allow a wider early window
        const latest = nextExpected + relaxedWindow; // allow a wider late window
        if (clickTime < earliest || clickTime > latest) return false;
      } else {
        // fallback to previous broad bounds
        const first = expectedClickTimes[0] - tol.good * 4;
        const last = expectedClickTimes[expectedClickTimes.length - 1] + tol.good * 4;
        if (clickTime < first || clickTime > last + inputWindow) return false;
      }
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

  function devInjectJudgementFunc(judgement, options = {}) {
    devInjectJudgement = judgement;
    devInjectPersistent = Boolean(options.persistent);
    console.log(`%c🔧 Dev: Injected judgement ${judgement}`, 'color: #ff0000;');
    if (state === 'input' && !hasPlayerInput) {
      evaluateRound();
    }
  }

  function devAddScoreFunc(amount) {
    score += Number(amount) || 0;
    onUpdateHUDSafe();
    console.log(`%c🔧 Dev: Added ${amount} score`, 'color: #ff0000;');
  }

  // Developer API: runtime tuning for the guide
  function setGuideOptions(opts = {}) {
    guide.setOptions(opts);
    console.log('%c🔧 Dev: Guide options updated', 'color: #ffcc00;', opts);
  }

  function setRollingOffset(offsetSeconds = 0) {
    rollingOffset = Number(offsetSeconds) || 0;
    console.log('%c🔧 Dev: Rolling offset set to ' + rollingOffset + 's', 'color: #ffcc00;');
  }

  function getGuideOptions() {
    return Object.assign({}, guide.opts);
  }

  function getRollingOffset() {
    return rollingOffset;
  }

  // Return scheduled guide timings for preview and input phases
  function getScheduledGuideTimings() {
    const now = safeNow();
    const previewAbs = scheduledTimelineTimes.slice();
    const inputAbs = scheduledTimelineTimesInput.slice();
    return {
      preview: {
        absolute: previewAbs,
        msFromNow: previewAbs.map(t => Math.round((t - now) * 1000)),
        beatStart: scheduledBeatStart,
        beatStartMsFromNow: scheduledBeatStart ? Math.round((scheduledBeatStart - now) * 1000) : null
      },
      input: {
        absolute: inputAbs,
        msFromNow: inputAbs.map(t => Math.round((t - now) * 1000))
      }
    };
  }

  function reset() {
    stop();
    console.log('%c🔧 Dev: Game reset', 'color: #ff0000;');
    setTimeout(() => start(), 100);
  }

  // Lightweight preview API for developer console: play a single tile pattern
  function previewTile(tile) {
    if (!tile || typeof tile !== 'number') return;
    // Do not disturb an active round
    if (state === 'input' || state === 'preview' || state === 'countdown') return;
    const patternDelays = pmAudioScheduler.getBeatPattern(tile);
    const now = safeNow();
    const preBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
    const guideStart = now;
    const beatStart = guideStart + preBuffer;

    // schedule audio and guide times
    pmAudioScheduler.playTileBeat(tile, beatStart);
    const oldState = state;
    const oldTile = currentTile;
    const oldScheduled = scheduledTimelineTimes.slice();
    const oldBeatStart = scheduledBeatStart;

    currentTile = tile;
    scheduledBeatStart = beatStart;
    scheduledTimelineTimes = patternDelays.map(d => beatStart + d);
    state = 'preview';

    const patternDuration = (patternDelays.length ? patternDelays[patternDelays.length - 1] : 0) + 0.25;
    const clearAfter = Math.max(0, (beatStart + patternDuration) - safeNow());

    // If the main render loop is not running (game not started), draw the guide once
    // so dev previews can show visuals without starting the full mode.
    try {
      if (typeof rafId === 'undefined' || !rafId) {
        if (guide && typeof guide.update === 'function' && typeof guide.draw === 'function') {
          const now = safeNow();
          const applyRolling = 0; // no rolling during preview
          guide.update({ timelineTimes: scheduledTimelineTimes, userPresses: [], rollingOffset: applyRolling, renderOffset: 0, leadTime, tolerance: getTimingTolerance(), visible: true });
          if (guideCanvas) {
            guideCanvas.hidden = false;
            // ensure canvas size matches expected drawing buffer
            try { guideCanvas.width = guideCanvas.clientWidth || guideCanvas.width; guideCanvas.height = guideCanvas.clientHeight || guideCanvas.height; } catch (e) {}
          }
          guide.draw(now);
        }
      }
    } catch (err) {
      // ignore preview drawing errors
    }

    setTimeout(() => {
      // restore previous state
      if (state === 'preview' && currentTile === tile) {
        state = oldState;
        currentTile = oldTile;
        scheduledTimelineTimes = oldScheduled.slice();
        scheduledBeatStart = oldBeatStart;
      }
      // hide guide canvas if the main game isn't running
      if ((typeof rafId === 'undefined' || !rafId) && guideCanvas) {
        guideCanvas.hidden = true;
      }
    }, Math.round(clearAfter * 1000));
    // return scheduled times (ms offsets from now) for dev preview
    const scheduledMs = patternDelays.map(d => Math.round((beatStart + d - now) * 1000));
    return scheduledMs;
  }

  return { start, stop, getState, devForceTile, devInjectJudgementFunc, devAddScoreFunc, reset, setGuideOptions, setRollingOffset, getGuideOptions, getRollingOffset, getScheduledGuideTimings };
}
