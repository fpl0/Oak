// A family resting in mixed practice (decision 27, contracts §7.4 as amended): when the first-review bound needs a
// slot, the most stable active family may leave its own card and rest in its composite below its mastery level.
// It is still practised there (two trials whenever the composite draws it), keeps its level, and returns to its
// own sets where it left off. Every surface that shows a family's status reads it from here, so a resting family
// never reads as "mastered" and never as lost progress.
import type { FamilyDef, FamilyState } from "@oak/api";

/**
 * A family resting in its composite (decision 27). The server reports it as `restingSince` (the learner day it
 * started resting, or null). Older servers do not send the field; then the DTO's shape decides: graduated off its
 * own card below its mastery level, with a composite to be practised in.
 */
export function isResting(def: FamilyDef, state: FamilyState | undefined): boolean {
  if (!state) return false;
  if (state.restingSince !== undefined) return state.restingSince !== null;
  return state.graduatedAt !== null && state.compositeId !== null && state.level < def.masteryLevel;
}

/** The calm line for a resting family. */
export const RESTING_LINE =
  "Resting in mixed practice: it still comes up there, and returns to its own sets where it left off.";
