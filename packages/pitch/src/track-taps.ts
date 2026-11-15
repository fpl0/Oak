// Wave 7 (the rhythm track, R1–R3, and the feel of AC2): what the advanced tracks ask a learner to tap, graded by
// the one rule for taps (`gradeTaps`, contracts §8.4: the auto window, the coarse offset, the monotone alignment,
// F1 and timing), unchanged, and read back as the music it is:
//
//   two hands at once (R2.L04, 3 against 2; 4 against 3)   `polyrhythmLanes`, `gradeLaneTaps`
//   a timeline: the clave, the tresillo, the cinquillo (R3)  `claveTargets`, `gradeClaveTaps`, `timelineTargets`,
//                                                             `gradeTimelineTaps`
//   the group starts of an odd meter (R2.L01–L02)           `groupingTargets`, `gradeGroupingTaps`
//   how far behind the click the taps sit (R1.L05, AC2.S2)  `measureLayBack`, `gradeLayBackTaps`
//   the swing ratio of tapped 8ths and 16ths (R1.L02)       `gradeSwingTaps` (swing-taps.ts) and `swingFeelOf`
//
// Every reading here is feedback data — which lane rushed against which and by how many milliseconds, which clave
// the taps made, which grouping they made, how many milliseconds behind the click — and none of it changes `pass`
// beyond the §8.4 rule, which for two lanes is applied to each lane (the step passes when both do). Tapping never
// gates anything (contracts §7.6, §8.5): a host never makes a rubric rule or an unlock depend on these results.
import type { Diagnostic, LearnerProfile, MeterId, TapTolerance } from "@oak/content-kit";
import { FEEL_MS, SWING_FEELS } from "@oak/content-kit";
import {
  CLAVE_TYPES,
  type ClaveDirection,
  type ClaveType,
  claveSteps,
  DECLARABLE_GROUPINGS,
  euclidIdentity,
  METERS,
  polyrhythm,
} from "@oak/theory";
import { mad, mean, median } from "./math.ts";
import { tapSwingClass } from "./swing-taps.ts";
import { gradeTaps } from "./taps.ts";
import type { TapResult } from "./types.ts";

const EPS = 1e-9;
type Opts = { level?: number; levels?: number };
const num = (r: readonly [number, number]): number => r[0] / r[1];
const barSecOf = (bpm: number, meter: MeterId = "4/4"): number => (60 / bpm) * METERS[meter].unitsPerBar;
const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);
/** Where the grade forgives a constant offset (contracts §8.4: levels 1–2, locked tempo). */
const forgives = (tol: TapTolerance, o: Opts): boolean =>
  tol.forgiveOffset && (o.level ?? 1) <= 2 && tol.tempo !== "free";

/** Signed errors (ms, positive late) of the matched taps of a grade, keyed by target index. */
function matchedErrors(
  r: TapResult,
  targets: readonly number[],
  taps: readonly number[],
): Map<number, number> {
  const T = sorted(targets);
  const A = sorted(taps);
  const out = new Map<number, number>();
  for (const [i, j] of r.pairs) out.set(i, ((A[j] as number) - (T[i] as number)) * 1000);
  return out;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** "three", "two": a pulse as the course says it ("three against two"). */
export function pulseWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

// --- two lanes at once (R2.L04) --------------------------------------------------------------------------------

export interface PolyrhythmGrid {
  /** AudioContext time of the first cycle's downbeat; taps are on the same clock (tap latency removed). */
  downbeat: number;
  /** Beats per minute in the meter's tempo unit (contracts §6.9). */
  bpm: number;
  /** Default "4/4". */
  meter?: MeterId;
  /** The two pulses of one cycle: `a` against `b` (R2.L04 taps 3 against 2). */
  a: number;
  b: number;
  /** Bars one cycle spans (default 1: the 2 are half notes and the 3 half-note triplets in 4/4). */
  spanBars?: number;
  /** Cycles to tap. */
  cycles: number;
  /** Adds the downbeat after the last cycle to both lanes (a take that ends on "one"). */
  closing?: boolean;
}

/** The two lanes of a polyrhythm in seconds, each in time order, and the times both share. */
export function polyrhythmLanes(grid: PolyrhythmGrid): { a: number[]; b: number[]; together: number[] } {
  const p = polyrhythm(grid.a, grid.b);
  const cycleSec = barSecOf(grid.bpm, grid.meter) * (grid.spanBars ?? 1);
  const lane = (pos: readonly (readonly [number, number])[]) => {
    const out: number[] = [];
    for (let c = 0; c < grid.cycles; c++)
      for (const x of pos) out.push(grid.downbeat + (c + num(x)) * cycleSec);
    if (grid.closing) out.push(grid.downbeat + grid.cycles * cycleSec);
    return out;
  };
  const together: number[] = [];
  for (let c = 0; c < grid.cycles; c++)
    for (const x of p.together) together.push(grid.downbeat + (c + num(x)) * cycleSec);
  if (grid.closing) together.push(grid.downbeat + grid.cycles * cycleSec);
  return { a: lane(p.a), b: lane(p.b), together };
}

/** One lane of a two-lane take. */
export interface LaneSpec {
  /** What the lane taps as the learner reads it: "Right hand: the three". */
  label: string;
  /** The pulse in a sentence ("three", "two"); default: the words after "the " in the label, else the label. */
  name?: string;
  /** The key the lane listens to, as shown ("F", "J"). Default F for the first lane and J for the second. */
  key?: string;
  /** Target times, seconds, on the taps' clock. */
  targets: readonly number[];
}

export interface LaneReport extends TapResult {
  label: string;
  name: string;
  key: string;
  /**
   * How far this lane sits from the beats both hands share, ms (positive: late): the median error of its taps on
   * its own places, minus the median error of both hands on the shared places. `null` with fewer than two such taps.
   */
  leanMs: number | null;
  /** Median error (ms) of each position of the lane inside its cycle, when the cycle is known; `null` where unmatched. */
  byPosition: (number | null)[];
}

export interface LaneTapResult extends TapResult {
  lanes: LaneReport[];
  /** Every tap of both lanes against every target of both: the rhythm the two hands make together. */
  composite: TapResult;
  /** The two lanes tapped each other's pulse (the keys swapped). */
  swapped: boolean;
  /** On the places both lanes share: how many were tapped by both hands, and how far apart they landed (median, ms). */
  together: { n: number; flamMs: number | null };
}

const nameOf = (s: LaneSpec): string =>
  s.name ?? /\bthe\s+(.+)$/i.exec(s.label)?.[1] ?? s.label.toLowerCase();
const DEFAULT_KEYS = ["F", "J"] as const;
/** A lean (ms) is reported when it is more than this, or a quarter of the window when that is more. */
export const LANE_LEAN_REPORT_MS = 20;
/** A flam on the shared places is reported above this, or 0.4 of the window. */
export const LANE_FLAM_REPORT_MS = 25;

/**
 * Grades a two-lane take (contracts §8.4, `TapEx.lanes`): each lane by the one rule for taps, against its own
 * targets, and the step passes when both lanes pass. A constant offset common to both hands (the shared places, else
 * the whole take) is forgiven at levels 1–2 as §8.4 says; what is left of a lane's offset is that lane leaning
 * against the other, which is never forgiven and is said (`tap.lane-rushing` / `tap.lane-dragging`: "your three is
 * rushing against the two"). Also named: a lane with no taps (`tap.lane-silent`), the two keys tapping each other's
 * pulse (`tap.lanes-swapped`), and the hands landing apart on the places they share (`tap.lanes-flam`, info).
 *
 * `cycleSec` (optional) is the length of one cycle of the polyrhythm: each lane's errors are then also read per
 * position inside the cycle (`byPosition`: "the third note of your three comes 60 ms early").
 */
export function gradeLaneTaps(
  taps: readonly (readonly number[])[],
  lanes: readonly LaneSpec[],
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: Opts & { cycleSec?: number; downbeat?: number } = {},
): LaneTapResult {
  if (lanes.length !== 2) throw new RangeError("@oak/pitch: gradeLaneTaps takes exactly two lanes");
  const laneTaps = lanes.map((_, k) => sorted(taps[k] ?? []));
  const laneTargets = lanes.map((l) => sorted(l.targets));
  const allTaps = sorted(laneTaps.flat());
  const allTargets = sorted(laneTargets.flat());
  const composite = gradeTaps(allTaps, allTargets, tol, profile, opts);

  // The shared places and the offset common to both hands, read without forgiving anything. The lanes are paired
  // after the composite's coarse offset is taken out (as `gradeTaps` itself aligns), so a calibration that is off
  // by more than the window still pairs every tap; the errors are then put back on the clock as played.
  const strict: TapTolerance = { ...tol, forgiveOffset: false };
  const coarseSec = composite.offsetMs / 1000;
  const rawErr = laneTargets.map((T, k) => {
    const moved = (laneTaps[k] as number[]).map((t) => t - coarseSec);
    const r = gradeTaps(moved, T, strict, profile, opts);
    const errs = matchedErrors(r, T, moved);
    for (const [i, e] of errs) errs.set(i, e + composite.offsetMs);
    return errs;
  });
  const sharedOf = (k: number): Set<number> => {
    const other = laneTargets[1 - k] as number[];
    const s = new Set<number>();
    (laneTargets[k] as number[]).forEach((t, i) => {
      if (other.some((o) => Math.abs(o - t) < 1e-6)) s.add(i);
    });
    return s;
  };
  const shared = [sharedOf(0), sharedOf(1)];
  const sharedErrs = [0, 1].flatMap((k) =>
    [...(rawErr[k] as Map<number, number>)].filter(([i]) => shared[k]?.has(i)).map(([, e]) => e),
  );
  const allErrs = [0, 1].flatMap((k) => [...(rawErr[k] as Map<number, number>).values()]);
  const commonMs = sharedErrs.length >= 2 ? median(sharedErrs) : allErrs.length > 0 ? median(allErrs) : 0;
  const shiftSec = forgives(tol, opts) ? commonMs / 1000 : 0;

  // Each lane graded with the common offset taken out (when forgiven) and nothing else forgiven.
  const graded = laneTargets.map((T, k) =>
    gradeTaps(
      (laneTaps[k] as number[]).map((t) => t - shiftSec),
      T,
      strict,
      profile,
      opts,
    ),
  );

  const reports: LaneReport[] = graded.map((r, k) => {
    const spec = lanes[k] as LaneSpec;
    const errs = rawErr[k] as Map<number, number>;
    const own = [...errs].filter(([i]) => !shared[k]?.has(i)).map(([, e]) => e);
    const leanMs = own.length >= 2 ? median(own) - commonMs : null;
    const byPosition: (number | null)[] = [];
    if (opts.cycleSec && opts.cycleSec > 0) {
      const T = laneTargets[k] as number[];
      const origin = opts.downbeat ?? T[0] ?? 0;
      const posOf = (t: number) => {
        const c = (t - origin) / (opts.cycleSec as number);
        return Math.round((c - Math.floor(c + 1e-6)) * 1e6) / 1e6;
      };
      const positions = [...new Set(T.map(posOf))].sort((a, b) => a - b);
      for (const p of positions) {
        const at = [...errs].filter(([i]) => Math.abs(posOf(T[i] as number) - p) < 1e-4).map(([, e]) => e);
        byPosition.push(at.length > 0 ? median(at) - commonMs : null);
      }
    }
    // The lane's own offset line is replaced by the common one and the lean below.
    const diagnostics = r.diagnostics
      .filter((d) => d.id !== "tap.offset")
      .map((d) => ({ ...d, params: { ...d.params, lane: nameOf(spec) } }));
    return {
      ...r,
      diagnostics,
      label: spec.label,
      name: nameOf(spec),
      key: spec.key ?? (DEFAULT_KEYS[k] as string),
      leanMs,
      byPosition,
    };
  });

  const diagnostics: Diagnostic[] = [];
  const [ra, rb] = reports as [LaneReport, LaneReport];
  if (Math.abs(commonMs) > 25 && allErrs.length > 0) {
    diagnostics.push({
      id: "tap.offset",
      severity: forgives(tol, opts) ? "info" : "warn",
      dim: "timing",
      params: { ms: Math.round(Math.abs(commonMs)), dir: commonMs > 0 ? "late" : "early" },
    });
  }
  // A lane with no taps at all.
  for (const [k, r] of reports.entries()) {
    if ((laneTaps[k] as number[]).length === 0 && (laneTargets[k] as number[]).length > 0) {
      const other = reports[1 - k] as LaneReport;
      diagnostics.push({
        id: "tap.lane-silent",
        severity: "error",
        dim: "rhythm",
        params: { lane: r.name, key: r.key, other: other.name },
      });
    }
  }
  // The keys swapped: each lane's taps fit the other lane's targets clearly better than its own.
  let swapped = false;
  if (laneTaps.every((t) => t.length > 0)) {
    const cross = [0, 1].map((k) =>
      gradeTaps(laneTaps[k] as number[], laneTargets[1 - k] as number[], tol, profile, opts),
    );
    const straightF1 = (ra.f1 + rb.f1) / 2;
    const crossF1 = ((cross[0] as TapResult).f1 + (cross[1] as TapResult).f1) / 2;
    if (crossF1 >= 0.8 && crossF1 - straightF1 >= 0.2) {
      swapped = true;
      diagnostics.push({
        id: "tap.lanes-swapped",
        severity: "error",
        dim: "rhythm",
        params: { keyA: ra.key, keyB: rb.key, laneA: ra.name, laneB: rb.name },
      });
    }
  }
  // Leaning lanes: say the one that leans more; both when they lean apart in opposite directions.
  if (!swapped) {
    const w = Math.min(ra.windowMs, rb.windowMs);
    const limit = Math.max(LANE_LEAN_REPORT_MS, 0.25 * w);
    const leaning = reports
      .map((r, k) => ({ r, k }))
      .filter(({ r }) => r.leanMs !== null && Math.abs(r.leanMs) > limit)
      .sort((x, y) => Math.abs(y.r.leanMs as number) - Math.abs(x.r.leanMs as number));
    for (const { r, k } of leaning) {
      const lean = r.leanMs as number;
      const other = reports[1 - k] as LaneReport;
      // The worst position of the lane, 1-based, when positions are known.
      let worst = -1;
      let worstMs = 0;
      r.byPosition.forEach((e, i) => {
        if (e !== null && i > 0 && Math.sign(e) === Math.sign(lean) && Math.abs(e) > Math.abs(worstMs)) {
          worst = i;
          worstMs = e;
        }
      });
      diagnostics.push({
        id: lean < 0 ? "tap.lane-rushing" : "tap.lane-dragging",
        severity: "warn",
        dim: "timing",
        params: {
          lane: r.name,
          other: other.name,
          ms: Math.round(Math.abs(lean)),
          dir: lean < 0 ? "early" : "late",
          ...(worst > 0 ? { note: ordinal(worst + 1), noteMs: Math.round(Math.abs(worstMs)) } : {}),
        },
      });
    }
  }
  // The places both hands share: how far apart the two taps land.
  const flams: number[] = [];
  (laneTargets[0] as number[]).forEach((t, i) => {
    if (!shared[0]?.has(i)) return;
    const j = (laneTargets[1] as number[]).findIndex((o) => Math.abs(o - t) < 1e-6);
    const a = rawErr[0]?.get(i);
    const b = rawErr[1]?.get(j);
    if (a !== undefined && b !== undefined) flams.push(Math.abs(a - b));
  });
  const flamMs = flams.length > 0 ? median(flams) : null;
  if (flamMs !== null && flams.length >= 2) {
    const w = Math.min(ra.windowMs, rb.windowMs);
    if (flamMs > Math.max(LANE_FLAM_REPORT_MS, 0.4 * w))
      diagnostics.push({
        id: "tap.lanes-flam",
        severity: "info",
        dim: "timing",
        params: { ms: Math.round(flamMs), n: flams.length },
      });
  }
  for (const r of reports) diagnostics.push(...r.diagnostics);

  const f1 = Math.min(ra.f1, rb.f1);
  const timing = Math.min(ra.timing, rb.timing);
  const meanF1 = mean([ra.f1, rb.f1]);
  const meanTiming = mean([ra.timing, rb.timing]);
  return {
    score: 0.7 * meanF1 + 0.3 * meanTiming,
    pass: ra.pass && rb.pass,
    dims: {
      rhythm: { score: meanF1, weight: 0.7, n: allTargets.length },
      timing: { score: meanTiming, weight: 0.3, n: ra.pairs.length + rb.pairs.length },
    },
    diagnostics,
    pairs: composite.pairs,
    missed: composite.missed,
    extra: composite.extra,
    f1,
    timing,
    offsetMs: commonMs,
    windowMs: Math.min(ra.windowMs, rb.windowMs),
    lanes: reports,
    composite,
    swapped,
    together: { n: flams.length, flamMs },
  };
}

function ordinal(n: number): string {
  return ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][n] ?? `${n}th`;
}

// --- timelines: clave, tresillo, cinquillo (R3) ----------------------------------------------------------------

export interface TimelineGrid {
  downbeat: number;
  /** Beats per minute in the meter's tempo unit. */
  bpm: number;
  /** Default "4/4". */
  meter?: MeterId;
  /** Onset steps of one cycle, on a grid of `stepsPerBar` steps a bar (the tresillo: [0, 3, 6] of 8). */
  steps: readonly number[];
  stepsPerBar: number;
  /** Bars one cycle spans (the clave: 2). Default 1. */
  barsPerCycle?: number;
  cycles: number;
  /** Adds the first onset of the next cycle (a take that ends on "one"). */
  closing?: boolean;
}

/** The target taps of a timeline, seconds, in time order. */
export function timelineTargets(grid: TimelineGrid): number[] {
  const stepSec = barSecOf(grid.bpm, grid.meter) / grid.stepsPerBar;
  const cycleSteps = grid.stepsPerBar * (grid.barsPerCycle ?? 1);
  const out: number[] = [];
  for (let c = 0; c < grid.cycles; c++)
    for (const s of grid.steps) out.push(grid.downbeat + (c * cycleSteps + s) * stepSec);
  if (grid.closing) out.push(grid.downbeat + (grid.cycles * cycleSteps + (grid.steps[0] ?? 0)) * stepSec);
  return sorted(out);
}

/** A cycle on its step grid: "x · · x · · x ·" (x a tap, · a rest). */
export function gridText(steps: readonly number[], size: number): string {
  const on = new Set(steps);
  return Array.from({ length: size }, (_, i) => (on.has(i) ? "x" : "·")).join(" ");
}

/** What the taps made in each cycle: each tap moved to the nearest step (within half a step), duplicates merged. */
export function heardSteps(taps: readonly number[], grid: TimelineGrid): number[][] {
  const stepSec = barSecOf(grid.bpm, grid.meter) / grid.stepsPerBar;
  const cycleSteps = grid.stepsPerBar * (grid.barsPerCycle ?? 1);
  const out: number[][] = Array.from({ length: grid.cycles }, () => []);
  for (const t of taps) {
    const k = Math.round((t - grid.downbeat) / stepSec);
    if (Math.abs((t - grid.downbeat) / stepSec - k) > 0.5 + EPS) continue;
    const c = Math.floor(k / cycleSteps);
    if (c < 0 || c >= grid.cycles) continue;
    const s = k - c * cycleSteps;
    const cell = out[c] as number[];
    if (!cell.includes(s)) cell.push(s);
  }
  return out.map((c) => c.sort((a, b) => a - b));
}

export interface TimelineCycle {
  /** 1-based number of the cycle's first bar. */
  bar: number;
  steps: number[];
  text: string;
  /** The (k, n, r) the cycle's taps make, when they make one (`euclidIdentity`). */
  euclid: { pulses: number; steps: number; rotation: number } | null;
  right: boolean;
}
export interface TimelineTapResult extends TapResult {
  /** The cycle asked for, on its grid. */
  pattern: string;
  cycles: TimelineCycle[];
}

/**
 * Grades a tapped timeline (R3.L01: the tresillo `x · · x · · x ·` and the cinquillo; RC2) with `gradeTaps`
 * (§8.4, unchanged) and reads back what each cycle's taps made on the step grid. A cycle that came out as another
 * pattern is said with both drawn on the grid (`tap.timeline`, warn, for the first such cycle; params `bar`, `got`,
 * `exp`, `n`), which never changes `pass`.
 */
export function gradeTimelineTaps(
  taps: readonly number[],
  grid: TimelineGrid,
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: Opts = {},
): TimelineTapResult {
  const targets = timelineTargets(grid);
  const base = gradeTaps(taps, targets, tol, profile, opts);
  const shift = forgives(tol, opts) ? base.offsetMs / 1000 : 0;
  const size = grid.stepsPerBar * (grid.barsPerCycle ?? 1);
  const want = sorted([...new Set(grid.steps)]);
  const pattern = gridText(want, size);
  const heard = heardSteps(
    taps.map((t) => t - shift),
    grid,
  );
  const cycles: TimelineCycle[] = heard.map((steps, c) => ({
    bar: c * (grid.barsPerCycle ?? 1) + 1,
    steps,
    text: gridText(steps, size),
    euclid: steps.length > 0 ? euclidIdentity(steps, size) : null,
    right: steps.length === want.length && steps.every((s, i) => s === want[i]),
  }));
  const diagnostics: Diagnostic[] = [...base.diagnostics];
  const off = cycles.filter((c) => !c.right && c.steps.length > 0);
  if (off.length > 0) {
    const first = off[0] as TimelineCycle;
    diagnostics.unshift({
      id: "tap.timeline",
      severity: "warn",
      dim: "rhythm",
      where: { bar: first.bar },
      params: { bar: first.bar, got: first.text, exp: pattern, n: off.length },
    });
  }
  return { ...base, diagnostics, pattern, cycles };
}

export interface ClaveGrid {
  downbeat: number;
  /** Quarter notes per minute (the clave sits on two bars of 4/4, sixteen eighths). */
  bpm: number;
  type: ClaveType;
  direction: ClaveDirection;
  /** Bars to tap: an even number (one clave is two bars). */
  bars: number;
  closing?: boolean;
}

const claveTimeline = (g: Omit<ClaveGrid, "type" | "direction">, type: ClaveType, dir: ClaveDirection) => ({
  downbeat: g.downbeat,
  bpm: g.bpm,
  meter: "4/4" as const,
  steps: claveSteps(type, dir),
  stepsPerBar: 8,
  barsPerCycle: 2,
  cycles: Math.max(1, Math.floor(g.bars / 2)),
  ...(g.closing ? { closing: true } : {}),
});

/** The target taps of a clave (`claveSteps` of @oak/theory on the 16-eighth grid of two 4/4 bars), seconds. */
export function claveTargets(grid: ClaveGrid): number[] {
  return timelineTargets(claveTimeline(grid, grid.type, grid.direction));
}

export interface ClaveTapResult extends TimelineTapResult {
  clave: {
    asked: { type: ClaveType; direction: ClaveDirection };
    /** The clave the taps fit best when it is not the one asked and the fit is clear; else `null`. */
    heard: { type: ClaveType; direction: ClaveDirection } | null;
    /** F1 of the take against each of the four claves. */
    fits: { type: ClaveType; direction: ClaveDirection; f1: number }[];
  };
}

/**
 * Grades a tapped clave (R3.L02; RC2) as a timeline (`gradeTimelineTaps`) and says which clave the taps made when
 * it is another one: tapped from the other side (`tap.clave-direction`: 2-3 where 3-2 was asked) or the other
 * clave (`tap.clave-type`: rumba, whose three side ends on the "and" of 4, where son was asked, ending on beat 4).
 * A clave is named only when its F1 is at least 0.9 and 0.15 more than the asked one's. Never changes `pass`.
 */
export function gradeClaveTaps(
  taps: readonly number[],
  grid: ClaveGrid,
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: Opts = {},
): ClaveTapResult {
  const base = gradeTimelineTaps(taps, claveTimeline(grid, grid.type, grid.direction), tol, profile, opts);
  const fits = CLAVE_TYPES.flatMap((type) =>
    (["3-2", "2-3"] as const).map((direction) => ({
      type,
      direction,
      f1: gradeTaps(taps, timelineTargets(claveTimeline(grid, type, direction)), tol, profile, opts).f1,
    })),
  );
  const asked = fits.find((f) => f.type === grid.type && f.direction === grid.direction)?.f1 ?? 0;
  const best = [...fits].sort((a, b) => b.f1 - a.f1)[0];
  let heard: { type: ClaveType; direction: ClaveDirection } | null = null;
  const diagnostics = [...base.diagnostics];
  if (best && best.f1 >= 0.9 - EPS && best.f1 - asked >= 0.15 - EPS) {
    heard = { type: best.type, direction: best.direction };
    const named: Diagnostic[] = [];
    if (best.direction !== grid.direction)
      named.push({
        id: "tap.clave-direction",
        severity: "warn",
        dim: "rhythm",
        params: {
          got: best.direction,
          exp: grid.direction,
          gotFirst: best.direction === "3-2" ? "three" : "two",
          expFirst: grid.direction === "3-2" ? "three" : "two",
        },
      });
    if (best.type !== grid.type)
      named.push({
        id: "tap.clave-type",
        severity: "warn",
        dim: "rhythm",
        params: {
          got: best.type,
          exp: grid.type,
          gotWhere: best.type === "son" ? "on beat 4" : "on the “and” of 4",
          expWhere: grid.type === "son" ? "on beat 4" : "on the “and” of 4",
        },
      });
    // The named clave says it better than a drawn grid: it replaces the timeline line.
    const at = diagnostics.findIndex((d) => d.id === "tap.timeline");
    if (at >= 0) diagnostics.splice(at, 1);
    diagnostics.unshift(...named);
  }
  return {
    ...base,
    diagnostics,
    clave: { asked: { type: grid.type, direction: grid.direction }, heard, fits },
  };
}

// --- odd-meter groupings (R2.L01–L02) --------------------------------------------------------------------------

export interface GroupingGrid {
  downbeat: number;
  /** Beats per minute in the meter's tempo unit: eighths in 5/8, 7/8 and 9/8i, quarters in 5/4. */
  bpm: number;
  meter: MeterId;
  /** The grouping asked (one of `DECLARABLE_GROUPINGS[meter]`); default the meter's own. */
  groups?: readonly number[];
  bars: number;
  closing?: boolean;
}

const groupsOf = (g: Pick<GroupingGrid, "meter" | "groups">): number[] => [
  ...(g.groups ?? METERS[g.meter].grouping),
];

/** The group starts of every bar, seconds: 7/8 as 2+2+3 is three taps a bar, on eighths 0, 2 and 4. */
export function groupingTargets(grid: GroupingGrid): number[] {
  const unit = 60 / grid.bpm;
  const per = METERS[grid.meter].unitsPerBar;
  const groups = groupsOf(grid);
  if (groups.reduce((a, b) => a + b, 0) !== per)
    throw new RangeError(`@oak/pitch: ${groups.join("+")} does not fill a bar of ${grid.meter}`);
  const starts: number[] = [];
  let at = 0;
  for (const g of groups) {
    starts.push(at);
    at += g;
  }
  const out: number[] = [];
  for (let b = 0; b < grid.bars; b++) for (const s of starts) out.push(grid.downbeat + (b * per + s) * unit);
  if (grid.closing) out.push(grid.downbeat + grid.bars * per * unit);
  return out;
}

/** "2+2+3". */
export const groupingText = (groups: readonly number[]): string => groups.join("+");
/** "short, short, long": a 2 is short and a 3 is long (the count R2 teaches). */
export function groupingWords(groups: readonly number[]): string {
  return groups
    .map((g) => (g === 2 ? "short" : g === 3 ? "long" : g === 1 ? "very short" : "longer"))
    .join(", ");
}

export interface GroupingTapResult extends TapResult {
  groups: number[];
  /** The grouping each bar's taps made (`null`: the bar has no tap on its downbeat, or none at all). */
  perBar: (number[] | null)[];
  /** The grouping most bars made, when at least half the bars agree on one; else `null`. */
  heard: number[] | null;
}

/**
 * Grades the group starts of an odd meter tapped against the click (R2.L01: 5/4 as 3+2; R2.L02: 7/8 as 2+2+3 and
 * 9/8i as 2+2+2+3) with `gradeTaps` (§8.4, unchanged), and reads the grouping the taps made in each bar. When most
 * bars made another grouping, it is named: the same groups in another order (`tap.grouping-order`: "you tapped 3+2+2,
 * long, short, short; this bar goes 2+2+3") or even taps that ignore the long group (`tap.grouping-even`). Never
 * changes `pass`.
 */
export function gradeGroupingTaps(
  taps: readonly number[],
  grid: GroupingGrid,
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: Opts = {},
): GroupingTapResult {
  const groups = groupsOf(grid);
  const targets = groupingTargets(grid);
  const base = gradeTaps(taps, targets, tol, profile, opts);
  const shift = forgives(tol, opts) ? base.offsetMs / 1000 : 0;
  const per = METERS[grid.meter].unitsPerBar;
  const unit = 60 / grid.bpm;
  const perBar: (number[] | null)[] = [];
  for (let b = 0; b < grid.bars; b++) {
    const units = new Set<number>();
    for (const t of taps) {
      const u = (t - shift - grid.downbeat) / unit - b * per;
      const k = Math.round(u);
      if (Math.abs(u - k) > 0.5 || k < 0 || k >= per) continue;
      units.add(k);
    }
    const on = [...units].sort((x, y) => x - y);
    if (on[0] !== 0) {
      perBar.push(null);
      continue;
    }
    perBar.push(on.map((u, i) => (on[i + 1] ?? per) - u));
  }
  const counts = new Map<string, number>();
  for (const g of perBar) if (g) counts.set(g.join("+"), (counts.get(g.join("+")) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const heard = top && top[1] >= Math.ceil(grid.bars / 2) ? top[0].split("+").map(Number) : null;
  const diagnostics = [...base.diagnostics];
  const same = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (heard && !same(heard, groups)) {
    const meter = grid.meter;
    const evenStep = heard[0] as number;
    const even =
      heard.length >= 2 && heard.slice(0, -1).every((g) => g === evenStep) && heard.length !== groups.length;
    const legal = (DECLARABLE_GROUPINGS[meter] ?? [METERS[meter].grouping]).some((g) => same(g, heard));
    const unitWord = METERS[meter].tempoUnit === "eighth" ? "eighth" : "beat";
    if (even || heard.every((g) => g === 1))
      diagnostics.unshift({
        id: "tap.grouping-even",
        severity: "warn",
        dim: "rhythm",
        params: {
          every: evenStep === 1 ? `every ${unitWord}` : `every ${pulseWord(evenStep)} ${unitWord}s`,
          meter,
          exp: groupingText(groups),
          expWords: groupingWords(groups),
        },
      });
    else if (legal || sorted(heard).join() === sorted(groups).join())
      diagnostics.unshift({
        id: "tap.grouping-order",
        severity: "warn",
        dim: "rhythm",
        params: {
          got: groupingText(heard),
          gotWords: groupingWords(heard),
          exp: groupingText(groups),
          expWords: groupingWords(groups),
          meter,
        },
      });
  }
  return { ...base, diagnostics, groups, perBar, heard };
}

// --- laid back: milliseconds behind the click (R1.L05, AC2.S2) -------------------------------------------------

/** How a take sits against the beats: inside `FEEL_MS` it is a feel; beyond it, a displacement heard as rhythm. */
export type LayBackVerdict = "on" | "behind" | "ahead" | "late" | "early";
export interface LayBackReading {
  /** Taps paired with a beat (each beat with its nearest tap within half the shortest gap, at most 150 ms). */
  n: number;
  /** Median of tap − beat, ms (positive: behind). `NaN` when nothing was paired. */
  medianMs: number;
  /** The taps' own spread: the median absolute deviation, ms. */
  spreadMs: number;
  /**
   * About 95 % of the time the true lean lies within `medianMs ± plusMinusMs`: twice the standard error of the
   * median, with the tap-latency calibration's own uncertainty (16 clicks, `profile.tapJitterMs`) added in.
   */
  plusMinusMs: number;
  verdict: LayBackVerdict;
  /** `medianMs ± plusMinusMs` lies wholly inside the verdict's band: the reading can be stated without "about". */
  sure: boolean;
  /** The feel window, ms (`FEEL_MS`). */
  feelMs: readonly [number, number];
}

const MEDIAN_SE = 1.2533;
const MAD_SIGMA = 1.4826;
const CALIBRATION_CLICKS = 16;

/** The band a lean of `ms` falls in. */
export function layBackVerdict(ms: number): LayBackVerdict {
  const [lo, hi] = FEEL_MS;
  const a = Math.abs(ms);
  if (a < lo) return "on";
  if (a <= hi) return ms > 0 ? "behind" : "ahead";
  return ms > 0 ? "late" : "early";
}
const bandOf = (v: LayBackVerdict): [number, number] => {
  const [lo, hi] = FEEL_MS;
  switch (v) {
    case "on":
      return [-lo, lo];
    case "behind":
      return [lo, hi];
    case "ahead":
      return [-hi, -lo];
    case "late":
      return [hi, Number.POSITIVE_INFINITY];
    case "early":
      return [Number.NEGATIVE_INFINITY, -hi];
  }
};

/**
 * How far behind (or ahead of) the beats a take sits, in milliseconds: the median of tap − beat over the paired
 * taps, with its spread and an honest ± (contracts §8.4 measures taps against AudioContext time with the
 * calibrated latency removed; a lean of 20 ms is close to what a hand and a calibration can resolve, so the ± says
 * how sure the number is). `beats` are the reference onsets: the click, or the line the take leans against.
 */
export function measureLayBack(
  taps: readonly number[],
  beats: readonly number[],
  profile?: Pick<LearnerProfile, "tapJitterMs">,
): LayBackReading {
  const B = sorted(beats);
  const A = sorted(taps);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < B.length; i++) gap = Math.min(gap, (B[i] as number) - (B[i - 1] as number));
  const reach = Math.min(0.15, Number.isFinite(gap) ? gap / 2 : 0.15);
  const errs: number[] = [];
  for (const b of B) {
    let best: number | null = null;
    for (const a of A)
      if (Math.abs(a - b) <= reach && (best === null || Math.abs(a - b) < Math.abs(best - b))) best = a;
    if (best !== null) errs.push((best - b) * 1000);
  }
  if (errs.length === 0)
    return {
      n: 0,
      medianMs: Number.NaN,
      spreadMs: Number.NaN,
      plusMinusMs: Number.NaN,
      verdict: "on",
      sure: false,
      feelMs: FEEL_MS,
    };
  const m = median(errs);
  const spread = mad(errs);
  const se = (MEDIAN_SE * MAD_SIGMA * spread) / Math.sqrt(errs.length);
  const jitter = profile && Number.isFinite(profile.tapJitterMs) ? Math.max(0, profile.tapJitterMs) : 0;
  const seCal = (MEDIAN_SE * MAD_SIGMA * jitter) / Math.sqrt(CALIBRATION_CLICKS);
  const plusMinus = 2 * Math.sqrt(se * se + seCal * seCal);
  const verdict = layBackVerdict(m);
  const [lo, hi] = bandOf(verdict);
  return {
    n: errs.length,
    medianMs: m,
    spreadMs: spread,
    plusMinusMs: plusMinus,
    verdict,
    sure: errs.length >= 4 && m - plusMinus >= lo - EPS && m + plusMinus <= hi + EPS,
    feelMs: FEEL_MS,
  };
}

/** What a lay-back step asks for: behind (or ahead of) the beat by a feel, `FEEL_MS` by default. */
export interface LayBackWant {
  direction: "late" | "early";
  minMs?: number;
  maxMs?: number;
}
export interface LayBackTapResult extends TapResult {
  layBack: LayBackReading & { want: LayBackWant | null; feelOk: boolean | null };
}

const VERDICT_WORDS: Record<LayBackVerdict, string> = {
  on: "on the beat",
  behind: "laid back, a feel",
  ahead: "pushing ahead, a feel",
  late: "late enough to hear as a rhythm, not a feel",
  early: "early enough to hear as a rhythm, not a feel",
};
/** The course's words for where a take sits. */
export function layBackWords(v: LayBackVerdict): string {
  return VERDICT_WORDS[v];
}

/**
 * Grades a take tapped with the click by the one rule for taps (`gradeTaps`, §8.4, unchanged: a lean of a few
 * milliseconds sits well inside the window) and measures where it sits (`measureLayBack` on the taps as played,
 * nothing forgiven). The reading is always said (`tap.lay-back`): info when it is what `want` asks (or no `want`),
 * a warning when it is not. `feelOk` is `null` without a `want`. Never changes `pass`.
 */
export function gradeLayBackTaps(
  taps: readonly number[],
  beats: readonly number[],
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: Opts & { want?: LayBackWant } = {},
): LayBackTapResult {
  const base = gradeTaps(taps, beats, tol, profile, opts);
  const reading = measureLayBack(taps, beats, profile);
  const want = opts.want ?? null;
  let feelOk: boolean | null = null;
  if (want && reading.n > 0) {
    const lo = want.minMs ?? FEEL_MS[0];
    const hi = want.maxMs ?? FEEL_MS[1];
    const signed = want.direction === "late" ? reading.medianMs : -reading.medianMs;
    feelOk = signed >= lo - EPS && signed <= hi + EPS;
  } else if (want) feelOk = false;
  // The offset line says the same number as the lay-back line: keep one.
  const diagnostics = base.diagnostics.filter((d) => d.id !== "tap.offset");
  if (reading.n > 0) {
    diagnostics.unshift({
      id: "tap.lay-back",
      severity: feelOk === false ? "warn" : "info",
      dim: "timing",
      params: {
        ms: Math.round(Math.abs(reading.medianMs)),
        dir: reading.medianMs >= 0 ? "behind" : "ahead of",
        pm: Math.max(1, Math.round(reading.plusMinusMs)),
        about: reading.sure ? "" : "about ",
        word: VERDICT_WORDS[reading.verdict],
      },
    });
  }
  return { ...base, diagnostics, layBack: { ...reading, want, feelOk } };
}

// --- swing ratios (R1.L02) -------------------------------------------------------------------------------------

/**
 * The feel of `SWING_FEELS` (content-kit; R1.L02's four feels) a measured long : short ratio is, by the same
 * boundaries as `tapSwingClass` and the grader's `swingClass`: straight below 1.2, light below 1.6, triplet below 2.4,
 * hard above. Returns the feel with its label ("Light swing (3:2)").
 */
export function swingFeelOf(ratio: number): (typeof SWING_FEELS)[number] | null {
  if (!Number.isFinite(ratio)) return null;
  const cls = tapSwingClass(ratio);
  return SWING_FEELS.find((f) => f.id === cls) ?? null;
}

// --- texts -----------------------------------------------------------------------------------------------------

/**
 * Catalog texts for the ids this module adds (the grader's feedback catalog owns the wording the app shows; these
 * are the rows it is sent, and what a host without the catalog can print). Slots are the diagnostics' params. Each
 * says what the learner's taps did; the pattern itself is what the step plays.
 */
export const TRACK_TAP_FEEDBACK: Readonly<Record<string, string>> = {
  "tap.lane-rushing": "Your {lane} is rushing against the {other}: its taps come {ms} ms early.",
  "tap.lane-dragging": "Your {lane} is dragging against the {other}: its taps come {ms} ms late.",
  "tap.lane-silent": "No taps on {key}: that hand plays the {lane} while the other plays the {other}.",
  "tap.lanes-swapped": "Your hands swapped parts: {keyA} tapped the {laneB} and {keyB} the {laneA}.",
  "tap.lanes-flam": "Where both hands play together, they landed {ms} ms apart.",
  "tap.timeline": "Bar {bar}: you tapped {got}. The pattern is {exp}.",
  "tap.clave-direction":
    "You tapped the clave {got}, starting from its {gotFirst} side. This one runs {exp}: the {expFirst} side first.",
  "tap.clave-type":
    "You tapped a {got} clave: its three side ends {gotWhere}. This one is a {exp} clave, ending {expWhere}.",
  "tap.grouping-order": "You tapped {got} ({gotWords}). This bar of {meter} goes {exp}: {expWords}.",
  "tap.grouping-even": "You tapped evenly, {every}. This bar of {meter} goes {exp}: {expWords}.",
  "tap.lay-back": "You sat {about}{ms} ms {dir} the beat (± {pm} ms): {word}.",
};

/** Renders one of this module's diagnostics with `TRACK_TAP_FEEDBACK`; `null` for any other id. */
export function trackTapText(d: Pick<Diagnostic, "id" | "params">): string | null {
  const template = TRACK_TAP_FEEDBACK[d.id];
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(d.params[k] ?? "")).replace(/\s{2,}/g, " ");
}
