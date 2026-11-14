// Wave 6: "hum it, Oak drafts it" with the rhythm of U13 (dotted values, ties as the course writes them,
// triplets) and through a key change (U17). Every draft is played back in headless Strudel and compared with what
// was sung: pitch, onset and length.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { parseKeyPlan } from "@oak/theory";
import { type ClipPart, renderClip } from "./corpus.ts";
import { analyzeClip } from "./gate.ts";
import { draftFromHum, humToDraft } from "./hum.ts";
import type { HumDraft, SungNote } from "./types.ts";

setDefaultTimeout(30_000);

/** Notes on a beat grid: [midi, startBeat, beats] at `bpm`, with an articulation gap and optional jitter. */
function sung(
  spec: [number, number, number][],
  bpm: number,
  o: { cents?: number; jitter?: number; t0?: number; gap?: number } = {},
): SungNote[] {
  const beat = 60 / bpm;
  const t0 = o.t0 ?? 1;
  return spec.map(([midi, at, beats], i) => {
    const j = o.jitter ? (i % 2 ? 1 : -1) * o.jitter : 0;
    return {
      start: t0 + at * beat + j,
      end: t0 + (at + beats) * beat - (o.gap ?? 0.05) + j,
      midi: midi + (o.cents ?? 0) / 100,
      centsSpread: 10,
      frames: 40,
    };
  });
}

/** Plays the draft headlessly: [midi, onset in bars, length in bars], rounded. */
async function play(draft: HumDraft): Promise<[number | null, number, number][]> {
  const r = await evalHeadless(draft.code, Math.max(1, draft.bars));
  const frac = (s: string) => {
    const [n, d] = s.split("/").map(Number);
    return (n as number) / (d ?? 1);
  };
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return r.events.map((e) => [e.midi, r6(frac(e.begin)), r6(frac(e.end) - frac(e.begin))]);
}
const C = { tonic: "C", mode: "major" as const };
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

describe("dotted values and ties, as U13.L03 writes them", () => {
  test("a dotted quarter, an eighth and a half: [4@3 3 2@4]", async () => {
    const notes = sung(
      [
        [67, 0, 1.5],
        [65, 1.5, 0.5],
        [64, 2, 2],
      ],
      96,
    );
    const d = draftFromHum(notes, { key: C, bpm: 96, downbeat: 1, rhythm: { weights: true } });
    expect(d.pattern).toBe("4@3 3 2@4");
    expect(d.line).toBe('mel: n("4@3 3 2@4").scale("C4:major")');
    expect(await play(d)).toEqual([
      [67, 0, 0.375],
      [65, 0.375, 0.125],
      [64, 0.5, 0.5],
    ]);
    // Without weights the same bar is cells, beat by beat where it can be; here a note crosses beats.
    const cells = draftFromHum(notes, { key: C, bpm: 96, downbeat: 1, rhythm: {} });
    expect(cells.pattern).toBe("4 _ _ 3 2 _ _ _");
    expect(await play(cells)).toEqual(await play(d));
  });

  test("notes that stay inside their beats are written beat by beat", async () => {
    // quarter, two eighths, quarter, eighth + eighth rest
    const notes = sung(
      [
        [60, 0, 1],
        [62, 1, 0.5],
        [64, 1.5, 0.5],
        [65, 2, 1],
        [67, 3, 0.5],
      ],
      100,
    );
    const d = draftFromHum(notes, { key: C, bpm: 100, downbeat: 1, rhythm: { weights: true } });
    expect(d.pattern).toBe("0 [1 2] 3 [4 ~]");
    expect(await play(d)).toEqual([
      [60, 0, 0.25],
      [62, 0.25, 0.125],
      [64, 0.375, 0.125],
      [65, 0.5, 0.25],
      [67, 0.75, 0.125],
    ]);
  });

  test("a dotted eighth and a sixteenth on a sixteenth grid", async () => {
    const notes = sung(
      [
        [60, 0, 0.75],
        [62, 0.75, 0.25],
        [64, 1, 1],
        [65, 2, 2],
      ],
      80,
      { gap: 0.03 },
    );
    const d = draftFromHum(notes, {
      key: C,
      bpm: 80,
      downbeat: 1,
      slotsPerBar: 16,
      rhythm: { weights: true },
    });
    expect(d.pattern).toBe("[0@3 1] 2 3@2");
    expect(await play(d)).toEqual([
      [60, 0, 0.1875],
      [62, 0.1875, 0.0625],
      [64, 0.25, 0.25],
      [65, 0.5, 0.5],
    ]);
  });

  test("a note tied over the bar line: a bracket over the two bars inside the bar sequence, never .slow()", async () => {
    // The Ode to Joy's tied entry (U13.L03): the last note of bar 1 is held into bar 2.
    const notes = sung(
      [
        [60, 0, 1],
        [62, 1, 1],
        [55, 2, 1],
        [64, 3, 2], // tied over the bar line
        [64, 5, 1],
        [65, 6, 1],
        [67, 7, 1],
        [67, 8, 1],
        [65, 9, 1],
        [64, 10, 1],
        [62, 11, 1],
      ],
      108,
    );
    const d = draftFromHum(notes, { key: C, bpm: 108, downbeat: 1, rhythm: { weights: true } });
    expect(d.pattern).toBe("<[0 1 -3 2@2 2 3 4]@2 [4 3 2 1]>");
    expect(d.layout).toBe("tied");
    expect(d.line).not.toContain(".slow(");
    expect(d.notes[3]).toMatchObject({ bar: 0, tied: true, onset: [3, 4], dur: [1, 2] });
    const played = await play(d);
    expect(played.length).toBe(11);
    expect(played[3]).toEqual([64, 0.75, 0.5]);
    // Nothing new sounds on beat 1 of bar 2.
    expect(played.some(([, on]) => on === 1)).toBe(false);
    expect(played[10]).toEqual([62, 2.75, 0.25]);
    // The Wave 5 form (no `rhythm`) is unchanged: one sequence with .slow(3).
    const old = draftFromHum(notes, { key: C, bpm: 108, downbeat: 1 });
    expect(old.line).toContain(".slow(3)");
    expect(await play(old)).toEqual(played);
  });

  test("two ties in a row join their bars into one bracket; a tie in cells", async () => {
    const notes = sung(
      [
        [60, 0, 3],
        [62, 3, 2], // into bar 2
        [64, 5, 2],
        [65, 7, 2], // into bar 3
        [67, 9, 3],
        [60, 12, 4],
      ],
      120,
    );
    const d = draftFromHum(notes, { key: C, bpm: 120, downbeat: 1, rhythm: { weights: true } });
    expect(d.pattern).toBe("<[0@3 1@2 2@2 3@2 4@3]@3 0>");
    const played = await play(d);
    expect(played.map(([m, on, len]) => [m, on * 4, len * 4])).toEqual([
      [60, 0, 3],
      [62, 3, 2],
      [64, 5, 2],
      [65, 7, 2],
      [67, 9, 3],
      [60, 12, 4],
    ]);
    const cells = draftFromHum(notes, { key: C, bpm: 120, downbeat: 1, rhythm: {} });
    expect(cells.pattern).toBe("<[0 _ _ 1 _ 2 _ 3 _ 4 _ _]@3 0>");
    expect(await play(cells)).toEqual(played);
  });
});

describe("triplets, when the grid allows them", () => {
  // quarter, a triplet, two eighths, quarter at 90 BPM, sung a little loosely.
  const spec: [number, number, number][] = [
    [60, 0, 1],
    [62, 1, 1 / 3],
    [64, 1 + 1 / 3, 1 / 3],
    [65, 1 + 2 / 3, 1 / 3],
    [67, 2, 0.5],
    [65, 2.5, 0.5],
    [64, 3, 1],
  ];

  test("a beat sung in thirds is drafted as a triplet; the beats around it stay duple", async () => {
    const d = draftFromHum(sung(spec, 90, { jitter: 0.012, gap: 0.03 }), {
      key: C,
      bpm: 90,
      downbeat: 1,
      rhythm: { weights: true, triplets: true },
    });
    expect(d.pattern).toBe("0 [1 2 3] [4 3] 2");
    expect(d.notes.map((n) => n.triplet === true)).toEqual([false, true, true, true, false, false, false]);
    expect(d.notes[2]?.onset).toEqual([1, 3]);
    expect(d.notes[2]?.dur).toEqual([1, 12]);
    expect(await play(d)).toEqual([
      [60, 0, 0.25],
      [62, 0.25, r6(1 / 12)],
      [64, r6(1 / 3), r6(1 / 12)],
      [65, r6(5 / 12), r6(1 / 12)],
      [67, 0.5, 0.125],
      [65, 0.625, 0.125],
      [64, 0.75, 0.25],
    ]);
  });

  test("without triplets in the grid the same take is squared to eighths (two notes collide)", () => {
    const d = draftFromHum(sung(spec, 90, { gap: 0.03 }), { key: C, bpm: 90, downbeat: 1, rhythm: {} });
    expect(d.notes.every((n) => n.triplet === undefined)).toBe(true);
    expect(d.warnings.some((w) => w.code === "collision-dropped")).toBe(true);
    expect(d.pattern).not.toContain("[1 2 3]");
  });

  test("even eighths are never read as a triplet, however loosely sung", () => {
    const eighths: [number, number, number][] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i) => [
      60 + (i % 5),
      b,
      0.5,
    ]);
    const d = draftFromHum(sung(eighths, 100, { jitter: 0.03, gap: 0.03 }), {
      key: C,
      bpm: 100,
      downbeat: 1,
      rhythm: { triplets: true },
    });
    expect(d.notes.some((n) => n.triplet)).toBe(false);
    expect(d.notes.length).toBe(8);
    expect(d.notes.map((n) => n.onset[0] / n.onset[1])).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => k / 8));
  });

  test("a swung pair in a straight project is the first and third of a triplet", async () => {
    // long–short: on the beat and at two thirds of it (U13.L05's link between swing and the triplet).
    const pairs: [number, number, number][] = [
      [60, 0, 2 / 3],
      [62, 2 / 3, 1 / 3],
      [64, 1, 2 / 3],
      [65, 1 + 2 / 3, 1 / 3],
      [67, 2, 2],
    ];
    const d = draftFromHum(sung(pairs, 84, { gap: 0.03 }), {
      key: C,
      bpm: 84,
      downbeat: 1,
      rhythm: { weights: true, triplets: true },
    });
    expect(d.pattern).toBe("[0@2 1] [2@2 3] 4@2");
    const played = await play(d);
    expect(played[1]).toEqual([62, r6(1 / 6), r6(1 / 12)]);
    expect(played[4]).toEqual([67, 0.5, 0.5]);
  });

  test("a triplet whose last note is held into the next beat: weighted values with nothing lost", async () => {
    const held: [number, number, number][] = [
      [60, 0, 1 / 3],
      [62, 1 / 3, 1 / 3],
      [64, 2 / 3, 1 + 1 / 3], // held through beat 2
      [65, 2, 2],
    ];
    const d = draftFromHum(sung(held, 80, { gap: 0.03 }), {
      key: C,
      bpm: 80,
      downbeat: 1,
      rhythm: { weights: true, triplets: true },
    });
    expect(d.pattern).toBe("0 1 2@4 3@6");
    expect(await play(d)).toEqual([
      [60, 0, r6(1 / 12)],
      [62, r6(1 / 12), r6(1 / 12)],
      [64, r6(1 / 6), r6(1 / 3)],
      [65, 0.5, 0.5],
    ]);
  });

  test("a triplet beside a dotted figure: the triplet stays a bracket in the weighted line", async () => {
    const mixed: [number, number, number][] = [
      [60, 0, 1.5],
      [62, 1.5, 0.5],
      [64, 2, 1 / 3],
      [65, 2 + 1 / 3, 1 / 3],
      [67, 2 + 2 / 3, 1 / 3],
      [72, 3, 1],
    ];
    const d = draftFromHum(sung(mixed, 92, { gap: 0.03 }), {
      key: C,
      bpm: 92,
      downbeat: 1,
      rhythm: { weights: true, triplets: true },
    });
    expect(d.pattern).toBe("0@3 1 [2 3 4]@2 7@2");
    const played = await play(d);
    expect(played[0]).toEqual([60, 0, 0.375]);
    expect(played[3]).toEqual([65, r6(0.5 + 1 / 12), r6(1 / 12)]);
    expect(played[5]).toEqual([72, 0.75, 0.25]);
  });

  test("compound meter needs no triplets: 6/8 is drafted in two beats of three", async () => {
    // 6/8 at 60 to the dotted quarter: quarter–eighth, three eighths.
    const beat = 1; // seconds
    const e = beat / 3;
    const notes: SungNote[] = [
      [62, 0, 2],
      [64, 2, 1],
      [65, 3, 1],
      [64, 4, 1],
      [62, 5, 1],
    ].map(([midi, at, len]) => ({
      start: 1 + (at as number) * e,
      end: 1 + ((at as number) + (len as number)) * e - 0.04,
      midi: midi as number,
      centsSpread: 8,
      frames: 30,
    }));
    const d = draftFromHum(notes, {
      key: { tonic: "D", mode: "minor" },
      bpm: 60,
      meter: "6/8",
      downbeat: 1,
      rhythm: { weights: true, triplets: true },
    });
    expect(d.tempoLine).toBe("setcpm(60/2)");
    expect(d.pattern).toBe("[0@2 1] [2 1 0]");
    expect(d.notes.some((n) => n.triplet)).toBe(false);
    expect((await play(d)).map(([m]) => m)).toEqual([62, 64, 65, 64, 62]);
  });
});

describe("through a key change", () => {
  // U17.L02's lift: a phrase in C for two bars, the same phrase a whole step up in D.
  const phrase: [number, number, number][] = [
    [60, 0, 1],
    [62, 1, 1],
    [64, 2, 1],
    [67, 3, 1],
    [65, 4, 1],
    [64, 5, 1],
    [62, 6, 2],
  ];
  const lifted = [
    ...phrase,
    ...phrase.map(([m, at, len]) => [m + 2, at + 8, len] as [number, number, number]),
  ];
  const plan = parseKeyPlan("<C4:major!2 D4:major!2>");

  test("the draft follows the key plan: the same degrees in both keys, a patterned .scale()", async () => {
    expect(plan).not.toBeNull();
    const d = draftFromHum(sung(lifted, 112), {
      key: C,
      bpm: 112,
      downbeat: 1,
      tonicOctave: 4,
      keyPlan: plan?.spans ?? [],
    });
    expect(d.scale).toBe("<C4:major!2 D4:major!2>");
    expect(d.pattern).toBe("<[0 1 2 4] [3 2 1 _] [0 1 2 4] [3 2 1 _]>");
    expect(d.line).toBe(
      'mel: n("<[0 1 2 4] [3 2 1 _] [0 1 2 4] [3 2 1 _]>").scale("<C4:major!2 D4:major!2>")',
    );
    expect(d.keyPlan).toEqual([
      { key: C, scale: "C4:major", fromBar: 0, bars: 2 },
      { key: { tonic: "D", mode: "major" }, scale: "D4:major", fromBar: 2, bars: 2 },
    ]);
    expect(d.notes.map((n) => n.degree)).toEqual([
      "1",
      "2",
      "3",
      "5",
      "4",
      "3",
      "2",
      "1",
      "2",
      "3",
      "5",
      "4",
      "3",
      "2",
    ]);
    expect(d.notes[7]?.key).toEqual({ tonic: "D", mode: "major" });
    expect(d.warnings).toEqual([]);
    // Played back: the sung pitches, F♯ and all.
    expect((await play(d)).map(([m]) => m)).toEqual(lifted.map(([m]) => m));
  });

  test("without the plan the lifted bars are bent back into C (F♯ and C♯ snapped): what the plan prevents", () => {
    const d = draftFromHum(sung(lifted, 112), { key: C, bpm: 112, downbeat: 1, tonicOctave: 4 });
    expect(d.keyPlan).toBeNull();
    expect(d.warnings.filter((w) => w.code === "chromatic-snapped").length).toBe(2);
    expect(d.scale).toBe("C4:major");
  });

  test("a draft that starts later in the piece reads the plan from its own first bar", async () => {
    // Bars 15–18 of a piece that lifts at bar 17 (0-based 16): two bars in C, two in D.
    const piece = parseKeyPlan("<C4:major!16 D4:major!8>");
    const d = draftFromHum(sung(lifted, 112), {
      key: C,
      bpm: 112,
      downbeat: 1,
      tonicOctave: 4,
      keyPlan: piece?.spans ?? [],
      firstBar: 14,
    });
    expect(d.scale).toBe("<C4:major!2 D4:major!2>");
    expect((await play(d)).map(([m]) => m)).toEqual(lifted.map(([m]) => m));
    // Wholly after the lift: one key, a plain scale, and the plan still reported.
    const after = draftFromHum(
      sung(
        phrase.map(([m, at, len]) => [m + 2, at, len]),
        112,
      ),
      { key: C, bpm: 112, downbeat: 1, tonicOctave: 4, keyPlan: piece?.spans ?? [], firstBar: 20 },
    );
    expect(after.scale).toBe("D4:major");
    expect(after.line).toContain('.scale("D4:major")');
    expect(after.keyPlan?.length).toBe(1);
    expect(after.warnings).toEqual([]);
  });

  test("a note tied over the key change keeps the key it started in; .slow() comes before the patterned scale", async () => {
    // The last note of bar 2 (in C) is held into bar 3 (in D).
    const held: [number, number, number][] = [
      [60, 0, 2],
      [64, 2, 2],
      [65, 4, 2],
      [67, 6, 4], // G, tied into the D bars
      [69, 10, 2], // A = 5 of D
      [74, 12, 4], // D = 1 of D, an octave up
    ];
    const d = draftFromHum(sung(held, 100), {
      key: C,
      bpm: 100,
      downbeat: 1,
      tonicOctave: 4,
      keyPlan: plan?.spans ?? [],
    });
    expect(d.line).toBe('mel: n("0 2 3 4 _ 4 7 _").slow(4).scale("<C4:major!2 D4:major!2>")');
    expect(d.notes.map((n) => n.degree)).toEqual(["1", "3", "4", "5", "5", "1"]);
    expect((await play(d)).map(([m, on, len]) => [m, on, len])).toEqual([
      [60, 0, 0.5],
      [64, 0.5, 0.5],
      [65, 1, 0.5],
      [67, 1.5, 1],
      [69, 2.5, 0.5],
      [74, 3, 1],
    ]);
    // The same with the Wave 6 rhythm writer: a bracket over the tied bars, the plan unchanged.
    const w = draftFromHum(sung(held, 100), {
      key: C,
      bpm: 100,
      downbeat: 1,
      tonicOctave: 4,
      keyPlan: plan?.spans ?? [],
      rhythm: { weights: true },
    });
    expect(w.line).toBe('mel: n("<[0 2] [3 4@2 4]@2 7>").scale("<C4:major!2 D4:major!2>")');
    expect(await play(w)).toEqual(await play(d));
  });

  test("the later tonic is written in the octave nearest the first: down to B♭3, up to D♭5 from C5, bass in octave 2", async () => {
    const down = draftFromHum(
      sung(
        [
          [60, 0, 2],
          [64, 2, 2],
          [58, 4, 2],
          [62, 6, 2],
        ],
        100,
      ),
      {
        key: C,
        bpm: 100,
        downbeat: 1,
        tonicOctave: 4,
        keyPlan: [
          { key: C, fromBar: 0 },
          { key: { tonic: "Bb", mode: "major" }, fromBar: 1 },
        ],
      },
    );
    expect(down.scale).toBe("<C4:major Bb3:major>");
    expect(down.pattern).toBe("<[0 2] [0 2]>");
    expect((await play(down)).map(([m]) => m)).toEqual([60, 64, 58, 62]);
    // A bass line hummed two octaves up, drafted at octave 2, through D♭ → D (Body and Soul's bridge).
    const bass = draftFromHum(
      sung(
        [
          [61, 0, 2],
          [68, 2, 2],
          [62, 4, 2],
          [69, 6, 2],
        ],
        72,
      ),
      {
        key: { tonic: "Db", mode: "major" },
        bpm: 72,
        downbeat: 1,
        tonicOctave: 2,
        label: "bass",
        keyPlan: [
          { key: { tonic: "Db", mode: "major" }, fromBar: 0, octave: 4 },
          { key: { tonic: "D", mode: "major" }, fromBar: 1, octave: 4 },
        ],
      },
    );
    expect(bass.line).toBe('bass: n("<[0 4] [0 4]>").scale("<Db2:major D2:major>")');
    expect((await play(bass)).map(([m]) => m)).toEqual([37, 44, 38, 45]);
  });

  test("a move to the dominant: the new tonic's octave is the one the tune sits in (G4, not G3)", async () => {
    // U17.L01: four bars' worth in two — C major, then G major through its own F♯, the tune above G4.
    const tune: [number, number, number][] = [
      [64, 0, 1],
      [67, 1, 1],
      [72, 2, 2],
      [71, 4, 1],
      [74, 5, 1],
      [78, 6, 1], // F♯5: 7 of G
      [79, 7, 1],
    ];
    const d = draftFromHum(sung(tune, 104), {
      key: C,
      bpm: 104,
      downbeat: 1,
      tonicOctave: 4,
      keyPlan: [
        { key: C, fromBar: 0 },
        { key: { tonic: "G", mode: "major" }, fromBar: 1 },
      ],
    });
    expect(d.scale).toBe("<C4:major G4:major>");
    expect(d.pattern).toBe("<[2 4 7 _] [2 4 6 7]>");
    expect(d.notes.map((n) => n.degree)).toEqual(["3", "5", "1", "3", "5", "7", "1"]);
    expect(d.warnings).toEqual([]);
    expect((await play(d)).map(([m]) => m)).toEqual(tune.map(([m]) => m));
    // The same tune an octave lower in its second bar sits under G4: the nearer tonic, G3, is kept.
    const low = draftFromHum(
      sung(
        tune.map(([m, at, len]) => [at >= 4 ? m - 12 : m, at, len]),
        104,
      ),
      {
        key: C,
        bpm: 104,
        downbeat: 1,
        tonicOctave: 4,
        keyPlan: [
          { key: C, fromBar: 0 },
          { key: { tonic: "G", mode: "major" }, fromBar: 1 },
        ],
      },
    );
    expect(low.scale).toBe("<C4:major G3:major>");
    expect(low.pattern).toBe("<[2 4 7 _] [2 4 6 7]>");
  });

  test("the plan's own octaves are used when no octave is asked for", () => {
    const d = draftFromHum(sung(lifted, 112), {
      key: C,
      bpm: 112,
      downbeat: 1,
      keyPlan: parseKeyPlan("<C3:major!2 D3:major!2>")?.spans ?? [],
    });
    expect(d.scale).toBe("<C3:major!2 D3:major!2>");
    expect(d.octaveShift).toBe(-1);
  });

  test("minor to its parallel major (a Picardy turn): each bar keeps its own raised and lowered degrees", async () => {
    const A = { tonic: "A", mode: "minor" as const };
    const d = draftFromHum(
      sung(
        [
          [57, 0, 1],
          [60, 1, 1],
          [64, 2, 1],
          [65, 3, 1],
          [69, 4, 1],
          [61, 5, 1], // C♯: 3 of A major
          [64, 6, 2],
        ],
        96,
      ),
      {
        key: A,
        bpm: 96,
        downbeat: 1,
        tonicOctave: 3,
        keyPlan: [
          { key: A, fromBar: 0 },
          { key: { tonic: "A", mode: "major" }, fromBar: 1 },
        ],
      },
    );
    expect(d.scale).toBe("<A3:minor A3:major>");
    expect(d.notes.map((n) => n.degree)).toEqual(["1", "b3", "5", "b6", "1", "3", "5"]);
    expect((await play(d)).map(([m]) => m)).toEqual([57, 60, 64, 65, 69, 61, 64]);
  });
});

test("rhythm and a key plan together, with swing: one line that plays what was sung", async () => {
  const plan = parseKeyPlan("<F4:major!1 G4:major!1>");
  // Bar 1 in F: dotted quarter, eighth, half. Bar 2 in G: the same, a step up.
  const spec: [number, number, number][] = [
    [65, 0, 1.5],
    [67, 1.5, 0.5],
    [69, 2, 2],
    [67, 4, 1.5],
    [69, 5.5, 0.5],
    [71, 6, 2],
  ];
  const d = draftFromHum(sung(spec, 88), {
    key: { tonic: "F", mode: "major" },
    bpm: 88,
    downbeat: 1,
    tonicOctave: 4,
    keyPlan: plan?.spans ?? [],
    rhythm: { weights: true, triplets: true },
    sound: "piano",
  });
  expect(d.line).toBe('mel: n("<[0@3 1 2@4] [0@3 1 2@4]>").scale("<F4:major G4:major>").s("piano")');
  expect(await play(d)).toEqual([
    [65, 0, 0.375],
    [67, 0.375, 0.125],
    [69, 0.5, 0.5],
    [67, 1, 0.375],
    [69, 1.375, 0.125],
    [71, 1.5, 0.5],
  ]);
});

// From the microphone's frames (the synthetic voice corpus, through the worklet's detector) to the draft.
describe("humToDraft on the voice corpus", () => {
  /** A sung line: `[midi, beats]` each, articulated, rendered by the corpus voice from 0.4 s. */
  function clipOf(id: string, line: [number, number][], bpm: number) {
    const beat = 60 / bpm;
    const parts: ClipPart[] = [{ kind: "gap", sec: 0.4 }];
    for (const [midi, beats] of line) {
      parts.push({ kind: "phrase", notes: [{ midi, dur: beats * beat - 0.06 }] });
      parts.push({ kind: "gap", sec: 0.06 });
    }
    parts.push({ kind: "gap", sec: 0.4 });
    const clip = renderClip({ id, cls: "steady", rangeLow: 48, timbre: { vowel: "a" }, parts });
    return { clip, frames: analyzeClip(clip) };
  }

  test("a hummed bar with a triplet and a dotted figure, lifted a whole step in bar 2", async () => {
    const bar = (up: number): [number, number][] => [
      [60 + up, 1.5],
      [62 + up, 0.5],
      [64 + up, 1 / 3],
      [65 + up, 1 / 3],
      [67 + up, 1 / 3],
      [64 + up, 1],
    ];
    const { clip, frames } = clipOf("hum/w6-triplet-lift", [...bar(0), ...bar(2)], 72);
    const d = humToDraft(frames, {
      key: C,
      bpm: 72,
      tonicOctave: 4,
      keyPlan: parseKeyPlan("<C4:major D4:major>")?.spans ?? [],
      rhythm: { weights: true, triplets: true },
      profile: { rangeLow: clip.profile.rangeLow, noiseFloorDb: clip.profile.noiseFloorDb, singLatencyMs: 0 },
    });
    expect(d.sung.length).toBe(12);
    expect(d.line).toBe(
      'mel: n("<[0@3 1 [2 3 4]@2 2@2] [0@3 1 [2 3 4]@2 2@2]>").scale("<C4:major D4:major>")',
    );
    expect(d.degrees.map((x) => x.degree)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "3",
      "1",
      "2",
      "3",
      "4",
      "5",
      "3",
    ]);
    expect((await play(d)).map(([m]) => m)).toEqual([60, 62, 64, 65, 67, 64, 62, 64, 66, 67, 69, 66]);
  });
});
