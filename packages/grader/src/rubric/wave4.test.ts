// The Wave 4 rubric rules on real Strudel pieces (content-kit rubric.ts; AUTHORING §17.5–§17.7): a passing
// piece and a known-wrong variant for each, with the music stated in the test name and checked by hand in
// C major unless said otherwise.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { RubricRule } from "@oak/content-kit";
import { line, norm, strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback, unknownCodes } from "../feedback/catalog.ts";
import type { RubricContext } from "./context.ts";
import { voicedChords, voicingGateCheck } from "./harmony-rules.ts";
import { evaluateRubric, rubricMatch } from "./index.ts";
import { evalRule } from "./rules.ts";

setDefaultTimeout(30_000);

type Body = RubricRule extends infer R
  ? R extends RubricRule
    ? Omit<R, "id" | "label" | "required" | "skills">
    : never
  : never;
const rule = (body: Body): RubricRule =>
  ({ id: body.rule, label: body.rule, required: true, skills: [], ...body }) as RubricRule;
const C = { tonic: "C", mode: "major" } as const;

async function check(r: RubricRule, code: string, bars: number, o: Partial<RubricContext> = {}) {
  const n = await strudel(code, bars);
  const ctx: RubricContext = { meter: "4/4", key: C, code, params: {}, bars, ...o };
  const { rows, extra } = evaluateRubric([r], n, ctx);
  expect(unknownCodes([...rows.map((x) => x.diag as never), ...extra])).toEqual([]);
  const row = rows[0] as (typeof rows)[number];
  return { row, extra, detail: evalRule(r, n, ctx).detail, n, ctx };
}
const passes = async (r: RubricRule, code: string, bars = 4, o: Partial<RubricContext> = {}) => {
  const res = await check(r, code, bars, o);
  if (!res.row.ok) throw new Error(`${r.rule} should pass: ${res.detail}`);
  return res;
};
const fails = async (r: RubricRule, code: string, bars = 4, o: Partial<RubricContext> = {}) => {
  const res = await check(r, code, bars, o);
  if (res.row.ok) throw new Error(`${r.rule} should fail: ${res.detail}`);
  return res;
};
const chords = (stacks: string) => `chords: n("<${stacks}>").scale("C3:major").s("piano")`;

describe("chord-qualities (U05 Makes)", () => {
  test("anyOf dim/aug (U05.L03): a loop with B° passes; four major and minor triads fail", async () => {
    const r = rule({ rule: "chord-qualities", anyOf: ["dim", "aug"], min: 1 });
    await passes(r, chords("[0,2,4] [3,5,7] [6,8,10] [0,2,4]"));
    const f = await fails(r, chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]"));
    expect(f.detail).toBe("0 chords are diminished or augmented; at least 1");
  });
  test("an augmented triad written as notes (C E G#) counts", async () => {
    await passes(
      rule({ rule: "chord-qualities", anyOf: ["aug"] }),
      'chords: note("<[c3,e3,g#3] [c3,e3,g3]>").s("piano")',
      2,
    );
  });
  test("min alone counts triads: a cluster (C D E) is not one, and the detail says how to stack", async () => {
    const r = rule({ rule: "chord-qualities", min: 4 });
    await passes(r, chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]"));
    const f = await fails(r, chords("[0,2,4] [0,1,2] [5,7,9] [3,5,7]"));
    expect(f.detail).toContain("3 triads; at least 4");
    expect(f.detail).toContain("bar 2 (C3 D3 E3) is not stacked in 3rds");
  });
  test("a dyad is not a chord; the loop's repeats never count twice", async () => {
    // Two bars of triads played for 8 bars are 2 chords, not 8.
    const f = await fails(rule({ rule: "chord-qualities", min: 3 }), chords("[0,2,4] [4,6,8]"), 8);
    expect(f.detail).toContain("2 triads");
    await fails(rule({ rule: "chord-qualities", min: 1 }), chords("[0,2] [4,6]"), 2);
  });
  test("contains and subsetOf name the chord that breaks the brief", async () => {
    await passes(rule({ rule: "chord-qualities", contains: ["maj", "min"] }), chords("[0,2,4] [5,7,9]"), 2);
    const c = await fails(
      rule({ rule: "chord-qualities", contains: ["maj", "dim"] }),
      chords("[0,2,4] [5,7,9]"),
      2,
    );
    expect(c.detail).toBe("no diminished chord yet");
    const s = await fails(rule({ rule: "chord-qualities", subsetOf: ["maj"] }), chords("[0,2,4] [5,7,9]"), 2);
    expect(s.detail).toBe("bar 2 is Am (minor); the brief allows major");
  });
  test("sevenths (U06.L10): anyOf maj7/7/m7/m7b5 min 2 over Imaj7 vi7 ii7 V7", async () => {
    const r = rule({ rule: "chord-qualities", anyOf: ["maj7", "7", "m7", "m7b5"], min: 2 });
    await passes(r, chords("[0,2,4,6] [5,7,9,11] [1,3,5,7] [4,6,8,10]"));
    await fails(r, chords("[0,2,4] [5,7,9] [1,3,5,7] [4,6,8]"), 4).catch(() => undefined);
    const one = await check(r, chords("[0,2,4] [5,7,9] [1,3,5] [4,6,8,10]"), 4);
    expect(one.row.ok).toBe(false);
  });
  test("chord() symbols name their chords whatever the voicing (U05.L08 on)", async () => {
    await passes(
      rule({ rule: "chord-qualities", anyOf: ["dim"] }),
      'chords: chord("<C Bo Am F>").voicing().s("piano")',
    );
  });
});

describe("chord-inversions (U05.L05, U06.L11)", () => {
  test("a bass track on B under G makes G/B: one first inversion", async () => {
    const r = rule({ rule: "chord-inversions", min: 1 });
    const ok = await passes(r, `${chords("[0,2,4] [4,6,8]")}\nbass: note("<c2 b1>").s("piano")`, 2);
    expect(ok.detail).toBe("1 chord with the 3rd or the 5th in the bass: G/B");
    const f = await fails(r, `${chords("[0,2,4] [4,6,8]")}\nbass: note("<c2 g1>").s("piano")`, 2);
    expect(f.detail).toContain("every chord has its root as the lowest note");
  });
  test("an inversion stacked inside the chord track: [2,4,7] is C/E", async () => {
    await passes(rule({ rule: "chord-inversions", min: 1, of: [1] }), chords("[2,4,7] [4,6,8]"), 2);
    // C/G is a second inversion: it does not count when only first inversions are asked for.
    const f = await fails(rule({ rule: "chord-inversions", min: 1, of: [1] }), chords("[4,7,9] [4,6,8]"), 2);
    expect(f.detail).toContain("bar 1 has the 5th lowest");
  });
});

describe("pickup (U07.L08)", () => {
  const tune = (bar0: string) =>
    `setcpm(90/3)\nmel: n("<${bar0} [2 1 0] [4@2 2] [0@3]>").scale("C4:major").s("piano")`;
  test("3/4 with a one-beat pickup: [~ ~ 4] passes with units 1, fails with units 2", async () => {
    await passes(rule({ rule: "pickup", track: "mel", units: [1, 1] }), tune("[~ ~ 4]"), 4, { meter: "3/4" });
    const f = await fails(rule({ rule: "pickup", track: "mel", units: [2, 1] }), tune("[~ ~ 4]"), 4, {
      meter: "3/4",
    });
    expect(f.detail).toBe("the pickup is 1 beat long; the brief asks for 2 beats");
  });
  test("a line that starts on the downbeat has no pickup; an empty bar 0 neither", async () => {
    const a = await fails(rule({ rule: "pickup", track: "mel" }), tune("[4 4 4]"), 4, { meter: "3/4" });
    expect(a.detail).toContain("starts on the downbeat of bar 0");
    const b = await fails(rule({ rule: "pickup", track: "mel" }), tune("~"), 4, { meter: "3/4" });
    expect(b.detail).toContain("bar 0 is empty");
  });
});

describe("voice-leading: the voicing gate (U05.L07 hand-voiced-cadence)", () => {
  const gate = rule({
    rule: "voice-leading",
    track: "chords",
    maxMovePerVoice: 2,
    voices: 3,
    commonTones: true,
    noCrossing: true,
  });
  const voiced = (stacks: string) =>
    `chords: note("<${stacks}>").s("piano")\nbass: note("<c2 f2 g2 c2>").s("piano")`;
  // Checked by hand: with every voice moving at most 2 semitones, I–IV–V–I in C is C E G | C F A | D G B |
  // E G C. The textbook B D G after C F A moves F down to D, a minor 3rd (3 semitones).
  const SMOOTH = "[c4,e4,g4] [c4,f4,a4] [d4,g4,b4] [e4,g4,c5]";
  test("I–IV–V–I voiced close (C E G, C F A, D G B, E G C) passes at 1", async () => {
    const ok = await passes(gate, voiced(SMOOTH));
    expect(ok.row.value).toBe(1);
  });
  test("B D G after C F A: F moves a minor 3rd to D, named with the nearest note (G)", async () => {
    const f = await fails(gate, voiced("[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]"));
    expect(f.detail).toContain("bar 3: the voice on F4 moves 3 half steps to D4; G4 is 2 away");
    expect(Number(f.row.value)).toBeGreaterThan(0.9);
  });
  test("root-position jumps (C E G → F A C → G B D) fail: each leap is named with its nearest note", async () => {
    const f = await fails(gate, voiced("[c4,e4,g4] [f4,a4,c5] [g4,b4,d5] [c4,e4,g4]"));
    const leaps = f.extra.filter((d) => d.id === "harmony.voice-leap");
    expect(leaps.length).toBeGreaterThan(0);
    expect(renderFeedback(leaps[0] as never)).toBe(
      "Bar 2: the voice on C4 jumps 5 half steps to F4. The nearest note of the new chord is C4; move at most 2.",
    );
    expect(f.extra.some((d) => d.id === "harmony.common-tone")).toBe(true);
    expect(Number(f.row.value)).toBeLessThan(0.9);
  });
  test("corrections gate: a stack written out of order is heard from the bottom up, so `[d4,b4,g4]` is D G B", async () => {
    // The ear hears D4 G4 B4 whatever order the stack is written in; the old written-order reading failed the
    // smooth path written this way as crossing voices (attack:still-passes, notes for the gate).
    await passes(gate, voiced("[c4,e4,g4] [c4,a4,f4] [d4,b4,g4] [e4,c5,g4]"));
    // A real leap is still a leap, however the stack is written.
    const f = await fails(gate, voiced("[c4,e4,g4] [c4,f4,a4] [g3,d4,b4] [c4,e4,g4]"));
    expect(f.extra.some((d) => d.id === "harmony.voice-leap")).toBe(true);
  });
  test("four notes where three voices are asked for: harmony.voice-count, score below the gate", async () => {
    const f = await fails(gate, voiced("[c4,e4,g4,c5] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]"));
    expect(f.extra.some((d) => d.id === "harmony.voice-count")).toBe(true);
    expect(Number(f.row.value)).toBeLessThan(0.9);
  });
  test("an octave higher passes too (graded by motion, never by octave)", async () => {
    await passes(gate, voiced("[c5,e5,g5] [c5,f5,a5] [d5,g5,b5] [e5,g5,c6]"));
  });
  test("bassFree: a root bass inside the chord track may leap by 4ths and 5ths", async () => {
    const withBass = rule({
      rule: "voice-leading",
      track: "chords",
      maxMovePerVoice: 2,
      voices: 4,
      commonTones: true,
      noCrossing: true,
      bassFree: true,
    });
    const code = 'chords: note("<[c3,c4,e4,g4] [f2,c4,f4,a4] [g2,d4,g4,b4] [c3,e4,g4,c5]>").s("piano")';
    await passes(withBass, code);
    await fails({ ...withBass, bassFree: false } as RubricRule, code);
  });
  test("score in [0, 1]: one faulty change out of three", () => {
    const chordsAt = (xs: number[][]) =>
      xs.map((voices, i) => ({ at: [i, 1] as [number, number], voices, ids: [] }));
    const g = voicingGateCheck(
      chordsAt([
        [60, 64, 67],
        [60, 65, 69],
        [59, 62, 67],
        [64, 67, 72],
      ]),
      { maxMovePerVoice: 2, voices: 3, commonTones: true, noCrossing: true },
      { meter: "4/4" },
      C,
    );
    expect(g.changes).toBe(3);
    expect(g.score).toBeGreaterThan(0.5);
    expect(g.score).toBeLessThan(1);
  });
  test("voices keep the order they are written in", async () => {
    const n = await strudel('chords: note("<[g4,c4,e4] [a4,c4,f4]>").s("piano")', 2);
    expect(voicedChords(n.byTrack.chords ?? []).map((c) => c.voices)).toEqual([
      [67, 60, 64],
      [69, 60, 65],
    ]);
  });
  test("the gate exercise's matcher: all of pcset and the rule, ≥ 0.9 only when smooth", async () => {
    const n = await strudel(voiced(SMOOTH), 4);
    const m = rubricMatch([gate], n, { meter: "4/4", key: C, code: "", params: {}, bars: 4 });
    expect(m.score).toBe(1);
  });
});

describe("progression with bars (C2: loop, then land)", () => {
  const C2 = rule({ rule: "progression", schema: "schema.axis", allowRotation: true, bars: [1, 6] });
  const song = (prog: string) => `chords: chord("<${prog}>").voicing().s("piano")`;
  test("bars 1–6 are the loop (C G Am F C G), then G C lands: passes", async () => {
    await passes(C2, song("C G Am F C G G C"), 8);
  });
  test("any rotation passes (Am F C G Am F); sevenths pass on the triad core (jazz flavour)", async () => {
    await passes(C2, song("Am F C G Am F G C"), 8);
    await passes(C2, song("C^7 G7 Am7 F^7 C^7 G7 G7 C^7"), 8);
  });
  test("bar 3 is IV where the loop wants vi: the detail names the bar and both numerals", async () => {
    const f = await fails(C2, song("C G F F C G G C"), 8);
    expect(f.detail).toContain("bar 3 is IV (F); the loop wants vi (Am) there");
  });
  test("hand-stacked chords pass too; a cluster in bar 2 is no chord", async () => {
    await passes(C2, chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]"), 8);
    const f = await fails(C2, chords("[0,2,4] [4,5,6] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]"), 8);
    expect(f.detail).toContain("bar 2 is no chord");
  });
});

describe("matches inside a Make (Wave 4 fix)", () => {
  test("a pcset match of an identical 4-bar loop read over 16 bars scores 1, not 25%", async () => {
    const loop = chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]");
    const r = rule({
      rule: "matches",
      reference: { solutions: [loop], bars: 4 },
      matcher: { m: "pcset", perOnset: true, bass: true, tracks: ["chords"] },
      min: 0.9,
    });
    const ref = await strudel(loop, 4);
    const n = await strudel(loop, 16);
    const ctx: RubricContext = {
      meter: "4/4",
      key: C,
      code: loop,
      params: {},
      bars: 16,
      resolveReference: () => ref,
    };
    const e = evalRule(r, n, ctx);
    expect(e.ok).toBe(true);
    expect(e.value).toBe(1);
  });
});

describe("ends-on-degree reads one pass of a loop with a pickup (U07.L08)", () => {
  // 3/4, a one-beat pickup; the last bar ends on 1 and then plays the pickup of the next turn (5).
  const code = 'setcpm(90/3)\nmel: n("<[~ ~ 4] [2 1 0] [4@2 2] [0 ~ 4]>").scale("C4:major").s("piano")';
  test("the pickup into the next turn is not the last note", async () => {
    await passes(rule({ rule: "ends-on-degree", degrees: ["1"], track: "mel" }), code, 9, {
      meter: "3/4",
      pickup: { units: [1, 1] },
    });
  });
  test("without a declared pickup the 5 at the end is the last note", async () => {
    const f = await fails(rule({ rule: "ends-on-degree", degrees: ["1"], track: "mel" }), code, 9, {
      meter: "3/4",
    });
    expect(f.detail).toContain("it ends on 5");
  });
});

describe("non-chord-tones (U07.L04–L05)", () => {
  // C | G | Am | F under the tune; bar 1 E D C (D passes between two C-chord tones), bar 2 G A G (A is a
  // neighbour over G), bars 3–4 chord tones only.
  const tune = (mel: string) =>
    `${chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]")}\nmel: n("<${mel}>").scale("C4:major").s("piano")`;
  test("a passing note and a neighbour: two non-chord tones; at least 2 passes, 3 fails", async () => {
    const code = tune("[2 1 0 ~] [4 5 4 ~] [5 ~ 2 ~] [3 ~ 0 ~]");
    const ok = await passes(rule({ rule: "non-chord-tones", track: "mel", min: 2 }), code);
    expect(ok.detail).toContain(
      "2 passing or neighbour or appoggiatura or suspension or anticipation or escape notes",
    );
    await fails(rule({ rule: "non-chord-tones", track: "mel", min: 3 }), code);
  });
  test("roles filter: only passing notes count; a line of chord tones has none", async () => {
    const code = tune("[2 1 0 ~] [4 5 4 ~] [5 ~ 2 ~] [3 ~ 0 ~]");
    const p = await check(
      rule({ rule: "non-chord-tones", track: "mel", roles: ["passing"], min: 1 }),
      code,
      4,
    );
    expect(p.row.ok).toBe(true);
    expect(p.row.value).toBe(1);
    const f = await fails(
      rule({ rule: "non-chord-tones", track: "mel", min: 1 }),
      tune("[2 ~ 0 ~] [4 ~ 1 ~] [5 ~ 2 ~] [3 ~ 0 ~]"),
    );
    expect(f.detail).toContain("0 ");
  });
});

describe("chord-tones-strong against the Band's chords (U06.L05: melody bass, harmony band.chords)", () => {
  test("a walking bass C D E F | G A B G over the Band's C | G: beats 1 and 3 are chord tones", () => {
    const n = norm(
      line("bass", "48:1/4 50:1/4 52:1/4 53:1/4 43:1/4 45:1/4 47:1/4 43:1/4"),
      line("band.chords", "60,64,67:1 55,59,62:1"),
    );
    const r = rule({
      rule: "chord-tones-strong",
      minRatio: 1,
      melody: "bass",
      harmony: "band.chords",
      strength: "strong",
    });
    const e = evalRule(r, n, { meter: "4/4", key: C, code: "", params: {}, bars: 2 });
    expect(e.ok).toBe(true);
    expect(e.value).toBe(1);
    // D on beat 3 of bar 1 (C D D F) is not a C-chord tone.
    const off = norm(
      line("bass", "48:1/4 50:1/4 50:1/4 53:1/4 43:1/4 45:1/4 47:1/4 43:1/4"),
      line("band.chords", "60,64,67:1 55,59,62:1"),
    );
    expect(evalRule(r, off, { meter: "4/4", key: C, code: "", params: {}, bars: 2 }).ok).toBe(false);
  });
});

describe("chord-tones-strong with melody on the bass over the learner's own stacked chords (integration)", () => {
  // The bass line is the line under test: it must not take part in naming the chord it is checked against.
  const r = rule({
    rule: "chord-tones-strong",
    minRatio: 1,
    melody: "bass",
    harmony: "*",
    strength: "strong",
  });
  test("roots I V vi IV under I V vi IV pass", async () => {
    await passes(
      r,
      `${chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]")}\nbass: n("<0 4 5 3>").scale("C2:major").s("gm_acoustic_bass")`,
    );
  });
  test("roots I vi IV V under I V vi IV fail (A under G B D is not a chord tone)", async () => {
    const f = await fails(
      r,
      `${chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]")}\nbass: n("<0 5 3 4>").scale("C2:major").s("gm_acoustic_bass")`,
    );
    expect(f.detail).toContain("25%");
  });
  test("a learner track with a free label (harm:) still names the chords without the bass", async () => {
    const f = await fails(
      r,
      `harm: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")\nbass: n("<0 5 3 4>").scale("C2:major").s("gm_acoustic_bass")`,
    );
    expect(f.detail).toContain("25%");
  });
});

describe("harmonic-rhythm on a mixed loop (U06.L08)", () => {
  test("bars with one and two changes average 1.5 a bar: inside [1.25, 2]; one a bar is not", async () => {
    const r = rule({ rule: "harmonic-rhythm", changesPerBar: [1.25, 2] });
    await passes(r, chords("[0,2,4] [[4,6,8] [5,7,9]] [3,5,7] [[4,6,8] [0,2,4]]"), 8);
    const f = await fails(r, chords("[0,2,4] [4,6,8] [5,7,9] [3,5,7]"), 8);
    expect(f.detail).toBe("1 chord changes per bar; the brief asks for 1.25–2");
  });
});
