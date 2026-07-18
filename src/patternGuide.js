// src/patternGuide.js
// Lightweight guide renderer for Pattern Memory mode.

export default class PatternGuide {
  constructor(ctx, canvas, opts = {}) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.opts = Object.assign({
      xPct: 0.75,
      y: 80,
      minWidth: 140,
      height: 48,
      preBufferPctOfLead: 0,
      debug: true,
      perfectWindowMs: 24,
      goodWindowMs: 70,
      missWindowMs: 140,
      perfectColor: 'rgba(34, 197, 94, 0.2)',
      goodColor: 'rgba(249, 115, 22, 0.28)',
      missColor: 'rgba(239, 68, 68, 0.12)',
      beatColor: '#d1e6ff',
      guideTextColor: '#e6eef6',
      hitboxLayers: {
        miss: true,
        good: true,
        perfect: true
      }
    }, opts);
    if (opts.hitboxLayers) {
      this.opts.hitboxLayers = Object.assign({ miss: true, good: true, perfect: true }, opts.hitboxLayers);
    }

    this.timelineTimes = [];
    this.targetTimes = [];
    this.userPresses = [];
    this.rollingOffset = 0;
    this.renderOffset = 0;
    this.leadTime = 0.8;
    this.tolerance = { perfect: 0.25, good: 1.5 };
    this.beatTimings = [];
    this.visible = true;
  }

  setOptions(opts = {}) {
    this.opts = Object.assign({}, this.opts, opts);
  }

  update({ timelineTimes = [], targetTimes = null, userPresses = [], rollingOffset = 0, renderOffset = 0, leadTime = 0.8, tolerance = null, visible = true, hitboxLayers = null, beatTimings = null } = {}) {
    this.timelineTimes = timelineTimes.slice();
    this.targetTimes = Array.isArray(targetTimes) ? targetTimes.slice() : this.timelineTimes.slice();
    this.userPresses = userPresses.slice();
    this.rollingOffset = rollingOffset;
    this.renderOffset = renderOffset;
    this.leadTime = leadTime;
    this.visible = visible;
    if (tolerance) this.tolerance = tolerance;
    this.beatTimings = Array.isArray(beatTimings) ? beatTimings.slice() : [];
    if (hitboxLayers) {
      this.opts.hitboxLayers = Object.assign({ miss: true, good: true, perfect: true }, hitboxLayers);
    }
  }

  draw(now) {
    if (!this.visible || !this.timelineTimes || this.timelineTimes.length === 0) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const guideH = Math.max(36, this.opts.height);
    let guideW = Math.max(this.opts.minWidth, Math.floor(w * 0.45));
    const beatCount = this.timelineTimes.length;
    if (beatCount >= 7) guideW = Math.max(guideW, Math.floor(w * 0.72));
    else if (beatCount >= 6) guideW = Math.max(guideW, Math.floor(w * 0.66));
    else if (beatCount >= 4) guideW = Math.max(guideW, Math.floor(w * 0.56));

    let guideX = Math.floor(w * this.opts.xPct - guideW / 2);
    const margin = 12;
    if (guideX < margin) guideX = margin;
    if (guideX + guideW > w - margin) guideW = Math.max(this.opts.minWidth, w - margin - guideX);
    let guideY = this.opts.y;
    const h = this.canvas.height;
    if (guideY + guideH + margin > h) guideY = Math.max(margin, h - guideH - margin);

    const displayTimes = this.targetTimes.map((time) => time + this.rollingOffset);
    const preBuffer = Math.min(Math.max(this.leadTime * this.opts.preBufferPctOfLead, 0.3), 2.0);
    const firstDisplay = displayTimes[0] - preBuffer;
    const lastDisplay = displayTimes[displayTimes.length - 1] + Math.min(preBuffer * 0.5, 0.4);
    const range = Math.max(0.001, lastDisplay - firstDisplay);
    const displayedNow = now + this.rollingOffset + this.renderOffset;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    this._roundRect(ctx, guideX, guideY, guideW, guideH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(guideX + 8, guideY + guideH / 2);
    ctx.lineTo(guideX + guideW - 8, guideY + guideH / 2);
    ctx.stroke();

    const slotX = (timeValue) => guideX + 8 + ((timeValue - firstDisplay) / range) * (guideW - 16);

    this.timelineTimes.forEach((_, index) => {
      const beatTime = displayTimes[index];
      const px = slotX(beatTime);
      ctx.strokeStyle = this.opts.beatColor || '#d1e6ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, guideY + 8);
      ctx.lineTo(px, guideY + guideH - 8);
      ctx.stroke();

      const perfectWindow = Math.max(0.01, (this.opts.perfectWindowMs || 24) / 1000);
      const goodWindow = Math.max(perfectWindow + 0.01, (this.opts.goodWindowMs || 70) / 1000);
      const missWindow = Math.max(goodWindow + 0.01, (this.opts.missWindowMs || 140) / 1000);
      const perfectStart = beatTime - perfectWindow / 2;
      const perfectEnd = beatTime + perfectWindow / 2;
      const goodStart = beatTime - goodWindow;
      const goodEnd = beatTime - perfectWindow / 2;
      if (this.opts.hitboxLayers?.miss !== false) {
        const missStart = beatTime - missWindow;
        const missEnd = beatTime + missWindow * 0.25;
        const missX = slotX(missStart);
        const missRight = slotX(missEnd);
        ctx.fillStyle = this.opts.missColor || 'rgba(239, 68, 68, 0.12)';
        ctx.fillRect(Math.min(missX, missRight), guideY + 10, Math.max(4, Math.abs(missRight - missX)), guideH - 20);
      }

      if (this.opts.hitboxLayers?.good !== false) {
        const goodX = slotX(goodStart);
        const goodRight = slotX(goodEnd);
        ctx.fillStyle = this.opts.goodColor || 'rgba(249, 115, 22, 0.28)';
        ctx.fillRect(Math.min(goodX, goodRight), guideY + 13, Math.max(4, Math.abs(goodRight - goodX)), guideH - 26);
      }

      if (this.opts.hitboxLayers?.perfect !== false) {
        const perfectX = slotX(perfectStart);
        const perfectRight = slotX(perfectEnd);
        ctx.fillStyle = this.opts.perfectColor || 'rgba(34, 197, 94, 0.2)';
        ctx.fillRect(Math.min(perfectX, perfectRight), guideY + 16, Math.max(3, Math.abs(perfectRight - perfectX)), guideH - 32);
      }
    });

    const dotProgress = Math.min(Math.max((displayedNow - firstDisplay) / range, 0), 1);
    const dotX = slotX(displayedNow);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(dotX, guideY + guideH / 2, Math.max(4, guideH * 0.12), 0, Math.PI * 2);
    ctx.fill();

    this.userPresses.forEach((pressTime) => {
      const displayPress = pressTime + this.rollingOffset + this.renderOffset;
      if (displayPress < firstDisplay || displayPress > lastDisplay) return;
      const pressX = slotX(displayPress);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(pressX, guideY + guideH / 2, Math.max(3, guideH * 0.10), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = this.opts.guideTextColor || '#e6eef6';
    const fontSize = Math.max(4, Math.floor(guideH * 0.16));
    ctx.font = `${fontSize}px system-ui`;
    ctx.fillText('Guide: rhythm timing', guideX + 8, guideY - 8);
  }

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
