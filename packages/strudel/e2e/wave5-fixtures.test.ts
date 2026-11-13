// The music wave5.pw.ts plays is what it claims: the C3 arrangement is 90 seconds of verse–chorus form that the
// grader reads as such, its chorus brings sounds the verse never plays, and the bass and blues fixtures name the
// pitches they say. Headless Strudel 1.2.6 (@oak/grader/testing) and @oak/theory.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { sectionsFromAst } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol } from "@oak/theory";
import { followLearnerForm, formBarsOf, learnerSectionsOf } from "../src/band-form.ts";
import {
  BLUES_NOTES,
  C3_ARRANGEMENT,
  C3_BARS,
  C3_CHORUS_CYCLE,
  C3_CHORUS_ONLY,
  C3_SECTIONS,
  DOMINANT_SEVENTHS,
  U08_BASS_LINE,
} from "./wave5-fixtures.ts";

setDefaultTimeout(60_000);

describe("the C3 arrangement", () => {
  test("verse chorus verse chorus outro, consistent across every arranged track, 90 s at 96 BPM", async () => {
    const s = sectionsFromAst(C3_ARRANGEMENT);
    if (!s || "inconsistent" in s) throw new Error(`sections not read: ${JSON.stringify(s)}`);
    expect(s.sections.map((x) => x.bars)).toEqual([...C3_SECTIONS]);
    expect(s.sections.map((x) => x.label)).toEqual(["verse", "chorus", "verse", "chorus", "verse"]);
    expect(formBarsOf(C3_ARRANGEMENT)).toBe(C3_BARS);
    expect(learnerSectionsOf(C3_ARRANGEMENT)?.map((x) => x.type)).toEqual([
      "verse",
      "chorus",
      "verse",
      "chorus",
      "verse",
    ]);
    expect((C3_BARS * 4 * 60) / 96).toBe(90);
  });

  test("the chorus brings sounds the verse never plays, first at bar 9", async () => {
    const r = await evalHeadless(C3_ARRANGEMENT, C3_BARS);
    const sounds = (from: number, to: number) =>
      new Set(r.events.filter((e) => e.onset >= from && e.onset < to).map((e) => String(e.value.s)));
    const verse = sounds(0, C3_CHORUS_CYCLE);
    const chorus = sounds(C3_CHORUS_CYCLE, 16);
    for (const s of C3_CHORUS_ONLY) {
      expect(verse.has(s), s).toBe(false);
      expect(chorus.has(s), s).toBe(true);
    }
    expect(r.events.length).toBeGreaterThan(900);
    // nothing plays past bar 36's end that is not the loop again
    expect(Math.max(...r.events.map((e) => e.onset))).toBeLessThan(C3_BARS);
  });

  test("a Band in sections under it would follow V C V C and the outro", () => {
    const band = "drums: arrange([4, drumsVerse], [4, drumsChorus])";
    expect(followLearnerForm(band, C3_ARRANGEMENT)).toBe(
      "drums: arrange([8, drumsVerse], [8, drumsChorus], [8, drumsVerse], [8, drumsChorus], [4, drumsVerse])",
    );
  });
});

describe("bass and blues fixtures", () => {
  test("U08.L05's hook bass is C2 C2 G2 | A2 A2 E3 | F2 F2 C3 | G2 G2 D3", async () => {
    const r = await evalHeadless(`bass: ${U08_BASS_LINE}.s("ebass")`, 4);
    expect(r.events.map((e) => e.midi)).toEqual([36, 36, 43, 45, 45, 52, 41, 41, 48, 43, 43, 50]);
  });

  test("the blue-note fixtures are E blues (E G A B♭ B D) and the sevenths are C7, F7, G7", () => {
    const pcs = [...new Set(BLUES_NOTES.map((m) => m % 12))].sort((a, b) => a - b);
    expect(pcs).toEqual([4, 7, 9, 10].sort((a, b) => a - b)); // E G A B♭: the root, ♭3, 4 and the blue ♭5
    for (const [i, name] of ["C7", "F7", "G7"].entries()) {
      const chord = parseChordSymbol(name);
      if (!chord) throw new Error(name);
      const want = [...chordPcs(chord)].sort((a, b) => a - b);
      const got = [...new Set((DOMINANT_SEVENTHS[i] as readonly number[]).map((m) => m % 12))].sort(
        (a, b) => a - b,
      );
      expect(got, name).toEqual(want);
    }
  });
});
