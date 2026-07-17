export function startBeatClick(scheduler, canvas, { onUpdateHUD, difficulty = {}, onGameEnd, soundEnabled = true } = {}) {
  const ctx = canvas.getContext('2d');
  const cues = [];
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let rafId = null;
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let missCount = 0;
  let totalOffset = 0;
  let forcedJudgement = null;
  let forcedPersistent = false;
  let pendingScoreAdd = 0;
  let mouseHandler = null;
  let gameEnded = false;

  const difficultyMode = difficulty.level || 'noob';
  const timingPresets = {
    noob: { perfect: 0.1, good: 0.2, leadTime: 1.5 },
    ez: { perfect: 0.08, good: 0.16, leadTime: 1.3 },
    veteran: { perfect: 0.05, good: 0.1, leadTime: 0.8 },
    experienced: { perfect: 0.035, good: 0.08, leadTime: 0.7 },
    expert: { perfect: 0.025, good: 0.05, leadTime: 0.6 },
    pro: { perfect: 0.018, good: 0.035, leadTime: 0.5 }
  };

  const settings = timingPresets[difficultyMode] || timingPresets.noob;
  const timingWindows = {
    perfect: typeof difficulty.perfect === 'number' ? difficulty.perfect : settings.perfect,
    good: typeof difficulty.good === 'number' ? difficulty.good : settings.good
  };
  const leadTime = typeof difficulty.leadTime === 'number' ? difficulty.leadTime : settings.leadTime;
  const cueRadius = 100;
  const cueLifetime = 0.5; // seconds to keep cue visible after beat

  function scheduleCue(beatTime) {
    const spawnTime = beatTime - leadTime;
    cues.push({ beatTime, spawnTime, hit: false });
  }

  scheduler.onBeat((beatTime) => {
    scheduleCue(beatTime);
  });

  function endRunAfterMiss() {
    if (gameEnded) return;
    gameEnded = true;
    stop();
    if (typeof onGameEnd === 'function') onGameEnd();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = scheduler.getCurrentTime();

    // Draw target circle
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, cueRadius, 0, Math.PI * 2);
    ctx.stroke();

    // draw cues
    for (let i = cues.length - 1; i >= 0; i--) {
      const c = cues[i];
      const timeSinceSpawn = now - c.spawnTime;
      const timeSinceBeat = now - c.beatTime;

      // Remove cues that are too old
      if (timeSinceBeat > cueLifetime) {
        cues.splice(i, 1);
        continue;
      }

      // Skip cues that haven't spawned yet
      if (timeSinceSpawn < 0) continue;

      const x = canvas.width / 2;
      const y = canvas.height / 2;

      // Calculate animation progress (0 to 1 during lead time, then stay at 1)
      const animationProgress = Math.min(timeSinceSpawn / leadTime, 1);
      const radius = cueRadius * (1 + 0.6 * (1 - animationProgress));

      // Calculate opacity (fade out near the end of lifetime)
      const timeLeft = cueLifetime - timeSinceBeat;
      const opacity = timeLeft < 0.5 ? timeLeft / 0.5 : 1;

      ctx.globalAlpha = opacity;
      ctx.beginPath();

      // olour based on hit status
      if (c.hit) {
        ctx.strokeStyle = '#00ff00'; // green for hit
      } else if (timeSinceBeat > 0) {
        ctx.strokeStyle = '#ff0000'; // red for active (past beat time)
      } else {
        ctx.strokeStyle = '#ffff00'; // yellow for approaching
      }

      ctx.lineWidth = 3;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Mark as missed if too late and not hit
      if (timeSinceBeat > timingWindows.good && !c.hit) {
        c.hit = true;
        lastJudgement = 'Miss';
        combo = 0;
        totalJudgements += 1;
        missCount += 1;
        totalOffset += timeSinceBeat;
        onUpdateHUD({
          score,
          combo,
          lastJudgement,
          accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
          precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
        });
        endRunAfterMiss();
        return;
      }
    }
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (mouseHandler) {
      canvas.removeEventListener('mousedown', mouseHandler);
      mouseHandler = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleInput() {
    mouseHandler = (e) => {
      const now = scheduler.getCurrentTime();
      // find nearest unhit cue, accept any timing if developer forced judgement
      let nearest = null;
      let bestDiff = Infinity;
      const maximumWindow = forcedJudgement ? Infinity : timingWindows.good;
      for (const c of cues) {
        if (c.hit) continue;
        const diff = Math.abs(now - c.beatTime);
        if (diff < bestDiff && diff <= maximumWindow) {
          bestDiff = diff;
          nearest = c;
        }
      }
      if (!nearest) {
        lastJudgement = 'Miss';
        combo = 0;
        totalJudgements += 1;
        missCount += 1;
        onUpdateHUD({
          score,
          combo,
          lastJudgement,
          accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
          precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
        });
        endRunAfterMiss();
        return;
      }
      nearest.hit = true;
      totalJudgements += 1;
      const diff = bestDiff;
      totalOffset += diff;

      if (forcedJudgement) {
        lastJudgement = forcedJudgement;
        if (forcedJudgement === 'Perfect') {
          score += 300;
          combo += 1;
          perfectCount += 1;
        } else if (forcedJudgement === 'Good') {
          score += 100;
          combo += 1;
          goodCount += 1;
        } else {
          combo = 0;
          missCount += 1;
        }
        if (!forcedPersistent) {
          forcedJudgement = null;
        }
        if (lastJudgement === 'Miss') {
          endRunAfterMiss();
          return;
        }
      } else if (diff <= timingWindows.perfect) {
        score += 300;
        combo += 1;
        lastJudgement = 'Perfect';
        perfectCount += 1;
      } else if (diff <= timingWindows.good) {
        score += 100;
        combo += 1;
        lastJudgement = 'Good';
        goodCount += 1;
      } else {
        combo = 0;
        lastJudgement = 'Miss';
        missCount += 1;
      }

      if (lastJudgement === 'Miss') {
        endRunAfterMiss();
        return;
      }

      if (pendingScoreAdd) {
        score += pendingScoreAdd;
        pendingScoreAdd = 0;
      }

      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
        precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
      });
    };
    canvas.addEventListener('mousedown', mouseHandler);
  }

  function start() {
    if (canvas) {
      canvas.classList.remove('pattern-memory-mode');
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.width = 800;
      canvas.height = 500;
    }
    render();
    handleInput();
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
        missCount,
        totalOffset
      }
    };
  }

  function devInjectJudgementFunc(judgement, options = {}) {
    forcedJudgement = judgement;
    forcedPersistent = Boolean(options.persistent);
  }

  function devAutoClickFunc(judgement) {
    if (gameEnded) return;
    const normalizedJudgement = ['Perfect', 'Good'].includes(judgement) ? judgement : 'Good';
    forcedJudgement = normalizedJudgement;
    forcedPersistent = true;
    if (mouseHandler) {
      mouseHandler(new MouseEvent('mousedown', { bubbles: true, clientX: canvas.width / 2, clientY: canvas.height / 2 }));
    }
  }

  function devAddScoreFunc(amount) {
    score += amount;
    onUpdateHUD({
      score,
      combo,
      lastJudgement,
      accuracy: Math.round(((perfectCount + goodCount) / Math.max(totalJudgements, 1)) * 100),
      precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
    });
  }

  function reset() {
    stop();
    score = 0;
    combo = 0;
    lastJudgement = '—';
    totalJudgements = 0;
    perfectCount = 0;
    goodCount = 0;
    missCount = 0;
    totalOffset = 0;
    cues.length = 0;
    forcedJudgement = null;
    forcedPersistent = false;
    pendingScoreAdd = 0;
    gameEnded = false;
    start();
  }

  return { start, stop, getState, devInjectJudgementFunc, devAutoClickFunc, devAddScoreFunc, reset };
}
