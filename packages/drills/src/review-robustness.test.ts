// Regression test of the Wave 4 adversarial review (review:robustness): Roman-numeral answers typed with the figures
// as Oak prints them (V⁶, I⁶₄) or with the other half-diminished glyph (∅) are the same answer; a different chord
// is still different.
import { describe, expect, test } from "bun:test";
import { sameRnAnswer } from "./grade.ts";

const C = { tonic: "C", mode: "major" } as const;

describe("sameRnAnswer: printed figures and glyphs", () => {
  test("superscript and subscript figures read as the numbers on the line", () => {
    expect(sameRnAnswer("V6", "V⁶", C)).toBe(true);
    expect(sameRnAnswer("I64", "I⁶₄", C)).toBe(true);
    expect(sameRnAnswer("V7", "V⁷", C)).toBe(true);
  });
  test("∅ and Ø are the half-diminished ø", () => {
    expect(sameRnAnswer("viiø7", "vii∅7", C)).toBe(true);
    expect(sameRnAnswer("viiø7", "viiØ7", C)).toBe(true);
  });
  test("a different inversion, quality or degree is still wrong", () => {
    expect(sameRnAnswer("V6", "V⁶₄", C)).toBe(false);
    expect(sameRnAnswer("viiø7", "viio7", C)).toBe(false);
    expect(sameRnAnswer("ii", "II", C)).toBe(false);
  });
});
