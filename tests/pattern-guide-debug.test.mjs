import assert from 'node:assert/strict';
import PatternGuide from '../src/patternGuide.js';

global.window = { devicePixelRatio: 1 };

function createContext() {
  const texts = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 1,
    clearRect() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    arcTo() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    closePath() {},
    save() {},
    restore() {},
    fillText(text) { texts.push(text); }
  };
  return { ctx, texts };
}

const canvas = { width: 360, height: 120 };
const { ctx, texts } = createContext();
const guide = new PatternGuide(ctx, canvas);
guide.update({ timelineTimes: [1.0, 2.0], leadTime: 0.8, tolerance: { perfect: 0.25, good: 0.5 }, visible: true });
guide.draw(0);

const sawDebugText = texts.some((text) => String(text).toLowerCase().includes('debug') || String(text).toLowerCase().includes('beat'));
assert.equal(sawDebugText, true, 'Expected the pattern guide to render debug timing labels');
console.log('PASS pattern guide renders debug timing labels by default.');
