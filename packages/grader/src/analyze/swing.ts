// Swing: the ratio a line actually swings with, and straightening back to the grid (contracts §6.10).
import type { MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import type { AstNode } from "../lint/ast.ts";
import { chainOf, numericValue, parseProgram, programInfo } from "../lint/ast.ts";
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
 * Straightens swung onsets with an exact amount: an event past the midpoint between `1/2` and `(1 + x) / 2`
 * of its slot was delayed by `swingBy`, so `x / 2` of a slot is subtracted from its onset. Durations are untouched.
 */
export function straightenExact<T extends NEvent>(events: readonly T[], x: Rat, slot: Rat): T[] {
  if (x[0] <= 0) return [...events];
  const shift = R.mul(R.div(x, [2, 1]), slot);
  // From the midpoint between the straight off-beat (1/2) and the swung one ((1 + x)/2) on: an answer swung a
  // touch less than declared (`.swingBy(.33, 4)` against 1/3) is still straightened (review:teaching, wave 5 gate).
  const threshold = R.div(R.add([2, 1], x), [4, 1]);
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

/**
 * The labelled tracks the code swings, with the amount and the slot `swingBy` / `swing` gives them (a slot is a
 * cycle over the second argument: `.swingBy(1/3, 4)` swings the 8ths of a 4/4 bar). Only literal numbers count:
 * a patterned amount is left alone. A swung line is long–short eighths, never a triplet (contracts §6.10; U13.L05
 * teaches the difference), so rhythm views straighten it first (review:robustness, Wave 6).
 */
export function swungTracks(code: string): Map<string, { x: Rat; slot: Rat }> {
  const out = new Map<string, { x: Rat; slot: Rat }>();
  const parsed = parseProgram(code);
  if (!parsed.ok) return out;
  const info = programInfo(parsed.ast);
  const consts = new Map(info.consts.map((c) => [c.name, c.init]));
  const links = (expr: AstNode | null, depth = 0): { name: string; args: AstNode[] }[] => {
    if (!expr || depth > 4) return [];
    const ch = chainOf(expr);
    const base =
      ch.base?.type === "Identifier" ? links(consts.get(ch.base.name as string) ?? null, depth + 1) : [];
    return [...base, ...ch.links.map((l) => ({ name: l.name, args: l.args }))];
  };
  for (const l of info.labels) {
    for (const link of links(l.expr)) {
      const amount =
        link.name === "swingBy" ? numericValue(link.args[0] ?? null) : link.name === "swing" ? 1 / 3 : null;
      const n = numericValue((link.name === "swingBy" ? link.args[1] : link.args[0]) ?? null);
      if (amount === null || n === null || amount <= 0 || amount >= 1 || n <= 0 || !Number.isInteger(n))
        continue;
      out.set(l.label, { x: toRat(amount, 1000), slot: [1, n] as Rat });
    }
  }
  return out;
}

/** `events` with every line the code swings straightened back to the grid (see `swungTracks`). */
export function straightenSwungLines<T extends NEvent>(events: readonly T[], code: string | undefined): T[] {
  if (!code) return [...events];
  const swung = swungTracks(code);
  if (swung.size === 0) return [...events];
  const byTrack = new Map<string, T[]>();
  for (const e of events) byTrack.set(e.track, [...(byTrack.get(e.track) ?? []), e]);
  const out: T[] = [];
  for (const [track, list] of byTrack) {
    const s = swung.get(track);
    out.push(...(s ? straightenExact(list, s.x, s.slot) : list));
  }
  return out;
}
