// Public types of @oak/drills: the runtime form of a drill family, trials in flight, and the AudioPlan
// that @oak/strudel plays. The data-only definitions (`FamilyDef`, `LevelParams`, `Trial`, `TrialResult`,
// `FactDeck`) are content schema and live in @oak/content-kit.
import type {
  Answer,
  Cue,
  Diagnostic,
  FactCardDef,
  FactDeck,
  FamilyDef,
  FamilyId,
  LearnerProfile,
  LevelParams,
  Md,
  NEvent,
  SkillRef,
  Trial,
  TrialResult,
} from "@oak/content-kit";
import type { PitchFrame } from "@oak/pitch";

/** Seeded generator: `mulberry32(hash(familyId, setId, trialIndex))`. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  shuffle<T>(items: readonly T[]): T[];
  readonly seed: number;
}

export interface TrialResponse {
  answer?: Answer;
  /** Seconds on the AudioContext clock, minus the calibrated tap latency. */
  taps?: number[];
  frames?: PitchFrame[];
  rtMs: number;
  replays: number;
  /** `Shift+S`: logged, no evidence, no penalty. */
  skipped?: boolean;
}

/**
 * A drill family that can run: its definition plus the generator and the grader. Registered once in
 * the registry; the planner, the DrillRunner, checkpoints and lesson `generator` stimuli all go through it.
 */
export interface DrillFamilyRuntime<L extends LevelParams = LevelParams, E = Answer> {
  def: FamilyDef<L>;
  /**
   * One fresh trial: new key, register and instrument each time (randomization codes K R I V T G D C).
   * `events` are authoritative; `code` uses only early functions and must evaluate to the same events
   * (a CI property test checks it). Sung targets sit inside the learner's comfort range.
   */
  generate(
    rng: Rng,
    level: L,
    levelNo: number,
    profile: LearnerProfile,
    opts: {
      category?: string;
      openCategories: readonly string[];
      previous?: Trial<E>;
      /** The key mode the caller needs (a lesson step in a minor key, d8); see `GenCtx.mode`. */
      mode?: "major" | "minor";
    },
  ): Trial<E>;
  grade(trial: Trial<E>, response: TrialResponse, profile: LearnerProfile): TrialResult;
  /** Labelled examples for the listen block that opens a blocked introduction. */
  exposure?(rng: Rng, level: L): { code: string; caption: Md; bars: number }[];
  categorySkill?(category: string): SkillRef;
}

export interface FactDeckRuntime {
  def: FactDeck;
  grade(card: FactCardDef, answer: Answer, rtMs: number): TrialResult;
}

/** One planned trial of a set, before generation. */
export interface TrialSpec {
  index: number;
  family: FamilyId;
  /** 75% of trials at the card's level, 25% one level down. */
  level: number;
  category: string;
  seed: number;
  /** A sung resolution is asked on 2 to 3 trials per FET set, never on every one. */
  sungResolution?: boolean;
  /** The key mode a lesson step needs (`stepTrialSpec`, d8): minor-key trials only in a minor-key step. */
  mode?: "major" | "minor";
}
export interface SetPlan {
  setId: string;
  family: FamilyId;
  /** The card's level; trials one level down are marked in `trials[i].level`. */
  level: number;
  trials: TrialSpec[];
  estSec: number;
  /** Sounds to preload before trial 1. */
  preload: string[];
  /** Blocked introduction: contrast set against the new categories' neighbours. */
  blockedIntro: boolean;
}
export interface SetPlanInput {
  family: FamilyId;
  setId: string;
  level: number;
  /** Categories whose lesson is completed. */
  openCategories: readonly string[];
  /** Per-category hits over the last 30 trials: sampling weight ∝ (1 − a_c) + 0.15. */
  categoryStats: Readonly<Record<string, { n: number; hits: number }>>;
  blockedRemaining: number;
  /** 4 for an anchor set; default: the family's `trialsPerSet`. */
  trials?: number;
  /** First FET set of the day sings 3 resolutions, later ones 2; 0 in Quiet mode. */
  sungResolutions?: number;
  /**
   * Per-category hits of the learner's sung resolutions (a resolution passed counts as a hit): the trials
   * that ask for one cover the weakest sung degrees first (contracts §8.3). Default: `categoryStats`.
   */
  sungStats?: Readonly<Record<string, { n: number; hits: number }>>;
  quiet: boolean;
}
export interface SetSummary {
  family: FamilyId;
  trials: number;
  /** Graded against the level each trial was played at. */
  meanCredit: number;
  medianRtMs: number;
  extraReplays: number;
  /** Production families: mean |cents| of the sung notes. */
  meanAbsCents: number | null;
  playedLevel: number;
  perCategory: Record<string, { n: number; hits: number }>;
  confusions: Record<string, number>;
  diagnostics: Diagnostic[];
}

// --- playback -----------------------------------------------------------------------------------

/**
 * A value handed straight to `superdough()`: INTERNAL control names (`cutoff`, `roomsize`, …), not the
 * Strudel aliases (`lpf`, `room`).
 */
export interface SuperdoughValue {
  s: string;
  note?: number | string;
  n?: number;
  bank?: string;
  gain?: number;
  velocity?: number;
  cutoff?: number;
  room?: number;
  roomsize?: number;
  pan?: number;
  clip?: number;
  [control: string]: unknown;
}
/**
 * Events to play without a scheduler, relative to the plan's start: drill stimuli, cues, resolutions,
 * the transcription "pattern source". Played by `OakStrudel.playEvents`.
 */
export interface AudioPlan {
  events: { at: number; dur: number; value: SuperdoughValue }[];
  durationSec: number;
  /** Sound names to preload before playing. */
  preload: string[];
}

/** Kaernbach weighted up-down on continuous difficulty, converging on about 85% success. */
export interface StaircaseState {
  /** d ∈ [1, levels + 0.99]; level = floor(d). */
  d: number;
  levels: number;
}

export type { Cue, NEvent, Trial, TrialResult };
