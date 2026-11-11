// Swing: the ratio a line actually swings with, and straightening back to the grid (contracts §6.10).
import type { MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { median, modeOf, onsets, ratKey, toRat } from "./events.ts";

export type SwingClass = "straight" | "light" | "triplet" | "hard";
export interface SwingMeasure {
  /** Long : short, the median over the measurable beats. 1 = straight, 2 = triplet swing. `NaN` when nothing is measurable. */
  ratio: number;
  /** The `swingBy` amount: `(ratio − 1) / (ratio + 1)`. */
  x: number;
  /** Measurable slots: an onset at the start and exactly one inside. */
  n: number;
  cls: SwingClass;
  /** The most common off-beat position inside a slot, exact; `null` when nothing is measurable. */
  p: Rat | null;
}

/** One swung slot in cycles: a tempo unit for 8th swing, half of one for 16th swing. */
export function swingSlot(meter: MeterId, subdivision: 8 | 16): Rat {
  return rat(1, METERS[meter].unitsPerBar * (subdivision === 8 ? 1 : 2));
}

export function swingClass(ratio: number): SwingClass {
  return ratio < 1.2 ? "straight" : ratio < 1.6 ? "light" : ratio < 2.4 ? "triplet" : "hard";
}

/**
 * For each slot with an onset at its start and exactly one inside it, at fraction `p` of the slot:
 * `ratio = p / (1 − p)`; the result is the median. Quarter-note lines are not measurable (n = 0).
 */
export function swingRatio(events: readonly NEvent[], meter: MeterId, subdivision: 8 | 16 = 8): SwingMeasure {
  const slot = swingSlot(meter, subdivision);
  const bySlot = new Map<number, Rat[]>();
  for (const o of onsets(events)) {
    const q = R.div(o, slot);
    const i = R.floor(q);
    const list = bySlot.get(i) ?? [];
    list.push(R.frac(q));
    bySlot.set(i, list);
  }
  const ps: Rat[] = [];
  for (const fr of bySlot.values()) {
    if (!fr.some((f) => f[0] === 0)) continue;
    const inside = fr.filter((f) => f[0] !== 0);
    if (inside.length === 1) ps.push(inside[0] as Rat);
  }
  if (ps.length === 0) return { ratio: Number.NaN, x: 0, n: 0, cls: "straight", p: null };
  const ratio = median(ps.map((p) => p[0] / (p[1] - p[0])));
  const key = modeOf(ps.map(ratKey)) as string;
  const p = ps.find((q) => ratKey(q) === key) as Rat;
  return { ratio, x: (ratio - 1) / (ratio + 1), n: ps.length, cls: swingClass(ratio), p };
}

/**
 * Straightens swung onsets with an exact amount: an event at or after `(1 + x) / 2` of its slot was
 * delayed by `swingBy`, so `x / 2` of a slot is subtracted from its onset. Durations are untouched.
 */
export function straightenExact<T extends NEvent>(events: readonly T[], x: Rat, slot: Rat): T[] {
  if (x[0] <= 0) return [...events];
  const shift = R.mul(R.div(x, [2, 1]), slot);
  const threshold = R.div(R.add([1, 1], x), [2, 1]);
  return events.map((e) => {
    const f = R.frac(R.div(e.onset, slot));
    return R.lt(f, threshold) ? e : { ...e, onset: R.sub(e.onset, shift) };
  });
}

/**
 * Straightens swung onsets back to the grid: subtracts `amount / 2 × slot` from each off-beat onset,
 * durations untouched (contracts §6.10 item 6). A slot is a beat for 8th swing, half a beat for 16th swing.
 */
export function straighten(
  events: readonly NEvent[],
  swing: { subdivision: 8 | 16; amount: number },
  meter: MeterId,
): NEvent[] {
  return straightenExact(events, toRat(swing.amount), swingSlot(meter, swing.subdivision));
}

/**
 * Which of a `swing` rule's tracks is measured (contracts §6.6): the first candidate with at least 4
 * measurable beats on the subdivision. `null` when none is measurable.
 */
export function pickSwingTrack<T extends { events: readonly NEvent[] }>(
  candidates: readonly T[],
  meter: MeterId,
  subdivision: 8 | 16,
): { candidate: T; measure: SwingMeasure } | null {
  for (const candidate of candidates) {
    const measure = swingRatio(candidate.events, meter, subdivision);
    if (measure.n >= 4) return { candidate, measure };
  }
  return null;
}
