// Test support (not a test file): the legal orders of the whole course (contracts §7.6), from the content's own
// course graph, the way content/validate/wave7.test.ts builds them. "early" takes every track session the day
// it opens (the jazz and rhythm tracks start right after U13.CP, interleaved with U14–U17; A1.L01 after
// U03.L02): the earliest legal route of every track lesson. "late" is the default order of the core, then the
// tracks. Drill families are checked against what the learner has completed at each session of these orders.
import type { SessionId } from "@oak/content-kit";
import { courseGraph, registries } from "../../../content/index.ts";
import { trackOrder } from "../../../content/syllabus.ts";

const g = courseGraph();
const ALL = [...g.nodes.keys()];

/** A legal order of the whole course: at each step, the first open session in `rank` order. */
export function legalOrder(rank: (id: SessionId) => number): SessionId[] {
  const done = new Set<SessionId>();
  const out: SessionId[] = [];
  const pending = new Set(ALL);
  while (pending.size) {
    const open = [...pending].filter((id) => (g.nodes.get(id)?.requires ?? []).every((r) => done.has(r)));
    if (open.length === 0) throw new Error(`stuck after ${out.length}`);
    open.sort((a, b) => rank(a) - rank(b));
    const next = open[0] as SessionId;
    out.push(next);
    done.add(next);
    pending.delete(next);
  }
  return out;
}

const coreRank = new Map(registries.syllabus.defaultOrder.map((id, i) => [id as SessionId, i]));
export const TRACK_SESSIONS: readonly SessionId[] = [...trackOrder.J, ...trackOrder.R, ...trackOrder.A];
const trackRank = new Map(TRACK_SESSIONS.map((id, i) => [id, i] as const));

/** Every track session as soon as it opens. */
export const EARLY_ORDER: readonly SessionId[] = legalOrder((id) =>
  trackRank.has(id) ? -1000 + (trackRank.get(id) ?? 0) : (coreRank.get(id) ?? 0),
);
/** The core first (the default order), then the tracks J, R, A. */
export const LATE_ORDER: readonly SessionId[] = legalOrder((id) =>
  coreRank.has(id) ? (coreRank.get(id) ?? 0) : 1000 + (trackRank.get(id) ?? 0),
);
