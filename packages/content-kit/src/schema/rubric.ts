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
  /**
   * Wave 5. The rule reads only this part of the piece (feature `rubric.section`): a section of an arranged
   * piece by name (`{ section: "verse" }`, the `nth` one when it recurs; contracts §6.3, read through
   * `sectionsFromAst`), a bar window (`{ bars: [12, 12] }`, 1-based and inclusive: "bar 12 contains V"), or
   * the `last` section. A section rule on a piece with no `arrange()` fails with `form.no-sections`.
   * `contrast` and `key-change` carry their own section references and never take this field.
   */
  section?: SectionRef;
}

export type RubricRuleBody =
  | { rule: "bars"; min?: number; max?: number }
  | { rule: "duration-sec"; min: number }
  | { rule: "tempo-bpm"; min?: number; max?: number }
  | { rule: "tracks"; min: number; roles?: Layer[] }
  | { rule: "in-key"; key: KeySpec | "declared"; minRatio: number; tracks?: TrackRef[] }
  /**
   * `over` (Wave 5, feature `ends-on-degree.over`): the last chord under that note must be this numeral, read
   * in the rule's key ("ends on 1 over i", C4). Default: any chord.
   */
  | { rule: "ends-on-degree"; degrees: Degree[]; track: TrackRef; over?: string }
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
  /**
   * `choruses` (Wave 5, feature `blues-form.choruses`): at least this many twelve-bar choruses in a row
   * (C5: 2). `variant: "standard"` also accepts the quick change when `quickChangeOk` is set (C5 takes either).
   */
  | {
      rule: "blues-form";
      variant: "standard" | "quick-change" | "jazz";
      choruses?: number;
      quickChangeOk?: boolean;
    }
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
  /**
   * `anyOf` (Wave 5, feature `degree-set.any-of`): at least `minCount` (default 1) notes of the line fall on
   * any of these degrees ("♭3 or ♭5 at least twice", C5). `subsetOf`/`contains` keep their meaning.
   */
  | {
      rule: "degree-set";
      track: TrackRef;
      subsetOf?: Degree[];
      contains?: Degree[];
      anyOf?: Degree[];
      minCount?: number;
    }
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
      /**
       * Wave 5 (feature `chord-qualities.depth`): `seventh` reads each chord with its 7th (from the `chord()`
       * symbol, or from the pitch-class set of a hand-voiced chord), so `subsetOf: ["7"]` means "every chord
       * is a dominant seventh" (C5). Default `triad`: the triad core, as before.
       */
      depth?: "triad" | "seventh";
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
    }
  /**
   * Wave 5. A bass line against the chords (U08, C3, C5): `track` is the bass, `harmony` the chord track
   * (default: the piece's chords, the bass track excluded). At least one of:
   * - `roots`: the share of chord changes (`on: "change"`) or of downbeats (`on: "downbeat"`) where the bass
   *   sounds the chord's root at that moment (any octave) is at least `minRatio` (U08.L01: 0.75 of the
   *   changes; a bar of rest under a chord counts as a miss);
   * - `members`: the share of bass notes that are one of `allowed` against the chord at their onset is at
   *   least `minRatio` (U08.L02: `["root", "fifth", "octave"]`, 0.9), and with `each` every listed member
   *   occurs at least once;
   * - `approach`: at least `min` chord changes are reached by an approach tone: the last bass note before the
   *   change is a diatonic step (`diatonic`) or a half step (`chromatic`) from the new root and the new root
   *   sounds on the change (U08.L03).
   * Groove against the kick is the separate `groove-lock` rule (U08.L04).
   */
  | {
      rule: "bass-line";
      track: TrackRef;
      harmony?: TrackRef;
      roots?: { on: "change" | "downbeat"; minRatio: number };
      members?: { allowed: BassMember[]; minRatio: number; each?: boolean };
      approach?: { min: number; kinds?: ("diatonic" | "chromatic")[] };
    }
  /**
   * Wave 5. The piece notates cleanly (C3): rendered as a lead sheet (`view: "lead-sheet"`: the melody of
   * `melody`, chord symbols from the piece's chords) or on the staff, through @oak/notation with
   * `approximate = false`. A declared `swing` is carried by the notation (contracts §6.10 item 3), so a
   * swung flavour passes; a piece the quantizer cannot write exactly fails with the bars it rounded.
   */
  | { rule: "notates"; view: "lead-sheet" | "staff"; melody?: TrackRef };

/** The kinds of non-chord tone a melody note can be (U07.L03–L05; the harmony view's roles). */
/**
 * Wave 5. Which chord member a bass note is, against the chord sounding at its onset (U08): the root, the
 * 5th, the root an octave up or down (`octave`: the root again in another octave, counted apart so a "root–
 * five–octave" line can ask for all three), the 3rd, or an approach tone (a note a step or a half step away
 * from the next chord's root, sounding just before it changes).
 */
export const BASS_MEMBERS = ["root", "fifth", "octave", "third", "approach"] as const;
export type BassMember = (typeof BASS_MEMBERS)[number];

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
  "bass-line",
  "notates",
] as const satisfies readonly RubricRuleName[];

/** What a rule evaluation returns. Numeric rules give partial credit `min(1, value / target)`. */
export interface RuleOutcome {
  ok: boolean;
  value?: number;
  target?: number;
}
