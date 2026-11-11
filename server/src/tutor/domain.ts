// Data shapes that cross the tutor's ports. Everything named *Source or Raw* is UNREDACTED: it may
// hold reference solutions and expected values. Such values never leave the server as they are;
// they go through redaction.ts first (contracts §10.5).

export type Rung = 0 | 1 | 2 | 3 | 4;

// --- grading -----------------------------------------------------------------------------------

/** One checker finding, unredacted. Which fields may be shown at which rung: redaction.ts. */
export interface RawIssue {
  where: {
    track: string | null;
    bar: number | null;
    beat: number | null;
    code: { from: number; to: number } | null;
  };
  severity: "error" | "warn" | "info";
  /** Feedback code, e.g. `melody.wrong-degree`. It names the kind of problem, so it is "what". */
  feedback: string;
  /** `too-high`, `too-late`, ... Part of "what". */
  direction: string | null;
  /** Name of the concept at fault. */
  concept: string | null;
  /** The catalog sentence for this finding. Part of "what". */
  what: string;
  fix: string | null;
  expected: string | null;
  got: string | null;
}

/** A grade as the tutor needs it: `GradeResult` (contracts §5.7) reduced to what the tools return. */
export interface GradeSnapshot {
  status: "pass" | "fail" | "error" | "ungraded";
  score: number;
  dims: Record<string, number>;
  counts: { missing: number; extra: number; wrong: number };
  issues: RawIssue[];
  /** Lint warnings on the learner's own code (feedback codes). */
  warnings: string[];
}

export interface EvalEvent {
  bar: number;
  beat: number;
  durBeats: number;
  pitch: string | null;
  degree: string | null;
  sound: string | null;
  chord: string | null;
}

export interface EvalTrack {
  label: string;
  role: string;
  totalEvents: number;
  events: EvalEvent[];
}

export interface EvalFailure {
  kind: string;
  message: string;
  line: number | null;
}

export interface EvalResult {
  ok: boolean;
  error: EvalFailure | null;
  tempo: { cps: number; bpm: number; meter: string } | null;
  tracks: EvalTrack[];
  warnings: string[];
  /** Tool IDs (`tb.*`) the code uses that the learner has not unlocked. */
  lockedTools: string[];
}

// --- lesson content ----------------------------------------------------------------------------

export interface LessonSource {
  id: string;
  title: string;
  objective: string;
  key: string | null;
  meter: string | null;
  bpm: number | null;
}

export type StepGrading = "graded" | "make" | "ungraded";

/** UNREDACTED step content. */
export interface StepSource {
  lessonId: string;
  id: string;
  /** StepKind from the content schema, e.g. `write-code`. */
  kind: string;
  grading: StepGrading;
  exerciseRef: string | null;
  prompt: string;
  starterCode: string | null;
  constraints: string[];
  rubric: { label: string; required: boolean }[] | null;
  /** The fixed ladder: nudge, pointer, partial, reveal. `null` where the exercise has none. */
  hints: readonly [string, string, string, string] | null;
  knownMistakes: { feedback: string; description: string; variantCode: string | null }[];
  /** Reference solutions. Empty for Make steps and compositions. */
  solutions: string[];
}

/** Server-side state of the learner on one step. The hint rung lives here and nowhere else. */
export interface StepState {
  rung: Rung;
  passed: boolean;
  attempts: number;
  /** Aligned with `StepSource.rubric`; `null` before the first check. */
  rubricMet: boolean[] | null;
  /** Feedback codes of the known wrong variants the learner's latest attempt matched. */
  matchedMistakes: string[];
}

/** Facts about a tutor subject that decide whether the tutor is on and whether cards may be applied. */
export interface SubjectFacts {
  /** False during a checkpoint and during drill trials (contracts §10.2, §10.4). */
  tutorOpen: boolean;
  closedReason: string | null;
  title: string | null;
  /** Capstones and tracks: has the track had its first release? `null` for other subjects. */
  released: boolean | null;
  /** Transcriptions only. */
  transcriptionSource: "own-audio" | "ladder" | null;
}

/** What a review receives (contracts §10.6). */
export interface ReviewSource {
  title: string;
  code: string;
  brief: string;
  /** The deterministic `AnalysisSummary`, already rendered as text. */
  analysis: string;
  rubric: { label: string; required: boolean; met: boolean }[];
  learnerNote: string | null;
  /** Transcriptions: the self-assessment checklist. */
  checklist: string[];
  /** Only set once a graded ladder piece has passed; `null` otherwise and for the learner's own audio. */
  reference: string | null;
  totalBars: number | null;
  revisions: 1 | 2;
}

// --- learner -----------------------------------------------------------------------------------

export interface ProgressSnapshot {
  current: { unit: string | null; lesson: string | null; step: string | null };
  unlocked: { recent: string[]; count: number };
  weakSkills: { id: string; name: string; strength: number }[];
  debts: string[];
  recentFeedback: { code: string; count: number }[];
  families: { id: string; level: number; confusions: string[] }[];
  streakWeeks: number;
  singTolerance: number;
  quiet: boolean;
}

export interface IntroducedTerms {
  count: number;
  /** Most recent first. */
  recent: string[];
}

export type NoteSource = "listening" | "review" | "observation";

export interface TutorNote {
  id: string;
  /** Learner-local day, `YYYY-MM-DD`. */
  day: string;
  subjectKind: string;
  subjectId: string;
  source: NoteSource;
  text: string;
  skillId: string | null;
  retractedAt: string | null;
}
