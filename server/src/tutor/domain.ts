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
  /**
   * Wave 4: the key the step is in (`"G major"`): the step exercise's own key, else the lesson's. `undefined`
   * or `null`: the lesson's key applies (contracts §10.3 `get_lesson_context`; wave4.md §5.6).
   */
  key?: string | null;
  /**
   * Wave 4: how the learner answers the step, when it is not plain code (`rn-palette`, `quality-pad`,
   * `slot-choice`, `degree-pad`, `staff-chords`, `chord-dictation`, `dictation`, `voice-leading`, ...). The
   * answer guard reads it to know which forms of the answer to hold back below the reveal rung.
   */
  answerKind?: string | null;
  /**
   * Wave 6: the key plan of a step that changes key (content-kit `ExBase.keyPlan`, contracts §6.8): each key with
   * the 1-based bar it starts on (0 is a pickup bar). The first entry equals `key`. Absent or one entry: one key.
   */
  keyPlan?: readonly { bar: number; key: string }[] | null;
  /** Wave 6: the step's own meter when it differs from the lesson's (a 6/8 step inside a 4/4 lesson). */
  meter?: string | null;
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
  /**
   * Wave 4: the piece's analysed facts (chords per bar, cadences, motif reuse, range), so every comment can be
   * anchored to a real bar. Build it with `reviewFactsFrom` (review-facts.ts) from `harmonyView` and the
   * `AnalysisSummary`. Absent: only `analysis` (text) is sent.
   */
  facts?: ReviewFacts | null;
  /** Wave 4: what exactly is being reviewed: one album version, or one transcription version. */
  target?: ReviewTarget | null;
  /**
   * Wave 6: how many strengths the review is asked for. The Core Finale's single (CF-A) asks for three, the
   * strongest thing in the song first (the longest review the tutor writes); absent: two or three, as always.
   */
  strengthsWanted?: 2 | 3;
}

/** Wave 4: the version a review is about (contracts §10.6 storage; wave4.md §5.2). */
export type ReviewTarget =
  | { kind: "album"; trackId: string; version: number }
  | { kind: "transcription"; version: number };

/** One chord as the analysis reads it in one bar. */
export interface FactChord {
  /** 1-based display bar (0 is a pickup bar). */
  bar: number;
  /** 1-based beat in tempo units. */
  beat: number;
  /** Lead-sheet symbol, e.g. `G/B`. */
  symbol: string;
  /** Oak's numeral, e.g. `V6`; `null` without a key. */
  rn: string | null;
  /** `T`, `PD`, `D`, `chromatic`; `null` without a key. */
  fn: string | null;
}

/** A recurrence of a melodic idea: `bars` comes back at `at`, exactly, transposed or as rhythm only. */
export interface FactMotif {
  track: string;
  bars: [number, number];
  at: [number, number][];
  how: "exact" | "transposed" | "rhythm";
}

export interface FactRange {
  track: string;
  /** Note names with octave, e.g. `C4`. */
  low: string;
  high: string;
  semitones: number;
  /** Bar of the highest note (the climax), 1-based. */
  highBar: number;
}

/** What Oak's analysis found in a piece, for a review (all deterministic; nothing here is a judgement). */
export interface ReviewFacts {
  key: string | null;
  meter: string | null;
  bars: number;
  pickup: boolean;
  chords: FactChord[];
  /** Chord changes per bar, index 0 = the first bar analysed. */
  harmonicRhythm: number[];
  cadences: { bar: number; type: string }[];
  schemas: { schema: string; bars: [number, number] }[];
  motifs: FactMotif[];
  ranges: FactRange[];
  /** Share of strong-beat melody notes that are chord tones, 0..1; `null` when there is no melody over chords. */
  chordToneShare: number | null;
  /** Wave 5: the sections of the per-track `arrange()`, their contrast and the energy curve (C3, C4). */
  form?: FactForm | null;
  /** Wave 5: the bass line against the chords and the kick (U08, C3). */
  bass?: FactBass | null;
  /** Wave 5: the 12-bar form (C5, X2). */
  blues?: FactBlues | null;
  /** Wave 5: swing per track (C5, X2). */
  swing?: FactSwing[];
  /** Wave 5: a transcription's checks, stage by stage (X2: bass, changes, melody; ladder L5 phrases, L6 stages). */
  stages?: FactStage[];
  /** Wave 6: the mode of the piece, or of each section of an arranged piece (C6). */
  modes?: FactMode[];
  /** Wave 6: the chords from outside the key, with what each leans into (C7, CF-A). */
  outside?: FactOutsideChord[];
  /** Wave 6: seventh chords by quality (`maj7`, `7`, `m7`, `m7b5`, `dim7`), how many of each. */
  sevenths?: Record<string, number>;
  /** Wave 6: the guide-tone line from the 3rd of the first chord, note by note; `null` where a chord has none. */
  guideLine?: (string | null)[];
  /** Wave 6: the key bar by bar, when the piece changes key (C7, CF-A, U17). One span: the piece stays in one key. */
  keyPlan?: FactKeySpan[];
  /** Wave 6: the compositional devices Oak's analysis found (CF-A's rubric counts them). */
  devices?: FactDevice[];
  /** Wave 6: one pass of the piece in seconds (CF-A: at least 120). */
  durationSec?: number | null;
  /** Wave 6: pushes, ghost notes, ties, dotted values and tuplets per track (U13). */
  rhythm?: FactRhythm[];
  /** Wave 6: the meter's beat (compound: a dotted quarter in threes) and the BPM that counts it. */
  beat?: { compound: boolean; beats: number; bpm: number } | null;
}

/** Wave 6. The mode a piece or one of its sections reads in (`modeView` of @oak/grader). */
export interface FactMode {
  /** The section as the ribbon prints it, or `null` for the whole piece. */
  section: string | null;
  /** Display bars of the section, `null` for the whole piece. */
  bars: [number, number] | null;
  /** The mode stated by the code or the brief (`"D dorian"`), `null` when neither names one. */
  stated: string | null;
  /** The taught modes on that home note whose scale holds every note, brightest first. */
  fits: string[];
  /** The mode's characteristic tone: its degree (`b7`), how often it sounds and how often on a strong beat. */
  tone: { degree: string; count: number; strong: number } | null;
  /** Notes outside the stated mode's scale. */
  outsideNotes: number;
  /** Share of bars on the home chord, 0–1; `null` without chords. */
  homeChordShare: number | null;
}

/** Wave 6. A chord from outside the key (`chromaticHarmonyView` of @oak/grader). */
export interface FactOutsideChord {
  bar: number;
  beat: number;
  symbol: string;
  /** The numeral in the key in force at its bar (`V7/V`, `bVI`). */
  rn: string;
  kind: "applied" | "borrowed" | "other";
  /** Applied chords: the numeral it points at, and whether the next chord is that chord. */
  target: string | null;
  resolves: boolean | null;
  /** The numeral of the chord that follows; `null` at the end. */
  next: string | null;
  /** The key it was read in (`"D major"`). */
  key: string;
}

/** Wave 6. A stretch of the piece in one key, in display bars. */
export interface FactKeySpan {
  bars: [number, number];
  key: string;
  /** Where the key was read: the code's `.scale()`, the brief's key, or an estimate. */
  source: string;
  /** How the home note moved from the span before (`"up 2 half steps (a whole step)"`); `null` for the first. */
  move: string | null;
  /** Triads the two keys share (the possible pivots); `null` for the first span. */
  pivots: number | null;
}

/** Wave 6. One device as `detectDevices` reports it (content-kit `DEVICE_NAMES`). */
export interface FactDevice {
  device: string;
  bar: number;
  /** Bars a stretch lasts (a key change, a modal section); 1 otherwise. */
  bars: number;
  text: string;
}

/** Wave 6. One track's rhythm as `rhythmView` reads it. */
export interface FactRhythm {
  track: string;
  pushes: number;
  /** Pushes that cross a bar line. */
  pushesOverBar: number;
  ghosts: number;
  ties: number;
  dotted: number;
  /** Display bars that hold a triplet (a beat cut in three or six). */
  tupletBars: number[];
  feel: string;
  /** Syncopated onsets. */
  syncopated: number;
}

/** Wave 5. One section as the section ribbon prints it. Bars are display bars: 1-based, 0 is a pickup (c4). */
export interface FactSection {
  /** "Chorus 2": what the ribbon prints. */
  name: string;
  /** "chorus2": the tag in the code's const names. */
  tag: string;
  /** "chorus": the section type. */
  label: string;
  /** A, B, … by first appearance of the type. */
  letter: string;
  bars: [number, number];
  /** Learner tracks that sound in it. */
  tracks: string[];
  /** Mean of the energy curve over the section, 0–1. */
  energy: number;
  /** The chords of the section in order of change, with numerals when the key is known (`Am (i)`). */
  progression: string[];
}

/** Wave 5. Two sections compared on the contrast axes (`contrastAxes` of @oak/grader). */
export interface FactContrast {
  a: string;
  b: string;
  axes: string[];
}

export interface FactForm {
  kind: "sections" | "inconsistent" | "through";
  sections: FactSection[];
  /** The form as letters by first appearance ("ABAB"); a through-composed piece's phrase letters. */
  letters: string;
  /** The tracks disagree about the sections (the rule's message), else `null`. */
  problem: string | null;
  /** Energy per bar, 0–1, rounded to two places. */
  energy: number[];
  /** Each distinct pair of section types, first occurrences, compared. */
  contrast: FactContrast[];
}

export interface FactBass {
  track: string;
  notes: number;
  /** Notes per role: root, fifth, octave, third, seventh, approach, other. */
  roles: Record<string, number>;
  /** Share of chord changes whose first bass note is the root, 0–1. */
  rootOnChange: number;
  /** Approach notes into the next chord, by kind (`chromatic-below`). */
  approaches: Record<string, number>;
  /** Share of bass onsets on a kick, and of kicks with a bass note; `null` without a kick. */
  grooveLock: { lock: number; coverage: number } | null;
}

export interface FactBlues {
  /** "standard", "quick-change"; `null` when no full chorus fits. */
  variant: string | null;
  turnaround: boolean;
  /** A jazz blues (quick change with ii–V moves). */
  jazz: boolean;
  choruses: number;
  /** Bars (1-based) that break the closest variant. */
  wrongBars: number[];
  /** The chord of each bar of the first chorus, lead-sheet symbols. */
  bars: (string | null)[];
  allDominant: boolean;
}

export interface FactSwing {
  track: string;
  /** Long : short of the eighths (1 straight, 2 triplet swing); `null` when not measurable. */
  ratio: number | null;
  swung: 8 | 16 | null;
}

/** Wave 5. One check of a transcription: what the checker measured, never the source. */
export interface FactStage {
  check: string;
  layer: string;
  /** `bass`, `changes`, `melody`, `quality`, `rn`; `null` for a phrase check. */
  stage: string | null;
  /** "phrase 2", "phrases 1-4". */
  phrase: string;
  score: number | null;
  passed: boolean;
  revealed: boolean;
  /** The check's pass mark (X2: 0.90 bass, 0.85 changes and melody). */
  passAt: number | null;
  open: boolean;
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
  /**
   * Wave 4: every introduced term ID, when the adapter provides it. The vocabulary rules (solfège, chord
   * symbols, numerals) read it, because `recent` drops early terms such as `term.solfege` after 30 more.
   * Absent: `recent` is all that is known.
   */
  all?: readonly string[];
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
