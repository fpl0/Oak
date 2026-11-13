// The voicing gate (contracts §3.1 rule 6; docs/design/wave4.md §5.6): a graded, unrevealed attempt of
// `U05.L07/hand-voiced-cadence` (or its regenerated variant in U05.L08's gate-check step) at ≥ 0.9, from the
// learner's own typing, unlocks `voicing()`, `chord()`, `rhodes`, `organ` and the other gated rows at U05.L08.
import type { VoicingGate } from "@oak/api";
import type { UnlocksService } from "./unlocks.ts";

/** The gate as content/toolbox.ts declares it, when the table has no gated row (never in the real course). */
export const DEFAULT_VOICING_GATE = {
  exercise: "U05.L07/hand-voiced-cadence",
  minScore: 0.9,
  variants: ["U05.L08/hand-voiced-cadence-again"],
} as const;

export function voicingGate(unlocks: UnlocksService): VoicingGate {
  const gated = unlocks.gatedRows();
  const condition = gated?.condition;
  const exerciseId = (condition?.exercise as string | undefined) ?? DEFAULT_VOICING_GATE.exercise;
  const variants = (
    (condition?.variants ??
      (condition === undefined ? DEFAULT_VOICING_GATE.variants : [])) as readonly string[]
  ).slice();
  const minScore = condition?.minScore ?? DEFAULT_VOICING_GATE.minScore;
  const attempts = condition === undefined ? [] : unlocks.gateAttempts(condition);
  const unrevealed = attempts.filter((a) => !a.revealed);
  const first = attempts.find((a) => a.qualifies) ?? null;
  return {
    exerciseId,
    variants,
    minScore,
    best:
      unrevealed.length === 0 ? null : Math.max(...unrevealed.map((a) => Math.max(0, Math.min(1, a.score)))),
    passed: first !== null,
    passedAt: first?.at ?? null,
    attempts: attempts.length,
    passedCode: first?.code ?? null,
    holds: (gated?.rows ?? []).map((r) => r.id) as VoicingGate["holds"],
  };
}
