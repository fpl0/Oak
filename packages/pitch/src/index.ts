// @oak/pitch: pitch detection, tracking and the ONE rule for a sung note and for a tap (contracts §8).
// Pure and isomorphic: the worklet in @oak/audio feeds it frames; graders run on the main thread.
// Promote spikes/s5-pitch/src/pitch.ts and fix its recorded gotchas.
import type { LearnerProfile, SingMode, SingTolCents, SingTolerance, TapTolerance } from "@oak/content-kit";
import type {
  Detector,
  DetectorOptions,
  PitchFrame,
  SingDayStat,
  SungNote,
  SungResult,
  SungTarget,
  TapResult,
  TrackedFrame,
  TrackerOptions,
} from "./types.ts";

export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/pitch: ${name} is not implemented yet`);
}

// --- detection (also runs inside the AudioWorklet: no `self`, no `performance`, no `process`) -----

/** pitchy McLeod detector with the amplitude-convention gate and the noise guard. */
export function createDetector(options?: DetectorOptions): Detector {
  return todo(`createDetector(${options?.windowSize})`);
}
/**
 * The worklet's ring buffer: push render quanta, get a frame every `HOP_SIZE` samples. Skips analysis and
 * resets its ring when a quantum is empty, so a reconnect never analyses stale audio. Warm it up in the
 * processor constructor (the first `findPitch` costs 4 to 6 ms).
 */
export class PitchFrameAnalyzer {
  constructor(sampleRate: number, options?: DetectorOptions & { hopSize?: number; warmUp?: number }) {
    todo(`PitchFrameAnalyzer(${sampleRate}, ${options?.hopSize})`);
  }
  /** `time` is the context time of the first sample of `block`. Returns the frames completed by this block. */
  push(block: Float32Array, time: number): PitchFrame[] {
    return todo(`push(${block.length}, ${time})`);
  }
  reset(): void {
    todo("reset");
  }
}

export function hzToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
/** Signed cents from `targetMidi` to `midi`, folded into (−600, 600] when `fold` is set. */
export function centsFrom(midi: number, targetMidi: number, fold = false): number {
  const cents = (midi - targetMidi) * 100;
  if (!fold) return cents;
  const folded = ((((cents + 600) % 1200) + 1200) % 1200) - 600;
  return folded === -600 ? 600 : folded;
}
export function rmsDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
}

// --- tracking and segmentation ------------------------------------------------------------------

/** Voicing gate, median of 5, octave-error repair (an 11 to 13 semitone jump that returns within 4 frames is folded back). */
export class PitchTracker {
  constructor(options?: TrackerOptions) {
    todo(`PitchTracker(${options?.median})`);
  }
  push(frame: PitchFrame): TrackedFrame {
    return todo(`push(${frame.t})`);
  }
  /** Notes closed so far. */
  notes(): SungNote[] {
    return todo("notes");
  }
  /** Closes the open note. Call when the take ends. */
  flush(): SungNote[] {
    return todo("flush");
  }
  reset(): void {
    todo("reset");
  }
}
export function pitchFramesToNotes(frames: readonly PitchFrame[], options?: TrackerOptions): SungNote[] {
  return todo(`pitchFramesToNotes(${frames.length}, ${options?.minNoteSec})`);
}

// --- the one sung-note rule (contracts §8.1) ----------------------------------------------------

/**
 * Timed modes (`pitch`, `degree`, `sight`): each target window is `[on + min(80 ms, 0.25·dur), off − 0.1·dur]`
 * after latency compensation; the estimate is the median of voiced frames in it. Free modes (`echo`,
 * `resolution`, `bassline`): segment, then Needleman–Wunsch on folded pitch. Per-note credit: coverage
 * below `minCoverage` → 0; |e| ≤ T → 1; ≤ min(2T, 100) → 0.5; else 0. Pass: mean pitch credit ≥ 0.8 and at
 * most 1 missed note. Targets must already be transposed into the learner's comfort range.
 */
export function gradeSung(
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
): SungResult {
  return todo(
    `gradeSung(${frames.length}, ${targets.length}, ${tol.cents}, ${mode}, ${profile.singTolCents})`,
  );
}
/** The incremental form: the same per-note credit for the frames received so far. Drives the live PitchLane. */
export function gradeSungLive(
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
  now: number,
): SungResult {
  return todo(
    `gradeSungLive(${frames.length}, ${targets.length}, ${tol.cents}, ${mode}, ${profile.singTolCents}, ${now})`,
  );
}
/** The first sing of U00.L02: any sustained pitch (coverage ≥ 0.4 for 600 ms) within ±100¢ after per-note folding. */
export function firstSingPasses(
  frames: readonly PitchFrame[],
  tonicMidi: number,
  profile: LearnerProfile,
): boolean {
  return todo(`firstSingPasses(${frames.length}, ${tonicMidi}, ${profile.noiseFloorDb})`);
}
/** Octave shift (multiple of 12) that puts `midis` inside the learner's comfort range. */
export function fitToRange(
  midis: readonly number[],
  profile: Pick<LearnerProfile, "comfLow" | "comfHigh" | "rangeLow" | "rangeHigh">,
): number {
  return todo(`fitToRange(${midis.length}, ${profile.comfLow})`);
}
/**
 * The tolerance ladder 70 → 50 → 35 → 25 (contracts §8.2): tightens after 3 distinct days within 21, each
 * with ≥ 8 graded sung notes, whose median |e| is ≤ 35¢ / 25¢ / 20¢. Never while a checkpoint is pending,
 * never in `fixed` mode, never loosens.
 */
export function nextSingTolerance(
  current: SingTolCents,
  days: readonly SingDayStat[],
  opts: { today: string; checkpointPending: boolean; mode: "auto" | "fixed" },
): SingTolCents {
  return todo(`nextSingTolerance(${current}, ${days.length}, ${opts.today})`);
}
/** Voiced frames within 30¢ of the playing note for more than 300 ms in playback-only spans: the mic hears the speakers. */
export function detectBleed(frames: readonly PitchFrame[], playing: readonly SungTarget[]): boolean {
  return todo(`detectBleed(${frames.length}, ${playing.length})`);
}
export function calibrateRange(frames: readonly PitchFrame[]): {
  low: number;
  high: number;
  comfLow: number;
  comfHigh: number;
} {
  return todo(`calibrateRange(${frames.length})`);
}

// --- tapping (contracts §8.4) -------------------------------------------------------------------

/**
 * `w = max(floor, clamp(0.25 × minIOI, 50, 120) × levelFactor)`; `levelFactor` runs from 1.0 at the
 * family's first level to 0.6 at its top level; `floor` is 50 ms (70 on Bluetooth output; 80 when the
 * calibration jitter exceeds 25 ms).
 */
export function tapWindowMs(
  minIoiMs: number,
  level: number,
  levels: number,
  profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs">,
): number {
  return todo(`tapWindowMs(${minIoiMs}, ${level}, ${levels}, ${profile.outputKind})`);
}
/**
 * `taps` and `targets` in seconds on the same clock, taps already minus `tapLatencyMs`. Coarse offset,
 * monotone DP alignment, `F1 = 2M / (|T| + |A|)`, `timing = mean(1 − |e| / w)`. Score = 0.7·F1 + 0.3·timing.
 * Pass: F1 ≥ 0.9 and timing ≥ 0.5.
 */
export function gradeTaps(
  taps: readonly number[],
  targets: readonly number[],
  tol: TapTolerance,
  profile: LearnerProfile,
  opts?: { level?: number; levels?: number },
): TapResult {
  return todo(
    `gradeTaps(${taps.length}, ${targets.length}, ${tol.windowMs}, ${profile.tapLatencyMs}, ${opts?.level})`,
  );
}
/** Median and MAD of (tap − click) over the calibration clicks. */
export function calibrateTapLatency(
  taps: readonly number[],
  clicks: readonly number[],
): { latencyMs: number; jitterMs: number } {
  return todo(`calibrateTapLatency(${taps.length}, ${clicks.length})`);
}
