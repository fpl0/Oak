// The metric grid of one bar, in whole notes: where beats, strong boundaries, beam groups and tuplet
// windows lie for each meter of contracts §6.9 (1 cycle = 1 bar, always).
import type { MeterSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";

export interface Window {
  start: Rat;
  end: Rat;
}
export interface Grid {
  meter: MeterSpec;
  /** Whole notes per bar: 4/4 → 1, 6/8 → 3/4, 7/8 → 7/8. */
  W: Rat;
  /** Length of the tempo unit in whole notes. */
  unit: Rat;
  /** Beat boundaries inside the bar (0 included, W excluded): tempo units, or the groups of a /8 meter. */
  beats: Rat[];
  /** Strong internal boundaries a note may cross only from the bar start (4/4 half bar, 12/8, 5/4 groups). */
  strong: Rat[];
  /** Simple meters may write a dotted value whose undotted part ends on a beat. */
  compound: boolean;
  /** Candidate tuplet windows, smallest level first. */
  windowLevels: Window[][];
}

const cum = (sizes: Rat[]): Rat[] => {
  const out: Rat[] = [[0, 1]];
  let acc: Rat = [0, 1];
  for (const s of sizes.slice(0, -1)) {
    acc = R.add(acc, s);
    out.push(acc);
  }
  return out;
};
const intervals = (starts: Rat[], W: Rat): Window[] =>
  starts.map((s, i) => ({ start: s, end: starts[i + 1] ?? W }));

export function gridOf(meter: MeterSpec): Grid {
  const W = rat(meter.num, meter.den);
  const unit: Rat =
    meter.tempoUnit === "quarter" ? [1, 4] : meter.tempoUnit === "dottedQuarter" ? [3, 8] : [1, 8];
  const eighth: Rat = [1, 8];
  let beats: Rat[];
  let strong: Rat[] = [];
  if (meter.den === 4) {
    beats = Array.from({ length: meter.num }, (_, i) => rat(i, 4));
    if (meter.num === 4) strong = [[1, 2]];
    else if (meter.grouping.length > 1 && meter.grouping.some((g) => g > 1)) {
      strong = cum(meter.grouping.map((g) => rat(g, 4))).slice(1);
    }
  } else {
    // /8 meters: the beat is the group (dotted quarter in 6/8, 9/8, 12/8; 2 or 3 eighths in 5/8, 7/8, 9/8i).
    beats = cum(meter.grouping.map((g) => rat(g, 8)));
    if (meter.id === "12/8") strong = [[3, 4]];
  }
  const compound = meter.den === 8;
  const sub: Window[] = [];
  if (meter.den === 4) {
    for (let i = 0; i < meter.num * 2; i++) sub.push({ start: rat(i, 8), end: rat(i + 1, 8) });
  } else {
    for (let i = 0; i < meter.num; i++) sub.push({ start: rat(i, 8), end: R.add(rat(i, 8), eighth) });
  }
  // Compound meters: two eighths inside one beat (either pair of a three-eighth group), where a triplet over two
  // eighths is written `(3:2:3` instead of one 9:6 bracket over the whole beat with a dotted value inside it.
  const pairs: Window[] = [];
  if (compound)
    for (const b of intervals(beats, W))
      for (
        let s = b.start;
        R.lte(R.add(s, [1, 4]), b.end) && R.lt([1, 4], R.sub(b.end, b.start));
        s = R.add(s, eighth)
      )
        pairs.push({ start: s, end: R.add(s, [1, 4]) });
  const levels: Window[][] = pairs.length ? [sub, pairs, intervals(beats, W)] : [sub, intervals(beats, W)];
  if (strong.length) levels.push(intervals([[0, 1], ...strong], W));
  levels.push([{ start: [0, 1], end: W }]);
  return { meter, W, unit, beats, strong, compound, windowLevels: levels };
}

export const isIn = (xs: Rat[], x: Rat): boolean => xs.some((b) => R.eq(b, x));
/** The first beat boundary strictly after `x` (or W). */
export function nextBeat(g: Grid, x: Rat): Rat {
  return g.beats.find((b) => R.lt(x, b)) ?? g.W;
}
export function beatStart(g: Grid, x: Rat): Rat {
  let s: Rat = [0, 1];
  for (const b of g.beats) if (R.lte(b, x)) s = b;
  return s;
}
export function isBeatBoundary(g: Grid, x: Rat): boolean {
  return isIn(g.beats, x) || R.eq(x, g.W);
}
