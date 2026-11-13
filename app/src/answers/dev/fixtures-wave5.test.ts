// The Wave 5 gallery examples are music too: the form previews, the F blues and the A minor chart, the scales, the
// minor staff and numerals, the sung minor pattern and the audio of the new pick kinds, checked with headless
// Strudel and @oak/theory.
import { describe, expect, test } from "bun:test";
import { formLetters } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import {
  bluesKey,
  chordOfRoman,
  minorDegrees,
  minorKey,
  minorScaleNotes,
  pentatonicKey,
  scaleDegrees,
  signatureOf,
  toLeadSheet,
  twelveBarChords,
  twelveBarPlan,
} from "@oak/theory";
import { entryMidis } from "../bar-grid.ts";
import { sortDegrees, valueDegrees } from "../scale.ts";
import {
  A_MINOR,
  ANDALUSIAN_BASS,
  ANDALUSIAN_RN,
  COLOUR_SCALES,
  F_BLUES,
  F_BLUES_RN,
  FORM_AABA,
  FORM_SECTIONS,
  FORM_SONG,
  HATS_STRAIGHT,
  HATS_SWUNG,
  MINOR_CHART,
  MINOR_RN,
  MINOR_SCALES,
  SING_MINOR,
  WAVE5_FIXTURES,
} from "./fixtures-wave5.ts";

const sym = (rn: string, key = A_MINOR) => {
  const c = chordOfRoman(rn, key);
  return c ? toLeadSheet(c) : null;
};
const byId = (id: string) => {
  const f = WAVE5_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const midis = async (code: string, bars = 1) => (await evalHeadless(code, bars)).events.map((e) => e.midi);

describe("Wave 5 gallery fixtures", () => {
  test("the form examples read as ABABCB and AABA; every section they play is four chords in C", () => {
    expect(formLetters(FORM_SONG)).toBe("ABABCB");
    expect(formLetters(FORM_AABA)).toBe("AABA");
    for (const [name, rns] of Object.entries(FORM_SECTIONS)) {
      expect(`${name}: ${rns.length}`).toBe(`${name}: 4`);
      for (const rn of rns) expect(sym(rn, { tonic: "C", mode: "major" })).not.toBeNull();
    }
    expect(FORM_SECTIONS.verse?.map((rn) => sym(rn, { tonic: "C", mode: "major" }))).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ]);
    expect(FORM_SECTIONS.chorus?.map((rn) => sym(rn, { tonic: "C", mode: "major" }))).toEqual([
      "C",
      "G",
      "Am",
      "F",
    ]);
  });

  test("the F blues is the quick change with a turnaround: F7 B♭7 F7 F7 B♭7 B♭7 F7 F7 C7 B♭7 F7 C7", () => {
    expect(F_BLUES_RN).toEqual(twelveBarPlan({ variant: "quick-change", turnaround: true }));
    const chords = twelveBarChords("F", { variant: "quick-change", turnaround: true }).map(toLeadSheet);
    expect(F_BLUES_RN.map((rn) => sym(rn, F_BLUES))).toEqual(chords);
    expect(chords.join(" ")).toBe("F7 B♭7 F7 F7 B♭7 B♭7 F7 F7 C7 B♭7 F7 C7");
    // The chart plays F7 as F2 under F A C E♭.
    expect(entryMidis("rn", "I7", F_BLUES)).toEqual([53, 60, 63, 65, 69]);
  });

  test("the A minor chart is i VI III VII | i iv V i; bar 7's E has the raised 7th, G♯", () => {
    expect(["i", "VI", "III", "VII", "i", "iv", "V", "i"].map((rn) => sym(rn))).toEqual(MINOR_CHART);
    expect(MINOR_RN.map((rn) => sym(rn))).toEqual(["Am", "Dm", "E", "Am"]);
    expect(sym("v")).toBe("Em");
    expect(entryMidis("symbol", "E", A_MINOR)).toEqual([52, 64, 68, 71]);
  });

  test("the Andalusian descent i VII VI V sits on the bass 1 ♭7 ♭6 5 (A G F E)", () => {
    expect(ANDALUSIAN_RN.map((rn) => sym(rn))).toEqual(["Am", "G", "F", "E"]);
    const roots = ANDALUSIAN_RN.map((rn) => chordOfRoman(rn, A_MINOR)?.bassPc);
    expect(roots).toEqual([9, 7, 5, 4]);
    // A G F E above A: 1 ♭7 ♭6 5.
    expect(valueDegrees([57, 67, 65, 64], "A")).toEqual(sortDegrees(ANDALUSIAN_BASS));
  });

  test("the scales: G major pentatonic, A blues, A harmonic minor", () => {
    expect(byId("scale-keys").expected).toEqual([67, 69, 71, 74, 76]);
    expect(valueDegrees(byId("scale-keys").expected as number[], "G")).toEqual(
      scaleDegrees(pentatonicKey("G", "major")),
    );
    expect(byId("scale-blues").expected).toEqual(scaleDegrees(bluesKey("A")));
    expect(byId("scale-minor").expected).toEqual(minorDegrees("harmonic").map((d) => d.degree));
    expect(minorScaleNotes("A", "harmonic")).toEqual(["A", "B", "C", "D", "E", "F", "G#"]);
  });

  test("the minor staff: E F G♯ A are 5 ♭6 7 1 of A; D minor's signature is one flat", () => {
    expect(valueDegrees([64, 65, 68, 69], "A")).toEqual(["1", "5", "b6", "7"]);
    expect(signatureOf({ tonic: "D", mode: "minor" }).flats).toEqual(["Bb"]);
    expect(signatureOf(minorKey("A", "harmonic")).fifths).toBe(0);
  });

  test("the sung minor pattern is A3 C4 E4 C4 A3: do me sol me do", () => {
    expect(SING_MINOR.map((n) => n.midi)).toEqual([57, 60, 64, 60, 57]);
    expect(SING_MINOR.map((n) => n.degree)).toEqual(["1", "b3", "5", "b3", "1"]);
  });

  test("straight hats are even; swung hats put each off-beat two thirds into the beat", async () => {
    const hats = async (code: string) =>
      (await evalHeadless(code, 1)).events.filter((e) => e.s === "hh").map((e) => Number(e.onset));
    expect((await hats(HATS_STRAIGHT)).slice(0, 2)).toEqual([0, 0.125]);
    const swung = await hats(HATS_SWUNG);
    expect(swung[0]).toBe(0);
    expect(swung[1]).toBeCloseTo(1 / 6, 6);
    expect(swung[2]).toBeCloseTo(0.25, 6);
  });

  test("the three A minors and the three scale colours sound as their names", async () => {
    expect(await midis(MINOR_SCALES.minor)).toEqual([69, 71, 72, 74, 76, 77, 79, 81]);
    expect(await midis(MINOR_SCALES["harmonic minor"])).toEqual([69, 71, 72, 74, 76, 77, 80, 81]);
    expect(await midis(MINOR_SCALES["melodic minor"])).toEqual([69, 71, 72, 74, 76, 78, 80, 81]);
    expect(await midis(COLOUR_SCALES["major pentatonic"])).toEqual([60, 62, 64, 67, 69, 72, 69, 67]);
    expect(await midis(COLOUR_SCALES["minor pentatonic"])).toEqual([60, 63, 65, 67, 70, 72, 70, 67]);
    expect(await midis(COLOUR_SCALES.blues)).toEqual([60, 63, 65, 66, 67, 70, 72, 70]);
  });
});
