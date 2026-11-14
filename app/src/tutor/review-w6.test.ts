// Wave 6 review (review:surfaces): what an adversarial pass over the tutor's applied-chord tokens found.
// - vii°7/V was described as "the V of the chord it leans into": it is the leading-tone chord of its target.
// - A chord on a double-sharp or double-flat root (F𝄪°7, B𝄫maj7) said it was "stacked on F♯" / "on B♭".
// - ii⌀7 written with the diameter sign was not a numeral chip (ø was): both spellings are one numeral.
// - Seven sharps: every applied and borrowed numeral is spelled in C♯ major (D♯7, F♯♯°7, A, B, E, F♯m).
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { parseMarkdown, tokensIn } from "./markdown.ts";
import { describeToken, type TokenContext } from "./music-tokens.ts";

const CS: KeySpec = { tonic: "C#", mode: "major" };
const ctx = { terms: [], introduced: null, tools: [], unlocked: null, key: CS } as unknown as TokenContext;
const rn = (value: string) => describeToken({ kind: "rn", value, raw: `[[rn:${value}]]` } as never, ctx);
const chord = (value: string) =>
  describeToken({ kind: "chord", value, raw: `[[chord:${value}]]` } as never, ctx);

describe("applied and borrowed numerals in seven sharps", () => {
  test("each says what it is and the chord it is in C♯ major", () => {
    const want: [string, string, string][] = [
      ["V7/V", "the V of the chord it leans into", "D♯7"],
      ["V7/ii", "the V of the chord it leans into", "A♯7"],
      ["V7/vi", "the V of the chord it leans into", "E♯7"],
      ["vii°7/V", "the diminished chord a half step below the chord it leans into (its vii°)", "F♯♯°7"],
      ["bVI", "borrowed", "A"],
      ["bVII", "borrowed", "B"],
      ["bIII", "borrowed", "E"],
      ["iv", "borrowed", "F♯m"],
    ];
    for (const [v, words, sym] of want) {
      const i = rn(v);
      expect(i?.title, v).toContain(words);
      expect(i?.title, v).toContain(`In C♯ major it is ${sym}.`);
      expect(i?.lens?.id, v).toBe("romanNumerals");
    }
    expect(rn("vii°7/V")?.title).not.toContain("the V of");
  });
  test("a double-sharp or double-flat root is named whole", () => {
    expect(chord("F##o7")?.title).toContain("stacked on F♯♯.");
    expect(chord("Bbbmaj7")?.title).toContain("stacked on B♭♭.");
    expect(chord("D#7")?.title).toContain("stacked on D♯. In C♯ major it is V7/V.");
  });
});

describe("hostile and dense tutor text", () => {
  test("ii⌀7 and iiø7 are one numeral; code spans, empty and broken tokens stay text", () => {
    const md =
      "Try [[rn:ii⌀7]] [[rn:iiø7]] then [[rn:V7/V]][[rn:V7/V]] **[[rn:♭VI]]** `[[rn:iv]]` [[rn:]] [[deg:#4/]] [[rn:<b>V</b>]]";
    const toks = tokensIn(parseMarkdown(md));
    expect(toks.map((t) => `${t.kind}:${t.value}`)).toEqual([
      "rn:iiø7",
      "rn:iiø7",
      "rn:V7/V",
      "rn:V7/V",
      "rn:bVI",
    ]);
  });
});
