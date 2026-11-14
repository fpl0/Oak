// Rhythm II (U13) in the matchers and the views, on real Strudel output: a pushed line compared with the target
// (`.early(1/16)` where the step asks for `.early(1/8)`), compound meter with the dotted-quarter beat (contracts
// §6.9), triplets, ghost notes, ties and dotted values as the staff writes them.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, Matcher } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { syncopation } from "../analyze/meter.ts";
import { pushesOf, rhythmView, tupletsOf } from "../analyze/wave6-views.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { runMatcher } from "./index.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };

describe("a pushed chord line against the target (pcset per onset)", () => {
  const PCSET: Matcher = { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] };
  const line = (shift: string): string =>
    `chords: chord("<C F G C>").voicing()${shift}.s("rhodes")\nbass: note("<c2 f2 g2 c2>").s("sawtooth")`;
  const check = async (answer: string, target = ".early(1/8)") => {
    const r = runMatcher(PCSET, await strudel(line(target), 4), await strudel(line(answer), 4), {
      meter: "4/4",
      key: C,
    });
    return {
      score: r.score,
      ids: r.diagnostics.map((d) => d.id),
      texts: r.diagnostics.map((d) => renderFeedback(d)),
    };
  };
  test("the eighth-note push passes", async () => {
    expect((await check(".early(1/8)")).score).toBe(1);
    expect((await check(".early(.125)")).score).toBe(1);
  });
  test("a sixteenth where the step asks for an eighth: one finding names both pushes", async () => {
    const r = await check(".early(1/16)");
    expect(r.score).toBeLessThan(0.5);
    expect(r.texts[0]).toBe(
      "The chords are right, but each starts a 16th later than in the target (your push lands a sixteenth note early; the step asks for an eighth note).",
    );
    // The per-onset finding stays once, as a note (a lesson that words `harmony.pcset` itself still has it).
    expect(r.ids).toEqual(["harmony.shifted", "harmony.pcset"]);
  });
  test("left on the beat, or pushed the wrong way, says how far off the chords are", async () => {
    expect((await check("")).texts[0]).toBe(
      "The chords are right, but each starts an 8th later than in the target.",
    );
    expect((await check(".late(1/8)")).texts[0]).toBe(
      "The chords are right, but each starts a beat later than in the target.",
    );
    // A chord that starts EARLIER than the target's is still sounding at the target's onset, so per-onset pitch
    // classes read it as there (0.8: its own onsets are extra). A step that needs the exact place asks for it
    // with an `events` or `rhythm` matcher beside this one.
    expect((await check(".early(1/8)", ".early(1/16)")).score).toBeCloseTo(0.8, 6);
  });
  test("other chords at the right time are still named chord by chord", async () => {
    const r = await check(".early(1/8).add(note(1))");
    expect(r.ids.every((id) => id === "harmony.pcset")).toBe(true);
  });
});

describe("pushes, as the views and the syncopation measure read them", () => {
  test(".early(1/8) is an eighth-note anticipation across the bar line; .early(1/16) a sixteenth", async () => {
    const eighth = await strudel('chords: chord("<C F G C>").voicing().early(1/8)', 4);
    const p = pushesOf(eighth.byTrack.chords ?? [], "4/4");
    expect(new Set(p.map((x) => x.by))).toEqual(new Set([8]));
    expect(p.every((x) => x.acrossBar)).toBe(true);
    const sixteenth = await strudel('chords: chord("<C F G C>").voicing().early(1/16)', 4);
    expect(new Set(pushesOf(sixteenth.byTrack.chords ?? [], "4/4").map((x) => x.by))).toEqual(new Set([16]));
    // On the beat: none; the measure of syncopation is 0 there and 3 for four pushed bars (the last is not counted).
    const plain = await strudel('chords: chord("<C F G C>").voicing()', 4);
    expect(pushesOf(plain.byTrack.chords ?? [], "4/4")).toEqual([]);
    expect(syncopation(plain.byTrack.chords ?? [], "4/4").count).toBe(0);
    const line = (await strudel('chords: note("<c3 f3 g3 c3>").early(1/8)', 4)).byTrack.chords ?? [];
    expect(syncopation(line, "4/4").count).toBe(3);
  });
});

describe("compound meter: the dotted quarter is the beat (contracts §6.9)", () => {
  test("6/8 at setcpm(60/2) is 60 BPM in two beats of three; dotted values, no tuplets", async () => {
    const n = await strudel(
      'setcpm(60/2)\nhats: s("hh*6")\nsnare: s("~ ~ ~ sd ~ ~")\nmel: note("c4@2 d4 e4@3").s("piano")',
      2,
    );
    const v = rhythmView(n, { meter: "6/8", bars: 2 });
    expect([v.tempoUnit, v.compound, v.beats, v.bpm]).toEqual(["dottedQuarter", true, 2, 60]);
    const of = (t: string) => v.tracks.find((x) => x.track === t);
    expect(of("hats")?.feel).toBe("ternary");
    expect(of("hats")?.tuplets).toEqual([]);
    // A quarter and an eighth, then a dotted quarter: the dotted quarter is written with its dot.
    expect(of("mel")?.written).toMatchObject({ dotted: 2, exact: true });
  });
  test("12/8 at setcpm(60/4) is 60 BPM in four beats; a duplet is the tuplet there", async () => {
    const n = await strudel('setcpm(60/4)\nhats: s("hh*12")\nkick: s("bd*8")', 1);
    const v = rhythmView(n, { meter: "12/8", bars: 1 });
    expect([v.beats, v.bpm]).toEqual([4, 60]);
    expect(tupletsOf(n.byTrack.hats ?? [], "12/8")).toEqual([]);
    expect(tupletsOf(n.byTrack.kick ?? [], "12/8").every((t) => t.division === 2)).toBe(true);
  });
  test("a rhythm in 6/8 is compared on its own grid: the snare on the fourth eighth", async () => {
    const RHYTHM: Matcher = {
      m: "rhythm",
      tol: rat(1, 32),
      durations: false,
      perRole: true,
      displacementCredit: 0.5,
    };
    const ref = await strudel('drums: s("bd ~ ~ sd ~ ~, hh*6")', 2);
    const same = runMatcher(RHYTHM, ref, await strudel('drums: s("bd ~ ~ sd ~ ~, hh*6")', 2), {
      meter: "6/8",
    });
    expect(same.score).toBe(1);
    // The snare an eighth late: one finding that names the part and the amount in the meter's own unit. Steady
    // hats on every eighth no longer make every slip read as "shifted an 8th".
    const late = runMatcher(RHYTHM, ref, await strudel('drums: s("bd ~ ~ ~ sd ~, hh*6")', 2), {
      meter: "6/8",
    });
    expect(late.diagnostics.map((d) => renderFeedback(d))).toEqual([
      "Right rhythm, shifted an 8th later on the snare. Check where it starts.",
    ]);
    // A snare left out is a missing part, not a shift.
    const none = runMatcher(RHYTHM, ref, await strudel('drums: s("bd ~ ~ ~ ~ ~, hh*6")', 2), {
      meter: "6/8",
    });
    expect(none.diagnostics.map((d) => renderFeedback(d))).toEqual(["No snare part found."]);
    // The whole kit a beat late is one finding, in the meter's own unit.
    const moved = runMatcher(RHYTHM, ref, await strudel('drums: s("sd ~ ~ bd ~ ~, hh*6")', 2), {
      meter: "6/8",
    });
    expect(moved.diagnostics.map((d) => renderFeedback(d))).toEqual([
      "Right rhythm, shifted a beat later on the kick and the snare. Check where it starts.",
    ]);
  });
});

describe("triplets, ties and dotted values in a simple meter", () => {
  test(".ply(3) is an eighth-note triplet on every beat; a bracket of three is one group", async () => {
    const n = await strudel(
      'hats: s("hh*4").ply(3)\nmel: note("c4@3 d4 e4@2 [f4 g4 a4] g4@2").s("piano")',
      1,
    );
    expect(tupletsOf(n.byTrack.hats ?? [], "4/4")).toEqual([
      { bar: 1, beat: 1, division: 3, span: 1 },
      { bar: 1, beat: 2, division: 3, span: 1 },
      { bar: 1, beat: 3, division: 3, span: 1 },
      { bar: 1, beat: 4, division: 3, span: 1 },
    ]);
    const v = rhythmView(n, { meter: "4/4", bars: 1 });
    expect(v.tracks.find((x) => x.track === "hats")?.feel).toBe("ternary");
  });
  test("a note tied over the bar line and a dotted quarter are counted as the staff writes them", async () => {
    // Two bars of 4/4 in eighths: a dotted quarter, an eighth, then a half tied over the bar line.
    const n = await strudel('mel: note("<[c4@3 d4 e4@4] [e4@2 d4@2 c4@4]>").s("piano")', 2);
    const tied = await strudel('mel: note("[c4@3 d4 e4@8 d4@2 c4@2]/2").s("piano")', 2);
    const plain = rhythmView(n, { meter: "4/4", bars: 2 }).tracks[0]?.written;
    const over = rhythmView(tied, { meter: "4/4", bars: 2 }).tracks[0]?.written;
    expect(plain).toMatchObject({ dotted: 1, tiesAcrossBar: 0, exact: true });
    expect(over).toMatchObject({ dotted: 1, tiesAcrossBar: 1, exact: true });
  });
  test("ghost notes are hits at .4 or less of full level; the view lists them", async () => {
    const n = await strudel('snare: s("sd*8").velocity("[1 .3]*4")', 1);
    const v = rhythmView(n, { meter: "4/4", bars: 1 }).tracks[0];
    expect(v?.ghosts.length).toBe(4);
    // On the eighths' off-beats, not on the sixteenths between them.
    expect(v?.ghostsOffbeat.length).toBe(0);
  });
});
