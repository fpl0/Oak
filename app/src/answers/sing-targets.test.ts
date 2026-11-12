import { describe, expect, test } from "bun:test";
import { identifyChord, intervalOf, labelPitch } from "@oak/theory";
import {
  cadenceChords,
  degreeNotes,
  degreeSemitones,
  takeNotes,
  targetLabel,
  targetSpoken,
  voiceSing,
} from "./sing.ts";

describe("sung degree patterns", () => {
  test("1 3 5 3 1 in A major is A C♯ E C♯ A (labelPitch agrees)", () => {
    const notes = degreeNotes(57, ["1", "3", "5", "3", "1"]);
    expect(notes.map((n) => n.midi)).toEqual([57, 61, 64, 61, 57]);
    const key = { tonic: "A", mode: "major" } as const;
    expect(notes.map((n) => labelPitch(n.midi, key).degree)).toEqual(["1", "3", "5", "3", "1"]);
    expect(notes.map((n) => labelPitch(n.midi, key).name)).toEqual(["A3", "C#4", "E4", "C#4", "A3"]);
  });
  test("octaves: 7 1′ resolves up a half step; 1 5 1′ spans an octave", () => {
    const res = degreeNotes(60, ["7", "1"], { octaves: [0, 1] });
    expect(intervalOf(res[0]?.midi as number, res[1]?.midi as number).name).toBe("m2");
    const span = degreeNotes(60, ["1", "5", "1"], { octaves: [0, 0, 1] });
    expect((span[2]?.midi as number) - (span[0]?.midi as number)).toBe(12);
  });
  test("altered degrees", () => {
    expect(degreeSemitones("b3")).toBe(3);
    expect(degreeSemitones("#4")).toBe(6);
    expect(degreeSemitones("b7")).toBe(10);
  });
  test("labels: numbers before U03.L08, number and syllable after", () => {
    expect(targetLabel({ degree: "5" })).toBe("5");
    expect(targetLabel({ degree: "5" }, "syllables")).toBe("5 · sol");
    expect(targetLabel({ degree: "b3" }, "syllables")).toBe("♭3 · me");
    expect(targetLabel({ label: "A" })).toBe("A");
    expect(targetSpoken({ degree: "7" }, "syllables")).toBe("degree 7, ti");
  });
});

describe("the reference", () => {
  test("I IV V I in C: C major, F major, G major, C major", () => {
    const chords = cadenceChords(60).map((c) => identifyChord(c)[0]);
    expect(chords.map((c) => c?.root)).toEqual(["C", "F", "G", "C"]);
    for (const c of chords) expect(c?.quality).toBe("maj");
  });
  test("minor: i iv V i with the leading tone (G♯ in A minor)", () => {
    const chords = cadenceChords(57, "minor").map((c) => identifyChord(c)[0]);
    expect(chords.map((c) => [c?.root, c?.quality])).toEqual([
      ["A", "min"],
      ["D", "min"],
      ["E", "maj"],
      ["A", "min"],
    ]);
  });
});

describe("hear my take, voice state", () => {
  test("the sung pitches in the targets' octave; a missed note is silent", () => {
    const notes = degreeNotes(57, ["1", "3", "5"]);
    const take = takeNotes(
      [
        { midi: 69.1, cents: 10, credit: 1 },
        { midi: null, cents: null, credit: 0 },
        { midi: 64.5, cents: 50, credit: 0.5 },
      ],
      notes,
    );
    expect(take).toEqual([
      { midi: 57.1, at: 0, dur: notes[0]?.dur as number },
      { midi: 64.5, at: notes[2]?.at as number, dur: notes[2]?.dur as number },
    ]);
  });
  test("the server's ladder sets the tolerance; Quiet and the labels pass through", () => {
    expect(voiceSing({ quiet: true, labels: "syllables", ladder: { cents: 35 } })).toEqual({
      quiet: true,
      labels: "syllables",
      tolCents: 35,
    });
  });
});
