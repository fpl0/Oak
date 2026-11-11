// Tap capture logic (contracts §8.4, ux §4.4): where taps and targets sit on the pad's grid, and the per-tap
// report a host shows after an attempt. The ONE grading rule is `@oak/pitch` `gradeTaps`; this module only
// turns its result into per-part marks and calm words. Pure: tested with `bun test`.
import type { LearnerProfile, TapTolerance } from "@oak/content-kit";
import { gradeTaps, type TapResult } from "@oak/pitch";
import type { AnswerFeedback, PartMark } from "./types.ts";

/** Authors write this (contracts §8.4): the auto window, locked tempo, offset forgiven at levels 1–2. */
export const DEFAULT_TAP_TOL: TapTolerance = {
  windowMs: "auto",
  tempo: "locked",
  forgiveOffset: true,
  passF1: 0.9,
  passTiming: 0.5,
};

/** A tap or a target on the pad: `bar` 0-based, `pos` 0–1 across the bar. */
export interface PadPoint {
  bar: number;
  pos: number;
}

/** Seconds on the take's clock → bar and position (`cps` = bars per second). Points past the take are dropped. */
export function padPoint(seconds: number, startAt: number, cps: number, bars: number): PadPoint | null {
  const cycles = (seconds - startAt) * cps;
  // A tap up to a quarter of a bar early still belongs on the pad (it is the anticipated downbeat).
  if (cycles < -0.25 || cycles >= bars + 0.25) return null;
  const c = Math.max(0, Math.min(bars - 1e-9, cycles));
  const bar = Math.floor(c);
  return { bar, pos: c - bar };
}

/** Target onsets in bars (cycles from the take's start) → AudioContext seconds. */
export function targetSeconds(onsetsBars: readonly number[], startAt: number, cps: number): number[] {
  return onsetsBars.map((c) => startAt + c / cps).sort((a, b) => a - b);
}

export interface TapPair {
  target: number;
  tap: number;
  /** Signed error, ms (positive = late). */
  errorMs: number;
}
export interface TapReport {
  result: TapResult;
  pairs: TapPair[];
  /** Target indices with no tap. */
  missed: number[];
  /** Tap indices that matched nothing. */
  extra: number[];
  feedback: AnswerFeedback;
}

const ms = (s: number) => Math.round(s * 1000);

/** "12 ms late", "on the beat" (within 10 ms), "30 ms early". */
export function offsetWords(errorMs: number): string {
  if (Math.abs(errorMs) <= 10) return "on the beat";
  return `${Math.abs(Math.round(errorMs))} ms ${errorMs > 0 ? "late" : "early"}`;
}

/**
 * Grades a take with `gradeTaps` and reports it per target: marks (`part` = target index; extra taps are
 * `extra:<tap index>`), the matched pairs with their offsets, and a calm summary for the feedback line.
 */
export function tapReport(
  taps: readonly number[],
  targets: readonly number[],
  profile: LearnerProfile,
  o: { tol?: TapTolerance; level?: number; levels?: number } = {},
): TapReport {
  const T = [...targets].sort((a, b) => a - b);
  const A = [...taps].sort((a, b) => a - b);
  const result = gradeTaps(A, T, o.tol ?? DEFAULT_TAP_TOL, profile, {
    level: o.level ?? 1,
    levels: o.levels ?? 1,
  });
  const pairs: TapPair[] = result.pairs.map(([ti, ai]) => ({
    target: ti,
    tap: ai,
    errorMs: ms((A[ai] as number) - (T[ti] as number)),
  }));
  const byTarget = new Map(pairs.map((p) => [p.target, p]));
  const marks: PartMark[] = T.map((_, i) => {
    const p = byTarget.get(i);
    return p
      ? { part: i, ok: true, note: offsetWords(p.errorMs) }
      : { part: i, ok: false, note: "no tap here" };
  });
  for (const j of result.extra) marks.push({ part: `extra:${j}`, ok: false, note: "an extra tap" });
  const hit = pairs.length;
  const offset = Math.round(result.offsetMs);
  const offsetNote =
    Math.abs(offset) > 25
      ? ` On the whole you were ${Math.abs(offset)} ms ${offset > 0 ? "behind" : "ahead"}.`
      : "";
  const feedback: AnswerFeedback = result.pass
    ? { state: "correct", marks }
    : {
        state: "wrong",
        marks,
        message:
          T.length === 0
            ? "No beats to tap here."
            : A.length === 0
              ? "No taps reached Oak. Tap with Space, or click the pad."
              : `${hit} of ${T.length} ${T.length === 1 ? "beat" : "beats"} matched${result.extra.length ? `, ${result.extra.length} extra` : ""}.${offsetNote}`,
      };
  return { result, pairs, missed: result.missed, extra: result.extra, feedback };
}
