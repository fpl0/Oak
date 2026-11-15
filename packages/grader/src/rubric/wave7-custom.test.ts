// Wave 7 Build (grader): the advanced tracks' custom rules (rubric/wave7-custom.ts) on real Strudel 1.2.6 output.
// For each rule: right answers of more than one shape pass; the pre-flight's counterexample fails (w7plan A3–A7);
// and a WRONG answer that USES THE RIGHT FUNCTION fails, with a line that names the fault and never the code that
// would fix it. Pieces are read as `normalize` reads them: a part more than 24 dB under the loudest part, or
// silent, is not heard (decision 71).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, MeterId, NEvent, RubricRule } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { normalizedFromEvents } from "../analyze/tracks.ts";
import { MASKED_RATIO, SILENT_GAIN } from "../normalize/nevent.ts";
import type { Normalized, SongMelodyNote } from "../types.ts";
import type { RubricContext } from "./context.ts";
import { CUSTOM_RULES, evalRule } from "./rules.ts";
import { WAVE7_BUILT_CUSTOM } from "./wave7-custom.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const rule = (fn: string, params: Record<string, unknown> = {}): RubricRule =>
  ({
    id: "w7",
    label: "w7",
    required: true,
    skills: [],
    rule: "custom",
    fn,
    params,
  }) as unknown as RubricRule;

/** The piece as `normalize` hears it: silent events and parts 24 dB under the loudest learner part left out. */
export async function heard(code: string, bars: number, meter: MeterId = "4/4"): Promise<Normalized> {
  const raw = await strudel(code, bars);
  const peak = raw.all.reduce((m, e) => Math.max(m, e.gain), 0);
  const keep = (e: NEvent) => e.gain > SILENT_GAIN && e.gain >= peak * MASKED_RATIO;
  const events = [...raw.all, ...raw.band].filter(keep);
  const units = meter === "7/8" ? 7 : meter === "3/4" || meter === "6/8" ? 3 : meter === "5/4" ? 5 : 4;
  const n = normalizedFromEvents(events, { cps: raw.cps, bpm: raw.cps * 60 * units });
  for (const t of Object.keys(raw.byTrack)) n.byTrack[t] ??= [];
  return n;
}
interface Opts {
  bars?: number;
  key?: KeySpec | null;
  meter?: MeterId;
  extra?: Partial<RubricContext>;
}
async function run(fn: string, params: Record<string, unknown>, code: string, o: Opts = {}) {
  const bars = o.bars ?? 4;
  const meter = o.meter ?? "4/4";
  const n = await heard(code, bars, meter);
  const ctx: RubricContext = {
    meter,
    code,
    params: {},
    bars,
    totalBars: bars,
    ...(o.key === null ? {} : { key: o.key ?? C }),
    ...o.extra,
  };
  return evalRule(rule(fn, params), n, ctx);
}
async function passes(fn: string, params: Record<string, unknown>, codes: string[], o: Opts = {}) {
  for (const code of codes) {
    const r = await run(fn, params, code, o);
    if (!r.ok) throw new Error(`expected a pass for:\n${code}\n→ ${r.detail}`);
  }
}
async function fails(fn: string, params: Record<string, unknown>, code: string, re: RegExp, o: Opts = {}) {
  const r = await run(fn, params, code, o);
  if (r.ok) throw new Error(`expected a fail for:\n${code}\n→ ${r.detail}`);
  expect(r.detail).toMatch(re);
  // Below the reveal rung nothing names the answer: no rule detail prints Strudel code to write.
  expect(r.detail).not.toMatch(/\.(swingBy|late|early|voicing|anchor|offset|slice|chop|gain|clip|euclid)\(/);
  return r;
}

test("every Wave 7 custom rule is registered", () => {
  for (const fn of WAVE7_BUILT_CUSTOM) expect(typeof CUSTOM_RULES[fn]).toBe("function");
});

describe("jazz harmony", () => {
  const F = { tonic: "F", mode: "major" } as KeySpec;
  const chords = 'chords: chord("<F7 Bb7 F7 C7>").voicing()';
  test("walking-bass: a note on every beat, roots on 1, approached from 4 (J3.L04, JC2)", async () => {
    await passes(
      "walking-bass",
      {},
      [
        `${chords}\nbass: note("<[f2 a2 c3 a2] [bb2 d3 f3 a2] [f2 a2 c3 b2] [c3 e3 g3 gb2]>").s("upright")`,
        // Chromatic approaches from below and above.
        `${chords}\nbass: note("<[f2 g2 a2 a2] [bb2 c3 d3 e3] [f3 eb3 c3 db3] [c3 bb2 g2 gb2]>").s("upright")`,
        // Over hand-voiced shells.
        `chords: note("<[f3,a3,eb4] [bb2,d3,ab3] [f3,a3,eb4] [c3,e3,bb3]>").s("piano")\nbass: note("<[f2 a2 c3 a2] [bb2 d3 f3 a2] [f2 a2 c3 b2] [c3 e3 g3 gb2]>").s("upright")`,
      ],
      { key: F },
    );
    await passes(
      "walking-bass",
      { changes: ["F7", "Bb7", "F7", "C7"], chordToneOnThree: 0.75 },
      [`bass: note("<[f2 a2 c3 a2] [bb2 d3 f3 a2] [f2 a2 c3 b2] [c3 e3 g3 gb2]>").s("upright")`],
      { key: F },
    );
  });
  test("walking-bass: four attacks crowded into beat 1 do not walk (w7plan A3)", async () => {
    await fails(
      "walking-bass",
      {},
      `${chords}\nbass: note("<[[f2 a2 c3 b2] ~ ~ ~] [[bb2 d3 f3 e2] ~ ~ ~] [[f2 a2 c3 b2] ~ ~ ~] [[c3 e3 g3 gb2] ~ ~ ~]>")`,
      /bar 1: the bass does not walk there/,
      { key: F },
    );
  });
  test("walking-bass: four quarters of the root (the right rhythm) never approach the next bar", async () => {
    await fails(
      "walking-bass",
      {},
      `${chords}\nbass: note("<[f2 f2 f2 f2] [bb2 bb2 bb2 bb2] [f2 f2 f2 f2] [c3 c3 c3 c3]>")`,
      /leads into the next bar by a step .* at 0% of the bar lines/,
      { key: F },
    );
    // The right walk at gain .02 under the chords is masked: nothing walks.
    await fails(
      "walking-bass",
      {},
      `${chords}.gain(.9)\nbass: note("<[f2 a2 c3 a2] [bb2 d3 f3 a2] [f2 a2 c3 b2] [c3 e3 g3 gb2]>").gain(.02)`,
      /nothing plays in the bass/,
      { key: F },
    );
    // Quarters on other notes: the root on beat 1 missing.
    await fails(
      "walking-bass",
      {},
      `${chords}\nbass: note("<[a2 c3 d3 e3] [d3 f3 ab3 a3] [a2 c3 d3 e3] [e3 g3 bb3 gb3]>")`,
      /the chord's root on beat 1 in 0% of the bars/,
      { key: F },
    );
  });
  test("allowed-tensions: the tune's long notes against the chord (w7plan A4)", async () => {
    const ch = 'chords: chord("<Dm7 G7 C^7 C^7>").voicing()';
    const p = { minRatio: 0.85 };
    await passes("allowed-tensions", p, [
      `${ch}\nmel: note("<e5 e5 d5 f#5>").s("piano")`,
      `${ch}\nmel: note("<f5 b4 e5 g5>").s("piano")`,
      // A short off-beat C♯ is a passing note: free.
      `${ch}\nmel: note("<f5 b4 [e5 ~ ~ ~ ~ c#5 d5 ~] g5>").s("piano")`,
      `${ch}\nmel: note("<a5 a5 a5 a5>").s("vibes")`,
    ]);
    await fails("allowed-tensions", p, `${ch}\nmel: note("<e5 e5 c#5 c#5>").s("piano")`, /outside the chord/);
    // The right idea (a tension) on the wrong one: the 11th held over Cmaj7 is the avoid note.
    await fails("allowed-tensions", p, `${ch}\nmel: note("<e5 e5 f5 f5>").s("piano")`, /clashes/);
    // The chords alone (no melody) cannot show a tension against the tune.
    await fails("allowed-tensions", p, ch, /nothing plays in the tune/);
  });
  test("allowed-tensions: tune notes between comping hits are judged against the chord held (W7 gate)", async () => {
    // Comping on 2 and 4 only: the tune's beat-1 and beat-3 notes sound where no chord is struck.
    const comp = 'chords: chord("<Dm7 G7 C^7 C^7>").voicing().struct("~ x ~ x")';
    const p = { minRatio: 1 };
    // Right: chord tones and tensions on every beat, comped on 2 and 4.
    await passes("allowed-tensions", p, [
      `${comp}
mel: note("<[f5 e5 d5 c5] [b4 a4 g4 f4] [e5 d5 e5 g5] [b4 c5 d5 e5]>").s("piano")`,
      `${comp}
mel: note("<[a4 ~ c5 ~] [b4 ~ d5 ~] [e5 ~ g5 ~] [d5 ~ e5 ~]>").s("vibes")`,
      `${comp}
mel: note("<[d5 ~ ~ ~] [f5 ~ ~ ~] [e5 ~ ~ ~] [b4 ~ ~ ~]>").s("vibes")`,
    ]);
    // Wrong, with the right function: the avoid note F over C∆7 on beat 1 of bar 3, before the comping's first hit.
    await fails(
      "allowed-tensions",
      p,
      `${comp}\nmel: note("<[f5 e5 d5 c5] [b4 a4 g4 f4] [f5 e5 g5 e5] [b4 c5 d5 e5]>").s("piano")`,
      /clashes/,
    );
  });
  test("ii-v-chain: distinct target keys, whether or not the I arrives (J2.L01, JC1)", async () => {
    await passes(
      "ii-v-chain",
      { minKeys: 3 },
      [
        'chords: chord("<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7 Bm7b5 E7alt Am7 Am7>").voicing()',
        // Unresolved pairs still aim at their keys.
        'chords: chord("<Dm7 G7 Fm7 Bb7 Am7 D7 G^7 G^7>").voicing()',
        'chords: chord("<[Em7 A7] [Dm7 G7] [Cm7 F7] Bb^7>").voicing()',
      ],
      { bars: 12, key: null },
    );
    await fails(
      "ii-v-chain",
      { minKeys: 3 },
      'chords: chord("<Dm7 G7 C^7 C^7>").voicing()',
      /aiming at 1 key .* 3 different keys/,
      { key: null },
    );
    // The right two chords, moved through no key: the same ii–V four times.
    await fails(
      "ii-v-chain",
      { minKeys: 3 },
      'chords: chord("<Dm7 G7 Dm7 G7>").voicing()',
      /aiming at 1 key/,
      { key: null },
    );
    // A minor seventh and a dominant that is not a 4th above it: no ii–V.
    await fails("ii-v-chain", { minKeys: 2 }, 'chords: chord("<Dm7 C7 Em7 D7>").voicing()', /no ii–V yet/, {
      key: null,
    });
  });
  test("voicing-shape: hand voicings read octave-aware; a voicing() line is not graded by shape", async () => {
    const changes = ["Dm7", "G7", "C^7", "C^7"];
    await passes("voicing-shape", { track: "chords", shape: ["shell"], changes }, [
      'chords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,b3,e4]>").s("piano")',
      'chords: note("<[d3,c4,f4] [g2,b2,f3] [c3,b3,e4] [c3,e3,b3]>").s("piano")',
      'chords: note("<[d2,f2,c3] [g2,b2,f3] [c2,e2,b2] [c3,e3,b3]>").s("rhodes")',
    ]);
    await passes(
      "voicing-shape",
      { track: "chords", shape: ["rootless-a", "rootless-b"], changes: ["Dm7", "G7"] },
      [
        'chords: note("<[f3,a3,c4,e4] [f3,a3,b3,e4]>").s("piano")',
        'chords: note("<[c4,e4,f4,a4] [b3,e4,f4,a4]>").s("piano")',
        'chords: note("<[f3,a3,c4,e4] [b3,e4,f4,a4]>").s("rhodes")',
      ],
    );
    await passes("voicing-shape", { track: "chords", shape: ["drop-2"], changes: ["C^7", "Dm7"] }, [
      'chords: note("<[g3,c4,e4,b4] [a3,d4,f4,c5]>").s("piano")',
      'chords: note("<[b3,e4,g4,c5] [c4,f4,a4,d5]>").s("piano")',
      'chords: note("<[g2,c3,e3,b3] [a2,d3,f3,c4]>").s("rhodes")',
    ]);
    // The pre-flight's point: the dictionary's shapes are not the learner's.
    await fails(
      "voicing-shape",
      { track: "chords", shape: ["rootless-a", "rootless-b"] },
      'chords: chord("<Dm7 G7>").dict("lefthand").voicing()',
      /voiced by the dictionary/,
      { bars: 2 },
    );
    // The right notes, the wrong shape: a close Cmaj7 is not a drop-2; the root on top is no shell.
    await fails(
      "voicing-shape",
      { track: "chords", shape: ["drop-2"], changes: ["C^7"] },
      'chords: note("[c4,e4,g4,b4]").s("piano")',
      /that is a close voicing/,
      { bars: 1 },
    );
    await fails(
      "voicing-shape",
      { track: "chords", shape: ["shell"], changes: ["Dm7"] },
      'chords: note("[f3,c4,d4]").s("piano")',
      /none of these shapes/,
      { bars: 1 },
    );
  });
});

describe("the song's melody, contrafacts and versions", () => {
  const tune: SongMelodyNote[] = [
    { onset: rat(0), dur: rat(1, 4), midi: 67 },
    { onset: rat(1, 4), dur: rat(1, 4), midi: 69 },
    { onset: rat(1, 2), dur: rat(1, 2), midi: 67 },
    { onset: rat(1), dur: rat(1, 2), midi: 64 },
    { onset: rat(3, 2), dur: rat(1, 2), midi: 62 },
  ];
  const ctx = { extra: { songMelody: tune }, bars: 2 };
  test("song-melody-kept: the song's own tune, note for note (CF-T.S4, JC4, carry f4)", async () => {
    await passes(
      "song-melody-kept",
      {},
      [
        'mel: note("<[g4 a4 g4@2] [e4 d4]>").s("piano")\nchords: chord("<C^7 Am7>").voicing()',
        'mel: note("<[g4 a4 g4@2] [e4 d4]>").s("vibes")\nchords: chord("<Em7 [Dm7 Db7]>").voicing()',
        'melody: n("<[4 5 4@2] [2 1]>").scale("C4:major").s("trumpet")',
      ],
      ctx,
    );
    await passes(
      "song-melody-kept",
      { pitch: "key-relative" },
      ['mel: note("<[a4 b4 a4@2] [f#4 e4]>")'],
      ctx,
    );
    await fails(
      "song-melody-kept",
      {},
      'mel: note("<[g4 a4 g4@2] [e4 c4]>")',
      /the tune has D4 here; yours has C4/,
      ctx,
    );
    // The right notes an eighth late are another tune.
    await fails("song-melody-kept", {}, 'mel: note("<[g4 a4 g4@2] [e4 d4]>").late(1/8)', /is missing/, ctx);
    // Reharmonised with the tune muted: nothing of the song is heard.
    await fails(
      "song-melody-kept",
      {},
      'mel: note("<[g4 a4 g4@2] [e4 d4]>").gain(0)\nchords: chord("<C^7 Am7>").voicing()',
      /nothing plays in the tune/,
      ctx,
    );
    await fails("song-melody-kept", {}, 'mel: note("<[g4 a4 g4@2] [e4 d4]>")', /not available/, { bars: 2 });
  });
  test("contrafact: the song's changes under a NEW tune (JC3)", async () => {
    const changes = ["Bb^7", "G7", "Cm7", "F7"];
    const model: SongMelodyNote[] = [
      { onset: rat(0), dur: rat(1, 2), midi: 70 },
      { onset: rat(1, 2), dur: rat(1, 2), midi: 74 },
      { onset: rat(1), dur: rat(1, 2), midi: 71 },
      { onset: rat(3, 2), dur: rat(1, 2), midi: 74 },
      { onset: rat(2), dur: rat(1), midi: 72 },
      { onset: rat(3), dur: rat(1), midi: 69 },
    ];
    const o = { bars: 4, key: { tonic: "Bb", mode: "major" } as KeySpec, extra: { songMelody: model } };
    const ch = 'chords: chord("<Bb^7 G7 Cm7 F7>").voicing()';
    await passes(
      "contrafact",
      { changes, maxSharedRatio: 0.25 },
      [
        `${ch}\nmel: note("<[d5 c5 bb4 g4] [b4 d5 f5 ~] [eb5 d5 c5 bb4] [a4 c5 eb5 ~]>")`,
        `${ch}\nmel: note("<[~ f5 d5 ~] [f5 ~ ~ d5] [g5 ~ eb5 ~] [~ c5 ~ a4]>").s("trumpet")`,
        `chords: chord("<Bb6 G7b9 Cm9 F13>").voicing()\nmel: note("<[d5 c5 bb4 g4] [b4 d5 f5 ~] [eb5 d5 c5 bb4] [a4 c5 eb5 ~]>")`,
      ],
      o,
    );
    // The old head itself over the old changes: no new tune.
    await fails(
      "contrafact",
      { changes, maxSharedRatio: 0.25 },
      `${ch}\nmel: note("<[bb4 d5] [b4 d5] c5 a4>")`,
      /repeat the old head/,
      o,
    );
    // A new tune over other changes: not the song's form.
    await fails(
      "contrafact",
      { changes, maxSharedRatio: 0.25 },
      `chords: chord("<C^7 Am7 Dm7 G7>").voicing()\nmel: note("<[d5 c5 bb4 g4] [b4 d5 f5 ~] [eb5 d5 c5 bb4] [a4 c5 eb5 ~]>")`,
      /keep the song's changes/,
      o,
    );
  });
  test("two-versions-differ: one tune, two audibly different versions (AC1)", async () => {
    const a = 'setcpm(90/4)\nmel: note("<[g4 a4 g4@2] [e4 d4]>").s("piano")\ndrums: s("bd ~ sd ~")';
    const other = (code: string) => heard(code, 2).then((n) => ({ id: "b" as const, n }));
    const b1 = await other(
      'setcpm(130/4)\nmel: note("<[g4 a4 g4@2] [e4 d4]>").s("trumpet")\nbass: note("c2 g2").s("upright")\ndrums: s("hh*8")',
    );
    const b2 = await other(
      'setcpm(92/4)\nmel: note("<[g4 a4 g4@2] [e4 d4]>").s("rhodes").swingBy(1/3, 4)\ndrums: s("hh*8, ~ rim").swingBy(1/3, 4)',
    );
    const b3 = await other(
      'setcpm(60/4)\nmel: note("<[a4 b4 a4@2] [f#4 e4]>").s("vibes")\nkeys: chord("<D^7 Bm7>").voicing().s("rhodes")',
    );
    for (const otherVersion of [b1, b2, b3])
      await passes("two-versions-differ", {}, [a], { bars: 2, extra: { otherVersion } });
    const same = await other(
      'setcpm(96/4)\nmel: note("<[g4 a4 g4@2] [e4 d4]>").s("piano")\ndrums: s("bd ~ sd ~")',
    );
    await fails("two-versions-differ", {}, a, /6 BPM apart and share one feel/, {
      bars: 2,
      extra: { otherVersion: same },
    });
    const otherTune = await other(
      'setcpm(140/4)\nmel: note("<[c5 b4 a4@2] [g4 e4]>").s("trumpet")\ndrums: s("hh*8")',
    );
    await fails("two-versions-differ", {}, a, /do not play the same tune/, {
      bars: 2,
      extra: { otherVersion: otherTune },
    });
    // The right function on the wrong grid: \`.swingBy(1/3, 8)\` on eighths moves nothing (8 slices of one eighth each).
    const notSwung = await other(
      'setcpm(92/4)\nmel: note("<[g4 a4 g4@2] [e4 d4]>").s("rhodes").swingBy(1/3, 8)\ndrums: s("hh*8").swingBy(1/3, 8)',
    );
    await fails("two-versions-differ", {}, a, /share one feel/, {
      bars: 2,
      extra: { otherVersion: notSwung },
    });
    await fails("two-versions-differ", {}, a, /other version is not written yet/, { bars: 2 });
  });
  test("same-tune-two-ways: one tune, two idioms in one piece (A2.L06)", async () => {
    const p = { a: { bars: [1, 2] }, b: { bars: [3, 4] } };
    await passes("same-tune-two-ways", p, [
      'mel: note("<[g4 a4 g4@2] [e4 d4] [g4 a4 g4@2] [e4 d4]>").s("<piano!2 trumpet!2>")\ndrums: s("<[bd ~ sd ~]!2 [bd*2 [~ bd] sd ~]!2>")',
      'mel: note("<[g4 a4 g4@2] [e4 d4] [g5 a5 g5@2] [e5 d5]>").s("<piano!2 vibes!2>")\ndrums: s("<[bd ~ sd ~]!2 hh*8!2>")',
      'mel: note("<[g4 a4 g4@2] [e4 d4] [c5 d5 c5@2] [a4 g4]>").s("<piano!2 rhodes!2>")\ndrums: s("<[bd ~ sd ~]!2 [bd sd bd sd]!2>")',
    ]);
    await fails(
      "same-tune-two-ways",
      p,
      'mel: note("<[g4 a4 g4@2] [e4 d4] [g4 a4 g4@2] [e4 d4]>").s("piano")\ndrums: s("bd ~ sd ~")',
      /differ in nothing yet/,
    );
    await fails(
      "same-tune-two-ways",
      p,
      'mel: note("<[g4 a4 g4@2] [e4 d4] [c5 b4 a4@2] [g4 e4]>").s("<piano!2 trumpet!2>")\ndrums: s("<[bd ~ sd ~]!2 hh*8!2>")',
      /do not play the same tune/,
    );
  });
});

describe("rhythm", () => {
  test("microtiming: a lean of a feel, tempo-aware; .late(1/32) at 76 BPM is a displacement (R1.L05, AC2)", async () => {
    const p = { track: "snare" };
    await passes("microtiming", p, [
      'setcpm(76/4)\nsnare: s("~ sd ~ sd").late(.006)\nkick: s("bd ~ bd ~")',
      'setcpm(120/4)\nsnare: s("~ sd ~ sd").late(.01)',
      'setcpm(90/4)\nsnare: s("~ sd ~ sd").late(.012)',
    ]);
    await passes("microtiming", { track: "snare", direction: "early" }, [
      'setcpm(90/4)\nsnare: s("~ sd ~ sd").early(.01)',
    ]);
    await fails(
      "microtiming",
      p,
      'setcpm(76/4)\nsnare: s("~ sd ~ sd").late(1/32)',
      /99 ms behind the beat at 76 BPM: that is a displacement/,
    );
    await fails("microtiming", p, 'setcpm(76/4)\nsnare: s("~ sd ~ sd")', /right on the grid/);
    await fails("microtiming", p, 'setcpm(90/4)\nsnare: s("~ sd ~ sd").early(.01)', /leans the other way/);
  });
  test("displaced-copy: a figure back, moved inside the bar; a whole line moved late is no copy (R1.L05)", async () => {
    await passes(
      "displaced-copy",
      {},
      [
        'mel: note("<[c4 e4 g4 ~] [~ c4 e4 g4]>")',
        'mel: note("<[c4 ~ e4 ~ g4 ~ ~ ~] [~ c4 ~ e4 ~ g4 ~ ~]>").s("piano")',
        'drums: s("<[bd ~ sd ~ bd ~ ~ ~] [~ bd ~ sd ~ bd ~ ~]>")',
        'mel: note("<[c4 ~ e4 ~ g4 ~ ~ ~] [~ ~ ~ c4 ~ e4 ~ g4]>")',
      ],
      { bars: 2 },
    );
    await fails(
      "displaced-copy",
      {},
      'mel: note("<[c4 e4 g4 ~] [c4 e4 g4 ~]>")',
      /no figure comes back moved/,
      { bars: 2 },
    );
    await fails(
      "displaced-copy",
      {},
      'mel: note("<[c4 e4 g4 ~] [d4 f4 a4 ~]>").late(1/8)',
      /no figure comes back moved/,
      { bars: 4 },
    );
    await fails("displaced-copy", {}, 'hats: s("hh*8")', /no figure comes back moved/, { bars: 2 });
  });
  test("displaced-copy: the same rhythm moved over another chord is a displacement (W7 gate, R1.L05 / R3.L05)", async () => {
    const clav = 'clav: chord("<Dm7 Dm7 Gm7 Gm7>").voicing().struct("[x ~ x ~ ~ x ~ ~]")';
    await passes(
      "displaced-copy",
      {},
      [
        `${clav}.late("<0 0 .125 .125>")`,
        `${clav}.late("<0 .125>")`,
        `${clav}.late("<0 0 .0625 .0625>")`,
        'mel: note("<[c4 ~ e4 ~ g4 ~ ~ ~] [~ d4 ~ f4 ~ a4 ~ ~]>")',
      ],
      { bars: 4 },
    );
    // The right function with nothing displaced: the chord changes, the rhythm stays where it was.
    await fails("displaced-copy", {}, clav, /no figure comes back moved/, { bars: 4 });
    // The whole line moved late is still no copy, whatever its chords.
    await fails("displaced-copy", {}, `${clav}.late(.125)`, /no figure comes back moved/, { bars: 4 });
  });
  test("metric-weight: the accents follow the beat's strong places (R1.L01)", async () => {
    const p = { track: "hh" };
    await passes(
      "metric-weight",
      p,
      [
        'hh: s("hh*16").gain("1 .3 .5 .3 .7 .3 .5 .3 .9 .3 .5 .3 .7 .3 .5 .3")',
        'hh: s("hh*8").gain(".9 .4 .6 .4 .8 .4 .6 .4")',
        'hh: s("hh*4").velocity("1 .6 .8 .6")',
      ],
      { bars: 1 },
    );
    await fails("metric-weight", p, 'hh: s("hh*8")', /plays every place at one level/, { bars: 1 });
    await fails(
      "metric-weight",
      p,
      'hh: s("hh*8").gain(".4 .9 .4 .9 .4 .9 .4 .9")',
      /follow the strong places in 0%/,
      { bars: 1 },
    );
  });
  test("grouping-accents: kicks on the group starts and nowhere else (R2.L01–L02)", async () => {
    const o = { meter: "7/8" as MeterId, bars: 2, key: null };
    const p = { track: "@drums", groups: ["2", "2", "3"] };
    await passes(
      "grouping-accents",
      p,
      [
        'drums: s("[bd ~ bd ~ bd ~ ~], hh*7")',
        'drums: s("[bd ~ sd ~ bd ~ ~], [~ hh ~ hh ~ hh hh]")',
        'drums: s("rim*7").gain("1 .4 1 .4 1 .4 .4")',
      ],
      o,
    );
    await fails("grouping-accents", p, 'drums: s("[bd ~ ~ bd ~ bd ~], hh*7")', /in 0% of the bars/, o);
    await fails("grouping-accents", p, 'drums: s("bd*7")', /in 0% of the bars/, o);
  });
  test("regrouped: 3+3 in some bars, 2+2+2 in others (R2.L03)", async () => {
    const o = { meter: "3/4" as MeterId, bars: 2, key: null };
    await passes(
      "regrouped",
      {},
      [
        'perc: s("<[bd ~ ~ bd ~ ~] [bd ~ bd ~ bd ~]>")',
        'perc: s("<[rim rim rim rim rim rim] [rim rim rim rim rim rim]>").gain("<[1 .3 .3 1 .3 .3] [1 .3 1 .3 1 .3]>")',
        'bass: note("<[c2 ~ ~ g2 ~ ~] [c2 ~ g2 ~ c3 ~]>")',
      ],
      o,
    );
    await fails("regrouped", {}, 'perc: s("[bd ~ ~ bd ~ ~]")', /grouped one way only/, o);
  });
  test("regrouped: a hemiola written with velocities on the chords is heard (W7 gate, R2.L03's Make)", async () => {
    const o = { meter: "3/4" as MeterId, bars: 4, key: null };
    const chords = 'chords: chord("<Am Am Dm E>").voicing().struct("x x x x x x")';
    await passes(
      "regrouped",
      {},
      [
        `${chords}.velocity("<[1 0 0 .8 0 0]!3 [1 0 .8 0 .8 0]>")`,
        `${chords}.velocity("<[1 0 .8 0 .8 0] [1 0 0 .8 0 0]!3>")`,
        `${chords}.gain("<[1 0 0 1 0 0]!3 [1 0 1 0 1 0]>")`,
      ],
      o,
    );
    // The right function, one grouping only: every bar 3+3.
    await fails("regrouped", {}, `${chords}.velocity("[1 0 0 .8 0 0]")`, /grouped one way only/, o);
  });
  test("polymeter-cycle: a cycle across the bar line over a part that keeps the bar (R2.L05)", async () => {
    const o = { bars: 6, key: null };
    await passes(
      "polymeter-cycle",
      { a: "a", b: "b" },
      [
        'a: s("{bd ~ ~}%4")\nb: s("hh*4")',
        'a: note("{c3 e3 g3}%4")\nb: s("bd sd bd sd")',
        'a: s("{bd ~ sd ~ ~}%4")\nb: s("hh*8")',
      ],
      o,
    );
    await passes(
      "polymeter-cycle",
      { a: "a", b: "b", periodBars: 3 },
      ['a: s("{bd ~ ~}%4")\nb: s("hh*4")'],
      o,
    );
    await fails(
      "polymeter-cycle",
      { a: "a", b: "b" },
      'a: s("{bd ~ ~ ~}%4")\nb: s("hh*4")',
      /fits the bar/,
      o,
    );
    await fails(
      "polymeter-cycle",
      { a: "a", b: "b" },
      'a: s("{bd ~ ~}%4")\nb: s("{hh ~ ~ ~ ~}%4")',
      /does not keep the bar/,
      o,
    );
  });
  test("clave-aligned: a two-bar part faces the clave; the same part crossed fails (R3.L04, RC2)", async () => {
    const clave = 'perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")';
    const o = { bars: 4, key: null };
    await passes(
      "clave-aligned",
      { track: "bass" },
      [
        `${clave}\nbass: note("<[~ ~ ~ c3 ~ ~ g2 ~] [~ ~ c3 ~ ~ ~ g2 ~]>")`,
        `${clave}\nbass: note("<[c3 ~ ~ c3 ~ ~ g2 ~] [~ ~ g2 ~ c3 ~ ~ ~]>")`,
        `${clave}\nbass: note("<[~ ~ ~ c3 ~ ~ c3 ~] [~ ~ g2 ~ g2 ~ ~ ~]>")`,
      ],
      o,
    );
    // A tumbao written for the other direction: it meets the clave turned round, not the clave played.
    await fails(
      "clave-aligned",
      { track: "bass" },
      `${clave}\nbass: note("<[c3 ~ c3 c3 c3 ~ ~ ~] [g2 ~ ~ g2 ~ ~ g2 ~]>")`,
      /crossed/,
      o,
    );
    await fails(
      "clave-aligned",
      { track: "bass" },
      `${clave}\nbass: note("<[~ ~ c3 ~ ~ ~ g2 ~] [~ ~ ~ c3 ~ ~ g2 ~]>")`,
      /meets 1 clave stroke/,
      o,
    );
    await fails(
      "clave-aligned",
      { track: "bass" },
      `${clave}\nbass: note("[~ ~ ~ c3 ~ ~ g2 ~]")`,
      /same rhythm in both bars/,
      o,
    );
    await fails(
      "clave-aligned",
      { track: "bass" },
      'perc: s("rim*8")\nbass: note("<[~ ~ ~ c3 ~ ~ g2 ~] [~ ~ c3 ~ ~ ~ g2 ~]>")',
      /no son or rumba clave/,
      o,
    );
  });
  test("stabs: short horn hits, two or more every two bars (RC1)", async () => {
    const o = { bars: 4, key: null };
    await passes(
      "stabs",
      {},
      [
        'horns: note("<[~ c5 ~ ~ ~ ~ e5 ~] [~ ~ ~ ~ g5 ~ ~ ~]>").clip(.5)',
        'horns: note("[~ [c5,e5] ~ ~ ~ ~ [c5,e5] ~]").clip(.5).s("brass")',
        'horns: note("<[~ ~ c5 ~ ~ c5 ~ ~] ~>")',
      ],
      o,
    );
    await fails("stabs", {}, 'horns: note("<c5 e5>")', /holds a note/, o);
    await fails("stabs", {}, 'horns: note("<[~ c5 ~ ~ ~ ~ ~ ~] ~ ~ ~>").clip(.5)', /1 stab; at least 2/, o);
  });
  test("interlock: parts that fill each other's gaps (R1.L04)", async () => {
    const o = { bars: 2, key: null };
    const p = { tracks: ["bass", "keys", "gtr"] };
    await passes(
      "interlock",
      p,
      [
        'bass: note("[c2 ~ ~ c2 ~ ~ ~ ~ c2 ~ ~ c2 ~ ~ ~ ~]")\nkeys: note("[~ ~ e4 ~ ~ ~ g4 ~ ~ ~ e4 ~ ~ ~ g4 ~]")\ngtr: note("[~ c5 ~ ~ ~ c5 ~ ~ ~ c5 ~ ~ ~ c5 ~ ~]")',
        'bass: note("[c2 ~ ~ ~ ~ ~ ~ c2 ~ ~ c2 ~ ~ ~ ~ ~]")\nkeys: note("[~ ~ [e4,g4] ~ ~ ~ ~ ~ ~ ~ ~ ~ [e4,g4] ~ ~ ~]")\ngtr: note("[~ c5 ~ c5 ~ c5 ~ ~ ~ c5 ~ ~ ~ ~ c5 ~]")',
        'bass: note("[c2 ~ ~ c2 ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ ~ ~]")\nkeys: note("[~ ~ ~ ~ e4 ~ ~ ~ e4 ~ ~ ~ e4 ~ ~ ~]")\ngtr: note("[~ c5 c5 ~ ~ c5 ~ c5 ~ ~ c5 ~ ~ c5 ~ c5]")',
      ],
      o,
    );
    await fails(
      "interlock",
      p,
      'bass: note("c2*8")\nkeys: note("e4*8")\ngtr: note("c5*8")',
      /double each other/,
      o,
    );
    await fails(
      "interlock",
      p,
      'bass: note("[c2 ~ ~ c2 ~ ~ ~ ~ c2 ~ ~ c2 ~ ~ ~ ~]")\nkeys: note("[~ ~ e4 ~ ~ ~ g4 ~ ~ ~ e4 ~ ~ ~ g4 ~]")\ngtr: note("c5*16").gain(0)',
      /nothing plays in `gtr`/,
      o,
    );
  });
});

describe("chord-scales and tensions", () => {
  const ch = 'chords: chord("<Dm7 G7 C^7 C^7>").voicing()';
  test("chord-scale-fit: the tune's long notes in each chord's scale (J2.L04)", async () => {
    await passes("chord-scale-fit", {}, [
      `${ch}\nmel: note("<[f5 b4] [f5 e5] [f#5 e5] g5>")`,
      `${ch}\nmel: note("<[d5 e5 f5 a5] [b4 a4 g4 f4] [e4 g4 b4 d5] c5>")`,
      `${ch}\nmel: note("<[a4 b4] [g4 a4] [e5 f#5] [b4 c5]>").s("vibes")`,
    ]);
    await fails(
      "chord-scale-fit",
      {},
      `${ch}\nmel: note("<[bb4 bb4] [ab4 ab4] [f5 f5] [c#5 c#5]>")`,
      /is not in the scale over/,
    );
  });
  test("tensions-used: the tune lands on the 9th or 13th (J2.L03, AC2)", async () => {
    const p = { tensions: ["9", "13"] };
    await passes("tensions-used", p, [
      `${ch}\nmel: note("<e5 e5 g5 g5>")`,
      `${ch}\nmel: note("<[f5 e5] [b4 e5] [d5 c5] a5>")`,
      `${ch}\nmel: note("<e4 [d4 ~ ~ e4] d5 a4>").s("piano")`,
    ]);
    await fails("tensions-used", p, `${ch}\nmel: note("<f5 f5 e5 e5>")`, /never lands on the 9 or 13/);
    // The 9th as a short passing note off the beat is not a landing.
    await fails("tensions-used", p, `${ch}\nmel: note("<[f5 ~ ~ ~ ~ e5 f5 ~] f5 g5 g5>")`, /never lands/);
  });
  test("extended-share: 9ths, 11ths and 13ths, from the symbol or the hand voicing over the bass (AC2)", async () => {
    await passes("extended-share", {}, [
      'chords: chord("<Dm9 G13 C^9 C^7>").voicing().s("rhodes")',
      'chords: note("<[f3,a3,c4,e4] [f3,a3,b3,e4] [e3,g3,b3,d4] [e3,g3,b3,d4]>").s("rhodes")\nbass: note("<d2 g2 c2 c2>")',
      'chords: chord("<Dm11 G7alt C69 Am9>").voicing()',
    ]);
    await fails("extended-share", {}, 'chords: chord("<Dm7 G7 C^7 C^7>").voicing()', /0% of the bars carry/);
    // Hand-voiced shells over the bass: the right sound, no colour on top.
    await fails(
      "extended-share",
      {},
      'chords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3]>").s("rhodes")\nbass: note("<d2 g2 c2 c2>")',
      /0% of the bars carry/,
    );
  });
});

describe("sound and arrangement", () => {
  test("counter-melody: its own line, never a doubling (A2.L03)", async () => {
    const o = { bars: 2 };
    const mel = 'mel: note("<[c5 d5 e5 f5] [g5 ~ g5 ~]>").s("piano")';
    await passes(
      "counter-melody",
      {},
      [
        `${mel}\nvox: note("<[g4 f4 e4 d4] [c4 d4 e4 f4]>").s("sine")`,
        `${mel}\nvox: note("<[e4@4] [b4 a4 b4 c5]>").s("sine")`,
        `${mel}\nvox: note("<[a4 ~ g4 ~] [e4 f4 d4 e4]>").s("sine")`,
      ],
      o,
    );
    await fails(
      "counter-melody",
      {},
      `${mel}\nvox: note("<[c4 d4 e4 f4] [g4 ~ g4 ~]>").s("sine")`,
      /doubles the tune/,
      o,
    );
    await fails(
      "counter-melody",
      {},
      `${mel}\nvox: note("<[a4 b4 c5 d5] [e5 ~ e5 ~]>").s("sine")`,
      /moves with the tune most of the time/,
      o,
    );
  });
  test("slices-reordered: a break cut and played in a new order (A2.L04)", async () => {
    const o = { bars: 2, key: null };
    await passes(
      "slices-reordered",
      {},
      [
        'brk: s("breaks165").slice(4, "0 2 1 3")',
        'brk: s("breaks165").slice(8, "7 6 5 4 3 2 1 0")',
        'brk: s("breaks165").slice(4, "<[0 1 2 3] [3 3 1 0]>")',
      ],
      o,
    );
    await fails("slices-reordered", {}, 'brk: s("breaks165").chop(4)', /in the sample's own order/, o);
    await fails(
      "slices-reordered",
      {},
      'brk: s("breaks165").slice(4, "0 1 2 3")',
      /in the sample's own order/,
      o,
    );
    await fails(
      "slices-reordered",
      {},
      'brk: s("breaks165").slice(2, "1 0")',
      /cut into 2 slices; at least 4/,
      o,
    );
  });
  test("level-balance: a part 3–18 dB under another where they sound together (A2.L05)", async () => {
    const o = { bars: 1, key: null };
    const p = { louder: "keys", quieter: "pad" };
    await passes(
      "level-balance",
      p,
      [
        'keys: note("c4 e4 g4 c5").s("piano").gain(.8)\npad: note("[c3,g3]").s("sawtooth").gain(.3)',
        'keys: note("c4 e4 g4 c5").s("piano")\npad: note("[c3,g3]").s("sawtooth").gain(.5)',
        'keys: note("c4 e4 g4 c5").s("piano").gain(1)\npad: note("[c3,g3]").s("sawtooth").gain(.15)',
      ],
      o,
    );
    await fails(
      "level-balance",
      p,
      'keys: note("c4 e4 g4 c5").gain(.8)\npad: note("[c3,g3]").gain(.8)',
      /as loud as or louder/,
      o,
    );
    await fails(
      "level-balance",
      p,
      'keys: note("c4 e4 g4 c5").gain(.8)\npad: note("[c3,g3]").gain(.02)',
      /not heard/,
      o,
    );
    await fails(
      "level-balance",
      p,
      'keys: note("c4 e4 g4 c5").gain(1)\npad: note("[c3,g3]").gain(.08)',
      /too far down/,
      o,
    );
  });
});

describe("control-set: anyOf, below and the controls that silence another (A1.L01–L07, AC1; carry f4)", () => {
  const A1 = {
    anyOf: [
      { control: "lpenv", above: 0 },
      { control: "distort", above: 0.5 },
      { control: "crush", below: 7 },
      { control: "vib", above: 0 },
      { control: "phaserrate", above: 0 },
      { control: "tremolosync", above: 0 },
      { control: "lprate", above: 0 },
      { control: "fmi", above: 0.5 },
      { control: "roomsize", above: 3 },
      { control: "delaytime", above: 0 },
    ],
  };
  const o = { bars: 1, key: null };
  test("any one A1 control set where you hear it", async () => {
    await passes(
      "control-set",
      A1,
      [
        'a: note("c3").s("sawtooth").lpf(600).lpenv(4)',
        'a: note("c3").s("sawtooth").distort(.8)',
        'a: note("c3").s("sawtooth").crush(4)',
        'a: note("c3").s("triangle").vib(5).vibmod(.3)',
        'a: note("c3").s("sawtooth").lpf(800).lprate(2).lpdepth(.5)',
        'a: note("c3").s("sine").fm(2)',
        'a: note("c3").s("piano").room(.5).roomsize(6)',
        'a: note("c3").s("piano").delay(.4).delaytime(.25)',
      ],
      o,
    );
  });
  test("a control at its neutral value, or silenced by another, does not count", async () => {
    await fails(
      "control-set",
      A1,
      'a: note("c3").s("sawtooth").crush(16)',
      /sound-design controls set far enough/,
      o,
    );
    await fails(
      "control-set",
      A1,
      'a: note("c3").s("sawtooth").phaser(2).phaserdepth(0)',
      /the phaser has no depth/,
      o,
    );
    await fails(
      "control-set",
      A1,
      'a: note("c3").s("sawtooth").lprate(2).lpdepth(.5)',
      /no filter for it to move/,
      o,
    );
    await fails("control-set", A1, 'a: s("piano").fm(2)', /a sample has no oscillator/, o);
    await fails("control-set", A1, 'a: note("c3").s("piano").delaytime(.25)', /the delay itself is off/, o);
    await fails("control-set", A1, 'a: note("c3").s("piano").roomsize(6)', /the reverb itself is off/, o);
    await fails(
      "control-set",
      A1,
      'a: note("c3").s("triangle").vib(5).vibmod(0)',
      /the vibrato has no depth/,
      o,
    );
  });
  test("partials sound with two harmonics or more (A1.L01); one is a sine", async () => {
    const p = { control: "partials", above: 1, call: "partials" };
    await passes(
      "control-set",
      p,
      [
        'a: note("c3").s("user").partials([1, .5, .3])',
        'a: note("c3").s("user").partials([1, 0, .3])',
        'a: note("<c3 e3>").s("user").partials([.2, 1])',
      ],
      o,
    );
    await fails("control-set", p, 'a: note("c3").s("user").partials([1])', /changes nothing you can hear/, o);
  });
  test("below: crush under 7 is heard, crush 16 is where the sound already is (A1.L05)", async () => {
    const p = { control: "crush", below: 7, call: "crush" };
    await passes("control-set", p, ['a: note("c3").s("sawtooth").crush(4)', 'a: note("c3").crush(6)'], o);
    await fails("control-set", p, 'a: note("c3").s("sawtooth").crush(16)', /changes nothing you can hear/, o);
  });
});

describe("carry f4: effect rules for the A1.L01, A1.L03 and A1.L04 Makes (proposed to author:A1a)", () => {
  // Each proposed rule replaces the Make's bare `uses`: every `pass` test of the lesson's own Make still passes, the
  // starter fails, and a wrong answer that writes the right method at the value where the sound already is fails.
  const PROPOSED: Record<string, Record<string, unknown>> = {
    L01: { control: "partials", above: 1, call: "partials" },
    L03: { envelope: true },
    L04: {
      anyOf: [
        { control: "roomsize", above: 2.5 },
        { control: "delaytime", above: 0 },
      ],
    },
  };
  const WRONG: Record<string, string> = {
    L01: 'bass: note("c2 ~ c2 ~").s("user").partials([1])\nriff: note("c4 e4 g4 e4").s("square")',
    L03: 'bass: note("c2 ~ c2 ~").s("sawtooth").attack(.001).sustain(.6)\nriff: note("c4 e4 g4 e4").s("square")',
    L04: 'snare: s("~ sd ~ sd").roomsize(6)\nriff: note("c4 e4 g4 e4").s("square").delaytime(.3)',
  };
  for (const id of ["L01", "L03", "L04"] as const)
    test(`A1.${id}: the lesson's passing Make answers pass, the starter and the right method at no effect fail`, async () => {
      const mod = (await import(`../../../../content/advanced/A1/${id}/lesson.ts`)) as {
        default: { steps: { exercise: Record<string, unknown> }[] };
      };
      const make = mod.default.steps.map((s) => s.exercise).find((e) => e?.kind === "code-make") as {
        tests: { name: string; response: { code?: string }; expect: string }[];
        code: { starter: string };
      };
      expect(make).toBeDefined();
      const p = PROPOSED[id] as Record<string, unknown>;
      for (const t of make.tests.filter((x) => x.expect === "pass" && x.response.code))
        await passes("control-set", p, [t.response.code as string], { bars: 2, key: null });
      const starter = make.code.starter.replace(/[⟪⟫]/g, "");
      const r = await run("control-set", p, starter, { bars: 2, key: null });
      expect([id, "starter", r.ok]).toEqual([id, "starter", false]);
      const w = await run("control-set", p, WRONG[id] as string, { bars: 2, key: null });
      expect([id, "right method, no effect", w.ok]).toEqual([id, "right method, no effect", false]);
    });
});
