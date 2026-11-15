// Test support (not a test file): complete legal orders of all 259 sessions (contracts §7.6), from the content's
// own course graph as content/validate/wave7.test.ts builds them. The simulation of the whole course walks each:
// the tracks taken the day they open (interleaved with U14–U17), the core first and then the three tracks in each
// of their six orders, and seeded random interleavings.
import type { SessionId } from "@oak/content-kit";
import { courseGraph, registries } from "../../../../content/index.ts";
import { trackOrder } from "../../../../content/syllabus.ts";

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

type Track = "J" | "R" | "A";
const coreRank = new Map(registries.syllabus.defaultOrder.map((id, i) => [id as SessionId, i]));
const trackOf = new Map<SessionId, Track>(
  (["J", "R", "A"] as const).flatMap((t) => trackOrder[t].map((id) => [id as SessionId, t] as const)),
);
const inTrack = (id: SessionId) => trackOrder[trackOf.get(id) as Track].indexOf(id as never);

/** Every track session as soon as it opens, the tracks in J, R, A order where two are open. */
export const EARLY: readonly SessionId[] = legalOrder((id) => {
  const t = trackOf.get(id);
  return t ? -3000 + "JRA".indexOf(t) * 100 + inTrack(id) : (coreRank.get(id) ?? 0);
});
/** The default order of the core, then the three tracks one after another in `tracks` order. */
export function coreThen(tracks: readonly Track[]): SessionId[] {
  return legalOrder((id) => {
    const t = trackOf.get(id);
    return t ? 1000 + tracks.indexOf(t) * 100 + inTrack(id) : (coreRank.get(id) ?? 0);
  });
}
/** The six orders of the tracks after the core. */
export const TRACK_PERMUTATIONS: readonly (readonly Track[])[] = [
  ["J", "R", "A"],
  ["J", "A", "R"],
  ["R", "J", "A"],
  ["R", "A", "J"],
  ["A", "J", "R"],
  ["A", "R", "J"],
];
/** A seeded random legal interleaving of the core and the tracks (each track still in its own order). */
export function randomOrder(seed: number): SessionId[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const r = new Map(ALL.map((id) => [id, rnd()]));
  return legalOrder((id) => r.get(id) ?? 0);
}
