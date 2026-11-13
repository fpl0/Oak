// The Wave 4 harmony view (docs/design/wave4.md §3.2), on real Strudel output. Facts checked by hand in C major:
// [0,2,4] [4,6,8] [5,7,9] [3,5,7] over C4:major = C G Am F = I V vi IV (T D T PD).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { R } from "@oak/content-kit";
import { strudel } from "./__support__/fixtures.ts";
import { harmonyView } from "./harmony-view.ts";

setDefaultTimeout(20_000);
const C = { tonic: "C", mode: "major" } as const;

describe("harmonyView", () => {
  test("chords per bar with symbol, numeral and function; one change per bar", async () => {
    const n = await strudel(
      `chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C4:major").s("piano")
mel: n("<[2 1 0 ~] 4 [2 ~] 0>").scale("C5:major").s("piano")`,
      4,
    );
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 4 });
    expect(v.key).toEqual(C);
    expect(v.slots.map((s) => s.symbol)).toEqual(["C", "G", "Am", "F"]);
    expect(v.slots.map((s) => s.rn)).toEqual(["I", "V", "vi", "IV"]);
    expect(v.slots.map((s) => s.function)).toEqual(["T", "D", "T", "PD"]);
    expect(v.slots[2]?.pcs).toEqual([0, 4, 9]);
    expect(v.harmonicRhythm).toEqual([1, 1, 1, 1]);
    expect(v.beats).toHaveLength(16);
    expect(v.beats[0]).toMatchObject({ bar: 1, beat: 1, chord: 0, change: true });
    expect(v.beats[1]).toMatchObject({ bar: 1, beat: 2, chord: 0, change: false });
    expect(v.beats[4]).toMatchObject({ bar: 2, beat: 1, chord: 1, change: true });
    // Bar 1: E (chord tone) D (passing) C (chord tone).
    const bar1 = v.melody.filter((m) => m.bar === 1);
    expect(bar1.map((m) => [m.midi, m.role])).toEqual([
      [76, "chord-tone"],
      [74, "passing"],
      [72, "chord-tone"],
    ]);
    expect(bar1[0]?.strongBeat).toBe(true);
    expect(bar1[1]?.strongBeat).toBe(false);
    expect(bar1[2]?.strongBeat).toBe(true);
    expect(v.pickup).toBe(false);
  });

  test("symbols are spelled in the key: iii in A major is C♯m, vii° in D major is C♯° (Wave 4 gate)", async () => {
    const a = await strudel(`chords: n("<[0,2,4] [2,4,6]>").scale("A3:major").s("piano")`, 2);
    const va = harmonyView(a, { meter: "4/4", key: { tonic: "A", mode: "major" }, bars: 2 });
    expect(va.slots.map((s) => [s.symbol, s.rn])).toEqual([
      ["A", "I"],
      ["C♯m", "iii"],
    ]);
    const d = await strudel(`chords: n("<[0,2,4] [6,8,10]>").scale("D3:major").s("piano")`, 2);
    const vd = harmonyView(d, { meter: "4/4", key: { tonic: "D", mode: "major" }, bars: 2 });
    expect(vd.slots[1]?.symbol).toBe("C♯°");
  });

  test("a bass track sets the inversion: C – G/B is I – V6", async () => {
    const n = await strudel(
      `chords: n("<[0,2,4] [4,6,8]>").scale("C4:major").s("piano")
bass: note("<c2 b1>").s("piano")`,
      2,
    );
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 2 });
    expect(v.slots.map((s) => [s.symbol, s.rn, s.inversion])).toEqual([
      ["C", "I", 0],
      ["G/B", "V6", 1],
    ]);
    expect(v.slots[1]?.bassPc).toBe(11);
  });

  test("a pickup bar is bar 0 and the first full bar is bar 1", async () => {
    const n = await strudel(
      `chords: n("<~ [0,2,4] [3,5,7]>").scale("C4:major").s("piano")
mel: n("<[~ ~ 4] 2 0>").scale("C5:major").s("piano")`,
      3,
    );
    const v = harmonyView(n, { meter: "3/4", key: C, bars: 3, pickup: { units: [1, 1] } });
    expect(v.pickup).toBe(true);
    expect(v.beats).toHaveLength(9);
    expect(v.beats[0]).toMatchObject({ bar: 0, chord: null });
    expect(v.melody[0]).toMatchObject({ bar: 0, role: "no-chord" });
    expect(v.beats[3]).toMatchObject({ bar: 1, beat: 1, chord: 0, change: true });
    expect(R.eq(v.slots[0]?.span[0] ?? [0, 1], [1, 1])).toBe(true);
  });

  test("chord().voicing(): identity from the symbol; a bass track decides the inversion (C – G/B – Am – F)", async () => {
    const n = await strudel(
      `chords: chord("<C G Am F>").voicing().s("piano")
bass: note("<c2 b1 a1 f1>").s("piano")`,
      4,
    );
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 4 });
    expect(v.slots.map((s) => [s.symbol, s.rn, s.inversion, s.written])).toEqual([
      ["C", "I", 0, "C"],
      ["G/B", "V6", 1, "G"],
      ["Am", "vi", 0, "Am"],
      ["F", "IV", 0, "F"],
    ]);
    expect(v.slots.map((s) => s.code)).toEqual(["C", "G", "Am", "F"]);
  });

  test("without a bass track a default voicing's lowest note sets the inversion it sounds in", async () => {
    // chord("C").voicing() puts E lowest in Strudel 1.2.6 (contracts §6.7 item 5): it sounds as C/E.
    const n = await strudel('chords: chord("<C>").voicing().s("piano")', 1);
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 1 });
    expect(v.slots[0]?.root).toBe("C");
    expect(v.slots[0]?.quality).toBe("maj");
    expect(v.slots[0]?.bassPc).toBe(Math.min(...(n.byTrack.chords ?? []).map((e) => e.midi as number)) % 12);
  });

  test("hand-stacked inversions in one track: [2,4,7] is C/E = I6; a cluster is no chord", async () => {
    const n = await strudel('chords: n("<[2,4,7] [0,1,2] [4,6,8]>").scale("C3:major").s("piano")', 3);
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 3 });
    expect(v.slots.map((s) => [s.symbol, s.rn])).toEqual([
      ["C/E", "I6"],
      ["G", "V"],
    ]);
    expect(v.beats[4]).toMatchObject({ bar: 2, chord: null });
  });

  test("function bands merge neighbours (C Am = one T band) and the chord-tone share reads strong beats", async () => {
    const n = await strudel(
      `chords: n("<[0,2,4] [5,7,9] [3,5,7] [4,6,8]>").scale("C3:major").s("piano")
mel: n("<[4 3 2 ~] [0 ~ 2 ~] [3 4 5 ~] [1 ~ 6 ~]>").scale("C5:major").s("piano")`,
      4,
    );
    const v = harmonyView(n, { meter: "4/4", key: C, bars: 4 });
    expect(v.functionBands.map((b) => [b.function, b.slots])).toEqual([
      ["T", [0, 1]],
      ["PD", [2]],
      ["D", [3]],
    ]);
    // Strong beats: G over C, E over C... bar 1 G(1) E(3); bar 2 C(1) E(3); bar 3 F(1) A(3); bar 4 D(1) B(3).
    expect(v.chordToneShare).toBe(1);
  });
});
