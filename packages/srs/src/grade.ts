// The grade map of contracts §7.2. Ratings are the ts-fsrs values 1 Again · 2 Hard · 3 Good · 4 Easy.
import { RUNG_RULES } from "@oak/content-kit";
import { GRADE_MAP } from "./constants.ts";
import type { Rating, ReviewOutcome } from "./types.ts";

const RATING_OF = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;

/** The best rating a hint rung still allows (contracts §5.3). */
export function rungCap(rung: ReviewOutcome["hintRung"]): Rating {
  return RATING_OF[RUNG_RULES[rung].bestRating];
}

/**
 * The grade map of contracts §7.2 for a family set, first match wins: Again (revealed, or mean credit
 * < 0.65) · Hard (< 0.80, or any extra replay, or hint rung ≥ 2) · Easy (≥ 0.95, median RT ≤ fastRtMs,
 * at or above the card's level; production families also need mean |cents| ≤ half the tolerance) · Good.
 * `meanCredit` is the credit against the level actually played. A NaN credit is Again.
 */
export function gradeFor(outcome: ReviewOutcome): Rating {
  const cap = rungCap(outcome.hintRung);
  if (outcome.revealed || cap === 1 || !(outcome.meanCredit >= GRADE_MAP.again)) return 1;
  if (outcome.meanCredit < GRADE_MAP.hard || outcome.extraReplays > 0 || cap === 2) return 2;
  // Production families carry cents: Easy needs the mean deviation within half the tolerance.
  const production = outcome.meanAbsCents !== undefined || outcome.tolCents !== undefined;
  const inTune =
    !production || (outcome.meanAbsCents ?? Number.POSITIVE_INFINITY) <= 0.5 * (outcome.tolCents ?? 50);
  const easy =
    outcome.meanCredit >= GRADE_MAP.easy &&
    outcome.medianRtMs <= outcome.fastRtMs &&
    outcome.atOrAboveLevel &&
    inTune;
  return easy && cap === 4 ? 4 : 3;
}

/** Fact cards: wrong → Again; right but hinted or slower than 3 × fastRtMs → Hard; right within fastRtMs → Easy; else Good. */
export function factGrade(correct: boolean, rtMs: number, fastRtMs: number, hinted: boolean): Rating {
  if (!correct) return 1;
  if (hinted || rtMs > GRADE_MAP.factSlowFactor * fastRtMs) return 2;
  return rtMs <= fastRtMs ? 4 : 3;
}

/**
 * A lesson step that seeds or reviews a card: the same table on its first-attempt `adjustedScore`, with
 * the rung caps of contracts §5.3. A step has no response-time evidence, so the Easy row (which needs a
 * median RT within `fastRtMs`) cannot match: the best a step gives is Good. A test-out rates Easy through
 * `Srs.rate` instead (contracts §9.5).
 */
export function stepGrade(
  adjustedScore: number,
  outcome: Pick<ReviewOutcome, "hintRung" | "revealed" | "extraReplays">,
): Rating {
  const cap = rungCap(outcome.hintRung);
  if (outcome.revealed || cap === 1 || !(adjustedScore >= GRADE_MAP.again)) return 1;
  if (adjustedScore < GRADE_MAP.hard || outcome.extraReplays > 0 || cap === 2) return 2;
  return 3;
}
