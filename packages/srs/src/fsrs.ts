// ts-fsrs 6.0.0 (FSRS-7) behind Oak's scheduling rules. Promoted from spikes/s7-srs/srs.ts.
//
// Facts proven by the spike that shape this file:
//  - `DefaultScheduler(opts)` is async (it lazy-imports the model preset); everything after is sync.
//  - The version option is "FSRS-7"; the name stored on cards is `scheduler.definition.model.name` = "fsrs-7".
//  - Library cards are plain objects with two `Date` fields; unknown extra keys are dropped by `review()`.
//  - FSRS-7 uses fractional days: Again on a family card is due in about 10 s, Hard on a new fact in about
//    14 h. Oak has one session a day, so Oak applies its own floor, cap and day snapping.
//  - The library's `enableFuzz` with a small `maximumInterval` degenerates under FSRS-7 (the fuzz range
//    becomes [2, cap] once elapsed ≥ cap). The library therefore runs with fuzz off and no cap; Oak clamps
//    and picks the due day itself (a deterministic hash of card ID + reps, or the governor's load balancer).
//  - `forgettingCurve` of a never-reviewed card is 0.08, not 0: guarded here.
//  - `stability` under FSRS-7 is not the 90% interval: use `intervalAt(card, 0.9)`.
import { DefaultScheduler } from "ts-fsrs";
import { FSRS_VERSION, FUZZ, type KindSchedule, SCHEDULES, STREAK } from "./constants.ts";
import { DAY_MS, dayIndexOf, dayStartInstant } from "./days.ts";
import { gradeFor } from "./grade.ts";
import type {
  Card,
  CardKind,
  CardStatus,
  Rating,
  ReviewOptions,
  ReviewOutcome,
  ReviewResult,
  Revlog,
  Srs,
} from "./types.ts";

const KINDS: readonly CardKind[] = ["fact", "concept", "family", "composite"];
/** Intervals up to this long are learning steps and keep their exact instant; longer ones are whole days. */
const STEP_MAX_DAYS = 1 / 24;
/** The library never caps: Oak does. */
const LIBRARY_MAX_INTERVAL = 36_500;

/** FNV-1a → [0, 1). Deterministic; no `Math.random`. */
export function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

type StepUnit = `${number}${"m" | "h" | "d"}`;

export async function createSrs(overrides?: {
  factRetention?: number;
  fuzz?: number;
  timeZone?: string;
  rolloverHour?: number;
}): Promise<Srs> {
  const fuzz = overrides?.fuzz ?? FUZZ;
  const timeZone = overrides?.timeZone ?? "UTC";
  const rolloverHour = overrides?.rolloverHour ?? STREAK.rolloverHour;
  const schedules: Record<CardKind, KindSchedule> = {
    ...SCHEDULES,
    fact: {
      ...SCHEDULES.fact,
      desiredRetention: overrides?.factRetention ?? SCHEDULES.fact.desiredRetention,
    },
  };
  for (const kind of KINDS) {
    const r = schedules[kind].desiredRetention;
    if (!(r > 0.5 && r < 1))
      throw new Error(`@oak/srs: desired retention ${r} for ${kind} cards is out of range`);
  }

  const make = (k: KindSchedule) =>
    DefaultScheduler({
      version: FSRS_VERSION,
      desiredRetention: k.desiredRetention,
      enableShortTerm: k.enableShortTerm,
      learningSteps: k.learningSteps as readonly StepUnit[],
      relearningSteps: k.relearningSteps as readonly StepUnit[],
      enableFuzz: false,
      maximumInterval: LIBRARY_MAX_INTERVAL,
    });
  const schedulers = {
    fact: await make(schedules.fact),
    concept: await make(schedules.concept),
    family: await make(schedules.family),
    composite: await make(schedules.composite),
  };
  const modelName: string = schedulers.family.definition.model.name;

  type Scheduler = (typeof schedulers)["family"];
  type LibCard = ReturnType<Scheduler["newCard"]>;
  type LibGrade = Parameters<Scheduler["review"]>[0]["grade"];

  const toLib = (c: Card): LibCard => {
    if (c.model !== modelName) {
      throw new Error(
        `@oak/srs: card ${c.id} was written by model ${c.model}; the scheduler is ${modelName}. Migrate by replaying its revlog.`,
      );
    }
    return {
      stability: c.stability,
      stabilityFast: c.stabilityFast,
      difficulty: c.difficulty,
      state: c.state,
      scheduleStatus: c.scheduleStatus,
      dueAt: new Date(c.dueAt),
      lastReviewAt: c.lastReviewAt === null ? null : new Date(c.lastReviewAt),
      cardId: c.id,
      reps: c.reps,
      lapses: c.lapses,
      scheduledDays: c.scheduledDays,
      learningStep: c.learningStep,
    } as LibCard;
  };
  const fromLib = (c: LibCard, base: Pick<Card, "id" | "kind" | "status" | "lastRatings">): Card => ({
    id: base.id,
    kind: base.kind,
    status: base.status,
    model: modelName,
    stability: c.stability,
    stabilityFast: c.stabilityFast,
    difficulty: c.difficulty,
    state: c.state as Card["state"],
    scheduleStatus: String(c.scheduleStatus),
    dueAt: c.dueAt.toISOString(),
    lastReviewAt: c.lastReviewAt ? c.lastReviewAt.toISOString() : null,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    learningStep: c.learningStep,
    lastRatings: [...base.lastRatings],
  });

  const elapsedDays = (c: Card, now: Date): number =>
    c.lastReviewAt === null ? 0 : Math.max(0, (now.getTime() - new Date(c.lastReviewAt).getTime()) / DAY_MS);
  const reviewed = (c: Card): boolean => c.lastReviewAt !== null && c.stability > 0;

  const retrievability = (card: Card, now: Date): number => {
    if (!reviewed(card)) return 0;
    const r = schedulers[card.kind].model.forgettingCurve(toLib(card), elapsedDays(card, now));
    return Math.min(1, Math.max(0, r));
  };

  /** Oak's interval policy on top of the model's interval: floor, cap, due-day pick, rollover snap. */
  const schedule = (
    card: Card,
    modelDays: number,
    now: Date,
    opts: ReviewOptions | undefined,
  ): { dueAt: Date; scheduledDays: number } => {
    const k = schedules[card.kind];
    const min = Math.max(0, opts?.minIntervalDays ?? k.minIntervalDays);
    const max = Math.max(min, opts?.maxIntervalDays ?? k.maxIntervalDays);
    const ideal = Math.min(Math.max(modelDays, min), max);
    // A learning step of minutes keeps its exact instant; it is met in the quick-recall strip or first tomorrow.
    if (ideal <= STEP_MAX_DAYS)
      return { dueAt: new Date(now.getTime() + ideal * DAY_MS), scheduledDays: ideal };
    const delta = ideal >= 3 ? Math.max(1, ideal * fuzz) : 0;
    const lo = Math.max(1, Math.ceil(min), Math.round(ideal - delta));
    const hi = Math.max(lo, Math.min(Math.floor(max), Math.round(ideal + delta)));
    let days = lo;
    if (hi > lo) {
      const picked = opts?.pickDay
        ? opts.pickDay(ideal, lo, hi)
        : lo + Math.floor(hash01(`${card.id}:${card.reps}`) * (hi - lo + 1));
      days = Math.min(hi, Math.max(lo, Math.round(picked)));
    }
    const today = dayIndexOf(now, timeZone, rolloverHour);
    return { dueAt: dayStartInstant(today + days, timeZone, rolloverHour), scheduledDays: days };
  };

  const snapshot = (card: Card): Revlog["prev"] => ({
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    state: card.state,
    scheduleStatus: card.scheduleStatus,
    dueAt: card.dueAt,
    lastReviewAt: card.lastReviewAt,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
  });

  /**
   * A review is never earlier than the card's last review. The system clock can step backwards (NTP, a
   * manual change, a restored backup), and the library refuses a negative elapsed time: the review is
   * then taken to happen at the last review's instant.
   */
  const notBeforeLast = (card: Card, now: Date): Date => {
    const last = card.lastReviewAt === null ? Number.NaN : Date.parse(card.lastReviewAt);
    return Number.isFinite(last) && last > now.getTime() ? new Date(last) : now;
  };

  const apply = (
    card: Card,
    rating: Rating,
    outcome: ReviewOutcome,
    at: Date,
    opts: ReviewOptions | undefined,
  ): ReviewResult => {
    const now = notBeforeLast(card, at);
    const before = retrievability(card, now);
    const res = schedulers[card.kind].review({ card: toLib(card), grade: rating as LibGrade, now });
    const next = fromLib(res.card, {
      id: card.id,
      kind: card.kind,
      status: card.status,
      lastRatings: [...card.lastRatings, rating].slice(-2),
    });
    const modelIntervalDays = next.scheduledDays;
    const sched = schedule(next, modelIntervalDays, now, opts);
    next.dueAt = sched.dueAt.toISOString();
    next.scheduledDays = sched.scheduledDays;
    const revlog: Revlog = {
      cardId: card.id,
      kind: card.kind,
      model: modelName,
      rating,
      reviewedAt: now.toISOString(),
      outcome: { ...outcome },
      elapsedDays: elapsedDays(card, now),
      recallBefore: before,
      modelIntervalDays,
      scheduledDays: next.scheduledDays,
      prev: snapshot(card),
    };
    return { card: next, revlog, rating };
  };

  /** What `rate` records as the outcome when the rating was computed elsewhere. */
  const RATED_CREDIT: Record<Rating, number> = { 1: 0, 2: 0.75, 3: 0.875, 4: 1 };

  return {
    modelName,
    timeZone,
    rolloverHour,
    createCard(kind: CardKind, id: string, now: Date, status: CardStatus = "active"): Card {
      if (!id) throw new Error("@oak/srs: a card needs a stable ID (it seeds the due-day pick)");
      const lib = schedulers[kind].newCard({ now, cardId: id });
      return fromLib(lib, { id, kind, status, lastRatings: [] });
    },
    review(card, outcome, now, opts) {
      return apply(card, gradeFor(outcome), outcome, now, opts);
    },
    rate(card, rating, now, opts) {
      const outcome: ReviewOutcome = {
        meanCredit: RATED_CREDIT[rating],
        medianRtMs: 0,
        fastRtMs: 0,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        atOrAboveLevel: true,
      };
      return apply(card, rating, outcome, now, opts);
    },
    retrievability,
    isDue(card, now) {
      return new Date(card.dueAt).getTime() <= now.getTime();
    },
    intervalAt(card, retention) {
      if (!reviewed(card)) return 0;
      if (!(retention > 0 && retention < 1))
        throw new Error(`@oak/srs: retention ${retention} is out of (0, 1)`);
      return schedulers[card.kind].model.nextInterval(toLib(card), retention);
    },
    preview(card, at) {
      const now = notBeforeLast(card, at);
      const out = {} as Record<Rating, { dueAt: string; scheduledDays: number }>;
      for (const item of schedulers[card.kind].preview({ card: toLib(card), now })) {
        const next = fromLib(item.card as LibCard, card);
        const sched = schedule(next, next.scheduledDays, now, undefined);
        out[item.grade as Rating] = { dueAt: sched.dueAt.toISOString(), scheduledDays: sched.scheduledDays };
      }
      return out;
    },
    desiredRetention(kind) {
      return schedules[kind].desiredRetention;
    },
    dayOf(at) {
      return dayIndexOf(at instanceof Date ? at : new Date(at), timeZone, rolloverHour);
    },
  };
}
