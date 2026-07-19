// src/utils.js
// Small helpers used across modes

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function formatMs(seconds) {
  return `${Math.round(seconds * 1000)} ms`;
}

export function createBeatQueue(targetTimes = []) {
  return targetTimes.map((targetTime, index) => ({
    id: index + 1,
    targetTime,
    status: 'pending',
    judgement: null,
    offsetMs: null
  }));
}

export function judgeBeatInput(beat, inputTimeSeconds) {
  if (!beat || beat.status !== 'pending') {
    return { label: 'Miss', points: 0, css: 'judgement-miss', beat };
  }

  const offsetMs = (inputTimeSeconds - beat.targetTime) * 1000;
  const absOffsetMs = Math.abs(offsetMs);

  if (offsetMs >= -50 && offsetMs <= 30) {
    beat.status = 'judged';
    beat.judgement = 'Perfect';
    beat.offsetMs = offsetMs;
    return { label: 'Perfect', points: 300, css: 'judgement-perfect', beat };
  }

  if (offsetMs < -50 && offsetMs >= -500) {
    beat.status = 'judged';
    beat.judgement = 'Good';
    beat.offsetMs = offsetMs;
    return { label: 'Good', points: 100, css: 'judgement-good', beat };
  }

  if (offsetMs > 30 && offsetMs <= 150) {
    beat.status = 'judged';
    beat.judgement = 'Good';
    beat.offsetMs = offsetMs;
    return { label: 'Good', points: 100, css: 'judgement-good', beat };
  }

  beat.status = 'judged';
  beat.judgement = 'Miss';
  beat.offsetMs = offsetMs;
  return { label: 'Miss', points: 0, css: 'judgement-miss', beat };
}

export function advanceBeatQueueForTime(beatQueue = [], currentIndex = 0, clockTimeSeconds = 0) {
  if (!Array.isArray(beatQueue) || beatQueue.length === 0) {
    return { currentIndex, missedBeats: [] };
  }

  let index = currentIndex;
  const missedBeats = [];

  while (index < beatQueue.length) {
    const beat = beatQueue[index];
    if (!beat || beat.status !== 'pending') {
      index += 1;
      continue;
   }

    const offsetMs = (clockTimeSeconds - beat.targetTime) * 1000;
    if (offsetMs > 150) {
      beat.status = 'judged';
      beat.judgement = 'Miss';
      beat.offsetMs = offsetMs;
      missedBeats.push(beat);
      index += 1;
      continue;
    }

    break;
  }

  return { currentIndex: index, missedBeats };
}

export function summarizeBeatResults(results = []) {
  return results.reduce((summary, result) => {
    if (!result) return summary;
    if (result.judgement === 'Perfect') summary.perfects += 1;
    else if (result.judgement === 'Good') summary.goods += 1;
    else if (result.judgement === 'Miss') summary.misses += 1;
    return summary;
  }, { perfects: 0, goods: 0, misses: 0 });
}

export function scoreRhythmPattern(expectedTimes = [], actualTimes = []) {
  if (!expectedTimes.length || !actualTimes.length) {
    return { averageErrorMs: Infinity, maxErrorMs: Infinity, sampleCount: 0 };
  }

  const samples = Math.min(expectedTimes.length, actualTimes.length);
  const errors = [];

  for (let index = 1; index < samples; index += 1) {
    const expectedDelta = expectedTimes[index] - expectedTimes[index - 1];
    const actualDelta = actualTimes[index] - actualTimes[index - 1];
    errors.push(Math.abs((actualDelta - expectedDelta) * 1000));
  }

  const averageErrorMs = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  const maxErrorMs = errors.length ? Math.max(...errors) : 0;

  return { averageErrorMs, maxErrorMs, sampleCount: errors.length };
}

// Judgement helper (single source of truth)
export function getJudgement(diffSeconds) {
  const abs = Math.abs(diffSeconds);
  if (abs <= 0.03) return { label: 'Perfect', points: 300, css: 'judgement-perfect' };
  if (abs <= 0.06) return { label: 'Good', points: 100, css: 'judgement-good' };
  return { label: 'Miss', points: 0, css: 'judgement-miss' };
}

export function buildReactionBeatTargets(officialBeatTimes = [], priorPressTimes = []) {
  if (!Array.isArray(officialBeatTimes) || officialBeatTimes.length === 0) {
    return [];
  }

  const targets = officialBeatTimes.slice();
  const priorPresses = Array.isArray(priorPressTimes) ? priorPressTimes : [];
  targets[0] = officialBeatTimes[0];

  for (let index = 1; index < targets.length; index += 1) {
    const previousPress = priorPresses[index - 1];
    const previousTarget = targets[index - 1];
    const officialInterval = officialBeatTimes[index] - officialBeatTimes[index - 1];
    if (typeof previousPress === 'number') {
      targets[index] = previousPress + officialInterval;
    } else if (typeof previousTarget === 'number') {
      targets[index] = previousTarget + officialInterval;
    }
  }

  return targets;
}

export function judgeTimedReactionBeat({
  beatIndex = 0,
  pressTimeSeconds,
  officialBeatTimeSeconds,
  previousPressTimeSeconds = null,
  previousOfficialBeatTimeSeconds = null,
  perfectWindowMs = 50,
  goodWindowMs = 100,
  forcePerfect = false
} = {}) {
  if (typeof pressTimeSeconds !== 'number') {
    return 'Miss';
  }

  const targetTimeSeconds = beatIndex === 0
    ? officialBeatTimeSeconds
    : (() => {
        if (typeof previousPressTimeSeconds === 'number' && typeof previousOfficialBeatTimeSeconds === 'number') {
          return previousPressTimeSeconds + (officialBeatTimeSeconds - previousOfficialBeatTimeSeconds);
        }
        return officialBeatTimeSeconds;
      })();

  if (forcePerfect) {
    return 'Perfect';
  }

  const diffMs = (pressTimeSeconds - targetTimeSeconds) * 1000;
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs <= perfectWindowMs) {
    return 'Perfect';
  }

  if (beatIndex === 0) {
    if (absDiffMs <= Math.max(goodWindowMs, 150)) {
      return 'Good';
    }
    return 'Good';
  }

  if (absDiffMs <= goodWindowMs) {
    return 'Good';
  }
  return 'Miss';
}