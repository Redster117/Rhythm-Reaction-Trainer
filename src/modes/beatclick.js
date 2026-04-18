export function startBeatClick(scheduler, canvas, { onUpdateHUD, difficulty = {}, onGameEnd } = {}) {
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

  const difficultyMode = difficulty.level || 'noob';
  const timingPresets = {
    noob: { perfect: 0.25, good: 0.5, leadTime: 1.5 },
    ez: { perfect: 0.2, good: 0.4, leadTime: 1.3 },
    veteran: { perfect: 0.08, good: 0.15, leadTime: 0.8 },
    experienced: { perfect: 0.06, good: 0.12, leadTime: 0.7 },
    expert: { perfect: 0.04, good: 0.08, leadTime: 0.6 },
    pro: { perfect: 0.03, good: 0.06, leadTime: 0.5 }
  };

  const settings = timingPresets[difficultyMode] || timingPresets.noob;
  const timingWindows = { perfect: settings.perfect, good: settings.good };
  const leadTime = settings.leadTime;
  const cueRadius = 100;
  const cueLifetime = 0.5; // seconds to keep cue visible after beat

  function scheduleCue(beatTime) {
    const spawnTime = beatTime - leadTime;
    cues.push({ beatTime, spawnTime, hit: false });
  }

  scheduler.onBeat((beatTime) => {
    scheduleCue(beatTime);
  });

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
      }
    }
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleInput() {
    canvas.addEventListener('mousedown', (e) => {
      const now = scheduler.getCurrentTime();
      // find nearest unhit cue within timing window
      let nearest = null;
      let bestDiff = Infinity;
      for (const c of cues) {
        if (c.hit) continue;
        const diff = Math.abs(now - c.beatTime);
        if (diff < bestDiff && diff <= timingWindows.good) {
          bestDiff = diff;
          nearest = c;
        }
      }
      if (!nearest) {
        // No cue within timing window - it's a miss
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
        return;
      }
      nearest.hit = true;
      totalJudgements += 1;
      totalOffset += bestDiff;
      if (bestDiff <= timingWindows.perfect) {
        score += 300;
        combo += 1;
        lastJudgement = 'Perfect';
        perfectCount += 1;
      } else if (bestDiff <= timingWindows.good) {
        score += 100;
        combo += 1;
        lastJudgement = 'Good';
        goodCount += 1;
      }
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: Math.round(((perfectCount + goodCount) / totalJudgements) * 100),
        precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0
      });
    });
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

  return { start, stop };
}
