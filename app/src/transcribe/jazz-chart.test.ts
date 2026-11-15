import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { jazzBlues, rhythmChanges } from "@oak/theory";
import {
  chartSymbolText,
  checkJazzChart,
  compareJazzChord,
  JAZZ_CHART_PASS,
  parseChartCell,
  readJazzChord,
  tensionText,
} from "./jazz-chart.ts";

describe("reading a jazz symbol in any spelling", () => {
  test("one chord, many spellings: glyphs, lead sheet and code read the same", () => {
    for (const [a, b] of [
      ["D-7", "Dm7"],
      ["D–7", "Dmin7"],
      ["C∆7", "Cmaj7"],
      ["Bø", "Bm7b5"],
      ["G7♭9", "G7b9"],
      ["C6/9", "C69"],
      ["C°7", "Cdim7"],
    ] as const)
      expect(compareJazzChord(a, b).verdict).toBe("ok");
    expect(readJazzChord("H7")).toBeNull();
    expect(readJazzChord("")).toBeNull();
  });

  test("the chart prints the learner's chosen style from the one table", () => {
    expect(chartSymbolText("Cmaj7", "jazz")).toBe("C∆7");
    expect(chartSymbolText("Bm7b5", "jazz")).toBe("Bø7");
    expect(chartSymbolText("Dm7", "jazz")).toBe("D–7");
    expect(chartSymbolText("D–7", "lead-sheet")).toBe("Dm7");
    expect(chartSymbolText("F9/A", "lead-sheet")).toBe("F9/A");
    expect(chartSymbolText("what", "jazz")).toBe("what");
    expect(tensionText("#9")).toBe("♯9");
    expect(tensionText("b13")).toBe("♭13");
  });

  test("a cell of two chords is two slots", () => {
    expect(parseChartCell("Dm7 G7")).toEqual(["Dm7", "G7"]);
    expect(parseChartCell(" Cm7 | F7 ")).toEqual(["Cm7", "F7"]);
    expect(parseChartCell("")).toEqual([]);
  });
});

describe("the chart checked bar by bar", () => {
  const blues = jazzBlues("F");

  test("the jazz blues in F, every chord of it sounds in Strudel's default dictionary", async () => {
    // The chart a gym item plays must be playable: chord().voicing() gives notes for every symbol.
    const line = blues.map((bar) => (bar.length === 1 ? bar[0] : `[${bar.join(" ")}]`)).join(" ");
    const r = await evalHeadless(`chords: chord("<${line}>").voicing()`, blues.length);
    const bars = new Set(r.events.map((e) => Math.floor(e.onset)));
    expect(bars.size).toBe(blues.length);
    expect(r.logs.filter((l) => l.includes("unknown chord"))).toEqual([]);
  });

  test("the reference and three other right spellings pass", () => {
    expect(checkJazzChart(blues, blues).passed).toBe(true);
    const glyphs = blues.map((b) => b.map((s) => chartSymbolText(s, "jazz")));
    expect(checkJazzChart(blues, glyphs).score).toBe(1);
    const lead = blues.map((b) => b.map((s) => chartSymbolText(s, "lead-sheet")));
    expect(checkJazzChart(blues, lead).score).toBe(1);
    const rc = rhythmChanges("Bb").bars;
    expect(
      checkJazzChart(
        rc,
        rc.map((b) => b.map((s) => s.replace("^7", "maj7"))),
      ).score,
    ).toBe(1);
  });

  test("a wrong extension is named per bar, in the learner's own symbol, never the answer", () => {
    // Bar 8 is D7 in the jazz blues; the learner hears an altered colour that is not there.
    const got = blues.map((b) => [...b]);
    got[7] = ["D7#9"];
    const c = checkJazzChart(blues, got);
    const bar8 = c.bars[7];
    expect(bar8?.verdict).toBe("extension-wrong");
    expect(bar8?.text).toBe(
      "Bar 8: the chord underneath is right; the ♯9 you wrote isn't the colour on top.",
    );
    expect(bar8?.text).not.toContain("D7.");
    expect(c.score).toBeCloseTo(11 / 12, 9);
    expect(c.passed).toBe(11 / 12 >= JAZZ_CHART_PASS);
  });

  test("a missing colour, a wrong quality, a wrong root and a slash bass are each named, none naming the chord", () => {
    const want = [["G13"], ["Cm7"], ["F7"], ["C/E"]];
    const c = checkJazzChart(want, [["G7"], ["C7"], ["Gb7"], ["C"]]);
    expect(c.bars.map((b) => b.verdict)).toEqual(["extension-missing", "quality", "root", "bass"]);
    for (const b of c.bars) {
      expect(b.text).not.toMatch(/G13|Cm7|F7|C\/E/);
      expect(b.text?.startsWith(`Bar ${b.bar}:`)).toBe(true);
    }
  });

  test("a bar of two chords needs two; an empty or unreadable bar says so", () => {
    const want = [["Cm7", "F7"], ["Bb^7"], ["Eb7"]];
    const c = checkJazzChart(want, [["Cm7"], [], ["Eb7x"]]);
    expect(c.bars.map((b) => b.verdict)).toEqual(["count", "empty", "unreadable"]);
    expect(c.bars[0]?.text).toBe("Bar 1: the harmony moves inside this bar; your chart has one chord there.");
    expect(checkJazzChart(want, [["Cm7", "F7b9"], ["Bb^7"], ["Eb7"]]).bars[0]?.text).toBe(
      "Bar 1, second chord: the chord underneath is right; the ♭9 you wrote isn't the colour on top.",
    );
    expect(checkJazzChart(want, []).summary).toBe("0 of 3 bars right.");
  });

  test("a right function, wrong result: the right root and seventh with the dominant's colour on the tonic fails", () => {
    // Writing extensions everywhere is not hearing them: a 13 on the I chord of the blues is not what plays.
    const got = blues.map((b) => b.map((s) => (s === "F7" ? "F13" : s)));
    const c = checkJazzChart(blues, got);
    expect(c.passed).toBe(false);
    expect(c.bars[0]?.text).toContain("the 9 and 13 you wrote aren't the colour on top");
  });
});
