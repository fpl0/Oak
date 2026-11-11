// The one rule for taps (contracts §8.4, exercises §3 `gradeTaps`) and the tap-latency calibration.
// Times are seconds on one clock (AudioContext time); taps arrive already minus `tapLatencyMs`.
import type { Diagnostic, LearnerProfile, TapTolerance } from "@oak/content-kit";
import { clamp, mad, mean, median } from "./math.ts";
import type { TapResult } from "./types.ts";

const EPS = 1e-9;
/** A constant offset above this is reported (`tap.offset`). */
export const TAP_OFFSET_REPORT_MS = 25;
/** Drift over the phrase above this is reported (`tap.rushing` / `tap.dragging`). */
export const TAP_DRIFT_REPORT_MS = 30;
/** Free tempo: the fitted tempo ratio stays inside this range. */
export const FREE_TEMPO_RANGE: readonly [number, number] = [0.8, 1.25];

/** The window floor: 50 ms, 70 on Bluetooth output, 80 when the calibration jitter exceeds 25 ms. */
export function tapFloorMs(profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs">): number {
  let floor = 50;
  if (profile.outputKind === "bluetooth") floor = 70;
  if (Number.isFinite(profile.tapJitterMs) && profile.tapJitterMs > 25) floor = Math.max(floor, 80);
  return floor;
}

/**
 * `w = max(floor, clamp(0.25 × minIOI, 50, 120) × levelFactor)`; `levelFactor` runs linearly from 1.0 at
 * the family's first level (1) to 0.6 at its top level (`levels`); `floor` is 50 ms (70 on Bluetooth
 * output; 80 when the calibration jitter exceeds 25 ms). The window is never below the floor.
 */
export function tapWindowMs(
  minIoiMs: number,
  level: number,
  levels: number,
  profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs">,
): number {
  const top = Math.max(1, Math.round(levels));
  const lv = clamp(Math.round(level), 1, top);
  const levelFactor = top === 1 ? 1 : 1 - (0.4 * (lv - 1)) / (top - 1);
  const ioi = Number.isFinite(minIoiMs) && minIoiMs > 0 ? minIoiMs : 480;
  return Math.max(tapFloorMs(profile), clamp(0.25 * ioi, 50, 120) * levelFactor);
}

/** Smallest positive inter-onset interval of sorted targets, ms (Infinity with fewer than two). */
export function minIoiMs(targets: readonly number[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < targets.length; i++) {
    const d = ((targets[i] as number) - (targets[i - 1] as number)) * 1000;
    if (d > EPS && d < min) min = d;
  }
  return min;
}

/**
 * Monotone alignment of taps to targets. A pair may match only when |e| ≤ w; a match costs |e|/w, a
 * skipped target or tap costs 1. Returns [target, tap] pairs in order.
 */
export function alignTaps(
  targets: readonly number[],
  taps: readonly number[],
  w: number,
): [number, number][] {
  const n = targets.length;
  const m = taps.length;
  const W = m + 1;
  const d = new Float64Array((n + 1) * W);
  for (let i = 0; i <= n; i++) d[i * W] = i;
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.min((d[(i - 1) * W + j] as number) + 1, (d[i * W + j - 1] as number) + 1);
      const e = Math.abs((taps[j - 1] as number) - (targets[i - 1] as number));
      if (e <= w + EPS) best = Math.min(best, (d[(i - 1) * W + j - 1] as number) + e / w);
      d[i * W + j] = best;
    }
  }
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const here = d[i * W + j] as number;
    const e = Math.abs((taps[j - 1] as number) - (targets[i - 1] as number));
    if (e <= w + EPS && Math.abs(here - ((d[(i - 1) * W + j - 1] as number) + e / w)) < 1e-9) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (Math.abs(here - ((d[(i - 1) * W + j] as number) + 1)) < 1e-9) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
}

/** Least-squares slope of y over x. */
function slope(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let k = 0; k < xs.length; k++) {
    const dx = (xs[k] as number) - mx;
    num += dx * ((ys[k] as number) - my);
    den += dx * dx;
  }
  return den > EPS ? num / den : 0;
}

/** Coarse offset `b0` (seconds): median of (tap − nearest target) over pairs closer than `limit`. */
function coarseOffset(targets: readonly number[], taps: readonly number[], limit: number): number {
  const diffs: number[] = [];
  for (const t of taps) {
    let best = Number.POSITIVE_INFINITY;
    for (const g of targets) if (Math.abs(t - g) < Math.abs(best)) best = t - g;
    if (Math.abs(best) < limit) diffs.push(best);
  }
  return diffs.length > 0 ? median(diffs) : 0;
}

/**
 * `taps` and `targets` in seconds on the same clock, taps already minus `tapLatencyMs`. Coarse offset,
 * monotone DP alignment, `F1 = 2M / (|T| + |A|)`, `timing = mean(1 − |e| / w)`. Score = 0.7·F1 + 0.3·timing.
 * Pass: F1 ≥ `passF1` (0.9) and timing ≥ `passTiming` (0.5). A constant offset above 25 ms is reported
 * (`tap.offset`) and subtracted when `forgiveOffset` is set and the level is 1 or 2 (or not given).
 * `tempo: 'free'` fits an affine map (tempo ratio in [0.8, 1.25]) before grading.
 */
export function gradeTaps(
  taps: readonly number[],
  targets: readonly number[],
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: { level?: number; levels?: number } = {},
): TapResult {
  const T = [...targets].sort((a, b) => a - b);
  const A = [...taps].sort((a, b) => a - b);
  const level = opts.level ?? 1;
  const levels = opts.levels ?? 1;
  const windowMs =
    tol.windowMs === "auto" ? tapWindowMs(minIoiMs(T), level, levels, profile) : Math.max(1, tol.windowMs);
  const w = windowMs / 1000;
  const diagnostics: Diagnostic[] = [];

  // Map taps onto the target clock: τ' = a·τ + c (a = 1 for locked tempo).
  let a = 1;
  let c = 0;
  let tempoRatio: number | null = null;
  if (tol.tempo === "free" && A.length >= 2 && T.length >= 2) {
    const spanA = (A[A.length - 1] as number) - (A[0] as number);
    const spanT = (T[T.length - 1] as number) - (T[0] as number);
    a = spanA > EPS ? clamp(spanT / spanA, FREE_TEMPO_RANGE[0], FREE_TEMPO_RANGE[1]) : 1;
    c = (T[0] as number) - a * (A[0] as number);
    for (let iter = 0; iter < 2; iter++) {
      const mapped = A.map((t) => a * t + c);
      const pairs = alignTaps(T, mapped, Math.max(2 * w, 0.25 * (minIoiMs(T) / 1000)));
      if (pairs.length < 2) break;
      const xs = pairs.map(([, j]) => A[j] as number);
      const ys = pairs.map(([i]) => T[i] as number);
      a = clamp(slope(xs, ys) || a, FREE_TEMPO_RANGE[0], FREE_TEMPO_RANGE[1]);
      c = mean(ys.map((y, k) => y - a * (xs[k] as number)));
    }
    // τ' = a·τ + c stretches the learner's taps onto the targets: a > 1 means they played faster.
    tempoRatio = a;
  }
  const mapped = A.map((t) => a * t + c);

  // 3–5: coarse offset, alignment, fine offset from the matched errors.
  const b0 = coarseOffset(T, mapped, 2 * w);
  let pairs = alignTaps(
    T,
    mapped.map((t) => t - b0),
    w,
  );
  const matchedErr = pairs.map(([i, j]) => (mapped[j] as number) - (T[i] as number));
  const b = matchedErr.length > 0 ? median(matchedErr) : b0;
  const offsetMs = b * 1000;
  const forgiven = tol.forgiveOffset && level <= 2;
  const shift = forgiven ? b : 0;
  pairs = alignTaps(
    T,
    mapped.map((t) => t - shift),
    w,
  );
  const errors = pairs.map(([i, j]) => (mapped[j] as number) - shift - (T[i] as number));

  if (Math.abs(offsetMs) > TAP_OFFSET_REPORT_MS && pairs.length > 0) {
    diagnostics.push({
      id: "tap.offset",
      severity: forgiven ? "info" : "warn",
      dim: "timing",
      params: { ms: Math.round(Math.abs(offsetMs)), dir: offsetMs > 0 ? "late" : "early" },
    });
  }
  // Drift: regression slope of e over t; reported when it adds up to more than 30 ms over the phrase.
  if (errors.length >= 4) {
    const ts = pairs.map(([i]) => T[i] as number);
    const span = (ts[ts.length - 1] as number) - (ts[0] as number);
    const driftMs = slope(ts, errors) * span * 1000;
    if (Math.abs(driftMs) > TAP_DRIFT_REPORT_MS) {
      diagnostics.push({
        id: driftMs < 0 ? "tap.rushing" : "tap.dragging",
        severity: "warn",
        dim: "timing",
        params: { ms: Math.round(Math.abs(driftMs)), dir: driftMs < 0 ? "sped up" : "slowed down" },
      });
    }
  }

  const matchedT = new Set(pairs.map(([i]) => i));
  const matchedA = new Set(pairs.map(([, j]) => j));
  const missed = T.map((_, i) => i).filter((i) => !matchedT.has(i));
  const extra = A.map((_, j) => j).filter((j) => !matchedA.has(j));
  for (const i of missed) {
    diagnostics.push({
      id: "tap.missed",
      severity: "error",
      dim: "rhythm",
      where: { slot: i, tSec: T[i] as number },
      params: { i: i + 1 },
    });
  }
  for (const j of extra) {
    diagnostics.push({
      id: "tap.extra",
      severity: "warn",
      dim: "rhythm",
      where: { tSec: A[j] as number },
      params: { j: j + 1 },
    });
  }

  const M = pairs.length;
  const total = T.length + A.length;
  const f1 = total > 0 ? (2 * M) / total : 1;
  const timing = M > 0 ? mean(errors.map((e) => Math.max(0, 1 - Math.abs(e) / w))) : 0;
  const score = 0.7 * f1 + 0.3 * timing;
  const dims: TapResult["dims"] = {
    rhythm: { score: f1, weight: 0.7, n: T.length },
    timing: { score: timing, weight: 0.3, n: M },
  };
  const result: TapResult = {
    score,
    pass: T.length > 0 && f1 >= tol.passF1 - EPS && timing >= tol.passTiming - EPS,
    dims,
    diagnostics,
    pairs,
    missed,
    extra,
    f1,
    timing,
    offsetMs,
    windowMs,
  };
  if (tempoRatio !== null) result.tempoRatio = tempoRatio;
  return result;
}

/** Latencies the calibration searches, ms: anticipation down to −150, Bluetooth up to 450. */
export const TAP_LATENCY_SEARCH_MS: readonly [number, number] = [-150, 450];

/**
 * Median and MAD of (tap − click) over the calibration clicks, ms. The constant latency is found first
 * (the shift that puts most taps within ±60 ms of a click, searched over −150…450 ms), then each click
 * is paired monotonically with its tap, so a missed or doubled tap, or a Bluetooth latency longer than
 * half the click spacing, does not shift the rest. Throws a `RangeError` with fewer than 4 pairs.
 */
export function calibrateTapLatency(
  taps: readonly number[],
  clicks: readonly number[],
): { latencyMs: number; jitterMs: number } {
  const C = [...clicks].sort((x, y) => x - y);
  const A = [...taps].sort((x, y) => x - y);
  const near = 0.06;
  let bestShift = 0;
  let bestScore = -1;
  for (let ms = TAP_LATENCY_SEARCH_MS[0]; ms <= TAP_LATENCY_SEARCH_MS[1]; ms += 2) {
    const s = ms / 1000;
    let hits = 0;
    let err = 0;
    for (const t of A) {
      let best = Number.POSITIVE_INFINITY;
      for (const c of C) best = Math.min(best, Math.abs(t - s - c));
      if (best <= near) {
        hits++;
        err += best;
      }
    }
    // Most hits first, then the smallest total error, then the smallest |shift|.
    const score = hits * 1000 - err;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestShift = s;
    }
  }
  const pairs = alignTaps(
    C,
    A.map((t) => t - bestShift),
    0.15,
  );
  const diffs = pairs.map(([i, j]) => ((A[j] as number) - (C[i] as number)) * 1000);
  if (diffs.length < 4) {
    throw new RangeError(`@oak/pitch: calibrateTapLatency needs 4 taps on clicks, got ${diffs.length}`);
  }
  return { latencyMs: median(diffs), jitterMs: mad(diffs) };
}
