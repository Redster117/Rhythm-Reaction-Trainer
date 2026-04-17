// src/modes/patternmemory.js
import { getJudgement } from '../utils.js';

export default function startPatternMemory({ canvas, audioScheduler, onUpdateHUD, difficulty = {}, onGameEnd, debug = false } = {}) {
  const ctx = canvas.getContext('2d');

  const DIFFICULTY_MAP = {
    noob: { grid: 2, patternStart: 2 },
    ez: { grid: 2, patternStart: 3 },
    veteran: { grid: 4, patternStart: 4 },
    experienced: { grid: 4, patternStart: 5 },
    expert: { grid: 6, patternStart: 6 },
    pro: { grid: 6, patternStart: 8 }
  };

  const diffKey = difficulty.level || 'veteran';
  const cfg = DIFFICULTY_MAP[diffKey] || DIFFICULTY_MAP.veteran;

  const COLOURS = [
    '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6', '#af52de'
  ];

  let rafId = null;
  let cols = cfg.grid;
  let rows = cfg.grid;
  let totalTiles = cols * rows;
  let grid = [];
  let emptyIndex = totalTiles - 1;
  let faces = difficulty.faces && Array.isArray(difficulty.faces) && difficulty.faces.length ? difficulty.faces.slice() : COLOURS.slice(0, 4);
  let padding = 8;
  let tileSize = 0;

  let patternLength = typeof difficulty.patternStart === 'number' ? difficulty.patternStart : cfg.patternStart;
  let sequence = [];
  let diePattern = [];
  let showSchedule = [];

  const leadTime = typeof difficulty.leadTime === 'number' ? difficulty.leadTime : 0.6;
  const showStepDuration = 0.55;
  const tolerance = 0.12;

  let state = 'idle';
  let currentStep = 0;

  let score = 0;
  let combo = 0;
  let lastJudgement = '—';
  let totalJudgements = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let totalOffset = 0;

  const dieGrid = document.getElementById('die-grid');
  const legendColors = document.getElementById('legend-colors');
  const legendNumbers = document.getElementById('legend-numbers');
  const tutorialGif = document.getElementById('pattern-tutorial-gif');

  function safeNow() {
    return audioScheduler && typeof audioScheduler.getCurrentTime === 'function' ? audioScheduler.getCurrentTime() : performance.now() / 1000;
  }

  function indexToXY(index) { return { x: index % cols, y: Math.floor(index / cols) }; }
  function xyToIndex(x, y) { return y * cols + x; }
  function findTileByPos(pos) { return grid.find(t => t.pos === pos); }
  function findTileById(id) { return grid.find(t => t.id === id); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function initGrid() {
  grid = [];
  totalTiles = cols * rows;

  // create tiles with default face indices
  for (let i = 0; i < totalTiles; i++) {
    if (i === totalTiles - 1) {
      emptyIndex = i;
      grid.push({ id: `empty`, pos: i, faceIndex: -1, isEmpty: true, anim: null });
    } else {
      const faceIndex = i % faces.length;
      grid.push({ id: `t${i}`, pos: i, faceIndex, isEmpty: false, anim: null });
    }
  }

  // Shuffle non-empty tiles' positions randomly (keep empty at last index)
  const nonEmptyTiles = grid.filter(t => !t.isEmpty);
  const positions = nonEmptyTiles.map(t => t.pos);
  // Fisher-Yates shuffle positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  // assign shuffled positions back to tiles
  for (let i = 0; i < nonEmptyTiles.length; i++) {
    nonEmptyTiles[i].pos = positions[i];
  }
  // ensure emptyIndex remains the last cell
  emptyIndex = totalTiles - 1;
  const emptyTile = grid.find(t => t.isEmpty);
  if (emptyTile) emptyTile.pos = emptyIndex;

  // render legend and die placeholders
  renderLegend();
  renderDiePanelPlaceholder();
}


  function getNeighbors(index) {
    const n = [];
    const { x, y } = indexToXY(index);
    if (x > 0) n.push(xyToIndex(x - 1, y));
    if (x < cols - 1) n.push(xyToIndex(x + 1, y));
    if (y > 0) n.push(xyToIndex(x, y - 1));
    if (y < rows - 1) n.push(xyToIndex(x, y + 1));
    return n;
  }

  function isAdjacentGrid(a, b) {
    const ax = a % cols, ay = Math.floor(a / cols);
    const bx = b % cols, by = Math.floor(b / cols);
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }

  function slideTileToEmpty(tilePos, animate = true) {
    const tile = findTileByPos(tilePos);
    if (!tile || tile.isEmpty) return false;
    if (!isAdjacentGrid(tile.pos, emptyIndex)) return false;
    const from = tile.pos;
    const to = emptyIndex;
    tile.pos = to;
    const emptyTile = findTileByPos(to);
    if (emptyTile) emptyTile.pos = from;
    emptyIndex = from;
    if (animate) tile.anim = { from, to, start: performance.now(), dur: 180 };
    return true;
  }

  function flipTileAt(pos, animate = true) {
    const tile = findTileByPos(pos);
    if (!tile || tile.isEmpty) return false;
    const next = (tile.faceIndex + 1) % faces.length;
    tile.anim = { flip: true, start: performance.now(), dur: 220, nextFace: next };
    return true;
  }

  function seededRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function generateDiePattern(seed, facesCount = 4) {
    const rng = seededRng(seed || Math.floor(Math.random() * 1e9));
    const pattern = [];
    for (let i = 0; i < facesCount; i++) pattern.push(1 + Math.floor(rng() * 7));
    return pattern;
  }

  function mapDieToCells(diePattern) {
    const mapping = [];
    const nonEmpty = grid.filter(t => !t.isEmpty).slice(0, diePattern.length);
    for (let i = 0; i < diePattern.length; i++) {
      const tile = nonEmpty[i];
      mapping.push({ tileId: tile.id, cellIndex: tile.pos, colourIndex: diePattern[i] });
    }
    return mapping;
  }

  function chooseInteractionType() {
  // Only produce 'tap' or 'flip' interactions now (no sliding)
  if (diffKey === 'noob' || diffKey === 'ez') return 'tap';
  if (diffKey === 'veteran' || diffKey === 'experienced') {
    return Math.random() < 0.6 ? 'flip' : 'tap';
  }
  // expert / pro: mostly flip, occasional tap
  return Math.random() < 0.8 ? 'flip' : 'tap';
  }

  function generateSequenceFromDie(diePattern, length = patternLength) {
    const mapping = mapDieToCells(diePattern);
    const seq = [];
    for (let i = 0; i < length; i++) {
      const m = mapping[i % mapping.length];
      const interactionType = chooseInteractionType();
      seq.push({ tileId: m.tileId, targetPos: m.cellIndex, colourIndex: m.colourIndex, interactionType });
    }
    return seq;
  }

  function buildShowSchedule(seq) {
    showSchedule = [];
    const now = safeNow();
    const secondsPerBeat = audioScheduler && audioScheduler.secondsPerBeat ? audioScheduler.secondsPerBeat : 0.5;
    const startAt = now + 0.6;
    for (let i = 0; i < seq.length; i++) {
      const beatTime = startAt + i * secondsPerBeat;
      const spawnTime = beatTime - leadTime;
      showSchedule.push({
        beatTime,
        spawnTime,
        cellIndex: seq[i].targetPos,
        colourIndex: seq[i].colourIndex,
        interactionType: seq[i].interactionType,
        shown: false
      });
    }
  }

  function renderLegend() {
    if (!legendColors || !legendNumbers) return;
    legendColors.innerHTML = '';
    legendNumbers.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const sw = document.createElement('div');
      sw.className = 'legend-swatch';
      sw.style.background = COLOURS[i];
      legendColors.appendChild(sw);
      const num = document.createElement('div');
      num.textContent = (i + 1).toString();
      num.style.width = '26px';
      num.style.textAlign = 'center';
      legendNumbers.appendChild(num);
    }
  }

  function renderDiePanelPlaceholder() {
    if (!dieGrid) return;
    dieGrid.innerHTML = '';
    const facesCount = Math.min(4, cols * rows - 1);
    for (let i = 0; i < facesCount; i++) {
      const d = document.createElement('div');
      d.className = 'die-face';
      d.textContent = '-';
      dieGrid.appendChild(d);
    }
  }

  function updateDiePanel(pattern) {
    if (!dieGrid) return;
    dieGrid.innerHTML = '';
    for (let i = 0; i < pattern.length; i++) {
      const idx = pattern[i] - 1;
      const d = document.createElement('div');
      d.className = 'die-face';
      d.style.background = COLOURS[idx];
      d.textContent = pattern[i].toString();
      dieGrid.appendChild(d);
    }
  }

  function render() {
    const now = safeNow();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, w, h);

    const usableW = w - padding * 2;
    tileSize = Math.min(usableW / cols, h - padding * 2);
    const startX = (w - tileSize * cols) / 2;
    const startY = (h - tileSize * rows) / 2;

    for (const tile of grid) renderTile(tile, startX, startY, performance.now());

    if (state === 'showing') {
      for (let i = 0; i < showSchedule.length; i++) {
        const item = showSchedule[i];
        const tSpawn = item.spawnTime;
        const tBeat = item.beatTime;
        const highlightDur = showStepDuration;
        if (now < tSpawn) continue;
        const timeSinceSpawn = now - tSpawn;
        const timeSinceBeat = now - tBeat;
        const pos = item.cellIndex;
        const x = startX + (pos % cols) * tileSize;
        const y = startY + Math.floor(pos / cols) * tileSize;

        if (now < tBeat) {
          const progress = Math.min(1, timeSinceSpawn / (tBeat - tSpawn));
          const radius = tileSize * (0.35 + 0.25 * (1 - progress));
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = COLOURS[item.colourIndex - 1];
          ctx.beginPath();
          ctx.arc(x + tileSize / 2, y + tileSize / 2, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (timeSinceBeat <= highlightDur) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = COLOURS[item.colourIndex - 1];
          roundRect(ctx, x + 6, y + 6, tileSize - 12, tileSize - 12, 8);
          ctx.fill();
          if (!item.shown) {
            item.shown = true;
            pulseDieFace(item.colourIndex);
          }
        }
      }
    }

    ctx.fillStyle = '#e6eef6';
    ctx.font = '14px system-ui';
    ctx.fillText(`Level: ${patternLength}`, 12, 20);
    ctx.fillText(`Score: ${score}`, 12, 40);
    ctx.fillText(`Last: ${lastJudgement}`, 12, 60);
    ctx.fillText(`State: ${state}`, 12, 80);

    rafId = requestAnimationFrame(render);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTileAt(tile, x, y, size) {
    const pad = 6;
    if (tile.isEmpty) {
      ctx.fillStyle = '#0b0c0e';
      ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
      ctx.strokeStyle = '#222';
      ctx.strokeRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
      return;
    }
    ctx.save();
    ctx.translate(x + pad, y + pad);
    const face = faces[tile.faceIndex] || '#888';
    roundRect(ctx, 0, 0, size - pad * 2, size - pad * 2, 8);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#071226';
    ctx.font = `${Math.max(12, (size - pad * 2) * 0.22)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.id.replace('t', ''), (size - pad * 2) / 2, (size - pad * 2) / 2);
    ctx.restore();
  }

  function drawFlippingTile(tile, x, y, size, t) {
    const half = 0.5;
    const scale = Math.cos((t) * Math.PI) * 0.9;
    const absScale = Math.abs(scale);
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(absScale, 1);
    const face = t < half ? faces[tile.faceIndex] : faces[tile.anim && tile.anim.nextFace !== undefined ? tile.anim.nextFace : tile.faceIndex];
    roundRect(ctx, -(size - 12) / 2, -(size - 12) / 2, size - 12, size - 12, 8);
    ctx.fillStyle = face || '#888';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (t >= 1 && tile.anim && tile.anim.nextFace !== undefined) {
      tile.faceIndex = tile.anim.nextFace;
      tile.anim = null;
    }
  }

  function renderTile(tile, startX, startY, nowMs) {
    if (tile.anim && tile.anim.from !== undefined && tile.anim.to !== undefined) {
      const t = Math.min(1, (nowMs - tile.anim.start) / tile.anim.dur);
      const fromX = (tile.anim.from % cols) * tileSize;
      const toX = (tile.anim.to % cols) * tileSize;
      const fromY = Math.floor(tile.anim.from / cols) * tileSize;
      const toY = Math.floor(tile.anim.to / cols) * tileSize;
      const curX = fromX + (toX - fromX) * easeOutCubic(t);
      const curY = fromY + (toY - fromY) * easeOutCubic(t);
      drawTileAt(tile, startX + curX, startY + curY, tileSize);
      if (t >= 1) tile.anim = null;
      return;
    }
    if (tile.anim && tile.anim.flip) {
      const t = Math.min(1, (nowMs - tile.anim.start) / tile.anim.dur);
      drawFlippingTile(tile, startX + (tile.pos % cols) * tileSize, startY + Math.floor(tile.pos / cols) * tileSize, tileSize, t);
      return;
    }
    drawTileAt(tile, startX + (tile.pos % cols) * tileSize, startY + Math.floor(tile.pos / cols) * tileSize, tileSize);
  }

  function pulseDieFace(colourIndex) {
    if (!dieGrid) return;
    const children = Array.from(dieGrid.children);
    for (const c of children) {
      if (c.textContent === String(colourIndex) || c.style.background === COLOURS[colourIndex - 1]) {
        c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 360 });
        break;
      }
    }
  }

  function startShowingSequence() {
    diePattern = generateDiePattern(Math.floor(Math.random() * 1e9), Math.min(4, cols * rows - 1));
    updateDiePanel(diePattern);
    sequence = generateSequenceFromDie(diePattern, patternLength);
    buildShowSchedule(sequence);
    if (tutorialGif) tutorialGif.hidden = false;
    state = 'showing';
    currentStep = 0;
    const last = showSchedule.length ? showSchedule[showSchedule.length - 1] : null;
    const lastEnd = last ? last.beatTime + showStepDuration : safeNow() + 0.5;
    const delayMs = Math.max(0, (lastEnd - safeNow()) * 1000) + 80;
    setTimeout(() => {
      if (tutorialGif) tutorialGif.hidden = true;
      state = 'input';
      currentStep = 0;
      onUpdateHUDSafe();
    }, delayMs);
  }

function handlePlayerAction(clickedIndex) {
  if (state !== 'input') return;
  const now = safeNow();
  const expected = showSchedule[currentStep];
  if (!expected) return;

  // Compute timing diff for scoring/judgement only (no game over)
  const diff = now - expected.beatTime;

  // Perform click semantics: always flip the clicked tile (no sliding)
  // If the clicked cell is the empty cell, do nothing.
  const clickedTile = findTileByPos(clickedIndex);
  if (!clickedTile || clickedTile.isEmpty) {
    onUpdateHUDSafe();
    return;
  }
  flipTileAt(clickedIndex, true);

  // Check if current step satisfied (tile in target pos and correct face)
  const elem = sequence[currentStep];
  const tile = findTileById(elem.tileId);
  if (tile && tile.pos === elem.targetPos && tile.faceIndex === (elem.colourIndex - 1) % faces.length) {
    const judgement = getJudgement(Math.abs(diff));
    totalJudgements++;
    totalOffset += Math.abs(diff);
    if (judgement.label === 'Perfect') perfectCount++;
    if (judgement.label === 'Good') goodCount++;
    if (judgement.points > 0) {
      score += judgement.points;
      combo += 1;
    } else {
      combo = 0;
    }
    lastJudgement = judgement.label;
    currentStep++;
    onUpdateHUDSafe();

    if (currentStep >= sequence.length) {
      setTimeout(() => {
        patternLength = Math.min(totalTiles - 1, patternLength + 1);
        startShowingSequence();
      }, 700);
    }
  } else {
    // Not yet satisfied — update HUD and allow further flips
    onUpdateHUDSafe();
  }
}

  function triggerGameOver() {
    state = 'gameover';
    lastJudgement = 'Off-beat - Game Over';
    onUpdateHUDSafe();
    canvas.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 420 });
    setTimeout(() => {
      stop();
      if (typeof onGameEnd === 'function') onGameEnd();
    }, 600);
  }

  function onPointerDown(e) {
    if (state !== 'input') return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const idx = hitTest(px, py);
    if (idx === null) return;
    handlePlayerAction(idx);
  }

  function hitTest(px, py) {
    const w = canvas.width;
    const h = canvas.height;
    const usableW = w - padding * 2;
    tileSize = Math.min(usableW / cols, h - padding * 2);
    const startX = (w - tileSize * cols) / 2;
    const startY = (h - tileSize * rows) / 2;
    if (py < startY || py > startY + tileSize * rows) return null;
    if (px < startX || px > startX + tileSize * cols) return null;
    const col = Math.floor((px - startX) / tileSize);
    const row = Math.floor((py - startY) / tileSize);
    return xyToIndex(col, row);
  }

  function onUpdateHUDSafe() {
    if (typeof onUpdateHUD === 'function') {
      onUpdateHUD({
        score,
        combo,
        lastJudgement,
        accuracy: totalJudgements ? Math.round(((perfectCount + goodCount) / totalJudgements) * 100) : 100,
        precision: totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0,
        level: patternLength,
        step: currentStep + 1,
        totalSteps: sequence.length
      });
    }
  }

  function start() {
    cols = cfg.grid;
    rows = cfg.grid;
    totalTiles = cols * rows;
    initGrid();
    canvas.addEventListener('pointerdown', onPointerDown);
    startShowingSequence();
    rafId = requestAnimationFrame(render);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    canvas.removeEventListener('pointerdown', onPointerDown);
    state = 'idle';
    if (tutorialGif) tutorialGif.hidden = true;
  }

  function reset() {
    stop();
    initGrid();
    sequence = [];
    showSchedule = [];
    state = 'idle';
  }

  function getState() {
    return {
      score,
      combo,
      lastJudgement,
      state,
      patternLength,
      sequence: sequence.slice(),
      diePattern: diePattern.slice(),
      totals: { totalJudgements, perfectCount, goodCount, totalOffset }
    };
  }

  function setDebug(v) { debug = !!v; }

  return { start, stop, reset, getState, setDebug };
}
