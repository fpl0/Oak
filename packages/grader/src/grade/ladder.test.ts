// The ladder grading entry and the capstone length rule (docs/design/wave4.md §3.2), through the real grade
// pipeline with the headless evaluator.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { gradeWith } from "./index.ts";
import {
  capstoneLength,
  type LadderItemSpec,
  ladderExercise,
  ladderGradedPass,
  ladderGradeRequest,
  ladderMatcher,
  nextRealism,
} from "./ladder.ts";

setDefaultTimeout(30_000);
const deps = headlessDeps();
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set<never>(),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const drums: LadderItemSpec = {
  itemId: "lad.1.42",
  level: 1,
  reference: `setcpm(100/4)
kick: s("bd ~ bd ~")
snare: s("~ sd ~ sd")`,
  bars: 1,
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 100,
};

describe("ladder grading", () => {
  test("the item becomes an auto-graded transcribe-step with the level's matcher", () => {
    const ex = ladderExercise(drums);
    expect(ex.kind).toBe("transcribe-step");
    expect(ex.ladder).toBe(1);
    expect(ex.pass).toBe(0.85);
    expect(ex.grading.mode).toBe("auto");
    expect(ladderMatcher(3)).toMatchObject({ m: "melody", track: "@bass" });
    expect(ladderMatcher(3, "quality")).toMatchObject({ m: "harmony", level: "quality" });
    expect(ladderMatcher(3, "rn")).toMatchObject({ m: "harmony", level: "rn" });
    expect(ladderExercise({ ...drums, level: 3, stage: "rn" }).layer).toBe("chords");
    expect(ladderExercise({ ...drums, level: 3, stage: "bass" }).layer).toBe("bass");
  });
  test("an exact answer passes; a wrong groove fails", async () => {
    const ok = await gradeWith(ladderGradeRequest({ item: drums, code: drums.reference, ctx }), deps);
    expect(ok.status).toBe("pass");
    expect(ladderGradedPass(ok)).toBe(true);
    const bad = await gradeWith(
      ladderGradeRequest({ item: drums, code: `setcpm(100/4)\nkick: s("bd bd bd bd")`, ctx }),
      deps,
    );
    expect(bad.status).toBe("fail");
    expect(ladderGradedPass(bad)).toBe(false);
  });
});

describe("the realism rule (contracts §6.12)", () => {
  const s = (score: number, realism: 0 | 1 | 2 | 3 | 4 = 1) => ({ level: 2 as const, realism, score });
  test("up after two consecutive ≥ 0.9 at the current realism, down after one below 0.6", () => {
    expect(nextRealism([s(0.92), s(0.95)], 1)).toBe(2);
    expect(nextRealism([s(0.95)], 1)).toBe(1);
    expect(nextRealism([s(0.8), s(0.95)], 1)).toBe(1);
    expect(nextRealism([s(0.95), s(0.5)], 1)).toBe(0);
    expect(nextRealism([s(0.95, 4), s(0.95, 4)], 4)).toBe(4);
    expect(nextRealism([s(0.5, 0)], 0)).toBe(0);
    expect(nextRealism([], 3)).toBe(3);
  });
});

describe("capstone length (contracts §6.4)", () => {
  test("the arrange() sum, computed, never played", async () => {
    const code = `setcpm(120/4)
const drumsVerse = s("bd sd bd sd")
drums: arrange([8, drumsVerse], [8, drumsVerse])`;
    const n = await strudel(code, 2);
    const len = capstoneLength(code, n.all, 0.5);
    expect(len).toEqual({ totalBars: 16, queriedBars: 16, durationSec: 32, truncated: false });
  });
  test("past 128 bars: truncated", () => {
    const code = `const drumsA = s("bd")
drums: arrange([100, drumsA], [100, drumsA])`;
    expect(capstoneLength(code, [], 0.5)).toMatchObject({
      totalBars: 200,
      queriedBars: 128,
      truncated: true,
    });
  });
});
