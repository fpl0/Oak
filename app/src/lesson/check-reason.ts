// Why Check is not open yet, in the learner's words (carry-over d4): after a slot auto-advances, the disabled
// button says which slot is still empty ("Bar 3 is still empty."). Said only once the learner has begun the answer:
// an untouched widget needs no reminder that it is empty. The words are the answer widgets' own
// (`incompleteReason`); this module decides when they show.
import type { AllEx, Exercise, Trial } from "@oak/api";
import { incompleteReason } from "../answers/response.ts";
import type { AnswerValue } from "../answers/types.ts";
import { answerSpecOf, givenStart, withTrialOptions } from "./model.ts";

type Part = Exclude<Exercise, AllEx>;

/** Whether the value differs from what the widget opened with (a chart's given bars are not the learner's). */
export function answerBegun(value: unknown, initial: unknown): boolean {
  return JSON.stringify(value) !== JSON.stringify(initial);
}

/** The line a disabled Check shows, or `null` (complete, not begun, or a kind without slots to name). */
export function checkReason(
  ex: Part,
  value: unknown,
  initial: unknown,
  trial: Trial | null = null,
  o: { slotsPerBar?: 1 | 2; beatsPerBar?: number } = {},
): string | null {
  const spec = withTrialOptions(answerSpecOf(ex), trial);
  if (!spec || !answerBegun(value, initial)) return null;
  try {
    return incompleteReason(spec, value as AnswerValue, o);
  } catch {
    return null;
  }
}

/** A chart's opening value (its given bars filled), else `undefined`: what "not begun" compares with. */
export function openingValue(ex: Part): string[] | null {
  return givenStart(ex, answerSpecOf(ex));
}

/** The first part of an `all` step that still has an empty slot, as "Part 2: Bar 3 is still empty." */
export function allCheckReason(
  parts: readonly Part[],
  values: readonly unknown[],
  initials: readonly unknown[],
  trials: readonly (Trial | null)[],
): string | null {
  for (const [i, p] of parts.entries()) {
    const r = checkReason(p, values[i], initials[i], trials[i] ?? null);
    if (r) return `Part ${i + 1}: ${r}`;
  }
  return null;
}
