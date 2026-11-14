// d6 (Wave 5 carry-over): `must-use` accepts a SoundId; a riff with single-note bars is counted by `motif-reuse`
// when its rhythm repeats (C5: a riff on 8 of 12 bars with two one-note bars scored 7/12 = 58 %); the controls
// matcher's defaults are in match/controls.test.ts. The pinned leniencies (bass a bar late, a third as an
// approach, |ΔE| contrast) are product decisions and stay as they are.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AstConstraint, RubricRule } from "@oak/content-kit";
import { AstConstraintSchema } from "@oak/content-kit/zod";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { melodyLine, motifReuse } from "../analyze/melody.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { evalRule } from "../rubric/rules.ts";
import { checkConstraints, editsOnlyRegions } from "./constraints.ts";

setDefaultTimeout(30_000);
const input = (code: string) => ({ code, starter: "", params: {}, meter: "4/4" as const });

describe("must-use and must-not-use take a sound", () => {
  const rhodes: AstConstraint = { c: "must-use", tool: "snd.rhodes" };
  test("the schema accepts a sound ID beside a toolbox ID", () => {
    expect(AstConstraintSchema.safeParse(rhodes).success).toBe(true);
    expect(AstConstraintSchema.safeParse({ c: "must-use", tool: ["tb.scale", "snd.rhodes"] }).success).toBe(
      true,
    );
    expect(AstConstraintSchema.safeParse({ c: "must-not-use", tool: "snd.piano" }).success).toBe(true);
    expect(AstConstraintSchema.safeParse({ c: "must-use", tool: "scale.dorian" }).success).toBe(false);
  });
  test("the sound is read where the code names it: s(), sound(), patterns of sounds", () => {
    const ok = (code: string) => checkConstraints([rhodes], input(code))[0]?.ok;
    expect(ok('chords: chord("<C F>").voicing().s("rhodes")')).toBe(true);
    expect(ok('chords: note("c3").sound("<piano rhodes>")')).toBe(true);
    expect(ok('chords: chord("<C F>").voicing().s("piano")')).toBe(false);
    // The word inside a comment or another string is not a use.
    expect(ok('chords: note("c3").s("piano") // not the rhodes')).toBe(false);
  });
  test("the message names the sound as it is written", () => {
    const row = checkConstraints([rhodes], input('chords: note("c3").s("piano")'))[0];
    expect(row?.diag && renderFeedback(row.diag)).toBe("Use `rhodes` here.");
    const not = checkConstraints(
      [{ c: "must-not-use", tool: "snd.piano", why: "this step is about the Rhodes." }],
      input('chords: note("c3").s("piano")'),
    )[0];
    expect(not?.ok).toBe(false);
    expect(not?.diag && renderFeedback(not.diag)).toBe(
      "Solve this without `piano`: this step is about the Rhodes.",
    );
  });
  test("with the lint's own reading (toolsUsed) a sound ID resolves as any tool does", () => {
    const toolsUsed = (code: string) => (/s\("rhodes"\)/.test(code) ? [{ id: "snd.rhodes" }] : []);
    expect(checkConstraints([rhodes], { ...input('a: note("c3").s("rhodes")'), toolsUsed })[0]?.ok).toBe(
      true,
    );
    expect(checkConstraints([rhodes], { ...input('a: note("c3").s("piano")'), toolsUsed })[0]?.ok).toBe(
      false,
    );
  });
});

describe("motif-reuse: one-note bars count when their rhythm repeats", () => {
  // A twelve-bar riff as C5 has it: the riff on bars 1–2, 5–6, 9–10 (and its move with the chords), an answer
  // in bar 3 of each line, and a landing note in bar 4 of each line.
  const RIFF = "[c4 eb4 e4 g4 ~ g4 bb4 ~]";
  const ANSWER = "[g4 f4 eb4 c4]";
  const LAND = "c4";
  const twelve = `mel: note("<${[RIFF, RIFF, ANSWER, LAND, RIFF, RIFF, ANSWER, LAND, RIFF, RIFF, ANSWER, LAND].join(" ")}>").s("piano")`;
  test("the landing bars reuse each other: 9 of 12 bars, not 7", async () => {
    const n = await strudel(twelve, 12);
    const m = motifReuse(melodyLine(n.byTrack.mel ?? []), 1, { periodBars: 12 });
    // Bars 2, 5, 6, 9, 10 (the riff again), 7 and 11 (the answer again), 8 and 12 (the landing note again).
    expect([m.matched, m.units]).toEqual([9, 12]);
    expect(m.reusedAt).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  test("C5's line: a riff on 8 of 12 bars with two one-note bars now meets 0.6", async () => {
    const other = ["[e4 g4 a4 c5]", "[d4 f4 a4 f4]"];
    const code = `mel: note("<${[RIFF, RIFF, RIFF, LAND, RIFF, RIFF, other[0], RIFF, RIFF, other[1], RIFF, LAND].join(" ")}>").s("piano")`;
    const n = await strudel(code, 12);
    const rule = {
      id: "riff",
      label: "riff",
      required: true,
      skills: [],
      rule: "motif-reuse",
      track: "mel",
      minRatio: 0.6,
    } as unknown as RubricRule;
    const out = evalRule(rule, n, { meter: "4/4", code, params: {}, bars: 12, totalBars: 12 });
    // 7 riff bars reuse the first, and the second landing bar reuses the first: 8 of 12 (it was 7: 58 %).
    expect(out.value).toBeCloseTo(8 / 12, 6);
    expect(out.ok).toBe(true);
  });
  test("a one-note bar with another rhythm, and a lone one-note bar, do not count", async () => {
    const n = await strudel(`mel: note("<${RIFF} c4 ${RIFF} [~ c4]>").s("piano")`, 4);
    const m = motifReuse(melodyLine(n.byTrack.mel ?? []), 1, { periodBars: 4 });
    expect(m.reusedAt).toEqual([2]);
  });
});

describe("edit-only-regions: an edit between two regions is outside them", () => {
  const starter = 'chords: chord("<Em ⟪Am⟫ B ⟪Em⟫>").voicing()';
  const only = (code: string) => editsOnlyRegions(starter, code);
  test("edits inside the regions pass, of any length", () => {
    expect(only('chords: chord("<Em A B E>").voicing()')).toBe(true);
    expect(only('chords: chord("<Em [A D] B E>").voicing()')).toBe(true);
    expect(only('chords: chord("<Em Am B Em>").voicing()')).toBe(true);
  });
  test("a fixed chord changed between the regions is flagged, as before the first and after the last are", () => {
    // `Bm` for `B`: it used to read as an edit of the next region.
    expect(only('chords: chord("<Em A Bm E>").voicing()')).toBe(false);
    expect(only('chords: chord("<Em A B7 E>").voicing()')).toBe(false);
    expect(only('chords: chord("<E A B E>").voicing()')).toBe(false);
    expect(only('chords: chord("<Em A B E>").voicing().s("piano")')).toBe(false);
  });
  test("one region: the chord before it is fixed; white space inside a region is the learner's", () => {
    const one = 'chords: chord("<G C ⟪C⟫ G>").voicing()';
    expect(editsOnlyRegions(one, 'chords: chord("<G C Cm G>").voicing()')).toBe(true);
    expect(editsOnlyRegions(one, 'chords: chord("<G C  Cm  G>").voicing()')).toBe(true);
    expect(editsOnlyRegions(one, 'chords: chord("<G Cm C G>").voicing()')).toBe(false);
    // An empty region beside a token (no space between) still takes anything.
    expect(
      editsOnlyRegions('mel: n("0 2").scale("C4:major")⟪⟫', 'mel: n("0 2").scale("C4:major").early(1/8)'),
    ).toBe(true);
  });
});

test("edit-only-regions: punctuation beside a region delimits itself (A1.L01: a list written tight)", () => {
  const starter = 'mel: note("a2").s("sawtooth").partials([1, ⟪0, 0, 0⟫])';
  expect(editsOnlyRegions(starter, 'mel: note("a2").s("sawtooth").partials([1,1,1,1])')).toBe(true);
  expect(editsOnlyRegions(starter, 'mel: note("a2").s("sawtooth").partials([1, 1, 1, 1])')).toBe(true);
  expect(editsOnlyRegions(starter, 'mel: note("a2").s("sawtooth").partials([2, 1, 1, 1])')).toBe(false);
  // A number beside a region is a word: gluing a digit onto it changes it.
  expect(editsOnlyRegions('mel: n("0 ⟪2⟫ 4")', 'mel: n("0 3 4")')).toBe(true);
  expect(editsOnlyRegions('mel: n("0 ⟪2⟫ 4")', 'mel: n("0 24")')).toBe(false);
});
