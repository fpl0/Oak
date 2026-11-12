// The Wave 3 pitch gate: "≥ 95 % of voiced frames within ±25 cents, octave errors < 2 %", plus the two guards
// that keep the first number honest — silence, room noise and headphone bleed must not be reported as a voice,
// and the tracker must actually report most of the voice (rejecting everything hard would pass the accuracy
// line on its own). Scores the tracker's output (`PitchTracker.push`, what the PitchLane draws and the graders
// read) against the truth tracks of `corpus.ts`, frame by frame. Used by the Bun corpus test and by the voice
// e2e that runs the same clips through Chromium's fake microphone and the AudioWorklet.
import type { LearnerProfile } from "@oak/content-kit";
import { type CorpusClass, type CorpusClip, TRUTH_STEP } from "./corpus.ts";
import { PitchFrameAnalyzer } from "./detector.ts";
import { hzToMidi } from "./math.ts";
import { PitchTracker, TRACKER_DEFAULTS, trackerOptionsFor } from "./tracker.ts";
import type { DetectorOptions, PitchFrame, TrackedFrame } from "./types.ts";
import { WINDOW_SIZE } from "./types.ts";

export const GATE = {
  /** Share of the frames the tracker reports voiced (where there is a voice) within ±25 cents. */
  withinCents: 25,
  minWithin: 0.95,
  /** Share of those frames an octave (or more) off. */
  maxOctave: 0.02,
  /** Share of no-voice frames (silence, room noise, bleed, consonants) reported voiced. */
  maxFalseVoiced: 0.01,
  /** Share of voice frames reported voiced, overall and per class (clips marked `withheld` excluded). */
  minRecall: 0.85,
  minClassRecall: 0.7,
} as const;

/**
 * Clips whose voice sits below the contract's own voicing gate (RMS ≥ noise floor + 12 dB, contracts §8.1): at
 * 10 dB SNR the right answer is to withhold, so their recall is reported but not gated; anything they do
 * report voiced is still scored for accuracy.
 */
export function isWithheld(clip: Pick<CorpusClip, "id">): boolean {
  return /\/snr10(#|$)/.test(clip.id);
}

export type TruthState = "voiced" | "unvoiced" | "ignore";
export interface FrameTruth {
  state: TruthState;
  /** Mean fractional MIDI of the voice over the window (voiced only). */
  midi: number;
}

/**
 * What the window ending at `t` (a frame's `t`: the time just after its last sample) holds:
 *  - `unvoiced`: no voice anywhere in the window (consonant noise, breaths, bleed and room noise may be there);
 *  - `voiced`: a sustained voice (envelope ≥ 0.5) through the whole window, its pitch varying ≤ 2 semitones
 *    (a ±100-cent vibrato at 6 Hz sweeps about 1.2 semitones through one 43 ms window; the truth is its mean);
 *  - `ignore`: the window straddles an onset or a release, or a glide faster than 2 semitones per window.
 */
export function frameTruth(clip: CorpusClip, t: number, windowSize = WINDOW_SIZE): FrameTruth {
  const end = Math.round(t * clip.sampleRate);
  const start = end - windowSize;
  const a = Math.max(0, Math.floor(start / TRUTH_STEP));
  const b = Math.min(clip.f0.length - 1, Math.floor((end - 1) / TRUTH_STEP));
  if (start < 0 || b < a) return { state: "ignore", midi: Number.NaN };
  let any = false;
  let all = true;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;
  for (let s = a; s <= b; s++) {
    const e = clip.env[s] as number;
    const f = clip.f0[s] as number;
    if (e > 0 && f > 0) any = true;
    if (!(e >= 0.5 && f > 0)) {
      all = false;
      continue;
    }
    const m = hzToMidi(f);
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
    sum += m;
    count++;
  }
  if (!any) return { state: "unvoiced", midi: Number.NaN };
  if (all && count > 0 && hi - lo <= 2) return { state: "voiced", midi: sum / count };
  return { state: "ignore", midi: Number.NaN };
}

export interface GateCounts {
  /** Frames with a sustained voice. */
  voice: number;
  /** … that the tracker reported voiced. */
  reported: number;
  /** … within ±25 cents of the truth. */
  within: number;
  /** … about an octave (or more) off: |error| ≥ 600 cents and within 100 cents of a whole number of octaves. */
  octave: number;
  /** … more than 100 cents off and not an octave error. */
  gross: number;
  /** Frames with no voice at all, and those the tracker reported voiced. */
  silence: number;
  falseVoiced: number;
  /** Frames on onsets, releases and fast glides (not scored). */
  ignored: number;
  /** Absolute cents errors of the reported voice frames (for medians and the worst cases). */
  errors: number[];
}

export function emptyCounts(): GateCounts {
  return {
    voice: 0,
    reported: 0,
    within: 0,
    octave: 0,
    gross: 0,
    silence: 0,
    falseVoiced: 0,
    ignored: 0,
    errors: [],
  };
}

export function addCounts(into: GateCounts, c: GateCounts): GateCounts {
  into.voice += c.voice;
  into.reported += c.reported;
  into.within += c.within;
  into.octave += c.octave;
  into.gross += c.gross;
  into.silence += c.silence;
  into.falseVoiced += c.falseVoiced;
  into.ignored += c.ignored;
  for (const e of c.errors) into.errors.push(e);
  return into;
}

/** The tracker's options for a clip: the voicing gate a learner calibrated in that room would have. */
export function clipTrackerProfile(clip: CorpusClip): Pick<LearnerProfile, "rangeLow" | "noiseFloorDb"> {
  return { rangeLow: clip.profile.rangeLow, noiseFloorDb: clip.profile.noiseFloorDb };
}

/** Runs a clip through the exact worklet DSP path (128-sample render quanta). `t` starts at 0. */
export function analyzeClip(clip: CorpusClip, options: DetectorOptions = {}): PitchFrame[] {
  const a = new PitchFrameAnalyzer(clip.sampleRate, options);
  const frames: PitchFrame[] = [];
  const x = clip.samples;
  for (let i = 0; i + 128 <= x.length; i += 128) {
    for (const f of a.push(x.subarray(i, i + 128), i / clip.sampleRate)) frames.push(f);
  }
  return frames;
}

/**
 * Scores the tracker on a clip's frames. `offsetSec` maps frame times onto the clip's clock (the browser path:
 * the fake microphone starts the file at an unknown context time). The tracker's median of 5 reports a frame's
 * pitch two hops late (its group delay), so a voice frame is one whose window AND the window two frames earlier
 * hold a sustained voice, and its pitch is compared with the earlier window's; voicing is judged on the frame
 * itself. Frames that fail either test are `ignored` (onsets, releases, the first two frames of a note).
 */
export function scoreClip(
  clip: CorpusClip,
  frames: readonly PitchFrame[],
  opts: { offsetSec?: number; median?: number } = {},
): GateCounts {
  const offset = opts.offsetSec ?? 0;
  const tracker = new PitchTracker({
    ...trackerOptionsFor(clipTrackerProfile(clip)),
    windowSec: WINDOW_SIZE / clip.sampleRate,
  });
  const delay = Math.floor((opts.median ?? TRACKER_DEFAULTS.median) / 2);
  const truths: FrameTruth[] = [];
  const c = emptyCounts();
  for (const frame of frames) {
    const out: TrackedFrame = tracker.push(frame);
    const truth = frameTruth(clip, frame.t - offset);
    truths.push(truth);
    if (truth.state === "ignore") {
      c.ignored++;
      continue;
    }
    if (truth.state === "unvoiced") {
      c.silence++;
      if (out.voiced) c.falseVoiced++;
      continue;
    }
    const earlier = truths[truths.length - 1 - delay];
    if (earlier?.state !== "voiced") {
      c.ignored++;
      continue;
    }
    c.voice++;
    if (!out.voiced || out.midi === null) continue;
    c.reported++;
    const err = (out.midi - (earlier as FrameTruth).midi) * 100;
    const abs = Math.abs(err);
    c.errors.push(abs);
    if (abs <= GATE.withinCents) c.within++;
    else if (abs >= 600 && Math.abs(abs - 1200 * Math.round(abs / 1200)) <= 100) c.octave++;
    else if (abs > 100) c.gross++;
  }
  return c;
}

export interface GateRow {
  label: string;
  clips: number;
  voice: number;
  recall: number;
  within: number;
  octave: number;
  gross: number;
  falseVoiced: number;
  silence: number;
  medianCents: number;
  p95Cents: number;
}

function q(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}

export function rowOf(label: string, clips: number, c: GateCounts): GateRow {
  const sorted = [...c.errors].sort((a, b) => a - b);
  return {
    label,
    clips,
    voice: c.voice,
    recall: c.voice > 0 ? c.reported / c.voice : Number.NaN,
    within: c.reported > 0 ? c.within / c.reported : Number.NaN,
    octave: c.reported > 0 ? c.octave / c.reported : Number.NaN,
    gross: c.reported > 0 ? c.gross / c.reported : Number.NaN,
    falseVoiced: c.silence > 0 ? c.falseVoiced / c.silence : Number.NaN,
    silence: c.silence,
    medianCents: q(sorted, 0.5),
    p95Cents: q(sorted, 0.95),
  };
}

export interface GateReport {
  rows: GateRow[];
  overall: GateRow;
  /** Recall over the clips that are not `withheld`. */
  recallGated: number;
  failures: string[];
}

/** Aggregates per-clip counts into the per-class table and checks every line of `GATE`. */
export function gateReport(results: readonly { clip: CorpusClip; counts: GateCounts }[]): GateReport {
  const byClass = new Map<CorpusClass, { clips: number; c: GateCounts; gated: GateCounts }>();
  const all = emptyCounts();
  const gatedAll = emptyCounts();
  for (const { clip, counts } of results) {
    const e = byClass.get(clip.cls) ?? { clips: 0, c: emptyCounts(), gated: emptyCounts() };
    e.clips++;
    addCounts(e.c, counts);
    addCounts(all, counts);
    if (!isWithheld(clip)) {
      addCounts(e.gated, counts);
      addCounts(gatedAll, counts);
    }
    byClass.set(clip.cls, e);
  }
  const rows: GateRow[] = [];
  const failures: string[] = [];
  const pct = (x: number) => `${(100 * x).toFixed(2)} %`;
  for (const [cls, e] of byClass) {
    const row = rowOf(cls, e.clips, e.c);
    rows.push(row);
    if (row.voice > 0 && row.within < GATE.minWithin) failures.push(`${cls}: within ±25¢ ${pct(row.within)}`);
    if (row.voice > 0 && row.octave >= GATE.maxOctave)
      failures.push(`${cls}: octave errors ${pct(row.octave)}`);
    if (row.silence > 0 && row.falseVoiced > GATE.maxFalseVoiced)
      failures.push(`${cls}: false voiced ${pct(row.falseVoiced)}`);
    const gatedRecall = e.gated.voice > 0 ? e.gated.reported / e.gated.voice : Number.NaN;
    if (e.gated.voice > 0 && gatedRecall < GATE.minClassRecall)
      failures.push(`${cls}: recall ${pct(gatedRecall)}`);
  }
  const overall = rowOf("overall", results.length, all);
  const recallGated = gatedAll.voice > 0 ? gatedAll.reported / gatedAll.voice : Number.NaN;
  if (overall.within < GATE.minWithin) failures.push(`overall: within ±25¢ ${pct(overall.within)}`);
  if (overall.octave >= GATE.maxOctave) failures.push(`overall: octave errors ${pct(overall.octave)}`);
  if (overall.falseVoiced > GATE.maxFalseVoiced)
    failures.push(`overall: false voiced ${pct(overall.falseVoiced)}`);
  if (recallGated < GATE.minRecall) failures.push(`overall: recall ${pct(recallGated)}`);
  return { rows, overall, recallGated, failures };
}

/** The report as a fixed-width table (the test prints it). */
export function formatGateTable(r: GateReport): string {
  const head = [
    "class",
    "clips",
    "voice fr",
    "recall",
    "±25¢",
    "octave",
    "gross",
    "false voiced",
    "median¢",
    "p95¢",
  ];
  const fmt = (x: number) => (Number.isNaN(x) ? "—" : `${(100 * x).toFixed(1)}%`);
  const line = (row: GateRow) => [
    row.label,
    String(row.clips),
    String(row.voice),
    fmt(row.recall),
    fmt(row.within),
    fmt(row.octave),
    fmt(row.gross),
    `${fmt(row.falseVoiced)} of ${row.silence}`,
    Number.isNaN(row.medianCents) ? "—" : row.medianCents.toFixed(1),
    Number.isNaN(row.p95Cents) ? "—" : row.p95Cents.toFixed(1),
  ];
  const rows = [head, ...r.rows.map(line), line(r.overall)];
  const widths = head.map((_, i) => Math.max(...rows.map((cells) => (cells[i] as string).length)));
  const text = rows.map((cells) => cells.map((cell, i) => cell.padEnd(widths[i] as number)).join("  "));
  text.splice(1, 0, widths.map((w) => "-".repeat(w)).join("  "));
  text.splice(text.length - 1, 0, widths.map((w) => "-".repeat(w)).join("  "));
  text.push(`recall without the withheld 10 dB SNR clips: ${fmt(r.recallGated)}`);
  return text.join("\n");
}
