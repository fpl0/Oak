/**
 * Spike S7 — review-load governor (plan resolution 6). Pure policy: no ts-fsrs, no clock, no RNG.
 * The caller (server/services/srs, or sim.ts here) owns the cards and feeds plain numbers in.
 *
 * Levers, in the order they act on a session:
 *   1. smoothBacklog   after a gap of >= gapDays, overdue items are dealt out over the next 5–7 days
 *   2. admitFamilies   <= maxActivePerceptual active families; a queued family is activated only while the
 *                      7-day forecast leaves headroom ("seed in the lesson, defer the first review")
 *   3. planWarmup      strict budget, easy-win opener, leftovers stay due and are never shown as a count
 *   4. admitNewFacts   new fact cards fill what is left of today's budget, up to a per-session cap
 *   5. shouldGraduate  a family at mastery level whose stability exceeds 21 d joins a composite "mixed ear" card
 *   6. makeDayPicker   when a card is rescheduled, pick the least-loaded day inside its fuzz window
 */

export type EarGroup = 'pitch' | 'harmony' | 'rhythm';
export type ItemClass = 'family' | 'concept' | 'composite' | 'fact';

export interface GovernorConfig {
  /** false = baseline: review everything that is due, activate everything at unlock, never graduate. */
  enabled: boolean;
  /** Warm-up budget in seconds: 240 / 300 / 360 for the 15 / 20 / 25-min session settings. */
  budgetSec: number;
  maxActivePerceptual: number;
  /** "stability > 21 days": by default measured as t(R = 0.90) so it means the same under FSRS-6 and FSRS-7. */
  graduateDays: number;
  graduateMetric: 't90' | 'stability';
  forecastDays: number;
  sessionsPerWeek: number;
  /** A queued family is activated only while projected per-session load stays under headroom × budget. */
  intakeHeadroom: number;
  maxNewFactsPerSession: number;
  /** Gap (days without practice) that triggers return mode. */
  gapDays: number;
  backlogSpreadDays: number;
  /** Share of the budget a single day's slice of smoothed backlog may take (the rest is for cards falling due). */
  backlogShare: number;
  /**
   * Practice cadence: an ACTIVE (not yet graduated) perceptual family is never scheduled further out than this.
   * null = pure FSRS intervals (the plan as written).
   */
  activeMaxIntervalDays: number | null;
  compositeMaxIntervalDays: number;
  compositeSetSec: number;
  /** Pick the least-loaded day inside the fuzz window instead of a hash-random one. */
  loadBalance: boolean;
  /** The planner fills only this fraction of the budget, so real durations (±12%) still land under it at p95. */
  planFraction: number;
  /**
   * Share of the budget reserved for fact cards; the rest is for sets (families, concept sets, composites).
   * Each class may borrow what the other leaves unused on the day. Intake of each class is throttled against its own share.
   */
  factShare: number;
  /** Priority gained per day an item has waited past its due day (prevents starvation of high-recall items). */
  agingPerDay: number;
  /** Reviews a brand-new fact card needs inside the forecast window (today + the first follow-up). */
  newFactReviewsInWindow: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
  enabled: true,
  budgetSec: 300,
  maxActivePerceptual: 12,
  graduateDays: 21,
  graduateMetric: 't90',
  forecastDays: 7,
  sessionsPerWeek: 5,
  intakeHeadroom: 0.85,
  maxNewFactsPerSession: 8,
  gapDays: 3,
  backlogSpreadDays: 6,
  backlogShare: 0.6,
  activeMaxIntervalDays: null,
  compositeMaxIntervalDays: 180,
  compositeSetSec: 75,
  loadBalance: true,
  planFraction: 0.94,
  factShare: 0.4,
  agingPerDay: 0.05,
  newFactReviewsInWindow: 2,
};

/**
 * What the 300-day simulation supports (FINDINGS.md §4): the plan's governor plus a 7-day practice cadence for
 * active families. It also needs fact cards at desired retention 0.85 (srs config) and <= 2 SRS fact cards per
 * lesson (content rule); those two live outside this module.
 */
export const RECOMMENDED_GOVERNOR: GovernorConfig = { ...DEFAULT_GOVERNOR, activeMaxIntervalDays: 7 };

export const BUDGET_SEC_BY_SESSION_MIN: Record<15 | 20 | 25, number> = { 15: 240, 20: 300, 25: 360 };

/** One reviewable thing as the governor sees it. `day` values are Oak-day indices (srs.dayIndex). */
export interface ReviewItem {
  id: string;
  cls: ItemClass;
  /** Estimated seconds for one review (a whole mini-set for families, one card for facts). */
  sec: number;
  dueDay: number;
  /** Predicted recall right now, 0..1. */
  recall: number;
  /** Set by smoothBacklog: not offered before this day. */
  deferUntilDay?: number;
  /** For forecasting: the item recurs at least this often (active families under a cadence cap). */
  repeatDays?: number;
}

/** Seconds falling due on each of the next `days`+1 days; index 0 = today and includes everything overdue. */
export function forecastLoad(items: readonly ReviewItem[], today: number, days: number): number[] {
  const load = new Array<number>(days + 1).fill(0);
  for (const it of items) {
    let d = Math.max(it.dueDay, it.deferUntilDay ?? it.dueDay, today) - today;
    while (d <= days) {
      load[d] = (load[d] as number) + it.sec;
      if (!it.repeatDays) break;
      d += Math.max(1, it.repeatDays);
    }
  }
  return load;
}

/** Average seconds per session implied by a forecast window. */
export function projectedSessionSec(load: readonly number[], cfg: GovernorConfig): number {
  const sessions = Math.max(1, (cfg.sessionsPerWeek * load.length) / 7);
  return load.reduce((a, b) => a + b, 0) / sessions;
}

/** Expected reviews of a newly activated family inside the forecast window (fractional). */
function reviewsInWindow(cfg: GovernorConfig): number {
  return cfg.activeMaxIntervalDays ? Math.max(1, (cfg.forecastDays + 1) / cfg.activeMaxIntervalDays) : 1;
}

const isSet = (it: ReviewItem) => it.cls !== 'fact';

/**
 * Intake throttle for perceptual families. Returns how many queued families (FIFO) to activate now.
 * `queuedSecs` are the set durations of the queued families in unlock order.
 * A family is activated only while (a) fewer than maxActivePerceptual are active and (b) the 7-day forecast of
 * set work, including the newcomer's repeats, stays under headroom × the set share of the budget.
 */
export function admitFamilies(args: { activeCount: number; queuedSecs: readonly number[]; items: readonly ReviewItem[]; today: number; paused?: boolean }, cfg: GovernorConfig): number {
  if (!cfg.enabled) return args.queuedSecs.length;
  if (args.paused) return 0;
  const load = forecastLoad(args.items.filter(isSet), args.today, cfg.forecastDays);
  const sessions = Math.max(1, (cfg.sessionsPerWeek * load.length) / 7);
  const limit = cfg.intakeHeadroom * (1 - cfg.factShare) * cfg.budgetSec;
  let projected = projectedSessionSec(load, cfg);
  let n = 0;
  for (const sec of args.queuedSecs) {
    if (args.activeCount + n >= cfg.maxActivePerceptual) break;
    const added = (sec * reviewsInWindow(cfg)) / sessions;
    // never starve intake completely: with nothing active, the first family is always admitted
    if (projected + added > limit && args.activeCount + n > 0) break;
    projected += added;
    n++;
  }
  return n;
}

export interface WarmupPlan {
  /** In presentation order. */
  selected: ReviewItem[];
  /** Due but not shown today (hidden overflow). */
  leftover: ReviewItem[];
  usedSec: number;
  /** Everything that was due before any hiding. */
  demandSec: number;
}

/**
 * Choose today's warm-up from the due items.
 *  - opener = highest predicted recall (the easy win)
 *  - then by priority = 2·(1 − recall) + agingPerDay·daysLate; on a return day (gap >= gapDays) items in
 *    the 0.75–0.90 recall band go first
 *  - strict budget (× planFraction): an item that does not fit is skipped; smaller ones may still fill the gap
 *  - pass 1 respects the fact / set shares, pass 2 lets either class use what the other left
 *  - at least one item is always shown if anything is due
 */
export function planWarmup(due: readonly ReviewItem[], today: number, gapDaysSinceLast: number, cfg: GovernorConfig): WarmupPlan {
  const demandSec = due.reduce((a, it) => a + it.sec, 0);
  if (!cfg.enabled) return { selected: orderForPlay([...due]), leftover: [], usedSec: demandSec, demandSec };
  const budget = cfg.budgetSec * cfg.planFraction;
  const offered = due.filter((it) => (it.deferUntilDay ?? today) <= today);
  const held = due.filter((it) => (it.deferUntilDay ?? today) > today);
  const returning = gapDaysSinceLast >= cfg.gapDays;
  const prio = (it: ReviewItem) => 2 * (1 - it.recall) + cfg.agingPerDay * Math.max(0, today - it.dueDay) + (returning && it.recall >= 0.75 && it.recall <= 0.9 ? 10 : 0);
  const ranked = [...offered].sort((a, b) => prio(b) - prio(a) || (a.id < b.id ? -1 : 1));
  const cap = { fact: cfg.factShare * budget, set: (1 - cfg.factShare) * budget };
  const used = { fact: 0, set: 0 };
  const chosen = new Set<ReviewItem>();
  const selected: ReviewItem[] = [];
  const take = (it: ReviewItem) => {
    chosen.add(it);
    selected.push(it);
    used[it.cls === 'fact' ? 'fact' : 'set'] += it.sec;
  };
  // opener: the highest-recall item that fits (or, if nothing fits, the highest-recall item anyway)
  const byRecall = [...offered].sort((a, b) => b.recall - a.recall || (a.id < b.id ? -1 : 1));
  const opener = byRecall.find((it) => it.sec <= budget) ?? byRecall[0];
  if (opener) take(opener);
  for (const it of ranked) {
    const k = it.cls === 'fact' ? 'fact' : 'set';
    if (!chosen.has(it) && used.fact + used.set + it.sec <= budget && used[k] + it.sec <= cap[k]) take(it);
  }
  for (const it of ranked) if (!chosen.has(it) && used.fact + used.set + it.sec <= budget) take(it);
  return { selected, leftover: [...held, ...ranked.filter((it) => !chosen.has(it))], usedSec: used.fact + used.set, demandSec };
}

function orderForPlay(items: ReviewItem[]): ReviewItem[] {
  if (items.length < 2) return items;
  const best = items.reduce((a, b) => (b.recall > a.recall ? b : a));
  return [best, ...items.filter((x) => x !== best).sort((a, b) => a.recall - b.recall)];
}

/**
 * New fact cards allowed into today's warm-up after the due items were planned. Bounded by
 * (a) the room left in today's budget, (b) maxNewFactsPerSession and (c) the 7-day forecast of fact reviews,
 * which must stay under headroom × the fact share of the budget.
 */
export function admitNewFacts(args: { waiting: number; usedSec: number; factSec: number; items: readonly ReviewItem[]; today: number; paused?: boolean }, cfg: GovernorConfig): number {
  if (!cfg.enabled) return args.waiting;
  if (args.paused) return 0;
  const room = Math.floor((cfg.budgetSec * cfg.planFraction - args.usedSec) / args.factSec);
  const load = forecastLoad(args.items.filter((it) => it.cls === 'fact'), args.today, cfg.forecastDays);
  const sessions = Math.max(1, (cfg.sessionsPerWeek * load.length) / 7);
  const perNew = (args.factSec * cfg.newFactReviewsInWindow) / sessions;
  const byForecast = Math.floor((cfg.intakeHeadroom * cfg.factShare * cfg.budgetSec - projectedSessionSec(load, cfg)) / perNew);
  return Math.max(0, Math.min(args.waiting, cfg.maxNewFactsPerSession, room, byForecast));
}

/**
 * Return mode. Called once on the first session after a gap: deals the overdue items out over the next
 * `backlogSpreadDays` days (more if a day's slice would exceed backlogShare × budget).
 * Items in the 0.75–0.90 recall band come first, then the rest by descending recall.
 * Returns id -> deferUntilDay. Memory state is untouched; FSRS sees the true elapsed time when the review happens.
 */
export function smoothBacklog(overdue: readonly ReviewItem[], today: number, cfg: GovernorConfig): Map<string, number> {
  const out = new Map<string, number>();
  if (!cfg.enabled || overdue.length === 0) return out;
  const total = overdue.reduce((a, it) => a + it.sec, 0);
  const perDayCap = cfg.backlogShare * cfg.budgetSec;
  const days = Math.max(cfg.backlogSpreadDays, Math.ceil(total / perDayCap));
  const slice = total / days;
  const inBand = (r: number) => r >= 0.75 && r <= 0.9;
  const order = [...overdue].sort((a, b) => Number(inBand(b.recall)) - Number(inBand(a.recall)) || b.recall - a.recall || (a.id < b.id ? -1 : 1));
  let acc = 0;
  for (const it of order) {
    const k = Math.min(days - 1, Math.floor(acc / slice));
    out.set(it.id, today + k);
    acc += it.sec;
  }
  return out;
}

/** Graduation into a composite card: mastered (level) AND stable. */
export function shouldGraduate(f: { level: number; masteryLevel: number; t90Days: number; stability: number }, cfg: GovernorConfig): boolean {
  if (!cfg.enabled) return false;
  if (f.level < f.masteryLevel) return false;
  return (cfg.graduateMetric === 't90' ? f.t90Days : f.stability) > cfg.graduateDays;
}

/** Interval cap to pass to srs.review() for each kind of card under the governor. */
export function intervalCap(status: 'active' | 'composite' | 'other', cfg: GovernorConfig): number | undefined {
  if (!cfg.enabled) return undefined;
  if (status === 'active') return cfg.activeMaxIntervalDays ?? undefined;
  if (status === 'composite') return cfg.compositeMaxIntervalDays;
  return undefined;
}

/**
 * Load balancer for srs.review({ pickDay }). `loadByDay` maps Oak-day index -> seconds already due that day.
 * The caller adds the reviewed card's seconds to `loadByDay` after the review so later reviews in the
 * same session spread out. `likelyPracticeDay(day)` (optional) says whether the learner usually practises on
 * that day; a card due on an unlikely day will really be met on the next likely one, so its load is counted there.
 */
export function makeDayPicker(loadByDay: ReadonlyMap<number, number>, today: number, cfg: GovernorConfig, fallback: (lo: number, hi: number) => number, likelyPracticeDay?: (day: number) => boolean) {
  const landing = (day: number) => landingDay(day, likelyPracticeDay);
  return (ideal: number, lo: number, hi: number): number => {
    if (!cfg.enabled || !cfg.loadBalance) return fallback(lo, hi);
    let pick = lo;
    let best = Number.POSITIVE_INFINITY;
    for (let d = lo; d <= hi; d++) {
      const land = landing(today + d);
      // prefer a day the learner will actually show up on; ties -> closest to ideal
      const cost = (loadByDay.get(land) ?? 0) + (land !== today + d ? 1e-2 : 0) + Math.abs(d - ideal) * 1e-3;
      if (cost < best) {
        best = cost;
        pick = d;
      }
    }
    return pick;
  };
}

/** The day a card due on `day` will really be met: the first likely practice day on or after it (within a week). */
export function landingDay(day: number, likelyPracticeDay?: (day: number) => boolean): number {
  if (!likelyPracticeDay) return day;
  for (let k = 0; k < 7; k++) if (likelyPracticeDay(day + k)) return day + k;
  return day;
}
