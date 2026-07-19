import assert from 'node:assert/strict';
import { createBeatQueue, judgeBeatInput, advanceBeatQueueForTime, summarizeBeatResults } from '../src/utils.js';

const beats = createBeatQueue([0.8, 1.5, 1.6]);
const perfect = judgeBeatInput(beats[0], 0.80002);
assert.equal(perfect.label, 'Perfect');

const goodLate = judgeBeatInput(beats[1], 1.58);
assert.equal(goodLate.label, 'Good');

const lateMiss = judgeBeatInput(beats[2], 1.751);
assert.equal(lateMiss.label, 'Miss');

const passiveQueue = createBeatQueue([0.8, 1.5, 1.6]);
const passiveResult = advanceBeatQueueForTime(passiveQueue, 0, 1.651);
assert.equal(passiveResult.missedBeats.length, 2);
assert.equal(passiveResult.missedBeats[0].judgement, 'Miss');
assert.equal(passiveResult.missedBeats[1].judgement, 'Miss');
assert.equal(passiveResult.currentIndex, 2);

const summary = summarizeBeatResults([
  { status: 'judged', judgement: 'Perfect' },
  { status: 'judged', judgement: 'Good' },
  { status: 'judged', judgement: 'Miss' }
]);
assert.equal(summary.perfects, 1);
assert.equal(summary.goods, 1);
assert.equal(summary.misses, 1);

console.log('PASS beat queue judgment helpers behave as expected.');
