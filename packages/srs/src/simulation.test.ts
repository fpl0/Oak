// The CI gate of contracts §7.4: a 300-day simulation with the course's real family and deck catalog
// (content/families.ts, converted by sim/course-catalog.test-util.ts) introduced in the default course
// order, 5 sessions a week (with a 4-, a 10- and a 4-day break), a simulated learner at about 85% mean
// credit with about 10% of sets below 0.65, for each target, on five seeds.
//
// What runs is the production code (`createSrs`, `planWarmup`, the governor, composites, `stepLevel`)
// under the live configuration: decisions 2 and 27 of docs/decisions.md (`recommendedGovernor`, facts at
// 0.85).
//
// The fifth criterion of Wave 2, "deferred queue p95 ≤ 4 cards", cannot hold together with the other four
// (U03–U06 unlock about 20 families in about 40 sessions). Decision 27 replaces it with a bound on how long
// a new perceptual or production family waits for its first review set: `SIM_GATE.firstReviewWaitDays`
// (7) days from the lesson that seeded it, the learner's own breaks not counted, a family still unreviewed
// at the end counting its wait so far. The count is still printed.
//
// Under the rules as written the wait was months (Wave 3 measurement: per-run max 36–218 days, up to 12
// families never reviewed in 300 days), because a family below its mastery level holds its slot and its
// weekly set until it graduates, and graduation needs the mastery level. Decision 27 is what holds the
// bound (`DECISION_27`, live in `recommendedGovernor`):
//   - a family still waiting 2 days after its lesson is released whatever the forecast says
//     (`planOverdueReleases`), and room is made for it when there is no free slot, the set forecast is not
//     open, or a sung family has no mic room: a family at its mastery level graduates early, otherwise the
//     most stable family with 3 sets of its own rests in its composite;
//   - a resting family is a composite member (2 trials whenever it is drawn, recalled below 0.65) and comes
//     back to its own card, where it left off, once nothing waits (`pickRestReturn`);
//   - a family's first set is planned before anything else, after a break too, and is never held by the
//     Again-cascade cap.
// Measured over the 15 gate runs and 15 held-out runs: the first-review wait is at most 6 days on every run
// and target, no family goes unreviewed, and the other four criteria hold.
import { describe, expect, test } from "bun:test";
import { defaultOrder } from "../../../content/syllabus.ts";
import {
  createSrs,
  DECISION_2,
  governorFor,
  REVIEW_DAY_MAX_SEC,
  recommendedGovernor,
  SIM_GATE,
  WARMUP_BUDGET_SEC,
} from "./index.ts";
import { COURSE_CATALOG, COURSE_ORDER } from "./sim/course-catalog.test-util.ts";
import { DEFAULT_LEARNER, type SimOptions, type SimSummary, simulate } from "./sim/simulate.ts";

const TARGETS = [15, 20, 25] as const;
const SEEDS = ["a1", "b2", "c3", "d4", "e5"];
/** Seeds the gate was not tuned on: the four criteria and the wait are reported on them as well. */
const HELD_OUT = ["f6", "g7", "h8", "i9", "j0"];
/** The amended criterion (decision 27): every family's first review within this many days. */
const WAIT_BOUND_DAYS = SIM_GATE.firstReviewWaitDays;
const GAPS: [number, number][] = [
  [61, 64],
  [145, 154],
  [229, 232],
];
const srs = await createSrs({ factRetention: DECISION_2.factRetention });
const options = (seed: string, target: 15 | 20 | 25, over: Partial<SimOptions> = {}): SimOptions => ({
  seed,
  days: 300,
  targetMinutes: target,
  calendar: "weekdays",
  gaps: GAPS,
  governor: recommendedGovernor(target),
  learner: DEFAULT_LEARNER,
  termsPerLesson: 3,
  durationJitter: 0.12,
  catalog: COURSE_CATALOG,
  ...over,
});
const runs = new Map<15 | 20 | 25, SimSummary[]>(
  TARGETS.map((t) => [t, SEEDS.map((seed) => simulate(srs, options(seed, t)).summary)]),
);
const all = () =>
  [...runs.entries()].flatMap(([t, ss]) => ss.map((s, i) => ({ t, seed: SEEDS[i] as string, s })));
const heldOut = TARGETS.flatMap((t) =>
  HELD_OUT.map((seed) => ({ t, seed, s: simulate(srs, options(seed, t)).summary })),
);
const everyRun = () => [...all(), ...heldOut];

const r1 = (x: number) => Math.round(x * 10) / 10;
const waitCell = (w: SimSummary["firstReviewWait"]["deferred"]) =>
  `${w.n} | ${w.p50}/${w.p95}/${w.max} | ${w.censored}`;
console.log(
  [
    "target seed | warm-up p50/p95/max s | oldest undelivered p95 d | deferred p95 (families, of them P/Pr) | review day p95 s | active max | at mastery | wait p95 d | credit / <0.65 | sessions to clear after gaps",
    ...all().map(
      ({ t, seed, s }) =>
        `${t} ${seed} | ${r1(s.warmupSec.p50)}/${r1(s.warmupSec.p95)}/${r1(s.warmupSec.max)} | ${s.oldestUndeliveredDays.p95} | ${s.deferredCards.p95} (${s.deferredFamiliesP95.all}, ${s.deferredFamiliesP95.perceptual}) | ${r1(s.reviewDaySec.p95)} | ${s.maxActivePerceptual} | ${s.families.atMastery}/${s.families.unlocked} | ${s.families.waitDaysP95} | ${r1(s.setCredit.mean * 100)}% / ${r1(s.setCredit.below065 * 100)}% | ${s.sessionsToClearAfterGap.join(",")}`,
    ),
  ].join("\n"),
);

console.log(
  [
    "target seed | deferred families | first-review wait p50/p95/max d | never reviewed | every family p50/p95/max d | concept families created deferred: n, max d, never | rested / came back / resting at end | longest waits (family, seeded on day, days)",
    ...everyRun().map(
      ({ t, seed, s }) =>
        `${t} ${seed}${HELD_OUT.includes(seed) ? "*" : ""} | ${waitCell(s.firstReviewWait.deferred)} | ${s.firstReviewWait.all.p50}/${s.firstReviewWait.all.p95}/${s.firstReviewWait.all.max} | ${s.firstReviewWait.concept.n}, ${s.firstReviewWait.concept.max}, ${s.firstReviewWait.concept.censored} | ${s.families.rests} / ${s.families.returns} / ${s.families.resting} | ${[
          ...s.firstReviewWait.perFamily,
        ]
          .sort((a, b) => b.waitDays - a.waitDays)
          .slice(0, 3)
          .map((w) => `${w.family} ${w.seededDay} ${w.waitDays}${w.censored ? "+" : ""}`)
          .join(", ")}`,
    ),
    "(* held-out seed; + never reviewed: the wait so far)",
  ].join("\n"),
);

describe("300-day simulation: the contract gate (contracts §7.4)", () => {
  test("the simulation is deterministic for a seed", () => {
    const a = simulate(srs, options("det", 20, { days: 120 }));
    const b = simulate(srs, options("det", 20, { days: 120 }));
    expect(b).toEqual(a);
    expect(simulate(srs, options("other", 20, { days: 120 })).summary).not.toEqual(a.summary);
  });

  test.each(TARGETS)("%d min: p95 planned and real warm-up within budget on every seed", (t) => {
    for (const s of everyRun()
      .filter((r) => r.t === t)
      .map((r) => r.s)) {
      expect(s.plannedSec.p95).toBeLessThanOrEqual(SIM_GATE.p95WarmupSec[t]);
      expect(s.warmupSec.p95).toBeLessThanOrEqual(SIM_GATE.p95WarmupSec[t]);
      // Real durations jitter ±12% around the estimates; the worst day stays near the budget.
      expect(s.warmupSec.max).toBeLessThanOrEqual(1.05 * WARMUP_BUDGET_SEC[t]);
    }
  });

  test("at most 12 active perceptual or production families on every day", () => {
    for (const { s } of everyRun()) expect(s.maxActivePerceptual).toBeLessThanOrEqual(SIM_GATE.maxActive);
  });

  test("p95 of a planned reviews-only day is at most 12 minutes", () => {
    for (const { s } of everyRun()) {
      expect(s.reviewDaySec.p95).toBeLessThanOrEqual(SIM_GATE.p95ReviewDaySec);
      expect(s.reviewDaySec.max).toBeLessThanOrEqual(REVIEW_DAY_MAX_SEC);
    }
  });

  test("p95 age of the oldest undelivered due card ≤ 7 days on every seed and target", () => {
    for (const { s } of everyRun())
      expect(s.oldestUndeliveredDays.p95).toBeLessThanOrEqual(SIM_GATE.p95OldestDueDays);
  });

  test(`every perceptual and production family has its first review set within ${WAIT_BOUND_DAYS} days of its lesson (decision 27)`, () => {
    for (const { t, seed, s } of everyRun()) {
      const w = s.firstReviewWait;
      // Every family, created active or deferred; none is left unreviewed.
      expect([t, seed, w.all.max]).toEqual([t, seed, Math.min(w.all.max, WAIT_BOUND_DAYS)]);
      expect([t, seed, w.all.censored]).toEqual([t, seed, 0]);
    }
  });
});

describe("300-day simulation: companion assertions (spike S7)", () => {
  test("the simulated learner is the contract's: about 85% mean credit, about 10% of sets below 0.65", () => {
    for (const { s } of all()) {
      // Every run is the contract's learner (the learner's relearning floor keeps it out of the FSRS-7
      // lapse loop, see `relearnFloor` in sim/simulate.ts).
      expect(s.setCredit.mean).toBeGreaterThan(0.8);
      expect(s.setCredit.mean).toBeLessThan(0.88);
      expect(s.setCredit.below065).toBeGreaterThan(0.04);
      expect(s.setCredit.below065).toBeLessThan(0.18);
    }
    const mean = all().reduce((a, { s }) => a + s.setCredit.mean, 0) / all().length;
    expect(mean).toBeGreaterThan(0.82);
  });

  test("the first-review wait is measured on every unlocked family; concept families are never left unreviewed", () => {
    for (const { s } of everyRun()) {
      const w = s.firstReviewWait;
      expect(w.all.n).toBe(s.families.unlocked);
      expect(w.perFamily.filter((f) => f.seededDeferred)).toHaveLength(w.deferred.n);
      // Measured with decision 27: at most 6 days on every run, median at most 3.
      expect(w.all.max).toBeLessThanOrEqual(6);
      expect(w.all.p50).toBeLessThanOrEqual(3);
      // A concept family needs no slot; one created deferred is released while the forecast is open. Every
      // one gets its first set (measured at most 9 days after its lesson).
      expect(w.concept.censored).toBe(0);
      expect(w.concept.max).toBeLessThanOrEqual(10);
    }
  });

  test("resting families come back: the composite is a place to wait, not a sink (decision 27)", () => {
    for (const { s } of everyRun()) {
      // Families rest only while the course seeds faster than slots and time turn over (U03–U06), and most
      // come back to their own card once nothing waits.
      expect(s.families.returns).toBeGreaterThan(0);
      expect(s.families.returns).toBeGreaterThanOrEqual(0.6 * s.families.rests);
      expect(s.families.resting).toBeLessThanOrEqual(6);
    }
  });

  test("the deferred-queue count (the replaced criterion) is still printed and stays bounded; concept families are never starved", () => {
    // With decision 27 no family waits more than a couple of days, so the count is mostly deferred fact
    // cards (measured: per-run p95 at most 10, the median run 2).
    for (const { s } of all()) {
      expect(s.deferredCards.p95).toBeLessThanOrEqual(12);
      // The waiting families are perceptual ones held by the active cap and the warm-up time; a concept
      // family needs no slot and is released in turn (it used to wait behind them for the whole run).
      expect(s.deferredFamiliesP95.all - s.deferredFamiliesP95.perceptual).toBeLessThanOrEqual(6);
    }
    // The median run meets the old criterion.
    const q = all()
      .map(({ s }) => s.deferredCards.p95)
      .sort((a, b) => a - b);
    expect(q[Math.floor(q.length / 2)]).toBeLessThanOrEqual(SIM_GATE.p95DeferredCards);
  });

  // The two bounds below were re-based when the gate moved from spike S7's table to the real catalog,
  // whose longest sets (progression dictation, song form, "Read it") take 160–180 s: one of them waiting
  // is most of a 15-minute warm-up on its own.
  // Wave 3 re-based the first again (25 → 32 sessions; 20 d4 measures 30 after its first break): early
  // graduation no longer lets a family graduate before its first review (a family held at level 1 by a
  // gate needs the gated-ladder proof), and decision 27 starts every new family within days, so the U03–U06
  // stretch carries more first sets. The overflow bound is back at Wave 2's 1.2 budgets.
  test("a returning learner is back to at most one set of overflow within 32 sessions of each break", () => {
    for (const { s } of all()) {
      expect(s.sessionsToClearAfterGap).toHaveLength(3);
      for (const n of s.sessionsToClearAfterGap) {
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(32);
      }
    }
  });

  test("steady-state overflow stays near one budget and reviews are rarely late", () => {
    for (const { t, s } of all()) {
      expect(s.overflowSteadySec.p95).toBeLessThanOrEqual(1.2 * WARMUP_BUDGET_SEC[t]);
      expect(s.lateDays.p95).toBeLessThanOrEqual(7);
    }
  });

  test("families flow: most unlocked families reach their mastery level and many graduate", () => {
    for (const { s } of all()) {
      expect(s.families.atMastery / s.families.unlocked).toBeGreaterThanOrEqual(0.55);
      expect(s.families.graduated).toBeGreaterThanOrEqual(10);
    }
  });

  test("facts are recalled near their target at review time and the decks drain", () => {
    for (const { s } of all()) {
      expect(s.recallAtReview.fact).toBeGreaterThan(0.78);
      expect(s.recallAtReview.set).toBeGreaterThan(0.8);
      expect(s.deckPending.atEnd).toBeLessThanOrEqual(30);
    }
  });

  test("the 15-minute target covers about half the map sessions of the 20-minute one (lessons split)", () => {
    const m15 = runs.get(15)?.[0]?.mapSessions ?? 0;
    const m20 = runs.get(20)?.[0]?.mapSessions ?? 0;
    expect(m20).toBeGreaterThan(190);
    expect(m15).toBeLessThan(0.7 * m20);
  });

  test("decision 2 is what lets families flow: the contract's bare numbers graduate fewer families", async () => {
    const bare = await createSrs();
    const contract = simulate(bare, options("a1", 20, { governor: governorFor(20) })).summary;
    const live = runs.get(20)?.[0] as SimSummary;
    expect(contract.families.graduated).toBeLessThan(live.families.graduated);
  });

  test("the simulated course order is the syllabus's: the default order, then the tracks; every family unlocks on it", () => {
    expect(COURSE_ORDER.slice(0, defaultOrder.length)).toEqual(defaultOrder);
    expect(new Set(COURSE_ORDER).size).toBe(COURSE_ORDER.length);
    for (const f of COURSE_CATALOG.families)
      expect([f.id, COURSE_ORDER.includes(f.unlock)]).toEqual([f.id, true]);
  });

  test("without decision 27 (the rules as written) a deferred family waits for months", () => {
    const asWritten = simulate(
      srs,
      options("a1", 20, {
        governor: recommendedGovernor(20, { releaseAfterDays: null, restMinReps: null }),
      }),
    ).summary;
    expect(asWritten.firstReviewWait.deferred.max).toBeGreaterThan(30);
    expect(runs.get(20)?.[0]?.firstReviewWait.all.max).toBeLessThanOrEqual(WAIT_BOUND_DAYS);
  });
});
