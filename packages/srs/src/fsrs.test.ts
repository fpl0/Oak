// The ts-fsrs 6.0.0 facts the wrapper depends on, then the wrapper's own contract.
import { describe, expect, test } from "bun:test";
import * as fsrs from "ts-fsrs";
import { DefaultScheduler, Rating, State } from "ts-fsrs";
import {
  type Card,
  createSrs,
  DECISION_2,
  FSRS_MODEL_NAME,
  type Rating as OakRating,
  type ReviewOutcome,
  SCHEDULES,
} from "./index.ts";

const T0 = new Date("2027-01-04T09:00:00.000Z"); // a Monday
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const outcome = (meanCredit: number, o: Partial<ReviewOutcome> = {}): ReviewOutcome => ({
  meanCredit,
  medianRtMs: 3000,
  fastRtMs: 2500,
  extraReplays: 0,
  hintRung: 0,
  revealed: false,
  atOrAboveLevel: true,
  ...o,
});
const good = outcome(0.875);

describe("ts-fsrs 6.0.0 on Bun: the gotchas spike S7 recorded", () => {
  test("the scheduler is async, FSRS-7 is stored as fsrs-7, Rating is not an enum", async () => {
    expect(fsrs.FSRSVersion).toBe("v6.0.0");
    const p = DefaultScheduler();
    expect(p).toBeInstanceOf(Promise);
    const s = await p;
    expect(s.definition.model.name).toBe(FSRS_MODEL_NAME);
    expect(Rating).toEqual({ Manual: 0, Again: 1, Hard: 2, Good: 3, Easy: 4 });
    expect(State).toEqual({ New: 0, Learning: 1, Review: 2, Relearning: 3 });
    expect((Rating as Record<string, unknown>)["3"]).toBeUndefined();
  });

  test("sub-day intervals, the fuzz range under a cap, and the recall of a new card", async () => {
    const fam = await DefaultScheduler({
      version: "FSRS-7",
      desiredRetention: 0.85,
      enableShortTerm: false,
      learningSteps: [],
      relearningSteps: [],
      maximumInterval: 180,
    });
    const card = fam.newCard({ now: T0, cardId: "g" });
    const again = fam.review({ card, grade: Rating.Again, now: T0 }).card;
    expect(again.scheduledDays * 86_400).toBeLessThan(15); // due again about 10 seconds later
    expect(fsrs.getFuzzRange(13182, 180, 180)).toEqual({ minInterval: 2, maxInterval: 180 });
    expect(fam.model.forgettingCurve(card, 1)).toBeCloseTo(0.0804, 3); // garbage for a new card
  });
});

describe("createSrs", () => {
  test("four kinds at the contract's retentions; decision 2 moves facts to 0.85", async () => {
    const plan = await createSrs();
    expect(plan.modelName).toBe("fsrs-7");
    expect(plan.desiredRetention("fact")).toBe(0.9);
    expect(plan.desiredRetention("concept")).toBe(0.9);
    expect(plan.desiredRetention("family")).toBe(0.85);
    expect(plan.desiredRetention("composite")).toBe(0.8);
    const live = await createSrs({ factRetention: DECISION_2.factRetention });
    expect(live.desiredRetention("fact")).toBe(0.85);
    await expect(createSrs({ factRetention: 1.2 })).rejects.toThrow("out of range");
    // A lower target means longer intervals.
    const first = (srs: typeof plan) => srs.rate(srs.createCard("fact", "fact.a", T0), 3, T0).revlog.modelIntervalDays;
    expect(first(live)).toBeGreaterThan(first(plan));
  });

  test("a new card: due now, recall 0 (never the library's 0.08), interval 0", async () => {
    const srs = await createSrs();
    for (const kind of ["fact", "concept", "family", "composite"] as const) {
      const c = srs.createCard(kind, `card.${kind}`, T0);
      expect(c).toMatchObject({ id: `card.${kind}`, kind, status: "active", model: "fsrs-7", reps: 0, state: 0 });
      expect(c.lastReviewAt).toBeNull();
      expect(c.lastRatings).toEqual([]);
      expect(srs.isDue(c, T0)).toBe(true);
      expect(srs.retrievability(c, T0)).toBe(0);
      expect(srs.retrievability(c, plus(T0, 30))).toBe(0);
      expect(srs.intervalAt(c, 0.9)).toBe(0);
    }
    expect(srs.createCard("family", "fam.a.b", T0, "deferred").status).toBe("deferred");
    expect(() => srs.createCard("fact", "", T0)).toThrow("stable ID");
  });

  test("a card is due at its own desired retention (within the fuzz window)", async () => {
    const srs = await createSrs({ fuzz: 0 });
    for (const kind of ["fact", "concept", "family", "composite"] as const) {
      const c = srs.rate(srs.createCard(kind, `r.${kind}`, T0), 3, T0).card;
      const r = srs.retrievability(c, new Date(c.dueAt));
      expect(Math.abs(r - srs.desiredRetention(kind))).toBeLessThan(0.03);
      expect(srs.retrievability(c, T0)).toBeCloseTo(1, 3);
      // intervalAt inverts the forgetting curve.
      const t = srs.intervalAt(c, 0.9);
      expect(srs.retrievability(c, plus(T0, t))).toBeCloseTo(0.9, 3);
      expect(srs.intervalAt(c, 0.8)).toBeGreaterThan(t);
    }
  });

  test("Oak's floors: a failed family set is never repeated the same day; a fact keeps its 5-minute step", async () => {
    const srs = await createSrs();
    const again = outcome(0.5);
    for (const kind of ["concept", "family", "composite"] as const) {
      const r = srs.review(srs.createCard(kind, `f.${kind}`, T0), again, T0);
      expect(r.rating).toBe(1);
      expect(r.revlog.modelIntervalDays * 86_400).toBeLessThan(15);
      expect(r.card.scheduledDays).toBe(1);
      expect(r.card.dueAt).toBe("2027-01-05T04:00:00.000Z");
    }
    const fact = srs.review(srs.createCard("fact", "fact.x", T0), outcome(0), T0).card;
    expect(new Date(fact.dueAt).getTime() - T0.getTime()).toBe(5 * 60_000);
    expect(SCHEDULES.fact.learningSteps).toEqual(["5m"]);
    // Hard on a new fact is about 14 hours in the model: Oak makes it tomorrow, not "tonight".
    const hard = srs.rate(srs.createCard("fact", "fact.y", T0), 2, T0);
    expect(hard.revlog.modelIntervalDays).toBeLessThan(1);
    expect(hard.card.scheduledDays).toBe(1);
  });

  test("Oak's caps and the per-review cap of the governor", async () => {
    const srs = await createSrs();
    const run = (kind: Card["kind"], n: number, opts = {}) => {
      let c = srs.createCard(kind, `cap.${kind}`, T0);
      let t = T0;
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        c = srs.rate(c, 4, t, opts).card;
        out.push(c.scheduledDays);
        t = plus(new Date(c.dueAt), 0.2);
      }
      return out;
    };
    expect(Math.max(...run("family", 6))).toBeLessThanOrEqual(180);
    expect(Math.max(...run("concept", 6))).toBeLessThanOrEqual(180);
    expect(Math.max(...run("fact", 6))).toBeLessThanOrEqual(365);
    expect(Math.max(...run("composite", 6))).toBeLessThanOrEqual(365);
    expect(Math.max(...run("family", 6))).toBeGreaterThan(150); // the cap binds, and stays near it (no library fuzz)
    const capped = run("family", 8, { maxIntervalDays: 7 });
    expect(Math.max(...capped)).toBeLessThanOrEqual(7);
    expect(Math.min(...capped)).toBeGreaterThanOrEqual(6);
  });

  test("due days snap to the learner's 04:00 rollover in their time zone", async () => {
    const srs = await createSrs({ timeZone: "America/New_York" });
    // 2027-01-04T07:00Z is 02:00 in New York: still the learner's Sunday.
    const lateNight = new Date("2027-01-04T07:00:00.000Z");
    expect(srs.dayOf(lateNight)).toBe(srs.dayOf(new Date("2027-01-03T20:00:00.000Z")));
    const c = srs.review(srs.createCard("family", "fam.ny.x", lateNight), outcome(0.5), lateNight).card;
    expect(c.scheduledDays).toBe(1);
    expect(c.dueAt).toBe("2027-01-04T09:00:00.000Z"); // Monday 04:00 EST
    expect(srs.isDue(c, new Date("2027-01-04T08:59:00.000Z"))).toBe(false);
    expect(srs.isDue(c, new Date("2027-01-04T09:00:00.000Z"))).toBe(true);
  });

  test("the due day is deterministic for a card and can be chosen by the caller", async () => {
    const srs = await createSrs();
    const run = (id: string, opts = {}) => {
      let c = srs.createCard("concept", id, T0);
      let t = T0;
      const out: number[] = [];
      for (let i = 0; i < 4; i++) {
        c = srs.review(c, good, t, opts).card;
        out.push(c.scheduledDays);
        t = new Date(c.dueAt);
      }
      return out;
    };
    expect(run("fam.a.one")).toEqual(run("fam.a.one"));
    const seen: [number, number, number][] = [];
    const lowest = run("fam.a.one", {
      pickDay: (ideal: number, lo: number, hi: number) => {
        seen.push([ideal, lo, hi]);
        return lo;
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const [ideal, lo, hi] of seen) {
      expect(lo).toBeLessThanOrEqual(ideal);
      expect(hi).toBeGreaterThanOrEqual(ideal - 1);
      expect(hi - lo).toBeLessThanOrEqual(Math.max(2, Math.ceil(ideal * 0.1) + 1));
    }
    expect(lowest[1]).toBeLessThanOrEqual(run("fam.a.one")[1] as number);
    // A pick outside the window is clamped.
    const wild = srs.review(srs.review(srs.createCard("concept", "fam.a.two", T0), good, T0).card, good, plus(T0, 5), {
      pickDay: () => 10_000,
    });
    expect(wild.card.scheduledDays).toBeLessThanOrEqual(180);
  });

  test("review and rate: the revlog can replay or roll back, the last two ratings are kept", async () => {
    const srs = await createSrs();
    const c0 = srs.createCard("family", "fam.r.log", T0);
    const r1 = srs.review(c0, good, T0);
    expect(c0.reps).toBe(0); // the input is untouched
    expect(r1.rating).toBe(3);
    expect(r1.card.reps).toBe(1);
    expect(r1.revlog).toMatchObject({
      cardId: "fam.r.log",
      kind: "family",
      model: "fsrs-7",
      rating: 3,
      reviewedAt: T0.toISOString(),
      elapsedDays: 0,
      recallBefore: 0,
    });
    expect(r1.revlog.outcome).toEqual(good);
    expect(r1.revlog.prev).toMatchObject({ reps: 0, stability: 0, lastReviewAt: null });
    const t2 = plus(T0, 20);
    const r2 = srs.review(r1.card, outcome(0.5), t2);
    expect(r2.card.lapses).toBe(1);
    expect(r2.card.stability).toBeLessThan(r1.card.stability);
    expect(r2.revlog.prev.stability).toBe(r1.card.stability);
    expect(r2.revlog.elapsedDays).toBeCloseTo(20, 5);
    expect(r2.revlog.recallBefore).toBeGreaterThan(0.5);
    expect(r2.revlog.recallBefore).toBeLessThan(0.9);
    const ratings: OakRating[] = [];
    let c = r2.card;
    for (const rating of [3, 4, 2] as const) {
      c = srs.rate(c, rating, plus(new Date(c.dueAt), 0.1)).card;
      ratings.push(rating);
    }
    expect(c.lastRatings).toEqual([4, 2]);
    expect(srs.rate(c, 4, plus(new Date(c.dueAt), 0.1)).revlog.outcome.meanCredit).toBe(1);
  });

  test("a persisted card round-trips through JSON and reviews identically", async () => {
    const srs = await createSrs({ timeZone: "Europe/Lisbon" });
    let live = srs.createCard("family", "fam.j.son", T0);
    let stored: Card = JSON.parse(JSON.stringify(live));
    let t = T0;
    for (const credit of [0.875, 0.75, 1, 0.5, 0.875, 1]) {
      const a = srs.review(live, outcome(credit, { medianRtMs: 1000 }), t);
      const b = srs.review(stored, outcome(credit, { medianRtMs: 1000 }), t);
      expect(b).toEqual(a);
      expect(JSON.parse(JSON.stringify(b))).toEqual(b);
      live = a.card;
      stored = JSON.parse(JSON.stringify(b.card));
      t = plus(new Date(live.dueAt), 0.3);
    }
    expect(() => srs.review({ ...stored, model: "fsrs-6" }, good, t)).toThrow("Migrate by replaying");
  });

  test("preview shows the four outcomes without committing", async () => {
    const srs = await createSrs();
    const c = srs.createCard("family", "fam.p.view", T0);
    const p = srs.preview(c, T0);
    expect(Object.keys(p)).toEqual(["1", "2", "3", "4"]);
    expect(p[1].scheduledDays).toBe(1);
    expect(p[3].scheduledDays).toBeGreaterThan(p[2].scheduledDays);
    expect(p[4].scheduledDays).toBeGreaterThan(p[3].scheduledDays);
    expect(p[3].scheduledDays).toBe(srs.rate(c, 3, T0).card.scheduledDays);
    expect(c.reps).toBe(0);
  });

  test("the 21-day stability of graduation is intervalAt(card, 0.9), reached after two Good sets on a 7-day cadence", async () => {
    const srs = await createSrs();
    let c = srs.createCard("family", "fam.g.rad", T0);
    let t = T0;
    const t90: number[] = [];
    for (let i = 0; i < 3; i++) {
      c = srs.rate(c, 3, t, { maxIntervalDays: 7 }).card;
      t90.push(srs.intervalAt(c, 0.9));
      t = plus(new Date(c.dueAt), 0.2);
    }
    expect(t90[0]).toBeLessThan(21);
    expect(t90[1]).toBeGreaterThanOrEqual(21);
    expect(c.stability).not.toBeCloseTo(t90[2] as number, 0); // FSRS-7 stability is not the 90% interval
  });
});
