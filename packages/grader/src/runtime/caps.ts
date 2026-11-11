// How many bars a grading request queries (contracts §6.4).
import type { GradingMode } from "@oak/content-kit";
import { MODE_LIMITS } from "../types.ts";

/**
 * lesson: `min(64, max(reference.bars, min(16, periodOf(answer))))`; capstone: the whole piece up to
 * 128 bars; tutor: a window of at most 16 bars.
 */
export function barsToQuery(mode: GradingMode, referenceBars: number, answerPeriod: number): number {
  const ref = Math.max(1, Math.floor(referenceBars) || 1);
  const period = Math.max(1, Math.floor(answerPeriod) || 1);
  const { maxBars, periodCap } = MODE_LIMITS[mode];
  switch (mode) {
    case "lesson":
      return Math.min(maxBars, Math.max(ref, Math.min(periodCap, period)));
    case "capstone":
      return Math.min(maxBars, Math.max(ref, Math.min(periodCap, period)));
    case "tutor":
      return Math.min(maxBars, ref);
  }
}
