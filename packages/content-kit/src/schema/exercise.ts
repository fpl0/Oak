// Exercise definitions (contracts §5.3 to §5.5; exercises.md §2.2 for the kept types).
import type { CanDoId, DeckId, FactId, FamilyId, FeedbackId, FlavourId, SongId, ToolId } from "../ids.ts";
import type {
  ChordQuality,
  CodeRange,
  Degree,
  DrumRole,
  KeySpec,
  Layer,
  Md,
  MeterId,
  Num,
  PickupSpec,
  PitchMode,
  Rat,
  Role,
  ScaleMode,
  SkillWeight,
  SwingSpec,
  TrackRef,
} from "./common.ts";
import type { RubricRule } from "./rubric.ts";

// --- base ---------------------------------------------------------------------------------------

export interface ExBase<K extends string> {
  kind: K;
  /** Slug, unique in its lesson; global ID `${owner}/${id}`. */
  id: string;
  /** Bump when grading semantics change; attempts are keyed by (id, version). */
  version: number;
  title?: string;
  /** May contain `{{param:name}}`. */
  prompt: Md;
  skills: SkillWeight[];
  role: Role;
  /** Default: the lesson's. */
  key?: KeySpec;
  meter?: MeterId;
  bpm?: Num;
  swing?: SwingSpec;
  pickup?: PickupSpec;
  params?: Record<string, ParamGen>;
  /** Override of the kind's default pass threshold. */
  pass?: number;
  /** `null` only for: predict, listen, fact-deck items, any exercise with role 'checkpoint'. */
  hints: HintLadder | null;
  feedbackText?: Partial<Record<FeedbackId, Md>>;
  tutor?: TutorPolicy;
  srs?: SrsLink[];
  canDo?: CanDoId[];
  /** Modality fallback for mic and tap kinds. Every `sing` exercise must declare one. */
  fallback?: "identify" | "skip";
  /** Code kinds: ≥ 1 pass and ≥ 2 fail with distinct feedback codes (AUTHORING §8). */
  tests: TestCase[];
}

/** Fixed 4-rung ladder. Position is the rung: [1] nudge, [2] pointer, [3] partial, [4] reveal. */
export type HintLadder = readonly [nudge: Hint, pointer: Hint, partial: Hint, reveal: Hint | "auto"];
export interface Hint {
  text: Md;
  highlight?: { code?: CodeRange[]; bars?: number[]; noteSelector?: TargetSelector };
  /** Rung 3: a partial diff; rung 4: the full solution (default `reference.solutions[0]`). */
  patch?: string;
  replay?: { rate?: number; isolate?: Layer; bars?: [number, number] };
}
export type HintRung = 0 | 1 | 2 | 3 | 4;

/** Evidence multiplier and best SRS rating per rung (contracts §5.3). */
export const RUNG_RULES: Readonly<
  Record<
    HintRung,
    {
      name: "none" | "nudge" | "pointer" | "partial" | "reveal";
      multiplier: number;
      bestRating: "Easy" | "Good" | "Hard" | "Again";
      assisted: boolean;
      revealed: boolean;
    }
  >
> = {
  0: { name: "none", multiplier: 1.0, bestRating: "Easy", assisted: false, revealed: false },
  1: { name: "nudge", multiplier: 0.9, bestRating: "Good", assisted: false, revealed: false },
  2: { name: "pointer", multiplier: 0.8, bestRating: "Hard", assisted: false, revealed: false },
  3: { name: "partial", multiplier: 0.7, bestRating: "Hard", assisted: true, revealed: false },
  4: { name: "reveal", multiplier: 0, bestRating: "Again", assisted: true, revealed: true },
};
/** Replay multiplier on evidence (contracts §7.2). */
export function replayMultiplier(extraReplays: number): number {
  return Math.max(0.6, 0.9 ** Math.max(0, extraReplays));
}
/** `adjustedScore = score × rung multiplier × replay multiplier`. */
export function adjustScore(score: number, rung: HintRung, extraReplays: number): number {
  return score * RUNG_RULES[rung].multiplier * replayMultiplier(extraReplays);
}

export interface TutorPolicy {
  /** False in checkpoints. */
  enabled: boolean;
  reviewOnSubmit?: "none" | "offer" | "auto";
}

/**
 * `seed`: create the card and count this as its first review. `review-if-due`: review only when the card
 * is due within the next 2 days (contracts §7.4). `evidence-only`: never touches the schedule.
 */
export interface SrsLink {
  family?: FamilyId;
  deck?: DeckId;
  cards?: FactId[];
  mode: "seed" | "review-if-due" | "evidence-only";
}

// --- params (§5.5) ------------------------------------------------------------------------------

export type ParamGen =
  | { gen: "int"; min: number; max: number; step?: number; awayFrom?: { value: number; by: number } }
  | { gen: "choice"; of: (string | number)[] }
  | { gen: "key"; keys: KeyPool; mode: ScaleMode }
  | { gen: "degree"; set: Degree[] };
export type KeyPool = "C" | "≤2acc" | "≤4acc" | "all";
export type ParamValues = Record<string, number | string>;

// --- stimulus and cue ---------------------------------------------------------------------------

export type Stimulus =
  | {
      src: "code";
      code: string;
      bars: number;
      loop?: boolean;
      showCode: boolean;
      showStaff?: boolean;
      showRoll?: boolean;
      /**
       * Wave 4. Show the stimulus as a lead sheet (melody on one treble staff, chord symbols above it,
       * the meter and pickup of the exercise or lesson), for "play / sing from the page" (U07.L09). The
       * layout comes from `StepUi.leadSheet` when the step has one, else melody = `@melody`, chords =
       * `@chords`.
       */
      showLeadSheet?: boolean;
    }
  /** A lesson step reusing a drill generator. */
  | { src: "generator"; family: FamilyId; level: number; seed?: number }
  /** `content/repertoire/<song-id>/song.ts` (public domain). */
  | { src: "tune"; tuneId: SongId; bars: [number, number]; layers?: Layer[] }
  /**
   * Wave 4. The song the learner picked for this capstone (X1: Aura Lee or Red River Valley, from
   * `CapstoneDef.song`), bars `[from, to)` of its answer key (cycle 0 is the pickup bar), these layers.
   * Only inside a capstone; resolved by the capstone flow, which also derives the reference.
   */
  | { src: "capstone-song"; bars: [number, number]; layers?: Layer[] }
  /** The learner's own audio; never leaves the machine. */
  | { src: "learner-audio" };

export interface Cue {
  context: "cadence" | "short-cadence" | "tonic-chord" | "drone" | "none";
  countInBars: 0 | 1 | 2;
  click: boolean;
  /** −1 = unlimited. */
  replays: number;
}

// --- answers ------------------------------------------------------------------------------------

export type AnswerUi =
  | {
      ui: "choice";
      options: Choice[];
      multi?: boolean;
      layout?: "buttons" | "cards" | "audio-cards" | "roll-thumbs" | "staff-thumbs";
    }
  | { ui: "degree-pad"; set: Degree[]; sequenceLen?: number; syllables: boolean; rhythmTemplate?: string }
  | { ui: "quality-pad"; set: ChordQuality[] }
  | {
      ui: "rn-palette";
      slots: number;
      allow: ("triads" | "sevenths" | "inversions" | "secondary" | "borrowed")[];
    }
  | { ui: "text"; normalize: "note" | "chord" | "rn" | "interval" | "key" | "free" }
  | { ui: "number" }
  | { ui: "keyboard"; range: [string, string]; mode: "single" | "chord" | "sequence" }
  | {
      ui: "staff-input";
      clef: "treble" | "bass" | "grand";
      bars: number;
      /**
       * `chords` (Wave 4): notes entered at the same position stack into one chord (the note-list DSL writes
       * it `[C4,E4,G4]:2`). Needed by `StaffExpect` `chords`.
       */
      palette: { durations: string[]; accidentals: boolean; ties: boolean; rests: boolean; chords?: boolean };
      /**
       * Wave 3. The key signature printed at the start of every line. A note entered on a line or space
       * takes the signature's sharp or flat, as on paper; the value is the sounding spelling (`F#4:4` in
       * G major for a note written on the top line). Absent: C major / no signature.
       */
      key?: KeySpec;
      /**
       * Wave 3. `notes` (default): enter notes. `key-signature`: place the accidentals of a key signature at
       * the start of the staff, in the order written; the value is the spelled accidentals in that order
       * ("F# C#"), which the host sends as `answer.text` (`StaffExpect` `key-signature`).
       */
      mode?: "notes" | "key-signature";
    }
  | { ui: "grid"; rows: DrumRole[] | ["hit"]; stepsPerBar: 8 | 12 | 16; bars: number }
  /**
   * Wave 4. One choice per slot, in order: a function strip under four bars (T PD D T), the cadence at the
   * end of each phrase, "chord tone or not" per marked note. Every slot offers the same `options`; the
   * response is `answer.choice` with one option id per slot, graded slot by slot (a `partial` map gives
   * credit for near misses such as IAC for PAC). `labels` names the slots ("Bar 1" …; default "1", "2" …).
   * Use `FUNCTION_OPTIONS` and `CADENCE_OPTIONS` for the standard ids.
   */
  | { ui: "slot-choice"; slots: number; options: Choice[]; labels?: string[] }
  /**
   * Wave 5. The form of a piece heard (U09): one label per section played, in order. `vocabulary` is either
   * `"letters"` (A, B, C … by first appearance: AABA) or the section names the learner may use
   * (`FORM_SECTION_NAMES`). `input: "label"` names each section as it plays (a strip of `sections` slots,
   * the bars of each given by `sectionBars` when known); `input: "order"` puts the distinct sections, given as
   * cards, in the order they were heard. The response is `answer.sections`, one entry per section. With named
   * sections each slot is graded by section type, as the `form` rule reads names (a tagged `chorus2` counts as
   * a chorus; contracts §6.3 item 4); with `"letters"` (or a letter key) both sequences are rewritten as
   * letters by first appearance and graded on the shape, so BABA answers ABAB.
   */
  | {
      ui: "form";
      sections: number;
      vocabulary: "letters" | FormSectionName[];
      input: "label" | "order";
      sectionBars?: number[];
    }
  /**
   * Wave 5. A chord chart of `bars` bars, `perRow` to a line (a twelve-bar blues is 12 bars, 4 a row), one
   * entry per bar: a Roman numeral (`entry: "rn"`, answered as `answer.rn`) or a chord symbol (`"symbol"`,
   * answered as `answer.text` in code spelling, `C7`). `qualities` limits the palette (`["7"]` for an
   * all-dominant blues; `["maj", "min", "7"]`). `given`: 1-based bars printed already filled (bar 1's I7).
   * Graded bar by bar by degree (the root against the exercise key) and quality, never by string: `I7`,
   * `i7` and `IV` differ by quality (`harmony.rn-case`, `id.quality`).
   */
  | {
      ui: "bar-grid";
      bars: number;
      perRow: number;
      entry: "rn" | "symbol";
      qualities: ChordQuality[];
      given?: number[];
    }
  /**
   * Wave 5. Build a scale: choose its notes on a keyboard from `tonic` (`input: "keyboard"`, answered as
   * `answer.midi` and graded by pitch class against the tonic) or tick its degrees on a pad of `palette`
   * (`input: "degrees"`, answered as `answer.degrees`). Graded as a set against `correct.degrees` (the major
   * and minor pentatonic, the blues scale, the three minors). `range` is the keyboard's span.
   */
  | {
      ui: "scale-builder";
      tonic: string;
      input: "keyboard" | "degrees";
      palette?: Degree[];
      range?: [string, string];
    }
  | { ui: "code"; starter: string; constraints?: AstConstraint[] }
  | { ui: "tap" }
  | { ui: "mic" }
  | { ui: "bar-buttons"; bars: number }
  /** Predicate target, never an event ID. */
  | { ui: "click-code" | "click-staff" | "click-roll"; target: TargetSelector };
export type AnswerUiKind = AnswerUi["ui"];

export interface Choice {
  id: string;
  label: Md;
  /** Strudel code played when the card is auditioned. */
  audio?: string;
  thumb?: "roll" | "staff";
}
export interface Answer {
  choice?: string[];
  text?: string[];
  number?: number;
  degrees?: Degree[];
  qualities?: ChordQuality[];
  rn?: string[];
  midi?: number[];
  stages?: Partial<Record<DictationStage, string[]>>;
  /** Wave 5. The `form` answer: one section label per section (`["verse", "chorus"]` or `["A", "A", "B", "A"]`). */
  sections?: string[];
}

/** Wave 5. The section names a `form` answer may offer (contracts §6.3 item 2: the tag names). */
export const FORM_SECTION_NAMES = [
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "solo",
  "outro",
] as const;
export type FormSectionName = (typeof FORM_SECTION_NAMES)[number];

/**
 * Wave 5. A form sequence as letters by first appearance (contracts §6.3 item 4): `verse chorus verse
 * chorus` → `ABAB`; a trailing digit tags a variant of the same section (`chorus2` is a chorus); single
 * capital letters are kept as letters by first appearance too (`B A B` → `ABA`).
 */
export function formLetters(sections: readonly string[]): string {
  const seen = new Map<string, string>();
  let out = "";
  for (const raw of sections) {
    const type = raw.trim().toLowerCase().replace(/\d+$/, "");
    if (!seen.has(type)) seen.set(type, String.fromCharCode(65 + seen.size));
    out += seen.get(type);
  }
  return out;
}
/** expected → got → credit. */
export type PartialMap = Record<string, Record<string, number>>;

/**
 * Resolved at grade time by evaluating the code: the selected events' `locs` and IDs are the accepted
 * targets. `{ degree: '3' }` replaces any event-ID target.
 */
export interface TargetSelector {
  track?: TrackRef;
  drum?: DrumRole;
  /** 1-based. */
  bar?: number;
  /** 1-based, in tempo units; fractions allowed (2.5 = the "and" of 2). */
  beat?: number;
  degree?: Degree;
  /** 1-based index among the matches. */
  nth?: number;
}

// --- code ---------------------------------------------------------------------------------------

/** Markers in `starter`: ⟪…⟫ editable region, ⟦blankId⟧ blank. `stripMarkers` removes them. */
export interface CodeSpec {
  starter: string;
  /** Autocomplete and lint scope. Default: the learner's unlocked set. */
  toolbox?: "learner" | ToolId[];
  /** Default true after the first explicit Check. */
  autoCheckOnRun?: boolean;
}
export interface Reference {
  /** ≥ 1; [0] is canonical and the hint-4 reveal. Every solution must grade 1.0 in CI. */
  solutions: string[];
  /** Grading window [0, bars). */
  bars: number;
  /** Default '*'. */
  tracks?: TrackRef[];
  roles?: Partial<Record<Layer, TrackRef>>;
}

// --- matchers -----------------------------------------------------------------------------------

export type Matcher =
  | {
      m: "events";
      pitch: PitchMode;
      /**
       * What time is compared (Wave 3 made this unambiguous):
       * - `onsets`: where each event starts; lengths only when `durations: true`.
       * - `onsets+durations`: where each event starts AND how long it lasts (the explicit name of what
       *   `exact` has always done).
       * - `exact`: the original name of `onsets+durations`, kept for the lessons that use it; it ALWAYS
       *   compares lengths, whatever `durations` says, so content CI requires `durations: true` with it
       *   (`matcher.rhythm-exact-durations`). New content writes `onsets+durations`.
       * - `ignore`: order and pitch only.
       */
      rhythm: "exact" | "onsets" | "onsets+durations" | "ignore";
      /** Also compare lengths (implied by `onsets+durations` and `exact`). */
      durations: boolean;
      sound?: "ignore" | "s" | "drum-role";
      tracks?: TrackRef[];
    }
  | {
      m: "rhythm";
      tol: Rat;
      durations: boolean;
      perRole: boolean;
      displacementCredit: number;
      tracks?: TrackRef[];
      /**
       * Wave 4. With `perRole`, how the roles' onset F1s are folded: `onsets` (default) weighs each role by
       * its number of onsets; `equal` gives every role the same weight, so a whole part left out (the
       * snare's backbeat under sixteen hi-hats) fails. The ladder's L1 uses `equal` (contracts §2.9).
       */
      roleWeight?: "onsets" | "equal";
    }
  | { m: "melody"; pitch: PitchMode; wPitch: number; wRhythm: number; rhythmTol: Rat; track?: TrackRef }
  | {
      m: "harmony";
      level: "bass" | "root" | "quality" | "rn" | "full";
      qualityDepth: "triad" | "seventh" | "extended";
      inversion: boolean;
      harmonicRhythm: "given" | "graded";
      weights?: Partial<Record<"bass" | "root" | "quality" | "inversion", number>>;
    }
  /** The only matcher allowed for `voicing()` output (contracts §6.7). */
  | { m: "pcset"; perOnset: boolean; bass: boolean; tracks?: TrackRef[] }
  | { m: "rubric"; rules: RubricRule[] }
  /**
   * Wave 5. "Match this sound" (A1.L01–L04): the sound controls of the learner's code against the hidden
   * reference's, event by event on `track` (default: every learner track), each within its tolerance.
   * Notes and rhythm are given and not compared. See `ControlTolerance`.
   */
  | { m: "controls"; controls: ControlTolerance[]; track?: TrackRef }
  /** Every member must pass; score = weighted mean. */
  | { m: "all"; of: Matcher[]; weights?: number[] };
export type MatcherName = Matcher["m"];

/**
 * Wave 5. One sound control a `controls` matcher compares. `control` is the method as the learner writes it
 * (`lpf`, `lpq`, `attack`, `release`, `room`, `roomsize`, `delaytime`, `delayfeedback`, `s`); content CI
 * requires a toolbox row for it that the audibility harness marks `audible: true` and that is unlocked at
 * the lesson (contracts §3.1 rule 7: only audible controls are taught). `scale`:
 * - `linear`: |answer − target| ≤ `tol` (a level, a time in seconds: `release` within 0.1);
 * - `log`: |log2(answer / target)| ≤ `tol` octaves (frequencies: `lpf` within half an octave is `tol: 0.5`);
 * - `exact`: the same value (a wave name, `s`); `tol` is ignored.
 * A control the answer leaves out takes Strudel's default (no filter = fully open), so a missing `.lpf()`
 * is a miss, not an error.
 */
export interface ControlTolerance {
  control: string;
  scale: "linear" | "log" | "exact";
  tol: number;
}

// --- AST constraints ----------------------------------------------------------------------------

export type MiniOp =
  | "*"
  | "/"
  | "!"
  | "@"
  | "<>"
  | "[]"
  | ","
  | "~"
  | "(k,n)"
  | "?"
  | "|"
  | "{}"
  | ":"
  | ".."
  | ".";

export type AstConstraint = {
  id?: string;
  feedback?: FeedbackId;
} /** Any toolbox ID, strings and mini operators included. Replaces must-call and mini-uses. */ & (
  | { c: "must-use"; tool: ToolId | ToolId[]; min?: number }
  | { c: "must-not-use"; tool: ToolId | ToolId[]; why?: Md }
  /** `pattern` is a regex source. */
  | { c: "arg-matches"; fn: string; argIndex: number; pattern: string }
  | { c: "labels"; min?: number; max?: number; names?: string[] }
  /** `within` defaults to ['n', 'note']. */
  | { c: "no-note-names"; within?: string[] }
  | { c: "no-randomness" }
  /** Token diff against the starter. */
  | { c: "max-changed-tokens"; n: number }
  | { c: "edit-only-regions" }
  /** Compared in BPM through the lesson meter's tempoUnit (contracts §6.9). */
  | { c: "tempo"; bpm: Num; tol?: number }
  | { c: "max-chars"; n: number }
);
export type AstConstraintName = AstConstraint["c"];

// --- tolerances and the learner profile ---------------------------------------------------------

/** Authors write `windowMs: 'auto'`; a number is allowed only in calibration steps (contracts §8.4). */
export interface TapTolerance {
  windowMs: number | "auto";
  tempo: "locked" | "free";
  forgiveOffset: boolean;
  passF1: number;
  passTiming: number;
}
export type SingTolCents = 70 | 50 | 35 | 25;
export interface SingTolerance {
  /** 'learner' = profile.singTolCents (contracts §8.2). Authors use 'learner' unless the step is calibration. */
  cents: SingTolCents | "learner";
  octave: "per-note" | "global" | "exact";
  driftCompCents: number;
  onsetMs?: number;
  minCoverage: number;
  passHitRate: number;
  /**
   * Wave 3. The one exception to the ladder (contracts §8.1 item 8, U00.L02's first sung note): any
   * sustained pitch (coverage ≥ `minCoverage` for at least 600 ms) within ±100¢ of the target after
   * per-note octave folding passes; `cents` is ignored. Content CI allows it only in U00.L02.
   */
  lenient?: boolean;
}
export interface LearnerProfile {
  /** MIDI numbers. */
  rangeLow: number;
  rangeHigh: number;
  comfLow: number;
  comfHigh: number;
  tapLatencyMs: number;
  /** MAD of the calibration taps. */
  tapJitterMs: number;
  singLatencyMs: number;
  singTolCents: SingTolCents;
  singTolMode: "auto" | "fixed";
  noiseFloorDb: number;
  outputKind: "wired" | "bluetooth" | "speakers" | "unknown";
  inputKind: "builtin" | "external" | "bluetooth" | "none";
  quiet: boolean;
}

// --- kinds --------------------------------------------------------------------------------------

export interface PredictEx extends ExBase<"predict"> {
  code: string;
  bars: number;
  mode: "hum" | "choose" | "count";
  choices?: Choice[];
  correct?: string[] | number;
  humTrack?: TrackRef;
}
export interface RunInvestigateEx extends ExBase<"run-investigate"> {
  code: CodeSpec;
  mustPlayLoops: number;
  /** Empty for a plain `run` step. */
  questions: InvestigateQ[];
}
export type InvestigateQ =
  | { q: "choice"; prompt: Md; options: Choice[]; correct: string[] }
  | { q: "number"; prompt: Md; correct: number; tol?: number }
  | { q: "click-code" | "click-staff" | "click-roll"; prompt: Md; target: TargetSelector };
export interface CodeModifyEx extends ExBase<"code-modify"> {
  code: CodeSpec;
  reference: Reference;
  matcher: Matcher;
  constraints?: AstConstraint[];
  /**
   * `audible`: the target can be played. `showRoll`: the target's roll is shown from the start.
   * `revealRollAfter` (Wave 3): with `showRoll` false, the target's roll appears after this many failed
   * checks (1 = after the first failed try), so a step that starts by ear ends with a picture to compare.
   */
  target: { audible: boolean; showRoll?: boolean; revealRollAfter?: number };
}
export interface CodeFillEx extends ExBase<"code-fill"> {
  code: CodeSpec;
  blanks: BlankSpec[];
  reference: Reference;
  matcher: Matcher;
}
export interface BlankSpec {
  id: string;
  input: "text" | "select";
  options?: string[];
  maxLen?: number;
  hints?: Hint[];
}
export interface ParsonsEx extends ExBase<"parsons"> {
  blocks: ParsonsBlock[];
  distractors?: ParsonsBlock[];
  assemble: "lines" | "chord-seq" | "bar-seq";
  accept: { orders?: string[][]; reference?: Reference; matcher?: Matcher; rubric?: RubricRule[] };
}
export interface ParsonsBlock {
  id: string;
  text: string;
  audition?: string;
}
/**
 * Phase A: locate the bug (`locateVia`); phase B: fix it. Bug ranges default to the token diff between
 * the starter and `reference.solutions[0]`; `bugs` overrides them. Score = 0.4·locate + 0.6·fix.
 */
export interface ErrorHuntEx extends ExBase<"error-hunt"> {
  code: CodeSpec;
  reference: Reference;
  matcher: Matcher;
  locateVia: "code" | "staff" | "roll" | "bars";
  bugs?: CodeRange[];
}
export interface CodeMakeEx extends ExBase<"code-make"> {
  code: CodeSpec;
  bars: [min: number, max: number];
  /** Exactly one rule with `required: true` (contracts §6.5). */
  rubric: RubricRule[];
  saveAs: "sketch";
}
export interface IdentifyEx extends ExBase<"identify"> {
  stimulus: Stimulus;
  cue: Cue;
  answer: AnswerUi;
  correct: Answer;
  partial?: PartialMap;
}
export interface FactEx extends ExBase<"fact"> {
  stimulus?: Stimulus;
  answer: AnswerUi;
  correct: Answer;
  spelling: "strict" | "enharmonic";
  order: "sequence" | "set";
}
export interface KeyboardEx extends ExBase<"keyboard"> {
  answer: Extract<AnswerUi, { ui: "keyboard" }>;
  expect: { midi?: number[]; pcs?: number[]; bassPc?: number; sequence?: number[] };
  pitchMode: PitchMode;
}
export interface StaffReadEx extends ExBase<"staff-read"> {
  /** Strudel code rendered through the notation engine; never hand-written ABC. */
  source: string;
  bars: number;
  answer: AnswerUi;
  correct?: Answer;
  reference?: Reference;
  matcher?: Matcher;
}
export interface StaffWriteEx extends ExBase<"staff-write"> {
  answer: Extract<AnswerUi, { ui: "staff-input" }>;
  expect: StaffExpect;
}
/**
 * What a staff-writing answer is compared with. Pitch only: `pitches` (spelled notes in order or as a set,
 * with or without octave; lengths ignored). Pitch and rhythm: `events` with a reference (code, never
 * hand-written) and an `events` matcher (`pitch: "absolute"`, `rhythm: "onsets"`, `durations: true`).
 * Rhythm only: `rhythm`. A key signature: `key-signature`.
 */
export type StaffExpect =
  | { e: "pitches"; spelled: string[]; order: "sequence" | "set"; withOctave: boolean }
  | { e: "rhythm"; reference: Reference }
  /**
   * The key signature's accidentals (staff-input `mode: "key-signature"`; the response is `answer.text`).
   * `order` (Wave 3): `sequence` also checks the written order (F C G D A E B, or B E A D G C F); default
   * `set`.
   */
  | { e: "key-signature"; key: KeySpec; order?: "sequence" | "set" }
  | { e: "events"; reference: Reference; matcher: Matcher }
  /**
   * Wave 4. Chords built on the staff, one per symbol in order (a chord = the notes that start together).
   * `symbols` are code spellings, slash chords allowed (`C`, `Am`, `Bo`, `Caug`, `C/E`): each chord must
   * hold exactly the symbol's pitch classes, in any octave and any order of stacking. `spelling: "strict"`
   * also checks the letters (`C E G`, never `C F♭ G`; `staff.enharmonic` otherwise). `bass: true` checks
   * the lowest note: the root, or the note after the slash (`harmony.inversion`). Wrong notes are
   * `harmony.pcset`, a chord missing or extra `harmony.missing-chord` / `harmony.extra-chord`. Needs
   * `palette.chords` (`staff.chords-palette`). Tests answer with `{ staff: "[C4,E4,G4]:2 [B3,D4,G4]:2" }`.
   */
  | { e: "chords"; symbols: string[]; spelling: "strict" | "enharmonic"; bass: boolean };
export interface TapEx extends ExBase<"tap"> {
  mode: "along" | "echo" | "read";
  stimulus: Stimulus;
  cue: Cue;
  bars: number;
  target: "beat" | { track?: TrackRef; drum?: DrumRole[] };
  tol: TapTolerance;
}
/**
 * `pitch`, `degree`: one timed target after the cue. `resolution`: a degree, then the path home.
 * `echo`: the target plays first, then the learner sings it back. `sight`: the target is shown (the
 * stimulus with `showStaff`, or the degree numbers) and only the cue plays; Oak plays the target after the
 * attempt. `bassline`: the bass of a progression.
 */
export type SingMode = "pitch" | "degree" | "resolution" | "echo" | "sight" | "bassline";
export interface SingEx extends ExBase<"sing"> {
  mode: SingMode;
  stimulus: Stimulus;
  cue: Cue;
  target: SingTarget;
  tol: SingTolerance;
  showTrace: "live" | "after" | "never";
  /**
   * Wave 3. What the learner sings on and sees under each target: `numbers` ("one, three, five") or
   * `syllables` (movable do, numbers still shown and accepted). Default: `numbers` before U03.L08,
   * `syllables` from U03.L08 on (contracts §8.3); content CI refuses `syllables` before U03.L08.
   */
  labels?: "numbers" | "syllables";
}
export type SingTarget =
  | { from: "stimulus"; track?: TrackRef }
  /**
   * `rhythm` is mini-notation; default one note per beat. `octaves` (Wave 3): one entry per degree, the
   * octave relative to the tonic's (0 = from the tonic up to 7, 1 = the octave above, −1 = below), so
   * 1-3-5-1' is `degrees: ["1","3","5","1"], octaves: [0,0,0,1]`; default all 0. The whole pattern is
   * then moved by octaves into the learner's comfortable range.
   */
  | { from: "degrees"; degrees: Degree[]; rhythm?: string; octaves?: number[] }
  | { from: "reference"; reference: Reference; track: TrackRef };
export type DictationStage = "tonic" | "bass" | "quality" | "rn" | "rhythm" | "pitch";
export interface DictationEx extends ExBase<"dictation"> {
  domain: "rhythm" | "melody" | "bass" | "harmony";
  stimulus: Stimulus;
  cue: Cue;
  answer: AnswerUi;
  stages?: DictationStage[];
  stageWeights?: number[];
  reference: Reference;
  matcher: Matcher;
  given?: { rhythm?: boolean; firstNote?: boolean; harmonicRhythm?: boolean };
  /** Wave 3. A by-ear transcription step: see `ByEarSpec`. Needs `answer: { ui: "code" }`. */
  byEar?: ByEarSpec;
  /**
   * Wave 4. Staged chord dictation (bass, then quality, then numeral): the widget each stage is answered
   * with, keyed by the stages listed in `stages` (`dictation.stage-answers`). Usual widgets: `bass` →
   * `degree-pad` (the bass degree under each chord, 1-based), `quality` → `quality-pad`, `rn` →
   * `rn-palette`, `tonic` → `choice` or `text`. The response is `answer.stages`, one list per stage with
   * one entry per chord (degrees for `bass` when its widget is a degree pad, quality ids, numerals).
   * `answer` stays the widget of a single-stage step and the fallback.
   */
  stageAnswers?: Partial<Record<DictationStage, AnswerUi>>;
  /**
   * Wave 4. `sequential` (the default with `stageAnswers`): a stage opens when the one before passes at
   * `stagePass` or is revealed, so the bass is always heard first. `together`: all stages at once.
   */
  stageFlow?: "sequential" | "together";
  /** Wave 4. Pass mark of each stage in a sequential flow. Default 0.8 (contracts §6.6 X1). */
  stagePass?: number;
}
/**
 * By-ear transcription inside a lesson (U03.L10 on): the source plays with its code, roll and staff
 * hidden; the learner writes code and switches between the source and their own code at the same bar
 * (`A`/`B`, the Transcribe convention), at full speed or slower. Graded by `matcher` (usually `melody`).
 */
export interface ByEarSpec {
  /** A/B between the hidden source and the learner's code, aligned to the bar. */
  ab: boolean;
  /** Playback rates offered for the source, 1 first: `[1, 0.75, 0.5]`. */
  rates: number[];
  /**
   * The transposition rule, shown to the learner before they start, and checked against the matcher's
   * `pitch` by content CI: `exact` = `absolute` (these notes in this octave), `any-octave` = `octave-free`,
   * `any-key` = `transposition-invariant` (the tune in any key; degrees and rhythm decide).
   */
  accepts: "exact" | "any-octave" | "any-key";
  /**
   * Wave 4. A by-ear transcription in parts, one track at a time and in this order: the bass first, then
   * the chords (bass-first, contracts §2.9 L3), or the melody then its chords. Each part is graded on its
   * own track of the learner's code against the same track of the reference (`track`), with its own
   * matcher and pass mark; the next part opens when the one before passes or is revealed. The step's
   * `matcher` grades the whole answer at the end. A part with a harmony or pcset matcher needs a bass part
   * before it (`by-ear.bass-first`).
   */
  parts?: ByEarPart[];
}
export interface ByEarPart {
  /** The track label in both the reference and the learner's code: `bass`, `chords`, `mel`. */
  track: TrackRef;
  /** What the learner is asked for: "The bass: one note per bar". */
  label: Md;
  matcher: Matcher;
  /** Default: the kind's pass mark (0.85). */
  pass?: number;
}
/**
 * Wave 4. What a transcription step or phrase check tells the learner before they start (contracts §6.6
 * X1, §6.11 rule 6): the meter, the key and its tonic, where the pickup falls, and the rhythm skeleton of a
 * phrase (code, played and shown as rhythm only).
 */
export interface TranscribeGiven {
  meter?: boolean;
  key?: boolean;
  tonic?: boolean;
  pickup?: boolean;
  /** Code whose onsets are the phrase's rhythm (one pitch); shown on a rhythm staff and playable. */
  rhythmSkeleton?: string;
}
/** Wave 4. One stage of a staged chord transcription (bass, then quality, then numerals). */
export interface TranscribeStage {
  stage: "bass" | "quality" | "rn";
  matcher: Matcher;
  pass: number;
}
export interface TranscribeStepEx extends ExBase<"transcribe-step"> {
  projectId: string;
  ladder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  stimulus: Stimulus;
  layer: Layer | "form";
  bars: [number, number];
  grading:
    | {
        mode: "auto";
        reference: Reference;
        matcher: Matcher;
        /** Wave 4. Staged chords, in order (bass → quality → rn); each must reach its pass mark. */
        stages?: TranscribeStage[];
      }
    | { mode: "self"; checklist: { id: string; label: Md }[] };
  studio: { minRate: number; transposeSemis?: boolean; overlay: boolean };
  /** Wave 4. What the learner is told before starting. */
  given?: TranscribeGiven;
}
export interface ComposeBriefEx extends ExBase<"compose-brief"> {
  brief: Md;
  /** Flavours offered for this brief. A flavour never changes a rubric (contracts §5.10 rule 7). */
  flavours?: FlavourId[];
  code: CodeSpec;
  rubric: RubricRule[];
  minDurationSec?: number;
  album?: { slot: string };
  /** The review runs on the `review` thread at its fixed effort (contracts §10.2). */
  review: { tutor: "auto" | "offer" };
}
export interface ListenEx extends ExBase<"listen"> {
  /** At least one item, unless `passive` is set. */
  items: { code: string; caption: Md; bars: number }[];
  /** Wave 3. A passive-listen block (contracts U04.L04): see `PassiveListen`. */
  passive?: PassiveListen;
}
/**
 * A passive-listen block: a stream of generated examples from a drill family, each labelled as it plays
 * (`with`) or just after (`after`), with no answer asked. The learner only listens; the block completes
 * when the stream ends (or on Continue). It feeds no evidence and no SRS. Played from the family's
 * generator at `level`, `items` examples, `gapBeats` of silence between them.
 */
export interface PassiveListen {
  family: FamilyId;
  level: number;
  items: number;
  reveal: "with" | "after";
  gapBeats: number;
}
/** Multi-part step graded as one check: every part must pass. Parts may be any non-'all' kind. */
export interface AllEx extends ExBase<"all"> {
  parts: Exclude<Exercise, AllEx>[];
  weights?: number[];
}

export type Exercise =
  | PredictEx
  | RunInvestigateEx
  | CodeModifyEx
  | CodeFillEx
  | ParsonsEx
  | ErrorHuntEx
  | CodeMakeEx
  | IdentifyEx
  | FactEx
  | KeyboardEx
  | StaffReadEx
  | StaffWriteEx
  | TapEx
  | SingEx
  | DictationEx
  | TranscribeStepEx
  | ComposeBriefEx
  | ListenEx
  | AllEx;
export type ExerciseKind = Exercise["kind"];
export type ExerciseOf<K extends ExerciseKind> = Extract<Exercise, { kind: K }>;

export const EXERCISE_KINDS = [
  "predict",
  "run-investigate",
  "code-modify",
  "code-fill",
  "parsons",
  "error-hunt",
  "code-make",
  "identify",
  "fact",
  "keyboard",
  "staff-read",
  "staff-write",
  "tap",
  "sing",
  "dictation",
  "transcribe-step",
  "compose-brief",
  "listen",
  "all",
] as const satisfies readonly ExerciseKind[];

/** Default pass threshold per kind (exercises §1.1, contracts §6.5, §6.12, §8). `null` = completion only. */
export const DEFAULT_PASS: Readonly<Record<ExerciseKind, number | null>> = {
  predict: null,
  "run-investigate": 1,
  "code-modify": 1,
  "code-fill": 1,
  parsons: 1,
  "error-hunt": 1,
  "code-make": 1,
  identify: 1,
  fact: 1,
  keyboard: 1,
  "staff-read": 1,
  "staff-write": 1,
  tap: 0.9,
  sing: 0.8,
  dictation: 0.85,
  "transcribe-step": 0.85,
  "compose-brief": 1,
  listen: null,
  all: 1,
};

/** Kinds whose answer is Strudel code evaluated by the grader. */
export const CODE_KINDS = [
  "code-modify",
  "code-fill",
  "error-hunt",
  "code-make",
  "compose-brief",
] as const satisfies readonly ExerciseKind[];
/** Kinds allowed to have `hints: null` regardless of role. */
export const HINTLESS_KINDS = ["predict", "listen"] as const satisfies readonly ExerciseKind[];

// --- Wave 4 standard options ---------------------------------------------------------------------

/**
 * The function strip's options (`slot-choice`, contracts §4 H02). Labels are the words U06.L03 teaches; a
 * lesson that comes earlier must not show them (check 14 reads choice labels).
 */
export const FUNCTION_OPTIONS: readonly Choice[] = [
  { id: "T", label: "T: home (tonic)" },
  { id: "PD", label: "PD: away (predominant)" },
  { id: "D", label: "D: tension (dominant)" },
];
/**
 * The cadence options (contracts §6.6 C2 and §7.3 `fam.har.cadence`), ids from `CADENCE_TYPES`. A lesson
 * offers only the ones taught by then: PAC, IAC and HC from U06.L04, PC and DC from U06.L06–L07.
 */
export const CADENCE_OPTIONS: readonly Choice[] = [
  { id: "PAC", label: "Perfect authentic (V–I, melody on 1)" },
  { id: "IAC", label: "Imperfect authentic (V–I, melody not on 1)" },
  { id: "HC", label: "Half cadence (ends on V)" },
  { id: "PC", label: "Plagal (IV–I)" },
  { id: "DC", label: "Deceptive (V–vi)" },
];

// --- Wave 5 standard options ---------------------------------------------------------------------

/** "Straight or swung" (U11.L07; the drill is `fam.rhy.swing`): an `identify` with these options, from U11.L07. */
export const FEEL_OPTIONS: readonly Choice[] = [
  { id: "straight", label: "Straight: even eighths" },
  { id: "swung", label: "Swung: long–short eighths" },
];
/**
 * "Which minor" (U10.L06–L08): natural, harmonic or melodic. Offer only the ones taught by then: natural from
 * U10.L01, harmonic from U10.L06, melodic from U10.L08 (check 14 reads option labels).
 */
export const MINOR_OPTIONS: readonly Choice[] = [
  { id: "minor", label: "Natural minor (♭3 ♭6 ♭7)" },
  { id: "harmonic minor", label: "Harmonic minor (♭3 ♭6, raised 7)" },
  { id: "melodic minor", label: "Melodic minor (♭3, raised 6 and 7)" },
];
/** Scale colours of U11 (ear steps that name a scale by its sound): ids are `ScaleMode`s. Offer each only from its lesson. */
export const SCALE_COLOUR_OPTIONS: readonly Choice[] = [
  { id: "major pentatonic", label: "Major pentatonic (1 2 3 5 6)" },
  { id: "minor pentatonic", label: "Minor pentatonic (1 ♭3 4 5 ♭7)" },
  { id: "blues", label: "Blues (1 ♭3 4 ♭5 5 ♭7)" },
];

// --- tests --------------------------------------------------------------------------------------

export type TestResponse =
  | { code: string }
  | { blanks: Record<string, string> }
  | { order: string[] }
  | { answer: Answer }
  /** Seconds relative to the stimulus start. */
  | { taps: number[] }
  /** `tests/fixtures/sing/*.json` frames. */
  | { pitchFixture: string }
  /** Note-list DSL: 'C4:4 D4:8 …'. */
  | { staff: string }
  | { click: CodeRange | string };
export interface TestCase {
  name: string;
  response: TestResponse;
  /** Pinned param values; without them CI runs the test with 5 seeds. */
  params?: ParamValues;
  expect: "pass" | "fail" | "error";
  score?: [number, number];
  feedback?: FeedbackId[];
}
