// Bar positions and beat labels (exercises §0.2, contracts §6.9 and §6.11), Euclidean rhythms exactly as
// Strudel builds them, and the Afro-Cuban timelines on a 2-bar eighth-note grid.
import { barOf, type MeterId, type MeterSpec, type PickupSpec, R, type Rat, rat } from "@oak/content-kit";
import { METERS } from "./meters.ts";
import type { BarPosition } from "./types.ts";

const spec = (m: MeterId | MeterSpec): MeterSpec => (typeof m === "string" ? METERS[m] : m);

const SIMPLE_SUB: Record<string, string> = {
  "0/1": "",
  "1/4": "e",
  "1/2": "&",
  "3/4": "a",
  "1/3": "t",
  "2/3": "l",
};
const COMPOUND_SUB: Record<string, string> = { "0/1": "", "1/3": "la", "2/3": "li" };
const key = (r: Rat) => `${r[0]}/${r[1]}`;

/** Bar, beat and beat label of an onset (exercises §0.2). With a pickup, cycle 0 is the pickup bar. */
export function barPosition(onset: Rat, meter: MeterId | MeterSpec, pickup?: PickupSpec): BarPosition {
  const m = spec(meter);
  const cycle = Math.floor(onset[0] / onset[1]);
  const inBar = R.sub(onset, rat(cycle));
  const units = R.mul(inBar, rat(m.unitsPerBar));
  const whole = Math.floor(units[0] / units[1]);
  const frac = R.sub(units, rat(whole));
  const beatNo = whole + 1;
  const beat = units[0] / units[1] + 1;
  let label: string;
  if (m.tempoUnit === "quarter") {
    const sub = SIMPLE_SUB[key(frac)];
    label = sub === undefined ? `${beatNo}+${key(frac)}` : `${beatNo}${sub}`;
  } else if (m.tempoUnit === "dottedQuarter") {
    const sub = COMPOUND_SUB[key(frac)];
    label = sub === undefined ? `${beatNo}+${key(frac)}` : `${beatNo}${sub}`;
  } else {
    // Odd meters count each group from 1: 7/8 as 2+2+3 is "1 2 1 2 1 2 3".
    let start = 0;
    let count = beatNo;
    for (const g of m.grouping) {
      if (whole < start + g) {
        count = whole - start + 1;
        break;
      }
      start += g;
    }
    const sub = frac[0] === 0 ? "" : key(frac) === "1/2" ? "&" : `+${key(frac)}`;
    label = `${count}${sub}`;
  }
  const hasPickup = pickup !== undefined;
  return { bar: barOf(onset, hasPickup), beat, label, inBar, pickup: hasPickup && cycle === 0 };
}

/** Strudel 1.2.6's Bjorklund (ported from its euclid.mjs): `ons < 0` inverts. */
export function bjorklund(ons: number, steps: number): number[] {
  const inverted = ons < 0;
  const absOns = Math.abs(ons);
  const offs = steps - absOns;
  type Seq = number[][];
  const splitAt = <T>(i: number, xs: T[]): [T[], T[]] => [xs.slice(0, i), xs.slice(i)];
  const zipWith = (xs: number[][], ys: number[][]) =>
    xs.slice(0, Math.min(xs.length, ys.length)).map((a, i) => a.concat(ys[i] as number[]));
  const left = (n: [number, number], x: [Seq, Seq]): [[number, number], [Seq, Seq]] => {
    const [o, f] = n;
    const [xs, ys] = x;
    const [a, b] = splitAt(f, xs);
    return [
      [f, o - f],
      [zipWith(a, ys), b],
    ];
  };
  const right = (n: [number, number], x: [Seq, Seq]): [[number, number], [Seq, Seq]] => {
    const [o, f] = n;
    const [xs, ys] = x;
    const [a, b] = splitAt(o, ys);
    return [
      [o, f - o],
      [zipWith(xs, a), b],
    ];
  };
  let n: [number, number] = [absOns, offs];
  let x: [Seq, Seq] = [
    Array.from({ length: absOns }, () => [1]),
    Array.from({ length: Math.max(0, offs) }, () => [0]),
  ];
  while (Math.min(n[0], n[1]) > 1) [n, x] = n[0] > n[1] ? left(n, x) : right(n, x);
  const pattern = [...x[0].flat(), ...x[1].flat()];
  return inverted ? pattern.map((v) => 1 - v) : pattern;
}

/** `s("x(k,n,r)")` as a boolean grid: Strudel rotates the Bjorklund pattern right by `r` steps. */
export function euclid(pulses: number, steps: number, rotation = 0): boolean[] {
  if (!Number.isInteger(pulses) || !Number.isInteger(steps) || steps < 1 || Math.abs(pulses) > steps) {
    throw new RangeError(`@oak/theory: euclid(${pulses}, ${steps}) is not a rhythm`);
  }
  let b = bjorklund(pulses, steps);
  if (rotation) b = b.slice(-rotation).concat(b.slice(0, -rotation));
  return b.map((v) => v === 1);
}
/** Onset step indices of a grid. */
export const onsetsOf = (grid: readonly boolean[]): number[] => grid.flatMap((on, i) => (on ? [i] : []));

export interface RhythmGrid {
  id: string;
  title: string;
  /** Bars the grid spans (1 cycle = 1 bar). */
  bars: number;
  /** Steps per bar (eighth notes in 4/4). */
  stepsPerBar: number;
  /** Onset steps from 0, across all bars. */
  onsets: number[];
}

/** Timelines on a 2-bar grid of eighth notes in 4/4 (16 steps; the clave is felt in cut time). */
export const RHYTHM_GRIDS: readonly RhythmGrid[] = [
  { id: "tresillo", title: "Tresillo (3+3+2)", bars: 2, stepsPerBar: 8, onsets: [0, 3, 6, 8, 11, 14] },
  { id: "habanera", title: "Habanera", bars: 2, stepsPerBar: 8, onsets: [0, 3, 4, 6, 8, 11, 12, 14] },
  {
    id: "cinquillo",
    title: "Cinquillo",
    bars: 2,
    stepsPerBar: 8,
    onsets: [0, 2, 3, 5, 6, 8, 10, 11, 13, 14],
  },
  { id: "son-clave-3-2", title: "Son clave 3–2", bars: 2, stepsPerBar: 8, onsets: [0, 3, 6, 10, 12] },
  { id: "son-clave-2-3", title: "Son clave 2–3", bars: 2, stepsPerBar: 8, onsets: [2, 4, 8, 11, 14] },
  { id: "rumba-clave-3-2", title: "Rumba clave 3–2", bars: 2, stepsPerBar: 8, onsets: [0, 3, 7, 10, 12] },
  { id: "rumba-clave-2-3", title: "Rumba clave 2–3", bars: 2, stepsPerBar: 8, onsets: [2, 4, 8, 11, 15] },
  { id: "bossa-clave", title: "Bossa nova clave", bars: 2, stepsPerBar: 8, onsets: [0, 3, 6, 10, 13] },
];
export function rhythmGrid(id: string): RhythmGrid | null {
  return RHYTHM_GRIDS.find((g) => g.id === id) ?? null;
}
/** The grid as booleans, `bars * stepsPerBar` long. */
export function gridSteps(g: RhythmGrid): boolean[] {
  const out = Array.from({ length: g.bars * g.stepsPerBar }, () => false);
  for (const o of g.onsets) out[o] = true;
  return out;
}
/** Onsets in cycles (= bars): son clave 3–2 → 0, 3/8, 3/4, 5/4, 3/2. */
export function gridOnsets(g: RhythmGrid): Rat[] {
  return g.onsets.map((o) => rat(o, g.stepsPerBar));
}
/** Mini-notation, one bar per `< >` slot: `"<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>"`. */
export function gridToMini(g: RhythmGrid, word = "x"): string {
  const steps = gridSteps(g);
  const bars: string[] = [];
  for (let b = 0; b < g.bars; b++) {
    bars.push(
      `[${steps
        .slice(b * g.stepsPerBar, (b + 1) * g.stepsPerBar)
        .map((on) => (on ? word : "~"))
        .join(" ")}]`,
    );
  }
  return g.bars === 1 ? (bars[0] as string) : `<${bars.join(" ")}>`;
}
