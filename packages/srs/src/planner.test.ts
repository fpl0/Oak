import { describe, expect, test } from "bun:test";
import {
  LISTEN_BLOCK_SEC,
  type PlanContext,
  planReviewDay,
  planWarmup,
  REVIEW_DAY_MAX_SEC,
  type ReviewItem,
  recommendedGovernor,
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
const ctx = (o: Partial<PlanContext> = {}): PlanContext => ({
  today: T,
  gapDays: 0,
  anchorFallback: null,
  ...o,
});
const cfg = recommendedGovernor(20);
const sets = (plan: ReturnType<typeof planWarmup>) => plan.items.filter((p) => p.kind !== "listen");

describe("planWarmup", () => {
  test("nothing due: an empty plan", () => {
    expect(planWarmup([], ctx(), cfg)).toEqual({
      budgetSec: 300,
      plannedSec: 0,
      items: [],
      overflow: [],
      overflowSec: 0,
    });
  });

  test("the priority formula of contracts §7.4, with aging and fresh cards last", () => {
    const p = (o: Partial<ReviewItem>) => warmupPriority(item(o), T, { agingPerDay: 0 });
    expect(p({ recall: 0.8 })).toBeCloseTo(0.4, 9);
    expect(p({ recall: 1, blockedIntroPending: true })).toBe(1);
    expect(p({ recall: 1, linkedToNextLesson: true, debt: true })).toBe(1);
    expect(warmupPriority(item({ recall: 1, dueDay: T - 4 }), T, { agingPerDay: 0.05 })).toBeCloseTo(0.2, 9);
    expect(p({ fresh: true, recall: 0 })).toBe(-1);
  });

  test("fills up to 94% of the budget; leftovers stay due as invisible overflow", () => {
    const due = Array.from({ length: 12 }, (_, i) => item({ domain: `d${i % 4}`, recall: 0.7 + i * 0.01 }));
    const plan = planWarmup(due, ctx(), cfg);
    expect(plan.plannedSec).toBeLessThanOrEqual(300 * 0.94);
    expect(plan.plannedSec).toBeGreaterThan(200);
    expect(plan.overflow.length + sets(plan).length).toBe(12);
    expect(plan.overflowSec).toBe(plan.overflow.reduce((a, it) => a + it.sec, 0));
    // A checkpoint or capstone day plans 3 minutes.
    expect(planWarmup(due, ctx({ budgetSec: 180 }), cfg).plannedSec).toBeLessThanOrEqual(180 * 0.94);
  });

  test("the first item is a sure win: the highest-R due item, or the anchor set when nothing due is likely to succeed", () => {
    const due = [
      item({ recall: 0.7, domain: "a" }),
      item({ recall: 0.93, domain: "b", cardId: "sure" }),
      item({ recall: 0.8, domain: "c" }),
    ];
    expect(planWarmup(due, ctx(), cfg).items[0]?.item.cardId).toBe("sure");
    const weak = [item({ recall: 0.5 }), item({ recall: 0.6, domain: "x" })];
    const anchor = item({ cardId: "fam.anchor", sec: 40, recall: 0.97 });
    const plan = planWarmup(weak, ctx({ anchorFallback: anchor }), cfg);
    expect(plan.items[0]).toMatchObject({ kind: "anchor", rated: false, cardIds: [] });
    expect(planWarmup(weak, ctx(), cfg).items[0]?.item.recall).toBe(0.6);
  });

  test("a mic anchor is one of the day's two mic sets (the server's binge-and-gaps property)", () => {
    const weakMic = Array.from({ length: 4 }, (_, i) =>
      item({ mic: true, recall: 0.5, sec: 30, domain: `m${i}` }),
    );
    const anchor = item({ cardId: "anchor:fam.int.sing", mic: true, sec: 40, recall: 0.97 });
    const plan = planWarmup(weakMic, ctx({ anchorFallback: anchor }), cfg);
    expect(plan.items[0]).toMatchObject({ kind: "anchor" });
    expect(sets(plan).filter((p) => p.item.mic)).toHaveLength(2);
    // With one mic set already used today, the mic anchor is the second and last.
    const second = planWarmup(weakMic, ctx({ anchorFallback: anchor, micSetsUsed: 1 }), cfg);
    expect(sets(second).filter((p) => p.item.mic)).toHaveLength(1);
    // With both used, a mic anchor is not offered at all.
    const none = planWarmup(weakMic, ctx({ anchorFallback: anchor, micSetsUsed: 2 }), cfg);
    expect(none.items.some((p) => p.kind === "anchor")).toBe(false);
  });

  test("repair-queue sets come right after the opener", () => {
    const due = [
      item({ recall: 0.95, domain: "a" }),
      item({ recall: 0.5, domain: "b" }),
      item({ recall: 0.9, domain: "c", repair: true, cardId: "rep" }),
    ];
    const plan = planWarmup(due, ctx(), cfg);
    expect(sets(plan)[1]).toMatchObject({ kind: "repair" });
    expect(sets(plan)[1]?.item.cardId).toBe("rep");
  });

  test("no two consecutive sets from one domain when another domain is available", () => {
    const due = [
      ...Array.from({ length: 3 }, () => item({ domain: "pitch", sec: 40 })),
      ...Array.from({ length: 3 }, () => item({ domain: "rhythm", sec: 40 })),
    ];
    const order = sets(planWarmup(due, ctx(), cfg)).map((p) => p.item.domain);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });

  test("at most 2 mic sets; none in Quiet mode, and paused mic cards are not overflow either", () => {
    const due = Array.from({ length: 5 }, (_, i) => item({ mic: true, sec: 30, domain: `m${i}` }));
    expect(sets(planWarmup(due, ctx(), cfg)).filter((p) => p.item.mic)).toHaveLength(2);
    expect(sets(planWarmup(due, ctx({ micSetsUsed: 1 }), cfg)).filter((p) => p.item.mic)).toHaveLength(1);
    const quiet = planWarmup(due, ctx(), { ...cfg, quiet: true });
    expect(quiet.items).toHaveLength(0);
    expect(quiet.overflow).toHaveLength(0);
  });

  test("a listen-only block after every second perceptual set", () => {
    const due = Array.from({ length: 4 }, (_, i) => item({ sec: 50, domain: `d${i}` }));
    const kinds = planWarmup(due, ctx(), cfg).items.map((p) => p.kind);
    expect(kinds).toEqual(["family-set", "family-set", "listen", "family-set", "family-set", "listen"]);
    const listen = planWarmup(due, ctx(), cfg).items.find((p) => p.kind === "listen");
    expect(listen).toMatchObject({ rated: false, estSec: LISTEN_BLOCK_SEC });
  });

  test("facts are batched into mini-sets of up to 10 cards", () => {
    const due = Array.from({ length: 14 }, () =>
      item({ cls: "fact", perceptual: false, domain: "fact", sec: 8 }),
    );
    const plan = planWarmup(due, ctx(), cfg);
    const factSets = plan.items.filter((p) => p.kind === "fact-set");
    expect(factSets.map((p) => p.cardIds.length)).toEqual([10, 4]);
    expect(factSets[0]?.estSec).toBe(80);
  });

  test("after a gap of 3+ days: R in [0.75, 0.90] first, highest first, then above, then just under", () => {
    const due = [0.6, 0.95, 0.8, 0.88, 0.74].map((recall, i) => item({ recall, domain: `d${i}`, sec: 30 }));
    const order = sets(planWarmup(due, ctx({ gapDays: 5 }), cfg)).map((p) => p.item.recall);
    expect(order[0]).toBe(0.95); // the sure win still opens
    expect(order.slice(1)).toEqual([0.88, 0.8, 0.74, 0.6]);
  });

  test("items held by backlog smoothing wait for their day; fresh cards only fill what is left", () => {
    const later = item({ deferUntilDay: T + 2, cardId: "later" });
    const fresh = Array.from({ length: 40 }, () =>
      item({ cls: "fact", perceptual: false, domain: "fact", sec: 8, fresh: true, recall: 0 }),
    );
    const due = [later, item({ recall: 0.7, domain: "a" }), ...fresh];
    const plan = planWarmup(due, ctx(), cfg);
    expect(plan.overflow.some((it) => it.cardId === "later")).toBe(true);
    expect(sets(plan).some((p) => p.item.recall === 0.7)).toBe(true);
    expect(plan.overflow.filter((it) => it.fresh).length).toBeGreaterThan(0);
  });

  test("a single item longer than the budget is still offered", () => {
    const plan = planWarmup([item({ sec: 500 })], ctx(), cfg);
    expect(plan.items).toHaveLength(1);
  });
});

describe("planReviewDay", () => {
  test("the budget first, then budget-sized 'a little more' blocks up to 12 minutes in total", () => {
    const due = Array.from({ length: 30 }, (_, i) =>
      item({ domain: `d${i % 5}`, sec: 45, recall: 0.6 + (i % 10) * 0.03 }),
    );
    const day = planReviewDay(due, ctx(), cfg);
    expect(day.blocks.length).toBeGreaterThan(1);
    expect(day.plannedSec).toBeLessThanOrEqual(REVIEW_DAY_MAX_SEC);
    expect(day.blocks[0]?.budgetSec).toBe(300);
    expect(day.blocks.slice(1).every((b) => b.items[0]?.kind !== "anchor")).toBe(true);
    expect(day.blocks.reduce((a, b) => a + b.budgetSec, 0)).toBeLessThanOrEqual(REVIEW_DAY_MAX_SEC);
    const small = planReviewDay(due.slice(0, 2), ctx(), cfg);
    expect(small.blocks).toHaveLength(1);
    expect(small.overflow).toHaveLength(0);
  });
});

describe("long sets are not starved", () => {
  test("an item that waited two days is planned first, outside the class shares, even when it is long", () => {
    // A 180 s set (a progression dictation) and plenty of short, fresher work: on its own the long set
    // never fits after the opener and the shares; once it has waited two days it goes in first.
    const long = item({ cardId: "long", sec: 180, recall: 0.7, dueDay: T - 2, domain: "harmony" });
    const short = Array.from({ length: 6 }, (_, i) =>
      item({ cardId: `s${i}`, sec: 50, recall: 0.85, dueDay: T, domain: i % 2 ? "pitch" : "rhythm" }),
    );
    const plan = planWarmup([long, ...short], ctx(), cfg);
    expect(plan.items.some((p) => p.item.cardId === "long")).toBe(true);
    expect(plan.plannedSec).toBeLessThanOrEqual(cfg.budgetSec * cfg.planFraction);
    // A day earlier it is just one more item, ranked by priority (and it does not fit).
    const fresh = planWarmup([{ ...long, dueDay: T - 1 }, ...short], ctx(), cfg);
    expect(fresh.items.some((p) => p.item.cardId === "long")).toBe(false);
    // After a break the return order of contracts §7.9 decides instead.
    const back = planWarmup([long, ...short], ctx({ gapDays: 4 }), cfg);
    expect(back.overflow.length + back.items.length).toBeGreaterThan(0);
  });

  test("a family's first set is planned before anything else, after a break too (decision 27)", () => {
    // A never-reviewed family (recall 0) behind a day's worth of aged, low-recall work.
    const first = item({ cardId: "first", sec: 160, recall: 0, firstSet: true, blockedIntroPending: true });
    const aged = Array.from({ length: 8 }, (_, i) =>
      item({ cardId: `old${i}`, sec: 60, recall: 0.5, dueDay: T - 4, domain: i % 2 ? "pitch" : "rhythm" }),
    );
    for (const gapDays of [0, 4, 12]) {
      const plan = planWarmup([...aged, first], ctx({ gapDays }), cfg);
      expect([gapDays, plan.items.some((p) => p.item.cardId === "first")]).toEqual([gapDays, true]);
      expect(plan.plannedSec).toBeLessThanOrEqual(cfg.budgetSec * cfg.planFraction);
    }
    // Without the mark it is one more item and does not fit.
    const unmarked = planWarmup([...aged, { ...first, firstSet: false }], ctx(), cfg);
    expect(unmarked.items.some((p) => p.item.cardId === "first")).toBe(false);
  });
});
