import { describe, expect, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import { gradeFormMap } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { rhythmChanges } from "@oak/theory";
import blackbird from "../../../content/repertoire/bye-bye-blackbird/song.ts";
import {
  type AnalysisSource,
  type ChartSlot,
  chartSlots,
  checkAnalysis,
  expectedNumerals,
  judgeNumeral,
  keyAtBar,
  revealedAnalysis,
  twoFiveStarts,
} from "./analysis.ts";
import { analysisSourceOf } from "./analysis-source.ts";

const C = { tonic: "C", mode: "major" } as const;
const slot = (symbol: string, key = C) => ({ ...(chartSlots(src([[symbol]], key))[0] as ChartSlot), key });

function src(
  bars: string[][],
  key: { tonic: string; mode: "major" | "minor" } = C,
  keyPlan?: AnalysisSource["keyPlan"],
): AnalysisSource {
  return {
    title: "test",
    key,
    keyPlan: keyPlan ?? null,
    bars: bars.length,
    chords: bars.flatMap((b, i) => b.map((symbol, k) => ({ bar: i + 1, beat: k === 0 ? 1 : 3, symbol }))),
    sections: [{ label: "A", bars: [1, bars.length] }],
  };
}

describe("a numeral is graded by degree, chroma and bass, never by string", () => {
  test("several right spellings of one chord pass", () => {
    expect(judgeNumeral("V7/vi", slot("E7"))).toBe("ok");
    expect(judgeNumeral("III7", slot("E7"))).toBe("ok");
    expect(judgeNumeral("ii", slot("Dm7"))).toBe("ok");
    expect(judgeNumeral("ii7", slot("Dm9"))).toBe("ok");
    expect(judgeNumeral("iiø7", slot("Dm7b5"))).toBe("ok");
    expect(judgeNumeral("I∆7", slot("C^7"))).toBe("ok");
    expect(judgeNumeral("♭II7", slot("Db7"))).toBe("ok");
  });

  test("a wrong degree, a wrong quality, a wrong seventh and a wrong inversion each fail", () => {
    expect(judgeNumeral("IV7", slot("G7"))).toBe("degree");
    expect(judgeNumeral("II", slot("Dm7"))).toBe("quality");
    // The right numeral with the wrong seventh: a major seventh on V is not the dominant that sounds.
    expect(judgeNumeral("Vmaj7", slot("G7"))).toBe("quality");
    expect(judgeNumeral("I6", slot("C"))).toBe("bass");
    expect(judgeNumeral("", slot("C"))).toBe("empty");
    expect(judgeNumeral("Q7", slot("C"))).toBe("unreadable");
  });

  test("the numeral is read in the key in force at its bar (a key plan)", () => {
    const s = src([["C^7"], ["Dm7", "G7"], ["Eb^7"], ["Fm7", "Bb7"]], C, [
      { bar: 1, key: C },
      { bar: 3, key: { tonic: "Eb", mode: "major" } },
    ]);
    expect(keyAtBar(s, 4)).toEqual({ tonic: "Eb", mode: "major" });
    const slots = chartSlots(s);
    expect(judgeNumeral("ii7", slots[4] as ChartSlot)).toBe("ok");
    expect(judgeNumeral("iv7", slots[4] as ChartSlot)).toBe("degree");
    expect(expectedNumerals(slots)).toEqual(["Imaj7", "ii7", "V7", "Imaj7", "ii7", "V7"]);
  });
});

describe("ii–V brackets", () => {
  test("rhythm changes in B♭: each ii–V is found, across a bar line too", () => {
    const rc = rhythmChanges("Bb");
    const s = src(
      rc.bars.map((b) => [...b]),
      { tonic: "Bb", mode: "major" },
    );
    const slots = chartSlots(s);
    const starts = twoFiveStarts(slots);
    for (const i of starts) {
      expect((slots[i] as ChartSlot).chord.quality).toMatch(/m7|m7b5/);
      expect(
        ((slots[i + 1] as ChartSlot).chord.rootPc - (slots[i] as ChartSlot).chord.rootPc + 12) % 12,
      ).toBe(5);
    }
    // Bar 1 of the A: B♭∆7 Gm7 | Cm7 F7: Gm7 → Cm7 is not a ii–V (a minor chord, not a dominant); Cm7 F7 is.
    expect(starts).toContain(2);
    expect(starts).not.toContain(1);
  });

  test("the bridge's dominants have no ii–V (D7 G7 C7 F7)", () => {
    const rc = rhythmChanges("Bb");
    const bridge = src(
      rc.bars.slice(16, 24).map((b) => [...b]),
      { tonic: "Bb", mode: "major" },
    );
    expect(twoFiveStarts(chartSlots(bridge))).toEqual([]);
  });
});

describe("checking an analysis bar by bar (Bye Bye Blackbird, F major)", () => {
  const source = analysisSourceOf(blackbird as SongDef);

  test("the song gives a 32-bar chart, every chord of it sounds in Strudel", async () => {
    expect(source.bars).toBe(32);
    const slots = chartSlots(source);
    expect(slots.length).toBe((blackbird as SongDef).answerKey.chords?.length);
    const line = slots.map((s) => s.symbol).join(" ");
    const r = await evalHeadless(`chords: chord("<${line}>").voicing()`, slots.length);
    expect(r.logs.filter((l) => l.includes("unknown chord"))).toEqual([]);
  });

  test("the revealed analysis passes; three other right analyses pass", () => {
    const right = revealedAnalysis(source);
    expect(checkAnalysis(source, right, { formOk: true }).passed).toBe(true);
    // The same with numerals written another way (triads for sevenths, III7 for V7/vi …).
    const slots = chartSlots(source);
    const triads = right.numerals.map((n) => n.replace(/7$/, "").replace(/maj$/, ""));
    expect(checkAnalysis(source, { ...right, numerals: triads }, { formOk: true }).score).toBe(1);
    const slashless = slots.map((s, i) =>
      /\//.test(right.numerals[i] as string)
        ? judgeAlt(s.symbol, right.numerals[i] as string)
        : (right.numerals[i] as string),
    );
    expect(checkAnalysis(source, { ...right, numerals: slashless }, { formOk: true }).score).toBe(1);
    expect(
      checkAnalysis(source, { ...right, numerals: right.numerals.map((n) => ` ${n} `) }, { formOk: true })
        .passed,
    ).toBe(true);
  });

  test("a wrong numeral and a missing bracket mark their bars and name neither answer", () => {
    const right = revealedAnalysis(source);
    const slots = chartSlots(source);
    // Bar 3 is Gm7 C7 in F: write IV for the Gm7 and drop the ii–V's bracket.
    const i = slots.findIndex((s) => s.bar === 3);
    const numerals = [...right.numerals];
    numerals[i] = "IV";
    const brackets = right.brackets.filter((b) => b !== i);
    const c = checkAnalysis(source, { numerals, brackets }, { formOk: true });
    const bar3 = c.bars[2] as (typeof c.bars)[number];
    expect(bar3.ok).toBe(false);
    expect(bar3.notes).toEqual([
      "Bar 3, first chord: that numeral's root isn't this chord's root, counted from F major.",
      "Bar 3: look again for a ii–V moving through this bar.",
    ]);
    for (const n of bar3.notes) expect(n).not.toMatch(/\bii7\b|\bV7\b/);
    expect(c.bars.filter((b) => !b.ok).map((b) => b.bar)).toEqual([3]);
    expect(c.score).toBeCloseTo(31 / 32, 9);
  });

  test("a right-function wrong answer: brackets on every minor-to-dominant pair, numerals right, still fails", () => {
    // Bracketing every minor chord followed by a dominant, whatever the root moves: Am7 D7 is a ii–V of G minor,
    // but Gm7 → Db7 (bar 22–23) is not a ii–V. Here the learner also brackets Am → Abo7 (bar 5).
    const right = revealedAnalysis(source);
    const slots = chartSlots(source);
    const extra = slots.findIndex((s) => s.bar === 5);
    const c = checkAnalysis(source, { ...right, brackets: [...right.brackets, extra] }, { formOk: true });
    expect(c.bars[4]?.notes).toEqual([
      "Bar 5: a bracket here isn't a ii–V (check the two chords' qualities and the root's move).",
    ]);
    expect(c.bracketsRight).toBe(false);
  });

  test("the form map is the song's; without it the stage does not pass", () => {
    const form = gradeFormMap({ sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] }, blackbird as SongDef);
    expect(form.passed).toBe(true);
    const wrong = gradeFormMap(
      { sections: ["A", "B", "A", "B"], bars: [1, 9, 17, 25] },
      blackbird as SongDef,
    );
    expect(wrong.passed).toBe(false);
    const c = checkAnalysis(source, revealedAnalysis(source), { formOk: wrong.passed });
    expect(c.passed).toBe(false);
    expect(c.summary).toBe("32 of 32 bars right; the form map isn't right yet.");
  });

  test("an empty analysis fails with every bar named", () => {
    const c = checkAnalysis(source, { numerals: [], brackets: [] }, { formOk: true });
    expect(c.passed).toBe(false);
    expect(c.bars.every((b) => !b.ok)).toBe(true);
  });
});

/** Another right spelling of an applied numeral: the chord's own degree (V7/ii → VI7). */
function judgeAlt(symbol: string, rn: string): string {
  const alts: Record<string, string> = { D7: "VI7", A7: "III7", E7: "VII7", G7: "II7", C7: "V7" };
  return alts[symbol.replace(/\/.*/, "")] ?? rn;
}
