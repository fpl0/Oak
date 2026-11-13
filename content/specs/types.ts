// Unit specs as data (AUTHORING §1 step 1): what each lesson of a unit must teach and how, written by the
// content lead before the lessons, and checked by content/validate/specs.test.ts against the registries
// (syllabus, skill graph, toolbox, terms, can-dos, families, decks, bands). `bun scripts/content/spec.ts` renders
// them to content/specs/Uxx.md, the document authors read; the test fails when the two drift apart.
import type {
  AnswerUiKind,
  BandId,
  CanDoId,
  DeckId,
  ExerciseKind,
  FactId,
  FamilyId,
  KeySpec,
  LessonId,
  MeterId,
  RubricRuleName,
  SchemaFeature,
  SkillId,
  SongId,
  StepKind,
  TermId,
  UnlockableId,
  WorkbenchPanelId,
} from "@oak/content-kit";

/** Who writes the lesson (the Build-phase ownership tables of Waves 2 and 3). */
export type Author =
  | "content-lead"
  | "U00"
  | "U01a"
  | "U01b"
  | "U02a"
  | "U02b"
  | "U03a"
  | "U03b"
  | "U03c"
  | "U03d"
  | "U04"
  | "CP"
  // Wave 4 (wave4.md ownership): the exemplars are the content lead's (U05.L01) and the spec writers'
  // (U06.L02, U07.L08); the rest go to the thirteen Build authors.
  | "spec-U06"
  | "spec-U07"
  | "U05a"
  | "U05b"
  | "U05c"
  | "U05d"
  | "U06a"
  | "U06b"
  | "U06c"
  | "U06d"
  | "U07a"
  | "U07b"
  | "U07c"
  | "U07d"
  | "songs";

/**
 * The Wave 3 schema a step uses (AUTHORING §16), so the author and the app engineers know which new shape
 * it needs: staff writing with a key signature, a key signature in order, a sung degree pattern or
 * sight-singing, by-ear transcription, a passive-listen block, the target roll after a failed try.
 */
export type Wave3Kind =
  | "staff-write+key"
  | "key-signature"
  | "sing-degrees"
  | "sight-sing"
  | "by-ear"
  | "passive-listen"
  | "reveal-roll"
  | "staff-labels";

/**
 * A repertoire fragment a lesson uses (contracts §2.8): the tune as degrees in the teaching key, and the
 * same notes spelled as letters in the key of the cited source. content/validate/specs.test.ts evaluates
 * both with headless Strudel and requires the same pitches and onsets, no pickup (the fragment starts at
 * the bar line or with a rest), no dotted or tied value, nothing over a bar line.
 */
export interface RepertoireSpec {
  song: SongId;
  /** Which bars, in words: "the first phrase, from the first full bar". */
  fragment: string;
  /** `n()` mini-notation in `key` (the teaching key, a `.scale()` argument). */
  degrees: string;
  key: string;
  /** The same tune as note names in `sourceKey` (the key of the cited edition). */
  letters: string;
  sourceKey: string;
  bars: number;
  /** How the setting differs from the source: "plain rhythm: the dotted quarter and eighth are two quarters". */
  setting: string;
}

export interface StepSpec {
  kind: StepKind;
  /** The exercise kind (absent for concept, see, reflect). `all` lists its parts in `parts`. */
  exercise?: ExerciseKind;
  parts?: ExerciseKind[];
  /** The answer widget(s) the step needs from the app (AnswerUi kinds). */
  answer?: AnswerUiKind[];
  /** Wave 3 schema the step uses (rendered with the step; AUTHORING §16). */
  wave3?: Wave3Kind[];
  /**
   * Wave 4 shapes inside a kind that the step needs (AUTHORING §17): checked against `IMPLEMENTED` plus
   * `PLANNED`, so the Build phase knows what must land before the lesson can pass.
   */
  features?: SchemaFeature[];
  /** Workbench panels the step opens (`StepUi.initialPanels`); each must be unlocked at the lesson. */
  panels?: WorkbenchPanelId[];
  minutes: number;
  graded?: boolean;
  optional?: boolean;
  /** What happens in the step, in one or two sentences, with the musical example if it matters. */
  what: string;
  /** Term(s) introduced in this step's pass text (a `concept` or `see` step has none: it has no pass text). */
  term?: TermId | TermId[];
}

export interface LessonSpec {
  id: LessonId;
  author: Author;
  /** The one idea, as the learner would say it afterwards. */
  idea: string;
  /** What the learner hears in the first 30 seconds, and the code that plays it. */
  hook: { hear: string; code: string; preview?: boolean };
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  canDo: CanDoId[];
  /** Tools the lesson's learner-facing code uses (starters, solutions, the Make). Checked: unlocked here. */
  uses: UnlockableId[];
  steps: StepSpec[];
  /** 1-based index of the "save & wrap" step (the 15-minute split). */
  wrapAt: number;
  make: {
    brief: string;
    required: { rule: RubricRuleName; label: string; why: string };
    suggestions: string[];
    band: BandId | false;
    tracks?: ("drums" | "bass" | "chords")[];
    flavours: string;
  };
  srs: {
    family?: FamilyId;
    deck?: DeckId;
    cards?: FactId[];
    mode: "seed" | "review-if-due" | "evidence-only";
    /** The family level the lesson's step plays (generator stimulus) or the engine starts at. */
    level?: number;
  }[];
  /** What the learner sings on in this lesson's sing steps (contracts §8.3: numbers until U03.L08). */
  singOn?: "numbers" | "syllables";
  /** Repertoire fragments the lesson plays or asks for (contracts §2.8). */
  repertoire?: RepertoireSpec[];
  /** Graded-step feedback the author must make sure the tests pin (the realistic mistakes). */
  mistakes: string[];
  connects: { back: string; forward: string };
  notes?: string[];
}

export interface CheckpointSpec {
  id: string;
  author: Author;
  authored: { id: string; kind: ExerciseKind; skills: SkillId[]; what: string }[];
  recipe: { items: [number, number]; families: Partial<Record<SkillId, FamilyId[]>>; why: string };
  make: { brief: string; required: string };
  notes: string[];
}

/**
 * Wave 4: one session of a multi-session capstone (contracts §2.4, §6.6; content-kit `CapstoneSessionDef`),
 * as the capstone flow runs it and the learner meets it.
 */
export interface CapstoneSessionSpec {
  /** `C2.S1`. */
  id: string;
  /** The session's goal, contracts §2.4 word for word (`CapstoneSessionDef.goal`). */
  goal: string;
  /** What the session opens with: the starter, the draft from last time, the facts the learner is given. */
  opens: string;
  /** What the learner hears. */
  hear: string;
  /** What the learner sees: the workspace, its panels, the checklist. */
  see: string;
  /** The work, in order. */
  work: string[];
  /** What is checked in this session, with the pass marks. */
  checks: string[];
  /** How the session ends: the draft saved (the Make), a review offered, the release. */
  ends: string;
}

export interface CapstoneSpec {
  id: string;
  author: Author;
  /** The brief as the learner reads it is in content/capstones.ts; this is the authoring intent. */
  intent: string;
  notes: string[];
  /** Wave 4: when it opens and what the learner is told while it is closed. */
  opens?: string;
  /** Wave 4: the Band under the learner's draft (or why there is none). */
  band?: string;
  /** Wave 4: the sessions, in order. */
  sessions?: CapstoneSessionSpec[];
  /** Wave 4: what the deterministic liner notes say about this track, and the learner's own inputs. */
  linerNotes?: string[];
  /** Wave 4: the tests the brief or the checks must carry (content:check runs them). */
  tests?: string[];
}

/** Wave 4: one rung of the transcription ladder (contracts §2.9) as the gym serves it. */
export interface LadderLevelSpec {
  /** 1–8; the title and the "first available" lesson are read from content/gym. */
  level: number;
  /** What one item is: how long, which layers, which keys and tempos. */
  material: string;
  /** How the item is made: generated by @oak/drills, drawn from the repertoire, or the learner's audio. */
  source: string;
  /** What the learner is given before starting (contracts §6.12: tempo, meter, key, pickup). */
  given: string;
  /** How it is graded and the pass mark. */
  grading: string;
}

/** Wave 4: the Transcription Gym (contracts §2.5, §2.9, §6.12), specified once, where it starts. */
export interface GymSpec {
  summary: string;
  /** The slot rule and what fills a slot. */
  slots: string[];
  /** What a gym session contains at each daily target (contracts §9.1). */
  budget: { target: 15 | 20 | 25; minutes: number; contains: string }[];
  ladder: LadderLevelSpec[];
  /** Realism levels and how they move. */
  realism: string[];
  /** When the learner moves up a ladder level (and down). */
  levelUp: string[];
  /** The even slots: the learner's own audio. */
  ownAudio: string[];
  notes: string[];
}

export interface UnitSpec {
  unit: string;
  title: string;
  summary: string;
  lessons: LessonSpec[];
  checkpoint?: CheckpointSpec;
  capstones: CapstoneSpec[];
  /** Wave 4: the Transcription Gym, in the spec of the unit where its slots start (U07). */
  gym?: GymSpec;
  /** Cross-lesson notes: the arc of the unit, shared conventions, things every author must know. */
  conventions: string[];
}
