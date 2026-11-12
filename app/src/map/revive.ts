// What the leaf panel offers to bring a leaf back (contracts §7.10, §8.5). Pure.
//
// - A drying leaf (its stale cards are in today's planned warm-up): "Revive", exactly those sets, inside the
//   day's budget.
// - A faded leaf that is not in today's warm-up: "Revive more", the explicit opt-in with its own time shown.
// - A voice leaf while Quiet mode is on (or with its production cards paused): waiting for the mic. Never a
//   failure, never a red state, and nothing to do: it keeps its level and picks up once the mic is back.
import type { LeafView } from "./state.ts";

export type ReviveAction =
  | { kind: "revive"; skillId: string }
  | { kind: "revive-more"; skillId: string }
  | { kind: "waiting-mic"; reason: "quiet" | "no-mic" }
  | { kind: "none" };

/** Production skills sung with the mic: V01–V06 (contracts §8.5). */
export function isVoiceSkill(node: { id: string; kind: string }): boolean {
  return node.kind === "production" && /^V\d+$/.test(node.id);
}

/** Below this freshness a tracked leaf counts as faded (it reads "A little faded" from here down). */
export const FADED_BELOW = 0.999;

export function reviveAction(
  node: { id: string; kind: string },
  view: Pick<LeafView, "status" | "drying" | "freshness" | "paused">,
  voice: { quiet: boolean; reason: "today" | "always" | "no-mic" | null } | null,
): ReviveAction {
  const tracked = view.status === "introduced" || view.status === "practising" || view.status === "mastered";
  if (isVoiceSkill(node) && (voice?.quiet || view.paused))
    return tracked || view.paused
      ? { kind: "waiting-mic", reason: voice?.reason === "no-mic" ? "no-mic" : "quiet" }
      : { kind: "none" };
  if (!tracked) return { kind: "none" };
  if (view.drying) return { kind: "revive", skillId: node.id };
  if (view.freshness !== null && view.freshness < FADED_BELOW)
    return { kind: "revive-more", skillId: node.id };
  return { kind: "none" };
}

/** "≈ 3 min" from planned seconds (at least one minute). */
export function minutesOf(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

/** The words for a voice leaf waiting for the mic (panel, aria label, legend). */
export const WAITING_MIC = "Waiting for the mic";

export function waitingMicLine(reason: "quiet" | "no-mic"): string {
  return reason === "no-mic"
    ? "Oak has no microphone, so its singing reviews wait. It keeps its level; nothing is lost."
    : "Quiet mode is on, so its singing reviews wait. It keeps its level; nothing is lost.";
}

/**
 * The skill states as the map draws them in Quiet mode: every voice leaf that has been started is shown paused
 * (the mic glyph, "waiting for the mic") and never drying, whatever the server last computed. Out of Quiet mode
 * the states are returned unchanged.
 */
export function withQuiet<S extends { skillId: string; level: string; paused: boolean; drying: boolean }>(
  states: ReadonlyMap<string, S>,
  quiet: boolean,
): ReadonlyMap<string, S> {
  if (!quiet) return states;
  const out = new Map(states);
  for (const [id, s] of states)
    if (/^V\d+$/.test(id) && s.level !== "new" && s.level !== "available")
      out.set(id, { ...s, paused: true, drying: false });
  return out;
}
