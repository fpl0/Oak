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
  ToolId,
  TrackId,
  UnitId,
} from "../ids.ts";
import type { KeySpec, Layer, Md, MeterId, PickupSpec, SwingSpec, TrackRef } from "./common.ts";
import type {
  CodeMakeEx,
  ComposeBriefEx,
  Exercise,
  Matcher,
  TranscribeGiven,
  TranscribeStepEx,
} from "./exercise.ts";

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
  /**
   * Wave 4. Workbench panels open when the step starts, so a feature is shown inside a lesson (the key
   * panel in a key lesson, the chord band once Roman numerals are taught). Each one must be unlocked at the
   * lesson in every legal order (`WORKBENCH_PANEL_TOOLS`; content check 4). The learner can close it.
   */
  initialPanels?: WorkbenchPanelId[];
  /**
   * Wave 4. The staff panel shows a lead sheet (`panels.staff: "lead"`, `lead-sheet.staff-panel`): the
   * melody on one treble staff with the chord symbols above it, in the lesson's meter, with the pickup bar
   * when the lesson or exercise declares `pickup`. Used for "play / sing from the page" (U07.L09).
   */
  leadSheet?: LeadSheetSpec;
  /**
   * Wave 5. A visual probe drawn beside the sound (A1, feature `step.probe`): the `filter` response curve of
   * the learner's filter controls (cutoff, resonance, filter envelope), the `envelope` shape of the amp
   * envelope (attack, decay, sustain, release), or the `harmonics` of a wave as bars (partials). It reads the
   * controls of `track` (default: the first pitched track) after each run. Each needs its toolbox row
   * unlocked at the lesson (`PROBE_TOOLS`, content check 4).
   */
  probe?: { kind: ProbeKind; track?: TrackRef };
}
/** Wave 5. The probes a step can draw (`StepUi.probe`). */
export const PROBE_KINDS = ["filter", "envelope", "harmonics"] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];
/** Wave 5. The toolbox row each probe needs (contracts §3.2 group H). */
export const PROBE_TOOLS: Readonly<Record<ProbeKind, ToolId>> = {
  filter: "tb.lpf",
  envelope: "tb.adsr",
  harmonics: "tb.partials",
};
/**
 * Wave 4. A Workbench panel a step can open (`StepUi.initialPanels`). `key`: the key-signature panel;
 * `circle`: the circle of fifths; `chords`: the chord band over the roll (symbols, and numerals from
 * U06.L02); `function`: the T/PD/D bands; `range`: the range lens; `chord-tones`: the chord-tone lens.
 * Wave 5: `form`: the form map (sections over the bars, U09.L02); `scope`: Oak's scope panel (the wave of the
 * master bus, A1.L01; contracts §3.1 rule 9); `spectrum`: Oak's spectrum panel (A2.L01). Opening one of
 * these is feature `panel.wave5`.
 */
export const WORKBENCH_PANELS = [
  "key",
  "circle",
  "chords",
  "function",
  "range",
  "chord-tones",
  "form",
  "scope",
  "spectrum",
] as const;
export type WorkbenchPanelId = (typeof WORKBENCH_PANELS)[number];
/** The toolbox row each panel needs (contracts §3.2 group A). */
export const WORKBENCH_PANEL_TOOLS: Readonly<Record<WorkbenchPanelId, ToolId>> = {
  key: "tb.feature.keysig",
  circle: "tb.feature.circle",
  chords: "tb.feature.rn",
  function: "tb.lens.function",
  range: "tb.lens.range",
  "chord-tones": "tb.lens.chord-tones",
  form: "tb.lens.form",
  scope: "tb.scope",
  spectrum: "tb.fscope",
};
/** Wave 4. What a lead sheet shows (`StepUi.leadSheet`). */
export interface LeadSheetSpec {
  /** The melody track of the step's code (default `@melody`). */
  melody?: TrackRef;
  /**
   * Where the chord symbols come from: a chord track of the code (`chords`, `band.chords`), read from its
   * `chord()` symbols or named from its stacked notes, or a fixed chart (code spellings, slash chords
   * allowed), one entry per change: bar 1-based (0 = the pickup bar), beat 1-based.
   */
  chords: TrackRef | { chart: { bar: number; beat: number; symbol: string }[] };
  /** The song or sketch title printed above the first line. */
  title?: string;
  /** Degree numbers under the melody (the U07 default is off). */
  degrees?: boolean;
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
  /**
   * Wave 4. The voicing gate's second chance (contracts §3.1 rule 6): this step runs only while the gate
   * condition of the gated tools is unmet, and the lesson cannot complete until its exercise passes at the
   * condition's `minScore`, unrevealed. Its exercise is one of the condition's `variants`. Only U05.L08 S1
   * (content check 4, `step.gate-check`); the gated tools stay locked in the lesson until it passes.
   */
  gateCheck?: true;
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
  /**
   * Wave 5. A side lesson (A1.L01–L04, contracts §2.6, §4.3): outside the default order, offered from its
   * track gate on (U03.L02 completed) and never required by anything. It is written for a learner who has
   * only the tools and terms of its gate plus what the side lesson itself (and the side lessons before it)
   * introduces, so a learner at U03 and a learner at U11 can both follow it; content CI checks it at the
   * earliest legal point (the gate). Implies `optional`.
   */
  side?: boolean;
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
  /**
   * Wave 4. Transcribe capstones whose learner picks the song (X1): the checks of this session, phrase by
   * phrase, resolved against the chosen song's answer key (`SongDef.answerKey.phrases` and `layers`).
   */
  checks?: PhraseCheck[];
  /**
   * Wave 4. The session's work is a draft of the piece (compose) or of the transcription; `starter` is the
   * code a first session opens with (default: the brief's starter). A later session opens the draft the
   * session before saved.
   */
  starter?: string;
  /** Wave 4. The tutor review is offered at the end of this session (contracts §10.6). */
  review?: boolean;
  /** Wave 4. This session ends by releasing the piece to the album (cover, liner notes, version). */
  release?: boolean;
}
/**
 * Wave 4. One graded check of a transcribe capstone, against the song the learner picked: a phrase's
 * melody by ear (`melody`, `pitch: "key-relative"`, pass 0.85 in X1), or its chords bass-first (`chords`
 * with `stages`, pass 0.80 per stage). A revealed check earns no evidence and is named in the liner notes.
 */
export interface PhraseCheck {
  /** Slug, unique in the capstone. */
  id: string;
  /** 1-based phrase of `SongDef.answerKey.phrases`; `[from, to]` for several phrases checked together. */
  phrase: number | [number, number];
  layer: "melody" | "bass" | "chords";
  matcher: Matcher;
  pass: number;
  /** Chords only: bass → quality → rn, each graded and passed in order before the next opens. */
  stages?: ("bass" | "quality" | "rn")[];
  /** What the learner is told first (X1: meter, key, tonic, pickup, the rhythm skeleton of phrase 1). */
  given?: TranscribeGiven;
  /**
   * Wave 5. Checks of the same capstone that must pass (or be revealed) before this one opens (feature
   * `capstone.check-after`): X2's changes open after its bass, its melody after the changes (contracts §6.6
   * "stages in that order"). Each id names a check defined earlier in the capstone.
   */
  after?: string[];
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
