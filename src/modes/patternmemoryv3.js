// src/modes/patternmemory.js
import { AudioSchedulerPM } from '../audioPatternMemory.js';
import PatternGuide from '../patternGuide.js';
import { getPatternMemoryTimingTolerance } from '../timingConfig.js';
import { buildReactionBeatTargets, judgeTimedReactionBeat, summarizePatternMemoryRoundJudgement } from '../utils.js';

export function getPatternMemoryComboDelta(level = '', judgementLabel = '') {
  if (level === 'noob' && judgementLabel === 'Perfect') return 2;
  if (level === 'noob' && judgementLabel === 'Good') return 1;
  return 1;
}

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, onGameEnd, debug = false, customPattern = null, showGuide = true, hitboxLayers = null, timingOverrides = null } = {}) {
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
  let playbackSpeed = 1;

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
  let pressJudgements = [];
  let reactionTargetTimes = [];
  let clickCount = 0;
  let requiredClicks = 1;
  let hasPlayerInput = false;
  let devInjectJudgement = null;
  let devInjectPersistent = false;
  let devAddScore = 0;
  let inputTimeout = null;
  let roundSettlementTimer = null;
  const patternTimingOverrides = Array.isArray(timingOverrides) ? timingOverrides.slice() : null;
  // Latency calibration / rolling offset (seconds). Positive means display lags real time.
  let rollingOffset = 0; // seconds
  let scheduledTimelineTimes = [];
  let scheduledTimelineTimesInput = [];
  let scheduledBeatStart = null;
  let scheduledPreviewStart = null;

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
      const beatTimings = timelineTimes.map((_, beatIndex) => getTimingTolerance(beatIndex));
      const guideTargetTimes = reactionTargetTimes.length ? reactionTargetTimes : timelineTimes;
      guide.update({ timelineTimes, targetTimes: guideTargetTimes, userPresses, rollingOffset: applyRolling, renderOffset, leadTime, tolerance: getTimingTolerance(), visible: true, hitboxLayers: { miss: false, good: false, perfect: false }, beatTimings });
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

    const patternDelays = (pmAudioScheduler.getBeatPattern(currentTile) || []).map((delay) => delay / playbackSpeed);
    const now = safeNow();
    const preBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
    const guideStart = now;
    const beatStart = guideStart + preBuffer;
    scheduledBeatStart = beatStart;
    scheduledPreviewStart = guideStart;
    currentTileFlashTime = beatStart - leadTime;
    scheduledTimelineTimes = patternDelays.map(d => beatStart + d);

    pmAudioScheduler.playTileBeat(currentTile, beatStart, playbackSpeed);

    state = 'preview';

    setTimeout(() => {
      state = 'input';
      inputStartedAt = safeNow();
      expectedClickTimes = patternDelays.map((delay) => inputStartedAt + delay);
      scheduledTimelineTimesInput = expectedClickTimes.slice();
      userPresses = [];
      pressJudgements = [];
      reactionTargetTimes = buildReactionBeatTargets(expectedClickTimes, []);
      clickCount = 0;
      requiredClicks = expectedClickTimes.length || 1;
      hasPlayerInput = false;
      inputTimeout = setTimeout(() => {
        evaluateRound();
      }, inputWindow * 1000);
    }, (leadTime + showDuration) * 1000);
  }

  function judgePressTiming(clickTime, pressIndex) {
    const tolerance = getTimingTolerance();
    const perfectWindowMs = Number(guide.opts.perfectWindowMs) || tolerance.perfectWindowMs;
    const goodWindowMs = Number(guide.opts.goodWindowMs) || tolerance.goodWindowMs;

    const officialBeatTimeSeconds = expectedClickTimes[pressIndex];
    const previousPressTimeSeconds = userPresses[pressIndex - 1] ?? null;
    const previousOfficialBeatTimeSeconds = pressIndex > 0 ? expectedClickTimes[pressIndex - 1] : null;
    const adaptiveTargetTimes = buildReactionBeatTargets(expectedClickTimes, userPresses);
    const adaptiveTargetTimeSeconds = adaptiveTargetTimes[pressIndex] ?? officialBeatTimeSeconds;

    const judgement = judgeTimedReactionBeat({
      beatIndex: pressIndex,
      pressTimeSeconds: clickTime,
      officialBeatTimeSeconds,
      previousPressTimeSeconds,
      previousOfficialBeatTimeSeconds,
      perfectWindowMs,
      goodWindowMs,
      forcePerfect: currentTile === 1 && pressIndex === 0,
      targetTimeSeconds: adaptiveTargetTimeSeconds
    });

    return judgement;
  }

  function registerPress(clickTime) {
    if (state !== 'input' || hasPlayerInput || !validateClickTiming(clickTime)) {
      return false;
    }

    const judgement = judgePressTiming(clickTime, clickCount);
    userPresses.push(clickTime);
    pressJudgements.push(judgement);
    reactionTargetTimes = buildReactionBeatTargets(expectedClickTimes, userPresses);
    clickCount += 1;

    if (clickCount >= requiredClicks) {
      hasPlayerInput = true;
      evaluateRound();
    }

    return true;
  }

  function onKeyDown(e) {
    if (state !== 'input' || e.ctrlKey || e.altKey || e.metaKey || hasPlayerInput) return;
    const clickTime = safeNow();
    registerPress(clickTime);
  }

  function evaluateRound() {
    if (inputTimeout) {
      clearTimeout(inputTimeout);
      inputTimeout = null;
    }

    let judgement = 'Miss';
    if (devInjectJudgement) {
      judgement = devInjectJudgement;
      if (!devInjectPersistent) {
        devInjectJudgement = null;
      }
    } else {
      judgement = summarizePatternMemoryRoundJudgement(pressJudgements);
    }

    applyJudgement(judgement);
  }

  function applyJudgement(judgementLabel) {
    totalJudgements++;

    const judgement = { label: judgementLabel };

    if (judgement.label === 'Perfect') {
      perfectCount++;
      score += 300;
      combo += getPatternMemoryComboDelta(difficulty.level, judgement.label);
    } else if (judgement.label === 'Good') {
      goodCount++;
      score += 100;
      combo += getPatternMemoryComboDelta(difficulty.level, judgement.label);
    } else {
      combo = 0;
    }

    if (devAddScore) {
      score += devAddScore;
      devAddScore = 0;
    }

    lastJudgement = judgement.label;
    onUpdateHUDSafe();

    if (judgement.label === 'Miss') {
      state = 'gameover';
      lastJudgement = judgementLabel;
      onUpdateHUDSafe();
      if (inputTimeout) {
        clearTimeout(inputTimeout);
        inputTimeout = null;
      }
      if (roundSettlementTimer) {
        clearTimeout(roundSettlementTimer);
        roundSettlementTimer = null;
      }
      canvas.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 420 });
      setTimeout(() => {
        stop();
        if (typeof onGameEnd === 'function') onGameEnd();
      }, 600);
      return;
    }

    currentRound++;
    if (roundSettlementTimer) {
      clearTimeout(roundSettlementTimer);
    }
    roundSettlementTimer = setTimeout(() => {
      roundSettlementTimer = null;
      startRound();
    }, 500);
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

    if (px < canvas.width / 2) {
      const clickTime = safeNow();
      registerPress(clickTime);
    }
  }

  function handleSpaceInput() {
    const clickTime = safeNow();
    registerPress(clickTime);
  }

  function triggerGameOver() {
    if (state === 'gameover') return;
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
    if (roundSettlementTimer) {
      clearTimeout(roundSettlementTimer);
      roundSettlementTimer = null;
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

    if (clickCount > 0 && clickTime <= userPresses[clickCount - 1]) {
      return false;
    }

    return true;
  }

  function getTimingTolerance() {
    const difficultyLevel = difficulty.level || 'noob';
    const map = {
      noob: { perfectWindowMs: 20, goodWindowMs: 35 },
      ez: { perfectWindowMs: 18, goodWindowMs: 32 },
      veteran: { perfectWindowMs: 16, goodWindowMs: 28 },
      experienced: { perfectWindowMs: 14, goodWindowMs: 24 },
      expert: { perfectWindowMs: 12, goodWindowMs: 20 },
      pro: { perfectWindowMs: 10, goodWindowMs: 16 }
    };
    const preset = map[difficultyLevel] || map.noob;
    return {
      perfectWindowMs: preset.perfectWindowMs,
      goodWindowMs: preset.goodWindowMs,
      difficultyLevel
    };
  }

  function setPlaybackSpeed(speedMultiplier = 1) {
    playbackSpeed = Number.isFinite(Number(speedMultiplier)) ? Math.max(0.1, Number(speedMultiplier)) : 1;
  }

  function getPlaybackSpeed() {
    return playbackSpeed;
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

  function devAutoClickFunc(judgement) {
    if (state !== 'input' || hasPlayerInput) return;
    const normalizedJudgement = ['Perfect', 'Good'].includes(judgement) ? judgement : 'Good';
    const clickTime = safeNow();
    registerPress(clickTime);

    if (normalizedJudgement === 'Perfect') {
      score += 300;
      combo += 1;
      perfectCount += 1;
      lastJudgement = 'Perfect';
    } else {
      score += 100;
      combo += 1;
      goodCount += 1;
      lastJudgement = 'Good';
    }

    totalJudgements += 1;
    onUpdateHUDSafe();
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
    const patternDelays = (pmAudioScheduler.getBeatPattern(tile) || []).map((delay) => delay / playbackSpeed);
    const now = safeNow();
    const preBuffer = Math.min(Math.max(leadTime * guide.opts.preBufferPctOfLead, 0.2), 1.2);
    const guideStart = now;
    const beatStart = guideStart + preBuffer;

    // schedule audio and guide times
    pmAudioScheduler.playTileBeat(tile, beatStart, playbackSpeed);
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
        const now = safeNow();
        const applyRolling = 0; // no rolling during preview
        const beatTimings = scheduledTimelineTimes.map((_, beatIndex) => getTimingTolerance(beatIndex));
        guide.update({
          timelineTimes: scheduledTimelineTimes,
          userPresses: [],
          rollingOffset: applyRolling,
          renderOffset: 0,
          leadTime,
          tolerance: getTimingTolerance(),
          visible: true,
          hitboxLayers: hitboxLayers || undefined,
          beatTimings
        });
        if (guideCanvas) {
          guideCanvas.hidden = false;
          // ensure canvas size matches expected drawing buffer
          try { guideCanvas.width = guideCanvas.clientWidth || guideCanvas.width; guideCanvas.height = guideCanvas.clientHeight || guideCanvas.height; } catch (e) {}
        }
        guide.draw(now);
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

  return { start, stop, getState, handleSpaceInput, devForceTile, devInjectJudgementFunc, devAutoClickFunc, devAddScoreFunc, reset, setGuideOptions, setRollingOffset, getGuideOptions, getRollingOffset, getScheduledGuideTimings, setPlaybackSpeed, getPlaybackSpeed };
}
