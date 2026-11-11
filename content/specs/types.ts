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
  SkillId,
  StepKind,
  TermId,
  UnlockableId,
} from "@oak/content-kit";

/** Who writes the lesson in Wave 2 (the Build-phase ownership table). */
export type Author = "content-lead" | "U00" | "U01a" | "U01b" | "U02a" | "U02b";

export interface StepSpec {
  kind: StepKind;
  /** The exercise kind (absent for concept, see, reflect). `all` lists its parts in `parts`. */
  exercise?: ExerciseKind;
  parts?: ExerciseKind[];
  /** The answer widget(s) the step needs from the app (AnswerUi kinds). */
  answer?: AnswerUiKind[];
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
  }[];
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

export interface CapstoneSpec {
  id: string;
  author: Author;
  /** The brief as the learner reads it is in content/capstones.ts; this is the authoring intent. */
  intent: string;
  notes: string[];
}

export interface UnitSpec {
  unit: string;
  title: string;
  summary: string;
  lessons: LessonSpec[];
  checkpoint?: CheckpointSpec;
  capstones: CapstoneSpec[];
  /** Cross-lesson notes: the arc of the unit, shared conventions, things every author must know. */
  conventions: string[];
}
