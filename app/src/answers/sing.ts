// Sing capture logic (contracts §8.1, ux §4.3): targets fitted to the learner's comfort range, the live trace
// folded onto the target lane, the needle words, and the per-note summary an attempt stores. The ONE rule for a
// sung note is `@oak/pitch` `gradeSung` (`gradeSungLive` while singing); nothing here grades on its own terms.
// Pure: tested with `bun test`.
import type { LearnerProfile, SingMode, SingTolerance } from "@oak/content-kit";
import {
  fitToRange,
  gradeSung,
  gradeSungLive,
  type PitchFrame,
  PitchTracker,
  type SungResult,
  type SungTarget,
  trackerOptionsFor,
} from "@oak/pitch";
import type { AnswerFeedback, PartMark, SungSummary } from "./types.ts";

/** Authors use the learner's rung with per-note folding (contracts §8.1, §8.2). */
export const DEFAULT_SING_TOL: SingTolerance = {
  cents: "learner",
  octave: "per-note",
  driftCompCents: 0,
  minCoverage: 0.4,
  passHitRate: 0.8,
};

/** One note to sing, relative to the take's start (seconds). */
export interface SingNote {
  midi: number;
  /** Seconds after the take starts. */
  at: number;
  dur: number;
  /** "5", "sol": printed on the ribbon. */
  label?: string;
}

/** Notes moved by whole octaves into the comfort range (contracts §8.1 rule 3), and the shift used. */
export function fitNotes(
  notes: readonly SingNote[],
  profile: LearnerProfile,
): { notes: SingNote[]; shift: number } {
  const shift = fitToRange(
    notes.map((n) => n.midi),
    profile,
  );
  return { notes: notes.map((n) => ({ ...n, midi: n.midi + shift })), shift };
}

/** The targets `gradeSung` reads, on the AudioContext clock. */
export function targetsAt(notes: readonly SingNote[], startAt: number): SungTarget[] {
  return notes.map((n) => ({ midi: n.midi, on: startAt + n.at, off: startAt + n.at + n.dur }));
}

/** Seconds from the take's start to the end of its last note. */
export function takeSeconds(notes: readonly SingNote[]): number {
  return notes.reduce((end, n) => Math.max(end, n.at + n.dur), 0);
}

/** `midi` moved by octaves to the nearest copy of `ref` (fold into (−6, +6] semitones): the lane's octave folding. */
export function foldTo(midi: number, ref: number): { midi: number; octaves: number } {
  let octaves = 0;
  let m = midi;
  while (m - ref > 6) {
    m -= 12;
    octaves--;
  }
  while (m - ref <= -6) {
    m += 12;
    octaves++;
  }
  return { midi: m, octaves };
}

export interface TracePoint {
  /** Seconds after the take's start (window centre). */
  t: number;
  /** Folded to the nearest target in time, fractional MIDI; `null` = unvoiced (a gap in the trace). */
  midi: number | null;
  /** Octaves the point was folded by (the 8va/8vb badge). */
  folded: number;
}

/**
 * The live trace: frames through the same tracker the grader uses (clarity gate, median of 5, octave repair),
 * folded onto the target that is active at that moment (or the nearest one).
 */
export function traceOf(
  frames: readonly PitchFrame[],
  notes: readonly SingNote[],
  startAt: number,
  profile: LearnerProfile,
): TracePoint[] {
  const tracker = new PitchTracker({ ...trackerOptionsFor(profile) });
  const out: TracePoint[] = [];
  for (const f of frames) {
    const tr = tracker.push(f);
    const t = tr.t - startAt;
    if (tr.midi === null || notes.length === 0) {
      out.push({ t, midi: null, folded: 0 });
      continue;
    }
    let ref = notes[0] as SingNote;
    let best = Number.POSITIVE_INFINITY;
    for (const n of notes) {
      const d = t < n.at ? n.at - t : t > n.at + n.dur ? t - n.at - n.dur : 0;
      if (d < best) {
        best = d;
        ref = n;
      }
    }
    const f2 = foldTo(tr.midi, ref.midi);
    out.push({ t, midi: f2.midi, folded: f2.octaves });
  }
  return out;
}

/** The needle (ux §4.3): words and an arrow, never red/green. `null` cents = nothing heard. */
export function needleWords(
  cents: number | null,
  tolCents: number,
): { words: string; arrow: "↑" | "↓" | "" } {
  if (cents === null) return { words: "listening", arrow: "" };
  const c = Math.round(cents);
  if (Math.abs(c) <= 10) return { words: "spot on", arrow: "" };
  if (Math.abs(c) <= tolCents)
    return c < 0 ? { words: "a little low", arrow: "↑" } : { words: "a little high", arrow: "↓" };
  return c < 0 ? { words: "low", arrow: "↑" } : { words: "high", arrow: "↓" };
}

/** Signed cents as the lane prints them: `+12¢`, `−30¢`, `0¢`. */
export function centsText(cents: number): string {
  const c = Math.round(cents);
  if (c === 0) return "0¢";
  return `${c > 0 ? "+" : "−"}${Math.abs(c)}¢`;
}

/** What an attempt stores for each target note: the sung pitch (folded), its error and credit. Never audio. */
export function summarize(result: SungResult): SungSummary[] {
  return result.notes.map((n) => ({
    midi: n.sungMidi === null ? null : Math.round(n.sungMidi * 100) / 100,
    cents: n.cents === null ? null : Math.round(n.cents * 10) / 10,
    credit: n.credit,
  }));
}

/** Per-note marks and a calm line, from the same result the grade comes from. */
export function singFeedback(
  result: SungResult,
  labels: readonly (string | undefined)[] = [],
): AnswerFeedback {
  const marks: PartMark[] = result.notes.map((n, i) => {
    const name = labels[i] ? `${labels[i]}: ` : "";
    if (n.cents === null || n.feedback === "sing.missed")
      return { part: i, ok: false, note: `${name}not heard` };
    const words = needleWords(n.cents, result.tolCents).words;
    return { part: i, ok: n.credit >= 1, note: `${name}${words}, ${centsText(n.cents)}` };
  });
  if (result.pass) return { state: "correct", marks };
  const noVoice = result.diagnostics.some((d) => d.id === "sing.no-voice");
  const missed = result.notes.filter((n) => n.feedback === "sing.missed").length;
  const off = result.notes.filter((n) => n.credit < 1 && n.feedback !== "sing.missed").length;
  const message = noVoice
    ? "Oak heard no voice. Check the mic, then sing a little louder."
    : [
        off ? `${off} ${off === 1 ? "note was" : "notes were"} outside ±${result.tolCents}¢` : null,
        missed ? `${missed} ${missed === 1 ? "note was" : "notes were"} too short to hear` : null,
      ]
        .filter(Boolean)
        .join("; ")
        .replace(/^./, (c) => c.toUpperCase())
        .concat(".");
  return { state: "wrong", marks, message };
}

/** Grades a finished take (the same call the grader makes). */
export function gradeTake(
  frames: readonly PitchFrame[],
  notes: readonly SingNote[],
  startAt: number,
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
): SungResult {
  return gradeSung(frames, targetsAt(notes, startAt), tol, mode, profile);
}

/** The live form: per-note credit for the frames so far (the ribbon fill and the tick). */
export function gradeLive(
  frames: readonly PitchFrame[],
  notes: readonly SingNote[],
  startAt: number,
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
  now: number,
): SungResult {
  return gradeSungLive(frames, targetsAt(notes, startAt), tol, mode, profile, now);
}
