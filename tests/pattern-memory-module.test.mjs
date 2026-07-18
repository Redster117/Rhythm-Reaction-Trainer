import test from 'node:test';
import assert from 'node:assert/strict';
import startPatternMemory from '../src/modes/patternmemoryv3.js';

test('pattern memory entry module resolves to the current implementation', () => {
  assert.equal(typeof startPatternMemory, 'function');
});
