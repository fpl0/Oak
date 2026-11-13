// Common content types (contracts §5.2). Unit of time: 1 cycle = 1 bar, always.
import type { FeedbackId, SkillCategoryId, SkillId } from "../ids.ts";

/** Exact rational, reduced, `d > 0`. Unit = cycles = bars. */
export type Rat = readonly [n: number, d: number];
/** Markdown with Oak inline components. May contain `{{param:name}}`. */
export type Md = string;
/** Offsets into the CLEAN code (editable-region and blank markers stripped). `to` is exclusive. */
export interface CodeRange {
  from: number;
  to: number;
}

export const DEGREES = [
  "1",
  "#1",
  "b2",
  "2",
  "#2",
  "b3",
  "3",
  "4",
  "#4",
  "b5",
  "5",
  "#5",
  "b6",
  "6",
  "#6",
  "b7",
  "7",
] as const;
/** 1-based scale degree relative to the major scale. The Strudel index is `n = degree − 1`. */
export type Degree = (typeof DEGREES)[number];

export const SCALE_MODES = [
  "major",
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "major pentatonic",
  "minor pentatonic",
  "blues",
] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];

/** `tonic` is a spelled pitch class: "Eb", "F#". */
export interface KeySpec {
  tonic: string;
  mode: ScaleMode;
}

/** The table is in contracts §6.9; `METERS` in @oak/theory is its only implementation. */
export const METER_IDS = ["4/4", "3/4", "2/4", "6/8", "9/8", "12/8", "5/4", "5/8", "7/8", "9/8i"] as const;
export type MeterId = (typeof METER_IDS)[number];
export type TempoUnit = "quarter" | "dottedQuarter" | "eighth";
export interface MeterSpec {
  id: MeterId;
  num: number;
  den: 4 | 8;
  /** What BPM counts. `cpm = bpm / unitsPerBar`. */
  tempoUnit: TempoUnit;
  unitsPerBar: number;
  /** In tempo units for /4 meters, in eighths for /8 meters. */
  grouping: number[];
}

/** `amount` is the swingBy amount; 1/3 is triplet swing. */
export interface SwingSpec {
  subdivision: 8 | 16;
  amount: number;
}
/** Pickup length in tempo units; it lives in bar 0 (contracts §6.11). */
export interface PickupSpec {
  units: Rat;
}

export const DRUM_ROLES = [
  "kick",
  "snare",
  "clap",
  "rim",
  "hatClosed",
  "hatOpen",
  "tom",
  "crash",
  "ride",
  "shaker",
  "perc",
] as const;
export type DrumRole = (typeof DRUM_ROLES)[number];
export const LAYERS = ["drums", "bass", "chords", "melody", "all"] as const;
export type Layer = (typeof LAYERS)[number];

export const CHORD_QUALITIES = [
  "maj",
  "min",
  "dim",
  "aug",
  "sus2",
  "sus4",
  "maj7",
  "7",
  "m7",
  "m7b5",
  "dim7",
  "mMaj7",
  "6",
  "m6",
  "69",
  "add9",
  "9",
  "maj9",
  "m9",
  "m11",
  "7b9",
  "7#9",
  "7#11",
  "7b13",
  "13",
  "7alt",
  "maj7#11",
  "7sus4",
] as const;
export type ChordQuality = (typeof CHORD_QUALITIES)[number];

export type PitchMode = "absolute" | "octave-free" | "key-relative" | "transposition-invariant";

/**
 * A label ('mel', 'bass'), '*' (all learner tracks), an inferred role ('@drums' '@bass' '@chords'
 * '@melody'), or a Band track ('band.chords'). Band tracks are never matched by '*' or by a role.
 */
export type TrackRef = string;

/** A skill node or one of its categories (`E05/deg.6`). Evidence on a category rolls up to its node. */
export type SkillRef = SkillId | SkillCategoryId;
export interface SkillWeight {
  skill: SkillRef;
  w: number;
}

export type Role = "practice" | "check" | "checkpoint" | "capstone";

/** Reference to a step param (contracts §5.5). */
export interface ParamRef {
  param: string;
}
/** Any numeric field typed `Num` accepts a step param. */
export type Num = number | ParamRef;

export type CadenceType = "PAC" | "IAC" | "HC" | "PC" | "DC" | "bVII-I" | "none";
export const CADENCE_TYPES = [
  "PAC",
  "IAC",
  "HC",
  "PC",
  "DC",
  "bVII-I",
  "none",
] as const satisfies readonly CadenceType[];

/**
 * Wave 4. Harmonic function (contracts §4 H02): tonic, predominant, dominant. Used as the option ids of a
 * function strip (`slot-choice` with `FUNCTION_OPTIONS`) so every lesson and drill names them the same way.
 */
export const HARMONIC_FUNCTIONS = ["T", "PD", "D"] as const;
export type HarmonicFunction = (typeof HARMONIC_FUNCTIONS)[number];

export type Severity = "error" | "warn" | "info" | "praise";

/** Per-exercise override of a catalog template: the text may change, never the code. */
export type FeedbackText = Partial<Record<FeedbackId, Md>>;

/** The label set of STYLE §2 and its role map (contracts §6.2). Any other label goes through `inferRoles`. */
export const TRACK_LABELS = [
  "drums",
  "kick",
  "snare",
  "hats",
  "perc",
  "bass",
  "chords",
  "pad",
  "mel",
  "vox",
  "keys",
  "gtr",
  "horns",
  "fx",
] as const;
export type TrackLabel = (typeof TRACK_LABELS)[number];
export const LABEL_ROLES: Readonly<Partial<Record<TrackLabel, Exclude<Layer, "all">>>> = {
  drums: "drums",
  kick: "drums",
  snare: "drums",
  hats: "drums",
  perc: "drums",
  bass: "bass",
  chords: "chords",
  pad: "chords",
  mel: "melody",
  vox: "melody",
};
