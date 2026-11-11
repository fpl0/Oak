// The level staircase of a family (exercises §4.2, contracts §7.3): levels live in `family_state`, never
// in the card. Promote after two sets ≥ 0.90 on two different days; demote after one set < 0.60. A family
// is never promoted past its highest open level.
import { LEVELS } from "./constants.ts";

export interface LevelState {
  level: number;
  /** The day (index) of the last set that counted towards promotion, or `null`. */
  promoDay: number | null;
}
export interface LevelStep extends LevelState {
  change: "promoted" | "demoted" | null;
}

export function stepLevel(
  state: LevelState,
  meanCredit: number,
  day: number,
  limits: { maxOpenLevel: number; topLevel: number },
): LevelStep {
  const ceiling = Math.min(limits.maxOpenLevel, limits.topLevel);
  if (meanCredit < LEVELS.demoteBelow) {
    if (state.level > 1) return { level: state.level - 1, promoDay: null, change: "demoted" };
    return { level: state.level, promoDay: null, change: null };
  }
  if (meanCredit >= LEVELS.promoteCredit) {
    if (state.promoDay !== null && state.promoDay !== day) {
      if (state.level < ceiling) return { level: state.level + 1, promoDay: null, change: "promoted" };
      // At the ceiling: remember the latest strong day so the family climbs as soon as a gate opens.
      return { level: state.level, promoDay: state.promoDay, change: null };
    }
    return { level: state.level, promoDay: state.promoDay ?? day, change: null };
  }
  return { level: state.level, promoDay: state.promoDay, change: null };
}
