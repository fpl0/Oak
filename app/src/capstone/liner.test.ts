import { describe, expect, test } from "bun:test";
import { analysisTheory, composeLiner, LINER_MAX_WORDS, type LinerFacts, wordCount } from "./liner.ts";

const C = { tonic: "C", mode: "major" } as const;
const base: LinerFacts = {
  learnerLine: "",
  bars: 8,
  bpm: 96,
  key: C,
  meter: "4/4",
  theory: [],
  previewTools: [],
  revealed: [],
};

describe("composeLiner", () => {
  test("facts, theory and the learner's line, in that order after the line", () => {
    const t = composeLiner({
      ...base,
      learnerLine: "A loop that finally lands",
      theory: ["the axis progression (bars 1–4)", "a plagal cadence at bar 8"],
    });
    expect(t.split("\n\n")).toEqual([
      "A loop that finally lands.",
      "8 bars of 4/4 at 96 BPM in C major.",
      "Theory used: the axis progression (bars 1–4); a plagal cadence at bar 8.",
    ]);
  });

  test("never more than 60 words; the theory list shortens first, flags stay", () => {
    const long = Array.from({ length: 20 }, (_, i) => `a fairly long theory item number ${i}`);
    const t = composeLiner({
      ...base,
      learnerLine: "Short.",
      theory: long,
      previewTools: ["voicing()"],
      revealed: ["phrase 2"],
      attribution: "Revision suggested by Claude (bars 5–8)",
    });
    expect(wordCount(t)).toBeLessThanOrEqual(LINER_MAX_WORDS);
    expect(t).toContain("Uses preview tools: `voicing()`.");
    expect(t).toContain("Revealed, not heard: phrase 2.");
    expect(t).toContain("Revision suggested by Claude (bars 5–8).");
    expect(t).toContain("Short.");
    expect(t).toContain("Theory used: a fairly long theory item number 0");
  });

  test("a very long learner line is cut with an ellipsis, not the flags", () => {
    const line = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const t = composeLiner({ ...base, learnerLine: line, previewTools: ["chord()"] });
    expect(wordCount(t)).toBeLessThanOrEqual(LINER_MAX_WORDS);
    expect(t).toContain("…");
    expect(t).toContain("`chord()`");
  });

  test("a transcription names its source and the phrases revealed", () => {
    const t = composeLiner({
      ...base,
      source: "Aura Lee (1861)",
      bars: 16,
      bpm: 84,
      theory: ["melody by ear, phrase by phrase", "chords bass-first"],
      revealed: ["phrase 3"],
    });
    expect(t).toContain("Aura Lee (1861): 16 bars of 4/4 at 84 BPM in C major.");
    expect(t).toContain("Revealed, not heard: phrase 3.");
  });

  test("no key for a drum piece; one bar is singular", () => {
    expect(composeLiner({ ...base, key: null, bars: 1, bpm: null })).toBe("1 bar of 4/4.");
  });
});

describe("analysisTheory", () => {
  test("schemas with their bars, then cadences in words, then devices; no duplicates", () => {
    expect(
      analysisTheory({
        schemas: [{ schema: "schema.axis", bars: [1, 6] }],
        cadences: [
          { bar: 8, type: "PC" },
          { bar: 8, type: "PC" },
          { bar: 4, type: "none" },
        ],
        devices: ["suspension"],
      }),
    ).toEqual(["the axis progression (bars 1–6)", "a plagal cadence at bar 8", "suspension"]);
    expect(analysisTheory(null)).toEqual([]);
  });
});

describe("wordCount", () => {
  test("counts words, not punctuation or code ticks", () => {
    expect(wordCount("Uses preview tools: `voicing()`. — ok")).toBe(5);
  });
});
