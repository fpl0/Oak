// Rubric rules (contracts §5.6): exercises §2.4 kept rules plus the amended and added ones.
// `motif-repetition` and `section-contrast` are replaced by `motif-reuse` and `contrast`.
import type { SoundId, ToolId } from "../ids.ts";
import type {
  CadenceType,
  ChordQuality,
  Degree,
  DrumRole,
  KeySpec,
  Layer,
  Md,
  Rat,
  ScaleMode,
  SkillRef,
  TrackRef,
} from "./common.ts";
import type { Matcher, Reference } from "./exercise.ts";

export type SectionRef = { section: string; nth?: number } | { bars: [number, number] } | "last";

export interface RubricRuleBase {
  /** Slug, unique in its rubric. Also the `ruleId` of `GradeResult.rubric`. */
  id: string;
  label: Md;
  /** All-or-nothing for pass. A lesson Make has exactly one required rule (contracts §6.5). */
  required: boolean;
  /** Evidence at weight 1.5 goes to these skills, only for code the learner typed. */
  skills: SkillRef[];
}

export type RubricRuleBody =
  | { rule: "bars"; min?: number; max?: number }
  | { rule: "duration-sec"; min: number }
  | { rule: "tempo-bpm"; min?: number; max?: number }
  | { rule: "tracks"; min: number; roles?: Layer[] }
  | { rule: "in-key"; key: KeySpec | "declared"; minRatio: number; tracks?: TrackRef[] }
  | { rule: "ends-on-degree"; degrees: Degree[]; track: TrackRef }
  | { rule: "cadence"; types: CadenceType[]; at: "last" | "phrase-ends" | { bar: number } }
  | {
      rule: "chord-tones-strong";
      minRatio: number;
      melody: TrackRef;
      harmony: TrackRef;
      strength: "downbeat" | "strong" | "beat";
    }
  /**
   * `bars` (Wave 4): only bars `[from, to]` (1-based, inclusive) are compared, so "bars 1–6 are the loop"
   * leaves the cadence bars to a `cadence` rule (C2). Default: the whole piece.
   */
  | {
      rule: "progression";
      schema?: string;
      rn?: string[];
      allowRotation?: boolean;
      track?: TrackRef;
      bars?: [number, number];
    }
  | { rule: "contains-rn"; rn: string[]; min: number; mustResolve?: boolean }
  | { rule: "range"; track: TrackRef; maxSpan?: number; within?: [string, string] | "learner-voice" }
  | { rule: "step-ratio"; track: TrackRef; min: number }
  | { rule: "harmonic-rhythm"; changesPerBar: [number, number] }
  | { rule: "groove-lock"; kick: TrackRef; bass: TrackRef; min: number }
  /** Amended: a priority list of tracks, an optional drum-sound filter, and the subdivision that swings (§6.6). */
  | {
      rule: "swing";
      track: TrackRef | TrackRef[];
      drums?: DrumRole[];
      subdivision: 8 | 16;
      ratio: [number, number];
    }
  | { rule: "syncopation"; track: TrackRef; min: number }
  /** Section names ('verse chorus verse chorus') or letters by first appearance ('ABAB'); `?` matches any section. */
  | { rule: "form"; pattern: string; phraseBars?: number }
  /**
   * Smooth chord-to-chord motion of a hand-voiced chord track (contracts §6.7 item 4). Each chord (the
   * notes that start together) is a set of voices, lowest first; at each change every voice moves at most
   * `maxMovePerVoice` semitones (the total at most `maxTotal`). Wave 4 adds the U05.L07 gate check:
   * `voices`: every chord has exactly this many notes; `commonTones`: a pitch class two neighbouring chords
   * share stays at the same pitch in the same voice; `noCrossing`: no voice moves above the voice that was
   * above it (they stay in order, lowest to highest). `bassFree`: the lowest voice is left out of the
   * motion limits (a bass track or a root bass that leaps by 4ths and 5ths); it still counts for
   * `noCrossing`.
   */
  | {
      rule: "voice-leading";
      track: TrackRef;
      maxMovePerVoice: number;
      maxTotal?: number;
      voices?: number;
      commonTones?: boolean;
      noCrossing?: boolean;
      bassFree?: boolean;
    }
  | { rule: "guide-tones"; track: TrackRef; harmony: TrackRef; minRatio: number }
  /** Kept, for pivot modulations. Lifts use `key-change`. */
  | { rule: "modulation"; to: "up-step" | "up-half" | "relative" | "dominant" | KeySpec; atBar?: number }
  | { rule: "mode"; tonic: string; mode: ScaleMode; requireCharacteristic: boolean }
  | { rule: "blues-form"; variant: "standard" | "quick-change" | "jazz" }
  | { rule: "euclid"; track: TrackRef; k: number; n: number; rotationFree: boolean }
  | { rule: "clave"; track: TrackRef; type: "son" | "rumba"; direction: "3-2" | "2-3" }
  | { rule: "polyrhythm"; a: TrackRef; b: TrackRef; ratio: [number, number] }
  | { rule: "register-separation"; low: TrackRef; high: TrackRef; minGapSemis: number }
  | { rule: "no-muddy-low"; track: TrackRef }
  /** Amended: toolbox IDs, like the `must-use` constraint. */
  | { rule: "uses"; tool: ToolId | ToolId[]; min?: number }
  /** One-off checks registered by name with a unit test (`walking-bass`, `allowed-tensions`, `ii-v-chain`). */
  | { rule: "custom"; fn: string; params?: Record<string, unknown> }
  /**
   * Share of melody units (default 1 bar) whose interval sequence matches an earlier unit, exactly or
   * transposed, by edit similarity ≥ 0.75. Measured over ONE period of the learner's line (a loop's own
   * repeats never count). `shape` (Wave 3): what "the same shape" means. `semitones` (default) keeps every
   * distance in half steps; `steps` keeps it in scale steps, so a sequence moved by degrees inside the key
   * ([2 4 6 4] after [0 2 4 2]) counts; `either` takes both. Scale steps are read in the line's own
   * `.scale()` key, else the lesson key.
   */
  | {
      rule: "motif-reuse";
      track: TrackRef;
      minRatio: number;
      unitBars?: number;
      shape?: "semitones" | "steps" | "either";
    }
  /**
   * pitch: mean melody pitch differs ≥ 3 st; density: onsets per bar differ ≥ 25%; harmony: RN sequences
   * differ; register: lowest/highest sounding note moves ≥ 5 st; energy: |ΔE| ≥ 0.15.
   */
  | {
      rule: "contrast";
      a: SectionRef;
      b: SectionRef;
      axes: ("pitch" | "density" | "harmony" | "register" | "energy")[];
      minAxes: number;
      thresholds?: {
        pitchSemis?: number;
        densityRatio?: number;
        registerSemis?: number;
        energyDelta?: number;
      };
    }
  /**
   * New key = old key + one of `semitones`; the section at `at` must last ≥ `minBarsAfter` (default 8)
   * bars; `sameMelody`: key-relative degree sequences of the two sections are equal.
   */
  | { rule: "key-change"; at: SectionRef; semitones: number[]; minBarsAfter?: number; sameMelody?: boolean }
  /** ≥ `min` hits with effective gain ≤ `maxGain` (default 0.4) at the given positions. */
  | { rule: "velocity-ghosts"; track: TrackRef; min: number; maxGain?: number; on?: "16th-offbeat" | "any" }
  | { rule: "onsets"; track: TrackRef; drum?: DrumRole; contains?: Rat[]; equals?: Rat[]; perBar: boolean }
  | { rule: "degree-set"; track: TrackRef; subsetOf?: Degree[]; contains?: Degree[]; minCount?: number }
  /** `contains`: every one listed; `anyOf` (Wave 4, U05.L08 "Rhodes or organ"): at least one of them. */
  | { rule: "sounds"; subsetOf?: SoundId[]; contains?: SoundId[]; anyOf?: SoundId[] }
  | { rule: "distinct-pitches"; track: TrackRef; min: number }
  /** Device names come from `AnalysisSummary.devices`. */
  | { rule: "device-count"; devices: string[]; min: number }
  /** For example "melody identical to the reference" (JC4, AC1). */
  | { rule: "matches"; reference: Reference; matcher: Matcher; min: number }
  /**
   * Wave 4. The line starts with a pickup (contracts §6.11, U07.L08): bar 0 begins with rests and holds
   * at least one note, and the next bar starts on its downbeat. With `units`, the pickup (from its first
   * note to the bar line) is exactly that many tempo units long. Read on one period of the learner's loop.
   */
  | { rule: "pickup"; track: TrackRef; units?: Rat }
  /**
   * Wave 4. Chord qualities in a chord track (U05 Makes): every chord (the notes that start together,
   * named from its pitch classes for hand-stacked notes and from its symbol for `chord()`) is read as a
   * triad core. `contains`: each listed quality occurs at least once; `anyOf`: at least `min` (default 1)
   * chords are of one of these qualities ("a diminished or an augmented triad"); `subsetOf`: every chord
   * is one of these; `min` alone: at least this many chords are triads (stacked in 3rds: maj, min, dim or
   * aug; a cluster such as C D E is not). Two-note dyads and single notes are not chords. Default track
   * `@chords`.
   */
  | {
      rule: "chord-qualities";
      track?: TrackRef;
      contains?: ChordQuality[];
      anyOf?: ChordQuality[];
      subsetOf?: ChordQuality[];
      min?: number;
    }
  /**
   * Wave 4. Inversions (U05.L05, U06.L11): at least `min` chords whose lowest sounding note, across every
   * pitched learner track at the chord's onset (contracts §6.7 item 5), is not the root. `of` limits which
   * count: 1 = the 3rd in the bass (first inversion), 2 = the 5th (second inversion). Default track
   * `@chords` for the chords; the bass is read from all learner tracks.
   */
  | { rule: "chord-inversions"; track?: TrackRef; min: number; of?: (1 | 2)[] }
  /**
   * Wave 4 Build (U07.L04–L05): at least `min` notes of the melody (one pass of the line) are non-chord
   * tones of these kinds against the chord under them (`harmony`: a chord track such as `@chords` or
   * `band.chords`; default the piece's chords). `roles` default: every kind (passing, neighbour,
   * appoggiatura, suspension, anticipation, escape). The roles are the harmony view's (`MelodyNoteRole`).
   */
  | {
      rule: "non-chord-tones";
      track: TrackRef;
      harmony?: TrackRef;
      roles?: NonChordToneRole[];
      min: number;
    };

/** The kinds of non-chord tone a melody note can be (U07.L03–L05; the harmony view's roles). */
export const NON_CHORD_TONE_ROLES = [
  "passing",
  "neighbour",
  "appoggiatura",
  "suspension",
  "anticipation",
  "escape",
] as const;
export type NonChordToneRole = (typeof NON_CHORD_TONE_ROLES)[number];

export type RubricRule = RubricRuleBase & RubricRuleBody;
export type RubricRuleName = RubricRuleBody["rule"];

export const RUBRIC_RULE_NAMES = [
  "bars",
  "duration-sec",
  "tempo-bpm",
  "tracks",
  "in-key",
  "ends-on-degree",
  "cadence",
  "chord-tones-strong",
  "progression",
  "contains-rn",
  "range",
  "step-ratio",
  "harmonic-rhythm",
  "groove-lock",
  "swing",
  "syncopation",
  "form",
  "voice-leading",
  "guide-tones",
  "modulation",
  "mode",
  "blues-form",
  "euclid",
  "clave",
  "polyrhythm",
  "register-separation",
  "no-muddy-low",
  "uses",
  "custom",
  "motif-reuse",
  "contrast",
  "key-change",
  "velocity-ghosts",
  "onsets",
  "degree-set",
  "sounds",
  "distinct-pitches",
  "device-count",
  "matches",
  "pickup",
  "chord-qualities",
  "chord-inversions",
  "non-chord-tones",
] as const satisfies readonly RubricRuleName[];

/** What a rule evaluation returns. Numeric rules give partial credit `min(1, value / target)`. */
export interface RuleOutcome {
  ok: boolean;
  value?: number;
  target?: number;
}
