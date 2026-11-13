// Normalized events, grade results and feedback (contracts §5.7; exercises §2.3).
import type { FeedbackId } from "../ids.ts";
import type { CadenceType, CodeRange, DrumRole, KeySpec, Layer, Rat, Severity } from "./common.ts";
import type { HintRung, ParamValues } from "./exercise.ts";

export type PitchSource = "note-str" | "note-num" | "freq" | "n-scale" | "voicing" | "n-index" | "none";

/** The one normalized event every grader, view and analysis works on. Sorted by (onset, midi) per track. */
export interface NEvent {
  /**
   * `${track}|${bar}|${onset[0]}/${onset[1]}|${midi ?? s ?? chordSymbol}|${k}` (k disambiguates duplicates).
   * Deterministic for the same code. The link bus and the staff use it; content never refers to it.
   */
  id: string;
  /** Label ('mel'), '$0' for anonymous `$:` lines, 'main' for one unlabelled expression, 'band.<label>' for Band tracks. */
  track: string;
  /** From `hap.whole` (haps with an onset only). */
  onset: Rat;
  dur: Rat;
  /** After clip/legato: `.legato(.5)` and `.clip(.5)` both set `clip`. */
  clipDur?: Rat;
  midi: number | null;
  cents?: number;
  pitchSource: PitchSource;
  /** Literal note string from the code. Display only: `.scale()` spells accidentals backwards. */
  written?: string;
  /** `chord()` value or the grader's `_oakChord` shim tag. Chord identity always comes from here (§6.7). */
  chordSymbol?: string;
  drum?: DrumRole;
  s?: string;
  bank?: string;
  sampleN?: number;
  /** (gain ?? 0.8) · (velocity ?? 1) · (postgain ?? 1). */
  gain: number;
  /** `hap.context.scale`, e.g. 'D4 major'. */
  scaleCtx?: string;
  /** Every contributing mini-notation atom, later-applied first (so `locs[0]` may be the word "piano"). */
  locs: CodeRange[];
  /**
   * Wave 5. The sound controls the hap carries, by Strudel's value key (`cutoff` for `.lpf()`, `resonance`,
   * `hcutoff`, `attack`, `release`, `room`, `roomsize`, `delaytime`, `partials` as "1,0.5", …): only the
   * controls the `controls` matcher and the probes read, and only when the code sets one. Absent otherwise.
   */
  controls?: Record<string, number | string>;
}

export const DIMENSIONS = [
  "pitch",
  "rhythm",
  "duration",
  "contour",
  "bass",
  "root",
  "quality",
  "rn",
  "inversion",
  "harmonicRhythm",
  "cents",
  "timing",
  "coverage",
  "locate",
  "fix",
  "order",
  "choice",
  "spelling",
  "constraints",
  "rubric",
  "stage",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export interface DimScore {
  score: number;
  weight: number;
  n?: number;
}

export interface Loc {
  code?: CodeRange[];
  /** 1-based; with a pickup, cycle 0 is "the pickup bar" and numbering starts at 1 on the first full bar. */
  bar?: number;
  beat?: number;
  beatLabel?: string;
  track?: string;
  noteIds?: string[];
  slot?: number;
  tSec?: number;
  blank?: string;
  rule?: string;
  trial?: number;
}

export interface Diagnostic {
  id: FeedbackId;
  severity: Severity;
  dim?: Dimension;
  where?: Loc;
  /** Slots of the catalog template. `expected`/`exp` and `got` carry the answer and are redacted by rung. */
  params: Record<string, string | number>;
}

export type GradingMode = "lesson" | "capstone" | "tutor";
export type GradeStatus = "pass" | "fail" | "error" | "ungraded";

export interface EvalSummary {
  ms: number;
  cps: number;
  bpm: number;
  bars: number;
  tracks: string[];
  logs: { level: "error" | "warn" | "log"; text: string }[];
  truncated: boolean;
}

export interface AssistState {
  rung: HintRung;
  tutorHints: number;
  extraReplays: number;
  revealed: boolean;
}

export interface GradeResult {
  /** Global exercise ID (`U03.L02/end-on-home`), or a trial ID inside a drill set. */
  exerciseId: string;
  exerciseVersion: number;
  attemptNo: number;
  firstAttempt: boolean;
  mode: GradingMode;
  /** `error` (syntax error, timeout, mic not detected) is not an attempt. */
  status: GradeStatus;
  /** 0..1 raw composite. */
  score: number;
  /** score × rung multiplier × replay multiplier = the evidence value. */
  adjustedScore: number;
  dims: Partial<Record<Dimension, DimScore>>;
  constraints: { id: string; ok: boolean; diag?: Diagnostic }[];
  rubric?: {
    ruleId: string;
    required: boolean;
    ok: boolean;
    value?: number;
    target?: number;
    diag?: Diagnostic;
  }[];
  /** Sorted: severity, bar, beat. */
  diagnostics: Diagnostic[];
  /** Rendered top 3 (plus "n more"). */
  messages: { id: FeedbackId; text: string; where?: Loc }[];
  assist: AssistState;
  params?: ParamValues;
  modality?: "normal" | "fallback";
  /** Set by "Report a grading problem" (contracts §11.8). */
  disputed?: boolean;
  eval?: EvalSummary;
  /** Compose and transcribe only. */
  analysis?: AnalysisSummary;
  /** Roll and staff red/green. */
  overlay?: { answer: { id: string; ok: boolean }[]; missing: NEvent[] };
}

export interface AnalysisSummary {
  key: { key: KeySpec; r: number }[];
  bpm: number;
  bars: number;
  /** Computed from the AST total, never played. */
  durationSec: number;
  roles: Partial<Record<Layer, string>>;
  slots: { bar: number; beat: number; symbol: string; rn: string }[];
  schemas: { schema: string; bars: [number, number] }[];
  cadences: { bar: number; type: CadenceType }[];
  form: string;
  energy: number[];
  /** For example 'V/vi→vi bar 6', 'bVII borrowed bar 12'. */
  devices: string[];
  /**
   * Wave 3: the key each pitched track is read in, bar by bar (`.scale()` contexts, patterned ones
   * included; else the declared key or an estimate), so the degree labels of every bar are right.
   */
  keyContexts?: AnalysisKeyContext[];
}
export interface AnalysisKeyContext {
  track: string;
  band: boolean;
  /** 1-based, inclusive bars. */
  spans: { fromBar: number; toBar: number; key: KeySpec; source: "declared" | "scale" | "estimate" }[];
}

// --- the UI / tutor view of a result (§5.7, §10.5) ----------------------------------------------

/** One issue as the feedback panel and the tutor tools see it, already redacted to a rung. */
export interface IssueView {
  /** The feedback code names the kind of problem, so it is absent below rung 2 for answer-bearing findings. */
  id?: FeedbackId;
  severity: Severity;
  dim?: Dimension;
  /** Always present: track, bar, beat, code range. */
  where: Loc;
  /** Kind and direction of the problem. Rung ≥ 2. */
  what?: string;
  /** Rung 3: on the first issue only. Rung 4 or passed: on all. */
  fix?: string;
  expected?: string | number;
  got?: string | number;
}
export interface FacetView {
  dim: Dimension;
  score: number;
  weight: number;
  n?: number;
}
export interface GradeView {
  status: GradeStatus;
  score: number;
  facets: FacetView[];
  counts: { missing: number; extra: number; wrong: number };
  issues: IssueView[];
  /** Target events to draw as ghost notes. Rung ≥ 3 (first issue's notes at 3, all at 4 or passed). */
  ghosts: NEvent[];
  rubric?: { ruleId: string; required: boolean; ok: boolean }[];
}
