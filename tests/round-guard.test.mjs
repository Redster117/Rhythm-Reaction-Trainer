import assert from 'node:assert/strict';
import { createRoundEvaluationGuard, resolveJudgementTransition } from '../src/roundLifecycle.js';

const guard = createRoundEvaluationGuard();
assert.equal(guard.isSettled(), false);
assert.equal(guard.markSettled(), true);
assert.equal(guard.isSettled(), true);
assert.equal(guard.markSettled(), false);
assert.equal(guard.markSettled(), false);

guard.reset();
assert.equal(guard.isSettled(), false);
assert.equal(guard.markSettled(), true);

assert.deepEqual(resolveJudgementTransition('Miss'), { shouldAdvanceRound: false, shouldEndRun: true });
assert.deepEqual(resolveJudgementTransition('Good'), { shouldAdvanceRound: true, shouldEndRun: false });
assert.deepEqual(resolveJudgementTransition('Perfect'), { shouldAdvanceRound: true, shouldEndRun: false });
console.log('PASS round evaluation guard prevents duplicate settlement.');
