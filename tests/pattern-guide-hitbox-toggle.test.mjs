import assert from 'node:assert/strict';
import PatternGuide from '../src/patternGuide.js';

const canvas = { width: 360, height: 120 };
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
  fillText() {}
};

const guide = new PatternGuide(ctx, canvas);
assert.equal(guide.opts.hitboxLayers?.miss, false, 'Miss hitbox should be disabled by default in the simple guide');
assert.equal(guide.opts.hitboxLayers?.good, true, 'Good hitbox should be enabled by default in the simple guide');
assert.equal(guide.opts.hitboxLayers?.perfect, true, 'Perfect hitbox should be enabled by default in the simple guide');
console.log('PASS simple guide shows perfect and good hitboxes by default.');
