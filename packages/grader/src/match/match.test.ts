// Matcher tests on real Strudel output. Every "wrong" answer is a known-wrong variant that must fail
// with the expected feedback code; every "right" answer must score 1.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Matcher } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext as NCtx } from "../types.ts";
import { runMatcher } from "./index.ts";
import { melodyMatch } from "./melody.ts";
import { bestDisplacement, matchOnsets } from "./rhythm.ts";

setDefaultTimeout(20_000);

const C44: NCtx = { meter: "4/4", key: { tonic: "C", mode: "major" } };
const ids = (r: MatchResult): string[] => r.diagnostics.map((d) => d.id);
async function run(m: Matcher, ref: string, ans: string, ctx: NCtx = C44, bars = 1): Promise<MatchResult> {
  return runMatcher(m, await strudel(ref, bars), await strudel(ans, bars), ctx);
}

const rhythm = (o: Partial<Extract<Matcher, { m: "rhythm" }>> = {}): Matcher => ({
  m: "rhythm",
  tol: rat(0),
  durations: false,
  perRole: true,
  displacementCredit: 0.5,
  ...o,
});
const melody = (
  pitch: Extract<Matcher, { m: "melody" }>["pitch"],
  o: Partial<Extract<Matcher, { m: "melody" }>> = {},
): Matcher => ({
  m: "melody",
  pitch,
  wPitch: 0.7,
  wRhythm: 0.3,
  rhythmTol: rat(0),
  ...o,
});

describe("onset matching", () => {
  test("exact rational intersection with tol 0; greedy with a window", () => {
    const m = matchOnsets([rat(0), rat(1, 4), rat(1, 2)], [rat(0), rat(1, 3), rat(1, 2)]);
    expect(m.pairs).toEqual([
      [0, 0],
      [2, 2],
    ]);
    expect(m.missing).toEqual([1]);
    expect(m.extra).toEqual([1]);
    const w = matchOnsets([rat(0), rat(1, 4)], [rat(1, 96), rat(25, 96)], rat(1, 48));
    expect(w.pairs.length).toBe(2);
  });
  test("tresillo moved by an 8th is found as a displacement", () => {
    const t = [rat(0), rat(3, 8), rat(6, 8)];
    const a = t.map((x) => [x[0] * 1 + x[1] / 8, x[1]] as const).map(() => rat(0));
    expect(a.length).toBe(3);
    const shifted = [rat(1, 8), rat(4, 8), rat(7, 8)];
    const best = bestDisplacement(t, shifted, rat(1), rat(1, 8));
    expect(best.f1).toBe(1);
    expect(best.shift).toEqual(rat(1, 8));
  });
});

describe("rhythm matcher", () => {
  test("the same backbeat scores 1", async () => {
    const r = await run(rhythm(), 's("bd sd bd sd, hh*8")', 's("bd sd bd sd, hh*8")');
    expect(r.score).toBe(1);
    expect(r.diagnostics).toEqual([]);
  });
  test("a missing snare on beat 4 is rhythm.missing at bar 1, beat 4, on the snare", async () => {
    const r = await run(rhythm(), 's("bd sd bd sd")', 's("bd sd bd ~")');
    expect(ids(r)).toEqual(["rhythm.missing"]);
    const d = r.diagnostics[0];
    expect(d?.where?.bar).toBe(1);
    expect(d?.where?.beatLabel).toBe("4");
    expect(renderFeedback(d as never)).toBe("Bar 1, 4: missing hit (snare).");
    expect(r.score).toBeLessThan(1);
  });
  test("an extra kick on the & of 2 is rhythm.extra", async () => {
    const r = await run(rhythm(), 's("bd sd bd sd")', 's("bd [sd bd] bd sd")');
    expect(ids(r)).toContain("rhythm.extra");
    expect(r.diagnostics.find((d) => d.id === "rhythm.extra")?.where?.beatLabel).toBe("2&");
  });
  test("a part the target has and the answer lacks is rhythm.role-missing", async () => {
    const r = await run(rhythm(), 's("bd sd bd sd, hh*8")', 's("bd sd bd sd")');
    expect(ids(r)).toContain("rhythm.role-missing");
  });
  test("tresillo shifted an 8th later: rhythm.displaced replaces per-note errors; score = displacement credit", async () => {
    const r = await run(rhythm(), 's("hh(3,8)")', 's("hh(3,8)").late(1/8)');
    expect(ids(r)).toEqual(["rhythm.displaced"]);
    expect(r.diagnostics[0]?.params.shiftLabel).toBe("an 8th later");
    expect(r.score).toBe(0.5);
  });
  test("swing declared: a straight answer matches its onsets and gets rhythm.swing-missing", async () => {
    const ctx: NCtx = { ...C44, swing: { subdivision: 8, amount: 1 / 3 } };
    const right = await run(rhythm(), 's("hh*8").swingBy(1/3, 4)', 's("hh*8").swingBy(1/3, 4)', ctx);
    expect(right.score).toBe(1);
    expect(right.diagnostics).toEqual([]);
    const straight = await run(rhythm(), 's("hh*8").swingBy(1/3, 4)', 's("hh*8")', ctx);
    expect(straight.score).toBe(1);
    expect(ids(straight)).toEqual(["rhythm.swing-missing"]);
  });
  test("an answer that swings where the target is straight: onsets still match, swing-missing reported", async () => {
    const r = await run(rhythm(), 's("hh*8")', 's("hh*8").swing(4)');
    expect(r.score).toBe(1);
    expect(ids(r)).toEqual(["rhythm.swing-missing"]);
  });
  test("triplets against straight 8ths is rhythm.subdivision", async () => {
    const r = await run(rhythm(), 's("hh*8")', 's("[hh hh hh]*4")');
    expect(ids(r)).toContain("rhythm.subdivision");
  });
  test("a different loop length is rhythm.period", async () => {
    const r = await run(rhythm(), 's("<[bd sd] [bd bd]>")', 's("bd sd")', C44, 4);
    expect(ids(r)).toContain("rhythm.period");
  });
  test("durations of a monophonic line: rhythm.duration names both lengths", async () => {
    const r = await run(rhythm({ durations: true }), 'note("c4 [e4 g4] c5@2")', 'note("c4 [e4 g4] c5 ~")');
    expect(ids(r)).toEqual(["rhythm.duration"]);
    expect(r.diagnostics[0]?.params).toEqual({ got: "a beat", expected: "2 beats" });
    expect(r.score).toBeCloseTo(0.8 + 0.2 * (3 / 4), 6);
  });
  test("a pickup written on the downbeat is rhythm.pickup-missing (3/4, one-beat pickup)", async () => {
    const ctx: NCtx = { meter: "3/4", key: { tonic: "C", mode: "major" }, pickup: { units: rat(1) } };
    const ref = 'n("<[~ ~ 4] [0 ~ 2] [4 4 2] [0 ~ ~]>").scale("C4:major")';
    const ans = 'n("<[~ 4 ~] [0 ~ 2] [4 4 2] [0 ~ ~]>").scale("C4:major")';
    const shifted = 'n("<[4 0 ~] [2 4 4] [2 0 ~] [~ ~ ~]>").scale("C4:major")';
    const r = await run(rhythm({ perRole: false }), ref, shifted, ctx, 4);
    expect(ids(r)).toEqual(["rhythm.pickup-missing"]);
    expect(r.score).toBeGreaterThanOrEqual(0.5);
    const wrong = await run(rhythm({ perRole: false }), ref, ans, ctx, 4);
    expect(ids(wrong)).toContain("rhythm.missing");
  });
});

describe("melody matcher", () => {
  const ref = 'n("0 2 4 2 1 3 2 0").scale("C4:major")';
  test("the same tune scores 1", async () => {
    const r = await run(melody("key-relative"), ref, ref);
    expect(r.score).toBe(1);
    expect(r.diagnostics).toEqual([]);
  });
  test("every n one too high: melody.index-shift replaces the per-note errors", async () => {
    const r = await run(melody("key-relative"), ref, 'n("1 3 5 3 2 4 3 1").scale("C4:major")');
    expect(ids(r)).toEqual(["melody.index-shift"]);
    expect(r.diagnostics[0]?.params).toMatchObject({ dir: "too high", deg: "1", idx: 0 });
    expect(r.score).toBeLessThan(0.5);
  });
  test("by ear, a bass line typed with its degrees (C G A F as D A B G) is the index slip, not D major", async () => {
    // By-ear steps report like a transcription teacher (`transcription`): a whole tune in another key is one
    // `melody.wrong-key`; a line one scale step off inside the key is the n-from-0 slip.
    const byEar = async (ref: string, ans: string): Promise<MatchResult> =>
      melodyMatch(
        await strudel(ref, 4),
        await strudel(ans, 4),
        melody("absolute", { track: "bass" }) as Extract<Matcher, { m: "melody" }>,
        { ...C44, transcription: true },
      );
    const bass = (p: string) => `bass: n("<${p}>").scale("C2:major").s("piano")`;
    const r = await byEar(bass("0 4 5 3"), bass("1 5 6 4"));
    expect(ids(r)).toContain("melody.index-shift");
    expect(ids(r)).not.toContain("melody.wrong-key");
    // The same slip written as letters stays the slip; a tune that leaves the key (C E G C as D F♯ A D) is
    // the wrong key.
    const letters = await byEar(
      'bass: note("<c2 g2 a2 f2>").s("piano")',
      'bass: note("<d2 a2 b2 g2>").s("piano")',
    );
    expect(ids(letters)).toContain("melody.index-shift");
    const out = await byEar(
      'bass: note("<c2 e2 g2 c3>").s("piano")',
      'bass: note("<d2 f#2 a2 d3>").s("piano")',
    );
    expect(ids(out)).toContain("melody.wrong-key");
    expect(ids(out)).not.toContain("melody.index-shift");
  });
  test("one wrong note: melody.wrong-degree with degrees and syllables at its bar and beat", async () => {
    const r = await run(melody("key-relative"), ref, 'n("0 2 4 2 1 3 2 4").scale("C4:major")');
    expect(ids(r)).toEqual(["melody.wrong-degree"]);
    const d = r.diagnostics[0];
    expect(d?.params).toEqual({ got: "5", gotSyl: "sol", exp: "1", expSyl: "do", line: "melody" });
    expect(d?.where?.beatLabel).toBe("4&");
    expect(renderFeedback(d as never)).toBe("Bar 1, 4&: you have 5 (sol); the melody has 1 (do).");
  });
  test("an octave slip in absolute mode is melody.octave", async () => {
    const r = await run(melody("absolute"), 'note("c4 e4 g4 c5")', 'note("c4 e4 g4 c4")');
    expect(ids(r)).toEqual(["melody.octave"]);
    expect(r.diagnostics[0]?.params.dir).toBe("lower");
    expect(r.dims.pitch?.score).toBeCloseTo(1 - 0.5 / 4, 6);
  });
  test("the tune in D against C: transposition-invariant passes with melody.transposed", async () => {
    const r = await run(melody("transposition-invariant"), 'note("c4 d4 e4 c4")', 'note("d4 e4 f#4 d4")');
    expect(r.score).toBe(1);
    expect(ids(r)).toEqual(["melody.transposed"]);
    expect(r.diagnostics[0]?.params).toMatchObject({ gotKey: "D major", expKey: "C major" });
  });
  test("key-relative reads each side in its own key: D-major scale degrees match", async () => {
    const r = await run(melody("key-relative"), ref, 'n("0 2 4 2 1 3 2 0").scale("D4:major")');
    expect(r.score).toBe(1);
    expect(ids(r)).toEqual(["melody.transposed"]);
  });
  test("a dropped note is melody.missing-note at the target's position", async () => {
    const r = await run(
      melody("key-relative"),
      'n("0 2 4 2").scale("C4:major")',
      'n("0 ~ 4 2").scale("C4:major")',
    );
    expect(ids(r)).toContain("melody.missing-note");
    expect(r.diagnostics.find((d) => d.id === "melody.missing-note")?.params.exp).toBe("3");
  });
  test("right pitches, wrong rhythm: melody.rhythm-only", async () => {
    const r = await run(
      melody("key-relative"),
      'n("0 2 4 2").scale("C4:major")',
      'n("0 [2 4] 2 ~").scale("C4:major")',
    );
    expect(ids(r)).toContain("melody.rhythm-only");
    expect(r.dims.pitch?.score).toBe(1);
    expect(r.dims.rhythm?.score).toBeLessThan(1);
  });
  test("right shape, wrong sizes: melody.contour-right", async () => {
    const r = await run(melody("absolute"), 'note("c4 d4 e4 d4 c4")', 'note("c4 e4 g4 e4 c4")');
    expect(ids(r)).toContain("melody.contour-right");
  });
});

describe("harmony matcher", () => {
  const harmony = (o: Partial<Extract<Matcher, { m: "harmony" }>> = {}): Matcher => ({
    m: "harmony",
    level: "rn",
    qualityDepth: "triad",
    inversion: false,
    harmonicRhythm: "given",
    ...o,
  });
  const axis = 'chords: chord("<C G Am F>").voicing()';
  test("the same loop scores 1; G7 for G passes at triad depth", async () => {
    expect((await run(harmony(), axis, axis, C44, 4)).score).toBe(1);
    const sev = await run(harmony(), axis, 'chords: chord("<C G7 Am F>").voicing()', C44, 4);
    expect(sev.score).toBe(1);
  });
  test("G7 for G at seventh depth: half credit and harmony.quality", async () => {
    const r = await run(
      harmony({ level: "quality", qualityDepth: "seventh" }),
      axis,
      'chords: chord("<C G7 Am F>").voicing()',
      C44,
      4,
    );
    expect(ids(r)).toEqual(["harmony.quality"]);
    expect(r.diagnostics[0]?.where?.slot).toBe(2);
    expect(r.dims.quality?.score).toBeCloseTo((3 + 0.5) / 4, 6);
  });
  test("Dm for F (ii for IV) at level rn: harmony.rn names both numerals", async () => {
    const r = await run(harmony(), axis, 'chords: chord("<C G Am Dm>").voicing()', C44, 4);
    expect(ids(r)).toEqual(["harmony.rn"]);
    expect(r.diagnostics[0]?.params).toEqual({ got: "ii", exp: "IV" });
    expect(r.diagnostics[0]?.where?.bar).toBe(4);
  });
  test("F minor for F major at level rn: harmony.rn-case (iv for IV)", async () => {
    const r = await run(harmony(), axis, 'chords: chord("<C G Am Fm>").voicing()', C44, 4);
    expect(ids(r)).toEqual(["harmony.rn-case"]);
    expect(r.diagnostics[0]?.params).toEqual({ got: "iv", exp: "IV" });
  });
  test("A major for A minor is an applied chord, not a case slip: harmony.rn names V/ii", async () => {
    const r = await run(harmony(), axis, 'chords: chord("<C G A F>").voicing()', C44, 4);
    expect(ids(r)).toEqual(["harmony.rn"]);
    expect(r.diagnostics[0]?.params).toEqual({ got: "V/ii", exp: "vi" });
  });
  test("the loop started on another chord: harmony.schema-rotation", async () => {
    const r = await run(harmony(), axis, 'chords: chord("<G Am F C>").voicing()', C44, 4);
    expect(ids(r)).toContain("harmony.schema-rotation");
  });
  test("a separate bass track sets the inversion: C/E for C is harmony.bass at level full", async () => {
    const ref = 'chords: chord("<C F G C>").voicing()\nbass: note("<c2 f2 g2 c2>")';
    const ans = 'chords: chord("<C F G C>").voicing()\nbass: note("<e2 f2 g2 c2>")';
    const r = await run(harmony({ level: "full", inversion: true }), ref, ans, C44, 4);
    expect(ids(r)).toContain("harmony.bass");
    expect(r.diagnostics.find((d) => d.id === "harmony.bass")?.params).toMatchObject({ got: "E", exp: "C" });
    expect(ids(r)).toContain("harmony.inversion");
  });
  test("a chord held through two bars where the target changes: harmony.missing-chord", async () => {
    const r = await run(
      harmony({ harmonicRhythm: "graded" }),
      axis,
      'chords: chord("<C C Am F>").voicing()',
      C44,
      4,
    );
    expect(r.score).toBeLessThan(1);
    expect(ids(r).some((x) => x === "harmony.rn" || x === "harmony.missing-chord")).toBe(true);
  });
  test("pcset: a hand voicing with the same pitch classes passes; a wrong 3rd fails with harmony.pcset", async () => {
    const pc: Matcher = { m: "pcset", perOnset: true, bass: false };
    const ref = 'chords: chord("<C Am>").voicing()';
    expect((await run(pc, ref, 'chords: note("<[c3,e3,g3] [a2,c3,e3]>")', C44, 2)).score).toBe(1);
    const wrong = await run(pc, ref, 'chords: note("<[c3,eb3,g3] [a2,c3,e3]>")', C44, 2);
    expect(ids(wrong)).toEqual(["harmony.pcset"]);
    expect(wrong.diagnostics[0]?.params).toMatchObject({ exp: "C E G" });
  });
  test("pcset names the notes as the chord they make: C E G♯ for C+, B D♯ F♯ for B (U05.L03)", async () => {
    const pc: Matcher = { m: "pcset", perOnset: true, bass: false };
    const aug = await run(pc, 'chords: note("[c3,e3,g#3]")', 'chords: note("[c3,e3,g3]")');
    expect(aug.diagnostics[0]?.params).toMatchObject({ exp: "C E G#", got: "C E G" });
    const b = await run(pc, 'chords: note("[b2,d#3,f#3]")', 'chords: note("[b2,d3,f#3]")');
    expect(b.diagnostics[0]?.params).toMatchObject({ exp: "B D# F#", got: "B D F#" });
    // Not a chord (a cluster): spelled by the key, low to high.
    const cl = await run(pc, 'chords: note("[c3,e3,g3]")', 'chords: note("[c3,d3,e3]")');
    expect(cl.diagnostics[0]?.params).toMatchObject({ exp: "C E G", got: "C D E" });
  });
  test("pcset with bass: the right notes over the wrong bass is harmony.bass", async () => {
    const pc: Matcher = { m: "pcset", perOnset: true, bass: true };
    const r = await run(pc, 'chords: note("[c3,e3,g3]")', 'chords: note("[e3,g3,c4]")');
    expect(ids(r)).toEqual(["harmony.bass"]);
    expect(r.score).toBe(0.75);
  });
});

describe("events and all", () => {
  test("events: exact match passes; a wrong pitch is melody.wrong-degree, a missing drum rhythm.missing", async () => {
    const m: Matcher = {
      m: "events",
      pitch: "absolute",
      rhythm: "onsets",
      durations: false,
      sound: "drum-role",
    };
    expect((await run(m, 'note("c4 e4 g4")', 'note("c4 e4 g4")')).score).toBe(1);
    const wrong = await run(m, 'note("c4 e4 g4")', 'note("c4 f4 g4")');
    expect(ids(wrong)).toEqual(["melody.wrong-degree"]);
    const drums = await run(m, 's("bd sd")', 's("bd ~")');
    expect(ids(drums)).toEqual(["rhythm.missing"]);
  });
  test("all: every member must be perfect for a perfect score", async () => {
    const m: Matcher = { m: "all", of: [rhythm({ perRole: false }), melody("absolute")] };
    expect((await run(m, 'note("c4 e4")', 'note("c4 e4")')).score).toBe(1);
    const r = await run(m, 'note("c4 e4")', 'note("c4 f4")');
    expect(r.score).toBeLessThan(1);
    expect(ids(r)).toEqual(["melody.wrong-degree"]);
  });
});
