/**
 * Spike S7 — Oak's SRS interface over ts-fsrs 6.0.0 (FSRS-7).
 *
 * Verified on Bun 1.4.4 (see FINDINGS.md). Facts that shaped this file:
 *  - `DefaultScheduler(opts)` is ASYNC (it lazy-imports the model preset); everything after is sync.
 *  - version option is 'FSRS-7'; the model name stored on cards is `scheduler.definition.model.name` = 'fsrs-7'.
 *  - Cards are plain objects with Date fields (`dueAt`, `lastReviewAt`). JSON round-trip needs Date revival;
 *    string dates throw SRSSchemaError. Unknown extra keys are silently dropped by `review()`.
 *  - FSRS-7 uses fractional days: Again on a family card is due in ~10 s, Hard on a new fact in ~14 h.
 *    Oak sessions are daily, so the wrapper applies its own interval floor / cap / day snapping.
 *  - The library's `enableFuzz` + small `maximumInterval` degenerates under FSRS-7 (fuzz range becomes
 *    [2, cap] once elapsed >= cap). So the library runs with fuzz OFF and no cap; Oak clamps and
 *    picks the due day itself (deterministic hash fuzz by default, or the governor's load balancer).
 *
 * Isomorphic: no Bun / DOM APIs.
 */
import { DefaultScheduler, Rating } from 'ts-fsrs';

export type CardKind = 'fact' | 'family';
export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy  (ts-fsrs Rating values)
export const GRADE_NAME: Record<Grade, 'Again' | 'Hard' | 'Good' | 'Easy'> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

/** What one review produced. For a family this is a whole mini-set; for a fact, accuracy is 0 or 1. */
export interface Outcome {
  accuracy: number; // mean credit in [0, 1]
  fast: boolean; // median response time <= the family's fastRtMs
  revealed: boolean; // the answer was revealed (hint rung 4) => Again
}

/** Plain-JSON card. This is exactly what gets persisted (dates are ISO strings). */
export interface OakCard {
  id: string;
  kind: CardKind;
  /** `scheduler.definition.model.name`, e.g. 'fsrs-7'. Stored so a later model change can migrate by replay. */
  model: string;
  stability: number;
  stabilityFast: number;
  difficulty: number;
  /** 0 New · 1 Learning · 2 Review · 3 Relearning */
  state: number;
  scheduleStatus: string;
  dueAt: string;
  lastReviewAt: string | null;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
}

/** Plain-JSON review log (pre-review snapshot + rating); enough to replay or roll back. */
export interface OakRevlog {
  cardId: string;
  kind: CardKind;
  model: string;
  rating: Grade;
  reviewTime: string;
  accuracy: number;
  fast: boolean;
  revealed: boolean;
  /** elapsed days since the previous review (0 for the first) */
  elapsedDays: number;
  /** predicted recall just before this review (0 for a new card) */
  recallBefore: number;
  /** interval the model asked for, before Oak's floor / cap / day pick */
  modelIntervalDays: number;
  /** interval actually scheduled */
  scheduledDays: number;
  prev: Pick<OakCard, 'stability' | 'stabilityFast' | 'difficulty' | 'state' | 'dueAt' | 'lastReviewAt' | 'reps' | 'lapses' | 'scheduledDays' | 'learningStep' | 'scheduleStatus'>;
}

export interface KindConfig {
  desiredRetention: number;
  /** Oak floor in days. Families: 1 (a failed 60 s set is not repeated in the same warm-up). Facts: 0 (learning steps apply). */
  minIntervalDays: number;
  /** Oak cap in days (applied by Oak, NOT by the library — see header). */
  maxIntervalDays: number;
  enableShortTerm: boolean;
  learningSteps: readonly `${number}${'m' | 'h' | 'd'}`[];
  relearningSteps: readonly `${number}${'m' | 'h' | 'd'}`[];
}

export interface SrsConfig {
  fact: KindConfig;
  family: KindConfig;
  /** Half-width of the due-day window as a fraction of the interval (0 disables). */
  fuzz: number;
  /** Local-day rollover expressed as a UTC hour offset; due dates of >= 1 day snap to this instant. */
  rolloverUtcHour: number;
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  fact: { desiredRetention: 0.9, minIntervalDays: 0, maxIntervalDays: 365, enableShortTerm: true, learningSteps: ['5m'], relearningSteps: ['5m'] },
  family: { desiredRetention: 0.85, minIntervalDays: 1, maxIntervalDays: 180, enableShortTerm: false, learningSteps: [], relearningSteps: [] },
  fuzz: 0.05,
  rolloverUtcHour: 4,
};

export interface ReviewOptions {
  /** Per-review override of the cap (the governor uses it for the active-family cadence). */
  maxIntervalDays?: number;
  minIntervalDays?: number;
  /**
   * Chooses the due day inside [lo, hi] (whole days from `now`); `ideal` is the clamped model interval.
   * Default: deterministic hash fuzz seeded by card id + reps.
   */
  pickDay?: (ideal: number, lo: number, hi: number) => number;
}

export interface ReviewResult {
  card: OakCard;
  revlog: OakRevlog;
  grade: Grade;
}

export interface Srs {
  readonly config: SrsConfig;
  readonly modelName: string;
  createCard(kind: CardKind, now: Date, id?: string): OakCard;
  review(card: OakCard, outcome: Outcome, now: Date, opts?: ReviewOptions): ReviewResult;
  /** Predicted probability of recall right now. 0 for a never-reviewed card. */
  recallProbability(card: OakCard, now: Date): number;
  isDue(card: OakCard, now: Date): boolean;
  /** Days after the last review at which predicted recall falls to `retention` (version-independent "stability"). */
  intervalAt(card: OakCard, retention: number): number;
  /** The four possible next cards, without committing. */
  preview(card: OakCard, now: Date): Record<Grade, { dueAt: string; scheduledDays: number }>;
}

/** Plan resolution 6: <.65 Again, <.80 Hard, otherwise Good, >=.95 and fast Easy. Revealed = Again. */
export function gradeFor(o: Outcome): Grade {
  if (o.revealed || !(o.accuracy >= 0.65)) return 1;
  if (o.accuracy < 0.8) return 2;
  if (o.accuracy >= 0.95 && o.fast) return 4;
  return 3;
}

const DAY_MS = 86_400_000;

/** FNV-1a -> [0, 1). Deterministic; no Math.random. */
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

/** Index of the "Oak day" containing `t` (days since epoch, shifted by the rollover hour). */
export function dayIndex(t: Date | string | number, rolloverUtcHour = DEFAULT_SRS_CONFIG.rolloverUtcHour): number {
  const ms = t instanceof Date ? t.getTime() : new Date(t).getTime();
  return Math.floor((ms - rolloverUtcHour * 3_600_000) / DAY_MS);
}
export function dayStart(index: number, rolloverUtcHour = DEFAULT_SRS_CONFIG.rolloverUtcHour): Date {
  return new Date(index * DAY_MS + rolloverUtcHour * 3_600_000);
}

export async function createSrs(overrides: Partial<SrsConfig> = {}): Promise<Srs> {
  const config: SrsConfig = { ...DEFAULT_SRS_CONFIG, ...overrides };
  const make = (k: KindConfig) =>
    DefaultScheduler({
      version: 'FSRS-7',
      desiredRetention: k.desiredRetention,
      enableShortTerm: k.enableShortTerm,
      learningSteps: k.learningSteps,
      relearningSteps: k.relearningSteps,
      enableFuzz: false, // Oak picks the day (see header)
      maximumInterval: 36_500, // Oak caps (see header)
    });
  const schedulers = { fact: await make(config.fact), family: await make(config.family) };
  const modelName = schedulers.family.definition.model.name; // 'fsrs-7'

  type LibCard = ReturnType<(typeof schedulers)['family']['newCard']>;

  const toLib = (c: OakCard): LibCard => {
    if (c.model !== modelName) throw new Error(`card ${c.id} was written by model ${c.model}; scheduler is ${modelName} — migrate by replaying revlogs`);
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
  const fromLib = (c: LibCard, kind: CardKind): OakCard => ({
    id: String(c.cardId),
    kind,
    model: modelName,
    stability: c.stability,
    stabilityFast: c.stabilityFast,
    difficulty: c.difficulty,
    state: c.state,
    scheduleStatus: c.scheduleStatus,
    dueAt: c.dueAt.toISOString(),
    lastReviewAt: c.lastReviewAt ? c.lastReviewAt.toISOString() : null,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    learningStep: c.learningStep,
  });

  const elapsedDays = (c: OakCard, now: Date) => (c.lastReviewAt === null ? 0 : Math.max(0, (now.getTime() - new Date(c.lastReviewAt).getTime()) / DAY_MS));

  const recallProbability = (card: OakCard, now: Date): number => {
    // The library returns ~0.08 for the all-zero state of a new card; define it as 0 instead.
    if (card.lastReviewAt === null || card.stability <= 0) return 0;
    return schedulers[card.kind].model.forgettingCurve(card, elapsedDays(card, now));
  };

  /** Oak's interval policy on top of the model's interval. Returns the final dueAt + scheduledDays. */
  const schedule = (card: OakCard, modelDays: number, now: Date, opts: ReviewOptions | undefined) => {
    const k = config[card.kind];
    const min = opts?.minIntervalDays ?? k.minIntervalDays;
    const max = Math.max(min, opts?.maxIntervalDays ?? k.maxIntervalDays);
    const ideal = Math.min(Math.max(modelDays, min), max);
    if (ideal < 1) {
      // sub-day (fact learning steps): keep the exact instant
      return { dueAt: new Date(now.getTime() + ideal * DAY_MS), scheduledDays: ideal };
    }
    const delta = ideal >= 3 ? Math.max(1, ideal * config.fuzz) : 0;
    const lo = Math.max(1, Math.max(Math.ceil(min), Math.round(ideal - delta)));
    const hi = Math.max(lo, Math.min(Math.floor(max), Math.round(ideal + delta)));
    let days = Math.round(ideal);
    if (hi > lo) {
      days = opts?.pickDay ? opts.pickDay(ideal, lo, hi) : lo + Math.floor(hash01(`${card.id}:${card.reps}`) * (hi - lo + 1));
      days = Math.min(hi, Math.max(lo, Math.round(days)));
    } else {
      days = lo;
    }
    const today = dayIndex(now, config.rolloverUtcHour);
    return { dueAt: dayStart(today + days, config.rolloverUtcHour), scheduledDays: days };
  };

  return {
    config,
    modelName,
    createCard(kind, now, id) {
      const lib = schedulers[kind].newCard({ now, cardId: id ?? globalThis.crypto.randomUUID() });
      return fromLib(lib, kind);
    },
    review(card, outcome, now, opts) {
      const grade = gradeFor(outcome);
      const s = schedulers[card.kind];
      const before = recallProbability(card, now);
      const res = s.review({ card: toLib(card), grade: grade as (typeof Rating)['Good'], now });
      const next = fromLib(res.card, card.kind);
      const modelIntervalDays = next.scheduledDays;
      const sched = schedule(next, modelIntervalDays, now, opts);
      next.dueAt = sched.dueAt.toISOString();
      next.scheduledDays = sched.scheduledDays;
      const revlog: OakRevlog = {
        cardId: card.id,
        kind: card.kind,
        model: modelName,
        rating: grade,
        reviewTime: now.toISOString(),
        accuracy: outcome.accuracy,
        fast: outcome.fast,
        revealed: outcome.revealed,
        elapsedDays: elapsedDays(card, now),
        recallBefore: before,
        modelIntervalDays,
        scheduledDays: next.scheduledDays,
        prev: {
          stability: card.stability,
          stabilityFast: card.stabilityFast,
          difficulty: card.difficulty,
          state: card.state,
          dueAt: card.dueAt,
          lastReviewAt: card.lastReviewAt,
          reps: card.reps,
          lapses: card.lapses,
          scheduledDays: card.scheduledDays,
          learningStep: card.learningStep,
          scheduleStatus: card.scheduleStatus,
        },
      };
      return { card: next, revlog, grade };
    },
    recallProbability,
    isDue(card, now) {
      return new Date(card.dueAt).getTime() <= now.getTime();
    },
    intervalAt(card, retention) {
      if (card.lastReviewAt === null || card.stability <= 0) return 0;
      return schedulers[card.kind].model.nextInterval(card, retention);
    },
    preview(card, now) {
      const out = {} as Record<Grade, { dueAt: string; scheduledDays: number }>;
      for (const item of schedulers[card.kind].preview({ card: toLib(card), now })) {
        const next = fromLib(item.card as LibCard, card.kind);
        const sched = schedule(next, next.scheduledDays, now, undefined);
        out[item.grade as Grade] = { dueAt: sched.dueAt.toISOString(), scheduledDays: sched.scheduledDays };
      }
      return out;
    },
  };
}
