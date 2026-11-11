// Property tests (adversarial review): scheduling invariants over thousands of random review histories,
// including clock skew (a review stamped before the previous one) and hostile outcome numbers.
import { describe, expect, test } from "bun:test";
import { type Card, type CardKind, createSrs, type Rating, type ReviewOutcome } from "./index.ts";
import { mulberry32 } from "./sim/simulate.ts";

const T0 = new Date("2027-03-01T10:00:00.000Z");
const DAY = 86_400_000;
const KINDS: readonly CardKind[] = ["fact", "concept", "family", "composite"];
const srs = await createSrs();

function invariants(c: Card, at: Date, label: string): void {
  const due = Date.parse(c.dueAt);
  expect([label, Number.isFinite(due)]).toEqual([label, true]);
  // Never due before the review that scheduled it, never a negative interval.
  expect([label, due >= at.getTime()]).toEqual([label, true]);
  expect([label, c.scheduledDays >= 0 && Number.isFinite(c.scheduledDays)]).toEqual([label, true]);
  expect([label, Number.isFinite(c.stability) && c.stability > 0]).toEqual([label, true]);
  expect([label, c.difficulty >= 1 && c.difficulty <= 10]).toEqual([label, true]);
  const r = srs.retrievability(c, new Date(due + DAY));
  expect([label, r >= 0 && r <= 1]).toEqual([label, true]);
  expect(c.lastRatings.length).toBeLessThanOrEqual(2);
}

describe("SRS invariants under random histories", () => {
  test("no negative interval, no due date before its review, finite memory state (2000 histories)", () => {
    for (let h = 0; h < 2000; h++) {
      const rnd = mulberry32(h + 1);
      const kind = KINDS[h % KINDS.length] as CardKind;
      let card = srs.createCard(kind, `prop.${kind}.${h}`, T0);
      let t = T0.getTime();
      const steps = 2 + Math.floor(rnd() * 14);
      for (let i = 0; i < steps; i++) {
        // Early, on time, late, very late, and clock skew backwards (up to a day before the last review).
        const due = Date.parse(card.dueAt);
        const pick = rnd();
        t =
          pick < 0.1
            ? t - Math.floor(rnd() * DAY)
            : pick < 0.3
              ? t + Math.floor(rnd() * Math.max(1, due - t))
              : pick < 0.8
                ? Math.max(t, due) + Math.floor(rnd() * 3 * DAY)
                : Math.max(t, due) + Math.floor(rnd() * 400 * DAY);
        const at = new Date(t);
        const rating = (1 + Math.floor(rnd() * 4)) as Rating;
        card = srs.rate(card, rating, at).card;
        invariants(card, at, `history ${h} step ${i} ${kind} rating ${rating}`);
      }
    }
  });

  test("repeated Again: the due date never moves backwards and the interval never grows", () => {
    for (const kind of KINDS) {
      let card = srs.createCard(kind, `again.${kind}`, T0);
      // Build some stability first.
      let t = T0.getTime();
      for (let i = 0; i < 4; i++) {
        card = srs.rate(card, 3, new Date(t)).card;
        t = Date.parse(card.dueAt);
      }
      let lastDue = Date.parse(card.dueAt);
      let lastInterval = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 12; i++) {
        const at = new Date(Math.max(t, lastDue));
        card = srs.rate(card, 1, at).card;
        const due = Date.parse(card.dueAt);
        const interval = due - at.getTime();
        expect([kind, i, due >= lastDue]).toEqual([kind, i, true]);
        expect([kind, i, interval <= lastInterval + DAY]).toEqual([kind, i, true]);
        invariants(card, at, `again ${kind} ${i}`);
        lastDue = due;
        lastInterval = interval;
        t = at.getTime();
      }
      // After a run of Agains a card is at its floor: a fact keeps minutes, a set comes back tomorrow at most.
      expect(card.scheduledDays).toBeLessThanOrEqual(1);
    }
  });

  test("the same history gives the same card, byte for byte (no hidden clock or randomness)", () => {
    const run = () => {
      let c = srs.createCard("family", "det.fam", T0);
      let t = T0.getTime();
      for (const r of [3, 3, 1, 2, 4, 3, 1, 3] as Rating[]) {
        c = srs.rate(c, r, new Date(t)).card;
        t = Date.parse(c.dueAt) + 3_600_000;
      }
      return c;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  test("hostile outcome numbers never produce an invalid card", () => {
    const base: ReviewOutcome = {
      meanCredit: 0.9,
      medianRtMs: 2000,
      fastRtMs: 2500,
      extraReplays: 0,
      hintRung: 0,
      revealed: false,
      atOrAboveLevel: true,
    };
    const hostile: Partial<ReviewOutcome>[] = [
      { meanCredit: Number.NaN },
      { meanCredit: -5 },
      { meanCredit: 7 },
      { meanCredit: Number.POSITIVE_INFINITY },
      { medianRtMs: Number.NaN },
      { medianRtMs: -1 },
      { fastRtMs: 0 },
      { extraReplays: -3 },
      { meanAbsCents: Number.NaN, tolCents: 0 },
    ];
    for (const kind of KINDS) {
      for (const h of hostile) {
        const r = srs.review(srs.createCard(kind, `hostile.${kind}`, T0), { ...base, ...h }, T0);
        expect([kind, h, [1, 2, 3, 4].includes(r.rating)]).toEqual([kind, h, true]);
        invariants(r.card, T0, `hostile ${kind} ${JSON.stringify(h)}`);
      }
    }
  });
});

describe("simulation determinism across seeds", () => {
  test("every seed replays identically; different seeds differ; Math.random and the clock are not read", async () => {
    const { DECISION_2, recommendedGovernor } = await import("./index.ts");
    const { DEFAULT_LEARNER, simulate } = await import("./sim/simulate.ts");
    const { COURSE_CATALOG } = await import("./sim/course-catalog.test-util.ts");
    const live = await createSrs({ factRetention: DECISION_2.factRetention });
    const opts = (seed: string, target: 15 | 20 | 25) => ({
      seed,
      days: 60,
      targetMinutes: target,
      calendar: "weekdays" as const,
      gaps: [[20, 26]] as [number, number][],
      governor: recommendedGovernor(target),
      learner: DEFAULT_LEARNER,
      termsPerLesson: 3,
      durationJitter: 0.12,
      catalog: COURSE_CATALOG,
    });
    const realRandom = Math.random;
    const realNow = Date.now;
    const summaries: string[] = [];
    try {
      // Poison the ambient sources of nondeterminism: a run that read them would not replay.
      let poison = 0;
      Math.random = () => (poison = (poison + 0.37) % 1);
      Date.now = () => realNow() + Math.floor(realRandom() * 1e9);
      for (const seed of ["s1", "s2", "s3", "s4"]) {
        for (const target of [15, 25] as const) {
          const a = JSON.stringify(simulate(live, opts(seed, target)).summary);
          const b = JSON.stringify(simulate(live, opts(seed, target)).summary);
          expect([seed, target, a === b]).toEqual([seed, target, true]);
          summaries.push(a);
        }
      }
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});

describe("regression: the clock stepping backwards", () => {
  test("a review stamped before the last one is taken at the last review's instant, not refused", () => {
    const c = srs.rate(srs.createCard("family", "skew.fam", T0), 3, T0).card;
    const back = new Date(T0.getTime() - 3 * DAY);
    const r = srs.rate(c, 3, back);
    expect(r.revlog.reviewedAt).toBe(T0.toISOString());
    expect(r.revlog.elapsedDays).toBe(0);
    expect(Date.parse(r.card.dueAt)).toBeGreaterThan(T0.getTime());
    expect(() => srs.preview(c, back)).not.toThrow();
  });
});
