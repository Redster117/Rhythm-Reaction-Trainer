export const PATTERN_MEMORY_TIMING_THRESHOLDS = {
  noob: { perfect: 0.16, good: 0.28 },
  ez: { perfect: 0.14, good: 0.24 },
  veteran: { perfect: 0.12, good: 0.2 },
  experienced: { perfect: 0.1, good: 0.18 },
  expert: { perfect: 0.09, good: 0.16 },
  pro: { perfect: 0.08, good: 0.14 }
};

export const PATTERN_MEMORY_BEAT_TIMING_OVERRIDES = {
  noob: [
    { perfect: 0.12, good: 0.2 },
    { perfect: 0.14, good: 0.22 },
    { perfect: 0.16, good: 0.24 }
  ],
  y3: [
    { perfect: 0.06, good: 0.16 },
    { perfect: 0.1, good: 0.18 },
    { perfect: 0.12, good: 0.2 }
  ],
  ez: [
    { perfect: 0.11, good: 0.18 },
    { perfect: 0.13, good: 0.2 },
    { perfect: 0.14, good: 0.22 }
  ],
  veteran: [
    { perfect: 0.1, good: 0.16 },
    { perfect: 0.11, good: 0.18 },
    { perfect: 0.12, good: 0.2 }
  ],
  experienced: [
    { perfect: 0.09, good: 0.15 },
    { perfect: 0.1, good: 0.16 },
    { perfect: 0.11, good: 0.18 }
  ],
  expert: [
    { perfect: 0.08, good: 0.14 },
    { perfect: 0.09, good: 0.15 },
    { perfect: 0.1, good: 0.16 }
  ],
  pro: [
    { perfect: 0.07, good: 0.12 },
    { perfect: 0.08, good: 0.14 },
    { perfect: 0.09, good: 0.15 }
  ]
};

export function getPatternMemoryTimingTolerance(difficultyLevel = 'noob') {
  return PATTERN_MEMORY_TIMING_THRESHOLDS[difficultyLevel] || PATTERN_MEMORY_TIMING_THRESHOLDS.noob;
}

function resolveBeatOverrides(difficultyLevel = 'noob', beatOverrides = null, overrideKey = null) {
  if (Array.isArray(beatOverrides)) {
    return beatOverrides;
  }

  if (beatOverrides && typeof beatOverrides === 'object' && !Array.isArray(beatOverrides)) {
    const tileKey = overrideKey ?? difficultyLevel;
    const tileOverrides = beatOverrides[tileKey];
    if (Array.isArray(tileOverrides)) {
      return tileOverrides;
    }
  }

  return PATTERN_MEMORY_BEAT_TIMING_OVERRIDES[overrideKey || difficultyLevel] || PATTERN_MEMORY_BEAT_TIMING_OVERRIDES[difficultyLevel] || PATTERN_MEMORY_BEAT_TIMING_OVERRIDES.noob;
}

export function getPatternMemoryBeatTiming(difficultyLevel = 'noob', beatIndex = 0, beatOverrides = null, overrideKey = null) {
  const base = getPatternMemoryTimingTolerance(difficultyLevel);
  const overrides = resolveBeatOverrides(difficultyLevel, beatOverrides, overrideKey);
  const override = overrides?.[beatIndex];
  return override ? { ...base, ...override } : base;
}

export function getPatternMemoryBeatTimings(difficultyLevel = 'noob', beatCount = 1, beatOverrides = null, overrideKey = null) {
  return Array.from({ length: beatCount }, (_, beatIndex) => getPatternMemoryBeatTiming(difficultyLevel, beatIndex, beatOverrides, overrideKey));
}
