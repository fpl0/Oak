// One voice, one bar: sounding segments → written items (note values, ties, rests, tuplets, beams).
// Promoted from spikes/s4-notation/quantize.ts and generalised to every meter of contracts §6.9.
// All positions here are whole-note fractions relative to the bar start (4/4: 1 bar = 1 whole).
import type { Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { beatStart, type Grid, isBeatBoundary, isIn, nextBeat, type Window } from "./meter.ts";
import { floorTo, isMultipleOf, isPow2, oddPart, onBinaryGrid } from "./q.ts";
import type { NotationWarning, TupletMark } from "./types.ts";

export interface Seg<S> {
  start: Rat;
  end: Rat;
  slot: S | null;
  tieIn: boolean;
  tieOut: boolean;
}
export interface QItem<S> {
  slot: S | null;
  start: Rat;
  /** Sounding length. */
  dur: Rat;
  /** Written length (sounding · p/q inside a tuplet). */
  written: Rat;
  tieFromPrev: boolean;
  tieToNext: boolean;
  inTuplet: boolean;
  tupletStart?: TupletMark;
  breakBefore: boolean;
}
export interface BarResult<S> {
  items: QItem<S>[];
  approximate: boolean;
  warnings: Omit<NotationWarning, "bar">[];
}

const FINEST = 32; // a 32nd note is the shortest written value
const SNAP: Rat = [1, 16];

/** Every single written value, longest first: base 1..32, up to two dots, nothing below a 32nd. */
export const VALUES: { v: Rat; base: 1 | 2 | 4 | 8 | 16 | 32; dots: 0 | 1 | 2 }[] = (() => {
  const out: { v: Rat; base: 1 | 2 | 4 | 8 | 16 | 32; dots: 0 | 1 | 2 }[] = [];
  for (const base of [1, 2, 4, 8, 16, 32] as const) {
    for (const dots of [0, 1, 2] as const) {
      if (base * 2 ** dots > FINEST) continue;
      out.push({ v: R.mul(rat(1, base), rat(2 ** (dots + 1) - 1, 2 ** dots)), base, dots });
    }
  }
  return out.sort((a, b) => R.cmp(b.v, a.v));
})();
export function writtenOf(v: Rat): { base: 1 | 2 | 4 | 8 | 16 | 32; dots: 0 | 1 | 2 } | null {
  const hit = VALUES.find((x) => R.eq(x.v, v));
  return hit ? { base: hit.base, dots: hit.dots } : null;
}
const notatable = (v: Rat): boolean => VALUES.some((x) => R.eq(x.v, v));

/** Splits segments at the given cut points (notes become tied pieces, rests simply split). */
export function splitAt<S>(segs: Seg<S>[], cuts: Rat[]): Seg<S>[] {
  let out = segs;
  for (const c of cuts) {
    out = out.flatMap((s) =>
      R.lt(s.start, c) && R.lt(c, s.end)
        ? [
            { ...s, end: c, tieOut: s.slot !== null },
            { ...s, start: c, tieIn: s.slot !== null },
          ]
        : [s],
    );
  }
  return out;
}

interface TWindow extends Window {
  p: number;
  q: number;
}
type WindowFailure = "tuplet-too-long" | "mixed-tuplets" | "snapped-to-grid";

/** q for p notes in a window whose length has odd part `a`: the largest a·2^j below p (3:2, 5:4, 7:4, 9:8; 5:3 in a dotted beat). */
function qFor(p: number, size: Rat): number | null {
  const a = oddPart(size[0]);
  let best: number | null = null;
  for (let q = a; q < p; q *= 2) best = q;
  return best;
}
function distinctOddPrimes(k: number): number {
  let n = k;
  let count = 0;
  for (let f = 3; f * f <= n; f += 2) {
    if (n % f === 0) {
      count++;
      while (n % f === 0) n /= f;
    }
  }
  if (n > 1) count++;
  return count;
}

/**
 * Tuplet windows: for every off-grid boundary take the smallest metric window (sub-beat, beat, strong
 * group, bar) in which every boundary's position relative to the window has an LCD of k·2^m with
 * k ∈ {3,5,7,9}, and no off-grid segment crosses the window's edges.
 */
function findWindows<S>(segs: Seg<S>[], g: Grid): TWindow[] | WindowFailure {
  const windows: TWindow[] = [];
  const covered = (x: Rat) => windows.some((w) => R.lt(w.start, x) && R.lt(x, w.end));
  const points = segs.flatMap((s) => [s.start, s.end]).filter((x) => !onBinaryGrid(x, FINEST));
  let worstK = 1;
  for (const x of points) {
    if (covered(x)) continue;
    let found: TWindow | null = null;
    for (const level of g.windowLevels) {
      const w = level.find((c) => R.lt(c.start, x) && R.lt(x, c.end));
      if (!w) continue;
      const size = R.sub(w.end, w.start);
      const crossing = segs.some(
        (s) =>
          ((R.lt(s.start, w.start) && R.lt(w.start, s.end)) ||
            (R.lt(s.start, w.end) && R.lt(w.end, s.end))) &&
          (!onBinaryGrid(s.start, FINEST) || !onBinaryGrid(s.end, FINEST)),
      );
      if (crossing) continue;
      let lcd = 1;
      for (const s of segs) {
        for (const y of [s.start, s.end]) {
          if (!(R.lt(w.start, y) && R.lt(y, w.end))) continue;
          const rel = R.div(R.sub(y, w.start), size);
          lcd = R.lcd([[1, lcd], rel]);
        }
      }
      const k = oddPart(lcd);
      if (k > worstK) worstK = k;
      if (![3, 5, 7, 9].includes(k)) continue;
      const q = qFor(k, size);
      if (q === null || q > 9) continue;
      // The written values must land on the binary grid.
      if (!isPow2(R.div(R.div(size, rat(q)), [1, 1])[1])) continue;
      if (windows.some((o) => R.lt(o.start, w.end) && R.lt(w.start, o.end))) continue;
      found = { ...w, p: k, q };
      break;
    }
    if (!found) {
      if (distinctOddPrimes(worstK) > 1) return "mixed-tuplets";
      if (worstK > 9) return "tuplet-too-long";
      return "snapped-to-grid";
    }
    windows.push(found);
  }
  return windows.sort((a, b) => R.cmp(a.start, b.start));
}

/** Fallback: snap every boundary to the nearest 1/16, drop empty segments. */
function snapSegments<S>(segs: Seg<S>[]): Seg<S>[] {
  const snap = (x: Rat): Rat => R.mul(rat(Math.round(R.toNum(R.div(x, SNAP)))), SNAP);
  const out: Seg<S>[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    const start = prev ? prev.end : snap(s.start);
    const end = R.max(snap(s.end), start);
    if (R.eq(start, end)) continue;
    out.push({ ...s, start, end });
  }
  return out;
}

/** The longest note value from `pos` that keeps the beat visible (architecture §2.5 step 7). */
function noteValue(g: Grid, pos: Rat, end: Rat): Rat | null {
  let limit = end;
  const atStrong = R.eq(pos, [0, 1]) || isIn(g.strong, pos);
  for (const b of g.strong) {
    if (!(R.lt(pos, b) && R.lt(b, limit))) continue;
    const whole = atStrong && notatable(R.sub(limit, pos));
    // The classic syncopation: a half note on beat 2 of 4/4.
    const syncopation = g.meter.id === "4/4" && R.eq(pos, [1, 4]) && R.eq(R.sub(limit, pos), [1, 2]);
    if (!whole && !syncopation) limit = b;
    break;
  }
  if (!isBeatBoundary(g, pos)) {
    const nb = nextBeat(g, pos);
    if (R.lt(nb, limit)) limit = nb;
  }
  const room = R.sub(limit, pos);
  const nb = nextBeat(g, pos);
  for (const { v, dots } of VALUES) {
    if (R.lt(room, v)) continue;
    const stop = R.add(pos, v);
    if (R.lt(nb, stop)) {
      // Crossing a beat: start on a beat and end on one, or (simple meters) a dotted value whose
      // undotted part ends on a beat (dotted quarter on beat 1).
      const ok =
        isBeatBoundary(g, pos) &&
        (isBeatBoundary(g, stop) ||
          (!g.compound && dots === 1 && isBeatBoundary(g, R.add(pos, R.mul(v, [2, 3])))));
      if (!ok) continue;
    }
    return v;
  }
  return null;
}

/** The rest value at `pos`: aligned powers of two, dotted only for whole compound beats. */
function restValue(g: Grid, pos: Rat, end: Rat, wholeBar: boolean): Rat | null {
  if (wholeBar && notatable(g.W)) return g.W;
  let limit = end;
  const atStrong = R.eq(pos, [0, 1]) || isIn(g.strong, pos);
  for (const b of g.strong) {
    if (R.lt(pos, b) && R.lt(b, limit)) {
      if (atStrong) break;
      limit = b;
      break;
    }
  }
  if (!isBeatBoundary(g, pos)) {
    const nb = nextBeat(g, pos);
    if (R.lt(nb, limit)) limit = nb;
  }
  const room = R.sub(limit, pos);
  const bs = beatStart(g, pos);
  const nb = nextBeat(g, pos);
  for (const { v, dots } of VALUES) {
    if (R.lt(room, v) || dots === 2) continue;
    const stop = R.add(pos, v);
    const onBeats = isBeatBoundary(g, pos) && isBeatBoundary(g, stop);
    if (dots === 1) {
      // A dotted rest only fills whole compound beats.
      if (g.compound && onBeats) return v;
      continue;
    }
    if (R.lt(nb, stop) ? onBeats : isMultipleOf(R.sub(pos, bs), v)) return v;
  }
  return null;
}

function decompose<S>(g: Grid, segs: Seg<S>[], windows: TWindow[], wholeBar: boolean): QItem<S>[] | null {
  const items: QItem<S>[] = [];
  const push = (
    seg: Seg<S>,
    start: Rat,
    dur: Rat,
    written: Rat,
    first: boolean,
    last: boolean,
    inT: boolean,
  ) => {
    items.push({
      slot: seg.slot,
      start,
      dur,
      written,
      tieFromPrev: seg.slot !== null && (first ? seg.tieIn : true),
      tieToNext: seg.slot !== null && (last ? seg.tieOut : true),
      inTuplet: inT,
      breakBefore: false,
    });
  };
  for (const seg of segs) {
    const w = windows.find((x) => R.lte(x.start, seg.start) && R.lte(seg.end, x.end));
    if (w) {
      const ratio = rat(w.p, w.q);
      let pos = seg.start;
      let remaining = R.mul(R.sub(seg.end, seg.start), ratio);
      let first = true;
      while (R.lt([0, 1], remaining)) {
        const isNote = seg.slot !== null;
        let v: Rat | null = null;
        for (const x of VALUES) {
          if (!isNote && x.dots > 0) continue;
          if (R.lte(x.v, remaining)) {
            v = x.v;
            break;
          }
        }
        if (!v) return null;
        const dur = R.div(v, ratio);
        remaining = R.sub(remaining, v);
        push(seg, pos, dur, v, first, R.eq(remaining, [0, 1]), true);
        pos = R.add(pos, dur);
        first = false;
      }
      continue;
    }
    let pos = seg.start;
    let first = true;
    while (R.lt(pos, seg.end)) {
      const v =
        seg.slot === null
          ? restValue(g, pos, seg.end, wholeBar && R.eq(seg.start, [0, 1]) && R.eq(seg.end, g.W))
          : noteValue(g, pos, seg.end);
      if (!v) return null;
      const next = R.add(pos, v);
      push(seg, pos, v, v, first, R.eq(next, seg.end), false);
      pos = next;
      first = false;
    }
  }
  return items;
}

function marksAndBeams<S>(g: Grid, items: QItem<S>[], windows: TWindow[]): number {
  let maxR = 0;
  for (const w of windows) {
    const group = items.filter((it) => it.inTuplet && R.lte(w.start, it.start) && R.lt(it.start, w.end));
    const head = group[0];
    if (!head) continue;
    maxR = Math.max(maxR, group.length);
    head.tupletStart = { p: w.p, q: w.q, r: group.length };
  }
  const quarter: Rat = [1, 4];
  items.forEach((it, i) => {
    const prev = items[i - 1];
    const long = (x: QItem<S> | undefined) => x !== undefined && R.lte(quarter, x.written);
    it.breakBefore =
      i > 0 &&
      (isIn(g.beats, it.start) ||
        it.tupletStart !== undefined ||
        (prev?.inTuplet === true && !it.inTuplet) ||
        it.slot === null ||
        prev?.slot === null ||
        long(it) ||
        long(prev));
  });
  return maxR;
}

/**
 * Notates one bar of one voice. `segs` must cover [0, W) contiguously (rests included). `cuts` are
 * extra positions where an item must start (chord symbols, the pickup boundary).
 */
export function quantizeBar<S>(g: Grid, input: Seg<S>[], cuts: Rat[]): BarResult<S> {
  const warnings: Omit<NotationWarning, "bar">[] = [];
  let approximate = false;
  const wholeBar = input.length === 1 && input[0]?.slot === null;
  let segs = splitAt(input, cuts);
  let found = findWindows(segs, g);
  if (typeof found === "string") {
    approximate = true;
    warnings.push({
      code: found,
      message:
        found === "mixed-tuplets"
          ? "two different tuplet ratios overlap in this bar; the rhythm was snapped to 1/16"
          : found === "tuplet-too-long"
            ? "this bar divides a beat into more than 9 notes; the rhythm was snapped to 1/16"
            : "this rhythm is finer than the written grid; it was snapped to 1/16",
    });
    segs = splitAt(
      snapSegments(segs),
      cuts.map((c) => floorTo(c, SNAP)),
    );
    found = [];
  }
  const windows = found;
  segs = splitAt(
    segs,
    windows.flatMap((w) => [w.start, w.end]),
  );
  let items = decompose(g, segs, windows, wholeBar);
  let maxR = items ? marksAndBeams(g, items, windows) : 0;
  if (!items || maxR > 9) {
    approximate = true;
    warnings.push({
      code: "tuplet-too-long",
      message: "a tuplet would need more than 9 written notes (abcjs reads single digits); snapped to 1/16",
    });
    const snapped = splitAt(
      snapSegments(segs),
      cuts.map((c) => floorTo(c, SNAP)),
    );
    items = decompose(g, snapped, [], wholeBar) ?? [];
    maxR = marksAndBeams(g, items, []);
  }
  return { items, approximate, warnings };
}
