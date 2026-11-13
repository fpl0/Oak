import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { chordOf, toLeadSheet } from "./chords.ts";
import { chordOfRoman, romanText } from "./harmony.ts";
import { keySignature, spellMidi } from "./scales.ts";
import {
  approachKind,
  approachTones,
  BLUE_NOTES,
  bassRole,
  blueNoteOf,
  bluesKey,
  degreeLens,
  dominantSeventh,
  isDominantSeventhPcs,
  isDominantSeventhSymbol,
  keyTwins,
  minorDegrees,
  minorFormOf,
  minorKey,
  minorKeyChords,
  minorScaleNotes,
  pentatonicKey,
  rootFiveOctave,
  scaleDegrees,
  schemaChords,
  spellBlueNote,
  twelveBarChords,
  twelveBarFormOf,
  twelveBarPlan,
} from "./wave5.ts";

const Am: KeySpec = { tonic: "A", mode: "minor" };
const C: KeySpec = { tonic: "C", mode: "major" };
const sym = (cs: { symbol: string }[]) => cs.map((c) => c.symbol);

describe("minor", () => {
  test("three forms of A minor, spelled one letter each", () => {
    expect(minorScaleNotes("A")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(minorScaleNotes("A", "harmonic")).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
    expect(minorScaleNotes("A", "melodic")).toEqual(["A", "B", "C", "D", "E", "F#", "G#"]);
    expect(minorScaleNotes("C", "harmonic")).toEqual(["C", "D", "Eb", "F", "G", "Ab", "B"]);
    expect(minorFormOf(minorKey("D", "melodic"))).toBe("melodic");
    expect(minorFormOf(C)).toBeNull();
  });
  test("degrees: ♭3 ♭6 ♭7 lowered, raised 6 and 7, do-based syllables", () => {
    const nat = minorDegrees("natural");
    expect(nat.map((d) => d.degree)).toEqual(["1", "2", "b3", "4", "5", "b6", "b7"]);
    expect(nat.map((d) => d.syllable)).toEqual(["do", "re", "me", "fa", "sol", "le", "te"]);
    expect(nat.filter((d) => d.lowered).map((d) => d.degree)).toEqual(["b3", "b6", "b7"]);
    const mel = minorDegrees("melodic");
    expect(mel.filter((d) => d.raised).map((d) => `${d.degree}:${d.syllable}`)).toEqual(["6:la", "7:ti"]);
    expect(minorDegrees("harmonic").map((d) => d.n)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  test("relative and parallel keys", () => {
    expect(keyTwins(C)).toEqual({ relative: Am, parallel: { tonic: "C", mode: "minor" } });
    expect(keyTwins(minorKey("E", "harmonic"))).toEqual({
      relative: { tonic: "G", mode: "major" },
      parallel: { tonic: "E", mode: "major" },
    });
  });
  test("minor key chords: natural i ii° III iv v VI VII, harmonic V and vii°", () => {
    expect(sym(minorKeyChords("A"))).toEqual(["Am", "B°", "C", "Dm", "Em", "F", "G"]);
    expect(minorKeyChords("A").map((c) => c.rn)).toEqual(["i", "iio", "III", "iv", "v", "VI", "VII"]);
    const h = minorKeyChords("A", { form: "harmonic" });
    expect(sym(h)).toEqual(["Am", "B°", "C", "Dm", "E", "F", "G♯°"]);
    expect(h.map((c) => c.rn)).toEqual(["i", "iio", "III", "iv", "V", "VI", "viio"]);
    expect(sym(minorKeyChords("A", { seventh: true, form: "harmonic" }))).toEqual([
      "Am7",
      "Bm7♭5",
      "Cmaj7",
      "Dm7",
      "E7",
      "Fmaj7",
      "G♯°7",
    ]);
  });
  test("numerals in minor both ways", () => {
    for (const [rn, s] of [
      ["i", "Am"],
      ["iio", "B°"],
      ["III", "C"],
      ["iv", "Dm"],
      ["v", "Em"],
      ["V", "E"],
      ["VI", "F"],
      ["VII", "G"],
      ["viio", "G♯°"],
    ] as const) {
      const c = chordOfRoman(rn, Am);
      expect(c && toLeadSheet(c)).toBe(s);
      expect(romanText(c as NonNullable<typeof c>, Am)).toBe(rn);
    }
  });
  test("schema.aeolian and the Andalusian cadence in a key", () => {
    expect(schemaChords("schema.aeolian", Am).map(toLeadSheet)).toEqual(["Am", "F", "C", "G"]);
    expect(schemaChords("schema.andalusian", { tonic: "D", mode: "minor" }).map(toLeadSheet)).toEqual([
      "Dm",
      "C",
      "B♭",
      "A",
    ]);
  });
  test("minor key signatures", () => {
    expect(keySignature(Am).accidentals).toBe(0);
    expect(keySignature({ tonic: "E", mode: "minor" }).notes).toEqual(["F#"]);
    expect(keySignature({ tonic: "C", mode: "minor" }).notes).toEqual(["Bb", "Eb", "Ab"]);
    // The raised 7 is an accidental, never part of the signature.
    expect(keySignature(minorKey("A", "harmonic")).accidentals).toBe(0);
    expect(spellMidi(68, { key: Am }).name).toBe("G#4");
    expect(spellMidi(66, { key: Am }).name).toBe("F#4");
  });
  test("the degree lens in minor", () => {
    expect(degreeLens(60, Am)).toEqual({ degree: "♭3", syllable: "me" });
    expect(degreeLens(68, Am)).toEqual({ degree: "7", syllable: "ti" });
    expect(degreeLens(65, Am)).toEqual({ degree: "♭6", syllable: "le" });
  });
});

describe("pentatonic and blues", () => {
  test("scales", () => {
    expect(scaleDegrees(pentatonicKey("C", "major"))).toEqual(["1", "2", "3", "5", "6"]);
    expect(scaleDegrees(pentatonicKey("A", "minor"))).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(scaleDegrees(bluesKey("C"))).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
  });
  test("blue notes against a major key, with names and syllables", () => {
    expect(BLUE_NOTES.map((b) => b.syllable)).toEqual(["me", "se", "te"]);
    expect(blueNoteOf(63, C)?.degree).toBe("b3");
    expect(blueNoteOf(66, C)?.name).toBe("flat five");
    expect(blueNoteOf(70, C)?.degree).toBe("b7");
    expect(blueNoteOf(64, C)).toBeNull();
  });
  test("blue notes spelled by direction", () => {
    expect(spellBlueNote(66, C, 1).name).toBe("F#4");
    expect(spellBlueNote(66, C, -1).name).toBe("Gb4");
    expect(spellBlueNote(66, C).name).toBe("Gb4");
    expect(spellBlueNote(63, C).name).toBe("Eb4");
  });
});

describe("dominant seventh", () => {
  test("from a symbol", () => {
    expect(isDominantSeventhSymbol("C7")).toBe(true);
    expect(isDominantSeventhSymbol("G7/B")).toBe(true);
    expect(isDominantSeventhSymbol("Cmaj7")).toBe(false);
    expect(isDominantSeventhSymbol("Cm7")).toBe(false);
    expect(isDominantSeventhSymbol("C")).toBe(false);
  });
  test("from a pitch-class set", () => {
    expect(isDominantSeventhPcs([7, 11, 2, 5])).toBe(true);
    expect(isDominantSeventhPcs([11, 2, 5, 7], 11)).toBe(true);
    expect(isDominantSeventhPcs([0, 4, 7, 11])).toBe(false);
    expect(isDominantSeventhPcs([0, 4, 7])).toBe(false);
    expect(toLeadSheet(dominantSeventh("G"))).toBe("G7");
  });
});

describe("the 12-bar form", () => {
  test("plans", () => {
    expect(twelveBarPlan({ variant: "standard", turnaround: false })).toEqual([
      "I7",
      "I7",
      "I7",
      "I7",
      "IV7",
      "IV7",
      "I7",
      "I7",
      "V7",
      "IV7",
      "I7",
      "I7",
    ]);
    const qc = twelveBarPlan({ variant: "quick-change", turnaround: true });
    expect(qc[1]).toBe("IV7");
    expect(qc[11]).toBe("V7");
  });
  test("chords in any key, read as I7 not V7/IV", () => {
    expect(twelveBarChords("F", { variant: "quick-change", turnaround: true }).map(toLeadSheet)).toEqual([
      "F7",
      "B♭7",
      "F7",
      "F7",
      "B♭7",
      "B♭7",
      "F7",
      "F7",
      "C7",
      "B♭7",
      "F7",
      "C7",
    ]);
    expect(romanText(chordOf("C", "7"), bluesKey("C"))).toBe("I7");
  });
  test("detects the variant", () => {
    const std = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 0];
    expect(twelveBarFormOf(std)).toEqual({ variant: "standard", turnaround: false });
    expect(twelveBarFormOf([0, 5, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7])).toEqual({
      variant: "quick-change",
      turnaround: true,
    });
    expect(twelveBarFormOf(std.slice(0, 8))).toBeNull();
    expect(twelveBarFormOf([0, 0, 0, 0, 7, 5, 0, 0, 7, 5, 0, 0])).toBeNull();
  });
});

describe("bass lines", () => {
  const Cmaj = chordOf("C", "maj");
  const G = chordOf("G", "maj");
  test("root, fifth, octave", () => {
    expect(rootFiveOctave(Cmaj, 36)).toEqual({ root: 36, fifth: 43, octave: 48 });
    expect(bassRole(36, Cmaj)).toBe("root");
    expect(bassRole(43, Cmaj)).toBe("fifth");
    expect(bassRole(48, Cmaj, { rootMidi: 36 })).toBe("octave");
    expect(bassRole(40, Cmaj)).toBe("third");
  });
  test("approach tones to the next root", () => {
    expect(approachKind(42, G, C)).toBe("chromatic-below");
    expect(approachKind(44, G, C)).toBe("chromatic-above");
    expect(approachKind(41, G, C)).toBe("diatonic-below");
    expect(approachKind(45, G, C)).toBe("diatonic-above");
    expect(approachKind(38, G, C)).toBe("dominant");
    expect(bassRole(42, Cmaj, { nextChord: G, beforeChange: true, key: C })).toBe("approach");
    expect(bassRole(42, Cmaj, { nextChord: G, beforeChange: false, key: C })).toBe("other");
    const a = approachTones(43, C);
    expect(a["chromatic-below"].name).toBe("F#2");
    expect(a["diatonic-below"].name).toBe("F2");
    expect(a["diatonic-above"].name).toBe("A2");
    expect(a.dominant.name).toBe("D2");
  });
});
