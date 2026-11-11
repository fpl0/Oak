import { describe, expect, test } from "bun:test";
import { normalizeText } from "@oak/theory";
import {
  degreeDisplay,
  degreeSpoken,
  displayRn,
  formatNumber,
  keyName,
  keySpoken,
  midiRange,
  parseDegreeList,
  parseDegreeText,
  parseNumberText,
  readsAs,
  spokenInterval,
  spokenNote,
} from "./normalize.ts";

describe("readsAs: forgiving input, canonical display", () => {
  const ok = (kind: Parameters<typeof readsAs>[0], text: string) => {
    const r = readsAs(kind, text);
    if (r.state !== "ok") throw new Error(`${kind} ${text}: ${r.state}`);
    return r;
  };

  test("note names: words, glyphs, lower case, octaves", () => {
    expect(ok("note", "e flat")).toMatchObject({ canonical: "Eb", display: "E♭", spoken: "E flat" });
    expect(ok("note", "f#4")).toMatchObject({ canonical: "F#4", display: "F♯4", spoken: "F sharp 4" });
    expect(ok("note", " B♭ ")).toMatchObject({ canonical: "Bb", display: "B♭" });
    expect(ok("note", "c-sharp")).toMatchObject({ display: "C♯" });
    expect(ok("note", "G")).toMatchObject({ display: "G", spoken: "G" });
    expect(readsAs("note", "H")).toMatchObject({ state: "unknown" });
  });

  test("chord symbols print as lead sheets", () => {
    expect(ok("chord", "cmaj7")).toMatchObject({ canonical: "C^7", display: "Cmaj7" });
    expect(ok("chord", "CΔ7")).toMatchObject({ canonical: "C^7" });
    expect(ok("chord", "Am7/G")).toMatchObject({ display: "Am7/G", spoken: "A minor 7 over G" });
    expect(ok("chord", "Bbmaj7")).toMatchObject({ display: "B♭maj7", spoken: "B flat major 7" });
    expect(ok("chord", "F#m7b5")).toMatchObject({ display: "F♯m7♭5", spoken: "F sharp minor 7 flat 5" });
    expect(readsAs("chord", "Q7")).toMatchObject({ state: "unknown" });
  });

  test("Roman numerals: degree sign and accidentals", () => {
    expect(ok("rn", "vii°")).toMatchObject({ canonical: "viio", display: "vii°" });
    expect(ok("rn", "viio7")).toMatchObject({ display: "vii°7" });
    expect(ok("rn", "bVII")).toMatchObject({ display: "♭VII" });
    expect(ok("rn", "V7/V")).toMatchObject({ display: "V7/V" });
    expect(ok("rn", "V6/5")).toMatchObject({ canonical: "V65" });
    expect(displayRn("viio/V")).toBe("vii°/V");
    expect(readsAs("rn", "VIII")).toMatchObject({ state: "unknown" });
  });

  test("intervals: short names and words", () => {
    expect(ok("interval", "major 3rd")).toMatchObject({ canonical: "M3", spoken: "major third" });
    expect(ok("interval", "perfect fifth")).toMatchObject({ canonical: "P5", spoken: "perfect fifth" });
    expect(ok("interval", "tritone")).toMatchObject({ canonical: "TT", spoken: "tritone" });
    expect(ok("interval", "octave")).toMatchObject({ canonical: "P8", spoken: "octave" });
    expect(spokenInterval("m6")).toBe("minor sixth");
    expect(spokenInterval("A4")).toBe("augmented fourth");
  });

  test("keys", () => {
    expect(ok("key", "f# minor")).toMatchObject({ canonical: "F# minor", display: "F♯ minor" });
    expect(ok("key", "Bbm")).toMatchObject({ display: "B♭ minor", spoken: "B flat minor" });
    expect(ok("key", "D")).toMatchObject({ display: "D major" });
  });

  test("free text is trimmed and lower-cased exactly as the grader does", () => {
    expect(ok("free", "  Back   Beat ")).toMatchObject({ canonical: "back beat" });
    expect(readsAs("free", "   ")).toEqual({ state: "empty" });
  });

  test("the preview uses the grader's own normaliser", () => {
    for (const [kind, text] of [
      ["note", "e♭"],
      ["chord", "dm7"],
      ["rn", "ii65"],
      ["interval", "min 3"],
      ["key", "c minor"],
    ] as const) {
      const r = readsAs(kind, text);
      expect(r.state === "ok" ? r.canonical : null).toBe(normalizeText(kind, text));
    }
  });

  test("spoken notes survive odd input", () => {
    expect(spokenNote("X")).toBe("X");
  });
});

describe("parseNumberText", () => {
  test("plain, decimal comma, units, fractions, words", () => {
    expect(parseNumberText("120")).toBe(120);
    expect(parseNumberText(" 120 BPM ")).toBe(120);
    expect(parseNumberText("1,5")).toBe(1.5);
    expect(parseNumberText(".5")).toBe(0.5);
    expect(parseNumberText("-2")).toBe(-2);
    expect(parseNumberText("−3 semitones")).toBe(-3);
    expect(parseNumberText("1/3")).toBeCloseTo(1 / 3, 10);
    expect(parseNumberText("⅓")).toBeCloseTo(1 / 3, 10);
    expect(parseNumberText("1 1/2")).toBe(1.5);
    expect(parseNumberText("2 bars")).toBe(2);
    expect(parseNumberText("three")).toBe(3);
    expect(parseNumberText("700 cents")).toBe(700);
  });
  test("rejects what is not a number", () => {
    for (const t of ["", "abc", "1/0", "1e5", "12 apples", "--1", "1.2.3"])
      expect(parseNumberText(t)).toBeNull();
  });
  test("formatNumber", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(96)).toBe("96");
    expect(formatNumber(1 / 3)).toBe("0.333");
  });
});

describe("scale degrees", () => {
  test("numbers, accidentals, words and movable-do syllables", () => {
    expect(parseDegreeText("3")).toBe("3");
    expect(parseDegreeText("b3")).toBe("b3");
    expect(parseDegreeText("♭7")).toBe("b7");
    expect(parseDegreeText("flat 6")).toBe("b6");
    expect(parseDegreeText("sharp four")).toBe("#4");
    expect(parseDegreeText("Sol")).toBe("5");
    expect(parseDegreeText("so")).toBe("5");
    expect(parseDegreeText("me")).toBe("b3");
    expect(parseDegreeText("ti")).toBe("7");
    expect(parseDegreeText("8")).toBeNull();
    expect(parseDegreeText("b4")).toBeNull();
    expect(parseDegreeText("#3")).toBeNull();
  });
  test("lists", () => {
    expect(parseDegreeList("1 3 5")).toEqual(["1", "3", "5"]);
    expect(parseDegreeList("1, flat 3, 5")).toEqual(["1", "b3", "5"]);
    expect(parseDegreeList("do mi sol")).toEqual(["1", "3", "5"]);
    expect(parseDegreeList("1 x 5")).toBeNull();
  });
  test("display and speech", () => {
    expect(degreeDisplay("b7")).toBe("♭7");
    expect(degreeDisplay("#4")).toBe("♯4");
    expect(degreeSpoken("b7")).toBe("flat 7");
  });
});

describe("keyboard names and ranges", () => {
  test("MIDI 60 is C4; black keys carry both spellings", () => {
    expect(keyName(60)).toBe("C4");
    expect(keyName(61)).toBe("C♯/D♭4");
    expect(keyName(70, "flat")).toBe("B♭4");
    expect(keyName(59)).toBe("B3");
    expect(keySpoken(66)).toBe("F sharp or G flat 4");
    expect(keySpoken(69)).toBe("A 4");
  });
  test("midiRange orders its bounds", () => {
    expect(midiRange(["C4", "C5"])).toEqual([60, 72]);
    expect(midiRange(["A4", "F3"])).toEqual([53, 69]);
    expect(() => midiRange(["X", "C5"])).toThrow();
  });
});
