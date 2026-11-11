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
    }
  /** A lesson step reusing a drill generator. */
  | { src: "generator"; family: FamilyId; level: number; seed?: number }
  /** `content/repertoire/<song-id>/song.ts` (public domain). */
  | { src: "tune"; tuneId: SongId; bars: [number, number]; layers?: Layer[] }
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
      palette: { durations: string[]; accidentals: boolean; ties: boolean; rests: boolean };
    }
  | { ui: "grid"; rows: DrumRole[] | ["hit"]; stepsPerBar: 8 | 12 | 16; bars: number }
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
      rhythm: "exact" | "onsets" | "ignore";
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
  /** Every member must pass; score = weighted mean. */
  | { m: "all"; of: Matcher[]; weights?: number[] };
export type MatcherName = Matcher["m"];

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
  target: { audible: boolean; showRoll?: boolean };
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
export type StaffExpect =
  | { e: "pitches"; spelled: string[]; order: "sequence" | "set"; withOctave: boolean }
  | { e: "rhythm"; reference: Reference }
  | { e: "key-signature"; key: KeySpec }
  | { e: "events"; reference: Reference; matcher: Matcher };
export interface TapEx extends ExBase<"tap"> {
  mode: "along" | "echo" | "read";
  stimulus: Stimulus;
  cue: Cue;
  bars: number;
  target: "beat" | { track?: TrackRef; drum?: DrumRole[] };
  tol: TapTolerance;
}
export type SingMode = "pitch" | "degree" | "resolution" | "echo" | "sight" | "bassline";
export interface SingEx extends ExBase<"sing"> {
  mode: SingMode;
  stimulus: Stimulus;
  cue: Cue;
  target: SingTarget;
  tol: SingTolerance;
  showTrace: "live" | "after" | "never";
}
export type SingTarget =
  | { from: "stimulus"; track?: TrackRef }
  /** `rhythm` is mini-notation; default one note per beat. */
  | { from: "degrees"; degrees: Degree[]; rhythm?: string }
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
}
export interface TranscribeStepEx extends ExBase<"transcribe-step"> {
  projectId: string;
  ladder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  stimulus: Stimulus;
  layer: Layer | "form";
  bars: [number, number];
  grading:
    | { mode: "auto"; reference: Reference; matcher: Matcher }
    | { mode: "self"; checklist: { id: string; label: Md }[] };
  studio: { minRate: number; transposeSemis?: boolean; overlay: boolean };
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
  items: { code: string; caption: Md; bars: number }[];
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
