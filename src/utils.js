// src/utils.js
// Small helpers used across modes

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function formatMs(seconds) {
  return `${Math.round(seconds * 1000)} ms`;
}

// Judgement helper (single source of truth)
export function getJudgement(diffSeconds) {
  const abs = Math.abs(diffSeconds);
  if (abs <= 0.03) return { label: 'Perfect', points: 300, css: 'judgement-perfect' };
  if (abs <= 0.06) return { label: 'Good', points: 100, css: 'judgement-good' };
  return { label: 'Miss', points: 0, css: 'judgement-miss' };
}