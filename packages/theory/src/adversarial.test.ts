// Adversarial theory review: enharmonic keys, minor with raised 6/7, mixture, applied chords, inversions,
// cadences, chromatic step strings. Expected values are conservatory facts; Strudel facts are executed.
// `regression:` tests failed before their fix.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { midisOf } from "@oak/grader/testing";
import {
  chordNotes,
  classifyCadence,
  formatRN,
  functionOf,
  intervalBetween,
  invertInterval,
  keySignature,
  normalizeText,
  parseChordSymbol,
  parseChordWithBass,
  parseRN,
  parseScaleName,
  relativeKey,
  rnToChord,
  romanOf,
  scaleNotes,
  spellMidi,
  stepToMidi,
  strudelStep,
  toLeadSheet,
} from "./index.ts";

setDefaultTimeout(60_000);
const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });
const chord = (s: string) => {
  const c = parseChordWithBass(s) ?? parseChordSymbol(s);
  if (!c) throw new Error(`bad chord ${s}`);
  return c;
};
const rn = (c: string, k: KeySpec, next?: string) =>
  formatRN(romanOf(chord(c), k, next ? chord(next) : undefined));

describe("enharmonic and extreme keys", () => {
  test("F♯ and G♭ major, C♭ major, A♭ and D♯ minor are spelled one letter per degree", () => {
    expect(scaleNotes(K("F#"))).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
    expect(scaleNotes(K("Gb"))).toEqual(["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"]);
    expect(scaleNotes(K("Cb"))).toEqual(["Cb", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"]);
    expect(scaleNotes(K("Ab", "minor"))).toEqual(["Ab", "Bb", "Cb", "Db", "Eb", "Fb", "Gb"]);
    expect(scaleNotes(K("G#", "harmonic minor"))).toEqual(["G#", "A#", "B", "C#", "D#", "E", "F##"]);
    expect(keySignature(K("Cb")).accidentals).toBe(-7);
    expect(keySignature(K("D#", "minor")).accidentals).toBe(6);
    expect(relativeKey(K("Cb"))).toEqual(K("Ab", "minor"));
    expect(relativeKey(K("D#", "minor"))).toEqual(K("F#"));
  });
  test("spelling from context: E♯ in C♯ major, C♭ in G♭, F♭ in C♭, B♯ in C♯ (octave from the letter)", () => {
    expect(spellMidi(65, { key: K("C#") }).name).toBe("E#4");
    expect(spellMidi(71, { key: K("Gb") }).name).toBe("Cb5");
    expect(spellMidi(64, { key: K("Cb") }).name).toBe("Fb4");
    expect(spellMidi(60, { key: K("C#") }).name).toBe("B#3");
    expect(spellMidi(68, { key: K("A", "minor") }).name).toBe("G#4");
    expect(spellMidi(73, { key: K("D", "minor") }).name).toBe("C#5");
    expect(spellMidi(68, { key: K("C"), chord: chord("Ab") }).name).toBe("Ab4");
    expect(spellMidi(68, { key: K("A", "minor"), chord: chord("E7") }).name).toBe("G#4");
  });
  test("intervals are named by letters, not semitones", () => {
    expect(intervalBetween("C4", "F#4")).toBe("A4");
    expect(intervalBetween("C4", "Gb4")).toBe("d5");
    expect(intervalBetween("B#3", "C4")).toBe("d2");
    expect(intervalBetween("Cb4", "C4")).toBe("A1");
    expect(intervalBetween("C4", "Bbb4")).toBe("d7");
    expect(intervalBetween("E4", "C5")).toBe("m6");
    expect(invertInterval("A4")).toBe("d5");
    expect(invertInterval("M9")).toBe("m7");
  });
  test("chord spelling in flat keys keeps letters: G♭m7 has B𝄫 and F♭; A♭7♭9 has B𝄫", () => {
    expect(chordNotes(chord("Gbm7"))).toEqual(["Gb", "Bbb", "Db", "Fb"]);
    expect(chordNotes(chord("Ab7b9"))).toEqual(["Ab", "C", "Eb", "Gb", "Bbb"]);
    expect(chordNotes(chord("Cbaug"))).toEqual(["Cb", "Eb", "G"]);
    expect(toLeadSheet(chord("Dm/F"))).toBe("Dm/F");
  });
});

describe("Roman numerals", () => {
  test("regression: a °7 chord on a root other than the leading tone is applied, even in minor", () => {
    // D♯ F♯ A C in C♯ minor: the C is not the raised 7th B♯; the chord leads to E (III).
    expect(rn("D#o7", K("C#", "minor"))).toBe("viio7/III");
    expect(rn("Bo7", K("A", "minor"))).toBe("viio7/III");
    expect(rn("D#o7", K("A", "minor"))).toBe("viio7/V");
    expect(functionOf(romanOf(chord("D#o7"), K("C#", "minor")), K("C#", "minor"))).toBe("chromatic");
    // The real vii°7 of each key stays diatonic and dominant.
    expect(rn("B#o7", K("C#", "minor"))).toBe("viio7");
    expect(rn("G#o7", K("A", "minor"))).toBe("viio7");
    expect(functionOf(romanOf(chord("G#o7"), K("A", "minor")), K("A", "minor"))).toBe("D");
    // ii° (triad) and iiø7 are diatonic in minor.
    expect(rn("D#o", K("C#", "minor"))).toBe("iio");
    expect(rn("Bm7b5", K("A", "minor"))).toBe("iio7".replace("o", "ø"));
  });
  test("minor with raised 6 and 7: V, vii°, IV (Dorian 6) and the natural VII", () => {
    expect(rn("E", K("A", "minor"))).toBe("V");
    expect(rn("Em", K("A", "minor"))).toBe("v");
    expect(rn("G#o", K("A", "minor"))).toBe("viio");
    expect(rn("D", K("A", "minor"))).toBe("IV");
    expect(rn("G", K("A", "minor"))).toBe("VII");
    expect(rn("A", K("A", "minor"))).toBe("I");
    expect(rn("Bb", K("A", "minor"))).toBe("bII");
  });
  test("mixture and Neapolitan in major: iv, bVI, bVII, bIII, bII6", () => {
    expect(["Fm", "Ab", "Bb", "Eb", "Db/F"].map((c) => rn(c, K("C")))).toEqual([
      "iv",
      "bVI",
      "bVII",
      "bIII",
      "bII6",
    ]);
    expect(rn("Cb", K("Gb"))).toBe("IV");
    expect(rn("Fb", K("Gb"))).toBe("bVII");
  });
  test("applied chords resolve: V7/V V7/ii V7/vi vii°7/V; V7/IV needs a resolution to be read as applied", () => {
    expect(rn("D7", K("C"), "G")).toBe("V7/V");
    expect(rn("A7", K("C"), "Dm")).toBe("V7/ii");
    expect(rn("E7", K("C"), "Am")).toBe("V7/vi");
    expect(rn("F#o7", K("C"), "G")).toBe("viio7/V");
    expect(rn("Ab7", K("Gb"), "Db")).toBe("V7/V");
    expect(rn("C7", K("C"), "F")).toBe("V7/IV");
  });
  test("inversion figures: triads 6 64, sevenths 65 43 42 (also ø and °7)", () => {
    expect(
      ["C/E", "C/G", "G7/B", "G7/D", "G7/F", "Bm7b5/D", "G#o7/D"].map((c) =>
        rn(c, c.startsWith("G#") ? K("A", "minor") : K("C")),
      ),
    ).toEqual(["I6", "I64", "V65", "V43", "V42", "viiø65", "viio43"]);
  });
  test("case is computed from quality: ii and iv are lower case, I+ and V7sus4 upper", () => {
    expect(rn("Dm", K("C"))).toBe("ii");
    expect(rn("Caug", K("C"))).toBe("I+");
    expect(rn("G7sus4", K("C"))).toBe("V7sus4");
    expect(rn("Bo", K("C"))).toBe("viio");
  });
  test("parse/build round trip in sharp and flat minor keys", () => {
    for (const k of [K("C#", "minor"), K("Eb", "minor"), K("G#", "minor")]) {
      for (const t of ["i", "iio", "III", "iv", "V7", "VI", "VII", "viio7", "V7/III", "V42", "iiø65"]) {
        const parsed = parseRN(t, k);
        expect(parsed).not.toBeNull();
        const c = rnToChord(parsed as NonNullable<typeof parsed>, k);
        expect(
          formatRN(romanOf(c, k, t === "V7/III" ? rnToChord(parseRN("III", k) as never, k) : undefined)),
        ).toBe(t);
      }
    }
  });
});

describe("cadence edge cases", () => {
  const cad = (a: string, b: string, k: KeySpec, o = {}) =>
    classifyCadence(parseRN(a, k) as never, parseRN(b, k) as never, k, o);
  test("PAC, IAC (inversion, soprano, vii°), HC, PC, DC, bVII-I, Picardy", () => {
    expect(cad("V7", "I", K("C"))).toBe("PAC");
    expect(cad("V65", "I", K("C"))).toBe("IAC");
    expect(cad("V", "I6", K("C"))).toBe("IAC");
    expect(cad("V", "I", K("C"), { melodyOnTonic: false })).toBe("IAC");
    expect(cad("viio7", "i", K("A", "minor"))).toBe("IAC");
    expect(cad("I64", "V", K("C"))).toBe("HC");
    expect(cad("iv6", "V", K("A", "minor"))).toBe("HC");
    expect(cad("iv", "i", K("A", "minor"))).toBe("PC");
    expect(cad("V", "vi", K("C"))).toBe("DC");
    expect(cad("V", "VI", K("A", "minor"))).toBe("DC");
    expect(cad("bVII", "I", K("C"))).toBe("bVII-I");
    expect(cad("V", "I", K("A", "minor"))).toBe("PAC");
    expect(cad("v", "i", K("A", "minor"))).toBe("none");
  });
});

describe("chromatic step strings, against Strudel", () => {
  test('raised 6 and 7 in minor are "5#" and "6#"; ♯4 is "3#", never "4b"; Strudel agrees', async () => {
    const am = K("A", "minor");
    expect(strudelStep("6", am)).toBe("5#");
    expect(strudelStep("7", am)).toBe("6#");
    expect(strudelStep("#4", K("C"))).toBe("3#");
    expect(strudelStep("b7", K("C"))).toBe("6b");
    const scale = parseScaleName("A3:minor");
    if (!scale) throw new Error("scale");
    expect(await midisOf('n("5# 6# 7").scale("A3:minor")')).toEqual(
      ["5#", "6#", 7].map((s) => stepToMidi(s, scale)),
    );
    expect(stepToMidi("6#", scale)).toBe(68); // G#4: the 7th degree lies above the tonic A3
    expect(spellMidi(68, { key: am }).name).toBe("G#4");
    const fsharp = parseScaleName("F#4:major");
    if (!fsharp) throw new Error("scale");
    expect(await midisOf('n("0 6 3#").scale("F#4:major")')).toEqual([66, 77, 72]);
    expect(spellMidi(77, { key: K("F#") }).name).toBe("E#5");
    expect(spellMidi(72, { key: K("F#") }).name).toBe("B#4");
  });
});

describe("typed answers", () => {
  test("regression: figures written with a slash are figures (V6/5, V4/3, V4/2, I6/4), not applied chords", () => {
    const C = K("C");
    expect(["V6/5", "V4/3", "V4/2", "I6/4", "ii6/5"].map((t) => normalizeText("rn", t))).toEqual([
      "V65",
      "V43",
      "V42",
      "I64",
      "ii65",
    ]);
    expect(normalizeText("rn", "V7/V")).toBe("V7/V");
    expect(normalizeText("rn", "V6/5/V")).toBe("V65/V");
    expect(formatRN(parseRN("V4/2/IV", C) as never)).toBe("V42/IV");
  });
  test("regression: bare interval words (tritone, TT, octave, unison) normalize to the drills' names", () => {
    expect(
      ["tritone", "TT", "Tritone", "octave", "unison", "perfect octave"].map((t) =>
        normalizeText("interval", t),
      ),
    ).toEqual(["TT", "TT", "TT", "P8", "P1", "P8"]);
    expect(normalizeText("interval", "aug 4")).toBe("A4");
    expect(normalizeText("interval", "d5")).toBe("d5");
  });
  test("regression: spelled-out accidentals in keys and notes (c sharp minor, E-flat); C-1 is still octave −1", () => {
    expect(normalizeText("key", "c sharp minor")).toBe("C# minor");
    expect(normalizeText("key", "B flat major")).toBe("Bb major");
    expect(normalizeText("note", "E-flat")).toBe("Eb");
    expect(normalizeText("note", "F-sharp4")).toBe("F#4");
    expect(normalizeText("note", "C-1")).toBe("C-1");
  });
});
