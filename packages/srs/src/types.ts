// Public types of @oak/srs.
import type { FamilyId, HintRung, SkillId } from "@oak/content-kit";
import type { CardKind, GOVERNOR } from "./constants.ts";

export type { CardKind };
/** ts-fsrs `Rating` values. They are plain const objects in ts-fsrs, not enums. */
export type Rating = 1 | 2 | 3 | 4;
export const RATING_NAME: Readonly<Record<Rating, "Again" | "Hard" | "Good" | "Easy">> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};
export type CardStatus = "active" | "deferred" | "graduated" | "paused" | "retired";

/** A card as persisted (`srs_cards.fsrs_json` plus its columns). Plain JSON: dates are ISO strings. */
export interface Card {
  /** Family, deck-card or fact ID. Stable: it seeds Oak's due-day pick. */
  id: string;
  kind: CardKind;
  status: CardStatus;
  /** `scheduler.definition.model.name`, e.g. "fsrs-7". */
  model: string;
  stability: number;
  stabilityFast: number;
  difficulty: number;
  /** 0 New · 1 Learning · 2 Review · 3 Relearning. */
  state: 0 | 1 | 2 | 3;
  scheduleStatus: string;
  dueAt: string;
  lastReviewAt: string | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
  /** The last two ratings, newest last: graduation needs Good or Easy twice. */
  lastRatings: Rating[];
}

/** What one review produced. A family review is a whole set of 5 to 8 trials; a fact review is one answer. */
export interface ReviewOutcome {
  /** Mean credit in [0, 1], graded against the level actually played. For a fact: 0 or 1. */
  meanCredit: number;
  medianRtMs: number;
  /** The family's or deck's `fastRtMs`. */
  fastRtMs: number;
  /** Replays beyond the level's limit. */
  extraReplays: number;
  hintRung: HintRung;
  revealed: boolean;
  /** Whether the set was played at or above the card's level. */
  atOrAboveLevel: boolean;
  /** Production families: mean |cents| and the tolerance, for the Easy rule. */
  meanAbsCents?: number;
  tolCents?: number;
}

export interface Revlog {
  cardId: string;
  kind: CardKind;
  model: string;
  rating: Rating;
  reviewedAt: string;
  outcome: ReviewOutcome;
  elapsedDays: number;
  /** Predicted recall just before this review (0 for a new card). */
  recallBefore: number;
  /** Interval the model asked for, before Oak's floor, cap and day pick. */
  modelIntervalDays: number;
  scheduledDays: number;
  /** Pre-review snapshot: enough to replay or roll back. */
  prev: Omit<Card, "id" | "kind" | "status" | "model" | "lastRatings">;
}

export interface ReviewOptions {
  /** Per-review override of the cap (the governor's cadence for active families). */
  maxIntervalDays?: number;
  minIntervalDays?: number;
  /** Chooses the due day inside [lo, hi] whole days from now. Default: a deterministic hash of card ID + reps. */
  pickDay?: (ideal: number, lo: number, hi: number) => number;
}
export interface ReviewResult {
  card: Card;
  revlog: Revlog;
  rating: Rating;
}

/** ts-fsrs 6 behind Oak's rules. `createSrs` is async because `DefaultScheduler` lazy-loads its model. */
export interface Srs {
  readonly modelName: string;
  createCard(kind: CardKind, id: string, now: Date, status?: CardStatus): Card;
  review(card: Card, outcome: ReviewOutcome, now: Date, opts?: ReviewOptions): ReviewResult;
  /** Applies a rating computed elsewhere (a lesson step's first-attempt score, a test-out's Easy). */
  rate(card: Card, rating: Rating, now: Date, opts?: ReviewOptions): ReviewResult;
  /** Predicted probability of recall right now; 0 for a never-reviewed card (the library returns 0.08 there). */
  retrievability(card: Card, now: Date): number;
  isDue(card: Card, now: Date): boolean;
  /** Days after the last review at which predicted recall falls to `retention`: the version-independent "stability". */
  intervalAt(card: Card, retention: number): number;
  /** The four possible next cards, without committing. */
  preview(card: Card, now: Date): Record<Rating, { dueAt: string; scheduledDays: number }>;
  /** The desired retention this instance schedules a kind at (ρ of contracts §7.10; `srs_cards.desired_retention`). */
  desiredRetention(kind: CardKind): number;
  /** The learner day (`dayIndex`) an instant falls on, with this instance's time zone and rollover. */
  dayOf(at: Date | string): number;
  readonly timeZone: string;
  readonly rolloverHour: number;
}

// --- governor and planner -----------------------------------------------------------------------

export interface GovernorConfig {
  /** Warm-up budget in seconds: 240 / 300 / 360 for the 15 / 20 / 25-minute targets. */
  budgetSec: number;
  maxActivePerceptual: number;
  graduateDays: number;
  /** `null` = pure FSRS intervals. */
  activeMaxIntervalDays: number | null;
  forecastDays: number;
  intakeMeanHigh: number;
  intakeDayHigh: number;
  intakeMeanLow: number;
  releasePerDay: { families: number; facts: number };
  newPerDay: { families: number; facts: number };
  maxFactCardsPerLesson: number | null;
  planFraction: number;
  maxMicSets: number;
  quiet: boolean;
  /** Share of a full warm-up kept for fact mini-sets (either class may use what the other leaves). */
  factShare: number;
  /** Priority gained per day a due item has waited. */
  agingPerDay: number;
  /** Sessions a week the forecast assumes: the learner's weekly goal. */
  sessionsPerWeek: number;
  /**
   * The wait bound of the §7.4 amendment (decision 27): a deferred family that has waited this many days is
   * released even while the set forecast is not open (still oldest first, within the daily release cap,
   * the 12 active slots and mic room). `null` or absent: released only while the forecast is open (the
   * contract as written).
   */
  releaseAfterDays?: number | null;
  /**
   * Decision 27: room for a family past `releaseAfterDays` is made by resting the most stable active family
   * below its mastery level in its composite when no family at its mastery level can graduate. Needs at
   * least this many review sets of its own. `null` or absent: no resting (only graduation makes room).
   */
  restMinReps?: number | null;
}
export type GovernorDefaults = typeof GOVERNOR;

export type ItemClass = "family" | "concept" | "composite" | "fact";
/** One reviewable thing as the planner sees it. `day` values are Oak-day indices (`dayIndex`). */
export interface ReviewItem {
  cardId: string;
  cls: ItemClass;
  family: FamilyId | null;
  /** Domain for the "no two consecutive sets from one domain" rule. */
  domain: string;
  /** Estimated seconds for one review (a whole set for families, one card for facts). */
  sec: number;
  dueDay: number;
  /** Predicted recall right now. */
  recall: number;
  mic: boolean;
  perceptual: boolean;
  blockedIntroPending: boolean;
  linkedToNextLesson: boolean;
  debt: boolean;
  /** Failed checkpoint skills: scheduled right after the anchor. */
  repair: boolean;
  /** Set by `smoothBacklog`: not offered before this day. */
  deferUntilDay?: number;
  /** A card that has never been reviewed (a released deck card): it fills only the room the due items leave. */
  fresh?: boolean;
  /**
   * A perceptual or production family's first set (never reviewed): planned first, before anything else,
   * so its first review lands within the bound of decision 27 even after a break.
   */
  firstSet?: boolean;
  /**
   * The interval the card returns at after its next review when a cap binds it (an active family's 7-day
   * cadence). The intake forecast counts every return inside its window, not just the next one.
   */
  repeatDays?: number;
  skills: SkillId[];
}
export interface PlannedItem {
  item: ReviewItem;
  kind:
    | "anchor"
    | "repair"
    | "family-set"
    | "composite-set"
    | "concept-set"
    | "fact-set"
    | "blocked-intro"
    | "listen";
  /** Fact sets: the cards batched together (up to 10). */
  cardIds: string[];
  estSec: number;
  rated: boolean;
}
export interface WarmupPlan {
  budgetSec: number;
  plannedSec: number;
  items: PlannedItem[];
  /** Due but left for another day. Invisible to the learner; no penalty. */
  overflow: ReviewItem[];
  overflowSec: number;
}
export interface PlanContext {
  today: number;
  /** Days since the last qualifying day (the return policy of contracts §7.9). */
  gapDays: number;
  /** A mastered family to draw the anchor set from when nothing due has a high R. */
  anchorFallback: ReviewItem | null;
  /** 180 s on checkpoint and capstone days. */
  budgetSec?: number;
  /** Mic sets already planned today (a later "a little more" block shares the limit of 2). */
  micSetsUsed?: number;
  /** A later block of a review day: no anchor set, the order is by priority alone. */
  continuation?: boolean;
}
export type ReturnMode = "normal" | "warmup" | "light" | "light+loosen";

export interface GraduationInput {
  level: number;
  masteryLevel: number;
  /** The family's highest level whose gate is open (gated ladders count as mastery level for graduation). */
  maxOpenLevel: number;
  /** `intervalAt(card, 0.9)`. */
  t90Days: number;
  lastRatings: Rating[];
}

// --- intake, evidence from other work, composites -----------------------------------------------

/**
 * The intake throttle of contracts §7.4 on the 7-day forecast, per session (the forecast total divided by the
 * sessions the window holds): `open` below 0.70 × budget (deferred cards are released), `closed` above
 * 0.85 × budget or with one day over 1.25 × budget (new cards are created `deferred`), `hold` in between.
 */
export type IntakeState = "open" | "hold" | "closed";
export interface IntakeForecast {
  state: IntakeState;
  /** Seconds of review per expected session over the window. */
  meanSec: number;
  /** The heaviest single day of the window, in seconds. */
  maxDaySec: number;
  load: number[];
  /** The seconds per session this class may plan for (`classBudget`); the thresholds are fractions of it. */
  budgetSec: number;
}

/** Work outside a card's own review that may still count as its review (contracts §7.4). */
export type OtherWorkSource = "lesson" | "gym" | "transcription" | "checkpoint" | "practice";

/** A graduated family as the composite sampler sees it. */
export interface CompositeMember {
  family: FamilyId;
  /** Credits of its last composite trials, newest last (the server keeps at least 6). */
  recentCredits: readonly number[];
  mic: boolean;
  /** A recalled member waiting for a free slot: sampled in every composite set. */
  recalled?: boolean;
}
export interface CompositeSetPlan {
  /** Members of this set, in play order, each with its number of trials. */
  members: { family: FamilyId; trials: number }[];
  trials: number;
}
