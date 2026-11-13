// Wave 4 seam tests (docs/design/wave4.md §3.1). Every musical claim here is cross-checked against tonal or
// worked by hand in C major (C E G / F A C / G B D) and A minor.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { Chord, Note } from "tonal";
import {
  cadenceOf,
  chordOfRoman,
  chordSymbol,
  diatonicChordOn,
  harmonicFunction,
  parseChordWithBass,
  readChord,
  romanParts,
  romanText,
  schemaOf,
  toLeadSheet,
  toneRole,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const Am: KeySpec = { tonic: "A", mode: "minor" };
const G: KeySpec = { tonic: "G", mode: "major" };
const P = (s: string) => {
  const c = parseChordWithBass(s);
  if (!c) throw new Error(`no parse: ${s}`);
  return c;
};
const pcsOf = (name: string) => Chord.get(name).notes.map((n) => Note.chroma(n) as number);

describe("readChord: a triad or seventh from pitch classes and a bass", () => {
  test("root position, first and second inversion of C", () => {
    expect(readChord([0, 4, 7], 0)).toMatchObject({
      root: "C",
      quality: "maj",
      inversion: 0,
      leadSheet: "C",
      slash: false,
    });
    expect(readChord([0, 4, 7], 4)).toMatchObject({
      quality: "maj",
      inversion: 1,
      leadSheet: "C/E",
      code: "C",
      slash: true,
    });
    expect(readChord([0, 4, 7], 7)).toMatchObject({ inversion: 2, leadSheet: "C/G" });
  });
  test("the four triad qualities and the U06.L10 sevenths", () => {
    expect(readChord([9, 0, 4], 9)?.leadSheet).toBe("Am");
    expect(readChord([11, 2, 5], 11)?.leadSheet).toBe("B°");
    expect(readChord([0, 4, 8], 0)?.leadSheet).toBe("C+");
    expect(readChord([7, 11, 2, 5], 7)?.leadSheet).toBe("G7");
    expect(readChord([0, 4, 7, 11], 0)?.leadSheet).toBe("Cmaj7");
    expect(readChord([2, 5, 9, 0], 2)?.leadSheet).toBe("Dm7");
    expect(readChord([7, 11, 2, 5], 11)).toMatchObject({ leadSheet: "G7/B", inversion: 1 });
  });
  test("the descending bass of U06.L11: G/B", () => {
    expect(readChord([7, 11, 2], 11)?.leadSheet).toBe("G/B");
  });
  test("no chord: a non-chord pitch class, a single note, a bass outside the chord", () => {
    expect(readChord([0, 2, 4, 7], 0)).toBeNull();
    expect(readChord([0], 0)).toBeNull();
    expect(readChord([0, 4, 7], 2)).toBeNull();
  });
  test("agrees with tonal on the pitch classes of each quality", () => {
    for (const [name, sym] of [
      ["C", "C"],
      ["Cm", "Cm"],
      ["Cdim", "C°"],
      ["Caug", "C+"],
      ["CM7", "Cmaj7"],
      ["C7", "C7"],
      ["Cm7", "Cm7"],
    ] as const)
      expect(readChord(pcsOf(name), 0)?.leadSheet).toBe(sym);
  });
});

describe("diatonic chords and Roman numerals", () => {
  test("I ii iii IV V vi vii° in C and the quality pattern", () => {
    const names = [1, 2, 3, 4, 5, 6, 7].map((d) => toLeadSheet(diatonicChordOn(C, d)));
    expect(names).toEqual(["C", "Dm", "Em", "F", "G", "Am", "B°"]);
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => romanText(diatonicChordOn(C, d), C))).toEqual([
      "I",
      "ii",
      "iii",
      "IV",
      "V",
      "vi",
      "viio",
    ]);
  });
  test("sevenths for the U06.L10 preview: Imaj7 vi7 ii7 V7", () => {
    const sev = (d: number) => romanText(diatonicChordOn(C, d, { seventh: true }), C);
    expect([1, 6, 2, 5].map(sev)).toEqual(["Imaj7", "vi7", "ii7", "V7"]);
    expect(sev(7)).toBe("viiø7");
  });
  test("inversion figures: V6 = G/B, I64 = C/G, V65 = G7/B", () => {
    expect(toLeadSheet(chordOfRoman("V6", C) as never)).toBe("G/B");
    expect(toLeadSheet(chordOfRoman("I64", C) as never)).toBe("C/G");
    expect(toLeadSheet(chordOfRoman("V65", C) as never)).toBe("G7/B");
    expect(romanText(P("G/B"), C)).toBe("V6");
    expect(romanText(P("C/G"), C)).toBe("I64");
  });
  test("RN answers are (degree, quality, inversion), never strings", () => {
    expect(romanParts("vii°", C)).toEqual({ degree: 7, alt: 0, quality: "dim", inversion: 0 });
    expect(romanParts("viio", C)).toEqual(romanParts("vii°", C));
    expect(romanParts("V6", G)).toEqual({ degree: 5, alt: 0, quality: "maj", inversion: 1 });
    expect(romanParts("nonsense", C)).toBeNull();
  });
  test("minor keys read natural minor: i iio III iv v VI VII", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => romanText(diatonicChordOn(Am, d), Am))).toEqual([
      "i",
      "iio",
      "III",
      "iv",
      "v",
      "VI",
      "VII",
    ]);
  });
});

describe("function, cadences, schemas", () => {
  test("tonic, predominant, dominant", () => {
    expect(["C", "Am", "Em"].map((s) => harmonicFunction(P(s), C))).toEqual(["T", "T", "T"]);
    expect(["Dm", "F"].map((s) => harmonicFunction(P(s), C))).toEqual(["PD", "PD"]);
    expect(["G", "G7", "Bo"].map((s) => harmonicFunction(P(s), C))).toEqual(["D", "D", "D"]);
  });
  test("PAC needs the melody on 1; IAC otherwise; HC, PC and DC", () => {
    expect(cadenceOf(P("G"), P("C"), C, { melodyMidi: 72 })).toBe("PAC");
    expect(cadenceOf(P("G"), P("C"), C, { melodyMidi: 76 })).toBe("IAC");
    expect(cadenceOf(P("G/B"), P("C"), C, { melodyMidi: 72 })).toBe("IAC");
    expect(cadenceOf(P("F"), P("G"), C)).toBe("HC");
    expect(cadenceOf(P("F"), P("C"), C)).toBe("PC");
    expect(cadenceOf(P("G"), P("Am"), C)).toBe("DC");
  });
  test("schemas in any rotation: axis, axis-vi, doo-wop, three-chord rock", () => {
    const seq = (...s: string[]) => s.map(P);
    expect(schemaOf(seq("C", "G", "Am", "F"), C)?.schema.id).toBe("schema.axis");
    expect(schemaOf(seq("Am", "F", "C", "G"), C)?.schema.id).toBe("schema.axis-vi");
    const rot = schemaOf(seq("G", "Am", "F", "C"), C);
    expect(rot?.schema.id).toBe("schema.axis");
    expect(rot?.rotation).toBe(1);
    expect(schemaOf(seq("C", "Am", "F", "G"), C)?.schema.id).toBe("schema.doo-wop");
    expect(schemaOf(seq("C", "F", "G", "C"), C)?.schema.id).toBe("schema.three-chord");
    expect(schemaOf(seq("G", "D", "Em", "C"), G)?.schema.id).toBe("schema.axis");
    expect(schemaOf(seq("Cmaj7", "G7", "Am7", "Fmaj7"), C)?.schema.id).toBe("schema.axis");
    expect(schemaOf(seq("C", "Dm", "Em", "F"), C)).toBeNull();
  });
});

describe("chord-symbol dialects", () => {
  test("lead sheet ↔ code ↔ jazz", () => {
    expect(chordSymbol("Co", "lead-sheet")).toBe("C°");
    expect(chordSymbol("C°", "code")).toBe("Co");
    expect(chordSymbol("Cdim", "code")).toBe("Co");
    expect(chordSymbol("Caug", "lead-sheet")).toBe("C+");
    expect(chordSymbol("C+", "code")).toBe("Caug");
    expect(chordSymbol("G/B", "lead-sheet")).toBe("G/B");
    expect(chordSymbol("G/B", "code")).toBe("G");
    expect(chordSymbol("Cmaj7", "code")).toBe("C^7");
    expect(chordSymbol("C^7", "jazz")).toBe("C∆7");
    expect(chordSymbol("Bbm", "lead-sheet")).toBe("B♭m");
    expect(chordSymbol("H7", "code")).toBeNull();
  });
});

describe("toneRole: chord tones and non-chord tones (U07.L03–L05)", () => {
  const Cmaj = P("C");
  const G7 = P("G7");
  test("chord tones", () => {
    expect(toneRole(64, Cmaj, { strong: true })).toBe("chord-tone");
    expect(toneRole(79, Cmaj, { strong: false })).toBe("chord-tone");
  });
  test("passing and neighbour", () => {
    // E D C over C: D passes between two chord tones.
    expect(toneRole(62, Cmaj, { prev: 64, next: 60, strong: false })).toBe("passing");
    // E F E: F is an upper neighbour.
    expect(toneRole(65, Cmaj, { prev: 64, next: 64, strong: false })).toBe("neighbour");
  });
  test("appoggiatura: leap in, step out, strong", () => {
    // G4 leaps up to D5 on the beat over C, then resolves down by step to C5.
    expect(toneRole(74, Cmaj, { prev: 67, next: 72, strong: true })).toBe("appoggiatura");
  });
  test("4–3 suspension: held F over C, resolving to E", () => {
    expect(toneRole(65, Cmaj, { prev: 65, next: 64, strong: true, heldFromPrevChord: true })).toBe(
      "suspension",
    );
  });
  test("anticipation: a tone of the next chord on a weak position", () => {
    expect(toneRole(67, P("F"), { prev: 69, next: 67, strong: false, nextChord: Cmaj })).toBe("anticipation");
  });
  test("escape tone: step in, leap out the other way", () => {
    expect(toneRole(62, Cmaj, { prev: 60, next: 55, strong: false })).toBe("escape");
  });
  test("a seventh chord's 7th is a chord tone", () => {
    expect(toneRole(65, G7, { strong: true })).toBe("chord-tone");
  });
});
