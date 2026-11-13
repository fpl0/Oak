import { describe, expect, test } from "bun:test";
import { isSungEvidence, SUNG_STATS_WINDOW, sungAccuracy, sungStatsOf } from "./stats.ts";

describe("sung statistics per category", () => {
  test("counts sung resolutions and passes per category; skipped, quiet and fallback ones are not evidence", () => {
    const stats = sungStatsOf([
      { category: "deg.5", passed: true },
      { category: "deg.5", passed: false },
      { category: "deg.3", passed: true },
      { category: "deg.3", passed: true, skipped: true },
      { category: "deg.2", passed: true, quiet: true },
      { category: "deg.6", passed: true, modality: "fallback" },
    ]);
    expect(stats).toEqual({ "deg.3": { n: 1, hits: 1 }, "deg.5": { n: 2, hits: 1 } });
    expect(sungAccuracy(stats, "deg.5")).toBe(0.5);
    expect(sungAccuracy(stats, "deg.2")).toBeNull();
    expect(isSungEvidence({ category: "deg.1", passed: false })).toBe(true);
  });
  test("only the newest window of a category counts, ordered by `at`", () => {
    const old = Array.from({ length: SUNG_STATS_WINDOW }, (_, i) => ({
      category: "deg.7",
      passed: false,
      at: i,
    }));
    const recent = Array.from({ length: 10 }, (_, i) => ({ category: "deg.7", passed: true, at: 100 + i }));
    // Given out of order: the newest 30 are the 10 passes and 20 of the misses.
    expect(sungStatsOf([...recent, ...old])["deg.7"]).toEqual({ n: 30, hits: 10 });
    expect(sungStatsOf([...recent, ...old], { window: 10 })["deg.7"]).toEqual({ n: 10, hits: 10 });
  });
  test("the shape is the API's FamilyState.sungStats and the drills' SetPlanInput.sungStats", () => {
    const s = sungStatsOf([{ category: "deg.4", passed: true }]);
    const entry = s["deg.4"] as { n: number; hits: number };
    expect(Number.isInteger(entry.n)).toBe(true);
    expect(Object.keys(entry).sort()).toEqual(["hits", "n"]);
  });
});
