// Shared domain DTOs: what crosses the wire between the app and the server. Each is a zod schema plus
// its inferred type. Field names are camelCase; the SQLite columns they come from are in
// docs/design/interfaces.md. Absent values are `null` in responses (never a missing key).
import { FLAVOUR_IDS, type LearnerProfile, schemas } from "@oak/content-kit";
import { z } from "zod";
import { BACKEND_IDS, RungSchema, TUTOR_HEALTH, TutorSettingsSchema } from "./tutor.ts";

const {
  idSchema,
  SessionIdSchema,
  GradeResultSchema,
  AnswerSchema,
  KeySpecSchema,
  NEventSchema,
  AnalysisSummarySchema,
} = schemas;

// --- primitives ---------------------------------------------------------------------------------

/** ISO-8601 UTC instant, as stored (`2026-11-11T09:30:00.000Z`). */
export const Instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, "expected an ISO-8601 UTC instant");
/** Learner-local calendar day after the 04:00 rollover, `YYYY-MM-DD`. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
/** Monday of a learner-local week, `YYYY-MM-DD`. */
export const WeekStart = Day;
export const TargetMinutesSchema = z.union([z.literal(15), z.literal(20), z.literal(25)]);
export const SingTolCentsSchema = z.union([z.literal(70), z.literal(50), z.literal(35), z.literal(25)]);
const flavour = z.enum(FLAVOUR_IDS);
const lessonId = idSchema("lesson");
const skillId = idSchema("skill");
const familyId = idSchema("family");
const checkpointId = idSchema("checkpoint");
const capstoneId = idSchema("capstone");
const canDoId = idSchema("canDo");
const termId = idSchema("term");
const unlockable = z.string().regex(/^(?:tb|snd|scale|chord)\./);
const meterId = z.enum(["4/4", "3/4", "2/4", "6/8", "9/8", "12/8", "5/4", "5/8", "7/8", "9/8i"]);

/** Error body of every non-2xx JSON response. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    /** `bad_request` 400 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `confirm_required` 428 · `internal` 500. */
    code: z.enum([
      "bad_request",
      "forbidden",
      "not_found",
      "conflict",
      "confirm_required",
      "payload_too_large",
      "unavailable",
      "internal",
    ]),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).exactOptional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
export const Ok = z.object({ ok: z.literal(true) });

// --- profile and settings -----------------------------------------------------------------------

export const OUTPUT_KINDS = ["wired", "bluetooth", "speakers", "unknown"] as const;
export const INPUT_KINDS = ["builtin", "external", "bluetooth", "none"] as const;

/** `learner_profile` (one row). MIDI numbers and milliseconds are `null` until calibrated. */
export const ProfileSchema = z.object({
  displayName: z.string().nullable(),
  /** IANA zone. The day rolls over at `rolloverHour` there. */
  timezone: z.string(),
  rolloverHour: z.number().int().min(0).max(23),
  targetMinutes: TargetMinutesSchema,
  weeklyGoal: z.number().int().min(3).max(7),
  flavour,
  vocalLowMidi: z.number().nullable(),
  vocalHighMidi: z.number().nullable(),
  comfortLowMidi: z.number().nullable(),
  comfortHighMidi: z.number().nullable(),
  singToleranceCents: SingTolCentsSchema,
  singTolMode: z.enum(["auto", "fixed"]),
  outputLatencyMs: z.number().nullable(),
  inputLatencyMs: z.number().nullable(),
  singLatencyMs: z.number().nullable(),
  tapLatencyMs: z.number().nullable(),
  tapJitterMs: z.number().nullable(),
  visualOffsetMs: z.number(),
  outputKind: z.enum(OUTPUT_KINDS),
  inputKind: z.enum(INPUT_KINDS),
  inputDeviceId: z.string().nullable(),
  noiseFloorDb: z.number().nullable(),
  /** Quiet mode for today, or always when no usable mic is found. */
  quiet: z.boolean(),
  /** Numbers until U03.L08 introduces syllables. */
  solfege: z.enum(["numbers", "syllables"]),
  onboardedAt: Instant.nullable(),
  createdAt: Instant,
});
export type Profile = z.infer<typeof ProfileSchema>;
export const ProfilePatchSchema = ProfileSchema.omit({ createdAt: true }).partial().strict();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

/** The grader's and drill generators' view of the profile, with defaults where nothing is calibrated yet. */
export function toLearnerProfile(p: Profile): LearnerProfile {
  const low = p.vocalLowMidi ?? 48;
  const high = p.vocalHighMidi ?? 72;
  return {
    rangeLow: low,
    rangeHigh: high,
    comfLow: p.comfortLowMidi ?? low + 2,
    comfHigh: p.comfortHighMidi ?? high - 2,
    tapLatencyMs: p.tapLatencyMs ?? 0,
    tapJitterMs: p.tapJitterMs ?? 0,
    singLatencyMs: p.singLatencyMs ?? 0,
    singTolCents: p.singToleranceCents,
    singTolMode: p.singTolMode,
    noiseFloorDb: p.noiseFloorDb ?? -60,
    outputKind: p.outputKind,
    inputKind: p.inputKind,
    quiet: p.quiet,
  };
}

export const CALIBRATION_KINDS = [
  "output",
  "noise",
  "bleed",
  "tap-latency",
  "sing-latency",
  "range",
  "pitch-match",
] as const;
/** One step of the set-up wizard (contracts §8.6). The server stores the run and updates the profile. */
export const CalibrationRunSchema = z.strictObject({
  kind: z.enum(CALIBRATION_KINDS),
  /** Raw measurements: tap offsets in ms, noise floor in dBFS, range in MIDI, ... */
  result: z.record(z.string(), z.unknown()),
  /** Profile fields this run sets. */
  patch: ProfilePatchSchema,
});
export type CalibrationRun = z.infer<typeof CalibrationRunSchema>;

/** `settings` rows by key. `PUT /api/settings/:key` validates the value with this shape's entry. */
export const SettingsSchema = z.object({
  theme: z.enum(["paper", "bark"]),
  /** Master output, 0 to 1. */
  volume: z.number().min(0).max(1),
  clickVolume: z.number().min(0).max(1),
  rollLabels: z.enum(["auto", "note", "degree", "degree+solfege"]),
  editorFontSize: z.number().int().min(11).max(24),
  /** Weeks marked paused ("Pause Oak"), at most 4. */
  pausedWeeks: z.array(WeekStart).max(4),
  /** The next-lesson teaser is opt-in after the second week. */
  teaserOptIn: z.boolean(),
  /** Whether the liner note of a tutor review appears in the album by default. */
  linerNotesInAlbum: z.boolean(),
  tutor: TutorSettingsSchema,
  /** Include audio in `.oakbackup` exports by default. */
  backupWithAudio: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(SettingsSchema.shape) as SettingKey[];
export const DEFAULT_SETTINGS: Settings = {
  theme: "paper",
  volume: 0.8,
  clickVolume: 0.6,
  rollLabels: "auto",
  editorFontSize: 15,
  pausedWeeks: [],
  teaserOptIn: false,
  linerNotesInAlbum: true,
  tutor: { backend: "auto", softMonthlyUsd: 25, hardMonthlyUsd: null, softWarnedMonth: null },
  backupWithAudio: true,
};

export const HealthSchema = z.object({
  ok: z.literal(true),
  appVersion: z.string(),
  contractsVersion: z.string(),
  schemaVersion: z.number(),
  contentVersion: z.string().nullable(),
  tutor: z.enum(TUTOR_HEALTH),
  /** The backend the selection order picked; `null` when the tutor is off. */
  tutorBackend: z.enum(BACKEND_IDS).nullable(),
  /** `OAK_DEV=1`: `/dev/*` routes and `/api/dev/*` endpoints exist. */
  dev: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

/** Answer of `POST /api/settings/anthropic-key`, after one minimal validation call. */
export const KeyStatusSchema = z.object({
  status: z.enum(TUTOR_HEALTH),
  source: z.enum(["env", "pasted", "none"]),
});
export type KeyStatus = z.infer<typeof KeyStatusSchema>;

// --- unlocks, can-do, terms ---------------------------------------------------------------------

export const UNLOCK_KINDS = ["tool", "sound", "scale", "chord", "feature", "template", "lens"] as const;
/** `unlocks` row. Rows are never deleted. */
export const UnlockSchema = z.object({
  itemId: unlockable,
  kind: z.enum(UNLOCK_KINDS),
  /** The session that granted it, or `backfill` (contracts §11.7 rule 5). */
  sourceKind: z.enum(["session-complete", "session-start", "fallback", "backfill"]),
  sourceId: z.string(),
  unlockedAt: Instant,
  /** False until its Coda ceremony was shown. */
  seen: z.boolean(),
});
export type Unlock = z.infer<typeof UnlockSchema>;

export const CANDO_STATUSES = ["emerging", "solid", "strong", "fading"] as const;
/** `cando_ledger` is a status history; the current status is the latest row. */
export const CanDoEntrySchema = z.object({
  candoId: canDoId,
  status: z.enum(CANDO_STATUSES),
  evidenceKind: z.enum(["sketch", "track", "lesson", "checkpoint", "set", "transcription"]),
  evidenceId: z.string(),
  at: Instant,
});
export type CanDoEntry = z.infer<typeof CanDoEntrySchema>;

export const TermIntroducedSchema = z.object({ termId, lessonId, at: Instant });
export type TermIntroduced = z.infer<typeof TermIntroducedSchema>;

// --- streak (contracts §7.8) --------------------------------------------------------------------

export const STREAK_DAY_SOURCES = [
  "review",
  "sketch",
  "keepalive",
  "session",
  "repair",
  "rest",
  "banked-rest",
  "paused",
] as const;
export const StreakDaySchema = z.object({
  day: Day,
  qualified: z.boolean(),
  source: z.enum(STREAK_DAY_SOURCES),
  /** Everything that qualified the day. */
  kinds: z.array(z.enum(["review", "sketch", "keepalive"])),
  minutes: z.number(),
  reviewSets: z.number(),
  sketchSaved: z.boolean(),
});
export type StreakDay = z.infer<typeof StreakDaySchema>;
export const STREAK_WEEK_STATUSES = [
  "open",
  "met",
  "met-banked",
  "met-repaired",
  "tie-open",
  "missed",
  "paused",
] as const;
export const StreakWeekSchema = z.object({
  weekStart: WeekStart,
  goal: z.number().int(),
  qualifyingDays: z.number().int(),
  bankedUsed: z.number().int(),
  repairedDays: z.number().int(),
  status: z.enum(STREAK_WEEK_STATUSES),
});
export type StreakWeek = z.infer<typeof StreakWeekSchema>;
export const StreakSummarySchema = z.object({
  /** Consecutive weeks that met the goal. The running week never breaks it before it ends. */
  weeks: z.number().int(),
  longestWeeks: z.number().int(),
  weeklyGoal: z.number().int(),
  /** This week: goal (first week: the pro-rated goal), days so far, and each day. */
  thisWeek: StreakWeekSchema.extend({ days: z.array(StreakDaySchema) }),
  /** Unspent banked rests, at most 2. */
  bankedRests: z.number().int().min(0).max(2),
  /** An open tie on last week: any qualifying activity before `until` also repairs one of its days. */
  repair: z.object({ weekStart: WeekStart, missingDays: z.number().int(), until: Instant }).nullable(),
  /** Secondary numbers, shown small; no rules, no rewards. */
  totalDays: z.number().int(),
  currentRunDays: z.number().int(),
  todayQualified: z.boolean(),
});
export type StreakSummary = z.infer<typeof StreakSummarySchema>;

// --- skills and mastery (contracts §7.5, §7.10) -------------------------------------------------

export const MASTERY_LEVELS = ["new", "available", "learning", "practiced", "mastered"] as const;
export const DEBT_REASONS = ["soft-pass", "production-lag", "checkpoint-level"] as const;
/** `skill_state` row plus what the map needs to draw the node. */
export const SkillStateSchema = z.object({
  skillId,
  /** Performance, shrunk toward 0.5. */
  P: z.number(),
  /** Weighted retrievability of linked cards; `null` when it has none (or only paused ones). */
  R: z.number().nullable(),
  /** Distinct days in the last 60 with an evidence item ≥ 0.8. */
  D: z.number().int(),
  /** Strength M = P · R, for display and planning. */
  M: z.number(),
  level: z.enum(MASTERY_LEVELS),
  debt: z.boolean(),
  debtReason: z.enum(DEBT_REASONS).nullable(),
  provisional: z.boolean(),
  /** Production node with no mic. */
  paused: z.boolean(),
  /** Freshness F_node, 0 to 1; `opacity = 0.35 + 0.65 · F`. */
  freshness: z.number(),
  /** Its stale cards are in today's planned warm-up: draw it drying, with "Revive". */
  drying: z.boolean(),
  updatedAt: Instant,
});
export type SkillState = z.infer<typeof SkillStateSchema>;
export const SkillMapSchema = z.object({ nodes: z.array(SkillStateSchema), reviveSec: z.number() });
export type SkillMap = z.infer<typeof SkillMapSchema>;

export const EVIDENCE_SOURCES = [
  "step",
  "retry",
  "predict",
  "checkpoint",
  "srs-set",
  "gym-set",
  "anchor-set",
  "rubric-rule",
  "self-transcription",
] as const;
/** `evidence` row. Weights are in contracts §7.5. */
export const EvidenceSchema = z.object({
  skillId,
  /** `E05/deg.6` when the evidence is on a category. */
  category: z.string().nullable(),
  at: Instant,
  day: Day,
  score: z.number().min(0).max(1),
  weight: z.number(),
  sourceKind: z.enum(EVIDENCE_SOURCES),
  sourceId: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// --- SRS (contracts §7.1 to §7.4) ---------------------------------------------------------------

export const CARD_KINDS = ["fact", "concept", "family", "composite"] as const;
export const CARD_STATUSES = ["active", "deferred", "graduated", "paused", "retired"] as const;
export const RATINGS = ["Again", "Hard", "Good", "Easy"] as const;
/** `srs_cards` row. `cardId` is the family, deck-card or fact ID. */
export const SrsCardSchema = z.object({
  cardId: z.string(),
  kind: z.enum(CARD_KINDS),
  status: z.enum(CARD_STATUSES),
  desiredRetention: z.number(),
  dueAt: Instant,
  /** ts-fsrs state: 0 New · 1 Learning · 2 Review · 3 Relearning. */
  state: z.number().int().min(0).max(3),
  stability: z.number(),
  difficulty: z.number(),
  reps: z.number().int(),
  lapses: z.number().int(),
  scheduledDays: z.number(),
  lastReviewAt: Instant.nullable(),
  /** Stored so a later model change can migrate by replay. */
  model: z.string(),
  /** Predicted recall right now. */
  retrievability: z.number(),
  introducedBy: z.string().nullable(),
  releasedAt: Instant.nullable(),
});
export type SrsCard = z.infer<typeof SrsCardSchema>;

/** `family_state` row: levels, per-category statistics and confusion pairs live here, not in cards. */
export const FamilyStateSchema = z.object({
  familyId,
  level: z.number().int().min(1),
  /** The day of the last set that counted towards promotion. */
  promoDay: Day.nullable(),
  categoryStats: z.record(
    z.string(),
    z.object({ n: z.number().int(), hits: z.number(), lastAt: Instant.nullable() }),
  ),
  /** `expected|got` → count. */
  confusion: z.record(z.string(), z.number().int()),
  /** Blocked-intro sets still to run before normal interleaving. */
  blockedRemaining: z.number().int(),
  compositeId: familyId.nullable(),
  graduatedAt: Instant.nullable(),
  /** Categories whose lesson is completed. */
  openCategories: z.array(z.string()),
  /** The highest level whose gate is open. */
  maxOpenLevel: z.number().int(),
});
export type FamilyState = z.infer<typeof FamilyStateSchema>;

export const WARMUP_ITEM_KINDS = [
  "anchor",
  "repair",
  "family-set",
  "composite-set",
  "concept-set",
  "fact-set",
  "blocked-intro",
  "listen",
] as const;
/** One planned block of a warm-up or review session. */
export const WarmupItemSchema = z.object({
  id: z.string(),
  kind: z.enum(WARMUP_ITEM_KINDS),
  familyId: familyId.nullable(),
  /** Composite sets: the members sampled. Fact sets: empty. */
  members: z.array(familyId),
  cardIds: z.array(z.string()),
  level: z.number().int().nullable(),
  trials: z.number().int(),
  estSec: z.number(),
  mic: z.boolean(),
  /** Whether this set is rated (an anchor set is evidence only). */
  rated: z.boolean(),
});
export type WarmupItem = z.infer<typeof WarmupItemSchema>;
export const DueBatchSchema = z.object({
  budgetSec: z.number(),
  plannedSec: z.number(),
  items: z.array(WarmupItemSchema),
  /** "Today's review ≈ 5 min". Raw due counts are never shown. */
  label: z.string(),
  /** `/practice/review` may offer "a little more" in budget-sized blocks, up to 12 minutes in total. */
  moreAvailable: z.boolean(),
});
export type DueBatch = z.infer<typeof DueBatchSchema>;

export const SrsReviewRequestSchema = z.strictObject({
  cardId: z.string(),
  drillSessionId: z.string().nullable(),
  /** Fact cards: one answer. Families: the set's summary (the server recomputes it from the stored trials). */
  outcome: z.strictObject({
    meanCredit: z.number().min(0).max(1),
    medianRtMs: z.number().nonnegative(),
    extraReplays: z.number().int().nonnegative(),
    hintRung: RungSchema,
    revealed: z.boolean(),
    playedLevel: z.number().int().nullable(),
    meanAbsCents: z.number().nullable(),
  }),
});
export type SrsReviewRequest = z.infer<typeof SrsReviewRequestSchema>;
export const SrsReviewResultSchema = z.object({
  cardId: z.string(),
  /** `null`: a disputed attempt or a mic-less skip produces no rating. */
  rating: z.enum(RATINGS).nullable(),
  dueAt: Instant,
  scheduledDays: z.number(),
  status: z.enum(CARD_STATUSES),
  familyState: FamilyStateSchema.nullable(),
  /** Level change caused by this set, if any. */
  levelChange: z.enum(["promoted", "demoted"]).nullable(),
  graduated: z.boolean(),
});
export type SrsReviewResult = z.infer<typeof SrsReviewResultSchema>;

// --- drills -------------------------------------------------------------------------------------

export const DRILL_PURPOSES = [
  "srs",
  "practice",
  "lesson",
  "checkpoint",
  "gym",
  "anchor",
  "repair",
  "keepalive",
] as const;
export const DrillSessionCreateSchema = z.strictObject({
  sessionId: z.string().nullable(),
  purpose: z.enum(DRILL_PURPOSES),
  familyIds: z.array(familyId).min(1),
  /** The warm-up item this set fulfils, if any. */
  warmupItemId: z.string().nullable(),
});
export const DrillSessionSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  purpose: z.enum(DRILL_PURPOSES),
  familyIds: z.array(familyId),
  /** Seeds the generator: `mulberry32(hash(familyId, setId, trialIndex))`. */
  setId: z.string(),
  /** Level to generate at, per family (75% at this level, 25% one down). */
  levels: z.record(z.string(), z.number().int()),
  /** Categories the generator may sample, per family. */
  openCategories: z.record(z.string(), z.array(z.string())),
  /** Category to favour, per family (lowest recent accuracy). */
  focus: z.record(z.string(), z.string().nullable()),
  trialsPlanned: z.number().int(),
  startedAt: Instant,
  finishedAt: Instant.nullable(),
});
export type DrillSession = z.infer<typeof DrillSessionSchema>;
export const DrillTrialRecordSchema = z.strictObject({
  idx: z.number().int().nonnegative(),
  familyId,
  seed: z.number().int(),
  level: z.number().int(),
  category: z.string(),
  /** What was asked, minus events: enough to regenerate the trial from its seed. */
  params: z.record(z.string(), z.unknown()),
  response: z.strictObject({
    answer: AnswerSchema.nullable(),
    taps: z.array(z.number()).nullable(),
    /** Sung trials: the per-note summary, never audio. */
    sung: z
      .array(
        z.strictObject({ midi: z.number().nullable(), cents: z.number().nullable(), credit: z.number() }),
      )
      .nullable(),
    skipped: z.boolean(),
  }),
  credit: z.number().min(0).max(1),
  correct: z.boolean(),
  rtMs: z.number().nonnegative(),
  replays: z.number().int().nonnegative(),
  confusion: z.tuple([z.string(), z.string()]).nullable(),
  centsError: z.number().nullable(),
  at: Instant,
});
export type DrillTrialRecord = z.infer<typeof DrillTrialRecordSchema>;
export const DrillFinishSchema = z.object({
  session: DrillSessionSchema,
  meanCredit: z.number(),
  medianRtMs: z.number(),
  reviews: z.array(SrsReviewResultSchema),
  evidence: z.array(EvidenceSchema),
  streak: StreakSummarySchema,
});
export type DrillFinish = z.infer<typeof DrillFinishSchema>;

// --- lessons, attempts, checkpoints, capstones --------------------------------------------------

export const LESSON_STATUSES = ["locked", "available", "in_progress", "completed"] as const;
export const LessonProgressSchema = z.object({
  lessonId,
  status: z.enum(LESSON_STATUSES),
  /** Local step ID (`S5`). */
  currentStep: z.string().nullable(),
  /** 15-minute target: `A` once part A is done and part B is pending. */
  splitPart: z.enum(["A", "B"]).nullable(),
  startedAt: Instant.nullable(),
  completedAt: Instant.nullable(),
  bestScore: z.number().nullable(),
  /** Lesson version at completion; new steps since then show a "new since you finished" dot. */
  completedVersion: z.number().int().nullable(),
  contentHash: z.string().nullable(),
  updatedAt: Instant,
});
export type LessonProgress = z.infer<typeof LessonProgressSchema>;

export const CheckpointStatusSchema = z.object({
  cpId: checkpointId,
  status: z.enum(["locked", "open", "passed", "soft-passed", "failed"]),
  attempts: z.number().int(),
  lastScore: z.number().nullable(),
  /** "Continue anyway" may be offered on the next attempt (a retake ≥ 0.75, or any third attempt). */
  softPassAvailable: z.boolean(),
  /** An unfinished attempt older than 3 days restarts with new items. */
  pendingAttemptAt: Instant.nullable(),
});
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const CapstoneStatusSchema = z.object({
  capstoneId,
  status: z.enum(["locked", "open", "in_progress", "released"]),
  /** Why it is still locked, as learner-facing copy ("Two more gym sets open X1"). */
  lockedReason: z.string().nullable(),
  sessionsDone: z.number().int(),
  sessionsTotal: z.number().int(),
  sketchId: z.string().nullable(),
  trackId: z.string().nullable(),
});
export type CapstoneStatus = z.infer<typeof CapstoneStatusSchema>;

export const CourseProgressSchema = z.object({
  lessons: z.array(LessonProgressSchema),
  checkpoints: z.array(CheckpointStatusSchema),
  capstones: z.array(CapstoneStatusSchema),
  /** Gym sessions done, in order (`GYM.01`, ...). */
  gym: z.array(z.object({ gymId: z.string(), kind: z.enum(["ladder", "own-audio"]), at: Instant })),
  /** The next map item in the default order. */
  next: SessionIdSchema.nullable(),
  /** Map sessions completed out of the 183 core (plus track sessions once a track is open). */
  mapDone: z.number().int(),
  mapTotal: z.number().int(),
});
export type CourseProgress = z.infer<typeof CourseProgressSchema>;

/** What the learner answered: one of the response shapes a `TestCase` can carry (contracts §5.4). */
export const AttemptResponseSchema = z.union([
  z.strictObject({ code: z.string().max(60_000) }),
  z.strictObject({ blanks: z.record(z.string(), z.string()) }),
  z.strictObject({ order: z.array(z.string()) }),
  z.strictObject({ answer: AnswerSchema }),
  z.strictObject({ taps: z.array(z.number()) }),
  z.strictObject({
    sung: z.array(
      z.strictObject({ midi: z.number().nullable(), cents: z.number().nullable(), credit: z.number() }),
    ),
  }),
  z.strictObject({ staff: z.string() }),
  z.strictObject({ click: z.union([z.strictObject({ from: z.number(), to: z.number() }), z.string()]) }),
  z.strictObject({ parts: z.array(z.unknown()) }),
  z.strictObject({ skipped: z.literal(true) }),
]);
export type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

export const StepAttemptCreateSchema = z.strictObject({
  sessionId: z.string().nullable(),
  /** Slug inside the lesson; the global ID is `${lessonId}/${exerciseId}`. */
  exerciseId: z.string(),
  exerciseVersion: z.number().int().positive(),
  /** "Try a new one" starts a new series; params are drawn from `(globalId, seriesNo)`. */
  seriesNo: z.number().int().nonnegative(),
  params: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
  response: AttemptResponseSchema,
  /** The result the browser grader produced. The server stores it and takes rung, attempt number and evidence from its own state. */
  result: GradeResultSchema,
  /** Extra replays beyond the cue's limit, as counted by the client. */
  extraReplays: z.number().int().nonnegative(),
  activeMs: z.number().nonnegative(),
  /** Code applied from a tutor card and not yet edited by hand gives no evidence (contracts §10.7). */
  tutorAssisted: z.boolean(),
});
export type StepAttemptCreate = z.infer<typeof StepAttemptCreateSchema>;

/** `step_attempts` row. */
export const StepAttemptSchema = z.object({
  id: z.number().int(),
  sessionId: z.string().nullable(),
  lessonId: z.string(),
  stepId: z.string(),
  exerciseId: z.string(),
  exerciseVersion: z.number().int(),
  seriesNo: z.number().int(),
  attemptNo: z.number().int(),
  passed: z.boolean(),
  score: z.number(),
  /** score × rung multiplier × replay multiplier. */
  adjusted: z.number(),
  hintRung: RungSchema,
  feedbackCodes: z.array(z.string()),
  modality: z.enum(["normal", "fallback"]),
  disputed: z.boolean(),
  at: Instant,
});
export type StepAttempt = z.infer<typeof StepAttemptSchema>;

/** `exercise_results` row: the best state of one exercise, keyed by `(exerciseId, version)`. */
export const ExerciseResultSchema = z.object({
  exerciseId: z.string(),
  exerciseVersion: z.number().int(),
  lessonId: z.string(),
  firstPassAt: Instant.nullable(),
  attemptsToPass: z.number().int().nullable(),
  bestScore: z.number().nullable(),
  lastScore: z.number().nullable(),
  assisted: z.boolean(),
  lastAt: Instant,
});
export type ExerciseResult = z.infer<typeof ExerciseResultSchema>;

/** The learner's state on one step. The hint rung lives on the server and nowhere else (contracts §10.4). */
export const StepStateSchema = z.object({
  lessonId: z.string(),
  stepId: z.string(),
  rung: RungSchema,
  passed: z.boolean(),
  /** Graded attempts in the current series (`status: 'error'` is not an attempt). */
  attempts: z.number().int(),
  seriesNo: z.number().int(),
  /** Reveal is available after 2 graded attempts (3 for sing and tap). */
  revealAvailable: z.boolean(),
  result: ExerciseResultSchema.nullable(),
});
export type StepState = z.infer<typeof StepStateSchema>;

export const StepAttemptResultSchema = z.object({
  attempt: StepAttemptSchema,
  state: StepStateSchema,
  evidence: z.array(EvidenceSchema),
  reviews: z.array(SrsReviewResultSchema),
  /** A test-out pass marks these scaffold steps complete (contracts §9.5). */
  testedOut: z.array(z.string()),
  /** The voicing gate: tools that became usable inside this session because of this attempt. */
  unlocked: z.array(UnlockSchema),
});
export type StepAttemptResult = z.infer<typeof StepAttemptResultSchema>;

export const LessonCompleteRequestSchema = z.strictObject({
  sessionId: z.string().nullable(),
  /** The Make's saved sketch. A lesson cannot complete without one. */
  sketchId: z.string(),
  lessonVersion: z.number().int().positive(),
  contentHash: z.string(),
  /** 15-minute target: `A` saves the Quick sketch and stops at `wrapAt`; `B` (or `null`) completes the lesson. */
  splitPart: z.enum(["A", "B"]).nullable(),
});
export const LessonCompleteResultSchema = z.object({
  progress: LessonProgressSchema,
  unlocks: z.array(UnlockSchema),
  canDo: z.array(CanDoEntrySchema),
  terms: z.array(TermIntroducedSchema),
  /** Families and fact cards this lesson seeded: `active`, or `deferred` by the governor. */
  seeded: z.array(z.object({ cardId: z.string(), status: z.enum(CARD_STATUSES) })),
  opened: z.array(SessionIdSchema),
  streak: StreakSummarySchema,
});
export type LessonCompleteResult = z.infer<typeof LessonCompleteResultSchema>;

export const CheckpointItemSpecSchema = z.object({
  idx: z.number().int(),
  skillId,
  /** Gating items count in the pass score; level-setting items never block. */
  role: z.enum(["gating", "level-setting"]),
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("family"),
      familyId,
      level: z.number().int(),
      category: z.string().nullable(),
      seed: z.number().int(),
    }),
    z.object({ kind: z.literal("authored"), exerciseId: z.string() }),
    z.object({ kind: z.literal("make") }),
  ]),
  /** A debt re-test from an earlier checkpoint. */
  debt: z.boolean(),
});
export type CheckpointItemSpec = z.infer<typeof CheckpointItemSpecSchema>;
export const CheckpointAttemptStartSchema = z.object({
  cpId: checkpointId,
  attemptNo: z.number().int(),
  startedAt: Instant,
  /** 12 to 18 items, interleaved. Sing items are left out in Quiet mode. */
  items: z.array(CheckpointItemSpecSchema),
});
export type CheckpointAttemptStart = z.infer<typeof CheckpointAttemptStartSchema>;
export const CheckpointSubmitSchema = z.strictObject({
  sessionId: z.string().nullable(),
  attemptNo: z.number().int().positive(),
  items: z.array(
    z.strictObject({
      idx: z.number().int(),
      score: z.number().min(0).max(1),
      skipped: z.boolean(),
      response: AttemptResponseSchema,
      result: GradeResultSchema.nullable(),
    }),
  ),
  makeSketchId: z.string().nullable(),
  /** "Continue anyway": only honoured when the server's rules offer it. */
  acceptSoftPass: z.boolean(),
});
export type CheckpointSubmit = z.infer<typeof CheckpointSubmitSchema>;
export const CheckpointOutcomeSchema = z.object({
  cpId: checkpointId,
  attemptNo: z.number().int(),
  /** Weighted score over gating items; pass needs ≥ 0.85 and every gated skill's mean ≥ 0.70. */
  score: z.number(),
  passed: z.boolean(),
  softPass: z.boolean(),
  softPassOffered: z.boolean(),
  perSkill: z.array(
    z.object({
      skillId,
      role: z.enum(["gating", "level-setting"]),
      mean: z.number(),
      items: z.number().int(),
      ok: z.boolean(),
    }),
  ),
  /** On fail: 2 sets per failed skill, scheduled into the next warm-ups. */
  repairQueue: z.array(z.object({ skillId, familyId: familyId.nullable(), sets: z.number().int() })),
  debts: z.array(skillId),
  opened: z.array(z.string()),
  unlocks: z.array(UnlockSchema),
});
export type CheckpointOutcome = z.infer<typeof CheckpointOutcomeSchema>;

export const CapstoneStateSchema = CapstoneStatusSchema.extend({
  /** Session IDs completed (`C2.S1`). */
  sessions: z.array(z.string()),
  flavour: flavour.nullable(),
  /** The latest rubric run on the draft. */
  lastResult: GradeResultSchema.nullable(),
  reviewRequested: z.boolean(),
});
export type CapstoneState = z.infer<typeof CapstoneStateSchema>;
export const CapstoneCheckSchema = z.strictObject({
  sessionId: z.string().nullable(),
  sketchId: z.string(),
  sketchVersion: z.number().int().positive(),
  result: GradeResultSchema,
});
export const CapstoneSessionCompleteSchema = z.strictObject({
  sessionId: z.string().nullable(),
  capstoneSessionId: z.string(),
  sketchId: z.string(),
  flavour: flavour.nullable(),
});

export const GymSessionCreateSchema = z.strictObject({
  sessionId: z.string().nullable(),
  kind: z.enum(["ladder", "own-audio"]),
  transcriptionId: z.string().nullable(),
});
/** `gym_sessions` row. The ID is the next free `GYM.nn` when the session starts. */
export const GymSessionSchema = z.object({
  gymId: z.string().regex(/^GYM\.\d{2}$/),
  sessionId: z.string().nullable(),
  kind: z.enum(["ladder", "own-audio"]),
  ladderLevel: z.number().int().min(1).max(8).nullable(),
  /** R0 to R4. */
  realism: z.number().int().min(0).max(4).nullable(),
  transcriptionId: z.string().nullable(),
  at: Instant,
});
export type GymSession = z.infer<typeof GymSessionSchema>;

// --- sessions -----------------------------------------------------------------------------------

export const SESSION_KINDS = [
  "lesson",
  "checkpoint",
  "capstone",
  "gym",
  "keepalive",
  "light",
  "studio",
  "review",
] as const;
export const SessionPlanSchema = z.object({
  day: Day,
  targetMinutes: TargetMinutesSchema,
  kind: z.enum(SESSION_KINDS),
  /** What the New block is: a lesson, checkpoint, capstone session or gym slot; `null` on a reviews-only day. */
  mapItemId: SessionIdSchema.nullable(),
  title: z.string(),
  /** Why this and not the next lesson ("Checkpoint day: about 20 minutes", "Two more gym sets open X1"). */
  note: z.string().nullable(),
  warmup: DueBatchSchema,
  main: z
    .object({
      resumeStep: z.string().nullable(),
      splitPart: z.enum(["A", "B"]).nullable(),
      /** A Light lesson after a long gap: the last completed lesson's Make with one new constraint. */
      light: z.object({ lessonId, constraint: z.string() }).nullable(),
      estMinutes: z.number(),
    })
    .nullable(),
  /** Return policy (contracts §7.9). Gap lengths are never shown. */
  returning: z
    .object({
      recap: z.object({ canDoId: canDoId.nullable(), sketchId: z.string().nullable() }).nullable(),
      offerLoosen: z.boolean(),
    })
    .nullable(),
  /** Other things Today may offer instead (an extra gym session, a capstone left open, a side lesson). */
  alternatives: z.array(
    z.object({ kind: z.enum(SESSION_KINDS), mapItemId: SessionIdSchema.nullable(), title: z.string() }),
  ),
  /** Rendered deterministically from the latest non-retracted tutor note; makes no API call. */
  tutorNote: z.string().nullable(),
});
export type SessionPlan = z.infer<typeof SessionPlanSchema>;

export const SessionStartSchema = z.strictObject({
  kind: z.enum(SESSION_KINDS),
  mapItemId: SessionIdSchema.nullable(),
  targetMinutes: TargetMinutesSchema,
});
export const SESSION_PHASES = ["idle", "warmup", "main", "make", "coda", "done"] as const;
/** `sessions` row. */
export const SessionSchema = z.object({
  id: z.string(),
  day: Day,
  kind: z.enum(SESSION_KINDS),
  targetMinutes: TargetMinutesSchema,
  mapItemId: SessionIdSchema.nullable(),
  contentVersion: z.string().nullable(),
  startedAt: Instant,
  endedAt: Instant.nullable(),
  activeMinutes: z.number(),
  phase: z.enum(SESSION_PHASES),
});
export type Session = z.infer<typeof SessionSchema>;
export const SessionHeartbeatSchema = z.strictObject({
  phase: z.enum(SESSION_PHASES),
  activeMs: z.number().nonnegative(),
  stepId: z.string().nullable(),
});
export const SessionEndSchema = z.strictObject({
  wrappedEarly: z.boolean(),
  phaseMs: z.strictObject({ warmup: z.number(), main: z.number(), make: z.number(), coda: z.number() }),
});
/** The Coda shows only cards whose state changed today. */
export const SessionSummarySchema = z.object({
  session: SessionSchema,
  streak: StreakSummarySchema,
  sketchesSaved: z.array(z.string()),
  canDo: z.array(CanDoEntrySchema),
  unlocks: z.array(UnlockSchema),
  /** "Your ear-to-voice aim got finer: ±35¢ now". Announced once, never mid-session. */
  toleranceChange: z.object({ from: SingTolCentsSchema, to: SingTolCentsSchema }).nullable(),
  /** Offer "Ask Claude to listen"; automatic in the first 7 days and in a capstone Coda. */
  listeningNote: z.enum(["offer", "auto", "off"]),
  teaser: z.object({ mapItemId: SessionIdSchema, title: z.string() }).nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// --- sketches -----------------------------------------------------------------------------------

export const SKETCH_ORIGINS = [
  "lesson-make",
  "free",
  "capstone",
  "transcription",
  "tutor",
  "keepalive",
  "checkpoint",
] as const;
const bandState = z.strictObject({
  bandId: idSchema("band"),
  flavour,
  mutes: z.array(z.enum(["drums", "bass", "chords"])),
});
const sketchFlags = z.strictObject({ lockedTools: z.array(z.string()), previewTools: z.array(z.string()) });
/** `sketch_versions` row. */
export const SketchVersionSchema = z.object({
  sketchId: z.string(),
  version: z.number().int().positive(),
  code: z.string(),
  bpm: z.number().nullable(),
  meter: meterId.nullable(),
  key: KeySpecSchema.nullable(),
  analysis: AnalysisSummarySchema.nullable(),
  note: z.string().nullable(),
  /** Set when a tutor card was applied; this version gives no evidence. */
  tutorAssisted: z.boolean(),
  band: bandState.nullable(),
  flags: sketchFlags,
  createdAt: Instant,
});
export type SketchVersion = z.infer<typeof SketchVersionSchema>;
/** `sketches` row. */
export const SketchSchema = z.object({
  id: z.string(),
  title: z.string(),
  originKind: z.enum(SKETCH_ORIGINS),
  originId: z.string().nullable(),
  currentVersion: z.number().int().positive(),
  tags: z.array(z.string()),
  archived: z.boolean(),
  listeningNote: z.string().nullable(),
  createdAt: Instant,
  updatedAt: Instant,
});
export type Sketch = z.infer<typeof SketchSchema>;
export const SketchDetailSchema = SketchSchema.extend({ versions: z.array(SketchVersionSchema) });
export type SketchDetail = z.infer<typeof SketchDetailSchema>;
const sketchVersionInput = {
  code: z.string().max(60_000),
  bpm: z.number().positive().nullable(),
  meter: meterId.nullable(),
  key: KeySpecSchema.nullable(),
  analysis: AnalysisSummarySchema.nullable(),
  note: z.string().max(2000).nullable(),
  tutorAssisted: z.boolean(),
  band: bandState.nullable(),
  flags: sketchFlags,
  /** A sketch qualifies a streak day only after at least one successful Run. */
  ranOk: z.boolean(),
};
export const SketchCreateSchema = z.strictObject({
  title: z.string().min(1).max(120),
  originKind: z.enum(SKETCH_ORIGINS),
  originId: z.string().nullable(),
  sessionId: z.string().nullable(),
  ...sketchVersionInput,
});
export type SketchCreate = z.infer<typeof SketchCreateSchema>;
export const SketchVersionCreateSchema = z.strictObject({
  sessionId: z.string().nullable(),
  ...sketchVersionInput,
});
export type SketchVersionCreate = z.infer<typeof SketchVersionCreateSchema>;
export const SketchPatchSchema = z
  .strictObject({
    title: z.string().min(1).max(120),
    tags: z.array(z.string()),
    archived: z.boolean(),
    listeningNote: z.string().nullable(),
  })
  .partial();
export const SketchSavedSchema = z.object({ sketch: SketchDetailSchema, streak: StreakSummarySchema });
export type SketchSaved = z.infer<typeof SketchSavedSchema>;

// --- album --------------------------------------------------------------------------------------

/** `album_track_versions` row. */
export const AlbumTrackVersionSchema = z.object({
  trackId: z.string(),
  version: z.number().int().positive(),
  sketchId: z.string(),
  sketchVersion: z.number().int().positive(),
  hasAudio: z.boolean(),
  audioMime: z.string().nullable(),
  durationS: z.number().nullable(),
  linerNotesMd: z.string(),
  theoryTags: z.array(z.string()),
  /** A `CapstoneReview` (or `null`). The learner chooses whether its liner note appears in the album. */
  review: z.unknown().nullable(),
  tutorAssisted: z.boolean(),
  /** "Revision suggested by Claude (bars 5–8)". */
  attribution: z.string().nullable(),
  band: bandState.nullable(),
  flags: sketchFlags,
  createdAt: Instant,
});
export type AlbumTrackVersion = z.infer<typeof AlbumTrackVersionSchema>;
/** `album_tracks` row. Side A: core capstones; side B: advanced capstones; Bside: promoted sketches. */
export const AlbumTrackSchema = z.object({
  id: z.string(),
  capstoneId: capstoneId.nullable(),
  sketchId: z.string().nullable(),
  side: z.enum(["A", "B", "Bside"]),
  trackNo: z.number().int(),
  title: z.string(),
  flavour: flavour.nullable(),
  currentVersion: z.number().int().positive(),
  coverSeed: z.string(),
  createdAt: Instant,
});
export type AlbumTrack = z.infer<typeof AlbumTrackSchema>;
export const AlbumTrackDetailSchema = AlbumTrackSchema.extend({ versions: z.array(AlbumTrackVersionSchema) });
export type AlbumTrackDetail = z.infer<typeof AlbumTrackDetailSchema>;
export const AlbumSchema = z.object({ tracks: z.array(AlbumTrackSchema) });
const trackVersionInput = {
  sketchId: z.string(),
  sketchVersion: z.number().int().positive(),
  linerNotesMd: z.string(),
  theoryTags: z.array(z.string()),
  attribution: z.string().nullable(),
};
export const AlbumTrackCreateSchema = z.strictObject({
  capstoneId: capstoneId.nullable(),
  side: z.enum(["A", "B", "Bside"]),
  title: z.string().min(1).max(120),
  flavour: flavour.nullable(),
  ...trackVersionInput,
});
export const AlbumTrackVersionCreateSchema = z.strictObject(trackVersionInput);

// --- audio and transcription --------------------------------------------------------------------

/** `audio_files` row. The ID is the file's sha256; audio never leaves the machine. */
export const AudioFileSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  originalName: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  durationS: z.number().nullable(),
  sampleRate: z.number().nullable(),
  channels: z.number().nullable(),
  hasPeaks: z.boolean(),
  createdAt: Instant,
});
export type AudioFile = z.infer<typeof AudioFileSchema>;

const region = z.strictObject({
  id: z.string(),
  label: z.string(),
  startS: z.number(),
  endS: z.number(),
  kind: z.enum(["loop", "section"]),
});
/** `transcriptions` row. `hiddenCode` (pattern sources) never reaches the browser's editors or DOM. */
export const TranscriptionSchema = z.object({
  id: z.string(),
  sourceKind: z.enum(["own-audio", "pd-song", "generated"]),
  /** `audio`: the learner's file through the stretch node. `pattern`: hidden reference code in a hidden adapter. */
  player: z.enum(["audio", "pattern"]),
  audioId: z.string().nullable(),
  songId: z.string().nullable(),
  title: z.string(),
  artist: z.string().nullable(),
  key: KeySpecSchema.nullable(),
  bpm: z.number().nullable(),
  meter: meterId.nullable(),
  downbeatS: z.number().nullable(),
  fineTuneCents: z.number().min(-50).max(50),
  ladderLevel: z.number().int().min(1).max(8).nullable(),
  realism: z.number().int().min(0).max(4).nullable(),
  regions: z.array(region),
  /** Self-assessment: item ID to a 0 to 2 score. */
  checklist: z.record(z.string(), z.number()),
  selfScore: z.number().nullable(),
  currentVersion: z.number().int(),
  status: z.enum(["in_progress", "done"]),
  review: z.unknown().nullable(),
  createdAt: Instant,
  updatedAt: Instant,
});
export type Transcription = z.infer<typeof TranscriptionSchema>;
export const TranscriptionVersionSchema = z.object({
  transcriptionId: z.string(),
  version: z.number().int(),
  code: z.string(),
  createdAt: Instant,
});
export const TranscriptionDetailSchema = TranscriptionSchema.extend({
  versions: z.array(TranscriptionVersionSchema),
  /** Pattern sources: the events to play, in place of the hidden code. Empty for own audio. */
  stimulus: z
    .object({
      events: z.array(NEventSchema),
      cps: z.number(),
      bars: z.number(),
      preload: z.array(z.string()),
    })
    .nullable(),
});
export type TranscriptionDetail = z.infer<typeof TranscriptionDetailSchema>;
export const TranscriptionCreateSchema = z.strictObject({
  sourceKind: z.enum(["own-audio", "pd-song", "generated"]),
  audioId: z.string().nullable(),
  songId: z.string().nullable(),
  title: z.string().min(1).max(200),
  artist: z.string().nullable(),
  ladderLevel: z.number().int().min(1).max(8).nullable(),
  templateId: z.string().nullable(),
});
export const TranscriptionPatchSchema = z
  .strictObject({
    title: z.string().min(1).max(200),
    artist: z.string().nullable(),
    key: KeySpecSchema.nullable(),
    bpm: z.number().positive().nullable(),
    meter: meterId.nullable(),
    downbeatS: z.number().nullable(),
    fineTuneCents: z.number().min(-50).max(50),
    regions: z.array(region),
    checklist: z.record(z.string(), z.number()),
    selfScore: z.number().nullable(),
    status: z.enum(["in_progress", "done"]),
  })
  .partial();
export const TranscriptionVersionCreateSchema = z.strictObject({
  sessionId: z.string().nullable(),
  code: z.string().max(60_000),
  result: GradeResultSchema.nullable(),
  ranOk: z.boolean(),
});

// --- telemetry and QA (contracts §9.7, §11.8) ---------------------------------------------------

/** `step_telemetry` row. Local only; shown on `/dev/telemetry`. */
export const StepTelemetrySchema = z.strictObject({
  sessionId: z.string(),
  lessonId: z.string(),
  lessonVersion: z.number().int(),
  stepId: z.string(),
  stepKind: z.string(),
  targetMinutes: TargetMinutesSchema,
  authoredMinutes: z.number(),
  scaledMinutes: z.number(),
  startedAt: Instant,
  endedAt: Instant,
  /** Time with focus; idle over 60 s removed. */
  activeMs: z.number().nonnegative(),
  attempts: z.number().int().nonnegative(),
  maxHintRung: RungSchema,
  tutorMessages: z.number().int().nonnegative(),
  passed: z.boolean(),
  skipped: z.boolean(),
  testedOut: z.boolean(),
  splitPart: z.enum(["A", "B"]).nullable(),
});
export type StepTelemetry = z.infer<typeof StepTelemetrySchema>;
/** `session_telemetry` row, derived by the server when a session ends. */
export const SessionTelemetrySchema = z.object({
  sessionId: z.string(),
  day: Day,
  targetMinutes: TargetMinutesSchema,
  kind: z.enum(SESSION_KINDS),
  warmupMs: z.number(),
  newMs: z.number(),
  makeMs: z.number(),
  codaMs: z.number(),
  totalActiveMs: z.number(),
  warmupSets: z.number().int(),
  warmupPlannedSec: z.number(),
  dueSecBefore: z.number(),
  dueSecAfter: z.number(),
  deferredCards: z.number().int(),
  overflowSec: z.number(),
  wrappedEarly: z.boolean(),
  split: z.boolean(),
});
export type SessionTelemetry = z.infer<typeof SessionTelemetrySchema>;
export const TelemetryReportSchema = z.object({
  steps: z.array(StepTelemetrySchema),
  sessions: z.array(SessionTelemetrySchema),
  /** median(active content time / authored minutes) over the last 10 lessons; prompt when it leaves 1.25 to 1.55. */
  rollingMultiplier: z.number().nullable(),
  forecastSec: z.array(z.number()),
  tutor: z.object({ cacheHitRatio: z.number(), costUsd: z.number() }),
});
export type TelemetryReport = z.infer<typeof TelemetryReportSchema>;

export const QA_KINDS = [
  "lesson-step",
  "drill-trial",
  "checkpoint-item",
  "capstone-rubric",
  "ladder-transcription",
] as const;
export const QaReportCreateSchema = z.strictObject({
  kind: z.enum(QA_KINDS),
  lessonId: z.string().nullable(),
  stepId: z.string().nullable(),
  exerciseId: z.string().nullable(),
  exerciseVersion: z.number().int().nullable(),
  familyId: z.string().nullable(),
  trialSeed: z.number().int().nullable(),
  params: z.record(z.string(), z.unknown()).nullable(),
  /** The code or answer. */
  response: z.unknown(),
  gradeResult: GradeResultSchema.nullable(),
  hintRung: RungSchema,
  note: z.string().max(2000).nullable(),
  /** The attempt to mark disputed: no mastery evidence, no SRS rating. */
  attemptId: z.number().int().nullable(),
});
export type QaReportCreate = z.infer<typeof QaReportCreateSchema>;
/** `qa_reports` row. Nothing leaves the machine. */
export const QaReportSchema = QaReportCreateSchema.omit({ attemptId: true }).extend({
  id: z.number().int(),
  at: Instant,
  contentVersion: z.string().nullable(),
  appVersion: z.string(),
  status: z.enum(["open", "triaged", "fixed", "wontfix"]),
});
export type QaReport = z.infer<typeof QaReportSchema>;

// --- progress page, confirm nonce, backup, bootstrap --------------------------------------------

export const ProgressReportSchema = z.object({
  canDo: z.array(CanDoEntrySchema),
  milestones: z.array(z.object({ id: z.string(), reachedAt: Instant.nullable() })),
  /** Shown as a month, never as a count of sessions behind. `null` until there is enough data. */
  paceEstimate: z
    .object({ coreDoneBy: z.string().regex(/^\d{4}-\d{2}$/), sessionsPerWeek: z.number() })
    .nullable(),
  streak: StreakSummarySchema,
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;

/** Destructive actions (contracts §11.6). Each needs `X-Oak-Confirm: <nonce>`. */
export const CONFIRM_ACTIONS = [
  "backup.import",
  "data.reset",
  "sketch.delete",
  "track.delete",
  "audio.delete",
  "transcription.delete",
  "anthropic-key.delete",
] as const;
export type ConfirmAction = (typeof CONFIRM_ACTIONS)[number];
export const ConfirmRequestSchema = z.strictObject({
  action: z.enum(CONFIRM_ACTIONS),
  /** The ID the action applies to, or `*`. */ target: z.string().min(1),
});
/** Single-use, lives 60 seconds, bound to `(action, target)`, kept in server memory only. */
export const ConfirmNonceSchema = z.object({ nonce: z.string().min(16), expiresAt: Instant });
export type ConfirmNonce = z.infer<typeof ConfirmNonceSchema>;

/** `backup.json` inside a `.oakbackup` archive. The API key and `~/.oak/secrets` are never included. */
export const BackupManifestSchema = z.object({
  format: z.literal("oak-backup"),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().nonnegative(),
  contentVersion: z.string().nullable(),
  exportedAt: Instant,
  /** Table name to rows, as stored. */
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  /** `audio/<sha256>.<ext>` and `album/<trackId>/v<n>.<ext>` entries present in the archive. */
  files: z.array(z.object({ path: z.string(), bytes: z.number().int(), sha256: z.string() })).exactOptional(),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
export const BACKUP_FORMAT_VERSION = 1;
export const BackupInfoSchema = z.object({
  bytesWithAudio: z.number().int(),
  bytesWithoutAudio: z.number().int(),
  lastAutomatic: Day.nullable(),
});
export const BackupImportResultSchema = z.object({
  ok: z.literal(true),
  tables: z.number().int(),
  rows: z.number().int(),
  audioFiles: z.number().int(),
  migratedFrom: z.number().int().nullable(),
  safetyCopy: z.string(),
});

export const BootstrapSchema = z.object({
  health: HealthSchema,
  profile: ProfileSchema,
  settings: SettingsSchema,
  unlocks: z.array(UnlockSchema),
  streak: StreakSummarySchema,
  /** Glossary terms from completed lessons. */
  terms: z.array(TermIntroducedSchema),
  /** The learner-local day now. */
  day: Day,
  /** A session left open today, to resume. */
  openSession: SessionSchema.nullable(),
});
export type Bootstrap = z.infer<typeof BootstrapSchema>;

// --- server grader (dev tools, e2e) -------------------------------------------------------------

export const GradeRequestSchema = z.strictObject({
  /** Global exercise ID. */
  exerciseId: z.string(),
  response: AttemptResponseSchema,
  params: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
  mode: z.enum(["lesson", "capstone"]),
});
export const AnalyzeRequestSchema = z.strictObject({
  code: z.string().max(60_000),
  bars: z.number().int().min(1).max(128),
  mode: z.enum(["lesson", "capstone", "tutor"]),
});
export const AnalyzeResponseSchema = z.object({
  ok: z.boolean(),
  error: z.object({ kind: z.string(), message: z.string(), line: z.number().nullable() }).nullable(),
  cps: z.number().nullable(),
  bpm: z.number().nullable(),
  tracks: z.array(z.string()),
  events: z.array(NEventSchema),
  logs: z.array(z.object({ level: z.enum(["error", "warn", "log"]), text: z.string() })),
  analysis: AnalysisSummarySchema.nullable(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
export { GradeResultSchema };
