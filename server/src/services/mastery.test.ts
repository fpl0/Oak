import { describe, expect, test } from "bun:test";
import { addDays } from "../lib/days.ts";
import {
  computeSkill,
  type EvidenceItem,
  evidenceWeight,
  performance,
  productionLags,
  type SkillInput,
  spreadDays,
  tauOf,
} from "./mastery.ts";

const TODAY = "2026-11-11";
const ev = (
  score: number,
  daysAgo = 0,
  weight = 1,
  sourceKind: EvidenceItem["sourceKind"] = "step",
  sourceId = "x#1",
): EvidenceItem => ({
  score,
  weight,
  day: addDays(TODAY, -daysAgo),
  at: `${addDays(TODAY, -daysAgo)}T10:00:00.000Z`,
  sourceKind,
  sourceId,
});
const input = (over: Partial<SkillInput> = {}): SkillInput => ({
  kind: "concept",
  evidence: [],
  today: TODAY,
  lessonOpen: true,
  introduced: true,
  cards: [],
  familyAtMastery: null,
  checkpointPassed: null,
  noMic: false,
  previous: null,
  checkpointDay: null,
  ...over,
});

describe("quantities (contracts §7.5)", () => {
  test("P shrinks toward 0.5 with one unit of prior weight", () => {
    expect(performance([], TODAY)).toBe(0.5);
    // One item today, w = 1, s = 1: (1 + 0.5) / (1 + 1) = 0.75.
    expect(performance([ev(1)], TODAY)).toBeCloseTo(0.75, 12);
    // Two items, w = 2 and 1: (2·1 + 1·0 + 0.5) / (3 + 1) = 0.625.
    expect(performance([ev(1, 0, 2), ev(0)], TODAY)).toBeCloseTo(0.625, 12);
  });

  test("evidence decays with a 45-day half-life", () => {
    // Age 45 days: decay 0.5 → (0.5·1 + 0.5) / (0.5 + 1) = 2/3.
    expect(performance([ev(1, 45)], TODAY)).toBeCloseTo(2 / 3, 12);
    // Age 90 days: decay 0.25 → (0.25 + 0.5) / 1.25 = 0.6.
    expect(performance([ev(1, 90)], TODAY)).toBeCloseTo(0.6, 12);
  });

  test("D counts distinct days in the last 60 with an item ≥ 0.8", () => {
    expect(spreadDays([ev(0.8, 0), ev(0.9, 0), ev(0.95, 3), ev(0.79, 5), ev(1, 59), ev(1, 60)], TODAY)).toBe(
      3,
    );
  });

  test.each([
    ["step", 1],
    ["retry", 0.3],
    ["predict", 0.5],
    ["checkpoint", 2],
    ["srs-set", 1],
    ["gym-set", 0.5],
    ["anchor-set", 0.5],
    ["rubric-rule", 1.5],
    ["self-transcription", 0.3],
  ] as const)("evidence weight of %s is %f", (source, w) => {
    expect(evidenceWeight(source)).toBe(w);
  });
  test("an SRS set gets +0.5 per category with ≥ 2 trials", () => {
    expect(evidenceWeight("srs-set", 2)).toBe(2);
  });

  test("τ is 0.90 for fact and concept nodes and 0.85 for the others", () => {
    expect(["fact", "concept", "perceptual", "production", "creative"].map((k) => tauOf(k as never))).toEqual(
      [0.9, 0.9, 0.85, 0.85, 0.85],
    );
  });
});

describe("levels (exercises §5.3 as fixed by contracts §7.5)", () => {
  const strong = [ev(1, 0, 4), ev(1, 1, 4), ev(1, 2, 4)]; // P = (12 + 0.5)/13 ≈ 0.96, D = 3

  test.each<[string, Partial<SkillInput>, string]>([
    ["introducing lesson not open", { lessonOpen: false, introduced: false }, "new"],
    ["lesson open, not introduced", { introduced: false }, "available"],
    ["introduced, no evidence", {}, "learning"],
    ["P ≥ 0.70 but Σw < 2", { evidence: [ev(1, 0, 1.5)] }, "learning"],
    ["P ≥ 0.70 and Σw ≥ 2, one day", { evidence: [ev(1, 0, 3)] }, "practiced"],
    ["P ≥ τ and D ≥ 2", { evidence: strong }, "mastered"],
    ["P ≥ τ but D = 1", { evidence: [ev(1, 0, 12)] }, "practiced"],
    ["checkpoint in range not passed", { evidence: strong, checkpointPassed: false }, "practiced"],
    ["checkpoint passed", { evidence: strong, checkpointPassed: true }, "mastered"],
    [
      "perceptual: family below masteryLevel",
      { kind: "perceptual", evidence: strong, familyAtMastery: false },
      "practiced",
    ],
    [
      "perceptual: family at masteryLevel",
      { kind: "perceptual", evidence: strong, familyAtMastery: true },
      "mastered",
    ],
    [
      "creative: one piece only",
      {
        kind: "creative",
        evidence: strong.map((e) => ({
          ...e,
          sourceKind: "rubric-rule" as const,
          sourceId: "U01.L01/groove#1",
        })),
      },
      "practiced",
    ],
    [
      "creative: two pieces",
      {
        kind: "creative",
        evidence: strong.map((e, i) => ({
          ...e,
          sourceKind: "rubric-rule" as const,
          sourceId: i === 0 ? "U01.L01/groove#1" : "U01.L02/groove#7",
        })),
      },
      "mastered",
    ],
  ])("%s → %s", (_name, over, level) => {
    expect(computeSkill(input(over)).level).toBe(level as never);
  });

  test("hysteresis: mastered stays until P < τ − 0.10, then drops to practiced", () => {
    const prev = { level: "mastered" as const, debt: false, debtReason: null, provisional: false };
    // P = (0.81·10 + 0.5) / 11 ≈ 0.782 < 0.80: demoted.
    expect(computeSkill(input({ evidence: [ev(0.81, 0, 10)], previous: prev })).level).toBe("practiced");
    // P = (0.84·10 + 0.5)/11 ≈ 0.809 ≥ 0.80 (τ 0.90 − 0.10): stays mastered even with D = 1.
    expect(computeSkill(input({ evidence: [ev(0.84, 0, 10)], previous: prev })).level).toBe("mastered");
    // Without the previous level the same evidence is only practiced.
    expect(computeSkill(input({ evidence: [ev(0.84, 0, 10)] })).level).toBe("practiced");
  });

  test("low R never revokes mastery; it only lowers freshness", () => {
    const prev = { level: "mastered" as const, debt: false, debtReason: null, provisional: false };
    const r = computeSkill(
      input({
        evidence: strong,
        previous: prev,
        cards: [{ retrievability: 0.4, desiredRetention: 0.9, weight: 1 }],
      }),
    );
    expect(r.level).toBe("mastered");
    expect(r.R).toBeCloseTo(0.4, 12);
    expect(r.M).toBeCloseTo(r.P * 0.4, 12);
    expect(r.freshness).toBe(0);
  });

  test("R is the ω-weighted mean of linked cards; freshness is relative to each card's ρ", () => {
    const r = computeSkill(
      input({
        cards: [
          { retrievability: 0.85, desiredRetention: 0.85, weight: 2 },
          { retrievability: 0.6, desiredRetention: 0.9, weight: 1 },
        ],
      }),
    );
    expect(r.R).toBeCloseTo((2 * 0.85 + 0.6) / 3, 12);
    // freshness: card 1 = 1 (on schedule); card 2 = (0.6 − 0.6)/0.25 = 0 → (2·1 + 0)/3.
    expect(r.freshness).toBeCloseTo(2 / 3, 12);
  });
});

describe("flags", () => {
  test("debt clears at P ≥ 0.80 with evidence on two days", () => {
    const prev = {
      level: "practiced" as const,
      debt: true,
      debtReason: "soft-pass" as const,
      provisional: false,
    };
    expect(computeSkill(input({ previous: prev, evidence: [ev(1, 0, 8)] })).debt).toBe(true); // one day
    const cleared = computeSkill(input({ previous: prev, evidence: [ev(1, 0, 4), ev(1, 1, 4)] }));
    expect(cleared).toMatchObject({ debt: false, debtReason: null });
  });

  test("a production node that lags for 14 days gets production-lag debt", () => {
    const lag = [ev(0.4, 20), ev(0.5, 0)];
    expect(productionLags(lag, TODAY, 0.5)).toBe(true);
    expect(productionLags([ev(0.4, 3)], TODAY, 0.5)).toBe(false);
    expect(computeSkill(input({ kind: "production", evidence: lag }))).toMatchObject({
      debt: true,
      debtReason: "production-lag",
    });
    expect(computeSkill(input({ kind: "concept", evidence: lag })).debt).toBe(false);
  });

  test("provisional clears with a set ≥ 0.85 on a later day than the checkpoint", () => {
    const prev = { level: "practiced" as const, debt: false, debtReason: null, provisional: true };
    const cpDay = addDays(TODAY, -2);
    expect(
      computeSkill(
        input({
          kind: "perceptual",
          previous: prev,
          checkpointDay: cpDay,
          evidence: [ev(0.9, 2, 1, "srs-set")],
        }),
      ).provisional,
    ).toBe(true);
    expect(
      computeSkill(
        input({
          kind: "perceptual",
          previous: prev,
          checkpointDay: cpDay,
          evidence: [ev(0.84, 0, 1, "srs-set")],
        }),
      ).provisional,
    ).toBe(true);
    expect(
      computeSkill(
        input({
          kind: "perceptual",
          previous: prev,
          checkpointDay: cpDay,
          evidence: [ev(0.9, 0, 1, "srs-set")],
        }),
      ).provisional,
    ).toBe(false);
  });

  test("a production node with no microphone is paused", () => {
    expect(computeSkill(input({ kind: "production", noMic: true })).paused).toBe(true);
    expect(computeSkill(input({ kind: "perceptual", noMic: true })).paused).toBe(false);
  });
});
