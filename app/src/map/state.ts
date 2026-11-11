// How a leaf looks (contracts §7.10): hue from the mastery level, opacity from freshness F relative to each
// card's own desired retention (computed by the server), drying only for nodes in today's planned warm-up.
// Pure: the SVG and the thumbnail both read it.
import type { SkillState } from "@oak/api";

export type LeafStatus = "locked" | "available" | "introduced" | "practising" | "mastered";

export const LEAF_STATUSES: readonly LeafStatus[] = [
  "locked",
  "available",
  "introduced",
  "practising",
  "mastered",
];

export const STATUS_OF_LEVEL: Record<SkillState["level"], LeafStatus> = {
  new: "locked",
  available: "available",
  learning: "introduced",
  practiced: "practising",
  mastered: "mastered",
};

export const STATUS_LABEL: Record<LeafStatus, string> = {
  locked: "Not open yet",
  available: "Ready to learn",
  introduced: "Introduced",
  practising: "Practising",
  mastered: "Mastered",
};

/** One line each, for the legend and the panel. */
export const STATUS_HELP: Record<LeafStatus, string> = {
  locked: "Its lesson opens later in the course.",
  available: "Its lesson is open. Nothing to keep up yet.",
  introduced: "You have met it. Practice makes it hold.",
  practising: "Solid on most days. Reviews keep it fresh.",
  mastered: "Reliable over many days, and checked.",
};

export const MIN_OPACITY = 0.35;

export interface LeafView {
  status: LeafStatus;
  /** Fill opacity of the leaf: `0.35 + 0.65 · F` once there is something to keep fresh, otherwise 1. */
  opacity: number;
  /** Freshness F in [0, 1], `null` while the node has nothing to keep fresh. */
  freshness: number | null;
  /** Its stale cards are in today's planned warm-up: droop, dry edge, Revive. */
  drying: boolean;
  /** Production node without a microphone: shows a mic glyph and keeps its last F. */
  paused: boolean;
  debt: boolean;
  provisional: boolean;
}

export function leafView(s: SkillState | undefined): LeafView {
  const status = s ? STATUS_OF_LEVEL[s.level] : "locked";
  const tracked = status === "introduced" || status === "practising" || status === "mastered";
  const f = s && tracked ? Math.min(1, Math.max(0, s.freshness)) : null;
  return {
    status,
    opacity: f === null ? 1 : MIN_OPACITY + (1 - MIN_OPACITY) * f,
    freshness: f,
    drying: Boolean(s?.drying) && tracked,
    paused: Boolean(s?.paused),
    debt: Boolean(s?.debt),
    provisional: Boolean(s?.provisional),
  };
}

/** Calm wording for freshness; never a loss frame. */
export function freshnessLabel(f: number | null): string {
  if (f === null) return "Nothing to keep fresh yet";
  if (f >= 0.999) return "On schedule";
  if (f >= 0.5) return "A little faded";
  return "Ready for a refresh";
}

export function pctText(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? "–" : `${Math.round(v * 100)}%`;
}

export interface MapCounts {
  total: number;
  grown: number;
  byStatus: Record<LeafStatus, number>;
  drying: number;
}

/** Counts for the header and the thumbnail: "grown" = practising or mastered. */
export function countLeaves(ids: readonly string[], states: ReadonlyMap<string, SkillState>): MapCounts {
  const byStatus: Record<LeafStatus, number> = {
    locked: 0,
    available: 0,
    introduced: 0,
    practising: 0,
    mastered: 0,
  };
  let drying = 0;
  for (const id of ids) {
    const v = leafView(states.get(id));
    byStatus[v.status] += 1;
    if (v.drying) drying += 1;
  }
  return { total: ids.length, grown: byStatus.practising + byStatus.mastered, byStatus, drying };
}
