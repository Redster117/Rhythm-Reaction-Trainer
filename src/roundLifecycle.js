export function createRoundEvaluationGuard() {
  let settled = false;

  return {
    reset() {
      settled = false;
    },
    markSettled() {
      if (settled) return false;
      settled = true;
      return true;
    },
    isSettled() {
      return settled;
    }
  };
}

export function resolveJudgementTransition(judgementLabel = 'Miss') {
  if (judgementLabel === 'Miss') {
    return { shouldAdvanceRound: false, shouldEndRun: true };
  }

  return { shouldAdvanceRound: true, shouldEndRun: false };
}
