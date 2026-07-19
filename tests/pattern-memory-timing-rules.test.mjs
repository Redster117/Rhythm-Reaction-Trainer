import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReactionBeatTargets, getAdaptiveBeatTargetTimeSeconds, judgeTimedReactionBeat, summarizePatternMemoryRoundJudgement } from '../src/utils.js';

test('the first beat is always treated as perfect', () => {
  const result = judgeTimedReactionBeat({
    beatIndex: 0,
    pressTimeSeconds: 0.95,
    officialBeatTimeSeconds: 0.8,
    perfectWindowMs: 50,
    goodWindowMs: 100
  });

  assert.equal(result, 'Perfect');
});

test('later beats use the original beat schedule instead of adapting to prior presses', () => {
  const targets = buildReactionBeatTargets([0.8, 1.3], [0.95]);
  assert.equal(targets[0], 0.8);
  assert.equal(targets[1], 1.3);
});

test('an early first press does not shift every later beat', () => {
  const targets = buildReactionBeatTargets([0.8, 1.0, 1.2, 1.4], [0.794]);
  assert.deepEqual(targets, [0.8, 1.0, 1.2, 1.4]);
});

test('later beats keep the original target time when no adaptation is requested', () => {
  const target = getAdaptiveBeatTargetTimeSeconds({
    beatIndex: 2,
    officialBeatTimeSeconds: 1.2,
    previousPressTimeSeconds: 0.994,
    previousOfficialBeatTimeSeconds: 1.0,
    previousTargetTimeSeconds: 0.994
  });

  assert.equal(target, 1.2);
});

test('later beats are judged by interval (mimicry) when previous press available', () => {
  // Official interval between beats: 1.3 - 0.8 = 0.5s
  // Player's previous press was at 0.95s (50ms late on first beat)
  // Perfect: player reproduces the 0.5s interval -> second press at 1.45s
  const perfect = judgeTimedReactionBeat({
    beatIndex: 1,
    pressTimeSeconds: 1.45,
    officialBeatTimeSeconds: 1.3,
    previousPressTimeSeconds: 0.95,
    previousOfficialBeatTimeSeconds: 0.8,
    perfectWindowMs: 25,
    goodWindowMs: 50
  });

  // Early: reproduces 0.4s interval (100ms error) -> should be Miss
  const early = judgeTimedReactionBeat({
    beatIndex: 1,
    pressTimeSeconds: 1.35,
    officialBeatTimeSeconds: 1.3,
    previousPressTimeSeconds: 0.95,
    previousOfficialBeatTimeSeconds: 0.8,
    perfectWindowMs: 25,
    goodWindowMs: 50
  });

  // Slightly late: reproduces 0.53s interval (30ms error) -> Good
  const late = judgeTimedReactionBeat({
    beatIndex: 1,
    pressTimeSeconds: 1.48,
    officialBeatTimeSeconds: 1.3,
    previousPressTimeSeconds: 0.95,
    previousOfficialBeatTimeSeconds: 0.8,
    perfectWindowMs: 25,
    goodWindowMs: 50
  });

  // Too late: reproduces 0.65s interval (150ms error) -> Miss
  const miss = judgeTimedReactionBeat({
    beatIndex: 1,
    pressTimeSeconds: 1.6,
    officialBeatTimeSeconds: 1.3,
    previousPressTimeSeconds: 0.95,
    previousOfficialBeatTimeSeconds: 0.8,
    perfectWindowMs: 25,
    goodWindowMs: 50
  });

  assert.equal(perfect, 'Perfect');
  assert.equal(early, 'Miss');
  assert.equal(late, 'Good');
  assert.equal(miss, 'Miss');
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
