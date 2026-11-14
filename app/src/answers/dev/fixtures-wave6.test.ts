// The Wave 6 gallery examples are music too: the rhythms engrave as they are described (a tie over the bar line, a
// triplet, 6/8, "Swing 8ths"), the numerals name the chords the prompts print, the scales and chords are what they
// say, the form map is graded as the grader grades it, and every example checks right with its answer and wrong
// with its sample. Checked with @oak/notation, @oak/theory, @oak/grader and headless Strudel.
import { describe, expect, test } from "bun:test";
import { gradeFormMap } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { scoreRhythm } from "@oak/notation";
import {
  chordOfRoman,
  chromaticDegree,
  intervalFacts,
  METERS,
  modeColour,
  readChord,
  toLeadSheet,
} from "@oak/theory";
import { guideToneFacts, modeFact } from "../facts.ts";
import { formMapAnswer } from "../form-map.ts";
import { buildChord } from "../harmony.ts";
import { gridLayout, gridToCode, padRows } from "../keys.ts";
import { SYLLABLES } from "../normalize.ts";
import { emptyValue, isComplete, responseOf } from "../response.ts";
import { spellDegreeName } from "../scale.ts";
import { engrave, staffContext, staffNotes } from "../staff/model.ts";
import { rhythmContext, rhythmPalette, tripletGroupsOfValue } from "../staff/rhythm.ts";
import type { AnswerSpecOf } from "../types.ts";
import { FIXTURE_IDS } from "./fixture-ids.ts";
import { demoCheck, FIXTURES, stateOf } from "./fixtures.ts";
import {
  APPLIED_LOOP,
  CHROMATIC_PAD,
  COLOURS_G,
  FORM_MAP,
  G_MIXOLYDIAN,
  GRID_24,
  GRID_68,
  MIXOLYDIAN_LOOP,
  MODE_SCALES,
  PIVOT,
  RHYTHM_68,
  RHYTHM_LINE,
  RHYTHM_SWUNG,
  RHYTHM_TIED,
  RHYTHM_TRIPLET,
  SEVENTH_LOOP,
  W6_C_MAJOR,
  W6_G_MAJOR,
  WAVE6_FIXTURES,
} from "./fixtures-wave6.ts";

const byId = (id: string) => {
  const f = WAVE6_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const sym = (rn: string, key = W6_C_MAJOR) => {
  const c = chordOfRoman(rn, key);
  return c ? toLeadSheet(c) : null;
};
const staffOf = (id: string) => byId(id).spec as AnswerSpecOf<"staff-input">;

describe("Wave 6 gallery fixtures", () => {
  test("every example is listed, checks right with its answer and wrong with its sample", () => {
    expect(FIXTURES.map((f) => [f.id, f.kind])).toEqual(FIXTURE_IDS.map(([id, kind]) => [id, kind]));
    for (const f of WAVE6_FIXTURES) {
      expect(`${f.id}: ${demoCheck(f, f.expected).state}`).toBe(`${f.id}: correct`);
      expect(`${f.id}: ${demoCheck(f, f.sample).state}`).toBe(`${f.id}: wrong`);
      expect(`${f.id}: ${isComplete(f.spec, f.expected)}`).toBe(`${f.id}: true`);
      // The five states draw from real data.
      for (const s of ["idle", "pending", "correct", "wrong", "revealed"] as const)
        expect(stateOf(f, s).feedback.state).toBe(s);
    }
  });

  test("the staff rhythms engrave as described", () => {
    const tied = staffOf("staff-rhythm");
    const e1 = engrave(RHYTHM_TIED, staffContext(tied));
    expect(e1.ok && scoreRhythm(e1.score)).toMatchObject({
      ties: 1,
      tiesAcrossBar: 1,
      dotted: 1,
      exact: true,
    });
    // The tied A is one note for the grader: six notes, not seven.
    expect(e1.ok && staffNotes(e1.score)).toHaveLength(6);
    const trip = staffOf("staff-triplets");
    const e2 = engrave(RHYTHM_TRIPLET, staffContext(trip));
    expect(e2.ok && scoreRhythm(e2.score).tuplets).toEqual([{ p: 3, q: 2, r: 3, bar: 0 }]);
    expect(
      tripletGroupsOfValue(RHYTHM_TRIPLET, rhythmContext(staffContext(trip), rhythmPalette(trip))),
    ).toEqual([{ onset: [0, 1], span: [1, 4], base: 8 }]);
    // 6/8: two bars, each two dotted-quarter beats; the engraving writes the dotted quarter as one value.
    const e3 = engrave(RHYTHM_68, staffContext(staffOf("staff-68"), METERS["6/8"]));
    expect(e3.ok && scoreRhythm(e3.score)).toMatchObject({ ties: 0, dotted: 3, exact: true });
    expect(e3.ok && e3.abc.abc).toContain("M:6/8");
    // The rhythm line: every note on the middle line of the treble staff.
    const e4 = engrave(RHYTHM_LINE, staffContext(staffOf("staff-rhythm-line")));
    expect(e4.ok && new Set(staffNotes(e4.score).map((n) => n.pitches[0]?.name))).toEqual(new Set(["B4"]));
    // Written straight under "Swing 8ths" (contracts §6.10 item 3).
    const swing = byId("staff-swing").env?.staff?.swing;
    const e5 = engrave(RHYTHM_SWUNG, staffContext(staffOf("staff-swing")), swing ? { swing } : {});
    expect(e5.ok && e5.score.swingText).toBe("Swing 8ths");
    expect(e5.ok && e5.abc.abc).toContain("Swing 8ths");
    expect(e5.ok && scoreRhythm(e5.score).tuplets).toEqual([]);
  });

  test("the grids: 6/8 in two beats of three; 24 steps are six to a beat", async () => {
    const g = gridLayout(6, 2, { meter: METERS["6/8"] });
    expect(g.counts).toHaveLength(12);
    const code = gridToCode(["hit"], GRID_68, { stepsPerBar: 6, bars: 2, bpm: 60, beatsPerBar: g.beats });
    const r = await evalHeadless(code, 2);
    // Bar 1: the two beats. Bar 2: the two beats and the eighth before the bar line.
    expect(r.events.map((e) => Math.round(e.onset * 6))).toEqual([0, 3, 6, 9, 11]);
    expect(gridLayout(24, 1, { meter: METERS["4/4"] }).per).toBe(6);
    expect((GRID_24[0] as boolean[]).filter(Boolean)).toHaveLength(7);
  });

  test("the taps: the answer passes, the sample names what it missed", () => {
    for (const id of ["tap-push", "tap-triplets", "tap-68"]) {
      const f = byId(id);
      expect(demoCheck(f, f.expected).state).toBe("correct");
      const wrong = demoCheck(f, f.sample);
      expect(wrong.state === "wrong" && wrong.message).toMatch(/hits matched/);
    }
    const push = demoCheck(byId("tap-push"), byId("tap-push").sample);
    expect(push.state === "wrong" && push.message).toContain("Missed: 2 &.");
    const six = demoCheck(byId("tap-68"), byId("tap-68").sample);
    expect(six.state === "wrong" && six.marks?.filter((m) => !m.ok).map((m) => m.note)).toEqual(
      expect.arrayContaining(["no tap on 1 la", "no tap on 1 li"]),
    );
  });

  test("the seventh chords are what the prompts say", () => {
    // B D F A is half-diminished; Fmaj7 from F3; G7's guide tones are B and F.
    expect(readChord([59, 62, 65, 69], 59)?.quality).toBe("m7b5");
    const built = buildChord(byId("keyboard-seventh").expected as number[], W6_C_MAJOR);
    expect([built?.reading?.leadSheet, built?.reading?.inversion]).toEqual(["Fmaj7", 0]);
    expect(guideToneFacts(byId("guide-tones").expected as number[], "G7")?.map((g) => g.text)).toEqual([
      "F, the 7th of G7",
      "B, the 3rd of G7",
    ]);
    expect(intervalFacts("M10")).toMatchObject({ semitones: 16, simple: "M3", octaves: 1, compound: true });
  });

  test("the numerals name the chords printed in the prompts", () => {
    expect(SEVENTH_LOOP.map((rn) => sym(rn))).toEqual(["Cmaj7", "Am7", "Dm7", "G7"]);
    expect(APPLIED_LOOP.map((rn) => sym(rn))).toEqual(["C", "D7", "G7", "C"]);
    expect(COLOURS_G.map((rn) => sym(rn, W6_G_MAJOR))).toEqual(["G", "E7", "Am", "Cm", "G", "E♭", "F", "G"]);
    expect(MIXOLYDIAN_LOOP.map((rn) => sym(rn, G_MIXOLYDIAN))).toEqual(["G", "F", "C"]);
    // The pivot: Am is vi in C major and ii in G major.
    expect([sym(PIVOT[0] as string, W6_C_MAJOR), sym(PIVOT[1] as string, W6_G_MAJOR)]).toEqual(["Am", "Am"]);
  });

  test("the modes: G Mixolydian has F natural and a major 3rd; the builder starts from G major", async () => {
    const midis = async (code: string) => (await evalHeadless(code, 1)).events.map((e) => e.midi);
    const mixo = await midis(MODE_SCALES.mixolydian as string);
    expect(mixo).toEqual([67, 69, 71, 72, 74, 76, 77, 79]);
    expect(await midis(MODE_SCALES.dorian as string)).toEqual([67, 69, 70, 72, 74, 76, 77, 79]);
    expect(modeColour("mixolydian")?.colour).toBe("♭7");
    expect(modeFact("mixolydian", "G")).toContain("From G: F♯ becomes F.");
    const from = byId("scale-from");
    expect(emptyValue(from.spec)).toEqual(from.sample);
    // D natural minor on the keys, and D Dorian with B natural (71).
    const keys = byId("scale-from-keys");
    expect(emptyValue(keys.spec)).toEqual(keys.sample);
    expect((keys.expected as number[]).includes(71)).toBe(true);
  });

  test("the chromatic pad: ♯4 is fi and leans to 5; ♭7 is te", () => {
    expect(padRows(CHROMATIC_PAD)).not.toBeNull();
    expect([SYLLABLES["#4"], SYLLABLES.b7]).toEqual(["fi", "te"]);
    expect(chromaticDegree("#4")).toMatchObject({ syllable: "fi", resolvesTo: "5", step: "3#" });
    expect(spellDegreeName("C", "#4")).toBe("F#");
  });

  test("the form map is graded as the grader grades it", () => {
    const f = byId("form-map");
    const song = {
      answerKey: {
        sections: [
          { label: "A", bars: [1, 8] },
          { label: "A", bars: [9, 16] },
          { label: "B", bars: [17, 24] },
          { label: "A", bars: [25, 32] },
        ],
      },
    } as Parameters<typeof gradeFormMap>[1];
    const right = responseOf(f.spec, FORM_MAP);
    expect(right).toEqual({ answer: { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] } });
    expect(gradeFormMap(formMapAnswer(FORM_MAP), song).passed).toBe(true);
    // Other letters, the same shape.
    expect(gradeFormMap({ sections: ["X", "X", "Y", "X"], bars: [1, 9, 17, 25] }, song).score).toBe(1);
    // The sample misses the cut at bar 9: three of four sections stand where the tune's do.
    const sample = gradeFormMap(formMapAnswer(f.sample as string[]), song);
    expect([sample.passed, sample.score]).toEqual([false, 0.75]);
    // The gallery's stand-in marks agree with the grader on which sections count.
    const fb = demoCheck(f, f.sample);
    expect(fb.state === "wrong" && fb.marks?.map((m) => m.ok)).toEqual([true, true, true]);
    expect(emptyValue(f.spec)).toEqual(["1:"]);
  });
});
