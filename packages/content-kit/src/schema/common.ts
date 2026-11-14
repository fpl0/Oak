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

/**
 * Wave 5. The degrees of each mode, 1-based and spelled against the major scale (contracts §5.2 `Degree`):
 * what a degree pad offers in that key and what a sung or written degree may be. The minors are do-based:
 * 1 is home in minor too, and ♭3 ♭6 ♭7 are written `b3 b6 b7` (sung me, le, te). Harmonic minor raises 7,
 * melodic minor (ascending, the form Oak teaches) raises 6 and 7.
 */
export const MODE_DEGREES: Readonly<Record<ScaleMode, readonly Degree[]>> = {
  major: ["1", "2", "3", "4", "5", "6", "7"],
  minor: ["1", "2", "b3", "4", "5", "b6", "b7"],
  "harmonic minor": ["1", "2", "b3", "4", "5", "b6", "7"],
  "melodic minor": ["1", "2", "b3", "4", "5", "6", "7"],
  dorian: ["1", "2", "b3", "4", "5", "6", "b7"],
  phrygian: ["1", "b2", "b3", "4", "5", "b6", "b7"],
  lydian: ["1", "2", "3", "#4", "5", "6", "7"],
  mixolydian: ["1", "2", "3", "4", "5", "6", "b7"],
  locrian: ["1", "b2", "b3", "4", "b5", "b6", "b7"],
  "major pentatonic": ["1", "2", "3", "5", "6"],
  "minor pentatonic": ["1", "b3", "4", "5", "b7"],
  blues: ["1", "b3", "4", "b5", "5", "b7"],
};
/** Wave 5. The modes whose 3rd is ♭3: a degree pad in one of these keys offers ♭3, never 3. */
export const MINOR_THIRD_MODES: readonly ScaleMode[] = [
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "locrian",
  "minor pentatonic",
  "blues",
];
/**
 * Wave 5. Movable-do syllables for every degree, do-based in minor (contracts §8.3; U10.L01): 1 is do in
 * every key, ♭3 me, ♭6 le, ♭7 te; the chromatic degrees take their usual raised (-i) and lowered (-a/-e)
 * names. @oak/theory `labelPitch` gives the same syllables.
 */
export const DEGREE_SYLLABLES: Readonly<Record<Degree, string>> = {
  "1": "do",
  "#1": "di",
  b2: "ra",
  "2": "re",
  "#2": "ri",
  b3: "me",
  "3": "mi",
  "4": "fa",
  "#4": "fi",
  b5: "se",
  "5": "sol",
  "#5": "si",
  b6: "le",
  "6": "la",
  "#6": "li",
  b7: "te",
  "7": "ti",
};

/**
 * Wave 6. The five seventh-chord qualities of U12 (contracts §4 C07), in teaching order: major seventh,
 * dominant seventh, minor seventh (U12.L01–L02; the dominant seventh is U11.L04's), half-diminished and
 * diminished seventh (U12.L03). A quality pad or bar grid of a U12 step offers a subset of these.
 */
export const SEVENTH_QUALITIES = ["maj7", "7", "m7", "m7b5", "dim7"] as const satisfies readonly string[];
export type SeventhQuality = (typeof SEVENTH_QUALITIES)[number];
/**
 * Wave 6. A seventh chord as degrees above its own root, spelled against the major scale (the way U12 teaches
 * them: a triad plus a 7th): `C^7` 1 3 5 7, `C7` 1 3 5 ♭7, `Cm7` 1 ♭3 5 ♭7, `Cm7b5` 1 ♭3 ♭5 ♭7, `Co7` 1 ♭3 ♭5 and
 * the diminished 7th, which sounds as 6 (written `6` here: `Degree` has no double flat).
 */
export const SEVENTH_DEGREES: Readonly<Record<SeventhQuality, readonly Degree[]>> = {
  maj7: ["1", "3", "5", "7"],
  "7": ["1", "3", "5", "b7"],
  m7: ["1", "b3", "5", "b7"],
  m7b5: ["1", "b3", "b5", "b7"],
  dim7: ["1", "b3", "b5", "6"],
};
/**
 * Wave 6. The diatonic seventh chords of a major key and of a natural-minor key by scale degree 1–7 (contracts
 * §4 C08; U12.L04–L05): Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7, and i7 iiø7 ♭IIImaj7 iv7 v7 ♭VImaj7 ♭VII7. The
 * minor key's V7 and vii°7 come from harmonic minor (U10.L06) and are listed apart.
 */
export const DIATONIC_SEVENTHS: Readonly<Record<"major" | "minor", readonly SeventhQuality[]>> = {
  major: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"],
  minor: ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"],
};
export const HARMONIC_MINOR_SEVENTHS: Readonly<Record<5 | 7, SeventhQuality>> = { 5: "7", 7: "dim7" };

/**
 * Wave 6. The four modes U14 teaches as colours (contracts §4 S12, S13): the scale each one is nearest to
 * (`parent`), its characteristic tone (`tone`) and the parent's degree that tone replaces (`replaces`).
 * Mixolydian is major with ♭7; Lydian is major with ♯4; Dorian is minor with ♮6; Phrygian is minor with ♭2.
 * The `mode` rule's "characteristic tone" and "no leading tone / no ♭6" (contracts §6.6 C6) are these.
 */
export const MODE_CHARACTERISTIC: Readonly<
  Record<
    "mixolydian" | "lydian" | "dorian" | "phrygian",
    { parent: "major" | "minor"; tone: Degree; replaces: Degree }
  >
> = {
  mixolydian: { parent: "major", tone: "b7", replaces: "7" },
  lydian: { parent: "major", tone: "#4", replaces: "4" },
  dorian: { parent: "minor", tone: "6", replaces: "b6" },
  phrygian: { parent: "minor", tone: "b2", replaces: "2" },
};
export type ColourMode = keyof typeof MODE_CHARACTERISTIC;

/**
 * Wave 6. The chromatic degrees of U15.L01 (contracts §2.3), in teaching order: ♯4 ♭7 ♯5 ♯1 ♭2 ♭3 ♭6. Before
 * U15.L01 a degree pad or a sung target stays inside its key's own degrees (`MODE_DEGREES`); content CI
 * checks it (`chromatic.before-u15`).
 */
export const CHROMATIC_DEGREES = [
  "#4",
  "b7",
  "#5",
  "#1",
  "b2",
  "b3",
  "b6",
] as const satisfies readonly Degree[];
/**
 * Wave 6. A chromatic degree as the `n()` step string over a MAJOR scale (STYLE §6.3: the 0-based step, then
 * `#` or `b`): ♯4 is `3#`, ♭7 is `6b`. The number is the step, not the degree (`4#` is ♯5). `fam.deg.index`
 * level 5 drills these pairs.
 */
export const CHROMATIC_STEPS: Readonly<Record<string, string>> = {
  "#1": "0#",
  b2: "1b",
  "#2": "1#",
  b3: "2b",
  "#4": "3#",
  b5: "4b",
  "#5": "4#",
  b6: "5b",
  "#6": "5#",
  b7: "6b",
};

/**
 * Wave 6. The kinds of chord from outside the key that U15–U16 teach (contracts §4 H12, H13), as a rule or an
 * answer names them: a `secondary-dominant` (V/x or V7/x: a major triad or dominant seventh a 5th above a
 * diatonic chord other than I), an `applied-leading-tone` chord (vii°/x, vii°7/x or viiø7/x, U15.L04) and a
 * `borrowed` chord (from the parallel key: iv, ♭VI, ♭VII, ♭III, ii° in major; the Picardy I and the Dorian IV
 * in minor, U16). The grader reads them from the chord in context (`romanOf`), never from a string.
 */
export const OUTSIDE_CHORD_KINDS = ["secondary-dominant", "applied-leading-tone", "borrowed"] as const;
export type OutsideChordKind = (typeof OUTSIDE_CHORD_KINDS)[number];

/** Wave 6. A key in force from a bar on (contracts §6.8): `bar` is 1-based; the pickup bar is 0. */
export interface KeyPlanEntry {
  bar: number;
  key: KeySpec;
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
