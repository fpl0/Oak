// Wave 5 (U11.L07): tap a shuffle against a click and get the measured swing. The taps are graded by the one rule
// for taps (`gradeTaps`, contracts §8.4: the auto window, coarse offset, monotone alignment, F1 and timing) against
// swung targets — each beat's on-beat and its off-beat at `(1 + amount) / 2` of the beat (contracts §6.10) — and
// the feel is measured from the learner's own taps: in each beat with an on-beat tap, a following on-beat tap and
// one tap between them, the off-beat sits at fraction p of the learner's own beat; the ratio long : short is
// p / (1 − p) (2 = triplet swing, 1 = straight), the median over the beats. Measuring between the learner's own
// on-beats removes a constant offset and a slow drift, so the feel is judged apart from the timing.
import type { Diagnostic, LearnerProfile, TapTolerance } from "@oak/content-kit";
import { median } from "./math.ts";
import { gradeTaps, tapWindowMs } from "./taps.ts";
import type { TapResult } from "./types.ts";

/** The same classes and boundaries as the grader's `swingClass` (contracts §6.10): long : short ratio. */
export type TapSwingClass = "straight" | "light" | "triplet" | "hard";
export function tapSwingClass(ratio: number): TapSwingClass {
  return ratio < 1.2 ? "straight" : ratio < 1.6 ? "light" : ratio < 2.4 ? "triplet" : "hard";
}

/** Where a slot's off-beat sits for a `swingBy` amount: `(1 + amount) / 2` (1/2 straight, 2/3 triplet). */
export function offbeatOf(amount: number): number {
  return (1 + Math.max(0, Math.min(1, amount))) / 2;
}
/** Long : short of a swing amount: `(1 + x) / (1 − x)` (1/3 → 2). */
export function ratioOfAmount(amount: number): number {
  const x = Math.max(0, Math.min(0.999, amount));
  return (1 + x) / (1 - x);
}

export interface SwingGrid {
  /** AudioContext time of the first beat (the click's bar 1), taps on the same clock (latency removed). */
  downbeat: number;
  bpm: number;
  /** Swing slots to tap (beats for 8th swing, half-beats for 16th swing). */
  slots: number;
  /** `swingBy` amount of the target: 1/3 is a shuffle (triplet swing); 0 is straight. */
  amount: number;
  /** Default 8: the slot is a beat. 16: the slot is half a beat. */
  subdivision?: 8 | 16;
}

/** Seconds per swing slot. */
export function swingSlotSec(grid: Pick<SwingGrid, "bpm" | "subdivision">): number {
  const beat = 60 / grid.bpm;
  return grid.subdivision === 16 ? beat / 2 : beat;
}

/** The target taps of a swung pattern: every slot's on-beat and its off-beat, in time order. */
export function swungTargets(grid: SwingGrid): number[] {
  const slot = swingSlotSec(grid);
  const off = offbeatOf(grid.amount);
  const out: number[] = [];
  for (let k = 0; k < grid.slots; k++) {
    const t = grid.downbeat + k * slot;
    out.push(t, t + off * slot);
  }
  return out;
}

export interface TapSwing {
  /** Long : short, the median over the measured slots; `NaN` when nothing could be measured. */
  ratio: number;
  /** The `swingBy` amount that ratio is: `(ratio − 1) / (ratio + 1)`. */
  amount: number;
  /** The median off-beat position inside the learner's own slot (0.5 straight, 2/3 triplet). */
  offbeat: number;
  cls: TapSwingClass | null;
  /** Slots measured. */
  n: number;
  /** Each measured slot: its index and the off-beat's position p. */
  perSlot: { slot: number; p: number }[];
}

/**
 * The swing of a take: in each slot, the on-beat tap is the one nearest the slot's start (within a quarter of a
 * slot), the next slot's on-beat closes it, and exactly one tap between 0.3 and 0.85 of the way is its off-beat.
 */
export function measureTapSwing(taps: readonly number[], grid: Omit<SwingGrid, "amount">): TapSwing {
  const slot = swingSlotSec(grid);
  const A = [...taps].sort((a, b) => a - b);
  const onAt = (k: number): number | null => {
    const t = grid.downbeat + k * slot;
    let best: number | null = null;
    for (const a of A)
      if (Math.abs(a - t) <= slot / 4 && (best === null || Math.abs(a - t) < Math.abs(best - t))) best = a;
    return best;
  };
  const perSlot: { slot: number; p: number }[] = [];
  for (let k = 0; k < grid.slots; k++) {
    const on = onAt(k);
    const next = onAt(k + 1);
    if (on === null || next === null || next - on < slot / 2) continue;
    const inside = A.filter((a) => a > on && a < next).map((a) => (a - on) / (next - on));
    const offs = inside.filter((p) => p >= 0.3 && p <= 0.85);
    if (offs.length !== 1 || inside.length !== 1) continue;
    perSlot.push({ slot: k, p: offs[0] as number });
  }
  if (perSlot.length === 0)
    return { ratio: Number.NaN, amount: Number.NaN, offbeat: Number.NaN, cls: null, n: 0, perSlot };
  const offbeat = median(perSlot.map((s) => s.p));
  const ratio = offbeat / (1 - offbeat);
  return {
    ratio,
    amount: (ratio - 1) / (ratio + 1),
    offbeat,
    cls: tapSwingClass(ratio),
    n: perSlot.length,
    perSlot,
  };
}

/** What `gradeSwingTaps` returns: the tap grade, and the feel measured against the target's. */
export interface SwingTapResult extends TapResult {
  swing: TapSwing & {
    targetRatio: number;
    targetOffbeat: number;
    targetCls: TapSwingClass;
    /** How far the median off-beat sits from the target's, ms (positive: later, a harder swing). */
    offbeatErrorMs: number | null;
    /**
     * The feel is right when the median off-beat lies inside the §8.4 window of the target off-beat (the same
     * `w` the taps were graded with) and at least half the slots were measurable.
     */
    feelOk: boolean;
  };
}

/** Slots that must be measurable for a feel verdict: half of them. */
export const SWING_MIN_MEASURED = 0.5;

/**
 * Grades a take tapped against a click on a swung pattern (`swungTargets`) with `gradeTaps` (§8.4, unchanged),
 * then measures its swing (`measureTapSwing`) and says how it compares: `tap.swing` (info when the feel is right,
 * a warning when it is not, with the measured and target ratios and feels). The feel never changes `pass`,
 * which stays the §8.4 rule (F1 ≥ 0.9 and timing ≥ 0.5): a straight take against a shuffle already misses its
 * off-beats by a sixth of a beat.
 */
export function gradeSwingTaps(
  taps: readonly number[],
  grid: SwingGrid,
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: { level?: number; levels?: number } = {},
): SwingTapResult {
  const targets = swungTargets(grid);
  const base = gradeTaps(taps, targets, tol, profile, opts);
  const slot = swingSlotSec(grid);
  // Remove the constant offset the grade forgave (levels 1–2) before measuring: the feel is relative anyway.
  const measured = measureTapSwing(taps, { ...grid, downbeat: grid.downbeat + base.offsetMs / 1000 });
  const targetOffbeat = offbeatOf(grid.amount);
  const targetRatio = ratioOfAmount(grid.amount);
  const w =
    tol.windowMs === "auto"
      ? tapWindowMs(slot * 1000 * (1 - targetOffbeat), opts.level ?? 1, opts.levels ?? 1, profile)
      : tol.windowMs;
  const offbeatErrorMs = measured.n > 0 ? (measured.offbeat - targetOffbeat) * slot * 1000 : null;
  // The last slot is closed only by a tap on the next downbeat, so `slots − 1` can always be measured.
  const enough = measured.n >= Math.max(1, Math.ceil(SWING_MIN_MEASURED * (grid.slots - 1) - 1e-9));
  const feelOk = enough && offbeatErrorMs !== null && Math.abs(offbeatErrorMs) <= w + 1e-9;
  const diagnostics: Diagnostic[] = [...base.diagnostics];
  if (measured.n > 0) {
    diagnostics.push({
      id: "tap.swing",
      severity: feelOk ? "info" : "warn",
      dim: "timing",
      params: {
        got: ratioText(measured.ratio),
        exp: ratioText(targetRatio),
        gotFeel: feelWord(measured.cls as TapSwingClass),
        expFeel: feelWord(tapSwingClass(targetRatio)),
        ms: Math.round(Math.abs(offbeatErrorMs as number)),
        dir: (offbeatErrorMs as number) > 0 ? "late" : "early",
      },
    });
  }
  return {
    ...base,
    diagnostics,
    swing: {
      ...measured,
      targetRatio,
      targetOffbeat,
      targetCls: tapSwingClass(targetRatio),
      offbeatErrorMs,
      feelOk,
    },
  };
}

/** "2.1:1", "1:1". */
export function ratioText(ratio: number): string {
  if (!Number.isFinite(ratio)) return "–";
  return `${Math.round(ratio * 10) / 10}:1`;
}
/** The course's words for a feel (U11.L07 says "long–short", not "triplet"). */
export function feelWord(cls: TapSwingClass): string {
  return cls === "straight"
    ? "straight (even eighths)"
    : cls === "light"
      ? "lightly swung"
      : cls === "triplet"
        ? "swung (long–short)"
        : "hard swing (nearly dotted)";
}
