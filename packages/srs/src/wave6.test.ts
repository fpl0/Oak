// Wave 6 changes to the review-load engine, each one a rule of contracts §7.4 made to hold where it did not:
//   - a fact card that was dealt and not shown waits like any due card after two days (it used to be outranked by
//     every day's reviews for as long as there were any, and was the "oldest undelivered due card" all that time);
//   - a family's first set is never spread over the days after a break (it is planned first on the day back);
//   - a reviews-only day can be planned with the warm-up outside the 12-minute cap (d22), the default unchanged.
import { describe, expect, test } from "bun:test";
import {
  type PlanContext,
  planReviewDay,
  planWarmup,
  REVIEW_DAY_MAX_SEC,
  type ReviewItem,
  recommendedGovernor,
  smoothBacklog,
  URGENT_AFTER_DAYS,
  warmupPriority,
} from "./index.ts";

const T = 20_000;
let n = 0;
const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({
  cardId: o.cardId ?? `c${String(n++).padStart(3, "0")}`,
  cls: "family",
  family: null,
  domain: "pitch",
  sec: 60,
  dueDay: T,
  recall: 0.85,
  mic: false,
  perceptual: true,
  blockedIntroPending: false,
  linkedToNextLesson: false,
  debt: false,
  repair: false,
  skills: [],
  ...o,
});
const fact = (o: Partial<ReviewItem> = {}): ReviewItem =>
  item({ cls: "fact", domain: "fact", sec: 8, perceptual: false, ...o });
const ctx = (o: Partial<PlanContext> = {}): PlanContext => ({
  today: T,
  gapDays: 0,
  anchorFallback: null,
  ...o,
});
const cfg = recommendedGovernor(15);

describe("a dealt card that has not been shown waits like a due card (the oldest-due criterion)", () => {
  // A full day of due fact reviews (more than the warm-up holds) and one new card.
  const reviews = (day: number) =>
    Array.from({ length: 40 }, (_, i) => fact({ cardId: `due${i}`, recall: 0.8, dueDay: day }));
  test("on the day it is dealt and the day after, a new card fills only the room the reviews leave", () => {
    for (const waited of [0, 1]) {
      const fresh = fact({ cardId: "new", recall: 0, fresh: true, dueDay: T - waited });
      expect(warmupPriority(fresh, T, cfg)).toBe(-1);
      const plan = planWarmup([fresh, ...reviews(T)], ctx(), cfg);
      expect(plan.items.some((p) => p.cardIds.includes("new"))).toBe(false);
      expect(plan.overflow.some((it) => it.cardId === "new")).toBe(true);
    }
    // With room to spare it is shown at once.
    const quiet = planWarmup(
      [fact({ cardId: "new", recall: 0, fresh: true }), ...reviews(T).slice(0, 5)],
      ctx(),
      cfg,
    );
    expect(quiet.items.some((p) => p.cardIds.includes("new"))).toBe(true);
  });
  test(`after ${URGENT_AFTER_DAYS} days it gains priority with every day waited, with no forgetting term, and gets in`, () => {
    const waiting = (days: number) => fact({ cardId: "new", recall: 0, fresh: true, dueDay: T - days });
    expect(warmupPriority(waiting(2), T, cfg)).toBeCloseTo(2 * cfg.agingPerDay, 9);
    expect(warmupPriority(waiting(5), T, cfg)).toBeCloseTo(5 * cfg.agingPerDay, 9);
    // A review due today at 0.8 recall has priority 0.4: a card dealt two days ago (0.6) goes before it.
    const plan = planWarmup([waiting(2), ...reviews(T)], ctx(), cfg);
    expect(plan.items.some((p) => p.cardIds.includes("new"))).toBe(true);
    // It never jumps the queue of older work: reviews that have waited as long go first, card for card.
    const older = Array.from({ length: 40 }, (_, i) =>
      fact({ cardId: `old${i}`, recall: 0.8, dueDay: T - 2 }),
    );
    const behind = planWarmup([waiting(2), ...older], ctx(), cfg);
    expect(behind.items.some((p) => p.cardIds.includes("new"))).toBe(false);
    // And it is never the opener (a sure win) nor the "most urgent" item.
    const alone = planWarmup([waiting(9), item({ cardId: "set", sec: 60, recall: 0.9 })], ctx(), cfg);
    expect(alone.items[0]?.item.cardId).toBe("set");
  });
  test("a card dealt into a week of full warm-ups is shown within a few days, whatever arrives after it", () => {
    // Every day brings a fresh day's worth of reviews; the new card was dealt on day 0.
    let shownOn = -1;
    for (let d = 0; d < 10 && shownOn < 0; d++) {
      const fresh = fact({ cardId: "new", recall: 0, fresh: true, dueDay: T });
      const plan = planWarmup([fresh, ...reviews(T + d)], ctx({ today: T + d }), cfg);
      if (plan.items.some((p) => p.cardIds.includes("new"))) shownOn = d;
    }
    expect(shownOn).toBeGreaterThanOrEqual(2);
    expect(shownOn).toBeLessThanOrEqual(3);
  });
});

describe("a family's first set after a break", () => {
  test("it is not spread over the backlog days: it stays offered today, where the planner puts it first", () => {
    const first = item({
      cardId: "first",
      sec: 56,
      recall: 0,
      firstSet: true,
      blockedIntroPending: true,
      dueDay: T - 11,
    });
    const backlog = Array.from({ length: 30 }, (_, i) =>
      item({
        cardId: `b${i}`,
        sec: 60,
        recall: 0.4 + (i % 6) * 0.1,
        dueDay: T - 5 - (i % 7),
        domain: `d${i % 4}`,
      }),
    );
    const spread = smoothBacklog([first, ...backlog], T, cfg);
    expect(spread.has("first")).toBe(false);
    expect(spread.size).toBe(backlog.length);
    expect(Math.max(...spread.values())).toBeGreaterThan(T + 3);
    // On the day back the first set is in the plan (chosen before the return order; a sure win still opens).
    const offered = [first, ...backlog.map((b) => ({ ...b, deferUntilDay: spread.get(b.cardId) as number }))];
    const plan = planWarmup(offered, ctx({ gapDays: 10 }), cfg);
    expect(plan.items.some((p) => p.item.cardId === "first")).toBe(true);
    // Spread with the rest, as before Wave 6, its zero recall put it on the last day.
    const old = smoothBacklog([{ ...first, firstSet: false }, ...backlog], T, cfg);
    expect(old.get("first")).toBe(Math.max(...old.values()));
    expect((old.get("first") as number) - T).toBeGreaterThanOrEqual(4);
  });
  test("with nothing but first sets there is nothing to spread", () => {
    const only = [
      item({ cardId: "a", firstSet: true, recall: 0 }),
      item({ cardId: "b", firstSet: true, recall: 0 }),
    ];
    expect(smoothBacklog(only, T, cfg).size).toBe(0);
  });
});

describe("planReviewDay with the warm-up outside the cap (d22)", () => {
  const due = Array.from({ length: 60 }, (_, i) =>
    item({ domain: `d${i % 5}`, sec: 45, recall: 0.6 + (i % 10) * 0.03 }),
  );
  const c20 = recommendedGovernor(20);
  test("default: the whole day stays inside 12 minutes (contracts §7.4, decision 23)", () => {
    const day = planReviewDay(due, ctx(), c20);
    expect(day.plannedSec).toBeLessThanOrEqual(REVIEW_DAY_MAX_SEC);
    expect(day.blocks.reduce((a, b) => a + b.budgetSec, 0)).toBe(REVIEW_DAY_MAX_SEC);
    expect(day.moreSec).toBe(day.plannedSec - (day.blocks[0]?.plannedSec ?? 0));
  });
  test("`warmupCounts: false`: the first block is the budget, then up to 12 minutes of 'a little more' on top", () => {
    const day = planReviewDay(due, ctx(), c20, { warmupCounts: false });
    expect(day.blocks[0]?.budgetSec).toBe(300);
    expect(day.blocks.slice(1).reduce((a, b) => a + b.budgetSec, 0)).toBe(REVIEW_DAY_MAX_SEC);
    expect(day.moreSec).toBeLessThanOrEqual(REVIEW_DAY_MAX_SEC);
    expect(day.moreSec).toBeGreaterThan(REVIEW_DAY_MAX_SEC - 300);
    expect(day.plannedSec).toBeLessThanOrEqual(300 + REVIEW_DAY_MAX_SEC);
    // More is planned than under the old cap, and the first block is the same warm-up either way.
    const capped = planReviewDay(due, ctx(), c20);
    expect(day.plannedSec).toBeGreaterThan(capped.plannedSec);
    expect(day.blocks[0]).toEqual(capped.blocks[0] as never);
    // Nothing is planned twice.
    const ids = day.blocks.flatMap((b) => b.items.flatMap((p) => p.cardIds));
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("a day with little due is one block under both rules", () => {
    for (const opts of [{}, { warmupCounts: false }]) {
      const day = planReviewDay(due.slice(0, 3), ctx(), c20, opts);
      expect(day.blocks).toHaveLength(1);
      expect(day.moreSec).toBe(0);
      expect(day.overflow).toHaveLength(0);
    }
  });
});
