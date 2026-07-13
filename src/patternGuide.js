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
      xPct: 0.5, // guide X relative to canvas (right half)
      y: 100,
      minWidth: 180,
      height: 56,
      preBufferPctOfLead: 1.0, // preBuffer = leadTime * this
      debug: false
    }, opts);

    // Data populated by caller
    this.timelineTimes = []; // absolute times (seconds)
    this.userPresses = [];
    this.rollingOffset = 0; // seconds
    this.leadTime = 0.8;
    this.tolerance = { perfect: 0.25, good: 0.5 };
    this.visible = true;
  }

  // Provide timeline times and optional state
  update({ timelineTimes = [], userPresses = [], rollingOffset = 0, leadTime = 0.8, tolerance = null, visible = true } = {}) {
    this.timelineTimes = timelineTimes.slice();
    this.userPresses = userPresses.slice();
    this.rollingOffset = rollingOffset;
    this.leadTime = leadTime;
    this.visible = visible;
    if (tolerance) this.tolerance = tolerance;
  }

  // Draw the guide using the previously provided data; 'now' should be scheduler currentTime
  draw(now) {
    if (!this.visible || !this.timelineTimes || this.timelineTimes.length === 0) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const guideW = Math.max(this.opts.minWidth, w / 2 - 40);
    const guideH = this.opts.height;
    const guideX = Math.floor(w * this.opts.xPct + 18);
    const guideY = this.opts.y;

    // Compute display times by applying rollingOffset (so visuals anticipate user reaction)
    const displayTimes = this.timelineTimes.map(t => t + this.rollingOffset);

    // Start a bit earlier than the first beat so users can time the first click
    const preBuffer = Math.min(Math.max(this.leadTime * this.opts.preBufferPctOfLead, 0.3), 2.0);
    const firstDisplay = displayTimes[0] - preBuffer;
    const lastDisplay = displayTimes[displayTimes.length - 1];
    const range = Math.max(0.001, lastDisplay - firstDisplay);

    // background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(guideX, guideY, guideW, guideH);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(guideX + 8, guideY + guideH / 2);
    ctx.lineTo(guideX + guideW - 8, guideY + guideH / 2);
    ctx.stroke();

    // markers and hit windows
    const perfectPx = (this.tolerance.perfect / range) * (guideW - 16);
    const goodPx = (this.tolerance.good / range) * (guideW - 16);
    this.timelineTimes.forEach((t, i) => {
      const dt = displayTimes[i];
      const rel = (dt - firstDisplay) / range;
      const px = guideX + 8 + rel * (guideW - 16);

      ctx.fillStyle = 'rgba(250,204,21,0.12)';
      ctx.fillRect(px - goodPx, guideY + 6, goodPx * 2, guideH - 12);
      ctx.fillStyle = 'rgba(34,197,94,0.16)';
      ctx.fillRect(px - perfectPx, guideY + 14, perfectPx * 2, guideH - 28);

      ctx.strokeStyle = i % 2 ? '#7dd3fc' : '#fca5a5';
      ctx.beginPath();
      ctx.moveTo(px, guideY + 6);
      ctx.lineTo(px, guideY + guideH - 6);
      ctx.stroke();
    });

    // moving dot
    const displayedNow = now + this.rollingOffset;
    const dotProgress = Math.min(Math.max((displayedNow - firstDisplay) / range, 0), 1);
    const dotX = guideX + 8 + dotProgress * (guideW - 16);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(dotX, guideY + guideH / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // ghost presses
    this.userPresses.forEach((pressTime) => {
      const displayPress = pressTime + this.rollingOffset;
      if (displayPress < firstDisplay - 0.5 || displayPress > lastDisplay + 0.5) return;
      const relp = (displayPress - firstDisplay) / range;
      const pxp = guideX + 8 + relp * (guideW - 16);

      let nearestDiff = Infinity;
      for (const dt of displayTimes) {
        nearestDiff = Math.min(nearestDiff, Math.abs(displayPress - dt));
      }
      let color = '#ff6b6b';
      if (nearestDiff <= this.tolerance.perfect) color = '#2ecc71';
      else if (nearestDiff <= this.tolerance.good) color = '#facc15';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pxp, guideY + guideH / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // small label
    ctx.fillStyle = '#e6eef6';
    ctx.font = '12px system-ui';
    ctx.fillText('Guide: beat markers and moving dot (hit windows)', guideX + 8, guideY - 8);
  }
}
