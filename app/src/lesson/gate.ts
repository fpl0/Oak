// The voicing gate inside the lesson player (contracts §3.1 rule 6; content/toolbox.ts `VOICING_GATE`;
// docs/design/wave4.md §5.6). U05.L07's `hand-voiced-cadence` opens `voicing()`, `chord()`, `rhodes`, `organ` and
// the other gated rows when one graded attempt scores ≥ 0.9 with no reveal (hint rungs 1–3 allowed, retries
// unlimited, the learner's own code only). U05.L08's first step (`gateCheck`) is the same check regenerated in
// another key: it is shown only while the gate is unmet, it is the one hard gate of the course (Continue opens
// only on a gate pass, never on a reveal), and the gated tools stay locked inside U05.L08 until it passes. Pure:
// no DOM, no Vite (`bun test`).
import type { GradeResult, StepDef, UnlockableId } from "@oak/api";

/** The gate as the content declares it (`VOICING_GATE`) and as `gates.voicing` reports it. */
export interface GateRule {
  /** Global exercise ID of the check: `U05.L07/hand-voiced-cadence`. */
  exercise: string;
  /** Regenerated variants that count as well: `U05.L08/hand-voiced-cadence-again`. */
  variants: readonly string[];
  minScore: number;
}

/** What the player knows about the gate: the rule and whether the learner has met it (server or this visit). */
export interface GateState {
  rule: GateRule;
  passed: boolean;
}

/** Whether a global exercise ID is the gate check or one of its variants. */
export function isGateExercise(rule: GateRule, globalId: string): boolean {
  return globalId === rule.exercise || rule.variants.includes(globalId);
}

/**
 * A gate check whose answer was revealed (rung 4) can never open the gate: the server keeps the rung, so every
 * later check of that series counts as revealed. A fresh try (a new series: attempts and rung start again) is the
 * honest way on, offered only while the gate is unmet.
 */
export function gateNeedsFreshTry(gate: GateState | null, globalId: string | null, rung: number): boolean {
  if (!gate || gate.passed || globalId === null) return false;
  return isGateExercise(gate.rule, globalId) && rung >= 4;
}

/** The line under a held Continue: the second chance opens only on a gate pass, never on a reveal. */
export function continueNote(step: Pick<StepDef, "gateCheck">, gate: GateState | null): string {
  if (step.gateCheck === true)
    return `Pass the check at ${pct(gate?.rule.minScore ?? 0.9)}% or more to go on. Hints 1 to 3 are fine.`;
  return "Pass the check, or show the answer, to go on.";
}

/**
 * Whether one graded result meets the gate: a real attempt (not an error), at or above `minScore`, nothing
 * revealed. A tutor-applied card is judged by the server (it gives no evidence); the player only reads the score.
 */
export function gateMetBy(result: GradeResult | null | undefined, minScore: number): boolean {
  if (!result || result.status === "error" || result.status === "ungraded") return false;
  if (result.assist.revealed) return false;
  return result.score >= minScore - 1e-9;
}

/** Steps shown at all: U05.L08's `gateCheck` step only while the gate is unmet (unknown counts as unmet). */
export function stepsForGate<S extends Pick<StepDef, "gateCheck">>(
  steps: readonly S[],
  passed: boolean | null,
): S[] {
  return passed === true ? steps.filter((s) => s.gateCheck !== true) : [...steps];
}

/** Toolbox rows the gate holds (`unlock.condition` set), for a toolbox entry list. */
export function gatedIds(toolbox: readonly { id: string; unlock: { condition?: unknown } }[]): Set<string> {
  return new Set(toolbox.filter((t) => t.unlock.condition !== undefined).map((t) => t.id));
}

/**
 * The tools a step may use while the gate is unmet: everything else the learner holds, without the gated rows
 * (rule 6: inside U05.L08 "rule 2 does not apply before that"). A met gate changes nothing.
 */
export function withoutGated(
  unlocked: Iterable<UnlockableId>,
  gated: ReadonlySet<string>,
  passed: boolean,
): Set<UnlockableId> {
  const out = new Set<UnlockableId>(unlocked);
  if (passed) return out;
  for (const id of gated) out.delete(id as UnlockableId);
  return out;
}

/**
 * Whether Continue may leave a step because of the gate. A `gateCheck` step leaves only on a gate pass (the
 * result of this visit, or the server's word that the gate is met); every other step is not the gate's business.
 */
export function gateAllowsContinue(
  step: Pick<StepDef, "gateCheck">,
  result: GradeResult | null,
  gate: GateState | null,
): boolean {
  if (step.gateCheck !== true) return true;
  if (gate?.passed) return true;
  return gateMetBy(result, gate?.rule.minScore ?? 0.9);
}

/** Percent as the Workbench rounds it (0.666 → 67 %). */
export const pct = (x: number) => Math.round(x * 100);
/** A score below the gate never reads as the gate's own number: 0.899 is "89 % of the 90 %". */
const below = (x: number, need: number) => Math.min(pct(x), need - 1);

/** The line the gate box shows under a check of the gate exercise (calm, exact, never shaming). */
export function gateLine(
  result: GradeResult | null,
  rule: GateRule,
  where: "lesson" | "second-chance",
): { tone: "open" | "near" | "met"; title: string; body: string } {
  const need = pct(rule.minScore);
  const tools = "`voicing()`, `chord()`, `rhodes` and `organ`";
  if (!result || result.status === "error" || result.status === "ungraded")
    return {
      tone: "open",
      title: where === "second-chance" ? "One check before this lesson" : "This check opens new tools",
      body:
        where === "second-chance"
          ? `Voice the cadence by hand again, in a new key. At ${need}% or more, ${tools} open and the rest of the lesson follows. Hints 1 to 3 are fine; a revealed answer does not count. Retry as often as you like.`
          : `Score ${need}% or more here and ${tools} open in the next lesson. Hints 1 to 3 are fine; a revealed answer does not count. Retry as often as you like.`,
    };
  if (gateMetBy(result, rule.minScore))
    return {
      tone: "met",
      title: `${pct(result.score)}%: the gate is open`,
      body:
        where === "second-chance"
          ? `${tools} are yours now. Continue to the lesson.`
          : `${tools} open in the next lesson. Here is your voicing next to the one Strudel chooses.`,
    };
  if (result.assist.revealed)
    return {
      tone: "near",
      title: "A revealed answer does not open the gate",
      body:
        where === "second-chance"
          ? "Start a fresh try and write the voicing yourself: the gate counts only checks you wrote without the answer shown."
          : "Start a fresh try and write the voicing yourself, or go on: the next lesson begins with one more try. The gate counts only checks you wrote without the answer shown.",
    };
  return {
    tone: "near",
    title: `${below(result.score, need)}% of the ${need}% the gate needs`,
    body: "Fix what the check found, then check again at once. Nothing is lost by trying.",
  };
}
