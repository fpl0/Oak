// Lesson, unit, checkpoint, capstone, gym and syllabus types (contracts §2, §5.8, §7.6).
import type {
  BandId,
  CanDoId,
  CapstoneId,
  CapstoneSessionId,
  CheckpointId,
  FamilyId,
  FlavourId,
  LessonId,
  SessionId,
  SkillId,
  SongId,
  SoundId,
  StepLocalId,
  TermId,
  TrackId,
  UnitId,
} from "../ids.ts";
import type { KeySpec, Layer, Md, MeterId, PickupSpec, SwingSpec } from "./common.ts";
import type { CodeMakeEx, ComposeBriefEx, Exercise, TranscribeStepEx } from "./exercise.ts";

/** Presentation only (UX §3.2). The warm-up and the Coda are engine-driven and never authored as steps. */
export const STEP_KINDS = [
  "listen",
  "predict",
  "run",
  "investigate",
  "see",
  "concept",
  "modify",
  "parsons",
  "quiz",
  "ear",
  "sing",
  "tap",
  "dictate",
  "notate",
  "compare",
  "make",
  "reflect",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface StepUi {
  panels: { roll: boolean; staff: false | "treble" | "bass" | "grand" | "perc" | "lead"; keyboard: boolean };
  rollLabels?: "none" | "note" | "degree" | "degree+solfege";
  /**
   * Wave 3. Labels under the notes on the staff panel (ux "degree lyrics"): `note` names, 1-based
   * `degree` numbers, or `degree+solfege`. Default by unit (AUTHORING §6): none before U03.L02, `degree`
   * from U03.L02 (when `tb.feature.degree-labels` unlocks), `degree+solfege` from U03.L08.
   */
  staffLabels?: "none" | "note" | "degree" | "degree+solfege";
  loopBars?: number;
  /** From U01 every Make declares a Band; `false` only when silence around the part is the point. */
  band?: BandRef | false;
}
export interface BandRef {
  band: BandId;
  /** The Band takes the tonic and mode of the learner's first `.scale()` after each evaluation. */
  followsLearnerKey?: boolean;
  tracks?: readonly ("drums" | "bass" | "chords")[];
}
/** Glossary entry; a fact card only if a later lesson tests it. */
export interface TermDef {
  id: TermId;
  step: StepLocalId;
  card?: { testedIn: LessonId };
}
export interface StepExample {
  /** Slug; global ID `${lesson}@${id}`. */
  id: string;
  code: string;
  bars: number;
  /** Read-only, may use locked tools, never the target of a graded step. */
  preview?: boolean;
}
export interface StepDef {
  id: StepLocalId;
  kind: StepKind;
  title: string;
  /** The author's expert estimate, in steps of 0.25; CI applies the 1.4 factor (contracts §9.2). */
  minutes: number;
  ui: StepUi;
  /** Absent for concept, see, reflect. */
  exercise?: Exercise;
  example?: StepExample;
  /** True for the lesson's ≤ 3 graded checks. */
  graded?: boolean;
  /** Stretch step, shown only at the 25-minute target. */
  optional?: boolean;
  /** Contracts §9.5: a pure code-mechanics `modify` step may let the learner skip scaffold steps. */
  testOut?: { skips: StepLocalId[] };
}
export interface LessonDef {
  id: LessonId;
  /** Bumps on any change. */
  version: number;
  title: string;
  objective: string;
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  swing?: SwingSpec;
  pickup?: PickupSpec;
  introduces: SkillId[];
  practises: SkillId[];
  /** ≤ 3. */
  terms: TermDef[];
  canDo: CanDoId[];
  flavours?: Partial<Record<FlavourId, { band?: BandId; sounds?: Record<string, SoundId> }>>;
  /** ≤ 12; the last is kind 'make'. */
  steps: StepDef[];
  /** The "save & wrap" midpoint (contracts §9.4). */
  wrapAt: StepLocalId;
}

/** Which exercise kinds a step kind may carry (contracts §5.8). An empty list means "no exercise". */
export const STEP_EXERCISE_KINDS: Readonly<Record<StepKind, readonly Exercise["kind"][]>> = {
  listen: ["listen"],
  predict: ["predict"],
  run: ["run-investigate"],
  investigate: ["run-investigate"],
  see: [],
  concept: [],
  reflect: [],
  modify: ["code-modify", "code-fill", "error-hunt", "all"],
  parsons: ["parsons"],
  quiz: ["fact", "keyboard", "staff-read", "identify", "all"],
  ear: ["identify", "dictation", "all"],
  sing: ["sing", "all"],
  tap: ["tap"],
  dictate: ["dictation", "transcribe-step"],
  notate: ["staff-write"],
  compare: ["identify"],
  make: ["code-make", "compose-brief"],
};

// --- syllabus -----------------------------------------------------------------------------------

/** One row of the course map (contracts §2.3). `content/syllabus.ts` is written from those tables. */
export interface LessonMeta {
  id: LessonId;
  title: string;
  objective: string;
  /** Skill nodes whose first lesson this is, in teaching order. */
  introduces: SkillId[];
  practises: SkillId[];
  /** Optional side lesson (A1.L01 to L04) or the one lesson that can be passed over (J2.L04). */
  optional?: boolean;
}
export interface UnitDef {
  id: UnitId;
  title: string;
  track: "core" | TrackId;
  lessons: LessonMeta[];
  /** The checkpoint that closes this unit, if it has one. */
  checkpoint?: CheckpointId;
  /** Default meter of the unit's lessons when a lesson does not say otherwise. */
  meter?: MeterId;
}
export interface TrackDef {
  id: TrackId;
  title: string;
  units: UnitId[];
  checkpoints: CheckpointId[];
  capstones: CapstoneId[];
}
/** What must be true for something to open (contracts §2.4, §4.3, §7.6). All listed conditions must hold. */
export interface GateSpec {
  /** Passed or soft-passed. */
  checkpoints?: CheckpointId[];
  lessonsCompleted?: LessonId[];
  /** Released capstones. */
  capstones?: CapstoneId[];
  familyLevels?: { family: FamilyId; level: number }[];
}
export interface TrackGate {
  gate: GateSpec;
  opens: (LessonId | UnitId | CapstoneId)[];
}
export interface SyllabusDef {
  units: UnitDef[];
  tracks: TrackDef[];
  checkpoints: CheckpointMeta[];
  capstones: CapstoneMeta[];
  trackGates: TrackGate[];
  /** The default linear order of the core (contracts §2.5), gym slots included as `GYM.nn`. */
  defaultOrder: SessionId[];
}

// --- checkpoints --------------------------------------------------------------------------------

export interface CheckpointMeta {
  id: CheckpointId;
  title: string;
  /** Units whose lessons it covers (U09.CP covers U08 and U09). */
  covers: UnitId[];
  /** Counted in the pass score: fact, concept and creative skills. */
  gated: SkillId[];
  /** Perceptual and production skills: set the level, never block. */
  levelSetting: SkillId[];
}
/** `content/core/U03/CP/checkpoint.ts`: authored items plus a generator recipe. */
export interface CheckpointDef extends CheckpointMeta {
  version: number;
  /** 2 to 3 authored items; every exercise has role 'checkpoint' and `hints: null`. */
  authored: Exercise[];
  /** 12 to 18 items in all, at least 2 per skill in range, generated fresh at each skill's mastery level. */
  recipe: {
    items: [min: number, max: number];
    perSkillMin: number;
    families: Partial<Record<SkillId, FamilyId[]>>;
  };
  /** "A groove or melody using this unit's tools"; counts as one item. */
  make: CodeMakeEx;
}

// --- capstones ----------------------------------------------------------------------------------

export interface CapstoneMeta {
  id: CapstoneId;
  title: string;
  objective: string;
  sessions: number;
  opensAfter: GateSpec;
  /** Runs in gym slots (CF-T). */
  inGymSlots?: boolean;
  kind: "compose" | "transcribe";
}
export interface CapstoneSessionDef {
  id: CapstoneSessionId;
  title: string;
  goal: Md;
  /** Compose capstones: which rubric rules this session works towards. Transcribe: the stage exercises. */
  focusRules?: string[];
  stages?: TranscribeStepEx[];
}
/** `content/core/capstones/C2/capstone.ts`: brief, rubric, sessions. Prose lives in `brief.mdx`. */
export interface CapstoneDef extends CapstoneMeta {
  version: number;
  key?: KeySpec;
  meter: MeterId;
  bpm?: [min: number, max: number];
  swing?: SwingSpec;
  /** Compose capstones. The rubric never changes with the flavour. */
  brief?: ComposeBriefEx;
  /** Transcribe capstones (X1, X2, CF-T). */
  song?: SongId[];
  sessionDefs: CapstoneSessionDef[];
  /** How many revisions a tutor review must propose (contracts §10.6): 1 for C0 to C4 and X1, else 2. */
  reviewRevisions: 1 | 2;
  canDo: CanDoId[];
  flavours?: Partial<Record<FlavourId, { band?: BandId; sounds?: Record<string, SoundId> }>>;
}

// --- gym and the transcription ladder -----------------------------------------------------------

export type LadderLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type RealismLevel = 0 | 1 | 2 | 3 | 4;
export interface LadderLevelDef {
  level: LadderLevel;
  title: string;
  material:
    | "generated-drums"
    | "generated-bass"
    | "generated-loop"
    | "generated-melody"
    | "pd-folk"
    | "pd-standard"
    | "own-audio"
    | "full-arrangement";
  grading: "auto" | "self";
  layers: (Layer | "form")[];
  /** L1 to L4: the generator; never authored by hand. */
  generator?: string;
  /** L5, L6, L8: the song pool. */
  pool?: SongId[];
  pass: number;
}
/** A Transcribe project template for the learner's own audio (the `tb.feature.transcribe.*` modes). */
export interface GymTemplate {
  id: string;
  title: string;
  layers: (Layer | "form")[];
  starter: string;
  checklist: { id: string; label: Md }[];
}
