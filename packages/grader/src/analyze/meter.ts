// Metric structure: grids, Longuet-Higgins & Lee weights, syncopation, odd-meter grouping and meter
// inference (exercises §3.3; the meter table is `METERS` in @oak/theory).
import type { MeterId, MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { METER_IDS, R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { onsets, ratKey } from "./events.ts";

const specOf = (meter: MeterId | MeterSpec): MeterSpec => (typeof meter === "string" ? METERS[meter] : meter);
const lcm = (a: number, b: number): number => {
  let [x, y] = [a, b];
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
};

/** Subdivisions of one tempo unit that the meter's notation uses, coarse to fine. */
function unitSubdivisions(m: MeterSpec): number[] {
  if (m.tempoUnit === "quarter") return [2, 4, 8];
  if (m.tempoUnit === "dottedQuarter") return [3, 6, 12];
  return [2, 4];
}

/**
 * The metric levels of one bar, strongest first, as sets of in-bar positions: the downbeat; the half bar
 * (4-unit meters) or the group starts (odd meters); every tempo unit; then its subdivisions.
 */
export function metricLevels(meter: MeterId | MeterSpec): Rat[][] {
  const m = specOf(meter);
  const U = m.unitsPerBar;
  const levels: Rat[][] = [[rat(0)]];
  const grouped =
    m.grouping.some((g) => g !== m.grouping[0]) || (m.tempoUnit === "eighth" && m.grouping.length > 1);
  if (grouped) {
    const starts: Rat[] = [];
    let acc = 0;
    for (const g of m.grouping) {
      starts.push(rat(acc, U));
      acc += g;
    }
    levels.push(starts);
  } else if (U === 4) levels.push([rat(0), rat(1, 2)]);
  levels.push(Array.from({ length: U }, (_, i) => rat(i, U)));
  for (const sub of unitSubdivisions(m))
    levels.push(Array.from({ length: U * sub }, (_, i) => rat(i, U * sub)));
  return levels;
}

/** LHL weight of an in-bar position: 0 for the downbeat, −1 for the next level, and so on. */
export function metricWeight(pos: Rat, meter: MeterId | MeterSpec): number {
  const levels = metricLevels(meter);
  const f = R.frac(pos);
  for (let i = 0; i < levels.length; i++)
    if ((levels[i] as Rat[]).some((p) => R.eq(p, f))) return i === 0 ? 0 : -i;
  return -levels.length;
}

/**
 * Longuet-Higgins and Lee weights for every position of a bar on `grid` (a fraction of the bar). In 4/4
 * on a 16th grid: beat 1 = 0, beat 3 = −1, beats 2 and 4 = −2, 8th off-beats = −3, 16ths = −4.
 */
export function metricWeights(meter: MeterId | MeterSpec, grid: Rat): number[] {
  const steps = Math.round(grid[1] / grid[0]);
  const levels = metricLevels(meter);
  const byPos = new Map<string, number>();
  levels.forEach((level, i) => {
    for (const p of level) if (!byPos.has(ratKey(p))) byPos.set(ratKey(p), i === 0 ? 0 : -i);
  });
  return Array.from({ length: steps }, (_, i) => byPos.get(ratKey(rat(i, steps))) ?? -levels.length);
}

/** The coarsest grid (as a fraction of the bar) that holds every onset and every beat of the meter. */
export function finestGrid(positions: readonly Rat[], meter: MeterId | MeterSpec): Rat {
  let den = specOf(meter).unitsPerBar;
  for (const p of positions) den = lcm(den, R.frac(p)[1]);
  return rat(1, den);
}

export type GridFeel = "binary" | "ternary" | "mixed" | "beat";
/** How the tempo unit is divided on a grid: in twos, in threes, both, or not at all. */
export function gridFeel(grid: Rat, meter: MeterId | MeterSpec): GridFeel {
  const perUnit = grid[1] / grid[0] / specOf(meter).unitsPerBar;
  if (perUnit <= 1) return "beat";
  const three = perUnit % 3 === 0;
  let rest = perUnit;
  while (rest % 3 === 0) rest /= 3;
  const two = rest > 1;
  return three && two ? "mixed" : three ? "ternary" : "binary";
}

export interface Syncopation {
  /** Sum of LHL syncopation weights. */
  total: number;
  /** Number of syncopated onsets. */
  count: number;
  /** LHL sum per bar (0-based from the first cycle of the events). */
  perBar: number[];
  /** Syncopated onsets. */
  at: Rat[];
}
/**
 * Longuet-Higgins and Lee syncopation: a note at weight `wn` that is followed, before the next onset, by
 * a silent (rest or tie) position of higher weight `wr` adds `wr − wn`.
 */
export function syncopation(events: readonly NEvent[], meter: MeterId | MeterSpec): Syncopation {
  const on = onsets(events);
  if (on.length === 0) return { total: 0, count: 0, perBar: [], at: [] };
  const m = specOf(meter);
  const grid = finestGrid(on, m);
  const steps = grid[1];
  const weights = metricWeights(m, grid);
  const first = R.floor(on[0] as Rat);
  const last = R.floor(on[on.length - 1] as Rat);
  const perBar = Array.from({ length: last - first + 1 }, () => 0);
  const at: Rat[] = [];
  const idx = on.map((o) => Math.round((o[0] * steps) / o[1]));
  let total = 0;
  for (let i = 0; i < idx.length; i++) {
    const here = idx[i] as number;
    // The last note is followed by silence up to the next downbeat (a loop starts again there).
    const until = i + 1 < idx.length ? (idx[i + 1] as number) : (Math.floor(here / steps) + 1) * steps;
    const wn = weights[((here % steps) + steps) % steps] as number;
    let wr = Number.NEGATIVE_INFINITY;
    for (let p = here + 1; p < until; p++)
      wr = Math.max(wr, weights[((p % steps) + steps) % steps] as number);
    if (wr > wn) {
      total += wr - wn;
      at.push(on[i] as Rat);
      (perBar[Math.floor(here / steps) - first] as number) += wr - wn;
    }
  }
  return { total, count: at.length, perBar, at };
}

/** Onsets that do not lie on a grid of `perBar` equal steps (8 = the 8th grid of 4/4). */
export function offGrid(events: readonly NEvent[], perBar: number): Rat[] {
  return onsets(events).filter((o) => (R.frac(o)[0] * perBar) % R.frac(o)[1] !== 0);
}

/**
 * Grouping of an odd meter from the music: group starts are kick onsets, or else onsets with gain ≥ 0.9
 * of the loudest; the grouping is the successive differences in tempo units from the downbeat.
 */
export function oddGrouping(events: readonly NEvent[], meter: MeterId | MeterSpec): number[] {
  const m = specOf(meter);
  const U = m.unitsPerBar;
  const first = events.reduce((c, e) => Math.min(c, R.floor(e.onset)), Number.POSITIVE_INFINITY);
  const bar = events.filter((e) => R.floor(e.onset) === first);
  const kicks = bar.filter((e) => e.drum === "kick");
  const max = bar.reduce((g, e) => Math.max(g, e.gain), 0);
  const accents = kicks.length > 0 ? kicks : bar.filter((e) => e.gain >= 0.9 * max);
  const starts = new Set<number>([0]);
  for (const e of accents) {
    const f = R.frac(e.onset);
    const unit = (f[0] * U) / f[1];
    if (Number.isInteger(unit)) starts.add(unit);
  }
  const sorted = [...starts].sort((a, b) => a - b);
  return sorted.map((s, i) => (sorted[i + 1] ?? U) - s);
}

export interface MeterGuess {
  meter: MeterId;
  /** Every onset lies on the meter's own grid. */
  fits: boolean;
  /** Correlation of the accent profile with the meter's strength profile, −1 to 1. */
  score: number;
}
const METER_PREFERENCE: readonly MeterId[] = [
  "4/4",
  "3/4",
  "2/4",
  "6/8",
  "12/8",
  "9/8",
  "5/4",
  "7/8",
  "5/8",
  "9/8i",
];
/** Accent weight of a hit by drum role: the kick marks downbeats, the backbeat (snare, clap) marks beats. */
const DRUM_ACCENT: Record<string, number> = { kick: 1.5, snare: 1.25, clap: 1.25, rim: 1.1 };
/**
 * Ranks the meters by how well a bar-long cycle of events fits them: every onset must lie on the meter's
 * own grid, and the accent profile (gain, kicks ×1.5, snares and claps ×1.25, summed per position) should correlate with the
 * meter's LHL strength profile over the music's own grid, and that grid should be one of the meter's
 * levels (six eighths are 3/4 or 6/8; eight are 4/4 or 2/4). A 6/8 jig with kicks on 1 and 4 beats a 3/4 waltz reading
 * of the same eighths. Ties go to the simpler meter.
 */
export function inferMeter(events: readonly NEvent[]): MeterGuess[] {
  const salience = new Map<string, { pos: Rat; w: number }>();
  for (const e of events) {
    const pos = R.frac(e.onset);
    const k = ratKey(pos);
    const s = salience.get(k) ?? { pos, w: 0 };
    s.w += e.gain * (DRUM_ACCENT[e.drum ?? ""] ?? 1);
    salience.set(k, s);
  }
  // Correlate on the grid the music itself uses (every eighth of a jig), not on each meter's finest grid:
  // there the many empty 32nd positions reward whichever meter has more strong eighths, whatever the accents.
  let den = 1;
  for (const { pos } of salience.values()) den = lcm(den, pos[1]);
  const grid = Array.from({ length: den }, (_, i) => rat(i, den));
  const natural = new Map<MeterId, boolean>();
  const guesses = METER_IDS.map((meter): MeterGuess => {
    const levels = metricLevels(meter);
    const finest = levels[levels.length - 1] as Rat[];
    const fits = [...salience.values()].every(({ pos }) => finest.some((p) => R.eq(p, pos)));
    const sal = grid.map((p) => salience.get(ratKey(p))?.w ?? 0);
    const strength = grid.map((p) => 2 ** metricWeight(p, meter));
    natural.set(
      meter,
      levels.some((l) => l.length === den),
    );
    return { meter, fits, score: pearson(sal, strength) };
  });
  // A grid that is one of the meter's own levels (six eighths: 3/4 and 6/8, never 12/8 or 9/8) comes first.
  const nat = (g: MeterGuess): number => Number(natural.get(g.meter) === true);
  return guesses.sort(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      nat(b) - nat(a) ||
      (Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : 0) ||
      METER_PREFERENCE.indexOf(a.meter) - METER_PREFERENCE.indexOf(b.meter),
  );
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += ((x[i] as number) - mx) * ((y[i] as number) - my);
    sxx += ((x[i] as number) - mx) ** 2;
    syy += ((y[i] as number) - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}
