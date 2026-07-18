import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReactionBeatTargets, judgeTimedReactionBeat } from '../src/utils.js';

test('first beat stays forgiving and never becomes a miss', () => {
  const result = judgeTimedReactionBeat({
    beatIndex: 0,
    pressTimeSeconds: 0.95,
    officialBeatTimeSeconds: 0.8,
    perfectWindowMs: 50,
    goodWindowMs: 100
  });

  assert.equal(result, 'Good');
});

test('later beats use the previous press timing plus the beat interval', () => {
  const targets = buildReactionBeatTargets([0.8, 1.3], [0.95]);
  assert.equal(targets[0], 0.8);
  assert.equal(targets[1], 1.45);
});

test('later beats are judged with the timed-reaction target and the hitbox windows', () => {
  const result = judgeTimedReactionBeat({
    beatIndex: 1,
    pressTimeSeconds: 1.45,
    officialBeatTimeSeconds: 1.3,
    previousPressTimeSeconds: 0.95,
    previousOfficialBeatTimeSeconds: 0.8,
    perfectWindowMs: 50,
    goodWindowMs: 100
  });

  assert.equal(result, 'Perfect');
});

test('tile R1 is always treated as a perfect single-beat round', () => {
  const result = judgeTimedReactionBeat({
    beatIndex: 0,
    pressTimeSeconds: 2.2,
    officialBeatTimeSeconds: 0.8,
    perfectWindowMs: 50,
    goodWindowMs: 100,
    forcePerfect: true
  });

  assert.equal(result, 'Perfect');
});
