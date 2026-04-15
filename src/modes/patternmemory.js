// src/modes/patternmemory.js
// Minimal scaffold for a Pattern Memory mode (future sprint).
// Shows a short sequence of visual beats the player must repeat.

export default function createPatternMemoryMode({ canvas, audioScheduler, onUpdateHUD, debug = false } = {}) {
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let sequence = [];
  let playIndex = 0;
  let playerIndex = 0;
  let state = 'idle'; // 'showing', 'waiting', 'done'
  let score = 0;
  let combo = 0;
  let lastJudgement = '—';

  function generateSequence(length = 4) {
    const arr = [];
    const now = audioScheduler.getCurrentTime();
    const spb = audioScheduler.secondsPerBeat;
    for (let i = 0; i < length; i++) {
      arr.push(now + 0.5 + i * spb);
    }
    return arr;
  }

  function start() {
    sequence = generateSequence(4);
    playIndex = 0;
    playerIndex = 0;
    state = 'showing';
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function handlePlayerInput() {
    // placeholder: in a full implementation we'd compare timing and order
    playerIndex++;
    if (playerIndex >= sequence.length) {
      state = 'done';
      lastJudgement = 'Complete';
      onUpdateHUD({ score, combo, lastJudgement });
    } else {
      lastJudgement = 'Next';
      onUpdateHUD({ score, combo, lastJudgement });
    }
  }

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
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#e6eef6';
    ctx.font = '16px system-ui';
    ctx.fillText('Pattern Memory (scaffold)', 12, 24);
    ctx.fillText(`State: ${state}`, 12, 48);
    rafId = requestAnimationFrame(render);
  }

  return {
    start,
    stop,
    getState: () => ({ score, combo, lastJudgement, state }),
    setDebug: (v) => { debug = !!v; }
  };
}
