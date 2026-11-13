// "Hum it, Oak drafts it", verified against Strudel 1.2.6 headlessly: the draft must play the notes it
// claims, at the onsets it claims.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { SCALE_MODES, type ScaleMode } from "@oak/content-kit";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { type ClipPart, renderClip } from "./corpus.ts";
import { analyze, SR } from "./fixtures.test-data.ts";
import { analyzeClip } from "./gate.ts";
import {
  amountText,
  defaultKeepDegrees,
  draftFromHum,
  humToDraft,
  SCALE_INTERVALS,
  scaleName,
  stepMidi,
  straightenTime,
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
    // One beat later the last note (two beats) crosses the bar line: it is tied over it (c7), not cut.
    const early = draftFromHum(notes, { key: G, bpm: 96, downbeat: 2.2 - 60 / 96, latencyMs: 0 });
    expect(early.pattern).toBe("~ 0 1 2 4 4 2 0 _ ~ ~ ~");
    expect(early.layout).toBe("tied");
    expect(early.bars).toBe(3);
    expect(early.line).toBe('mel: n("~ 0 1 2 4 4 2 0 _ ~ ~ ~").scale("G4:major").slow(3)');
    expect(early.warnings.some((w) => w.code === "tie-truncated")).toBe(false);
    expect(early.notes[6]).toMatchObject({ bar: 1, onset: [3, 4], dur: [1, 2], tied: true });
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
    // F♮ in G is ♭7, written as the dialect writes ♭7 (STYLE §6): "6b" (Wave 5; it was "5#" before).
    expect(kept.line).toBe('mel: n("7 6b 5 4").scale("G3:major")');
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

// Wave 4: from the microphone's frames (the synthetic voice corpus) to degrees and `n()` code.
describe("humToDraft on the synthetic corpus", () => {
  /** A sung line on a beat grid: `[midi, beats]` each, articulated, rendered by the corpus voice. */
  function clipOf(
    id: string,
    line: [number, number][],
    bpm: number,
    o: { rangeLow?: number; cents?: number; vowel?: "a" | "o" | "u"; lead?: number } = {},
  ) {
    const beat = 60 / bpm;
    const parts: ClipPart[] = [{ kind: "gap", sec: o.lead ?? 0.4 }];
    for (const [midi, beats] of line) {
      parts.push({
        kind: "phrase",
        notes: [{ midi: midi + (o.cents ?? 0) / 100, dur: beats * beat - 0.07 }],
      });
      parts.push({ kind: "gap", sec: 0.07 });
    }
    parts.push({ kind: "gap", sec: 0.4 });
    const clip = renderClip({
      id,
      cls: "steady",
      rangeLow: o.rangeLow ?? 48,
      timbre: { vowel: o.vowel ?? "a" },
      parts,
    });
    return { clip, frames: analyzeClip(clip) };
  }
  const profileOf = (clip: { profile: { noiseFloorDb: number; rangeLow: number } }) => ({
    rangeLow: clip.profile.rangeLow,
    noiseFloorDb: clip.profile.noiseFloorDb,
    singLatencyMs: 0,
  });

  test("a hummed line in G becomes degrees 1 2 3 5 | 5 3 1 and code that plays it", async () => {
    const { clip, frames } = clipOf(
      "hum/g-major",
      [
        [67, 1],
        [69, 1],
        [71, 1],
        [74, 1],
        [74, 1],
        [71, 1],
        [67, 2],
      ],
      96,
    );
    const d = humToDraft(frames, { key: { tonic: "G", mode: "major" }, bpm: 96, profile: profileOf(clip) });
    expect(d.machineMade).toBe(true);
    expect(d.sung.length).toBe(7);
    expect(d.degrees.map((x) => x.degree)).toEqual(["1", "2", "3", "5", "5", "3", "1"]);
    expect(d.degrees.every((x) => x.octave === 0)).toBe(true);
    // n() is degree − 1.
    expect(d.notes.map((n) => n.step)).toEqual(["0", "1", "2", "4", "4", "2", "0"]);
    expect(d.pattern).toBe("<[0 1 2 4] [4 2 0 _]>");
    expect(d.scale).toBe("G4:major");
    const midis = (await midisOf(d.code, 2)) as number[];
    expect(midis).toEqual([67, 69, 71, 74, 74, 71, 67]);
  });

  test("minor key, eighth notes and a flat singer: degrees in the key, onsets on the eighth grid", async () => {
    // A minor: 1 b3 4 5 (eighths) | b6 5 b3 1 — sung 30¢ flat.
    const line: [number, number][] = [
      [57, 0.5],
      [60, 0.5],
      [62, 0.5],
      [64, 0.5],
      [65, 1],
      [64, 1],
      [60, 1],
      [57, 2],
    ];
    const { clip, frames } = clipOf("hum/a-minor", line, 100, { cents: -30, vowel: "o" });
    const key = { tonic: "A", mode: "minor" as const };
    const d = humToDraft(frames, { key, bpm: 100, profile: profileOf(clip) });
    expect(d.tuningCents).toBeLessThan(-15);
    expect(d.degrees.map((x) => x.degree)).toEqual(["1", "b3", "4", "5", "b6", "5", "b3", "1"]);
    expect(d.notes.map((n) => n.onset)).toEqual([
      [0, 1],
      [1, 8],
      [1, 4],
      [3, 8],
      [1, 2],
      [3, 4],
      [0, 1],
      [1, 4],
    ]);
    expect((await midisOf(d.code, d.bars)) as number[]).toEqual([57, 60, 62, 64, 65, 64, 60, 57]);
  });

  test("a low voice hums a line an octave down: the octave is chosen from where it sits, or moved onto the tonic", () => {
    const { clip, frames } = clipOf(
      "hum/low-voice",
      [
        [48, 1],
        [52, 1],
        [55, 1],
        [60, 1],
      ],
      90,
      { rangeLow: 40, vowel: "u" },
    );
    const sat = humToDraft(frames, { key: { tonic: "C", mode: "major" }, bpm: 90, profile: profileOf(clip) });
    expect(sat.scale).toBe("C3:major");
    expect(sat.degrees).toEqual([
      { degree: "1", octave: 0 },
      { degree: "3", octave: 0 },
      { degree: "5", octave: 0 },
      { degree: "1", octave: 1 },
    ]);
    const moved = humToDraft(frames, {
      key: { tonic: "C", mode: "major" },
      bpm: 90,
      tonicOctave: 4,
      profile: profileOf(clip),
    });
    expect(moved.scale).toBe("C4:major");
    expect(moved.octaveShift).toBe(1);
    expect(moved.notes.map((n) => n.midi)).toEqual([60, 64, 67, 72]);
  });

  test("silence drafts a rest and warns", () => {
    const empty = humToDraft(analyze(silence(2, SR, -70)), { key: { tonic: "C", mode: "major" }, bpm: 100 });
    expect(empty.pattern).toBe("~");
    expect(empty.warnings).toContainEqual({ code: "empty" });
    expect(empty.degrees).toEqual([]);
  });
});

// Wave 5: ties over the bar line (c7), swing-aware quantising, minor and ♭ degrees in the dialect's spelling.
describe("draftFromHum, Wave 5", () => {
  const C = { tonic: "C", mode: "major" as const };

  test("c7: a legato note held across a bar line is tied, never a rest on the next beat 1", async () => {
    // C D E G– | –  E D C: the G (beat 4 of bar 1) is held through beat 1 of bar 2.
    const line: [number, number, number][] = [
      [60, 0, 1],
      [62, 1, 1],
      [64, 2, 1],
      [67, 3, 2],
      [64, 5, 1],
      [62, 6, 1],
      [60, 7, 1],
    ];
    const d = draftFromHum(sung(line, 100), { key: C, bpm: 100, downbeat: 1 });
    expect(d.layout).toBe("tied");
    expect(d.line).toBe('mel: n("0 1 2 4 _ 2 1 0").scale("C4:major").slow(2)');
    expect(d.warnings).toEqual([]);
    expect(d.notes[3]).toMatchObject({ bar: 0, onset: [3, 4], dur: [1, 2], tied: true, degree: "5" });
    // Strudel plays the G once, from beat 4 of bar 1 to beat 2 of bar 2: no onset (and no rest) on bar 2's beat 1.
    expect(await play(d)).toEqual([
      [60, 0, 0.25],
      [62, 0.25, 0.25],
      [64, 0.5, 0.25],
      [67, 0.75, 0.5],
      [64, 1.25, 0.25],
      [62, 1.5, 0.25],
      [60, 1.75, 0.25],
    ]);
    // Without a tie the bar layout stays as it was: one `<…>` step per bar.
    const plain = draftFromHum(sung(line.slice(0, 3), 100), { key: C, bpm: 100, downbeat: 1 });
    expect(plain.layout).toBe("bars");
    expect(plain.pattern).toBe("0 1 2 ~");
  });

  test("c7: a note held over two bar lines, and one cut only by the last bar of the draft", async () => {
    const d = draftFromHum(
      sung(
        [
          [64, 0, 2],
          [67, 2, 7],
          [60, 9, 3],
        ],
        120,
      ),
      { key: C, bpm: 120, maxBars: 3 },
    );
    expect(d.pattern).toBe("2 _ 4 _ _ _ _ _ _ 0 _ _");
    expect(d.bars).toBe(3);
    expect(await play(d)).toEqual([
      [64, 0, 0.5],
      [67, 0.5, 1.75],
      [60, 2.25, 0.75],
    ]);
    const cut = draftFromHum(sung([[67, 2, 7]], 120, { t0: 1 }), {
      key: C,
      bpm: 120,
      downbeat: 1,
      maxBars: 2,
    });
    expect(cut.pattern).toBe("~ 4 _ _");
    expect(cut.line).toContain(".slow(2)");
    expect(cut.bars).toBe(2);
  });

  test("c7 end to end: a legato take across the bar line from the voice corpus", async () => {
    // A minor at 90 BPM, legato (no gap): 1 b3 5 5– | – 4 b3 1, the second 5 held over the bar line.
    const beat = 60 / 90;
    const notes: [number, number][] = [
      [57, 1],
      [60, 1],
      [64, 1],
      [64.001, 2],
      [62, 1],
      [60, 1],
      [57, 1],
    ];
    const parts: ClipPart[] = [{ kind: "gap", sec: 0.5 }];
    // One phrase: the voice glides from note to note, as a legato singer does; the repeated 5 is re-sung.
    parts.push({ kind: "phrase", notes: notes.slice(0, 3).map(([midi, b]) => ({ midi, dur: b * beat })) });
    parts.push({ kind: "gap", sec: 0.06 });
    parts.push({
      kind: "phrase",
      notes: notes.slice(3).map(([midi, b], i) => ({ midi, dur: b * beat - (i === 0 ? 0.06 : 0) })),
    });
    parts.push({ kind: "gap", sec: 0.5 });
    const clip = renderClip({
      id: "hum/legato-tie",
      cls: "steady",
      rangeLow: 48,
      timbre: { vowel: "a" },
      parts,
    });
    const frames = analyzeClip(clip);
    const d = humToDraft(frames, {
      key: { tonic: "A", mode: "minor" },
      bpm: 90,
      downbeat: 0.5,
      profile: { rangeLow: 48, noiseFloorDb: clip.profile.noiseFloorDb, singLatencyMs: 0 },
    });
    expect(d.degrees.map((x) => x.degree)).toEqual(["1", "b3", "5", "5", "4", "b3", "1"]);
    expect(d.layout).toBe("tied");
    expect(d.pattern).toBe("0 2 4 4 _ 3 2 0");
    const events = await play(d);
    // Bar 2 starts inside the held 5: no event begins at 1.
    expect(events.some(([, at]) => at === 1)).toBe(false);
    expect(events[3]).toEqual([64, 0.75, 0.5]);
  });

  test("swing: swung eighths are straightened onto the eighth grid and drafted with .swingBy(1/3, 4)", async () => {
    // Sung swung: each off-beat eighth at 2/3 of its beat (contracts §6.10), the long eighth held to it.
    const bpm = 120;
    const beat = 60 / bpm;
    const pairs: [number, number][] = [
      [60, 62],
      [64, 65],
      [67, 65],
      [64, 62],
    ];
    const notes: SungNote[] = [];
    pairs.forEach(([a, b], k) => {
      const t = 1 + k * beat;
      notes.push({ start: t, end: t + (2 / 3) * beat - 0.03, midi: a, centsSpread: 5, frames: 20 });
      notes.push({ start: t + (2 / 3) * beat, end: t + beat - 0.03, midi: b, centsSpread: 5, frames: 10 });
    });
    const swing = { subdivision: 8 as const, amount: 1 / 3 };
    const d = draftFromHum(notes, { key: C, bpm, swing, slotsPerBar: 16 });
    expect(d.pattern).toBe("0 1 2 3 4 3 2 1");
    expect(d.swing).toEqual(swing);
    expect(d.line).toBe('mel: n("0 1 2 3 4 3 2 1").scale("C4:major").swingBy(1/3, 4)');
    // Played back, the off-beats sit at 2/3 of each beat again.
    const onsets = (await play(d)).map(([, at]) => at);
    expect(onsets).toEqual([0, 1 / 6, 0.25, 0.25 + 1 / 6, 0.5, 0.5 + 1 / 6, 0.75, 0.75 + 1 / 6].map(r9));
    // Without the declaration the same take reads as a dotted figure on the sixteenth grid.
    const straight = draftFromHum(notes, { key: C, bpm, slotsPerBar: 16 });
    expect(straight.pattern).toBe("0 _ ~ 1 2 _ ~ 3 4 _ ~ 3 2 _ ~ 1");
    // A swung line that crosses the bar line keeps both: tied, then swung.
    const tied = draftFromHum(
      [
        ...notes,
        { start: 1 + 3.67 * beat, end: 1 + 5.5 * beat, midi: 72, centsSpread: 5, frames: 30 },
      ].filter((_n, i) => i !== 7),
      {
        key: C,
        bpm,
        swing,
      },
    );
    expect(tied.line).toBe(
      'mel: n("0 1 2 3 4 3 2 7 _ _ _ ~ ~ ~ ~ ~").scale("C4:major").slow(2).swingBy(1/3, 4)',
    );
    expect(straightenTime(2 / 3, 1, 1 / 3)).toBeCloseTo(0.5, 9);
    expect(straightenTime(1.25, 1, 1 / 3)).toBeCloseTo(1 + 0.25 * (0.5 / (2 / 3)), 9);
    expect(amountText(1 / 3)).toBe("1/3");
    expect(amountText(0.2)).toBe("1/5");
    expect(amountText(0.15)).toBe(".15");
  });

  test("swing 16ths, and swing in a compound meter is ignored with a warning", () => {
    const bpm = 90;
    const beat = 60 / bpm;
    const notes: SungNote[] = [0, 1, 2, 3].map((k) => ({
      start: 1 + (k * beat) / 2 + (k % 2 ? beat / 12 : 0),
      end: 1 + ((k + 1) * beat) / 2 - 0.02,
      midi: 60 + 2 * k,
      centsSpread: 5,
      frames: 10,
    }));
    const d = draftFromHum(notes, { key: C, bpm, swing: { subdivision: 16, amount: 1 / 3 } });
    expect(d.line).toBe('mel: n("0 1 2 3 ~ ~ ~ ~").scale("C4:major").swingBy(1/3, 8)');
    const jig = draftFromHum(notes, {
      key: C,
      bpm: 60,
      meter: "6/8",
      swing: { subdivision: 8, amount: 1 / 3 },
    });
    expect(jig.warnings).toContainEqual({ code: "swing-ignored" });
    expect(jig.swing).toBeNull();
    expect(jig.line).not.toContain("swingBy");
  });

  test("minor: the raised 6 and 7 (la, ti) are kept, written 5# and 6#, even when snapping", async () => {
    const Am = { tonic: "A", mode: "minor" as const };
    // 5 6 7 1' | 1' b7 b6 5 (melodic minor up, natural down) and 1 7 1 at the end.
    const line: [number, number, number][] = [
      [64, 0, 1],
      [66, 1, 1],
      [68, 2, 1],
      [69, 3, 1],
      [69, 4, 1],
      [67, 5, 1],
      [65, 6, 1],
      [64, 7, 1],
    ];
    const d = draftFromHum(sung(line, 100), { key: Am, bpm: 100 });
    expect(d.pattern).toBe("<[4 5# 6# 7] [7 6 5 4]>");
    expect(d.warnings).toEqual([]);
    expect(d.notes.map((n) => n.degree)).toEqual(["5", "6", "7", "1", "1", "b7", "b6", "5"]);
    expect((await midisOf(d.code, 2)) as number[]).toEqual([64, 66, 68, 69, 69, 67, 65, 64]);
    const lead = draftFromHum(
      sung(
        [
          [69, 0, 1],
          [68, 1, 1],
          [69, 2, 2],
        ],
        100,
      ),
      { key: Am, bpm: 100 },
    );
    expect(lead.pattern).toBe("0 -1# 0 _");
    expect((await midisOf(lead.code)) as number[]).toEqual([69, 68, 69]);
    // A natural-minor key keeps a sung G♯ in harmonic minor too; other chromatic notes still snap.
    const other = draftFromHum(sung([[70, 0, 1]], 100), { key: Am, bpm: 100 });
    expect(other.warnings.some((w) => w.code === "chromatic-snapped")).toBe(true);
  });

  test("♭ degrees are written as the dialect writes them: ♭3 2b, ♭5 4b or ♯4 3#, ♭6 5b, ♭7 6b", async () => {
    // C major, kept: 1 b3 3 5 b7 b6 #4 b2.
    const midis = [60, 63, 64, 67, 70, 68, 66, 61];
    const d = draftFromHum(
      sung(
        midis.map((m, k) => [m, k, 1] as [number, number, number]),
        100,
      ),
      { key: C, bpm: 100, chromatic: "keep" },
    );
    expect(d.notes.map((n) => n.step)).toEqual(["0", "2b", "2", "4", "6b", "5b", "3#", "1b"]);
    expect(d.notes.map((n) => n.degree)).toEqual(["1", "b3", "3", "5", "b7", "b6", "#4", "b2"]);
    expect((await midisOf(d.code, d.bars)) as number[]).toEqual(midis);
    // A blues line in a major key: the blue notes kept by `keepDegrees` while the rest snaps.
    const blues = draftFromHum(
      sung(
        [
          [60, 0, 1],
          [63, 1, 1],
          [66, 2, 1],
          [70, 3, 1],
          [60.9, 4, 1],
        ],
        100,
      ),
      { key: C, bpm: 100, keepDegrees: ["b3", "b5", "b7"] },
    );
    // ♭5 kept as named (not ♯4): "4b"; the stray C♯ (a sharp 1) snaps back to 1.
    expect(blues.notes.map((n) => n.step)).toEqual(["0", "2b", "4b", "6b", "0"]);
    expect(blues.notes.map((n) => n.degree)).toEqual(["1", "b3", "b5", "b7", "1"]);
    expect((await midisOf(blues.code, blues.bars)) as number[]).toEqual([60, 63, 66, 70, 60]);
    expect(defaultKeepDegrees("minor")).toEqual(["6", "7"]);
    expect(defaultKeepDegrees("major")).toEqual([]);
  });
});

function r9(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}
