import { describe, expect, test } from "bun:test";
import { factGrade, gradeFor, type ReviewOutcome, stepGrade } from "./index.ts";

const set = (o: Partial<ReviewOutcome>): ReviewOutcome => ({
  meanCredit: 0.875,
  medianRtMs: 3000,
  fastRtMs: 2500,
  extraReplays: 0,
  hintRung: 0,
  revealed: false,
  atOrAboveLevel: true,
  ...o,
});

describe("grade map (contracts §7.2)", () => {
  test("family sets: thresholds, first match wins", () => {
    expect(gradeFor(set({ meanCredit: 0.64 }))).toBe(1);
    expect(gradeFor(set({ meanCredit: 0.65 }))).toBe(2);
    expect(gradeFor(set({ meanCredit: 0.79 }))).toBe(2);
    expect(gradeFor(set({ meanCredit: 0.8 }))).toBe(3);
    expect(gradeFor(set({ meanCredit: 0.94, medianRtMs: 1000 }))).toBe(3);
    expect(gradeFor(set({ meanCredit: 0.95, medianRtMs: 2500 }))).toBe(4);
    expect(gradeFor(set({ meanCredit: 0.95, medianRtMs: 2501 }))).toBe(3); // not fast
    expect(gradeFor(set({ meanCredit: Number.NaN }))).toBe(1);
  });

  test("revealed is Again whatever the credit; replays and hints cap the rating", () => {
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, revealed: true }))).toBe(1);
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, hintRung: 4 }))).toBe(1);
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, extraReplays: 1 }))).toBe(2);
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, hintRung: 2 }))).toBe(2);
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, hintRung: 3 }))).toBe(2);
    expect(gradeFor(set({ meanCredit: 1, medianRtMs: 100, hintRung: 1 }))).toBe(3); // rung 1: best is Good
    expect(gradeFor(set({ meanCredit: 0.5, hintRung: 1 }))).toBe(1);
  });

  test("Easy is relative to the level played and, for production, to the cents tolerance", () => {
    const fast = { meanCredit: 1, medianRtMs: 1000 };
    expect(gradeFor(set(fast))).toBe(4);
    expect(gradeFor(set({ ...fast, atOrAboveLevel: false }))).toBe(3); // a set one level down is never Easy
    expect(gradeFor(set({ ...fast, meanAbsCents: 25, tolCents: 50 }))).toBe(4);
    expect(gradeFor(set({ ...fast, meanAbsCents: 26, tolCents: 50 }))).toBe(3);
    expect(gradeFor(set({ ...fast, tolCents: 50 }))).toBe(3); // production set with no cents measured
  });

  test("fact cards", () => {
    expect(factGrade(false, 500, 2500, false)).toBe(1);
    expect(factGrade(true, 2500, 2500, false)).toBe(4);
    expect(factGrade(true, 2501, 2500, false)).toBe(3);
    expect(factGrade(true, 7500, 2500, false)).toBe(3);
    expect(factGrade(true, 7501, 2500, false)).toBe(2); // slower than 3 × fastRtMs
    expect(factGrade(true, 500, 2500, true)).toBe(2); // hinted
  });

  test("lesson steps use the same table on the adjusted score, with the rung caps", () => {
    const plain = { hintRung: 0, revealed: false, extraReplays: 0 } as const;
    expect(stepGrade(1, plain)).toBe(3); // no response-time evidence: Good is the best a step gives
    expect(stepGrade(0.8, plain)).toBe(3);
    expect(stepGrade(0.79, plain)).toBe(2);
    expect(stepGrade(0.64, plain)).toBe(1);
    expect(stepGrade(0.9, { ...plain, hintRung: 1 })).toBe(3);
    expect(stepGrade(0.8, { ...plain, hintRung: 2 })).toBe(2);
    expect(stepGrade(0.9, { ...plain, extraReplays: 2 })).toBe(2);
    expect(stepGrade(0, { ...plain, hintRung: 4, revealed: true })).toBe(1);
    expect(stepGrade(1, { ...plain, revealed: true })).toBe(1);
  });
});
