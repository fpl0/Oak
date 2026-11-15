// Wave 7, the rhythm track's answer logic (docs/design/wave7.md §11; contracts §2.6 R1–R3): the odd-meter grouping
// (a bar of eighths, or quarters in 5/4, cut into 2s and 3s), the Euclidean numbers (k, n, r) and the ring they
// draw, the clave's two-bar grid, two-lane taps (one lane per hand, each graded on its own with `tapReport`, the one
// tap rule), and what the "set the swing" and "set the lay-back" sliders play and say (the ratio a swing amount
// gives; the milliseconds a `.late()` is at the piece's tempo). Pure: tested with `bun test` (rhythm7.test.ts).
import type { LearnerProfile, MeterId, TapTolerance } from "@oak/content-kit";
import { lateCycles, lateMs, METER_GROUPINGS, swingRatio } from "@oak/content-kit";
import { claveSteps, euclid, METERS, onsetsOf } from "@oak/theory";
import { offsetWords, type TapReport, tapReport } from "./tap.ts";
import type { AnswerFeedback, PartMark } from "./types.ts";

// --- grouping -------------------------------------------------------------------------------------------------

/** The counting unit of a grouping answer: eighths in /8 meters, quarters in 5/4 (`METER_GROUPINGS`). */
export function groupingUnits(meter: MeterId): { units: number; word: "eighth" | "quarter" } {
  const m = METERS[meter];
  if (!m) return { units: 8, word: "eighth" };
  return m.den === 8 ? { units: m.num, word: "eighth" } : { units: m.unitsPerBar, word: "quarter" };
}

/** The groupings this meter may declare (contracts §6.9), or none for a meter without them. */
export function legalGroupings(meter: MeterId): readonly (readonly number[])[] {
  return METER_GROUPINGS[meter] ?? [];
}

export const sumOf = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Appends a group of 2 or 3 when it fits in the bar; otherwise the value is unchanged. */
export function addGroup(value: readonly number[], size: 2 | 3, units: number): number[] {
  return sumOf(value) + size <= units ? [...value, size] : [...value];
}
/** Removes the last group. */
export function dropGroup(value: readonly number[]): number[] {
  return value.slice(0, -1);
}
/** Swaps a group between 2 and 3 when the bar still fits (a click on a group). */
export function flipGroup(value: readonly number[], at: number, units: number): number[] {
  const g = value[at];
  if (g === undefined) return [...value];
  const next = [...value];
  next[at] = g === 2 ? 3 : 2;
  return sumOf(next) <= units ? next : [...value];
}

/** A grouping can be checked when it fills the bar with 2s and 3s. */
export function groupingComplete(value: readonly number[], units: number): boolean {
  return value.length > 0 && sumOf(value) === units && value.every((g) => g === 2 || g === 3);
}

export interface GroupingCell {
  /** 0-based unit of the bar. */
  unit: number;
  /** The group it belongs to, or null while the bar is not yet cut that far. */
  group: number | null;
  start: boolean;
  /** "1", "2", "3" within its group; the unit's own number before it is grouped. */
  count: string;
}

/** The bar as cells: which group each unit is in, and how it is counted (`1 2 | 1 2 | 1 2 3`). */
export function groupingCells(value: readonly number[], units: number): GroupingCell[] {
  const out: GroupingCell[] = [];
  let at = 0;
  value.forEach((g, gi) => {
    for (let k = 0; k < g && at < units; k++, at++)
      out.push({ unit: at, group: gi, start: k === 0, count: String(k + 1) });
  });
  for (; at < units; at++) out.push({ unit: at, group: null, start: false, count: "" });
  return out;
}

/** "2 + 2 + 3", spoken "two, two, three". */
export function groupingText(value: readonly number[]): string {
  return value.length === 0 ? "" : value.join(" + ");
}
export function groupingCount(value: readonly number[]): string {
  return value.map((g) => Array.from({ length: g }, (_, i) => String(i + 1)).join(" ")).join(" | ");
}

/**
 * How the bar is played back: one hit per unit, the group starts accented, at `bpm` counted in the meter's own
 * unit (an eighth in 7/8, a quarter in 5/4). Seconds from the start.
 */
export function groupingHits(
  value: readonly number[],
  units: number,
  bpm: number,
  bars = 2,
): { at: number; accent: boolean }[] {
  const unitSec = 60 / bpm;
  const starts = new Set<number>();
  let at = 0;
  for (const g of value) {
    starts.add(at);
    at += g;
  }
  const out: { at: number; accent: boolean }[] = [];
  for (let b = 0; b < bars; b++)
    for (let u = 0; u < units; u++) out.push({ at: (b * units + u) * unitSec, accent: starts.has(u) });
  return out;
}

/** Per-group marks against an answer (the gallery's stand-in host; the grader grades the real answer). */
export function groupingMarks(value: readonly number[], want: readonly number[]): PartMark[] {
  return value.map((g, i) => ({ part: i, ok: g === want[i] }));
}

// --- Euclid ---------------------------------------------------------------------------------------------------

export interface EuclidNumbers {
  k: number;
  n: number;
  r: number;
}

/** The numbers of a value, clamped to a rhythm (`k ≤ n`, `r < n`), or null before the learner set any. */
export function euclidOf(value: readonly number[]): EuclidNumbers | null {
  const [k, n, r = 0] = value;
  if (k === undefined || n === undefined) return null;
  return { k, n, r };
}

/** The value a widget emits: `[k, n]`, or `[k, n, r]` when the step asks for a rotation. */
export function euclidValue(e: EuclidNumbers, rotation: boolean): number[] {
  return rotation ? [e.k, e.n, e.r] : [e.k, e.n];
}

/** Keeps the numbers a rhythm: `1 ≤ k ≤ n`, `2 ≤ n ≤ maxSteps`, `0 ≤ r < n`. */
export function clampEuclid(e: EuclidNumbers, maxSteps: number): EuclidNumbers {
  const n = Math.max(2, Math.min(maxSteps, Math.round(e.n)));
  const k = Math.max(1, Math.min(n, Math.round(e.k)));
  const r = ((Math.round(e.r) % n) + n) % n;
  return { k, n, r };
}

/** The steps the numbers sound on, as Strudel's `bd(k,n,r)` plays them (theory `euclid`, checked against it). */
export function euclidCells(e: EuclidNumbers): boolean[] {
  return euclid(e.k, e.n, e.r);
}

/** The mini-notation the numbers write: `x(3,8)`, `x(5,8,1)`. */
export function euclidMini(e: EuclidNumbers, rotation: boolean, sound = "x"): string {
  return rotation && e.r !== 0 ? `${sound}(${e.k},${e.n},${e.r})` : `${sound}(${e.k},${e.n})`;
}

/** Two spellings of one rhythm are one answer (the grader grades by the onsets the numbers make). */
export function sameEuclid(a: readonly number[], b: readonly number[]): boolean {
  const x = euclidOf(a);
  const y = euclidOf(b);
  if (!x || !y || x.n !== y.n || x.k < 1 || y.k < 1 || x.k > x.n || y.k > y.n) return false;
  return onsetsOf(euclidCells(x)).join(",") === onsetsOf(euclidCells(y)).join(",");
}

/** A point on the ring (step `i` of `n`, clockwise from the top), in a 0–1 box. */
export function ringPoint(i: number, n: number, radius = 0.4): { x: number; y: number } {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2;
  return { x: 0.5 + radius * Math.cos(a), y: 0.5 + radius * Math.sin(a) };
}

/** The spoken ring: "3 hits in 8 steps, on steps 1, 4 and 7". */
export function euclidSpoken(e: EuclidNumbers): string {
  const on = onsetsOf(euclidCells(e)).map((i) => i + 1);
  const list = on.length <= 1 ? String(on[0] ?? "") : `${on.slice(0, -1).join(", ")} and ${on.at(-1)}`;
  return `${e.k} ${e.k === 1 ? "hit" : "hits"} in ${e.n} steps, on ${on.length === 1 ? "step" : "steps"} ${list}`;
}

// --- clave ----------------------------------------------------------------------------------------------------

export type ClaveId = "son 3-2" | "son 2-3" | "rumba 3-2" | "rumba 2-3";

/** "son 3-2" → its type and direction, or null for another id. */
export function claveParts(id: string): { type: "son" | "rumba"; direction: "3-2" | "2-3" } | null {
  const m = /^(son|rumba) (3-2|2-3)$/.exec(id);
  return m ? { type: m[1] as "son" | "rumba", direction: m[2] as "3-2" | "2-3" } : null;
}

/** The two bars of a clave on the eighth grid (16 cells), as theory `claveSteps` writes them. */
export function claveCells(id: string): boolean[] | null {
  const p = claveParts(id);
  if (!p) return null;
  const on = new Set(claveSteps(p.type, p.direction));
  return Array.from({ length: 16 }, (_, i) => on.has(i));
}

/** Whether every option of a choice is a clave (`CLAVE_OPTIONS` ids). */
export function isClaveChoice(options: readonly { id: string }[]): boolean {
  return options.length >= 2 && options.every((o) => claveParts(o.id) !== null);
}

// --- two lanes ------------------------------------------------------------------------------------------------

export interface LaneSetup {
  /** "Left hand: the 2". */
  label: string;
  /** The key the lane is tapped with, as the step names it (`f`, `j`); shown on the pad. */
  key?: string;
  /** Target onsets in bars from the take's start. */
  targets?: readonly number[];
}

/** Splits one take into its lanes by the voice each tap came on (F = lane 1, J = lane 2). */
export function splitLanes(taps: readonly number[], voices: readonly (0 | 1)[]): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  taps.forEach((t, i) => {
    (voices[i] === 1 ? b : a).push(t);
  });
  return [a, b];
}

export interface LanesReport {
  lanes: [TapReport, TapReport];
  feedback: AnswerFeedback;
  pass: boolean;
}

/**
 * Two lanes graded each on its own (feature `tap.lanes`: F1 and timing per lane, the step passes when both do),
 * through `tapReport`, the one tap rule. Marks are `lane:index` (`0:2` is lane 1's third target) and
 * `lane:extra:j`. The summary names each lane by its label, never what to tap.
 */
export function lanesReport(
  laneTaps: readonly [readonly number[], readonly number[]],
  laneTargets: readonly [readonly number[], readonly number[]],
  labels: readonly [string, string],
  profile: LearnerProfile,
  o: { tol?: TapTolerance; level?: number; levels?: number } = {},
): LanesReport {
  const reports = [0, 1].map((i) =>
    tapReport(laneTaps[i] as number[], laneTargets[i] as number[], profile, { ...o, word: "hit" }),
  ) as [TapReport, TapReport];
  const marks: PartMark[] = reports.flatMap((r, lane) =>
    r.feedback.state === "correct" || r.feedback.state === "wrong"
      ? (r.feedback.marks ?? []).map((m) => ({ ...m, part: `${lane}:${m.part}` }))
      : [],
  );
  const pass = reports.every((r) => r.result.pass);
  const line = (r: TapReport, label: string) => {
    const T = r.pairs.length + r.missed.length;
    const off = Math.round(r.result.offsetMs);
    return `${label}: ${r.pairs.length} of ${T}${r.extra.length ? `, ${r.extra.length} extra` : ""}${Math.abs(off) > 25 ? `, ${offsetWords(off)} on the whole` : ""}`;
  };
  const message = `${line(reports[0], labels[0])}. ${line(reports[1], labels[1])}.`;
  const feedback: AnswerFeedback = pass ? { state: "correct", marks } : { state: "wrong", marks, message };
  return { lanes: reports, feedback, pass };
}

// --- swing and lay-back ---------------------------------------------------------------------------------------

/** "0.33: 2:1, triplet swing" — the amount `swingBy` takes, and the long:short ratio it gives. */
export function swingWords(amount: number): { amount: string; ratio: string; feel: string } {
  const r = swingRatio(Math.max(0, Math.min(0.95, amount)));
  const ratio = Math.abs(r - Math.round(r)) < 0.02 ? `${Math.round(r)}:1` : `${r.toFixed(2)}:1`;
  const feel =
    amount < 0.04
      ? "straight"
      : amount < 0.27
        ? "light swing"
        : amount < 0.4
          ? "triplet swing"
          : "hard swing";
  return { amount: amount.toFixed(2).replace(/^0/, ""), ratio, feel };
}

export interface Hit {
  /** Seconds from the start. */
  at: number;
  s: string;
  gain: number;
}

/**
 * A two-bar groove that plays a swing amount (`swingBy(amount, 4)` in 4/4: the eighths of each quarter): the off-beat eighth of each beat sits at
 * `(1 + amount) / 2` of the beat (contracts §6.10 item 1), the hi-hat on every eighth, the kick on 1 and 3, the
 * snare on 2 and 4.
 */
export function swingHits(amount: number, bpm: number, bars = 2): Hit[] {
  const beat = 60 / bpm;
  const out: Hit[] = [];
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat;
    out.push({ at: t, s: "hh", gain: 0.5 });
    out.push({ at: t + ((1 + amount) / 2) * beat, s: "hh", gain: 0.35 });
    out.push({ at: t, s: b % 2 === 0 ? "bd" : "sd", gain: 0.8 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** "18 ms behind · .late(0.0068) at 90 BPM": a lay-back in milliseconds, with the code it takes at this tempo. */
export function laybackWords(ms: number, bpm: number): { ms: string; code: string; feel: string } {
  const cycles = lateCycles(ms, bpm);
  const code = ms === 0 ? "on the grid" : `.late(${cycles.toFixed(4).replace(/0+$/, "")}) at ${bpm} BPM`;
  const feel = ms < 8 ? "on the beat" : ms <= 45 ? "laid back" : "late enough to hear as a rhythm";
  return { ms: ms === 0 ? "0 ms" : `${Math.round(ms)} ms behind`, code, feel };
}

/**
 * A two-bar groove for "set the lay-back": kick and hi-hat on the grid, the snare on 2 and 4 late by `ms` (a
 * laid-back backbeat; contracts' `FEEL_MS`: 8–45 ms is a feel).
 */
export function laybackHits(ms: number, bpm: number, bars = 2): Hit[] {
  const beat = 60 / bpm;
  const out: Hit[] = [];
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat;
    out.push({ at: t, s: "hh", gain: 0.4 }, { at: t + beat / 2, s: "hh", gain: 0.3 });
    if (b % 2 === 0) out.push({ at: t, s: "bd", gain: 0.85 });
    else out.push({ at: t + ms / 1000, s: "sd", gain: 0.8 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The milliseconds a `.late(cycles)` delays by at a tempo, re-exported for hosts that show both. */
export { lateMs };
