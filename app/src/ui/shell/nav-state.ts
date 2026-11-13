// Honest NavRail states (Wave 4). Two destinations open properly only later in the course: the Transcription Gym
// starts with U07 (`tb.feature.transcribe`, granted at U07.L01) and the album gets its first track with the first
// capstone session (`tb.feature.album`, granted when C0.S1 starts). Before that the rail shows the item quieter,
// with a small lock and a tooltip that says when it opens. Neither is ever gated (contracts §7.6 rule 6): the
// page stays reachable, by click and by `G R` / `G A`. Pure, so the rule is unit-tested (nav-state.test.ts).
import type { NavId } from "../../lib/nav.ts";

export interface NavGate {
  /** The toolbox row that opens it (content/toolbox.ts). */
  unlock: string;
  /** When it opens, as a short clause after the label. */
  opens: string;
}

export const NAV_GATES: Readonly<Partial<Record<NavId, NavGate>>> = {
  transcribe: { unlock: "tb.feature.transcribe", opens: "the Transcription Gym opens with U07 · Melody" },
  album: { unlock: "tb.feature.album", opens: "your first track arrives with your first capstone" },
};

export interface NavItemState {
  /** Not opened yet (the item stays reachable). */
  pending: boolean;
  /** Tooltip and accessible name. */
  label: string;
}

/**
 * The rail state of one item. While the unlock list has not loaded (`ready` false) nothing is marked, so the
 * rail never flashes a lock at a learner who has the item.
 */
export function navItemState(
  id: NavId,
  label: string,
  unlocked: ReadonlySet<string>,
  ready: boolean,
): NavItemState {
  const gate = NAV_GATES[id];
  if (!gate || !ready || unlocked.has(gate.unlock)) return { pending: false, label };
  return { pending: true, label: `${label}: ${gate.opens}` };
}
