// "Hum it, Oak drafts it", verified against Strudel 1.2.6 headlessly: the draft must play the notes it
// claims, at the onsets it claims.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { SCALE_MODES, type ScaleMode } from "@oak/content-kit";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { analyze, SR } from "./fixtures.test-data.ts";
import {
  draftFromHum,
  SCALE_INTERVALS,
  scaleName,
  stepMidi,
  tonicMidi,
  tonicPc,
  tuningOffsetCents,
} from "./hum.ts";
import { concat, silence, tone } from "./synth.ts";
import { pitchFramesToNotes } from "./tracker.ts";
import type { HumDraft, SungNote } from "./types.ts";

setDefaultTimeout(30_000);

/** Notes on a beat grid: [midi, startBeat, beats] at `bpm`, optionally detuned and humanized. */
function sung(
  spec: [number, number, number][],
  bpm: number,
  o: { cents?: number; jitter?: number; t0?: number } = {},
): SungNote[] {
  const beat = 60 / bpm;
  const t0 = o.t0 ?? 1;
  return spec.map(([midi, at, beats], i) => {
    const j = o.jitter ? (i % 2 ? 1 : -1) * o.jitter : 0;
    return {
      start: t0 + at * beat + j,
      end: t0 + (at + beats) * beat - 0.08 + j,
      midi: midi + (o.cents ?? 0) / 100,
      centsSpread: 10,
      frames: 40,
    };
  });
}

/** Plays the draft headlessly and returns [midi, onset in bars, duration in bars]. */
async function play(draft: HumDraft): Promise<[number | null, number, number][]> {
  const r = await evalHeadless(draft.code, Math.max(1, draft.bars));
  const frac = (s: string) => {
    const [n, d] = s.split("/").map(Number);
    return (n as number) / (d ?? 1);
  };
  const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
  return r.events.map((e) => [e.midi, r9(frac(e.begin)), r9(frac(e.end) - frac(e.begin))]);
}

describe("scale steps match Strudel's .scale()", () => {
  for (const mode of SCALE_MODES) {
    test(mode, async () => {
      const steps = Array.from({ length: 23 }, (_, k) => k - 8);
      const name = scaleName({ tonic: "Eb", mode }, 4);
      const code = `n("${steps.join(" ")}").scale("${name}")`;
      const strudel = await midisOf(code);
      expect(steps.map((s) => stepMidi(s, tonicMidi("Eb", 4), mode as ScaleMode))).toEqual(
        strudel as number[],
      );
    });
  }
  test("chromatic step strings, including negative steps", async () => {
    const steps = ["0#", "1b", "3#", "4b", "6b", "-1#", "-2#", "-3b", "7#"];
    const strudel = await midisOf(`n("${steps.join(" ")}").scale("C4:major")`);
    expect(steps.map((s) => stepMidi(s, 60, "major"))).toEqual(strudel as number[]);
  });
  test("tonics and names", () => {
    expect(tonicPc("F#")).toBe(6);
    expect(tonicPc("Bb")).toBe(10);
    expect(tonicMidi("G", 4)).toBe(67);
    expect(scaleName({ tonic: "a", mode: "harmonic minor" }, 3)).toBe("A3:harmonic:minor");
    expect(() => tonicPc("H")).toThrow(RangeError);
    expect(SCALE_INTERVALS.blues).toEqual([0, 3, 5, 6, 7, 10]);
  });
});

describe("draftFromHum", () => {
  const G = { tonic: "G", mode: "major" as const };
  // G4 A4 B4 D5 | D5 B4 G4–
  const LINE: [number, number, number][] = [
    [67, 0, 1],
    [69, 1, 1],
    [71, 2, 1],
    [74, 3, 1],
    [74, 4, 1],
    [71, 5, 1],
    [67, 6, 2],
  ];

  test("a clean line becomes the expected code and plays the sung notes on the grid", async () => {
    const d = draftFromHum(sung(LINE, 96), { key: G, bpm: 96 });
    expect(d.machineMade).toBe(true);
    expect(d.code).toBe('setcpm(96/4)\n\nmel: n("<[0 1 2 4] [4 2 0 _]>").scale("G4:major")');
    expect(d.bars).toBe(2);
    expect(d.warnings).toEqual([]);
    expect(await play(d)).toEqual([
      [67, 0, 0.25],
      [69, 0.25, 0.25],
      [71, 0.5, 0.25],
      [74, 0.75, 0.25],
      [74, 1, 0.25],
      [71, 1.25, 0.25],
      [67, 1.5, 0.5],
    ]);
    expect(d.notes.map((n) => n.midi)).toEqual([67, 69, 71, 74, 74, 71, 67]);
  });

  test("a constant tuning offset is removed; humanized timing still lands on the grid", async () => {
    const d = draftFromHum(sung(LINE, 96, { cents: -35, jitter: 0.06 }), { key: G, bpm: 96 });
    expect(d.tuningCents).toBeCloseTo(-35, 0);
    expect(d.pattern).toBe("<[0 1 2 4] [4 2 0 _]>");
    for (const n of d.notes) expect(Math.abs(n.cents)).toBeLessThan(1);
  });

  test("singing latency and an explicit downbeat", () => {
    const notes = sung(LINE, 96, { t0: 2.2 });
    const d = draftFromHum(notes, { key: G, bpm: 96, downbeat: 2.0, latencyMs: 200 });
    expect(d.pattern).toBe("<[0 1 2 4] [4 2 0 _]>");
    const early = draftFromHum(notes, { key: G, bpm: 96, downbeat: 2.2 - 60 / 96, latencyMs: 0 });
    expect(early.pattern).toBe("<[~ 0 1 2] [4 4 2 0]>");
    expect(early.warnings).toContainEqual({ code: "tie-truncated", source: 6, bar: 1 });
  });

  test("eighth notes and rests keep the finer grid", async () => {
    const line: [number, number, number][] = [
      [60, 0, 0.5],
      [62, 0.5, 0.5],
      [64, 1, 1],
      [67, 3, 1],
    ];
    const d = draftFromHum(sung(line, 120), { key: { tonic: "C", mode: "major" }, bpm: 120, sound: "piano" });
    expect(d.line).toBe('mel: n("0 1 2 _ ~ ~ 4 _").scale("C4:major").s("piano")');
    expect(await play(d)).toEqual([
      [60, 0, 0.125],
      [62, 0.125, 0.125],
      [64, 0.25, 0.25],
      [67, 0.75, 0.25],
    ]);
  });

  test("an out-of-key note: snapped by default (with a warning), kept as a chromatic step on request", async () => {
    // In G major: G4 F4(natural, a bit sharp) E4 D4.
    const line: [number, number, number][] = [
      [67, 0, 1],
      [65.2, 1, 1],
      [64, 2, 1],
      [62, 3, 1],
    ];
    const snapped = draftFromHum(sung(line, 100), { key: G, bpm: 100 });
    expect(snapped.notes[1]?.midi).toBe(66);
    expect(snapped.warnings.some((w) => w.code === "chromatic-snapped")).toBe(true);
    const kept = draftFromHum(sung(line, 100), { key: G, bpm: 100, chromatic: "keep" });
    // Most of the line lies in the octave above G3, so the scale is G3 and the steps stay positive.
    expect(kept.line).toBe('mel: n("7 5# 5 4").scale("G3:major")');
    expect((await play(kept)).map(([m]) => m)).toEqual([67, 65, 64, 62]);
  });

  test("a bass line hummed two octaves up is drafted at the tonic octave asked for", async () => {
    const line: [number, number, number][] = [
      [57, 0, 2],
      [62, 2, 2],
      [64, 4, 2],
      [57, 6, 2],
    ];
    const d = draftFromHum(sung(line, 90), {
      key: { tonic: "A", mode: "minor" },
      bpm: 90,
      tonicOctave: 1,
      label: "bass",
    });
    expect(d.octaveShift).toBe(-2);
    expect(d.line).toBe('bass: n("<[0 3] [4 0]>").scale("A1:minor")');
    expect((await play(d)).map(([m]) => m)).toEqual([33, 38, 40, 33]);
  });

  test("3/4 and 6/8 bars", async () => {
    const waltz: [number, number, number][] = [
      [60, 0, 2],
      [64, 2, 1],
      [67, 3, 3],
    ];
    const d = draftFromHum(sung(waltz, 120), { key: { tonic: "C", mode: "major" }, bpm: 120, meter: "3/4" });
    expect(d.code).toBe('setcpm(120/3)\n\nmel: n("<[0 _ 2] 4>").scale("C4:major")');
    expect(await play(d)).toEqual([
      [60, 0, 0.666666667],
      [64, 0.666666667, 0.333333333],
      [67, 1, 1],
    ]);
    // 6/8 at 60 BPM (dotted quarter): an eighth is 1/3 s.
    const jig = [60, 62, 64, 65, 64, 62].map((m, k) => ({
      start: 1 + k / 3,
      end: 1 + k / 3 + 0.25,
      midi: m,
      centsSpread: 5,
      frames: 20,
    }));
    const j = draftFromHum(jig, { key: { tonic: "C", mode: "major" }, bpm: 60, meter: "6/8" });
    expect(j.code).toBe('setcpm(60/2)\n\nmel: n("0 1 2 3 2 1").scale("C4:major")');
  });

  test("collisions keep the longer note; maxBars truncates; nothing sung is an empty draft", () => {
    const notes: SungNote[] = [
      { start: 1, end: 1.05, midi: 60, centsSpread: 0, frames: 5 },
      { start: 1.02, end: 1.4, midi: 64, centsSpread: 0, frames: 30 },
    ];
    const d = draftFromHum(notes, { key: { tonic: "C", mode: "major" }, bpm: 120, downbeat: 1 });
    expect(d.warnings).toContainEqual({ code: "collision-dropped", source: 0 });
    expect(d.pattern).toBe("[2 ~ ~ ~]".slice(1, -1));
    const long = sung(
      Array.from({ length: 12 }, (_, k) => [60, k * 4, 4] as [number, number, number]),
      120,
    );
    const cut = draftFromHum(long, { key: { tonic: "C", mode: "major" }, bpm: 120, maxBars: 8 });
    expect(cut.bars).toBe(8);
    expect(cut.warnings).toContainEqual({ code: "truncated", bars: 8 });
    const empty = draftFromHum([], { key: { tonic: "C", mode: "major" }, bpm: 120 });
    expect(empty.pattern).toBe("~");
    expect(empty.warnings).toEqual([{ code: "empty" }]);
  });

  test("a rest bar in the middle is ~", () => {
    const d = draftFromHum(
      sung(
        [
          [60, 0, 4],
          [67, 8, 4],
        ],
        120,
      ),
      { key: { tonic: "C", mode: "major" }, bpm: 120 },
    );
    expect(d.pattern).toBe("<0 ~ 4>");
  });

  test("end to end: hummed audio → frames → notes → draft that Strudel plays back", async () => {
    // C4 E4 G4 E4 as quarter notes at 100 BPM, 20 cents sharp, voice timbre with vibrato.
    const beat = 0.6;
    const parts = [silence(0.5, SR, -60)];
    for (const midi of [60, 64, 67, 64]) {
      const hz = 440 * 2 ** ((midi + 0.2 - 69) / 12);
      parts.push(
        tone({
          hz,
          seconds: beat - 0.1,
          sampleRate: SR,
          wave: "voice",
          amp: 0.4,
          vibratoCents: 15,
          noiseDb: -50,
          fade: 0.02,
        }),
      );
      parts.push(silence(0.1, SR, -60));
    }
    const notes = pitchFramesToNotes(analyze(concat(parts)));
    expect(notes.length).toBe(4);
    const d = draftFromHum(notes, { key: { tonic: "C", mode: "major" }, bpm: 100 });
    expect(d.tuningCents).toBeGreaterThan(10);
    expect(d.pattern).toBe("0 2 4 2");
    expect((await play(d)).map(([m]) => m)).toEqual([60, 64, 67, 64]);
  });
});

test("tuningOffsetCents is circular", () => {
  expect(tuningOffsetCents([60.3, 62.3, 64.28])).toBeCloseTo(29.3, 0);
  expect(tuningOffsetCents([59.6, 61.6])).toBeCloseTo(-40, 6);
  expect(tuningOffsetCents([])).toBe(0);
});
