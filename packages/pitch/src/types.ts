// Public types of @oak/pitch.
import type {
  Diagnostic,
  Dimension,
  DimScore,
  KeySpec,
  MeterId,
  Rat,
  SingMode,
  SingTolCents,
} from "@oak/content-kit";

/** Analysis geometry shared by the worklet and the graders. */
export const WINDOW_SIZE = 2048;
export const HOP_SIZE = 512;

/** One analysis frame as the worklet posts it. */
export interface PitchFrame {
  /**
   * AudioContext time (s) of the LAST sample of the analysis window. The window centre is
   * `t − WINDOW_SIZE / 2 / sampleRate`: grade onsets against that, plus the calibrated latency (spike S5).
   */
  t: number;
  /** Detected fundamental; 0 when the detector bails out. */
  hz: number;
  /** MPM clarity, 0 to 1. */
  clarity: number;
  /** Linear RMS of the window (0 to 1 for full-scale audio). */
  rms: number;
}

export interface DetectorOptions {
  windowSize?: number;
  /** RMS gate in dBFS, amplitude convention (20·log10). Default −45. Never use pitchy's `minVolumeDecibels` (power convention). */
  minVolumeDb?: number;
  /** Reject estimates whose period does not fit this many times in the window (default 2): pure noise passes the clarity gate otherwise. */
  minPeriods?: number;
}
export interface Detector {
  readonly windowSize: number;
  detect(buf: ArrayLike<number>, sampleRate: number): { hz: number; clarity: number };
}

export interface TrackerOptions {
  /** 0.90; 0.85 with a low-voice profile. */
  clarityMin?: number;
  /** max(−45 dBFS, noise floor + 12 dB). */
  rmsMinDb?: number;
  /** Median window, in frames. Default 5. */
  median?: number;
  a4?: number;
  minHz?: number;
  maxHz?: number;
  /** A new note starts when the smoothed pitch deviates more than this from the segment median … */
  splitCents?: number;
  /** … for at least this many voiced frames. */
  splitFrames?: number;
  /** Unvoiced frames that close a note. */
  gapFrames?: number;
  minNoteSec?: number;
  /**
   * Length of the analysis window in seconds (default `WINDOW_SIZE / 48000`). Note starts and ends are
   * reported at the window centre, `frame.t − windowSec / 2`, which is where the estimate belongs.
   */
  windowSec?: number;
  /** An 11 to 13 semitone jump that returns within this many frames is folded back. Default 4; 0 turns the repair off. */
  octaveRepairFrames?: number;
  /**
   * Re-articulation: a level dip of this many dB below the note's own level, followed by a recovery, starts
   * a new note on the same pitch ("da da da"). Default 8; 0 turns it off.
   */
  dipDb?: number;
}
export interface TrackedFrame {
  t: number;
  voiced: boolean;
  hz: number;
  /** Median-smoothed fractional MIDI after octave-error repair; `null` when unvoiced. */
  midi: number | null;
}
/** One sung note found by segmentation. */
export interface SungNote {
  start: number;
  end: number;
  /** Median fractional MIDI over the note. */
  midi: number;
  /** Spread of the frames around the median, in cents (for `sing.unstable`). */
  centsSpread: number;
  frames: number;
}

export interface SungTarget {
  midi: number;
  /** AudioContext seconds. Timed modes only use them as windows; free modes align by order. */
  on: number;
  off: number;
}
export interface SungNoteResult {
  index: number;
  targetMidi: number;
  /** After octave folding and drift compensation; `null` when the note was missed. */
  sungMidi: number | null;
  /** Signed error in cents. */
  cents: number | null;
  /** Voiced share of the target window. */
  coverage: number;
  /** 1, 0.5 or 0 (contracts §8.1 rule 5). */
  credit: number;
  timingCredit: number | null;
  onsetErrorMs: number | null;
  octaveShift: number;
  feedback: "sing.missed" | "sing.sharp" | "sing.flat" | "sing.wrong-note" | "sing.octave-jump" | null;
}
/** What `gradeSung` and `gradeSungLive` return: the PitchLane fill, the per-note tick and the grade all read it. */
export interface SungResult {
  score: number;
  pass: boolean;
  dims: Partial<Record<Dimension, DimScore>>;
  diagnostics: Diagnostic[];
  notes: SungNoteResult[];
  /** Median error over notes within 100¢, removed when within `driftCompCents`; reported above 15¢. */
  driftCents: number;
  /** Median |error| of the graded notes: feeds the tolerance ladder. */
  medianAbsCents: number | null;
  mode: SingMode;
  /** Tolerance actually applied. */
  tolCents: SingTolCents;
}

export interface TapResult {
  score: number;
  pass: boolean;
  dims: Partial<Record<Dimension, DimScore>>;
  diagnostics: Diagnostic[];
  /** [target index, tap index] pairs. */
  pairs: [number, number][];
  missed: number[];
  extra: number[];
  f1: number;
  timing: number;
  /** Constant offset in ms (positive = late); forgiven at levels 1 and 2. */
  offsetMs: number;
  /** Window actually used, ms. */
  windowMs: number;
  /** `tempo: 'free'` only: the learner's tempo over the target tempo (1.1 = 10 % faster). */
  tempoRatio?: number;
}

/** One day's sung-note statistics, for the tolerance ladder. */
export interface SingDayStat {
  day: string;
  gradedNotes: number;
  medianAbsCents: number;
}

// --- tolerance ladder (contracts §8.2) ----------------------------------------------------------

/** Why the ladder did not move, for the Settings → Voice card. */
export type LadderBlock = "fixed-mode" | "checkpoint-pending" | "at-finest" | "not-enough-days";
export interface LadderProgress {
  current: SingTolCents;
  /** What `nextSingTolerance` returns. */
  next: SingTolCents;
  /** The value one step finer, or `null` at 25. */
  target: SingTolCents | null;
  /** A day qualifies when its median |e| is at most this, with at least `minNotes` graded notes. */
  thresholdCents: number | null;
  /** Qualifying days inside the window, oldest first. */
  qualifyingDays: string[];
  daysNeeded: number;
  blockedBy: LadderBlock | null;
}

// --- vocal range (contracts §8.6) ---------------------------------------------------------------

export interface RangeEstimate {
  low: number;
  high: number;
  comfLow: number;
  comfHigh: number;
  /** Seconds of voiced frames the estimate rests on. */
  voicedSec: number;
}

// --- "hum it, Oak drafts it" (contracts §6.12) --------------------------------------------------

export interface HumDraftOptions {
  key: KeySpec;
  /** Beats per minute in the meter's tempo unit. */
  bpm: number;
  /** Default "4/4". */
  meter?: MeterId;
  /**
   * Time of a bar line on the clock of the notes (AudioContext seconds). Default: the first note's start,
   * so the draft begins on a downbeat.
   */
  downbeat?: number;
  /** Subtracted from every note time before quantizing (the profile's `singLatencyMs`). Default 0. */
  latencyMs?: number;
  /** Finest grid, in slots per bar. Default: eighth notes (8 in 4/4, 6 in 3/4 and 6/8). */
  slotsPerBar?: number;
  /** The draft is cut after this many bars. Default 8. */
  maxBars?: number;
  /**
   * Octave of the scale tonic (`"G4:major"` is 4). When given, the sung line is moved by whole octaves so
   * that it sits on that tonic (a bass line hummed two octaves up, drafted at octave 2). Default: the
   * octave the learner sang in.
   */
  tonicOctave?: number;
  /** A pitch between two scale tones: "snap" to the nearer scale tone (default) or "keep" it as a chromatic step (`3#`). */
  chromatic?: "snap" | "keep";
  /** Track label. Default "mel". */
  label?: string;
  /** Adds `.s("…")` when given. */
  sound?: string;
}
export interface HumDraftNote {
  /** Index into the sung notes. */
  source: number;
  /** 0-based bar. */
  bar: number;
  /** Onset and length inside the bar, as fractions of the bar. */
  onset: Rat;
  dur: Rat;
  /** The Strudel step as written: "0", "-1", "3#". */
  step: string;
  /** MIDI the step plays. */
  midi: number;
  /** Where the learner's pitch was, relative to `midi`, in cents (after the octave move and tuning offset). */
  cents: number;
}
export type HumDraftWarning =
  | { code: "empty" }
  | { code: "chromatic-snapped"; source: number; sungMidi: number; midi: number }
  | { code: "collision-dropped"; source: number }
  | { code: "tie-truncated"; source: number; bar: number }
  | { code: "truncated"; bars: number }
  | { code: "before-downbeat"; source: number };
/** A machine-made draft: it gives no evidence until the learner's corrected version is checked. */
export interface HumDraft {
  machineMade: true;
  /** `setcpm(96/4)`. */
  tempoLine: string;
  /** `mel: n("<[0 _ 2 4] [4 2 0 ~]>").scale("G4:major")`. */
  line: string;
  /** The tempo line, a blank line and the track line. */
  code: string;
  /** The mini-notation inside `n("…")`. */
  pattern: string;
  /** `G4:major`. */
  scale: string;
  bars: number;
  notes: HumDraftNote[];
  /** Constant tuning offset removed before choosing steps, in cents (positive = the learner sang sharp). */
  tuningCents: number;
  /** Whole octaves the line was moved by (`tonicOctave`). */
  octaveShift: number;
  warnings: HumDraftWarning[];
}
