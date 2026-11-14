// Tap capture logic (contracts §8.4, ux §4.4): where taps and targets sit on the pad's grid, and the per-tap
// report a host shows after an attempt. The ONE grading rule is `@oak/pitch` `gradeTaps`; this module only
// turns its result into per-part marks and calm words. Pure: tested with `bun test`.
import type { LearnerProfile, MeterSpec, TapTolerance } from "@oak/content-kit";
import { nearest } from "@oak/content-kit";
import { gradeTaps, type TapResult } from "@oak/pitch";
import { barPosition } from "@oak/theory";
import { gridLayout } from "./keys.ts";
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
  o: {
    tol?: TapTolerance;
    level?: number;
    levels?: number;
    /** Wave 6: what a target is called ("beat", or "hit" for a rhythm with notes off the beat). */
    word?: "beat" | "hit";
    /** Wave 6: where each target sits ("2 &", "1 trip"), aligned with the sorted targets: named when missed. */
    places?: readonly string[];
  } = {},
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
    const where = o.places?.[i];
    return p
      ? { part: i, ok: true, note: where ? `${where}: ${offsetWords(p.errorMs)}` : offsetWords(p.errorMs) }
      : { part: i, ok: false, note: where ? `no tap on ${where}` : "no tap here" };
  });
  for (const j of result.extra) marks.push({ part: `extra:${j}`, ok: false, note: "an extra tap" });
  const hit = pairs.length;
  const word = o.word ?? "beat";
  const missedPlaces = result.missed.map((i) => o.places?.[i]).filter((x): x is string => Boolean(x));
  const missedNote =
    missedPlaces.length > 0 && missedPlaces.length <= 3 ? ` Missed: ${missedPlaces.join(", ")}.` : "";
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
            ? `No ${word}s to tap here.`
            : A.length === 0
              ? "No taps reached Oak. Tap with Space, or click the pad."
              : `${hit} of ${T.length} ${T.length === 1 ? word : `${word}s`} matched${result.extra.length ? `, ${result.extra.length} extra` : ""}.${missedNote}${offsetNote}`,
      };
  return { result, pairs, missed: result.missed, extra: result.extra, feedback };
}

// --- Wave 6: the pad's grid in any meter ---------------------------------------------------------------

/** How the pad draws a bar: beats, steps in a beat, and the count over every step. */
export interface PadGrid {
  beatsPerBar: number;
  stepsPerBeat: number;
  /** One label per step of a bar: "1", "la", "li", "2" … */
  counts: string[];
  compound: boolean;
}

/**
 * The pad's grid (contracts §6.9): in a compound meter the beat is the dotted quarter and is drawn in three,
 * counted "1 la li"; in a simple meter `stepsPerBeat` 3 is a triplet grid, "1 trip let", 2 is "1 &", 4 "1 e & a".
 */
export function padGrid(o: { meter?: MeterSpec; beatsPerBar?: number; stepsPerBeat?: number }): PadGrid {
  const compound = o.meter?.tempoUnit === "dottedQuarter";
  const beatsPerBar = o.meter ? o.meter.unitsPerBar : (o.beatsPerBar ?? 4);
  const stepsPerBeat = o.stepsPerBeat ?? (compound ? 3 : 4);
  const layout = gridLayout(beatsPerBar * stepsPerBeat, 1, {
    ...(o.meter ? { meter: o.meter } : { beatsPerBar }),
    triplets: !compound && stepsPerBeat === 3,
  });
  return { beatsPerBar, stepsPerBeat, counts: layout.counts, compound };
}

/**
 * Where a target sits in its bar, as it is counted: "2 &", "1 trip", "2 la" (`@oak/theory` `barPosition`; a
 * triplet position in a simple meter reads "trip"/"let"). `onsetBars` is in bars from the take's start.
 */
export function targetPlace(onsetBars: number, meter: MeterSpec, bars: number): string {
  const pos = barPosition(nearest(onsetBars, 48), meter);
  const label = pos.label.replace(/^(\d+)-?(?=[a-z&])/, "$1 ");
  return bars > 1 ? `bar ${Math.floor(onsetBars + 1e-9) + 1}, ${label}` : label;
}
