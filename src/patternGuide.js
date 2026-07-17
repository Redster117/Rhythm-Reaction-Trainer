// src/patternGuide.js
// A small, well-documented pattern guide renderer used by Pattern Memory mode.
// Exported as a single class so it's easy to understand and alter.

export default class PatternGuide {
  /**
   * @param {CanvasRenderingContext2D} ctx - canvas context to draw on
   * @param {HTMLCanvasElement} canvas - canvas element (used for sizing)
   * @param {Object} opts - optional configuration
   */
  constructor(ctx, canvas, opts = {}) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.opts = Object.assign({
      xPct: 0.75, // guide X relative to canvas (right side)
      y: 80,
      minWidth: 140,
      height: 48,
      preBufferPctOfLead: 0, // preBuffer = leadTime * this
      debug: true,
      hitboxLayers: {
        miss: true,
        good: true,
        perfect: true
      }
    }, opts);
    if (opts.hitboxLayers) {
      this.opts.hitboxLayers = Object.assign({ miss: true, good: true, perfect: true }, opts.hitboxLayers);
    }

    // Data populated by caller
    this.timelineTimes = []; // absolute times (seconds)
    this.userPresses = [];
    this.rollingOffset = 0; // seconds
    this.renderOffset = 0; // seconds, used for phase-specific dot start positioning
    this.leadTime = 0.8;
    this.tolerance = { perfect: 0.25, good: 1.5 };
    this.beatTimings = [];
    this.visible = true;
  }

  // Merge new options at runtime
  setOptions(opts = {}) {
    this.opts = Object.assign({}, this.opts, opts);
  }

  // Provide timeline times and optional state
  update({ timelineTimes = [], userPresses = [], rollingOffset = 0, renderOffset = 0, leadTime = 0.8, tolerance = null, visible = true, hitboxLayers = null, beatTimings = null } = {}) {
    this.timelineTimes = timelineTimes.slice();
    this.userPresses = userPresses.slice();
    this.rollingOffset = rollingOffset;
    this.renderOffset = renderOffset;
    this.leadTime = leadTime;
    this.visible = visible;
    if (tolerance) this.tolerance = tolerance;
    if (Array.isArray(beatTimings)) {
      this.beatTimings = beatTimings.slice();
    } else {
      this.beatTimings = [];
    }
    if (hitboxLayers) {
      this.opts.hitboxLayers = Object.assign({ miss: true, good: true, perfect: true }, hitboxLayers);
    }
  }

  // Draw the guide using the previously provided data; 'now' should be scheduler currentTime
  draw(now) {
    if (!this.visible || !this.timelineTimes || this.timelineTimes.length === 0) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const guideH = Math.max(36, this.opts.height);
    let guideW = Math.max(this.opts.minWidth, Math.floor(w * 0.45));
    const beatCount = this.timelineTimes.length;
    if (beatCount >= 7) {
      guideW = Math.max(guideW, Math.floor(w * 0.72));
    } else if (beatCount >= 6) {
      guideW = Math.max(guideW, Math.floor(w * 0.66));
    } else if (beatCount >= 4) {
      guideW = Math.max(guideW, Math.floor(w * 0.56));
    }
    // Position the guide so it stays inside the canvas bounds
    let guideX = Math.floor(w * this.opts.xPct - guideW / 2);
    const margin = 12;
    if (guideX < margin) guideX = margin;
    if (guideX + guideW > w - margin) guideW = Math.max(this.opts.minWidth, w - margin - guideX);
    let guideY = this.opts.y;
    // If guideY would overflow vertically, clamp it
    const h = this.canvas.height;
    if (guideY + guideH + margin > h) guideY = Math.max(margin, h - guideH - margin);

    // Compute display times by applying rollingOffset (so visuals anticipate user reaction)
    const displayTimes = this.timelineTimes.map(t => t + this.rollingOffset);

    // Start a bit earlier than the first beat so users can time the first click
    const preBuffer = Math.min(Math.max(this.leadTime * this.opts.preBufferPctOfLead, 0.3), 2.0);
    const firstDisplay = displayTimes[0] - preBuffer;
    const lastDisplay = displayTimes[displayTimes.length - 1] + Math.min(preBuffer * 0.5, 0.4);
    const range = Math.max(0.001, lastDisplay - firstDisplay);

    // current displayed time used for matching dot vs markers
    const displayedNow = now + this.rollingOffset + this.renderOffset;

    // background with subtle border
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    this._roundRect(ctx, guideX, guideY, guideW, guideH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, Math.floor(1 * (window.devicePixelRatio || 1)));
    ctx.stroke();

    // centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(guideX + 8, guideY + guideH / 2);
    ctx.lineTo(guideX + guideW - 8, guideY + guideH / 2);
    ctx.stroke();

    if (this.opts.debug) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '10px system-ui';
      ctx.fillText('DEBUG', guideX + 8, guideY + 12);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(`Perfect ±${this.tolerance.perfect.toFixed(2)}s`, guideX + 8, guideY + 24);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Good ±${this.tolerance.good.toFixed(2)}s`, guideX + 8, guideY + 36);
      ctx.restore();
    }

    // markers: draw a thin line per beat, highlight when dot is near or beat just occurred
    const highlightDur = Math.min(0.18, Math.max(0.08, this.tolerance.perfect * 0.5));
    const makeHitboxBox = (startTime, endTime) => {
      const startPx = guideX + 8 + ((startTime - firstDisplay) / range) * (guideW - 16);
      const endPx = guideX + 8 + ((endTime - firstDisplay) / range) * (guideW - 16);
      const boxX = Math.max(guideX + 8, Math.min(startPx, endPx));
      const boxRight = Math.min(guideX + guideW - 8, Math.max(startPx, endPx));
      const boxW = Math.max(4, boxRight - boxX);
      return { x: boxX, w: boxW };
    };
    this.timelineTimes.forEach((t, i) => {
      const dt = displayTimes[i];
      const rel = (dt - firstDisplay) / range;
      const px = guideX + 8 + rel * (guideW - 16);
      const beatTolerance = this.beatTimings[i] || this.tolerance;
      const missStart = dt - beatTolerance.good;
      const missEnd = dt + beatTolerance.good;
      const missBox = makeHitboxBox(missStart, missEnd);
      const goodStart = dt - beatTolerance.perfect;
      const goodEnd = dt + beatTolerance.perfect;
      const goodBox = makeHitboxBox(goodStart, goodEnd);
      const perfectStart = dt - beatTolerance.perfect * 0.5;
      const perfectEnd = dt + beatTolerance.perfect * 0.5;
      const perfectBox = makeHitboxBox(perfectStart, perfectEnd);

      const timeDiff = displayedNow - dt; // positive when displayed time passed the beat
      const isActive = Math.abs(timeDiff) <= highlightDur;

      if (this.opts.debug) {
        const boxY = guideY + 8;
        const boxH = guideH - 16;

        if (this.opts.hitboxLayers?.miss !== false) {
          ctx.save();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          this._roundRect(ctx, missBox.x, boxY, missBox.w, boxH, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        if (this.opts.hitboxLayers?.good !== false) {
          ctx.save();
          ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          this._roundRect(ctx, goodBox.x, boxY + 4, goodBox.w, boxH - 8, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        if (this.opts.hitboxLayers?.perfect !== false) {
          ctx.save();
          ctx.fillStyle = 'rgba(34, 197, 94, 0.16)';
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.95)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          this._roundRect(ctx, perfectBox.x, boxY + 8, perfectBox.w, boxH - 16, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (isActive) {
        // highlighted marker (glow + thicker) - use neutral blue highlight (no green)
        ctx.save();
        ctx.strokeStyle = '#9fd3ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(159,211,255,0.6)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(px, guideY + 6);
        ctx.lineTo(px, guideY + guideH - 6);
        ctx.stroke();
        ctx.restore();

        // small halo circle at center (neutral)
        ctx.fillStyle = '#9fd3ff';
        ctx.beginPath();
        ctx.arc(px, guideY + guideH / 2, Math.max(3, guideH * 0.12), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // normal thin marker (neutral)
        ctx.strokeStyle = '#d1e6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, guideY + 6);
        ctx.lineTo(px, guideY + guideH - 6);
        ctx.stroke();
      }

      if (this.opts.debug) {
        const debugLabel = `${i + 1}`;
        const labelX = px;
        const labelY = guideY + guideH / 2 + 18;
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '9px system-ui';
        ctx.fillText(debugLabel, labelX, labelY);
        ctx.restore();
      }
    });

    // moving dot
    const dotProgress = Math.min(Math.max((displayedNow - firstDisplay) / range, 0), 1);
    const dotX = guideX + 8 + dotProgress * (guideW - 16);
    // moving dot with glow
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.12)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(dotX, guideY + guideH / 2, Math.max(4, guideH * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.opts.debug) {
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dotX, guideY + 6);
      ctx.lineTo(dotX, guideY + guideH - 6);
      ctx.stroke();
      ctx.restore();
    }

    // ghost presses: draw only when userPresses contains actual user click times
    this.userPresses.forEach((pressTime) => {
      // Use pressTime + rollingOffset + renderOffset so ghost dots are mapped
      // to the same display time base as the moving dot. Ghosts are still only
      // created on actual user clicks; this aligns their visual position.
      const displayPress = pressTime + this.rollingOffset + this.renderOffset;
      if (displayPress < firstDisplay || displayPress > lastDisplay) return;
      const relp = (displayPress - firstDisplay) / range;
      const pxp = guideX + 8 + relp * (guideW - 16);

      let nearestDiff = Infinity;
      for (const dt of displayTimes) {
        nearestDiff = Math.min(nearestDiff, Math.abs(displayPress - dt));
      }
      let color = '#ff6b6b';
      const ghostTolerance = this.beatTimings[0] || this.tolerance;
      if (nearestDiff <= ghostTolerance.perfect) color = '#ffffff';
      else if (nearestDiff <= ghostTolerance.good) color = '#facc15';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pxp, guideY + guideH / 2, Math.max(3, guideH * 0.1), 0, Math.PI * 2);
      ctx.fill();
    });

    // small label
    ctx.fillStyle = '#e6eef6';
    const fontSize = Math.max(4, Math.floor(guideH * 0.16));
    ctx.font = `${fontSize}px system-ui`;
    ctx.fillText('Guide: beat markers and moving dot', guideX + 8, guideY - 8);
  }

  // Helper: draw a rounded rect path
  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
