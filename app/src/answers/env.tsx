// What some answer widgets need beyond `AnswerWidgetProps` (which stays the one contract for every kind): the
// learner's calibration for taps and singing, the music a click question points into, the notes to sing, the
// take's timing. A host wraps the widget in `<AnswerEnvProvider value={…}>`; every field is optional and a
// widget that lacks what it needs says so in words instead of showing a dead control.
import type { Choice, LearnerProfile, SingMode, SingTolerance } from "@oak/content-kit";
import type { SungResult } from "@oak/pitch";
import { createContext, type ReactNode, useContext } from "react";
import type { WorkbenchModel } from "../workbench/model.ts";
import type { SingNote } from "./sing.ts";

/** Sound for the widgets: the app's one adapter by default (`app/src/lib/oak.ts`). */
export interface AnswerAudio {
  /** The shared AudioContext (created on the first gesture). */
  context(): Promise<AudioContext>;
  /** One note or a chord now: piano keys, degree pads. */
  playNote(midi: number | readonly number[], o?: { sound?: string; dur?: number }): void;
  /** A metronome click at an AudioContext time (`accent` on the downbeat). */
  click(at: number, accent?: boolean): void;
}

/** A tap take (contracts §8.4, ux §4.4). Targets are drawn only after an attempt (feedback not idle). */
export interface TapEnv {
  bars: number;
  bpm: number;
  /** Default 4. */
  beatsPerBar?: number;
  /** Grid lines per beat on the pad: 2 = eighths, 4 = sixteenths (default 4). */
  stepsPerBeat?: number;
  /** Count-in bars before bar 1 (default 1). Ignored when `start` is given. */
  countInBars?: 0 | 1 | 2;
  /** F/J two-voice taps (kick/snare) instead of Space. */
  twoVoices?: boolean;
  /** Target onsets in bars from the take's start (shown after the attempt; `tapReport` grades against them). */
  targets?: readonly number[];
  /**
   * The host plays the stimulus and the count-in and resolves with the AudioContext time of bar 1. Without it
   * the widget plays a count-in click itself.
   */
  start?: () => Promise<number>;
  /** Showing a stored take (`value` holds its taps): the clock time of its bar 1. */
  startAt?: number;
  /** Every finished take, with the clock time of bar 1, so the host can grade it (`tapReport`). */
  onTake?: (take: TapTake) => void;
}

/** The take a host grades: tap times and the clock time of bar 1 (`tapReport(taps, targetSeconds(…))`). */
export interface TapTake {
  startAt: number;
  cps: number;
  taps: number[];
  voices: (0 | 1)[];
}

/** A finished sing take: the result of `gradeSung` (the same call the grader makes) and its start time. */
export interface SingTake {
  result: SungResult;
  startAt: number;
  frames: number;
}

/** A sing take (contracts §8.1, ux §4.3). */
export interface SingEnv {
  /** Notes relative to the take's start; the widget fits them into the learner's comfort range. */
  notes: readonly SingNote[];
  mode: SingMode;
  /** Default: the learner's rung, per-note folding (`DEFAULT_SING_TOL`). */
  tol?: SingTolerance;
  /** ux §4.3: the trace while singing, only afterwards, or never (default "live"). */
  showTrace?: "live" | "after" | "never";
  /** Seconds between pressing Sing and the first note's window (default 1). */
  leadIn?: number;
  /** Plays the reference (tonic, target) before the take; resolves when it has finished. */
  playCue?: () => Promise<void>;
  /** "Quiet mode": listen and self-check instead (contracts §8.5). */
  onQuietEvidence?: (evidence: QuietEvidence) => void;
  /** Plays the target notes for the Quiet-mode self-check. */
  playTarget?: () => void;
  /** Every finished take (the widget's value is its per-note summary). */
  onTake?: (take: SingTake) => void;
}

/** What a Quiet-mode self-check reports: no voice evidence, no penalty (contracts §8.5). */
export interface QuietEvidence {
  modality: "fallback";
  /** The learner's own report after hearing it in their head. */
  selfCheck: "heard-it" | "not-sure";
  at: number;
}

export interface AnswerEnv {
  profile?: LearnerProfile;
  /** Quiet mode for today, or no usable microphone. */
  quiet?: boolean;
  audio?: AnswerAudio;
  tap?: TapEnv;
  sing?: SingEnv;
  /** Hum-to-predict: how long the hum window lasts (default 2 bars at the given tempo, or 6 s). */
  hum?: { seconds?: number; play?: () => void };
  /** Rhythm grid playback tempo and meter. */
  grid?: { bpm?: number; beatsPerBar?: number };
  /** Click-code: the clean code the learner points into. */
  code?: string;
  /** Click-staff and click-roll: the analysed music (the workbench's `onModel`). */
  music?: WorkbenchModel | null;
  /**
   * Choice layouts `roll-thumbs` and `staff-thumbs`: draws a choice's thumbnail (a host with the analysed music
   * renders its mini roll or staff here). Without it the card shows the label and the audition only.
   */
  choiceThumb?: (choice: Choice) => ReactNode;
  /** Keyboard pick: the typing-row octave and the sound. */
  keyboard?: { octave?: number; sound?: string };
}

const EnvContext = createContext<AnswerEnv>({});

export function AnswerEnvProvider({ value, children }: { value: AnswerEnv; children: ReactNode }) {
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useAnswerEnv(): AnswerEnv {
  return useContext(EnvContext);
}

/** A neutral profile (comfortable range around A3–E4, uncalibrated) for hosts without one. */
export const NEUTRAL_PROFILE: LearnerProfile = {
  rangeLow: 48,
  rangeHigh: 72,
  comfLow: 52,
  comfHigh: 67,
  tapLatencyMs: 0,
  tapJitterMs: 10,
  singLatencyMs: 0,
  singTolCents: 70,
  singTolMode: "auto",
  noiseFloorDb: -60,
  outputKind: "unknown",
  inputKind: "builtin",
  quiet: false,
};

/** The app's adapter as `AnswerAudio`. Loaded lazily: Strudel is heavy and starts on a gesture. */
export const appAudio: AnswerAudio = {
  async context() {
    const { getOak } = await import("../lib/oak.ts");
    return (await getOak()).ctx;
  },
  playNote(midi, o = {}) {
    void import("../lib/oak.ts").then(async ({ getOak }) => {
      const oak = await getOak();
      const notes = typeof midi === "number" ? midi : [...midi];
      oak.playNote({ s: o.sound ?? "piano", note: notes, dur: o.dur ?? 0.6 });
    });
  },
  click(at, accent = false) {
    void import("../lib/oak.ts").then(async ({ getOak }) => {
      const oak = await getOak();
      oak.playEvents(
        {
          events: [{ at: 0, dur: 0.05, value: { s: "rim", gain: accent ? 0.9 : 0.55 } }],
          durationSec: 0.1,
          preload: ["rim"],
        },
        { at, exclusive: false },
      );
    });
  },
};
