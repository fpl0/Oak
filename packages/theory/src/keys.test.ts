import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { Interval, Key } from "tonal";
import {
  FLAT_ORDER,
  fifthsNeighbours,
  fifthsOfKey,
  intervalOf,
  keyFromFifths,
  keyOf,
  keySignature,
  labelPitch,
  SHARP_ORDER,
  signatureOf,
} from "./index.ts";

const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });

describe("keyOf: any key input to a KeySpec", () => {
  test("scale arguments, scaleCtx, key text, fifths", () => {
    expect(keyOf("C4:major")).toEqual(K("C"));
    expect(keyOf("A3:harmonic:minor")).toEqual(K("A", "harmonic minor"));
    expect(keyOf("D4 major")).toEqual(K("D"));
    expect(keyOf("eb4 major")).toEqual(K("Eb"));
    expect(keyOf("F#m")).toEqual(K("F#", "minor"));
    expect(keyOf("Bb")).toEqual(K("Bb"));
    expect(keyOf("D dorian")).toEqual(K("D", "dorian"));
    expect(keyOf(-3)).toEqual(K("Eb"));
    expect(keyOf(-3, "minor")).toEqual(K("C", "minor"));
    expect(keyOf(K("G"))).toEqual(K("G"));
  });
  test("null for what names no key", () => {
    expect(keyOf("")).toBeNull();
    expect(keyOf("H major")).toBeNull();
    expect(keyOf(8)).toBeNull();
    expect(keyOf(1.5)).toBeNull();
    expect(keyOf(K("X"))).toBeNull();
  });
  test("keyFromFifths over the whole circle matches tonal", () => {
    for (let f = -7; f <= 7; f++) {
      const major = keyFromFifths(f);
      expect(Key.majorKey(major.tonic).alteration).toBe(f);
      expect(Key.minorKey(keyFromFifths(f, "minor").tonic).alteration).toBe(f);
      expect(fifthsOfKey(major)).toBe(f);
    }
    expect(() => keyFromFifths(8)).toThrow(RangeError);
  });
});

describe("signatureOf: sharps and flats in order", () => {
  test("three sharps: A major, F# minor", () => {
    expect(signatureOf(3)).toEqual({
      fifths: 3,
      sharps: ["F#", "C#", "G#"],
      flats: [],
      major: K("A"),
      minor: K("F#", "minor"),
    });
  });
  test("by key, including modes", () => {
    expect(signatureOf(K("Eb")).flats).toEqual(["Bb", "Eb", "Ab"]);
    expect(signatureOf(K("C", "minor")).flats).toEqual(["Bb", "Eb", "Ab"]);
    expect(signatureOf(K("D", "dorian")).fifths).toBe(0);
    expect(signatureOf(K("C")).sharps).toEqual([]);
  });
  test("the orders are the textbook orders", () => {
    expect(SHARP_ORDER.join(" ")).toBe("F# C# G# D# A# E# B#");
    expect(FLAT_ORDER.join(" ")).toBe("Bb Eb Ab Db Gb Cb Fb");
    for (let f = 1; f <= 7; f++) {
      // tonal writes a signature as its accidentals only ("###"); the count must agree.
      expect(signatureOf(f).sharps.length).toBe(Key.majorKey(keyFromFifths(f).tonic).keySignature.length);
      expect(signatureOf(-f).flats.length).toBe(Key.majorKey(keyFromFifths(-f).tonic).keySignature.length);
      expect(signatureOf(f).sharps).toEqual(keySignature(keyFromFifths(f)).notes);
      expect(signatureOf(-f).flats).toEqual(keySignature(keyFromFifths(-f)).notes);
    }
  });
});

describe("labelPitch: degree, syllable and spelling in a key", () => {
  test("diatonic notes in D major", () => {
    expect(labelPitch(62, K("D"))).toMatchObject({
      degree: "1",
      syllable: "do",
      name: "D4",
      chromatic: false,
    });
    expect(labelPitch(66, K("D"))).toMatchObject({
      degree: "3",
      syllable: "mi",
      name: "F#4",
      display: "F♯4",
    });
    expect(labelPitch(73, K("D"))).toMatchObject({
      degree: "7",
      syllable: "ti",
      name: "C#5",
      num: 7,
      alt: 0,
    });
  });
  test("chromatic notes in C major take the key's labels", () => {
    expect(labelPitch(63, K("C"))).toMatchObject({
      degree: "b3",
      syllable: "me",
      name: "Eb4",
      chromatic: true,
      degreeDisplay: "♭3",
    });
    expect(labelPitch(66, K("C"))).toMatchObject({ degree: "#4", syllable: "fi", name: "F#4", alt: 1 });
    expect(labelPitch(70, K("C"))).toMatchObject({ degree: "b7", syllable: "te", name: "Bb4" });
  });
  test("direction spells a passing note, and the degree follows the spelling", () => {
    expect(labelPitch(70, K("C"), { direction: 1 })).toMatchObject({
      degree: "#6",
      syllable: "li",
      name: "A#4",
    });
    expect(labelPitch(66, K("C"), { direction: -1 })).toMatchObject({
      degree: "b5",
      syllable: "se",
      name: "Gb4",
    });
    // A scale tone never respells.
    expect(labelPitch(64, K("C"), { direction: -1 })).toMatchObject({ degree: "3", name: "E4" });
  });
  test("minor keys: do-based minor", () => {
    expect(labelPitch(63, K("C", "minor"))).toMatchObject({ degree: "b3", syllable: "me", chromatic: false });
    expect(labelPitch(68, K("C", "minor"))).toMatchObject({ degree: "b6", syllable: "le", name: "Ab4" });
    expect(labelPitch(56, K("A", "minor"))).toMatchObject({
      degree: "7",
      syllable: "ti",
      name: "G#3",
      chromatic: true,
    });
  });
});

describe("fifthsNeighbours", () => {
  test("G major", () => {
    expect(fifthsNeighbours(K("G"))).toEqual({
      key: K("G"),
      fifths: 1,
      clockwise: K("D"),
      counterclockwise: K("C"),
      relative: K("E", "minor"),
      parallel: K("G", "minor"),
    });
  });
  test("minor keys keep their mode", () => {
    const n = fifthsNeighbours(K("A", "minor"));
    expect(n.clockwise).toEqual(K("E", "minor"));
    expect(n.counterclockwise).toEqual(K("D", "minor"));
    expect(n.relative).toEqual(K("C"));
  });
  test("past seven accidentals the enharmonic key is used", () => {
    expect(fifthsNeighbours(K("C#")).clockwise).toEqual(K("Ab"));
    expect(fifthsNeighbours(K("Cb")).counterclockwise).toEqual(K("E"));
    expect(fifthsNeighbours(K("F#")).clockwise).toEqual(K("C#"));
    expect(fifthsNeighbours(K("F")).counterclockwise).toEqual(K("Bb"));
  });
});

describe("intervalOf: generic and specific names", () => {
  test("from MIDI, spelled in C major by default", () => {
    expect(intervalOf(60, 64)).toMatchObject({ name: "M3", generic: 3, long: "major 3rd", semitones: 4 });
    expect(intervalOf(60, 63)).toMatchObject({
      name: "m3",
      generic: 3,
      long: "minor 3rd",
      low: "C4",
      high: "Eb4",
    });
    expect(intervalOf(60, 67)).toMatchObject({ name: "P5", long: "perfect 5th", tritone: false });
    expect(intervalOf(60, 66)).toMatchObject({ name: "A4", tritone: true, long: "augmented 4th" });
    expect(intervalOf(60, 72)).toMatchObject({ name: "P8", long: "octave", compound: false });
    expect(intervalOf(60, 76)).toMatchObject({ name: "M10", generic: 10, compound: true });
    expect(intervalOf(60, 60)).toMatchObject({ name: "P1", long: "unison", direction: "unison" });
  });
  test("direction is reported, the name is of the ascending interval", () => {
    expect(intervalOf(67, 60)).toMatchObject({ name: "P5", direction: "down", low: "C4", high: "G4" });
  });
  test("in a key, MIDI is spelled the way the key writes it", () => {
    // B to F in C major is a diminished 5th; F# to C in G major too; both tritones.
    expect(intervalOf(59, 65, K("C"))).toMatchObject({ name: "d5", tritone: true });
    expect(intervalOf(66, 72, K("G"))).toMatchObject({ name: "d5", tritone: true });
    expect(intervalOf(63, 67, K("Eb"))).toMatchObject({ name: "M3" });
  });
  test("spelled names win over MIDI and match tonal", () => {
    const pairs: [string, string][] = [
      ["C4", "D#4"],
      ["C4", "Eb4"],
      ["E4", "C5"],
      ["B3", "F4"],
      ["F4", "B4"],
      ["D4", "C5"],
      ["A3", "C#5"],
    ];
    for (const [a, b] of pairs) {
      // tonal names number first ("2A"); Oak writes quality first ("A2").
      const t = Interval.get(Interval.distance(a, b));
      expect(intervalOf(a, b).name).toBe(`${t.q}${t.num}`);
    }
    expect(() => intervalOf("C", "E4")).toThrow(RangeError);
  });
});
