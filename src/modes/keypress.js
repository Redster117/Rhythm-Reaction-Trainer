// src/modes/keypress.js
import { playKeyPressBeat } from '../audioKeyPress.js';

function getPreferredKeyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Minus') return '-';
  if (code === 'Period') return '.';
  return code;
}

export default function startKeyPress({ canvas, audioScheduler, onUpdateHUD, onGameEnd, difficulty = {}, keybinds = {}, pattern = null, debug = false, keyboardOnly = true, soundEnabled = true, gifFile = null, keyOrder = null, customPattern = null, audioFile = null, isEasterEgg = false, showCountdown = false } = {}) {
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
  let forcedPersistent = false;
  let pendingScoreAdd = 0;
  let keysCurrentlyPressed = new Set();
  let easterEggAudio = null;
  let countdownTime = showCountdown ? 3 : 0; // 3 second countdown for easter eggs
  let countdownStartTime = null;
  let countdownEnded = false;

  const leadTime = typeof difficulty.leadTime === 'number' ? difficulty.leadTime : 0.6;
  const beatCount = typeof difficulty.patternBeats === 'number' ? difficulty.patternBeats : 8;
  const perfectWindow = typeof difficulty.perfect === 'number' ? difficulty.perfect : 0.12;
  const goodWindow = typeof difficulty.good === 'number' ? difficulty.good : 0.22;
  const maxWindow = goodWindow;
  const difficultyLevel = difficulty.level || 'noob';

  // Use custom key order if provided (for easter eggs), otherwise use keybinds
  let availableLabels = keyOrder && Array.isArray(keyOrder) ? keyOrder : (Object.keys(keybinds).length ? Object.keys(keybinds) : ['A', 'S', 'D', 'F']);
  const normalizedKeybinds = {};
  Object.keys(keybinds).forEach((label) => {
    normalizedKeybinds[label] = keybinds[label];
  });

  let gifBackground = null;
  let gifBackgroundElement = null;
  let gifEnded = false;
  let awaitingGifEnd = false;
  let keyHandler = null;
  let pointerHandler = null;
  let audioSchedulerWasSoundEnabled = null;

  function safeNow() {
    if (audioScheduler && typeof audioScheduler.getCurrentTime === 'function') {
      const currentTime = audioScheduler.getCurrentTime();
      if (audioScheduler.audioCtx && audioScheduler.audioCtx.state === 'suspended') {
        return performance.now() / 1000;
      }
      return currentTime;
    }
    return performance.now() / 1000;
  }

  function getDisplayKey(code) {
    return getPreferredKeyLabel(code);
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
    const baseCueSpacing = typeof difficulty.cueSpacing === 'number' ? difficulty.cueSpacing : spb;
    
    // If custom pattern is provided (easter egg), use it instead
    if (customPattern && Array.isArray(customPattern) && customPattern.length > 0) {
      let currentBeat = startTime;
      return customPattern.map((entry) => {
        const keysArray = Array.isArray(entry)
          ? entry
          : Array.isArray(entry.keys)
            ? entry.keys
            : [entry.keys];
        const delay = isEasterEgg && typeof entry.delay === 'number' ? entry.delay : 0;
        const beatTime = currentBeat + delay;
        currentBeat = beatTime;
        const label = keysArray[0];
        const code = normalizedKeybinds[label] || `Key${label}`;
        return {
          beatTime,
          label,
          code,
          keysRequired: keysArray,
          displayLabel: keysArray.join(''),
          spawnTime: beatTime - leadTime,
          hit: false
        };
      });
    }
    
    return Array.from({ length: count }, (_, index) => {
      const label = availableLabels[index % availableLabels.length];
      const code = normalizedKeybinds[label] || `Key${label}`;
      const beatTime = startTime + index * baseCueSpacing;
      return { beatTime, label, code, keysRequired: [label], spawnTime: beatTime - leadTime, hit: false };
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

  function endRunAfterMiss() {
    if (gameEnded) return;
    gameEnded = true;
    stop();
    if (typeof onGameEnd === 'function') onGameEnd();
  }

  function handleInput(eventTime, keyCode) {
    if (gameEnded) return;
    
    // Don't process input during countdown
    if (!countdownEnded) return;
    
    let nearest = null;
    let bestDiff = Infinity;

    for (const cue of cues) {
      if (cue.hit) continue;
      
      // Support simultaneous keys: check if the pressed key is one of the required keys
      const keysRequired = cue.keysRequired || [cue.label];
      let keyMatches = false;
      
      for (const requiredLabel of keysRequired) {
        const expectedCodes = [normalizedKeybinds[requiredLabel] || `Key${requiredLabel}`];
        if (/^[A-Z]$/.test(requiredLabel)) {
          expectedCodes.push(`Key${requiredLabel}`);
        }
        if (expectedCodes.includes(keyCode)) {
          keyMatches = true;
          break;
        }
      }
      
      if (!keyMatches) continue;

      const diff = Math.abs(eventTime - cue.beatTime);
      if (diff < bestDiff && diff <= maxWindow) {
        bestDiff = diff;
        nearest = cue;
      }
    }

    if (!nearest) {
      const firstPending = cues.find((cue) => !cue.hit);
      if (firstPending && eventTime < firstPending.spawnTime) {
        // Ignore presses before the next cue is active.
        return false;
      }
      combo = 0;
      lastJudgement = 'Miss';
      totalJudgements += 1;
      totalOffset += maxWindow;
      updateHUD();
      endRunAfterMiss();
      return false;
    }
    
    // For simultaneous keys, check if all required keys are pressed
    const keysRequired = nearest.keysRequired || [nearest.label];
    if (keysRequired.length > 1) {
      const requiredCodes = new Set();
      for (const label of keysRequired) {
        const code = normalizedKeybinds[label] || `Key${label}`;
        requiredCodes.add(code);
        if (/^[A-Z]$/.test(label)) {
          requiredCodes.add(`Key${label}`);
        }
      }
      
      // Check if all required keys are currently pressed
      let allPressed = true;
      for (const requiredCode of requiredCodes) {
        if (!keysCurrentlyPressed.has(requiredCode)) {
          allPressed = false;
          break;
        }
      }
      
      // If not all keys are pressed yet, don't register this as a hit
      if (!allPressed) {
        return false;
      }
    }
    
    // Check if auto-clicker is detected for debugging only; do not mute easter egg audio here.
    if (isEasterEgg && easterEggAudio && typeof window.isAutoClickerDetected !== 'undefined' && window.isAutoClickerDetected) {
      // no-op: keep easter egg audio playing even when auto-clicker is detected
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
      if (!forcedPersistent) {
        forcedJudgement = null;
      }
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

    if (lastJudgement === 'Miss') {
      endRunAfterMiss();
      return false;
    }

    if (pendingScoreAdd) {
      score += pendingScoreAdd;
      pendingScoreAdd = 0;
    }

    updateHUD();
    return true;
  }

  function handleKeyDown(e) {
    if (['Enter', 'Backspace'].includes(e.code)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (gameEnded) return;
      handlePointerDown();
      return;
    }
    const nowKey = safeNow();
    const boundCodes = Object.values(normalizedKeybinds);
    if (boundCodes.length) {
      const normalizedCode = e.code;
      const accepted = boundCodes.some((code) => code === normalizedCode || (code.length === 1 && normalizedCode === `Key${code}`));
      if (!accepted) return;
    }
    e.preventDefault();
    
    // Track currently pressed keys for simultaneous key detection
    keysCurrentlyPressed.add(e.code);
    
    handleInput(nowKey, e.code);
  }
  
  function handleKeyUp(e) {
    keysCurrentlyPressed.delete(e.code);
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
      endRunAfterMiss();
      return false;
    }
    return handleInput(nowPtr, nearest.code);
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
    forcedPersistent = false;
    pendingScoreAdd = 0;
    cues = [];
    countdownTime = showCountdown ? 3 : 0;
    countdownStartTime = showCountdown ? safeNow() : null;
    countdownEnded = !showCountdown;

    // Load GIF/video if provided (easter egg)
    if (gifFile) {
      const isVideo = typeof gifFile === 'string' && gifFile.match(/\.(mp4|webm|ogg)$/i);
      if (isVideo) {
        gifBackgroundElement = document.createElement('video');
        gifBackgroundElement.muted = true;
        // For easter egg runs we want the video to play through once and then end;
        // otherwise keep looping for decorative gifs.
        gifBackgroundElement.loop = !isEasterEgg;
        gifBackgroundElement.autoplay = false;
        gifBackgroundElement.playsInline = true;
        gifBackgroundElement.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;visibility:hidden;';
        gifBackgroundElement.crossOrigin = 'anonymous';
        gifBackgroundElement.preload = 'auto';
        gifBackgroundElement.src = gifFile;
        gifBackgroundElement.addEventListener('canplay', () => {
          // Keep the hidden video ready for drawImage once audio starts.
        });
        gifBackgroundElement.addEventListener('ended', () => {
          gifEnded = true;
          if (awaitingGifEnd) {
            // finalize the run when video ends
            gameEnded = true;
            if (onGameEnd) {
              setTimeout(() => onGameEnd(), 1000);
            }
            stop();
          }
        });
        document.body.appendChild(gifBackgroundElement);
        gifBackground = gifBackgroundElement;
        gifBackgroundElement.load();
      } else {
        gifBackgroundElement = document.createElement('img');
        gifBackgroundElement.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;visibility:hidden;';
        gifBackgroundElement.src = gifFile;
        document.body.appendChild(gifBackgroundElement);
        gifBackground = gifBackgroundElement;
      }
    }

    const now = safeNow();
    const delayAfterCountdown = showCountdown ? 2.35 : 0.0; // only add extra startup buffer for easter egg video/audio runs
    const startAt = now + Math.max(leadTime, 0) + countdownTime + delayAfterCountdown;
    const patternData = pattern
      ? pattern.map((offset, index) => {
          const label = availableLabels[index % availableLabels.length];
          const code = normalizedKeybinds[label] || `Key${label}`;
          const adjustedBeatTime = startAt + (difficulty.timingOffset || 0) + offset;
          return { beatTime: adjustedBeatTime, label, code, spawnTime: adjustedBeatTime - leadTime, hit: false };
        })
      : generatePattern(startAt, beatCount);

    spawnPattern(patternData);

    // If this is an easter egg, disable scheduler sounds for the run so only the easter audio plays.
    if (isEasterEgg && audioFile) {
      if (audioScheduler) {
        audioSchedulerWasSoundEnabled = audioScheduler.soundEnabled;
        audioScheduler.setSoundEnabled(false);
        if (audioScheduler.audioCtx && audioScheduler.audioCtx.state === 'running') {
          audioScheduler.audioCtx.suspend().catch(() => {});
        }
        if (typeof audioScheduler.stopScheduler === 'function') {
          audioScheduler.stopScheduler();
        }
      }

      easterEggAudio = new Audio(audioFile);
      easterEggAudio.preload = 'auto';
      easterEggAudio.crossOrigin = 'anonymous';
      easterEggAudio.volume = 1;
      easterEggAudio.muted = true;
      easterEggAudio.playsInline = true;
      easterEggAudio.load();
      easterEggAudio.play().catch(() => {
        // This initial muted play helps unlock audio playback for later unmuted play.
      });

      // Delay full audio and video start until after countdown
      const audioPlayDelay = countdownTime * 1000;
      setTimeout(() => {
        if (easterEggAudio && !gameEnded) {
          if (!easterEggAudio.paused) {
            easterEggAudio.pause();
          }
          easterEggAudio.currentTime = 0;
          easterEggAudio.muted = false;
          easterEggAudio.play().catch(() => {
            console.log('Failed to play easter egg audio:', audioFile);
          });
        }

        if (gifBackgroundElement && gifBackgroundElement.tagName === 'VIDEO') {
          gifBackgroundElement.currentTime = 0;
          gifBackgroundElement.play().catch(() => {
            // Play may be blocked until user interaction but should be unlocked by the initial audio gesture.
          });
        }
      }, audioPlayDelay);
    } else {
      // Schedule audio beats directly at cue beat times when sound is enabled.
      // Skip beat scheduling during countdown to avoid repetitive sounds
      const audioAllowed = soundEnabled && audioScheduler && audioScheduler.audioCtx && audioScheduler.audioCtx.state !== 'closed' && (typeof audioScheduler.soundEnabled === 'undefined' || audioScheduler.soundEnabled);
      if (audioAllowed && !showCountdown) {
        patternData.forEach((cue) => {
          const timeUntilBeat = cue.beatTime - safeNow();
          const audioScheduleTime = audioScheduler.audioCtx.currentTime + timeUntilBeat;
          playKeyPressBeat(audioScheduler.audioCtx, audioScheduleTime);
        });
      }
    }

    keyHandler = handleKeyDown;
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keyup', handleKeyUp);

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
      window.removeEventListener('keyup', handleKeyUp);
      keyHandler = null;
    }
    if (pointerHandler) {
      canvas.removeEventListener('pointerdown', pointerHandler);
      pointerHandler = null;
    }
    if (gifBackground) {
      gifBackground = null;
    }
    if (easterEggAudio) {
      easterEggAudio.pause();
      easterEggAudio.currentTime = 0;
      easterEggAudio = null;
    }
    if (gifBackgroundElement && gifBackgroundElement.parentNode) {
      gifBackgroundElement.parentNode.removeChild(gifBackgroundElement);
      gifBackgroundElement = null;
      gifBackground = null;
    }
    if (audioScheduler && typeof audioScheduler.setSoundEnabled === 'function' && audioSchedulerWasSoundEnabled !== null) {
      audioScheduler.setSoundEnabled(audioSchedulerWasSoundEnabled);
      audioSchedulerWasSoundEnabled = null;
    }
    keysCurrentlyPressed.clear();
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // Draw GIF/video background if available (easter egg), otherwise black background
    if (gifBackground && ((gifBackground.complete) || (gifBackground.readyState && gifBackground.readyState >= 2))) {
      ctx.drawImage(gifBackground, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0b0c0e';
      ctx.fillRect(0, 0, w, h);
    }

    // Handle countdown timer
    if (showCountdown && !countdownEnded) {
      const elapsed = safeNow() - countdownStartTime;
      const remaining = Math.max(0, countdownTime - elapsed);
      
      if (remaining <= 0) {
        countdownEnded = true;
      } else {
        // Draw countdown numbers only (no black overlay)
        const countdownDisplay = Math.ceil(remaining);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 120px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countdownDisplay.toString(), w / 2, h / 2);
        
        rafId = requestAnimationFrame(render);
        return;
      }
    }
    
    const now = safeNow();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const x = w * (i + 0.5) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

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
          endRunAfterMiss();
          return;
        }
        cues.splice(i, 1);
        continue;
      }

      const progress = Math.min(Math.max(t, 0), 1);
      const y = h * 0.1 + progress * (h * 0.8);
      const requiredLabels = cue.keysRequired || [cue.label];

      requiredLabels.forEach((label) => {
        const x = getLaneX(label);
        const keyColor = getKeyColor(label);
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
        ctx.fillText(label, x, y);
      });
    }

    if (cues.length === 0 && totalJudgements > 0 && !gameEnded) {
      // If an easter-egg video is playing, wait until the video ends before ending the run.
      if (gifBackgroundElement && gifBackgroundElement.tagName === 'VIDEO' && !gifEnded) {
        awaitingGifEnd = true;
        // ensure video is playing
        try {
          if (gifBackgroundElement.paused) {
            gifBackgroundElement.currentTime = 0;
            gifBackgroundElement.play().catch(() => {});
          }
        } catch (e) {}
      } else {
        gameEnded = true;
        if (onGameEnd) {
          setTimeout(() => onGameEnd(), 1000);
        }
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

  function devInjectJudgementFunc(judgement, options = {}) {
    forcedJudgement = judgement;
    forcedPersistent = Boolean(options.persistent);
  }

  function getNextAutoClickTiming() {
    if (gameEnded) return null;
    const now = safeNow();
    const pendingCue = cues.find((cue) => !cue.hit);
    if (!pendingCue) return null;

    const timeUntilBeat = pendingCue.beatTime - now;
    const canClickNow = timeUntilBeat <= 0.06 && timeUntilBeat >= -goodWindow;

    return {
      beatTime: pendingCue.beatTime,
      timeUntilBeat,
      canClickNow,
      cue: pendingCue
    };
  }

  function devAutoClickFunc(judgement) {
    if (gameEnded) return false;
    const normalizedJudgement = ['Perfect', 'Good'].includes(judgement) ? judgement : 'Good';
    const timingInfo = getNextAutoClickTiming();

    if (!timingInfo) {
      return false;
    }

    if (!timingInfo.canClickNow) {
      return false;
    }

    const previousForcedJudgement = forcedJudgement;
    const previousForcedPersistent = forcedPersistent;
    const previousKeys = new Set(keysCurrentlyPressed);

    // For simultaneous cues, simulate all required keys being pressed.
    const requiredLabels = timingInfo.cue.keysRequired || [timingInfo.cue.label];
    requiredLabels.forEach((label) => {
      const code = normalizedKeybinds[label] || `Key${label}`;
      keysCurrentlyPressed.add(code);
      if (/^[A-Z]$/.test(label)) {
        keysCurrentlyPressed.add(`Key${label}`);
      }
    });

    forcedJudgement = normalizedJudgement;
    forcedPersistent = true;

    const success = handleInput(safeNow(), timingInfo.cue.code);

    forcedJudgement = previousForcedJudgement;
    forcedPersistent = previousForcedPersistent;
    keysCurrentlyPressed.clear();
    previousKeys.forEach((pressedKey) => keysCurrentlyPressed.add(pressedKey));

    return Boolean(success);
  }

  function devAddScoreFunc(amount) {
    if (typeof amount === 'number') {
      score += amount;
      updateHUD();
    }
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
    devAutoClickFunc,
    devAddScoreFunc,
    reset,
    setDebug: (v) => { debug = !!v; },
    getNextAutoClickTiming,
    isEasterEgg: isEasterEgg
  };
}
