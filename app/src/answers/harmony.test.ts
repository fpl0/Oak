import { describe, expect, test } from "bun:test";
import { FUNCTION_OPTIONS } from "@oak/content-kit";
import { chordOf } from "@oak/theory";
import {
  buildChord,
  chordParts,
  clearSlot,
  composeChord,
  describeBuilt,
  fillSlot,
  inversionOfParts,
  noteName,
  optionFunction,
  optionShort,
  progressionHits,
  rnHasDegree,
  rnMidis,
  rnSymbol,
  slotLabels,
  voiceChord,
} from "./harmony.ts";

const C = { tonic: "C", mode: "major" } as const;
const F = { tonic: "F", mode: "major" } as const;

describe("chord names: forgiving entry, lead-sheet display", () => {
  test.each([
    ["C", "C"],
    ["Cm", "Cm"],
    ["C°", "C°"],
    ["Co", "C°"],
    ["Cdim", "C°"],
    ["C+", "C+"],
    ["Caug", "C+"],
    ["G/B", "G/B"],
    ["bb", "B♭"],
    ["F#m7b5", "F♯m7♭5"],
  ])("%s reads as %s and round-trips through the picker", (typed, shown) => {
    const p = chordParts(typed);
    expect(p).not.toBeNull();
    expect(composeChord(p as NonNullable<typeof p>)).toBe(shown);
  });
  test("not a chord: null", () => {
    expect(chordParts("")).toBeNull();
    expect(chordParts("H7")).toBeNull();
  });
  test("slash chords name their inversion from the bass", () => {
    expect(inversionOfParts(chordParts("C") as never)).toBe(0);
    expect(inversionOfParts(chordParts("C/E") as never)).toBe(1);
    expect(inversionOfParts(chordParts("C/G") as never)).toBe(2);
    expect(inversionOfParts(chordParts("G7/F") as never)).toBe(3);
    expect(inversionOfParts(chordParts("C/D") as never)).toBeNull();
  });
});

describe("the chord builder reads what was built (the bass decides)", () => {
  test("F A C with F lowest: F major, root position", () => {
    const b = buildChord([65, 69, 72], F);
    expect(b?.names).toEqual(["F4", "A4", "C5"]);
    expect(b?.reading?.leadSheet).toBe("F");
    expect(describeBuilt(b as never, true)).toEqual({
      notes: "F A C, F at the bottom",
      name: "F: F major, root position",
    });
  });
  test("E G C: C/E, first inversion; B D F: B diminished", () => {
    expect(describeBuilt(buildChord([64, 67, 72]) as never, true).name).toBe("C/E: C major, first inversion");
    expect(buildChord([71, 74, 77])?.reading?.leadSheet).toBe("B°");
  });
  test("spelled in the key: B♭ in F, F♯ in D", () => {
    expect(noteName(70, F)).toBe("B♭4");
    expect(noteName(66, { tonic: "D", mode: "major" })).toBe("F♯4");
    expect(noteName(66)).toBe("F♯4");
  });
  test("two notes or a cluster are not named", () => {
    expect(describeBuilt(buildChord([60, 64]) as never, true).name).toMatch(/three notes/);
    expect(describeBuilt(buildChord([60, 62, 64]) as never, true).name).toMatch(/each 3rd/);
    expect(describeBuilt(buildChord([60, 64, 67]) as never, false).name).toBeNull();
  });
});

describe("numerals sound in the key", () => {
  test("voicings: bass below middle C, chord tones from middle C", () => {
    expect(voiceChord(chordOf("G", "maj", "B"))).toEqual([59, 62, 67, 71]);
    expect(rnMidis("IV", F)).toEqual([58, 62, 65, 70]);
    expect(rnMidis("viio", C)).toEqual([59, 62, 65, 71]);
    expect(rnMidis("", C)).toBeNull();
    expect(rnMidis("H", C)).toBeNull();
  });
  test("symbols: IV in F is B♭, V6 in C is G/B", () => {
    expect(rnSymbol("IV", F)).toBe("B♭");
    expect(rnSymbol("V6", C)).toBe("G/B");
    expect(rnSymbol("viio", C)).toBe("B°");
  });
  test("one slot per bar or per half bar; empty slots keep their time", () => {
    const bar = progressionHits(["I", "", "vi", "IV"], C, { bpm: 120 });
    expect(bar.map((h) => [h.slot, h.at])).toEqual([
      [0, 0],
      [2, 4],
      [3, 6],
    ]);
    const half = progressionHits(["I", "V"], C, { bpm: 120, slotsPerBar: 2 });
    expect(half.map((h) => h.at)).toEqual([0, 1]);
  });
});

describe("the RN palette over a known bass (ux §4.5 stage 2)", () => {
  test("a numeral is lit when its chord contains the bass degree", () => {
    // Bass degree 1 (C in C major): I (C E G), IV (F A C) and vi (A C E) contain it; V and ii do not.
    expect(["I", "ii", "iii", "IV", "V", "vi", "viio"].filter((rn) => rnHasDegree(rn, "1", C))).toEqual([
      "I",
      "IV",
      "vi",
    ]);
    // Bass degree 7 (E in F major): iii (A C E), V (C E G) and vii° (E G B♭) contain it; I (F A C) does not.
    expect(["I", "iii", "V", "viio"].filter((rn) => rnHasDegree(rn, "7", F))).toEqual(["iii", "V", "viio"]);
    // In C: ♭VII is B♭ D F (degree ♭7 is its root); V7 is G B D F (degree 4 is its 7th), V alone is not.
    expect(rnHasDegree("bVII", "b7", C)).toBe(true);
    expect(rnHasDegree("V7", "4", C)).toBe(true);
    expect(rnHasDegree("V", "4", C)).toBe(false);
  });
  test("without a key the relation is read in C; unreadable input never dims", () => {
    expect(rnHasDegree("V", "5")).toBe(true);
    expect(rnHasDegree("V", "1")).toBe(false);
    expect(rnHasDegree("V", "")).toBe(true);
    expect(rnHasDegree("nonsense", "1", C)).toBe(true);
  });
});

describe("slot strips", () => {
  test("labels per bar, per half bar, and authored", () => {
    expect(slotLabels(2).map((l) => l.short)).toEqual(["bar 1", "bar 2"]);
    expect(slotLabels(4, { slotsPerBar: 2 }).map((l) => l.spoken)).toEqual([
      "Bar 1, beat 1",
      "Bar 1, beat 3",
      "Bar 2, beat 1",
      "Bar 2, beat 3",
    ]);
    expect(slotLabels(2, { slotsPerBar: 2, beatsPerBar: 3 })[1]?.short).toBe("half 2");
    expect(slotLabels(2, { labels: ["Phrase 1", "Phrase 2"] })[1]?.spoken).toBe("Phrase 2");
  });
  test("short option text and function colours", () => {
    expect(FUNCTION_OPTIONS.map(optionShort)).toEqual(["T", "PD", "D"]);
    expect(optionShort({ id: "PAC", label: "Perfect authentic (V–I, melody on 1)" })).toBe("PAC");
    expect(optionShort({ id: "ct", label: "Chord tone" })).toBe("Chord tone");
    expect(FUNCTION_OPTIONS.map(optionFunction)).toEqual(["T", "PD", "D"]);
    expect(optionFunction({ id: "PAC", label: "x" })).toBeNull();
  });
  test("filling moves to the next empty slot; Backspace clears the selected or the last", () => {
    let v = fillSlot([], 4, "T", null);
    expect(v).toEqual({ value: ["T", "", "", ""], next: 1 });
    v = fillSlot(v.value, 4, "D", 3);
    expect(v).toEqual({ value: ["T", "", "", "D"], next: 1 });
    expect(fillSlot(["T", "PD", "D", "T"], 4, "D", null).value).toEqual(["T", "PD", "D", "D"]);
    expect(clearSlot(["T", "PD", "", ""], 4, null)).toEqual({ value: ["T", "", "", ""], at: 1 });
    expect(clearSlot(["T", "PD", "", ""], 4, 0)).toEqual({ value: ["", "PD", "", ""], at: 0 });
    expect(clearSlot(["", "", "", ""], 4, null).value).toEqual(["", "", "", ""]);
  });
});
