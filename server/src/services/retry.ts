// The retry policy on the server (docs/design/retry.md §3–§4). Every judged exercise can be done again after any
// result; what a retry COUNTS for is decided here, inside contracts §7.2, §7.5, §8 and §9.5, so that repeating an
// exercise can never farm mastery, re-rate a card or punish the learner:
//
//   - A lesson step's attempts are "first" (evidence 1.0, the step's SRS rating, test-out), "retry" (a retry after
//     a fail: evidence 0.3, no rating) or "practice" (stored with its grade and counted in the series' attempts,
//     but never in evidence, ratings, results or best scores). Practice is every
//     attempt after the step has passed, every attempt in a completed lesson, and a second answer to a predict.
//     "First" means first in the step, not first in the series: "Try a new one" starts a new series of params
//     (§5.5) but never a second first attempt.
//   - A drill trial's first answer is its record (§7.2: the set's rating is the mean credit of its trials): a
//     re-post of the same index keeps the first answer's credit, response and sung resolution.
// Pure functions; the services call them inside their transactions.
import type { DrillTrialRecord } from "@oak/api";
import type { Exercise } from "@oak/content-kit";

export type AttemptCount = "first" | "retry" | "predict" | "practice";

/** Why an attempt is practice; `null` when it counts. */
export type PracticeReason = "passed" | "completed" | "predicted" | null;

export interface PriorAttempt {
  /** `status !== "error"`: an error is not an attempt (StepState.attempts). */
  graded: boolean;
  practice: boolean;
  disputed: boolean;
}

export interface AttemptCountInput {
  kind: Exercise["kind"];
  /** step_state.passed: the step passed in any series, on any visit. */
  stepPassed: boolean;
  /** The lesson is completed: a replay. */
  lessonCompleted: boolean;
  /** Earlier attempts of this step, any series. */
  prior: readonly PriorAttempt[];
}

export interface AttemptCountResult {
  count: AttemptCount;
  reason: PracticeReason;
}

/** What the next graded attempt on a lesson step counts for (docs/design/retry.md §3.1). */
export function countAttempt(input: AttemptCountInput): AttemptCountResult {
  if (input.lessonCompleted) return { count: "practice", reason: "completed" };
  if (input.stepPassed) return { count: "practice", reason: "passed" };
  // A disputed attempt gives nothing (§11.8) but it was still the step's first try: a retry after it is a retry.
  const countedBefore = input.prior.some((p) => p.graded && !p.practice);
  if (input.kind === "predict") return countedBefore ? { count: "practice", reason: "predicted" } : PREDICT;
  return countedBefore ? RETRY : FIRST;
}

const FIRST: AttemptCountResult = { count: "first", reason: null };
const RETRY: AttemptCountResult = { count: "retry", reason: null };
const PREDICT: AttemptCountResult = { count: "predict", reason: null };

/**
 * A drill trial re-posted under the same index (the runner re-sends a record when it enters feedback and again
 * when a sung resolution ends; a "Try again" inside the trial re-sends it with `retries`): the FIRST stored answer
 * stays the record. Only what the first post could not hold yet is taken from a later one: a sung resolution
 * where none was stored (absent or `null`), and the practice count (never lowered).
 */
export function keepFirstAnswer(
  stored: DrillTrialRecord | undefined,
  incoming: DrillTrialRecord,
): DrillTrialRecord {
  if (stored === undefined) return incoming;
  const sung =
    stored.sungResolution === undefined || stored.sungResolution === null
      ? incoming.sungResolution
      : stored.sungResolution;
  const retries = Math.max(stored.retries ?? 0, incoming.retries ?? 0);
  return {
    ...stored,
    ...(sung === undefined ? {} : { sungResolution: sung }),
    ...(retries > 0 ? { retries } : {}),
  };
}
