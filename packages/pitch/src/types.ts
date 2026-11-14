// Public types of @oak/pitch.
import type {
  Degree,
  Diagnostic,
  Dimension,
  DimScore,
  KeySpec,
  MeterId,
  Rat,
  SingMode,
  SingTolCents,
  SwingSpec,
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
  /**
   * Largest |sample| in the window (Wave 3, optional): 1 is full scale, so a take that keeps reaching it is
   * clipped (`takeQuality().clipped`). Older frames without it fall back to the RMS.
   */
  peak?: number;
  /**
   * Wave 4 (contracts §8.6, `bleed.ts`): what Oak's own output was playing while this frame was heard — the
   * clear pitches (fractional MIDI) the master bus had over the last `PLAYBACK_LAG_SEC`, newest first; `[]`
   * while the output was silent or unpitched. Added on the main thread by the mic session that listens to the
   * output too (`@oak/audio` `MicGraphOptions.playback`); absent when nothing listened (tests, older hosts).
   */
  playing?: readonly number[];
}

export interface DetectorOptions {
  windowSize?: number;
  /** RMS gate in dBFS, amplitude convention (20·log10). Default −45. Never use pitchy's `minVolumeDecibels` (power convention). */
  minVolumeDb?: number;
  /** Reject estimates whose period does not fit this many times in the window (default 2): pure noise passes the clarity gate otherwise. */
  minPeriods?: number;
  /**
   * Move an estimate down an octave when the half-period trap is detected (a weak fundamental; see
   * `detector.ts`). Default true.
   */
  octaveCheck?: boolean;
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
  /**
   * … where the pitch compared is the mean of the last this many frames (default 12, about 130 ms): a vibrato
   * averages out over it, a held new pitch does not.
   */
  splitWindow?: number;
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
  /**
   * Wave 5 (U11, blue notes): the target is a blue note (♭3, ♭5 or ♭7 in a blues line). A pitch sung between it
   * and its neighbouring semitone in `toward` (+1: up, a blue third between ♭3 and 3; −1: down; 0: either side) is
   * judged against the nearer of the two, within the normal tolerance, and the note says so (`sing.blue-note`).
   * `markBlueNotes` sets it from a key.
   */
  blue?: { toward: 1 | -1 | 0 };
  /**
   * Wave 6 (U14 colour tones, U15 chromatic degrees): notes a half step from the target that a learner is likely
   * to sing in its place: the key's own note beside a chromatic degree (fa for fi), or the plain scale's note that
   * a mode changes (the minor ♭6 for Dorian's 6). A pitch that lies nearer to one of them than to the target, and
   * outside the tolerance, is that other note: no credit, and the note says which one it was
   * (`SungNoteResult.neighbour`, `sing.neighbour` / `sing.plain-scale`). Inside the tolerance the §8.1 credit
   * stands. `chromaticTargets` and `modalTargets` set it.
   */
  neighbours?: readonly SungNeighbour[];
}
/** A likely slip beside a target (`SungTarget.neighbours`). Its octave does not matter: it is compared folded. */
export interface SungNeighbour {
  midi: number;
  /** `diatonic`: the key's own note a half step away; `parallel`: the plain major or minor scale's note. */
  kind: "diatonic" | "parallel";
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
  /**
   * Wave 5: a blue target sung toward its neighbour, judged against that neighbour (`SungTarget.blue`): the
   * neighbour's MIDI and the error the credit used. `cents` stays the error against the target itself.
   */
  blue?: { neighbourMidi: number; judgedCents: number };
  /**
   * Wave 6: the sung pitch lay nearer to one of the target's `neighbours` than to the target: that neighbour (in
   * the octave of the target), its kind, and the error against it in cents. With `credited` the pitch was still
   * inside the tolerance (credit 1, an info line); otherwise it earned nothing and reads as the neighbour.
   */
  neighbour?: { midi: number; kind: SungNeighbour["kind"]; cents: number; credited: boolean };
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
  /**
   * Timed modes: how late (positive) or early the whole take was against the targets, seconds. The pitch
   * windows follow it, so a late start keeps the credit of every note sung in tune; timing credit and
   * `onsetErrorMs` are still measured from the beat. 0 in free modes and when no shift explains the take better.
   */
  startShiftSec?: number;
  /**
   * Wave 3: the take as a whole (`takeQuality`): why nothing could be graded (no voice, too noisy, only
   * blips) and whether the input clipped. Absent on live (incremental) results.
   */
  take?: import("./take.ts").TakeQuality;
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
  /**
   * Wave 5: chromatic degrees (relative to major, as Oak labels them: "6", "7", "b3", "b7") that are kept as
   * chromatic steps even when snapping. Default: the raised 6 and 7 in a natural-minor key (`["6", "7"]`, la and ti,
   * written "5#" and "6#"), the raised 6 in harmonic minor, nothing otherwise. Blues drafts in a major key pass
   * `["b3", "b5", "b7"]`.
   */
  keepDegrees?: readonly Degree[];
  /**
   * Wave 5: the project swings (contracts §6.10). Onsets and ends on the swung subdivision are straightened before
   * they are quantised (an off-beat sung at 2/3 of the beat lands on the straight off-beat), and the draft line
   * gets `.swingBy(amount, …)` so it plays back swung. Ignored in compound meters (they never swing).
   */
  swing?: SwingSpec;
  /** Track label. Default "mel". */
  label?: string;
  /** Adds `.s("…")` when given. */
  sound?: string;
  /**
   * Wave 6 (U13): rhythm the project's grid allows beyond plain slots. Given, the bars are written beat by beat
   * (`[0 [1 2] 3 4]`), and a note held across a bar line stays inside the bar sequence as a bracket over the tied
   * bars (`<[0 1 2@3 3 4@2]@2 [4 3 2 1]>`), the form U13.L03 teaches, instead of one long `.slow(bars)` line.
   * - `weights`: dotted and other long values are written with `@` (`[1@3 0 0@4]`: a dotted quarter, an eighth,
   *   a half) rather than with `_` cells.
   * - `triplets`: a beat whose onsets sit on thirds is drafted as a triplet (`[0 1 2]`), in simple meters; the
   *   duple grid (`slotsPerBar`) must divide the beat evenly. Every other beat stays on the duple grid.
   */
  rhythm?: { weights?: boolean; triplets?: boolean };
  /**
   * Wave 6 (U17): the piece changes key. The key in force from each bar (0-based bars of the WHOLE piece; a
   * `KeyPlan` span of @oak/theory fits). The draft follows it: every note is read in the key of its own bar, the
   * degrees are that key's, and the line's `.scale()` is the patterned form over the draft's bars
   * (`.scale("<C4:major!2 D4:major!2>")`, contracts §6.8). `key` is used for bars before the first span.
   * A later tonic is written nearest the first key's tonic (C4 → D4, C4 → B♭3), or an octave from there when that
   * octave holds more of the notes sung in its bars (C4 → G4 for a tune above G4), unless a span names its own
   * `octave` and `tonicOctave` is not given.
   */
  keyPlan?: readonly HumKeySpan[];
  /** 0-based bar of the piece on which the draft's first bar sits (default 0): where `keyPlan` is read from. */
  firstBar?: number;
}
/** One span of a key plan as `humToDraft` reads it (`KeyPlanSpan` of @oak/theory is one). */
export interface HumKeySpan {
  key: KeySpec;
  fromBar: number;
  octave?: number | null;
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
  /**
   * Wave 4: the scale degree the step plays, 1-based as Oak teaches it ("5", "b3", "#4"; `labelPitch` of
   * @oak/theory in the draft's key), and its octave from the scale's tonic (0: from the tonic up to the 7th,
   * 1: the tonic an octave up and above, −1: below the tonic). `n()` writes `degree − 1` (`step`).
   */
  degree: Degree;
  octave: number;
  /**
   * Wave 5 (c7): the note is held across a bar line. `dur` then runs past the end of its bar (a fraction of a
   * bar, so it can exceed `1 − onset`), and the line is written as one sequence over every bar (`.slow(bars)`),
   * where a `_` continues the note into the next bar. Never a rest on the next beat 1.
   */
  tied?: true;
  /** Wave 6: with a key plan, the key this note was read in (the key of its bar). Absent without a plan. */
  key?: KeySpec;
  /** Wave 6 (`rhythm.triplets`): the note sits in a beat drafted as a triplet. */
  triplet?: true;
}
export type HumDraftWarning =
  | { code: "empty" }
  | { code: "chromatic-snapped"; source: number; sungMidi: number; midi: number }
  | { code: "collision-dropped"; source: number }
  /** No longer produced (Wave 5, c7): a note across a bar line is tied (`HumDraftNote.tied`), never cut. */
  | { code: "tie-truncated"; source: number; bar: number }
  | { code: "truncated"; bars: number }
  | { code: "before-downbeat"; source: number }
  /** Wave 5: the project declares swing in a compound meter, which never swings; the draft is straight. */
  | { code: "swing-ignored" };
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
  /** `G4:major`; with a key change inside the draft, the patterned form `<C4:major!2 D4:major!2>`. */
  scale: string;
  bars: number;
  /**
   * Wave 5: how the line is written. `bars`: one `<…>` step per bar (no note crosses a bar line); `tied`: a note
   * is held across a bar line (c7): one sequence over every bar with `.slow(bars)`, or, with `rhythm` (Wave 6), a
   * bracket over the tied bars inside the bar sequence (`[…]@2`).
   */
  layout: "bars" | "tied";
  /**
   * Wave 6: the keys of the draft's bars when a key plan was given (draft bars, 0-based, in order; one entry when
   * the draft stays in one key), else `null`.
   */
  keyPlan: { key: KeySpec; scale: string; fromBar: number; bars: number }[] | null;
  /** Wave 5: the swing the line was straightened by and plays back with (`.swingBy`), or `null`. */
  swing: SwingSpec | null;
  notes: HumDraftNote[];
  /** Constant tuning offset removed before choosing steps, in cents (positive = the learner sang sharp). */
  tuningCents: number;
  /** Whole octaves the line was moved by (`tonicOctave`). */
  octaveShift: number;
  warnings: HumDraftWarning[];
}
