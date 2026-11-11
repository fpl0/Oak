// Ports: everything outside the tutor is reached through these interfaces. The tutor imports from
// no other server folder and from no package; the server wires real adapters in at start-up, and
// tests use testing/fakes.ts.
import type {
  EvalFailure,
  EvalResult,
  GradeSnapshot,
  IntroducedTerms,
  LessonSource,
  NoteSource,
  ProgressSnapshot,
  ReviewSource,
  Rung,
  StepSource,
  StepState,
  SubjectFacts,
  TutorNote,
} from "./domain.ts";
import type { CardData, UsageSummary } from "./events.ts";
import type {
  BackendId,
  ConversationKey,
  Effort,
  Lane,
  NewTranscriptEntry,
  SubjectRef,
  ThreadKind,
  TranscriptEntry,
} from "./types.ts";

// --- grader ------------------------------------------------------------------------------------

export interface EvalRequest {
  code: string;
  /** 1-based. */
  fromBar: number;
  /** 1 to 16 (grading mode `tutor`, contracts §6.4). */
  bars: number;
  key: string | null;
  /**
   * Who typed the code. `tutor` code must be held to the strict lint profile by the host as well
   * (the executors lint it first; the host is the second layer). `learner` code gets the base profile.
   */
  origin: "tutor" | "learner";
}

export type CompareMode = "auto" | "events" | "rhythm" | "melody" | "harmony" | "pcset";

export interface CompareRequest {
  learnerCode: string;
  learnerOrigin: "tutor" | "learner";
  target: { kind: "exercise"; ref: string } | { kind: "code"; code: string };
  fromBar: number;
  bars: number;
  mode: CompareMode;
}

export type CompareResult = { ok: true; grade: GradeSnapshot } | { ok: false; error: EvalFailure };

/**
 * The headless grader host in `tutor` mode. It also runs the toolbox lint with the learner's
 * current unlocked set and reports `lockedTools`. A lint or evaluation failure is DATA
 * (`ok: false`), never a thrown error; only infrastructure failures throw.
 * The grade it returns is unredacted: the executors redact it.
 */
export interface GraderPort {
  evaluate(req: EvalRequest, signal: AbortSignal): Promise<EvalResult>;
  compare(req: CompareRequest, signal: AbortSignal): Promise<CompareResult>;
}

// --- content -----------------------------------------------------------------------------------

export interface LessonContextPort {
  lesson(lessonId: string): Promise<LessonSource | null>;
  /**
   * Must return `null` for checkpoint items and for the current drill trial: the tutor never
   * receives those (contracts §10.4).
   */
  step(lessonId: string, stepId: string): Promise<StepSource | null>;
  /** Map an exercise ID (`U05.L07/hand-voiced-cadence`) to its step. */
  resolveExercise(ref: string): Promise<{ lessonId: string; stepId: string } | null>;
  subject(ref: SubjectRef): Promise<SubjectFacts>;
  review(ref: SubjectRef): Promise<ReviewSource | null>;
  /** The generated syllabus and Strudel catalog for the system prefix, as built with the content. */
  prefixSources(): Promise<{ syllabus: string; catalog: string }>;
}

// --- learner state -----------------------------------------------------------------------------

export interface ProgressPort {
  stepState(lessonId: string, stepId: string): Promise<StepState>;
  /**
   * Raise the step's rung by one, never above `max`, exactly as pressing Hint would, and count it
   * as a tutor hint. Returns the rung now stored. Rung 4 is reached only through the UI.
   */
  advanceHintRung(lessonId: string, stepId: string, max: Rung): Promise<Rung>;
  snapshot(): Promise<ProgressSnapshot>;
  termsIntroduced(): Promise<IntroducedTerms>;
}

// --- conversations -----------------------------------------------------------------------------

export interface ConversationRecord {
  id: string;
  key: ConversationKey;
  effort: Effort;
  prefixVersion: string;
  createdAt: string;
}

export interface NewConversation {
  id: string;
  key: ConversationKey;
  effort: Effort;
  prefixVersion: string;
}

export interface NewCard extends Omit<CardData, "cardId"> {
  conversationId: string;
}

export interface CardRecord extends CardData {
  conversationId: string;
  applied: boolean;
}

/**
 * Tutor conversations. Messages are append-only by contract: there is no update and no delete,
 * and the SQLite adapter backs that with triggers. The only state that changes is a card's
 * `applied` flag.
 */
export interface ConversationStore {
  find(key: ConversationKey): Promise<ConversationRecord | null>;
  /** Fails if the key exists (`UNIQUE (subject_kind, subject_id, day, thread_kind)`). */
  create(init: NewConversation): Promise<ConversationRecord>;
  entries(conversationId: string, opts?: { includeExcluded?: boolean }): Promise<TranscriptEntry[]>;
  append(conversationId: string, entry: NewTranscriptEntry): Promise<TranscriptEntry>;
  /** Every non-excluded entry of the subject on one day, across its conversations, in time order. */
  subjectDay(subject: SubjectRef, day: string): Promise<TranscriptEntry[]>;
  /** The merged timeline the panel shows: all days, all conversations, in time order. */
  timeline(subject: SubjectRef): Promise<TranscriptEntry[]>;
  /** A backend's opaque records for a conversation, oldest first, excluded ones left out. */
  backendRecords(conversationId: string, backend: BackendId): Promise<unknown[]>;
  appendBackendRecords(
    conversationId: string,
    backend: BackendId,
    records: readonly unknown[],
    opts: { excluded: boolean },
  ): Promise<void>;
  saveCard(card: NewCard): Promise<CardRecord>;
  card(cardId: string): Promise<CardRecord | null>;
  markCardApplied(cardId: string): Promise<void>;
}

// --- tutor notes -------------------------------------------------------------------------------

export interface NewTutorNote {
  day: string;
  subjectKind: string;
  subjectId: string;
  source: NoteSource;
  text: string;
  skillId: string | null;
}

export interface TutorNotesStore {
  /** Non-retracted notes of one subject, most recent first. */
  recent(subject: SubjectRef, limit: number): Promise<TutorNote[]>;
  add(note: NewTutorNote): Promise<TutorNote>;
  /** Sets `retracted_at`; a retracted note is never sent again. */
  retract(id: string, at: string): Promise<void>;
}

// --- settings, usage, time ---------------------------------------------------------------------

export interface TutorSettings {
  /** `auto` follows the selection order: API key, then a logged-in CLI, then off. */
  backend: "auto" | "off" | BackendId;
  /** Always on. Default 25. */
  softMonthlyUsd: number;
  /** The month (`YYYY-MM`) whose soft-marker toast has been shown, so it shows once. */
  softWarnedMonth: string | null;
}

export interface SettingsPort {
  tutor(): Promise<TutorSettings>;
  markSoftWarned(month: string): Promise<void>;
}

export interface UsageRow {
  at: string;
  day: string;
  conversationId: string;
  kind: ThreadKind;
  lane: Lane;
  /** One model call. */
  usage: UsageSummary;
}

export interface MonthUsage {
  /** Sum of `costUsd` over rows that have one. Subscription usage adds nothing here. */
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface UsageSink {
  record(row: UsageRow): Promise<void>;
  /** Totals for a learner-local month, `YYYY-MM`. */
  month(month: string): Promise<MonthUsage>;
}

export interface Clock {
  now(): Date;
  /** IANA zone of the learner; the day rolls over at 04:00 there. */
  timeZone(): string;
}

export interface TutorPorts {
  grader: GraderPort;
  conversations: ConversationStore;
  notes: TutorNotesStore;
  lessons: LessonContextPort;
  progress: ProgressPort;
  settings: SettingsPort;
  usage: UsageSink;
  clock: Clock;
}
