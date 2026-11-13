// The contract gate of §7.4 again, with the U05–U07 fact decks that wait for their contracts §7.3 rows
// (content/decks: `deck.chd.triads`, `deck.har.rn`, `deck.har.cadence`) added to the course catalog in course
// order, so the decks can join the catalog without breaking the gate. Only the five §7.4 criteria are held
// here (the companion assertions of simulation.test.ts are tuned to the catalog as it is), on the gate's
// five seeds and three targets.
import { describe, expect, test } from "bun:test";
import { PENDING_DECKS } from "../../../content/decks/index.ts";
import { decks, families } from "../../../content/families.ts";
import { createSrs, DECISION_2, recommendedGovernor, SIM_GATE } from "./index.ts";
import { simCatalogOf } from "./sim/course-catalog.test-util.ts";
import { DEFAULT_LEARNER, type SimSummary, simulate } from "./sim/simulate.ts";

const U05_U07 = ["deck.chd.triads", "deck.har.rn", "deck.har.cadence"];
const catalog = simCatalogOf(families, [...decks, ...PENDING_DECKS.filter((d) => U05_U07.includes(d.id))]);
const srs = await createSrs({ factRetention: DECISION_2.factRetention });
const TARGETS = [15, 20, 25] as const;
const runs: { t: 15 | 20 | 25; seed: string; s: SimSummary }[] = TARGETS.flatMap((t) =>
  ["a1", "b2", "c3", "d4", "e5"].map((seed) => ({
    t,
    seed,
    s: simulate(srs, {
      seed,
      days: 300,
      targetMinutes: t,
      calendar: "weekdays",
      gaps: [
        [61, 64],
        [145, 154],
        [229, 232],
      ],
      governor: recommendedGovernor(t),
      learner: DEFAULT_LEARNER,
      termsPerLesson: 3,
      durationJitter: 0.12,
      catalog,
    }).summary,
  })),
);
console.log(
  [
    "with the U05–U07 decks: target seed | planned warm-up p95 s | active max | oldest undelivered p95 d | first-review wait max d (never) | review day p95 s",
    ...runs.map(
      ({ t, seed, s }) =>
        `${t} ${seed} | ${Math.round(s.plannedSec.p95)} | ${s.maxActivePerceptual} | ${s.oldestUndeliveredDays.p95} | ${s.firstReviewWait.all.max} (${s.firstReviewWait.all.censored}) | ${Math.round(s.reviewDaySec.p95)}`,
    ),
  ].join("\n"),
);

describe("§7.4 with the pending U05–U07 decks in the catalog", () => {
  test("the decks are in the simulated catalog, card by card in their lessons", () => {
    const ids = new Set(catalog.deckBatches.map(([id]) => id));
    for (const id of U05_U07) expect(ids.has(id)).toBe(true);
  });
  test("p95 planned warm-up within budget; ≤ 12 active; oldest due p95 ≤ 7 d; first review ≤ 7 d; review day ≤ 12 min", () => {
    for (const { t, seed, s } of runs) {
      expect([t, seed, s.plannedSec.p95 <= SIM_GATE.p95WarmupSec[t]]).toEqual([t, seed, true]);
      expect([t, seed, s.maxActivePerceptual <= SIM_GATE.maxActive]).toEqual([t, seed, true]);
      expect([t, seed, s.oldestUndeliveredDays.p95 <= SIM_GATE.p95OldestDueDays]).toEqual([t, seed, true]);
      expect([t, seed, s.firstReviewWait.all.max <= SIM_GATE.firstReviewWaitDays]).toEqual([t, seed, true]);
      expect([t, seed, s.firstReviewWait.all.censored]).toEqual([t, seed, 0]);
      expect([t, seed, s.reviewDaySec.p95 <= SIM_GATE.p95ReviewDaySec]).toEqual([t, seed, true]);
    }
  });
});
