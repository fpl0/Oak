// Cross-check: the generators' small kernel (kernel.ts) against @oak/theory, the owner of spelling, scales,
// degrees and chord symbols. During the wave the drills were built while @oak/theory was still a stub;
// this suite pins the two to the same answers so they cannot drift apart.
import { describe, expect, test } from "bun:test";
import type { ChordQuality, Degree, ScaleMode } from "@oak/content-kit";
import * as theory from "@oak/theory";
import {
  allKeys,
  CHORD_SUFFIX,
  chordCode,
  chordPcs,
  degreeOfMidi,
  degreeSemis,
  keyAccidentals,
  parsePc,
  scaleArg,
  scaleNames,
  stepToMidi,
} from "./kernel.ts";

const SEVEN: ScaleMode[] = [
  "major",
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
];
const ALL_MODES: ScaleMode[] = [...SEVEN, "major pentatonic", "minor pentatonic", "blues"];

describe("kernel agrees with @oak/theory", () => {
  test("scale spellings in every key of every seven-note mode", () => {
    for (const mode of SEVEN)
      for (const key of allKeys(mode))
        expect([key.tonic, mode, scaleNames(key)]).toEqual([key.tonic, mode, theory.scaleNotes(key)]);
  });

  test("key-signature accidentals", () => {
    for (const mode of SEVEN)
      for (const key of allKeys(mode))
        expect([key.tonic, mode, keyAccidentals(key)]).toEqual([
          key.tonic,
          mode,
          theory.keySignature(key).accidentals,
        ]);
  });

  test("n steps resolve to the same MIDI (Strudel's rule) in every mode, octaves 2 to 5", () => {
    const steps: (number | string)[] = [-8, -1, 0, 1, 2, 3, 4, 5, 6, 7, 9, 13, "3#", "6b", "2b", "4#"];
    for (const mode of ALL_MODES)
      for (const key of allKeys(mode))
        for (const octave of [2, 3, 4, 5]) {
          const ref = theory.parseScaleName(scaleArg(key, octave));
          expect(ref).not.toBeNull();
          for (const step of steps)
            expect([scaleArg(key, octave), step, stepToMidi(step, key, octave)]).toEqual([
              scaleArg(key, octave),
              step,
              theory.stepToMidi(step, ref as theory.ScaleRef),
            ]);
        }
  });

  test("degree semitones and the degree of a MIDI note", () => {
    const degrees: Degree[] = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
    for (const d of degrees) expect(degreeSemis(d)).toBe(theory.degreeSemitones(d));
    for (const key of allKeys("major"))
      for (let midi = 48; midi < 72; midi++)
        expect(theory.degreeSemitones(degreeOfMidi(midi, key))).toBe(
          (((midi - parsePc(key.tonic).pc) % 12) + 12) % 12,
        );
  });

  test("chord tones of every quality the drills write, on every root", () => {
    const roots = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    for (const q of Object.keys(CHORD_SUFFIX) as ChordQuality[])
      for (const root of roots) {
        const code = chordCode(root, q);
        const id = theory.parseChordSymbol(code);
        expect([code, id === null]).toEqual([code, false]);
        const mine = [...chordPcs(parsePc(root).pc, q)].sort((a, b) => a - b);
        const theirs = [...theory.chordPcs(id as theory.ChordId)].sort((a, b) => a - b);
        // 7alt: theory lists every altered tension (b9 #9 #11 b13); the drills voice the usual four-tone
        // subset without #11. Every drill tone must still be one of theory's.
        if (q === "7alt") expect(mine.every((pc) => (theirs as number[]).includes(pc))).toBe(true);
        else expect([code, mine]).toEqual([code, theirs]);
      }
  });
});

describe("the course catalog binds", () => {
  test("content/families.ts: every family binds or is pending/composite; composites refuse a generator", async () => {
    const { families, decks } = await import("../../../content/families.ts");
    const { createRegistry } = await import("./engine.ts");
    const reg = createRegistry(families, decks);
    expect(reg.families().length).toBeGreaterThan(30);
    expect(() => reg.family("fam.mix.pitch" as never)).toThrow(/composite/);
    expect(reg.decks().length).toBe(decks.length);
  });
});
