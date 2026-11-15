// The retry policy's pure rules (docs/design/retry.md §3): what an attempt counts for, and which answer a drill
// trial keeps when it is posted again.
import { describe, expect, test } from "bun:test";
import type { DrillTrialRecord, SungResolution } from "@oak/api";
import { countAttempt, keepFirstAnswer, type PriorAttempt } from "./retry.ts";

const graded = (practice = false, disputed = false): PriorAttempt => ({ graded: true, practice, disputed });
const error: PriorAttempt = { graded: false, practice: false, disputed: false };

describe("countAttempt (a lesson step)", () => {
  const base = { kind: "identify" as const, stepPassed: false, lessonCompleted: false, prior: [] };

  test("the first graded attempt in the step is first; an error before it is not an attempt", () => {
    expect(countAttempt(base)).toEqual({ count: "first", reason: null });
    expect(countAttempt({ ...base, prior: [error] })).toEqual({ count: "first", reason: null });
  });

  test("after a fail the next attempt is the normal retry, in any series", () => {
    // "Try a new one" starts a new series; the step's history still holds the failed first attempt.
    expect(countAttempt({ ...base, prior: [graded()] })).toEqual({ count: "retry", reason: null });
    expect(countAttempt({ ...base, prior: [graded(), graded()] })).toEqual({ count: "retry", reason: null });
  });

  test("a disputed first attempt gave nothing, but the next one is still a retry", () => {
    expect(countAttempt({ ...base, prior: [graded(false, true)] })).toEqual({ count: "retry", reason: null });
  });

  test("once the step passed, every attempt is practice, right or wrong", () => {
    expect(countAttempt({ ...base, stepPassed: true, prior: [graded()] })).toEqual({
      count: "practice",
      reason: "passed",
    });
  });

  test("every attempt in a completed lesson (a replay) is practice, passed or not", () => {
    expect(countAttempt({ ...base, lessonCompleted: true })).toEqual({
      count: "practice",
      reason: "completed",
    });
  });

  test("a predict counts once; a second guess is practice", () => {
    const p = { ...base, kind: "predict" as const };
    expect(countAttempt(p)).toEqual({ count: "predict", reason: null });
    expect(countAttempt({ ...p, prior: [graded()] })).toEqual({ count: "practice", reason: "predicted" });
    // Only counted attempts matter: practice rows never make a later one practice by themselves.
    expect(countAttempt({ ...p, prior: [graded(true)] })).toEqual({ count: "predict", reason: null });
  });
});

const trial = (over: Partial<DrillTrialRecord> = {}): DrillTrialRecord => ({
  idx: 2,
  familyId: "fam.ear.pulse" as DrillTrialRecord["familyId"],
  seed: 7,
  level: 1,
  category: "basic",
  params: {},
  response: { answer: null, taps: null, sung: null, skipped: false },
  credit: 0,
  correct: false,
  rtMs: 1800,
  replays: 0,
  confusion: ["3", "4"],
  centsError: null,
  at: "2026-11-11T12:01:00.000Z",
  ...over,
});

const sung = (credit: number): SungResolution => ({
  path: ["4", "3", "2", "1"],
  order: "play-first",
  notes: [],
  credit,
  passed: credit >= 0.8,
  skipped: false,
  quiet: false,
  tolCents: 70,
});

describe("keepFirstAnswer (a drill trial posted again)", () => {
  test("a new index is stored as sent", () => {
    const t = trial({ credit: 1, correct: true });
    expect(keepFirstAnswer(undefined, t)).toBe(t);
  });

  test("a right answer after a wrong one never changes the trial's credit, answer or time", () => {
    const first = trial();
    const retry = trial({ credit: 1, correct: true, confusion: null, rtMs: 900, retries: 1 });
    expect(keepFirstAnswer(first, retry)).toEqual({ ...first, retries: 1 });
  });

  test("a wrong practice take after a right answer never lowers it", () => {
    const first = trial({ credit: 1, correct: true, confusion: null });
    expect(keepFirstAnswer(first, trial({ credit: 0, retries: 2 }))).toEqual({ ...first, retries: 2 });
  });

  test("a sung resolution arrives with the second post; a later one never replaces it", () => {
    const first = trial({ credit: 1, correct: true, sungResolution: null });
    const withSung = keepFirstAnswer(first, trial({ credit: 1, correct: true, sungResolution: sung(0.5) }));
    expect(withSung.sungResolution?.credit).toBe(0.5);
    const again = keepFirstAnswer(withSung, trial({ sungResolution: sung(1), retries: 1 }));
    expect(again.sungResolution?.credit).toBe(0.5);
    expect(again.retries).toBe(1);
  });

  test("the practice count is never lowered by an older post", () => {
    expect(keepFirstAnswer(trial({ retries: 3 }), trial({ retries: 1 })).retries).toBe(3);
  });
});
