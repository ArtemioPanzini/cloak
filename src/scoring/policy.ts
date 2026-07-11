import type { DecisionResolution, NormalizedDecisionInput, ScoreResult } from "../domain/types.js";

export function resolveDecision(
  input: NormalizedDecisionInput,
  score: ScoreResult
): DecisionResolution {
  if (!input.form.validState) {
    return { decision: "BLOCK", primaryReason: "INVALID_STATE" };
  }

  if (score.reasonCodes.includes("EXTREME_SUBMIT_BURST")) {
    return { decision: "BLOCK", primaryReason: "EXTREME_SUBMIT_BURST" };
  }

  if (score.automationRisk >= 75 && score.suspiciousGroups.length >= 2) {
    return { decision: "BLOCK", primaryReason: "MULTI_SIGNAL_AUTOMATION" };
  }

  if (score.coverage < 0.6) {
    return { decision: "WHITEPAGE", primaryReason: "INSUFFICIENT_SIGNAL_COVERAGE" };
  }

  if (score.automationRisk >= 40) {
    return { decision: "WHITEPAGE", primaryReason: "ELEVATED_AUTOMATION_RISK" };
  }

  if (score.intentScore < 35) {
    return { decision: "WHITEPAGE", primaryReason: "LOW_INTENT" };
  }

  return { decision: "OFFER", primaryReason: "HUMAN_LIKE_INTERACTION" };
}
