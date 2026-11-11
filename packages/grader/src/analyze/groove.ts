// Groove analysis: kick and bass lock, euclidean rhythms, claves, polyrhythm, ghost notes (exercises §3.3).
import type { MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { onsets, ratKey } from "./events.ts";

/** True when `a` and `b` are within `tol` of each other (exact when `tol` is 0). */
export const near = (a: Rat, b: Rat, tol: Rat): boolean => R.lte(R.abs(R.sub(a, b)), tol);

export interface GrooveLock {
  /** Share of bass onsets that fall on a kick. */
  lock: number;
  /** Share of kicks that carry a bass onset. */
  coverage: number;
  /** Bass onsets one grid step before a kick that has no bass onset of its own. */
  anticipations: Rat[];
}
export function grooveLock(
  kick: readonly Rat[],
  bass: readonly Rat[],
  tol: Rat,
  grid: Rat = [1, 16],
): GrooveLock {
  if (bass.length === 0 || kick.length === 0) return { lock: 0, coverage: 0, anticipations: [] };
  const onKick = bass.filter((b) => kick.some((k) => near(k, b, tol)));
  const covered = kick.filter((k) => bass.some((b) => near(k, b, tol)));
  const anticipations = bass.filter((b) =>
    kick.some((k) => near(R.add(b, grid), k, tol) && !bass.some((x) => near(x, k, tol))),
  );
  return { lock: onKick.length / bass.length, coverage: covered.length / kick.length, anticipations };
}

/** Bjorklund's algorithm exactly as Strudel's `euclid` lays the pulses out: E(3,8) = x..x..x., E(5,8) = x.xx.xx. */
export function euclidPattern(k: number, n: number): boolean[] {
  if (n <= 0) return [];
  const ons = Math.max(0, Math.min(Math.abs(k), n));
  let counts: [number, number] = [ons, n - ons];
  let xs: boolean[][] = Array.from({ length: ons }, () => [true]);
  let ys: boolean[][] = Array.from({ length: n - ons }, () => [false]);
  while (Math.min(counts[0], counts[1]) > 1) {
    const [a, b] = counts;
    if (a > b) {
      const head = xs.slice(0, b).map((x, i) => [...x, ...(ys[i] as boolean[])]);
      const tail = xs.slice(b);
      counts = [b, a - b];
      xs = head;
      ys = tail;
    } else {
      const head = xs.map((x, i) => [...x, ...(ys[i] as boolean[])]);
      const tail = ys.slice(a);
      counts = [a, b - a];
      xs = head;
      ys = tail;
    }
  }
  const out = [...xs.flat(), ...ys.flat()];
  return k < 0 ? out.map((v) => !v) : out;
}
/**
 * Step indices of the pulses with Strudel's `(k,n,r)` rotation. Executed against 1.2.6: `x(3,8,1)` plays
 * steps 1 4 7, so `r` moves every pulse r steps later (a rotation to the right).
 */
export function euclidSteps(k: number, n: number, rotation = 0): number[] {
  const pat = euclidPattern(k, n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (pat[(((i - rotation) % n) + n) % n]) out.push(i);
  return out;
}

/** The step set every period shares on a grid of `n` steps, or `null` when periods differ or an onset is off the grid. */
export function stepsPerPeriod(on: readonly Rat[], n: number, period: Rat = [1, 1]): number[] | null {
  const byPeriod = new Map<number, number[]>();
  for (const o of on) {
    const q = R.div(o, period);
    const step = R.mul(R.frac(q), [n, 1]);
    if (step[1] !== 1) return null;
    const i = R.floor(q);
    const list = byPeriod.get(i) ?? [];
    if (!list.includes(step[0])) list.push(step[0]);
    byPeriod.set(i, list);
  }
  let first: string | null = null;
  let steps: number[] | null = null;
  for (const list of byPeriod.values()) {
    const sorted = [...list].sort((a, b) => a - b);
    const key = sorted.join(",");
    if (first === null) {
      first = key;
      steps = sorted;
    } else if (key !== first) return null;
  }
  return steps;
}

/** Whether the onsets are E(k, n) in every period; `rotation` is the smallest Strudel `r` that matches (0 = as written). */
export function euclidMatch(
  on: readonly Rat[],
  k: number,
  n: number,
  period: Rat = [1, 1],
): { ok: boolean; rotation?: number } {
  const steps = stepsPerPeriod(on, n, period);
  if (!steps || steps.length !== Math.min(Math.abs(k), n)) return { ok: false };
  const key = steps.join(",");
  for (let r = 0; r < n; r++) if (euclidSteps(k, n, r).join(",") === key) return { ok: true, rotation: r };
  return { ok: false };
}

/** Clave grids on the 2-bar 8th grid, 16 positions (contracts §6.6, RC2). */
export const CLAVES = {
  "son 3-2": [0, 3, 6, 10, 12],
  "son 2-3": [2, 4, 8, 11, 14],
  "rumba 3-2": [0, 3, 7, 10, 12],
  "rumba 2-3": [2, 4, 8, 11, 15],
} as const;
export interface ClaveMatch {
  type: "son" | "rumba" | "tresillo" | "cinquillo" | "none";
  direction?: "3-2" | "2-3";
  /** Bars covered by complete two-bar repetitions of the pattern (one-bar patterns: bars that carry it). */
  bars: number;
}
/** Names the clave (or the one-bar tresillo or cinquillo) a line plays. 4/4 only: 8 eighths per bar. */
export function claveType(on: readonly Rat[], meter: MeterId = "4/4"): ClaveMatch {
  const perBar = METERS[meter].unitsPerBar * 2;
  if (meter !== "4/4" || on.length === 0) return { type: "none", bars: 0 };
  const two = stepsPerPeriod(on, perBar * 2, [2, 1]);
  const cycles = new Set(on.map((o) => R.floor(o)));
  if (two) {
    const key = two.join(",");
    for (const [name, grid] of Object.entries(CLAVES)) {
      if (grid.join(",") !== key) continue;
      const [type, direction] = name.split(" ") as ["son" | "rumba", "3-2" | "2-3"];
      const windows = new Set([...cycles].map((c) => Math.floor(c / 2)));
      const complete = [...windows].filter((w) => cycles.has(w * 2) && cycles.has(w * 2 + 1));
      return { type, direction, bars: complete.length * 2 };
    }
  }
  const one = stepsPerPeriod(on, perBar, [1, 1]);
  if (one?.join(",") === "0,3,6") return { type: "tresillo", bars: cycles.size };
  if (one?.join(",") === "0,2,3,5,6") return { type: "cinquillo", bars: cycles.size };
  return { type: "none", bars: 0 };
}

/** The number of evenly spaced onsets a line plays in every period, or `null` when it is uneven or changes. */
export function evenCount(on: readonly Rat[], period: Rat = [1, 1]): number | null {
  const byPeriod = new Map<number, Rat[]>();
  for (const o of on) {
    const q = R.div(o, period);
    const list = byPeriod.get(R.floor(q)) ?? [];
    list.push(R.frac(q));
    byPeriod.set(R.floor(q), list);
  }
  let count: number | null = null;
  for (const list of byPeriod.values()) {
    const uniq = [...new Map(list.map((f) => [ratKey(f), f])).values()].sort(R.cmp);
    const step = rat(1, uniq.length);
    const start = uniq[0] as Rat;
    if (!R.lt(start, step)) return null;
    if (!uniq.every((f, i) => R.eq(f, R.add(start, R.mul(step, [i, 1]))))) return null;
    if (count === null) count = uniq.length;
    else if (count !== uniq.length) return null;
  }
  return count;
}
/** `[a, b]` when both lines play evenly spaced onsets, `a` against `b` per period. */
export function polyRatio(
  a: readonly Rat[],
  b: readonly Rat[],
  period: Rat = [1, 1],
): [number, number] | null {
  const na = evenCount(a, period);
  const nb = evenCount(b, period);
  return na === null || nb === null ? null : [na, nb];
}

/** Quiet hits: effective gain ≤ `maxGain`, anywhere or only on the 16th off-beats (the "e" and "a"). */
export function velocityGhosts(
  events: readonly NEvent[],
  o: { maxGain?: number; on?: "16th-offbeat" | "any"; meter?: MeterId } = {},
): NEvent[] {
  const maxGain = o.maxGain ?? 0.4;
  const perBar = METERS[o.meter ?? "4/4"].unitsPerBar * 4;
  return events.filter((e) => {
    if (e.gain > maxGain + 1e-9) return false;
    if ((o.on ?? "any") === "any") return true;
    const step = R.mul(R.frac(e.onset), [perBar, 1]);
    return step[1] === 1 && step[0] % 2 === 1;
  });
}

/** Onsets shared by two lines (within `tol`). */
export function sharedOnsets(a: readonly NEvent[], b: readonly NEvent[], tol: Rat = [0, 1]): Rat[] {
  const ob = onsets(b);
  return onsets(a).filter((x) => ob.some((y) => near(x, y, tol)));
}
