// Wave 7 review (review:surfaces): what the staff and the chart DRAW for the advanced tracks' chord symbols, read back
// through abcjs's own chord translation (the function its renderer applies to every symbol), not only its parser.
// - A 6/9 chord was drawn "C6": abcjs reads a "/" as the start of a bass note and cuts what follows when it is none.
// - A numeral's altered tension stayed ASCII ("V7b9") under the jazz symbol's glyph ("G7♭9").
// - The chord chart ignored the learner's jazz glyphs while the staff and the chord band used them.
import { describe, expect, test } from "bun:test";
import { METERS } from "@oak/theory";
import translateChordJs from "abcjs/src/write/creation/translate-chord.js";
import { abcChordText, toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { romanDisplay } from "./theory-port.ts";
import type { NotationInput } from "./types.ts";
import { chartAbc, chartLayout } from "./wave5.ts";
import { chordSymbolText } from "./wave7.ts";

const drawn = (name: string): string => translateChordJs(name, false, false);
/** The chord symbols written into an ABC string, in order. */
const symbolsIn = (abc: string): string[] =>
  [...abc.matchAll(/"([^"^_<>@][^"]*)"/g)].map((m) => m[1] as string).filter((t) => !t.startsWith("Swing"));

const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const SLASHED = ["69", "m7/G", "7/E", "^7/A", "69/E"];

describe("chord symbols as abcjs draws them", () => {
  test("6/9 in every root and both styles keeps its 9 on the staff; a real bass note stays a bass note", () => {
    for (const style of ["lead-sheet", "jazz"] as const)
      for (const root of ROOTS)
        for (const q of SLASHED) {
          const symbol = `${root}${q}`;
          const want = chordSymbolText(symbol, style);
          const written = abcChordText(want);
          // What the learner sees: abcjs's translation of what Oak wrote, with the division slash read as "/".
          expect(drawn(written).replace(/∕/g, "/")).toBe(want);
        }
    // Before the fix: the text as it was written.
    expect(drawn("C6/9")).toBe("C6");
    expect(abcChordText("C7/E")).toBe("C7/E");
    expect(abcChordText("C/B♭")).toBe("C/B♭");
    expect(abcChordText("D♭6/9/F")).toBe("D♭6∕9/F");
  });

  test("a 64-bar chart of altered chords: every symbol on the staff is the symbol of its bar", () => {
    const quals = [
      "m7b5",
      "7b9",
      "^7#11",
      "7#9",
      "m9",
      "13",
      "7alt",
      "m^7",
      "7b13",
      "69",
      "7sus",
      "o7",
      "^9",
      "m11",
      "7#11",
      "m6",
    ];
    const symbols = Array.from({ length: 64 }, (_, i) => `${ROOTS[i % 13]}${quals[i % 16]}`);
    for (const style of ["lead-sheet", "jazz"] as const) {
      const input: NotationInput = {
        events: [],
        meter: METERS["4/4"],
        key: null,
        bars: 64,
        staff: "rhythm",
        chords: symbols.map((symbol, bar) => ({ bar, beat: 1, symbol })),
        chordStyle: style,
      };
      const abc = toAbc(buildScore(input)).abc;
      const seen = symbolsIn(abc).map((t) => drawn(t).replace(/∕/g, "/"));
      expect(seen).toEqual(symbols.map((s) => chordSymbolText(s, style)));
    }
  });
});

describe("Roman numerals with altered tensions", () => {
  test("the figure's ♭ and ♯ are glyphs; the numeral's own accidental and the diminished signs as before", () => {
    expect(romanDisplay("V7b9")).toBe("V7♭9");
    expect(romanDisplay("Imaj7#11")).toBe("Imaj7♯11");
    expect(romanDisplay("V7#9b13")).toBe("V7♯9♭13");
    expect(romanDisplay("bVII7#11")).toBe("♭VII7♯11");
    expect(romanDisplay("iih7")).toBe("iiø7");
    expect(romanDisplay("viio7")).toBe("vii°7");
    expect(romanDisplay("V7/V")).toBe("V7/V");
    expect(romanDisplay("V7alt")).toBe("V7alt");
  });
});

describe("the chord chart in the learner's chord style", () => {
  const chords = [
    { bar: 0, beat: 1, symbol: "Dm7" },
    { bar: 1, beat: 1, symbol: "G7b9" },
    { bar: 2, beat: 1, symbol: "C^7" },
    { bar: 3, beat: 1, symbol: "Bbm7b5" },
    { bar: 3, beat: 3, symbol: "Eb69" },
  ];
  const input = { chords, bars: 4, meter: METERS["4/4"], key: null };
  test("jazz glyphs when asked; lead-sheet by default (unchanged)", () => {
    const texts = (l: ReturnType<typeof chartLayout>) =>
      l.lines.flat().flatMap((b) => b.chords.map((c) => c.text));
    expect(texts(chartLayout({ ...input, chordStyle: "jazz" }))).toEqual([
      "D–7",
      "G7♭9",
      "C∆7",
      "B♭ø7",
      "E♭6/9",
    ]);
    expect(texts(chartLayout(input))).toEqual(["Dm7", "G7♭9", "Cmaj7", "B♭m7♭5", "E♭6/9"]);
  });
  test("the engraved chart writes the same symbols, the 6/9 kept whole", () => {
    const seen = symbolsIn(chartAbc({ ...input, chordStyle: "jazz" }).abc).map((t) =>
      drawn(t).replace(/∕/g, "/"),
    );
    expect(seen).toEqual(["D–7", "G7♭9", "C∆7", "B♭ø7", "E♭6/9"]);
  });
});
