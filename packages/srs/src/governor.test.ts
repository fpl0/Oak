import { describe, expect, test } from "bun:test";
import {
  admitCreated,
  admitNew,
  atMasteryForGraduation,
  capLessonFacts,
  capRelearning,
  earlyGraduate,
  forecastLoad,
  type GovernorConfig,
  governorFor,
  intakeForecast,
  intervalCap,
  likelyPracticeDays,
  makeDayPicker,
  micRoom,
  otherWorkCredit,
  RECOMMENDED_GOVERNOR,
  type ReviewItem,
  recommendedGovernor,
  returnMode,
  returnRank,
  shouldGraduate,
  smoothBacklog,
} from "./index.ts";

const T = 20_000;
let n = 0;
export const item = (o: Partial<ReviewItem> = {}): ReviewItem => ({
  cardId: o.cardId ?? `c${n++}`,
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

describe("configuration", () => {
  test("the contract's numbers, and decision 2 on top of them", () => {
    expect([15, 20, 25].map((t) => governorFor(t as 15).budgetSec)).toEqual([240, 300, 360]);
    const c = governorFor(20);
    expect(c).toMatchObject({
      maxActivePerceptual: 12,
      graduateDays: 21,
      activeMaxIntervalDays: null,
      maxFactCardsPerLesson: null,
    });
    expect(c.releasePerDay).toEqual({ families: 1, facts: 4 });
    expect(c.newPerDay).toEqual({ families: 2, facts: 6 });
    const r = recommendedGovernor(15, { quiet: true });
    expect(r).toMatchObject({
      budgetSec: 240,
      activeMaxIntervalDays: 7,
      maxFactCardsPerLesson: 2,
      quiet: true,
    });
    expect(RECOMMENDED_GOVERNOR.budgetSec).toBe(300);
  });
});

describe("forecast and intake throttle", () => {
  const cfg = recommendedGovernor(20);
  test("forecastLoad puts everything overdue on today and respects deferral", () => {
    const load = forecastLoad(
      [
        item({ dueDay: T - 5 }),
        item({ dueDay: T + 2, sec: 30 }),
        item({ dueDay: T, deferUntilDay: T + 3 }),
        item({ dueDay: T + 9 }),
      ],
      T,
      7,
    );
    expect(load).toEqual([60, 0, 30, 60, 0, 0, 0, 0]);
  });

  test("states by the mean per session: open below 0.70, closed above 0.85, hold between", () => {
    // 8 days at 5 sessions a week = 5.71 sessions. Budget 300.
    const mean = (sec: number) =>
      intakeForecast([item({ sec, cls: "concept", perceptual: false })], T, cfg).meanSec;
    expect(mean(571.4)).toBeCloseTo(100, 0);
    const state = (sec: number) =>
      intakeForecast([item({ sec, cls: "concept", perceptual: false })], T, cfg).state;
    // All of it on one day: that day is over 1.25 × budget, which closes intake whatever the mean.
    expect(state(0.6 * 300 * (40 / 7))).toBe("closed");
    expect(state(1.2 * 300)).toBe("open");
    const spread = (perSession: number) =>
      intakeForecast(
        Array.from({ length: 8 }, (_, d) =>
          item({ dueDay: T + d, sec: (perSession * 40) / 7 / 8, cls: "concept", perceptual: false }),
        ),
        T,
        cfg,
      ).state;
    expect(spread(0.6 * 300)).toBe("open");
    expect(spread(0.8 * 300)).toBe("hold");
    expect(spread(0.9 * 300)).toBe("closed");
  });

  test("per class: sets against the set share, facts against the fact share", () => {
    const facts = Array.from({ length: 8 }, (_, d) =>
      item({ dueDay: T + d, cls: "fact", perceptual: false, sec: 0.5 * 120 * (5 / 7) }),
    );
    expect(intakeForecast(facts, T, cfg, 0, "facts").state).toBe("open");
    expect(intakeForecast(facts, T, cfg, 0, "sets").meanSec).toBe(0);
    const heavy = facts.map((f) => ({ ...f, sec: f.sec * 1.5 }));
    expect(intakeForecast(heavy, T, cfg, 0, "facts").state).toBe("hold");
    expect(intakeForecast(heavy, T, cfg, 0, "all").state).toBe("open");
  });

  test("a capped family counts every return inside the window; quiet mode leaves mic sets out", () => {
    const once = intakeForecast([item({ dueDay: T })], T, cfg, 0, "sets").meanSec;
    const twice = intakeForecast([item({ dueDay: T, repeatDays: 7 })], T, cfg, 0, "sets").meanSec;
    expect(twice).toBeCloseTo(2 * once, 6);
    expect(intakeForecast([item({ mic: true })], T, { ...cfg, quiet: true }).meanSec).toBe(0);
  });

  test("admitNew releases 1 family and 4 facts a day while open, within the active cap and mic room", () => {
    expect(admitNew([], { families: 3, facts: 9 }, 5, T, cfg)).toEqual({ families: 1, facts: 4 });
    expect(admitNew([], { families: 3, facts: 9 }, 12, T, cfg)).toEqual({ families: 0, facts: 4 });
    const full = Array.from({ length: 30 }, () => item({ cls: "concept", perceptual: false, sec: 90 }));
    expect(admitNew(full, { families: 3, facts: 9 }, 0, T, cfg)).toEqual({ families: 0, facts: 4 });
    const mics = Array.from({ length: 12 }, () => item({ mic: true }));
    expect(micRoom(mics, T, cfg)).toBe(false);
    expect(admitNew(mics, { families: 1, facts: 0, nextFamilyMic: true }, 0, T, cfg).families).toBe(0);
    expect(micRoom([], T, { ...cfg, quiet: true })).toBe(false);
  });

  test("admitCreated: daily caps, the active cap, closed classes and one production family a day", () => {
    const base = {
      items: [],
      today: T,
      concept: 0,
      facts: 0,
      activePerceptual: 0,
      newToday: { families: 0, facts: 0 },
      cfg,
    };
    expect(admitCreated({ ...base, perceptual: 3, concept: 1, facts: 9 })).toMatchObject({
      perceptual: 2,
      concept: 0,
      facts: 6,
      production: 0,
    });
    expect(admitCreated({ ...base, perceptual: 3, activePerceptual: 11 }).perceptual).toBe(1);
    expect(admitCreated({ ...base, perceptual: 0, production: 2 }).production).toBe(1);
    expect(
      admitCreated({ ...base, perceptual: 1, newToday: { families: 2, facts: 6 }, facts: 2 }),
    ).toMatchObject({ perceptual: 0, facts: 0 });
    const heavySets = Array.from({ length: 30 }, () => item({ sec: 90 }));
    const r = admitCreated({ ...base, items: heavySets, perceptual: 1, concept: 1, facts: 2 });
    expect(r).toMatchObject({ perceptual: 0, concept: 0, facts: 2, closed: false });
  });

  test("decision 2: at most 2 fact cards per lesson; the contract alone keeps every tested term", () => {
    expect(capLessonFacts(["a", "b", "c"], cfg)).toEqual({ cards: ["a", "b"], glossaryOnly: ["c"] });
    expect(capLessonFacts(["a", "b", "c"], governorFor(20)).cards).toHaveLength(3);
  });
});

describe("graduation and the active cap", () => {
  const cfg = recommendedGovernor(20);
  const g = {
    level: 4,
    masteryLevel: 4,
    maxOpenLevel: 7,
    t90Days: 25,
    lastRatings: [3, 4] as (1 | 2 | 3 | 4)[],
  };
  test("level at mastery, t90 ≥ 21 days, last two Good or Easy", () => {
    expect(shouldGraduate(g, cfg)).toBe(true);
    expect(shouldGraduate({ ...g, level: 3 }, cfg)).toBe(false);
    expect(shouldGraduate({ ...g, t90Days: 20.9 }, cfg)).toBe(false);
    expect(shouldGraduate({ ...g, lastRatings: [2, 3] }, cfg)).toBe(false);
    expect(shouldGraduate({ ...g, lastRatings: [3] }, cfg)).toBe(false);
  });
  test("a gated ladder counts as at mastery while it sits at its highest open level", () => {
    expect(atMasteryForGraduation({ level: 2, masteryLevel: 4, maxOpenLevel: 2 })).toBe(true);
    expect(atMasteryForGraduation({ level: 1, masteryLevel: 4, maxOpenLevel: 2 })).toBe(false);
    expect(shouldGraduate({ ...g, level: 2, maxOpenLevel: 2 }, cfg)).toBe(true);
  });
  test("earlyGraduate picks the highest t90 at mastery, only when the cap is hit", () => {
    const active = Array.from({ length: 12 }, (_, i) => ({
      ...g,
      cardId: `f${i}`,
      level: i < 3 ? 4 : 1,
      t90Days: 10 + i,
    }));
    expect(earlyGraduate(active, cfg)).toBe("f2");
    expect(earlyGraduate(active.slice(0, 11), cfg)).toBeNull();
    expect(
      earlyGraduate(
        active.map((a) => ({ ...a, level: 1 })),
        cfg,
      ),
    ).toBeNull();
  });
  test("intervalCap: an active perceptual family runs on the 7-day cadence under decision 2 only", () => {
    expect(intervalCap({ kind: "family", status: "active" }, true, cfg)).toBe(7);
    expect(intervalCap({ kind: "family", status: "active" }, true, governorFor(20))).toBeUndefined();
    expect(intervalCap({ kind: "concept", status: "active" }, false, cfg)).toBeUndefined();
    expect(intervalCap({ kind: "composite", status: "active" }, true, cfg)).toBeUndefined();
    expect(intervalCap({ kind: "family", status: "graduated" }, true, cfg)).toBeUndefined();
  });
});

describe("return policy (contracts §7.9)", () => {
  const cfg: GovernorConfig = recommendedGovernor(20);
  test("modes by gap", () => {
    expect([0, 2, 3, 9, 10, 20, 21, 60].map(returnMode)).toEqual([
      "normal",
      "normal",
      "warmup",
      "warmup",
      "light",
      "light",
      "light+loosen",
      "light+loosen",
    ]);
  });
  test("the return order: 0.75–0.90 highest first, then above it, then just under it", () => {
    const rs = [0.95, 0.6, 0.76, 0.89, 0.92, 0.74];
    expect([...rs].sort((a, b) => returnRank(b) - returnRank(a))).toEqual([
      0.89, 0.76, 0.92, 0.95, 0.74, 0.6,
    ]);
  });
  test("smoothBacklog spreads over clamp(ceil(total / budget), 5, 7) days, band first", () => {
    const overdue = Array.from({ length: 40 }, (_, i) =>
      item({ cardId: `o${i}`, recall: 0.5 + (i % 10) * 0.05, sec: 60 }),
    );
    const m = smoothBacklog(overdue, T, cfg); // 2400 s / 300 = 8 → 7 days
    const days = [...m.values()];
    expect(Math.min(...days)).toBe(T);
    expect(Math.max(...days)).toBe(T + 6);
    const perDay = new Map<number, number>();
    for (const d of days) perDay.set(d, (perDay.get(d) ?? 0) + 60);
    for (const s of perDay.values()) expect(s).toBeLessThanOrEqual(2400 / 7 + 60);
    const inBand = overdue
      .filter((it) => it.recall >= 0.75 && it.recall <= 0.9)
      .map((it) => m.get(it.cardId) as number);
    const below = overdue.filter((it) => it.recall < 0.75).map((it) => m.get(it.cardId) as number);
    expect(Math.max(...inBand)).toBeLessThanOrEqual(Math.min(...below));
    expect(smoothBacklog(overdue.slice(0, 2), T, cfg).size).toBe(2);
    expect(Math.max(...smoothBacklog(overdue.slice(0, 2), T, cfg).values())).toBeLessThanOrEqual(T + 4);
    expect(smoothBacklog([item({ mic: true })], T, { ...cfg, quiet: true }).size).toBe(0);
  });
  test("the Again cascade: after the third Again in a backlog, items with R < 0.60 wait", () => {
    const rest = [item({ recall: 0.5 }), item({ recall: 0.7 }), item({ recall: 0.1, fresh: true })];
    expect(capRelearning(rest, 2, true).held).toHaveLength(0);
    expect(capRelearning(rest, 3, false).held).toHaveLength(0);
    const r = capRelearning(rest, 3, true);
    expect(r.held.map((x) => x.recall)).toEqual([0.5]);
    expect(r.keep).toHaveLength(2);
  });
});

describe("evidence from other work and day picking", () => {
  test("review-if-due within 2 days; free practice only when already due; only active cards", () => {
    const c = (
      source: Parameters<typeof otherWorkCredit>[0]["source"],
      dueIn: number,
      status: "active" | "deferred" = "active",
    ) => otherWorkCredit({ source, status, dueDay: T + dueIn, today: T });
    expect(c("lesson", 2)).toBe("review");
    expect(c("gym", -4)).toBe("review");
    expect(c("transcription", 3)).toBe("evidence-only");
    expect(c("practice", 0)).toBe("review");
    expect(c("practice", 1)).toBe("evidence-only");
    expect(c("lesson", 0, "deferred")).toBe("evidence-only");
  });
  test("the day picker takes the least-loaded day in the window and counts days off on the next practice day", () => {
    const load = new Map([
      [T + 5, 300],
      [T + 6, 50],
      [T + 7, 200],
    ]);
    expect(makeDayPicker(load, T)(6, 5, 7)).toBe(6);
    const weekdays = (d: number) => ((d % 7) + 7) % 7 !== 2; // one weekday off
    const pick = makeDayPicker(new Map([[T + 6, 0]]), T, weekdays)(5, 4, 6);
    expect(weekdays(T + pick)).toBe(true);
  });
  test("likely practice days are learned from 2+ weeks of history", () => {
    expect(likelyPracticeDays([], T)).toBeUndefined();
    expect(likelyPracticeDays([T - 3, T - 1], T)).toBeUndefined();
    const hist: number[] = [];
    for (let d = T - 28; d < T; d++) if (d % 7 !== 0) hist.push(d);
    const likely = likelyPracticeDays(hist, T);
    expect(likely).toBeDefined();
    expect(likely?.(T + (7 - (T % 7)))).toBe(false);
    expect(likely?.(T + (8 - (T % 7)))).toBe(true);
  });
});
