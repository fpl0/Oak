// Wave 4 review regressions in the tutor panel's tokens:
// - a bar range written backwards ("[[bars:4-2]]") says and lights bars 2–4 (the chip said "bar 2");
// - a slash chord ("[[chord:G/B]]", outside the token grammar) reads as its lead-sheet text, never as raw brackets.
import { describe, expect, test } from "bun:test";
import { barsToCycles } from "./context.ts";
import { parseMarkdown, plainText, tokensIn } from "./markdown.ts";
import { canonicalTokenRaw, describeToken, type TokenContext } from "./music-tokens.ts";

const CTX: TokenContext = { terms: [], introduced: null, tools: [], unlocked: null };

describe("bar links", () => {
  test("backwards, single and forwards ranges say the bars they light", () => {
    for (const [value, label, from, to] of [
      ["4-2", "bars 2–4", 2, 4],
      ["2-4", "bars 2–4", 2, 4],
      ["3", "bar 3", 3, 3],
      ["3-3", "bar 3", 3, 3],
    ] as const) {
      const info = describeToken({ kind: "bars", value }, CTX);
      expect(info?.label).toBe(label);
      expect(info?.bars).toEqual({ from, to });
      expect(barsToCycles(from, to)).toEqual([from - 1, to]);
    }
  });
  test("with a pickup, bar 0 is cycle 0 and bar N is cycle N (Wave 4 gate)", () => {
    expect(barsToCycles(0, 0, true)).toEqual([0, 1]);
    expect(barsToCycles(1, 2, true)).toEqual([1, 3]);
    expect(barsToCycles(0, 0)).toEqual([0, 1]);
  });
});

describe("slash chords from a model", () => {
  test("[[chord:G/B]] is the text G/B; F♯/A♯ and B♭m/D♭ keep their accidentals", () => {
    expect(canonicalTokenRaw("[[chord:G/B]]")).toBe("G/B");
    expect(canonicalTokenRaw("[[chord:F#/A#]]")).toBe("F♯/A♯");
    expect(canonicalTokenRaw("[[chord:Bbm/Db]]")).toBe("B♭m/D♭");
    const blocks = parseMarkdown("Try [[chord:G/B]] then [[chord:C]].");
    expect(plainText(blocks)).toBe("Try G/B then C.");
    expect(tokensIn(blocks)).toEqual([{ kind: "chord", value: "C" }]);
  });
});

describe("Mark done on review revisions (ux §6.5)", () => {
  test("ticks are read from this browser's storage; without storage nothing is ticked", async () => {
    const { readDone } = await import("./review-done.ts");
    const g = globalThis as { localStorage?: unknown };
    const before = g.localStorage;
    try {
      g.localStorage = undefined;
      expect(readDone("r1")).toEqual([]);
      const store = new Map<string, string>([["oak.review-done.r1", '[0,2,"x"]']]);
      g.localStorage = { getItem: (k: string) => store.get(k) ?? null };
      expect(readDone("r1")).toEqual([0, 2]);
      expect(readDone("other")).toEqual([]);
    } finally {
      g.localStorage = before;
    }
  });
});
