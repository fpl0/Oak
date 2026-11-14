// Corrections pass (before the learner starts the course): theory findings of the outside review, pinned.
// - theory-e: melodic minor's sevenths were natural minor's under its name; now refused, and its triads are its own.
// - theory-f: an applied chord "resolves" only onto its target's own quality (A is not vi), a chain's next dominant
//   excepted; `n("4#")` keeps the degree it is written as (♯5, G♯), never ♭6.
import { describe, expect, test } from "bun:test";
import { chordOf } from "./chords.ts";
import { alterDegree, alterSpelling, runTheoryCli } from "./cli.ts";
import { appliedReading, arrivesOn, keySevenths } from "./wave6.ts";

const C = { tonic: "C", mode: "major" } as const;

describe("melodic minor", () => {
  test("keySevenths refuses melodic minor instead of returning natural minor's chords", () => {
    expect(() => keySevenths({ tonic: "A", mode: "melodic minor" })).toThrow(/melodic minor are not built/);
    expect(keySevenths({ tonic: "A", mode: "minor" }).map((c) => c.symbol)[4]).toBe("Em7");
    expect(keySevenths({ tonic: "A", mode: "harmonic minor" }).map((c) => c.symbol)[4]).toBe("E7");
  });
  test("the CLI: `sevenths A:melodic:minor` fails; `minor A --melodic` lists i ii III+ IV V vi° vii°", () => {
    expect(runTheoryCli(["sevenths", "A:melodic:minor"]).code).not.toBe(0);
    expect(runTheoryCli(["minor", "A", "--melodic", "--sevenths"]).code).not.toBe(0);
    const out = JSON.parse(runTheoryCli(["minor", "A", "--melodic"]).out) as { chords: { symbol: string }[] };
    expect(out.chords.map((c) => c.symbol)).toEqual(["Am", "Bm", "C+", "D", "E", "F♯°", "G♯°"]);
  });
});

describe("applied chords land on the chord they point at", () => {
  test("V7/vi → A is not vi; → Am is", () => {
    const e7 = chordOf("E", "7");
    expect(appliedReading(e7, C, chordOf("A", "maj"))?.resolves).toBe(false);
    expect(appliedReading(e7, C, chordOf("A", "aug"))?.resolves).toBe(false);
    expect(appliedReading(e7, C, chordOf("A", "min"))?.resolves).toBe(true);
    expect(appliedReading(e7, C, chordOf("A", "m7"))?.resolves).toBe(true);
  });
  test("V7/V → Gm is not V; V7/IV → Fm is not IV; a chain's next dominant counts (A7 → D7)", () => {
    expect(appliedReading(chordOf("D", "7"), C, chordOf("G", "min"))?.resolves).toBe(false);
    expect(appliedReading(chordOf("C", "7"), C, chordOf("F", "min"))?.resolves).toBe(false);
    expect(appliedReading(chordOf("A", "7"), C, chordOf("D", "7"))?.resolves).toBe(true);
    expect(arrivesOn(chordOf("D", "7"), chordOf("D", "min"))).toBe(true);
    expect(arrivesOn(chordOf("D", "aug"), chordOf("D", "min"))).toBe(false);
  });
  test("the CLI says the same: `applied-of E7 C A` does not resolve", () => {
    expect(JSON.parse(runTheoryCli(["applied-of", "E7", "C", "A"]).out).resolves).toBe(false);
    expect(JSON.parse(runTheoryCli(["applied-of", "E7", "C", "Am"]).out).resolves).toBe(true);
  });
});

describe("`theory n` keeps a chromatic step's written degree", () => {
  test("4# is ♯5 (G♯4), 0# is ♯1 (C♯4), 3# ♯4, 6b ♭7; plain steps unchanged", () => {
    const out = JSON.parse(runTheoryCli(["n", "C4:major", "3#", "4#", "0#", "6b", "4"]).out) as {
      note: string;
      degree: string;
      midi: number;
    }[];
    expect(out.map((x) => [x.note, x.degree, x.midi])).toEqual([
      ["F#4", "#4", 66],
      ["G#4", "#5", 68],
      ["C#4", "#1", 61],
      ["Bb4", "b7", 70],
      ["G4", "5", 67],
    ]);
  });
  test("in minor, 2# on ♭3 is the natural 3", () => {
    const out = JSON.parse(runTheoryCli(["n", "A3:minor", "2#", "5#"]).out) as {
      note: string;
      degree: string;
    }[];
    expect(out.map((x) => [x.note, x.degree])).toEqual([
      ["C#4", "3"],
      ["F#4", "6"],
    ]);
  });
  test("alterSpelling and alterDegree", () => {
    expect(alterSpelling("Bb3", 1)).toBe("B3");
    expect(alterSpelling("F#4", 1)).toBe("F##4");
    expect(alterDegree("b3", 1)).toBe("3");
    expect(alterDegree("5", -1)).toBe("b5");
  });
});
