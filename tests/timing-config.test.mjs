import assert from 'node:assert/strict';
import { PATTERN_MEMORY_TIMING_THRESHOLDS, PATTERN_MEMORY_BEAT_TIMING_OVERRIDES, getPatternMemoryTimingTolerance, getPatternMemoryBeatTiming, getPatternMemoryBeatTimings } from '../src/timingConfig.js';

assert.deepEqual(getPatternMemoryTimingTolerance('noob'), PATTERN_MEMORY_TIMING_THRESHOLDS.noob);
assert.deepEqual(getPatternMemoryTimingTolerance('pro'), PATTERN_MEMORY_TIMING_THRESHOLDS.pro);
assert.ok(getPatternMemoryTimingTolerance('noob').perfect >= 0.15, 'Noob should keep a forgiving perfect window');
assert.ok(getPatternMemoryTimingTolerance('noob').good >= 0.24, 'Noob should keep a forgiving good window');

const noobBeatTiming = getPatternMemoryBeatTiming('noob', 0, 3);
assert.ok(noobBeatTiming.perfect >= 0.12, 'Noob beat timing should stay forgiving');
assert.ok(noobBeatTiming.good >= 0.2, 'Noob beat timing should keep a usable good window');
assert.deepEqual(getPatternMemoryBeatTiming('noob', 1, 3), { perfect: 0.14, good: 0.22 });
assert.deepEqual(getPatternMemoryBeatTimings('noob', 3, 3), [
  noobBeatTiming,
  { perfect: 0.14, good: 0.22 },
  { perfect: 0.16, good: 0.24 }
]);

const tileSpecificOverrides = {
  3: [
    { perfect: 0.05, good: 0.2 },
    { perfect: 0.1, good: 0.22 },
    null
  ]
};
assert.deepEqual(getPatternMemoryBeatTiming('noob', 1, tileSpecificOverrides, 3), { perfect: 0.1, good: 0.22 });
assert.deepEqual(getPatternMemoryBeatTiming('noob', 2, tileSpecificOverrides, 3), PATTERN_MEMORY_TIMING_THRESHOLDS.noob);
assert.ok(Array.isArray(PATTERN_MEMORY_BEAT_TIMING_OVERRIDES[3]), 'Built-in tile override for tile 3 should be present');
assert.deepEqual(getPatternMemoryBeatTiming('noob', 0, null, 3), { perfect: 0.6, good: 0.16 });
console.log('PASS timing config exposes shared thresholds and per-beat overrides.');
