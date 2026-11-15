// Wave 7 theory seam (docs/design/wave7.md §3.1): every fact pinned by hand, against the chord table, and with
// headless Strudel 1.2.6 where code is involved (clave, tresillo, Euclid rotation, swing, `.late()`, polymeter).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { R, rat } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol, toCode } from "./chords.ts";
import { onsetsOf } from "./rhythm.ts";
import {
  availableTensions,
  backdoor,
  belowLowIntervalLimit,
  CINQUILLO,
  chordScales,
  claveOf,
  claveSteps,
  coltraneCycle,
  densityOf,
  diminishedPassing,
  displace,
  drop2,
  euclidIdentity,
  harmonicsPassed,
  hemiola,
  JAZZ_QUALITIES,
  jazzBlues,
  jazzSymbol,
  lateFor,
  lateMs,
  meterGroups,
  metricWeights,
  polymeterPeriod,
  polyrhythm,
  RHYTHM_CHANGES_BARS,
  rhythmChanges,
  rootlessVoicing,
  secondaryTwoFive,
  shellVoicing,
  swingAmount,
  swingOffbeat,
  swingRatio,
  syncopationScore,
  TRESILLO,
  tensionsOf,
  tritoneSub,
  turnaround,
  twoFiveOne,
  twoFiveOnesAllKeys,
  twoFiveTarget,
  voicingType,
  waveHarmonic,
} from "./wave7.ts";

setDefaultTimeout(30_000);
const sym = (s: string) => {
  const c = parseChordSymbol(s);
  if (!c) throw new Error(s);
  return c;
};
const onsets8 = async (code: string, bars = 2) =>
  (await evalHeadless(code, bars)).events.map((e) => Math.round(e.onset * 8));

describe("jazz symbols from the one table", () => {
  test("three spellings of each jazz quality, all parsed back", () => {
    for (const q of JAZZ_QUALITIES) {
      const j = jazzSymbol({ ...sym("C"), quality: q });
      for (const s of [j.ireal, j.leadSheet, j.glyph]) expect(parseChordSymbol(s)?.quality).toBe(q);
    }
    expect(jazzSymbol("Cm7b5")).toMatchObject({ ireal: "Cm7b5", leadSheet: "Cm7♭5", glyph: "Cø7" });
    expect(jazzSymbol("G7alt").extensions).toEqual(["alt"]);
    expect(jazzSymbol("G13").extensions).toEqual(["9", "13"]);
  });
});

describe("ii–V–I", () => {
  test("C major and C minor", () => {
    expect(twoFiveOne("C").symbols).toEqual(["Dm7", "G7", "C^7"]);
    expect(twoFiveOne("C", "minor").symbols).toEqual(["Dm7b5", "G7alt", "Cm7"]);
    expect(twoFiveOne("C", "minor", { tonic: "m6", dominant: "7b9" }).symbols).toEqual([
      "Dm7b5",
      "G7b9",
      "Cm6",
    ]);
  });
  test("all twelve keys around the fourths, spelled in their keys", () => {
    const all = twoFiveOnesAllKeys().map((t) => t.symbols.join(" "));
    expect(all).toHaveLength(12);
    expect(all[2]).toBe("Cm7 F7 Bb^7");
    expect(all[6]).toBe("Abm7 Db7 Gb^7");
    expect(all[7]).toBe("C#m7 F#7 B^7");
    expect(new Set(twoFiveOnesAllKeys().map((t) => t.chords[2].rootPc)).size).toBe(12);
    const minor = twoFiveOnesAllKeys("minor");
    expect(minor[5]?.symbols).toEqual(["D#m7b5", "G#7alt", "C#m7"]);
  });
  test("a ii–V points to its tonic", () => {
    expect(twoFiveTarget("Dm7", "G7")).toEqual({ tonicPc: 0, mode: "major" });
    expect(twoFiveTarget("Dm7b5", "G7alt")).toEqual({ tonicPc: 0, mode: "minor" });
    expect(twoFiveTarget("Dm7", "C7")).toBeNull();
  });
});

describe("chord-scales and tensions", () => {
  test("first choices by quality and context", () => {
    expect(chordScales("Dm7")[0]).toBe("dorian");
    expect(chordScales("G7")[0]).toBe("mixolydian");
    expect(chordScales("C^7")[0]).toBe("ionian");
    expect(chordScales("F^7", { key: { tonic: "C", mode: "major" } })[0]).toBe("lydian");
    expect(chordScales("Em7", { key: { tonic: "C", mode: "major" } })[0]).toBe("phrygian");
    expect(chordScales("G7alt")[0]).toBe("altered");
    expect(chordScales("G7", { next: "Cm7" })[0]).toBe("phrygian-dominant");
    expect(chordScales("C7#11")).toEqual(["lydian-dominant"]);
  });
  test("tensions and avoid notes by the half-step convention", () => {
    const label = (s: string, sc?: Parameters<typeof tensionsOf>[1]) =>
      tensionsOf(s, sc).map((t) => `${t.label}${t.avoid ? "!" : ""}`);
    expect(label("C^7")).toEqual(["9", "11!", "13"]);
    expect(label("C^7", "lydian")).toEqual(["9", "#11", "13"]);
    expect(label("G7")).toEqual(["9", "11!", "13"]);
    expect(label("Dm7")).toEqual(["9", "11", "13"]);
    expect(label("Em7", "phrygian")).toEqual(["b9!", "11", "b13!"]);
    expect(availableTensions("G7").map((t) => t.label)).toEqual(["9", "13"]);
    // G7alt draws on G A♭ B♭ B D♭ E♭ F: no natural 9, 5 or 13 (w7plan B2).
    const alt = tensionsOf("G7alt").map((t) => t.pc);
    for (const pc of [9, 2, 4]) expect(alt).not.toContain(pc);
    // Over a sixth chord the major 7th is a scale tone, not a chord tone.
    expect(label("C6")).toEqual(["9", "11!", "7"]);
  });
});

describe("voicing types from sounding notes (octave-aware)", () => {
  test("shells, guide tones, rootless A and B", () => {
    expect(voicingType(shellVoicing("Dm7"), "Dm7").type).toBe("shell");
    expect(voicingType(shellVoicing("G7", "1-7-3"), "G7").type).toBe("shell");
    expect(voicingType([65, 72], "Dm7").type).toBe("guide-tones");
    const a = rootlessVoicing("Dm7", "A");
    expect(a.map((m) => m % 12)).toEqual([5, 9, 0, 4]); // F A C E: 3 5 7 9
    expect(voicingType(a, "Dm7").type).toBe("rootless-a");
    const b = rootlessVoicing("G7", "B");
    expect(b.map((m) => m % 12)).toEqual([5, 9, 11, 4]); // F A B E: 7 9 3 13
    expect(voicingType(b, "G7").type).toBe("rootless-b");
    expect(voicingType(rootlessVoicing("G7", "A"), "G7").type).toBe("rootless-a");
  });
  test("drop-2 is the close voicing with its 2nd-from-top note an octave down (w7plan B3)", () => {
    expect(drop2([60, 64, 67, 71])).toEqual([55, 60, 64, 71]); // G3 C4 E4 B4
    expect(voicingType([60, 64, 67, 71], "C^7").type).toBe("close");
    expect(voicingType([55, 60, 64, 71], "C^7").type).toBe("drop-2");
    // Same pitch classes, other octaves: not drop-2.
    expect(voicingType([55, 64, 72, 83], "C^7").type).not.toBe("drop-2");
    expect(voicingType([36, 47, 52, 55], "C^7").type).toBe("spread");
  });
  test("what dict('lefthand') gives is often none of these (w7plan A2)", async () => {
    const r = await evalHeadless('chord("Cm7b5").dict("lefthand").voicing()', 1);
    const midis = r.events.map((e) => e.midi as number);
    expect(midis).toEqual([63, 66, 70, 72]);
    expect(voicingType(midis, "Cm7b5").rootless).toBe(false);
  });
});

describe("forms", () => {
  test("turnarounds, jazz blues and rhythm changes", () => {
    expect(turnaround("C").flat()).toEqual(["C^7", "Am7", "Dm7", "G7"]);
    expect(turnaround("C", "iii-VI-ii-V").flat()).toEqual(["Em7", "A7", "Dm7", "G7"]);
    expect(jazzBlues("F").map((b) => b.join(" "))).toEqual([
      "F7",
      "Bb7",
      "F7",
      "Cm7 F7",
      "Bb7",
      "Bo7",
      "F7",
      "D7",
      "Gm7",
      "C7",
      "F7 D7",
      "Gm7 C7",
    ]);
    const rc = rhythmChanges("Bb");
    expect(rc.bars).toHaveLength(RHYTHM_CHANGES_BARS);
    expect(rc.bars.slice(16, 24).flat()).toEqual(["D7", "D7", "G7", "G7", "C7", "C7", "F7", "F7"]);
    expect(rc.bars[31]).toEqual(["Bb^7"]);
  });
  test("every chart chord sounds in Strudel's default dictionary", async () => {
    const chords = [...jazzBlues("F").flat(), ...rhythmChanges("Bb").bars.flat()];
    const r = await evalHeadless(`chord("${chords.join(" ")}").voicing()`, 1);
    expect(r.logs.filter((l) => /unknown chord/.test(l))).toEqual([]);
  });
});

describe("reharmonisation devices", () => {
  test("tritone sub, backdoor, secondary ii–V, diminished passing, Coltrane", () => {
    const db7 = tritoneSub("G7");
    expect(toCode(db7)).toBe("Db7");
    // The tritone sub shares the 3rd and 7th (B/C♭ and F).
    const g = chordPcs(sym("G7"));
    expect(
      chordPcs(db7)
        .filter((pc) => g.includes(pc))
        .sort((a, b) => a - b),
    ).toEqual([5, 11]);
    expect(backdoor("C").map((c) => toCode(c))).toEqual(["Fm7", "Bb7", "C^7"]);
    expect(secondaryTwoFive("F^7").map((c) => toCode(c))).toEqual(["Gm7", "C7"]);
    expect(secondaryTwoFive("Dm7").map((c) => toCode(c))).toEqual(["Em7b5", "A7b9"]);
    expect(toCode(diminishedPassing("C^7", "Dm7") ?? sym("C"))).toBe("C#o7");
    expect(diminishedPassing("C^7", "Em7")).toBeNull();
    expect(coltraneCycle("B").map((c) => toCode(c))).toEqual([
      "B^7",
      "D7",
      "G^7",
      "Bb7",
      "Eb^7",
      "F#7",
      "B^7",
    ]);
  });
});

describe("rhythm", () => {
  test("metric weight and syncopation", () => {
    expect(metricWeights("4/4", 16)).toEqual([4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0]);
    const w78 = metricWeights("7/8", 7);
    expect([w78[0], w78[2], w78[4]].every((x) => (x as number) > (w78[1] as number))).toBe(true);
    const grid = (xs: number[]) => Array.from({ length: 16 }, (_, i) => xs.includes(i));
    expect(syncopationScore(grid([0, 4, 8, 12]))).toBe(0);
    expect(syncopationScore(grid([0, 3, 6, 10, 12]))).toBeGreaterThan(0);
    expect(syncopationScore(grid([0, 3, 6, 10, 12]))).toBeGreaterThan(syncopationScore(grid([0, 6, 8, 12])));
  });
  test("swing amount ↔ ratio, and where the off-beat lands in Strudel", async () => {
    expect(swingRatio(1 / 3)).toBeCloseTo(2);
    expect(swingRatio(0.2)).toBeCloseTo(1.5);
    expect(swingAmount(1.5)).toBeCloseTo(0.2);
    expect(swingOffbeat(1 / 3, 8)).toBeCloseTo(1 / 6);
    const r = await evalHeadless('s("hh*8").swingBy(1/3, 4)', 1);
    expect(r.events[1]?.onset).toBeCloseTo(swingOffbeat(1 / 3, 8), 6);
    const r16 = await evalHeadless('s("hh*16").swingBy(.2, 8)', 1);
    expect(r16.events[1]?.onset).toBeCloseTo(swingOffbeat(0.2, 16), 6);
  });
  test("displacement and microtiming", async () => {
    expect(displace([rat(0), rat(1, 2)], rat(7, 8)).map((x) => R.str(x))).toEqual(["3/8", "7/8"]);
    expect(lateMs(1 / 32, 76)).toBeCloseTo(98.68, 1);
    expect(lateFor(20, 120)).toBeCloseTo(0.01, 6);
    const r = await evalHeadless('s("~ sd ~ sd").late(1/100)', 1);
    expect(r.events[0]?.onset).toBeCloseTo(0.26, 6);
  });
  test("odd meters, hemiola, polyrhythm, polymeter", async () => {
    expect(meterGroups("7/8")).toMatchObject({ groups: [2, 2, 3], count: "1 2 | 1 2 | 1 2 3" });
    expect(meterGroups("9/8i").starts.map((x) => R.str(x))).toEqual(["0", "2/9", "4/9", "2/3"]);
    expect(hemiola().threeFour).toHaveLength(3);
    const p = polyrhythm(3, 2);
    expect(p.grid).toBe(6);
    expect(p.together.map((x) => R.str(x))).toEqual(["0"]);
    expect(polymeterPeriod(3, 4)).toBe(3);
    const r = await evalHeadless('s("{bd ~ ~}%4")', 3);
    expect(r.events.map((e) => e.onset)).toEqual([0, 0.75, 1.5, 2.25]);
  });
  test("tresillo, cinquillo and Euclidean identity agree with Strudel's (k,n,r)", async () => {
    expect(await onsets8('s("x(3,8)")', 1)).toEqual([...TRESILLO]);
    expect(await onsets8('s("x(5,8)")', 1)).toEqual([...CINQUILLO]);
    const rot = await onsets8('s("x(5,8,1)")', 1);
    expect(euclidIdentity(rot, 8)).toEqual({ pulses: 5, steps: 8, rotation: 1 });
    expect(euclidIdentity([0, 1, 2], 8)).toBeNull();
  });
  test("clave on the two-bar eighth grid, as the R3.L02 snippet plays it", async () => {
    expect(claveSteps("son", "3-2")).toEqual([0, 3, 6, 10, 12]);
    expect(claveSteps("son", "2-3")).toEqual([2, 4, 8, 11, 14]);
    expect(claveSteps("rumba", "3-2")).toEqual([0, 3, 7, 10, 12]);
    const son = await onsets8('s("<[cb ~ ~ cb ~ ~ cb ~] [~ ~ cb ~ cb ~ ~ ~]>")', 2);
    expect(claveOf(son)).toEqual({ type: "son", direction: "3-2" });
    expect(claveOf([0, 3, 6, 10])).toBeNull();
  });
});

describe("sound", () => {
  test("harmonics of the waves and what a filter leaves", () => {
    expect(waveHarmonic("square", 2)).toBe(0);
    expect(waveHarmonic("sawtooth", 4)).toBeCloseTo(0.25);
    expect(waveHarmonic("triangle", 3)).toBeCloseTo(1 / 9);
    // A2 (110 Hz) through lpf 600: harmonics 1–5 (550 Hz) pass, 6 (660 Hz) does not.
    expect(harmonicsPassed(45, "lpf", 600)).toEqual([1, 2, 3, 4, 5]);
    expect(harmonicsPassed(45, "hpf", 600, 8)).toEqual([6, 7, 8]);
  });
  test("low-interval limits and density", () => {
    expect(belowLowIntervalLimit(40, 44)).toBe(true); // E2–G♯2: a low third
    expect(belowLowIntervalLimit(48, 52)).toBe(false); // C3–E3
    expect(belowLowIntervalLimit(36, 48)).toBe(false); // an octave
    const thin = densityOf(
      [
        { onset: 0, track: "a" },
        { onset: 0, track: "a" },
      ],
      1,
    );
    const thick = densityOf(
      [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5].map((onset, i) => ({ onset, track: i % 2 ? "a" : "b" })),
      1,
    );
    expect(thick.onsetsPerBar * thick.polyphony).toBeGreaterThan(thin.onsetsPerBar * thin.polyphony);
    expect(onsetsOf([true, false])).toEqual([0]);
  });
});
