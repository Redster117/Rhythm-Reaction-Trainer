import assert from 'node:assert/strict';
import { getPatternMemoryComboDelta } from '../src/modes/patternmemory.js';

assert.equal(getPatternMemoryComboDelta('noob', 'Perfect'), 2, 'Noob perfects should give a slightly larger combo increment');
assert.equal(getPatternMemoryComboDelta('noob', 'Good'), 1, 'Noob goods should still grow the combo a bit');
assert.equal(getPatternMemoryComboDelta('ez', 'Perfect'), 1, 'Other difficulties should keep the default combo increment');
console.log('PASS pattern memory combo deltas are tuned for noob.');
