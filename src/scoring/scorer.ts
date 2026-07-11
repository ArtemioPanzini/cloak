import type {
  EvidenceGroup,
  HistorySignals,
  NormalizedDecisionInput,
  ScoreResult
} from "../domain/types.js";
import { SCORING_RULES } from "./rules.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculateCoverage(input: NormalizedDecisionInput, history: HistorySignals): number {
  let coverage = 0;

  if (input.server.pageTokenStatus === "valid") coverage += 0.2;
  else if (input.server.pageTokenStatus === "expired") coverage += 0.1;

  if (input.server.userAgent) coverage += 0.06;
  if (input.server.accept) coverage += 0.05;
  if (input.server.acceptLanguage) coverage += 0.04;

  if (input.server.serverDwellMs !== undefined) coverage += 0.1;
  if (input.client?.submittedMs !== undefined) coverage += 0.1;

  const interactionFields: Array<keyof NonNullable<NormalizedDecisionInput["client"]>> = [
    "pointerMoves",
    "pointerDowns",
    "touchStarts",
    "keyDowns",
    "stateChanges"
  ];
  const interactionFieldCount = interactionFields.reduce(
    (count, field) => count + (input.client?.[field] !== undefined ? 1 : 0),
    0
  );
  coverage += (interactionFieldCount / interactionFields.length) * 0.2;

  if (input.client?.screen) coverage += 0.06;
  if (input.client?.timezone) coverage += 0.03;
  if (input.client?.languages) coverage += 0.03;
  if (
    input.client?.hardwareConcurrency !== undefined ||
    input.client?.deviceMemory !== undefined ||
    input.client?.maxTouchPoints !== undefined
  ) {
    coverage += 0.03;
  }

  if (history.lookupSucceeded) coverage += 0.1;

  return Math.round(clamp(coverage, 0, 1) * 100) / 100;
}

export function scoreVisitor(
  input: NormalizedDecisionInput,
  history: HistorySignals
): ScoreResult {
  const adjustments = SCORING_RULES.flatMap((rule) => {
    const result = rule.evaluate({ input, history });
    return result ? [result] : [];
  });

  const rawAutomationRisk = adjustments.reduce(
    (score, item) => score + item.automationDelta,
    0
  );
  const rawIntentScore = adjustments.reduce(
    (score, item) => score + item.intentDelta,
    40
  );

  const suspiciousGroups = Array.from(
    new Set(
      adjustments
        .filter((item) => item.automationDelta >= 10)
        .map((item) => item.group)
    )
  ) as EvidenceGroup[];

  return {
    automationRisk: Math.round(clamp(rawAutomationRisk, 0, 100)),
    intentScore: Math.round(clamp(rawIntentScore, 0, 100)),
    coverage: calculateCoverage(input, history),
    suspiciousGroups,
    reasonCodes: adjustments.map((item) => item.code),
    adjustments
  };
}
