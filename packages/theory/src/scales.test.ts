import { describe, expect, test } from "bun:test";
import type { Degree, KeySpec } from "@oak/content-kit";
import { DEGREES, SCALE_MODES } from "@oak/content-kit";
import { Key, Scale } from "tonal";
import {
  characteristicTones,
  circleOfFifths,
  degreeOf,
  degreeSemitones,
  formatScaleName,
  keyFromScaleCtx,
  keySignature,
  parallelKey,
  parseScaleArg,
  parseScaleName,
  relativeKey,
  scaleIdOf,
  scaleNotes,
  scalePcs,
  spellMidi,
  stepToMidi,
  strudelStep,
  transposeKey,
} from "./index.ts";

const MAJOR_TONICS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
const MINOR_TONICS = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "D", "G", "C", "F", "Bb", "Eb", "Ab"];
const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });

describe("scales of every major and minor key (cross-checked with tonal's Key)", () => {
  for (const t of MAJOR_TONICS) {
    test(`${t} major`, () => {
      const notes = scaleNotes(K(t));
      expect(notes).toEqual([...Key.majorKey(t).scale]);
      expect(new Set(notes.map((n) => n[0])).size).toBe(7); // each letter once
      expect(keySignature(K(t)).accidentals).toBe(Key.majorKey(t).alteration);
    });
  }
  for (const t of MINOR_TONICS) {
    test(`${t} minor (natural, harmonic, melodic)`, () => {
      const mk = Key.minorKey(t);
      expect(scaleNotes(K(t, "minor"))).toEqual([...mk.natural.scale]);
      expect(scaleNotes(K(t, "harmonic minor"))).toEqual([...mk.harmonic.scale]);
      expect(scaleNotes(K(t, "melodic minor"))).toEqual([...mk.melodic.scale]);
      expect(keySignature(K(t, "minor")).accidentals).toBe(mk.alteration);
    });
  }
  test("textbook spellings", () => {
    expect(scaleNotes(K("F#"))).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
    expect(scaleNotes(K("Eb", "minor"))).toEqual(["Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db"]);
    expect(scaleNotes(K("A", "harmonic minor"))).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
    expect(scaleNotes(K("G#", "harmonic minor"))[6]).toBe("F##");
    expect(scalePcs(K("D"))).toEqual([2, 4, 6, 7, 9, 11, 1]);
  });
});

describe("modes, pentatonics, blues (against tonal's Scale)", () => {
  const tonalName: Record<string, string> = {
    dorian: "dorian",
    phrygian: "phrygian",
    lydian: "lydian",
    mixolydian: "mixolydian",
    locrian: "locrian",
    "major pentatonic": "major pentatonic",
    "minor pentatonic": "minor pentatonic",
    blues: "blues",
  };
  for (const tonic of ["C", "D", "Eb", "F#", "Bb"]) {
    for (const [mode, name] of Object.entries(tonalName)) {
      test(`${tonic} ${mode}`, () => {
        expect(scaleNotes(K(tonic, mode as KeySpec["mode"]))).toEqual([
          ...Scale.get(`${tonic} ${name}`).notes,
        ]);
      });
    }
  }
  test("characteristic tones (exercises §3.6)", () => {
    expect(characteristicTones("dorian")).toEqual(["6"]);
    expect(characteristicTones("mixolydian")).toEqual(["b7"]);
    expect(characteristicTones("lydian")).toEqual(["#4"]);
    expect(characteristicTones("phrygian")).toEqual(["b2"]);
    expect(characteristicTones("minor")).toEqual(["b6"]);
    expect(characteristicTones("locrian")).toEqual(["b5"]);
    expect(characteristicTones("blues")).toEqual([]);
  });
  test("D dorian = C major's notes; G mixolydian too", () => {
    expect([...scaleNotes(K("D", "dorian"))].sort()).toEqual([...scaleNotes(K("C"))].sort());
    expect([...scaleNotes(K("G", "mixolydian"))].sort()).toEqual([...scaleNotes(K("C"))].sort());
  });
});

describe("key signatures, circle of fifths, related keys", () => {
  test("signature notes in order and abcjs K:", () => {
    expect(keySignature(K("Eb"))).toEqual({ accidentals: -3, notes: ["Bb", "Eb", "Ab"], abcK: "Eb" });
    expect(keySignature(K("E"))).toEqual({ accidentals: 4, notes: ["F#", "C#", "G#", "D#"], abcK: "E" });
    expect(keySignature(K("A", "minor")).abcK).toBe("Am");
    expect(keySignature(K("F#", "minor")).notes).toEqual(["F#", "C#", "G#"]);
    expect(keySignature(K("D", "dorian"))).toEqual({ accidentals: 0, notes: [], abcK: "Ddor" });
    expect(keySignature(K("G", "mixolydian")).abcK).toBe("Gmix");
    expect(keySignature(K("F", "lydian")).accidentals).toBe(0);
    expect(keySignature(K("E", "phrygian")).accidentals).toBe(0);
    expect(keySignature(K("B", "locrian")).accidentals).toBe(0);
    expect(keySignature(K("C#")).notes).toEqual(["F#", "C#", "G#", "D#", "A#", "E#", "B#"]);
    expect(keySignature(K("Cb")).notes).toEqual(["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"]);
  });
  test("circle of fifths", () => {
    const c = circleOfFifths();
    expect(c.map((e) => e.major.tonic)).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F#",
      "Db",
      "Ab",
      "Eb",
      "Bb",
      "F",
    ]);
    expect(c.map((e) => e.minor.tonic)).toEqual([
      "A",
      "E",
      "B",
      "F#",
      "C#",
      "G#",
      "D#",
      "Bb",
      "F",
      "C",
      "G",
      "D",
    ]);
    expect(c[6]?.enharmonic).toEqual({ tonic: "Gb", mode: "major" });
  });
  test("relative and parallel", () => {
    expect(relativeKey(K("C"))).toEqual(K("A", "minor"));
    expect(relativeKey(K("Eb"))).toEqual(K("C", "minor"));
    expect(relativeKey(K("F#", "minor"))).toEqual(K("A"));
    expect(relativeKey(K("D", "dorian"))).toEqual(K("C"));
    expect(relativeKey(K("C", "major pentatonic"))).toEqual(K("A", "minor pentatonic"));
    expect(parallelKey(K("C"))).toEqual(K("C", "minor"));
    expect(parallelKey(K("A", "minor"))).toEqual(K("A"));
    for (const t of MAJOR_TONICS) expect(relativeKey(relativeKey(K(t)))).toEqual(K(t));
  });
  test("transposeKey keeps at most 6 accidentals", () => {
    expect(transposeKey(K("C"), 2)).toEqual(K("D"));
    expect(transposeKey(K("C"), 3)).toEqual(K("Eb"));
    expect(transposeKey(K("C"), 6)).toEqual(K("Gb"));
    expect(transposeKey(K("C"), 1)).toEqual(K("Db"));
    expect(transposeKey(K("A", "minor"), 1)).toEqual(K("Bb", "minor"));
    expect(transposeKey(K("A", "minor"), 4)).toEqual(K("C#", "minor"));
    expect(transposeKey(K("E"), -12)).toEqual(K("E"));
    for (let s = 0; s < 12; s++) {
      expect(Math.abs(keySignature(transposeKey(K("C"), s)).accidentals)).toBeLessThanOrEqual(6);
      expect(Math.abs(keySignature(transposeKey(K("A", "minor"), s)).accidentals)).toBeLessThanOrEqual(6);
    }
  });
});

describe("degrees, syllables and Strudel steps", () => {
  test("degreeSemitones for every degree label", () => {
    const want = [0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11];
    expect(DEGREES.map((d) => degreeSemitones(d))).toEqual(want);
  });
  test("degreeOf in C major: label, syllable, step", () => {
    const C = K("C");
    const rows = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map((m) => {
      const d = degreeOf(m, C);
      return `${d.degree}:${d.syllable}:${d.step}`;
    });
    expect(rows).toEqual([
      "1:do:0",
      "b2:ra:1b",
      "2:re:1",
      "b3:me:2b",
      "3:mi:2",
      "4:fa:3",
      "#4:fi:3#",
      "5:sol:4",
      "b6:le:5b",
      "6:la:5",
      "b7:te:6b",
      "7:ti:6",
    ]);
  });
  test("degreeOf in A minor uses the scale's own labels (do-based minor)", () => {
    const Am = K("A", "minor");
    expect(degreeOf(60, Am)).toMatchObject({ degree: "b3", syllable: "me", step: 2 });
    expect(degreeOf(65, Am)).toMatchObject({ degree: "b6", syllable: "le", step: 5 });
    expect(degreeOf(67, Am)).toMatchObject({ degree: "b7", syllable: "te", step: 6 });
    expect(degreeOf(68, Am)).toMatchObject({ degree: "7", syllable: "ti", step: "6#" });
    expect(degreeOf(66, Am)).toMatchObject({ degree: "6", syllable: "la", step: "5#" });
    expect(degreeOf(45, Am)).toMatchObject({ degree: "1", semitones: 0, step: 0 });
  });
  test("strudelStep: STYLE §6 table (C major) and the minor scale's own steps", () => {
    const C = K("C");
    const table: [Degree, string | number][] = [
      ["#1", "0#"],
      ["b2", "1b"],
      ["#2", "1#"],
      ["b3", "2b"],
      ["#4", "3#"],
      ["b5", "4b"],
      ["#5", "4#"],
      ["b6", "5b"],
      ["#6", "5#"],
      ["b7", "6b"],
      ["5", 4],
      ["1", 0],
      ["7", 6],
    ];
    for (const [d, s] of table) expect(strudelStep(d, C)).toBe(s);
    for (const d of DEGREES) expect(strudelStep(d, C)).not.toBe("7b");
    const Am = K("A", "minor");
    expect(strudelStep("7", Am)).toBe("6#");
    expect(strudelStep("b7", Am)).toBe(6);
    expect(strudelStep("3", Am)).toBe("2#");
    expect(strudelStep("#4", Am)).toBe("3#");
  });
  test("strudelStep in pentatonic and blues scales", () => {
    const pent = K("C", "major pentatonic");
    expect(strudelStep("4", pent)).toBe("2#");
    expect(strudelStep("b7", pent)).toBe("4#");
    expect(strudelStep("6", pent)).toBe(4);
    const blues = K("C", "blues");
    expect(strudelStep("b5", blues)).toBe(3);
    expect(strudelStep("5", blues)).toBe(4);
    expect(strudelStep("3", blues)).toBe("1#");
  });
  test("every degree's step resolves back to the degree in every key and mode (round trip)", () => {
    for (const mode of SCALE_MODES) {
      for (const tonic of ["C", "Eb", "F#", "A"]) {
        const key = K(tonic, mode);
        const ref = parseScaleName(formatScaleName(key, 4));
        if (!ref) throw new Error(`no ref ${tonic} ${mode}`);
        for (const d of DEGREES) {
          const midi = stepToMidi(strudelStep(d, key), ref);
          expect(degreeSemitones(d)).toBe((((midi - stepToMidi(0, ref)) % 12) + 12) % 12);
        }
      }
    }
  });
});

describe(".scale() names", () => {
  test("parseScaleName and formatScaleName", () => {
    expect(parseScaleName("C4:major")).toEqual({
      tonic: "C",
      octave: 4,
      mode: "major",
      strudelName: "major",
    });
    expect(parseScaleName("A3:harmonic:minor")).toEqual({
      tonic: "A",
      octave: 3,
      mode: "harmonic minor",
      strudelName: "harmonic:minor",
    });
    expect(parseScaleName("C:major")?.octave).toBeNull();
    expect(parseScaleName("C4:aeolian")?.mode).toBe("minor");
    expect(parseScaleName("C4:pentatonic")?.mode).toBe("major pentatonic");
    expect(parseScaleName("C4 major")).toBeNull();
    expect(parseScaleName("ef4:major")).toBeNull();
    expect(parseScaleName("C4:altered")).toBeNull();
    expect(parseScaleArg("C4:altered")?.def.id).toBe("scale.altered");
    expect(formatScaleName(K("Eb"), 4)).toBe("Eb4:major");
    expect(formatScaleName(K("A", "harmonic minor"), 3)).toBe("A3:harmonic:minor");
    expect(formatScaleName(K("C", "minor pentatonic"), 2)).toBe("C2:minor:pentatonic");
    expect(scaleIdOf("harmonic minor")).toBe("scale.harmonic-minor");
  });
  test("keyFromScaleCtx reads hap.context.scale", () => {
    expect(keyFromScaleCtx("D4 major")).toEqual(K("D"));
    expect(keyFromScaleCtx("A3 harmonic minor")).toEqual(K("A", "harmonic minor"));
    expect(keyFromScaleCtx("eb4 major")).toEqual(K("Eb"));
    expect(keyFromScaleCtx("C4 aeolian")).toEqual(K("C", "minor"));
    expect(keyFromScaleCtx("C4 minor pentatonic")).toEqual(K("C", "minor pentatonic"));
    expect(keyFromScaleCtx("C major")).toEqual(K("C"));
    expect(keyFromScaleCtx("C4 altered")).toBeNull();
    expect(keyFromScaleCtx("nonsense")).toBeNull();
  });
});

describe("spellMidi: chord tone > key scale > direction > chromatic label", () => {
  const name = (m: number, ctx: Parameters<typeof spellMidi>[1]) => spellMidi(m, ctx).name;
  test("key scale spelling (each letter once)", () => {
    expect(name(61, { key: K("D") })).toBe("C#4");
    expect(name(77, { key: K("F#") })).toBe("E#5");
    expect(name(60, { key: K("C#") })).toBe("B#3");
    expect(name(59, { key: K("Gb") })).toBe("Cb4");
    expect(name(68, { key: K("A", "minor") })).toBe("G#4"); // raised 7
    expect(name(66, { key: K("A", "minor") })).toBe("F#4"); // raised 6
    expect(name(70, { key: K("Eb") })).toBe("Bb4");
  });
  test("chromatic notes take the key's chromatic label", () => {
    expect(name(70, { key: K("C") })).toBe("Bb4"); // b7
    expect(name(66, { key: K("C") })).toBe("F#4"); // #4
    expect(name(63, { key: K("C") })).toBe("Eb4"); // b3
    expect(name(65, { key: K("G") })).toBe("F4"); // b7 of G
    expect(name(61, { key: null })).toBe("Db4");
  });
  test("direction spells passing tones", () => {
    expect(name(61, { key: K("C"), direction: 1 })).toBe("C#4");
    expect(name(61, { key: K("C"), direction: -1 })).toBe("Db4");
    expect(name(66, { key: K("C"), direction: -1 })).toBe("Gb4");
    expect(name(70, { key: K("C"), direction: 1 })).toBe("A#4");
  });
  test("chord tones win over the key", () => {
    const e7 = { rootPc: 4 as const, root: "E", quality: "7" as const, bassPc: 4 as const, ext: [] };
    expect(name(68, { key: K("C"), chord: e7 })).toBe("G#4");
    const ab = { rootPc: 8 as const, root: "Ab", quality: "maj" as const, bassPc: 8 as const, ext: [] };
    expect(name(68, { key: K("E"), chord: ab })).toBe("Ab4");
  });
  test("octaves follow the letter (B#3 is MIDI 60, Cb4 is 59)", () => {
    expect(spellMidi(60, { key: K("C#") })).toEqual({ midi: 60, name: "B#3", letter: "B", alt: 1, oct: 3 });
    expect(spellMidi(59, { key: K("Cb") })).toEqual({ midi: 59, name: "Cb4", letter: "C", alt: -1, oct: 4 });
  });
});
