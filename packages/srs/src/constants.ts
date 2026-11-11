// Every constant of contracts §7 lives here and nowhere else. `@oak/srs` (schedulers, governor,
// planner) and server/services/{mastery,gates,streak,session-plan} read them from this file.
// The values are the contract's. docs/decisions.md row 2 (spike S7) decided three overrides because the
// contract's numbers did not fit the warm-up budget in the 300-day simulation; they are in `DECISION_2`
// and `RECOMMENDED_GOVERNOR`, and the SRS builder applies them through `GovernorConfig` when the CI gate
// of §7.4 needs them. Contracts outrank the decisions log, so they are not silently baked in here.

export type CardKind = "fact" | "concept" | "family" | "composite";

export interface KindSchedule {
  desiredRetention: number;
  /** Oak's own floor, in days. Families: 1 (a failed set is not repeated in the same warm-up). */
  minIntervalDays: number;
  /** Oak's own cap, in days: applied by Oak, never by ts-fsrs (its fuzz degenerates with a small cap under FSRS-7). */
  maxIntervalDays: number;
  enableShortTerm: boolean;
  learningSteps: readonly string[];
  relearningSteps: readonly string[];
}

/** Contracts §7.1. */
export const SCHEDULES: Readonly<Record<CardKind, KindSchedule>> = {
  fact: {
    desiredRetention: 0.9,
    minIntervalDays: 0,
    maxIntervalDays: 365,
    enableShortTerm: true,
    learningSteps: ["5m"],
    relearningSteps: ["5m"],
  },
  concept: {
    desiredRetention: 0.9,
    minIntervalDays: 1,
    maxIntervalDays: 180,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
  },
  family: {
    desiredRetention: 0.85,
    minIntervalDays: 1,
    maxIntervalDays: 180,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
  },
  composite: {
    desiredRetention: 0.8,
    minIntervalDays: 1,
    maxIntervalDays: 365,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
  },
};
/** docs/decisions.md row 2: what spike S7's simulation needed at every budget. */
export const DECISION_2 = {
  factRetention: 0.85,
  activeMaxIntervalDays: 7,
  maxFactCardsPerLesson: 2,
} as const;
export const FSRS_VERSION = "FSRS-7";
/** Stored on every card so a later model change can migrate by replay. */
export const FSRS_MODEL_NAME = "fsrs-7";
/** Half-width of Oak's own due-day window, as a fraction of the interval. ts-fsrs runs with fuzz off. */
export const FUZZ = 0.05;
/** A 5-minute step due inside the running session shows in the quick-recall strip: at most 3 cards, 30 s. */
export const QUICK_RECALL = { maxCards: 3, seconds: 30 } as const;

// --- grade map (§7.2) ---

export const GRADE_MAP = {
  /** Again below this mean credit, or when the answer was revealed. */
  again: 0.65,
  /** Hard below this, or with any extra replay beyond the level's limit, or hint rung ≥ 2. */
  hard: 0.8,
  /** Easy at or above this, with median RT ≤ fastRtMs, at or above the card's level. */
  easy: 0.95,
  /** A right fact answer slower than this × fastRtMs is Hard. */
  factSlowFactor: 3,
  /** Share of trials at the card's level; the rest one level down. */
  atLevelShare: 0.75,
} as const;
export const SET_TRIALS = { min: 5, max: 8 } as const;

// --- governor (§7.4) ---

export const WARMUP_BUDGET_SEC: Readonly<Record<15 | 20 | 25, number>> = { 15: 240, 20: 300, 25: 360 };
/** Warm-up on checkpoint and capstone days. */
export const WARMUP_SHORT_SEC = 180;
/** Warm-up on a gym day: "4 + transcription + 1" at every target (contracts §9.1). */
export const WARMUP_GYM_SEC = 240;
/** A reviews-only day: the same budget, then "a little more" up to this in total. */
export const REVIEW_DAY_MAX_SEC = 720;
export const GOVERNOR = {
  maxActivePerceptual: 12,
  /** Graduation: level ≥ masteryLevel, t(R = 0.90) ≥ this many days, last two ratings Good or Easy. */
  graduateDays: 21,
  /** `null` = pure FSRS intervals (the contract). Decision 2 sets 7: an active family is never scheduled further out. */
  activeMaxIntervalDays: null as number | null,
  forecastDays: 7,
  /** New cards are created `deferred` while the forecast mean exceeds this × budget … */
  intakeMeanHigh: 0.85,
  /** … or any single day exceeds this × budget. */
  intakeDayHigh: 1.25,
  /** Deferred cards are released when the forecast mean is below this × budget. */
  intakeMeanLow: 0.7,
  releasePerDay: { families: 1, facts: 4 },
  newPerDay: { families: 2, facts: 6 },
  /** `null` = no per-lesson cap beyond the daily ones (the contract). Decision 2 sets 2. */
  maxFactCardsPerLesson: null as number | null,
  /** The planner fills only this fraction of the budget, so real durations still land under it at p95. */
  planFraction: 0.94,
  maxMicSets: 2,
  /** A listen-only block after every second perceptual set. */
  listenBlockSec: [15, 20] as [number, number],
  /** Fact mini-set size. */
  factSetMax: 10,
  compositeTrialsMax: 10,
  compositeTrialsPerMember: 2,
  compositeRotateAbove: 5,
  /** A member whose credit over its last 6 composite trials falls below 0.65 is recalled. */
  recallWindow: 6,
  recallBelow: 0.65,
  /** A linked card counts as reviewed by other work when it is due within this many days. */
  reviewIfDueDays: 2,
  anchorTrials: 4,
  /** The opener is a due item only when its predicted recall is at least this; otherwise the anchor set opens. */
  anchorMinRecall: 0.8,
  /**
   * Share of the warm-up kept for fact mini-sets on a full day; the rest is for sets. Either class may use
   * what the other leaves. (Spike S7: without it one class crowds the other out.)
   */
  factShare: 0.4,
  /** Priority gained per day a due item has waited, so a high-recall item is never starved (spike S7). */
  agingPerDay: 0.05,
  /** Sessions a week the forecast assumes when nothing else is known: the default weekly goal (§7.8). */
  sessionsPerWeek: 5,
  /** Planning estimates, in seconds, when the catalog gives none. */
  factCardSec: 8,
  compositeTrialSec: 7.5,
};
/** The level staircase of a family (exercises §4.2): promote after two sets ≥ 0.90 on two different days, demote after a set < 0.60. */
export const LEVELS = { promoteCredit: 0.9, promoteDays: 2, demoteBelow: 0.6 } as const;
/** A new family runs this many blocked-intro (contrast) sets, one a day from the day after its lesson. */
export const BLOCKED_INTRO_SETS = 2;
/** Warm-up priority: `2·(1 − R) + 1·blockedIntroPending + 0.5·linkedToNextLesson + 0.5·debt`. */
export const PRIORITY_WEIGHTS = { forgetting: 2, blockedIntro: 1, nextLesson: 0.5, debt: 0.5 } as const;
/** The CI gate of the 300-day simulation. */
export const SIM_GATE = {
  p95WarmupSec: { 15: 240, 20: 300, 25: 360 },
  maxActive: 12,
  p95OldestDueDays: 7,
  p95DeferredCards: 4,
  p95ReviewDaySec: 720,
} as const;

// --- mastery (§7.5) ---

export const MASTERY = {
  /** decay = 0.5 ^ (ageDays / halfLifeDays). */
  halfLifeDays: 45,
  /** P = (Σ w·decay·s + priorNum) / (Σ w·decay + priorDen): shrunk toward 0.5. */
  priorNum: 0.5,
  priorDen: 1,
  /** D counts distinct days in this window with an evidence item ≥ `dayScore`. */
  daysWindow: 60,
  dayScore: 0.8,
  practiced: 0.7,
  /** Below this Σw a node is still `learning`. */
  minWeight: 2,
  /** τ for fact and concept nodes; perceptual, production and creative nodes use `tauEar`. */
  tau: 0.9,
  tauEar: 0.85,
  minDays: 2,
  /** mastered → practiced only when P < τ − this. */
  hysteresis: 0.1,
  /** Creative nodes need evidence from this many pieces. */
  creativePieces: 2,
  /** ω for P/Pr family cards in R; 1 otherwise. */
  familyCardWeight: 2,
  /** A weak node (strength below this) boosts its prerequisites in warm-up selection. */
  weakStrength: 0.6,
  /** A provisional perceptual node clears with a set ≥ this on a second day. */
  provisionalSet: 0.85,
  /** Debt clears at P ≥ this with evidence on two days. */
  debtClear: 0.8,
  maxDebtItemsPerCheckpoint: 3,
} as const;
/** Evidence weights. Disputed attempts and tutor-typed code give none. */
export const EVIDENCE_WEIGHTS = {
  step: 1.0,
  retry: 0.3,
  predict: 0.5,
  checkpoint: 2.0,
  srsSet: 1.0,
  srsCategoryBonus: 0.5,
  gymSet: 0.5,
  anchorSet: 0.5,
  rubricRule: 1.5,
  selfTranscription: 0.3,
} as const;

// --- checkpoints (§7.6) ---

export const CHECKPOINT = {
  items: [12, 18],
  perSkillMin: 2,
  authoredItems: [2, 3],
  pass: 0.85,
  perSkillPass: 0.7,
  /** A retake that scores at least this offers "Continue anyway"; from the third attempt it is offered whatever the score. */
  softPass: 0.75,
  softPassAlwaysFromAttempt: 3,
  repairSetsPerSkill: 2,
  /** An unfinished attempt older than this restarts with new items. */
  staleDays: 3,
} as const;

// --- streak (§7.8) ---

export const STREAK = {
  rolloverHour: 4,
  goal: { min: 3, max: 7, default: 5 },
  /** A review set qualifies a day with at least this many trials, or this many fact cards. */
  setTrials: 4,
  factCards: 5,
  keepAliveSec: 120,
  bankMax: 2,
  /** The open tie after a short week lasts until Wednesday 04:00. */
  repairHours: 48,
  maxPausedWeeks: 4,
} as const;

// --- return policy (§7.9) ---

export const RETURN = {
  /** Gap in days since the last qualifying day. */
  warmupGap: 3,
  lightGap: 10,
  loosenGap: 21,
  /** After a gap, draw due items whose predicted success is in this band first. */
  band: [0.75, 0.9],
  backlogDays: [5, 7],
  maxRelearnPerDay: 3,
  /** After the third Again, items below this R wait for tomorrow. */
  holdBelowR: 0.6,
} as const;

// --- map shading (§7.10) ---

export const SHADING = {
  fadeStart: 0.05,
  fadeEnd: 0.3,
  minOpacity: 0.35,
  canDoSolid: 0.85,
  canDoStrongF: 0.9,
  canDoStrongDays: 30,
  canDoFadingF: 0.5,
} as const;

// --- gym slots and realism (§2.5, §6.12) ---

export const GYM = {
  slotEvery: 4,
  firstSlotFrom: "U07.L01",
  realismUp: 0.9,
  realismUpSessions: 2,
  realismDown: 0.6,
  ladderPass: 0.85,
} as const;

// --- sing tolerance ladder (§8.2) ---

export const SING_LADDER = {
  steps: [70, 50, 35, 25],
  tightenBelow: { 70: 35, 50: 25, 35: 20 },
  days: 3,
  withinDays: 21,
  minNotesPerDay: 8,
  sungResolutionsFirstSet: 3,
  sungResolutionsLater: 2,
} as const;
