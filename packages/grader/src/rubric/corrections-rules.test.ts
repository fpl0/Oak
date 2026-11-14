// Corrections pass (before the learner starts the course): the effect checks the lesson fixes use, each pinned on
// real Strudel 1.2.6 output with the reviewer's counterexample (it fails, with a line the learner can act on), the
// lesson's own passing answers, and right answers of our own. The custom rules live in corrections-rules.ts; the
// rule fields (`cadence.before`, `chord-tones-strong.cover`, `motif-reuse.loopRepeats`, `voice-leading.loop`,
// `sounds.track`, `pickup.leadsIn`, `guide-tones` at every bar, `contains-rn.last`) in rules.ts and friends.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import type { RubricContext } from "./context.ts";
import { speedFactors } from "./corrections-rules.ts";
import { CUSTOM_RULES, evalRule } from "./rules.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "fix", label: "fix", required: true, skills: [], ...body }) as unknown as RubricRule;
const custom = (fn: string, params: Record<string, unknown> = {}) => ({ rule: "custom", fn, params });

async function run(body: Record<string, unknown>, code: string, bars?: number, key: KeySpec | null = C) {
  const s = sectionsFromAst(code);
  const total = bars ?? (s && "totalBars" in s ? s.totalBars : 4);
  const n = await strudel(code, total);
  const ctx: RubricContext = {
    meter: "4/4",
    code,
    params: {},
    bars: total,
    totalBars: total,
    ...(key ? { key } : {}),
  };
  return evalRule(rule(body), n, ctx);
}
async function passes(body: Record<string, unknown>, codes: string[], bars?: number, key?: KeySpec | null) {
  for (const code of codes) {
    const r = await run(body, code, bars, key);
    if (!r.ok) throw new Error(`expected a pass for:\n${code}\n→ ${r.detail}`);
  }
}
async function failsWith(
  body: Record<string, unknown>,
  code: string,
  re: RegExp,
  bars?: number,
  key?: KeySpec | null,
) {
  const r = await run(body, code, bars, key);
  expect(r.ok).toBe(false);
  expect(r.detail).toMatch(re);
  return r;
}

test("every correction rule is registered as a custom rule", () => {
  for (const fn of [
    "silent-beat",
    "split-beat",
    "held",
    "bars-differ",
    "speed-change",
    "transposed-copy",
    "distinct-keys",
    "orbits-differ",
    "call-response",
    "stack-intervals",
    "chords-per-bar",
    "last-chord",
    "song-kept",
    "tuplets-every-bar",
    "swung-offbeats",
    "voiced-with",
    "control-set",
    "parts-enter",
    "broken-chord",
    "black-keys",
    "chance-varies",
    "echo",
  ])
    expect(typeof CUSTOM_RULES[fn]).toBe("function");
});

describe("U01: the effect of the new notation, not its syntax", () => {
  test("silent-beat (U01.L02): a `~` under hats that still play is no silent beat", async () => {
    const r = await failsWith(
      custom("silent-beat"),
      'setcpm(96/4)\ndrums: s("bd sd ~ sd")\nhats: s("hh*8").gain(.6)',
      /0 silent beats; at least 1\. A silent beat is empty in every part: a `~` in one part does not silence the others/,
      1,
    );
    expect(r.ok).toBe(false);
    await passes(
      custom("silent-beat"),
      [
        'setcpm(96/4)\ndrums: s("bd sd ~ sd")\nhats: s("hh hh ~ hh").gain(.6)',
        'setcpm(96/4)\ndrums: s("bd ~ bd sd")\nhats: s("[hh hh] ~ [hh hh] [hh hh]")',
        'setcpm(96/4)\ndrums: s("bd sd bd ~")\nhats: s("hh*4").struct("x x x ~")',
      ],
      1,
    );
    // `tracks` narrows the parts that must be empty: "a rest in the drums" with hats over it.
    await passes(
      custom("silent-beat", { tracks: ["drums"] }),
      ['setcpm(96/4)\ndrums: s("bd sd ~ sd")\nhats: s("hh*8")'],
      1,
    );
  });

  test('silent-beat `at: "end"` (U02.L07 "keep the rest at the end"): a note held into beat 4 fills it', async () => {
    await failsWith(
      custom("silent-beat", { tracks: ["mel"], at: "end" }),
      'setcpm(80/4)\nmel: note("e4 d4 c4@2").s("piano")',
      /bar 1, beat 4 is not silent: C4 still sounds there; leave the last beat empty with `~`/,
      1,
    );
    await passes(
      custom("silent-beat", { tracks: ["mel"], at: "end" }),
      [
        'setcpm(80/4)\nmel: note("e4 d4 c4 ~").s("piano")',
        'setcpm(80/4)\nmel: note("[e4 d4] c4 c4 ~").s("piano")',
        'setcpm(80/4)\nmel: note("e4 d4 [c4 ~] ~").s("triangle")',
      ],
      1,
    );
  });

  test("split-beat (U01.L04): `[hh hh hh hh]` over the whole bar is four quarter notes", async () => {
    await failsWith(
      custom("split-beat"),
      'setcpm(100/4)\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("[hh hh hh hh]")',
      /no beat is split: every sound in your lines starts on a beat/,
      1,
    );
    await passes(
      custom("split-beat"),
      [
        'setcpm(100/4)\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh hh hh [hh hh]")',
        'setcpm(100/4)\nkick: s("bd [~ bd] ~ [~ bd]")\nsnare: s("~ sd ~ sd")\nhats: s("[hh hh] [hh oh] [hh hh] [hh oh]")',
        'setcpm(100/4)\nkick: s("bd ~ [~ bd] ~")\nsnare: s("~ sd ~ sd")',
        'setcpm(100/4)\ndrums: s("bd [sd sd] bd sd")',
      ],
      1,
    );
  });

  test("held (U01.L05): `cr@1` holds nothing", async () => {
    await failsWith(
      custom("held"),
      'setcpm(88/4)\ndrums: s("cr@1 bd sd sd")\nhats: s("hh hh hh hh")',
      /no sound lasts longer than the others: each one takes one step of its bar\. `@1` keeps a sound one step long/,
      1,
    );
    await passes(
      custom("held"),
      [
        'setcpm(88/4)\ndrums: s("cr@2 bd sd")\nhats: s("hh*8").gain(.5)',
        'setcpm(88/4)\nkick: s("bd@3 [~ bd]")\nsnare: s("~ sd _ sd")\nhats: s("[hh hh] [hh hh] [hh oh] ~").gain(.5)',
        'setcpm(88/4)\ndrums: s("bd _ sd sd")',
        'setcpm(88/4)\nmel: note("c4@2 e4 g4").s("piano")',
      ],
      1,
    );
  });

  test("bars-differ (U01.L07): a `< >` with one choice repeats the same bar", async () => {
    await failsWith(
      custom("bars-differ", { track: "snare" }),
      'setcpm(100/4)\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]>")\nhats: s("hh*8")',
      /every bar of `snare` plays the same thing: a `< >` with one choice repeats it/,
      4,
    );
    await passes(
      custom("bars-differ"),
      [
        'setcpm(100/4)\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]!3 [sd sd lt lt]>")\nhats: s("hh*8")',
        'setcpm(100/4)\nkick: s("<[bd ~ bd ~] [bd ~ bd [~ bd]]>")\nsnare: s("~ sd ~ sd")',
        'setcpm(100/4)\nhats: s("<hh*8 hh*16>")',
      ],
      4,
    );
  });

  test("speed-change (U01.L09): `.slow(1)` keeps the speed it had", async () => {
    const code = (x: string) =>
      `setcpm(96/4)\nkick: s("bd ~ [~ bd] ~")${x}\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.5)`;
    await failsWith(
      custom("speed-change"),
      code(".slow(1)"),
      /`\.slow\(1\)` keeps the speed it had, or nearly: a factor of 1 changes nothing you can feel/,
      2,
    );
    await passes(
      custom("speed-change"),
      [code(".slow(2)"), code(".fast(2)"), code('.fast("<1 2>")'), code(".slow(3/2)")],
      2,
    );
    expect(speedFactors('a.slow(1) // .fast(2)\nb.fast("<1 2>")')).toEqual([
      { fn: "slow", arg: "1", values: [1] },
      { fn: "fast", arg: '"<1 2>"', values: [1, 2] },
    ]);
  });
});

describe("U02–U04: a line really moved, two keys really sounding, intervals of the asked size", () => {
  test("transposed-copy (U02.L05): `.transpose(0)` moves nothing", async () => {
    await failsWith(
      custom("transposed-copy"),
      'setcpm(96/4)\nmel: note("c4 e4 g4 e4").transpose(0).s("piano")',
      /the riff comes back at the same pitch: `\.transpose\(0\)` moves nothing/,
      2,
    );
    await passes(
      custom("transposed-copy"),
      [
        'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c4 e4 g4 e4").transpose(12).s("piano")',
        'setcpm(96/4)\nmel: note("<[c4 e4 g4 e4] ~>").s("piano")\nvox: note("<~ [60 64 67 64]>").transpose(5).s("piano")',
        'setcpm(96/4)\nmel: note("[c4 e4 g4 e4]").transpose("<0 -3>").s("piano")',
      ],
      2,
    );
  });

  test('transposed-copy (U04.L04 "every distance keeps its size"): a changed last interval is no copy', async () => {
    await failsWith(
      custom("transposed-copy"),
      'setcpm(96/4)\nmel: note("<[c4 e4 g4 [e4 d4]] [g4 b4 d5 [b4 c5]]>").s("piano")',
      /no bar comes back moved: a copy keeps the riff's rhythm and shape/,
      2,
    );
    await passes(
      custom("transposed-copy"),
      [
        'setcpm(96/4)\nmel: note("<[c4 e4 g4 e4] [f4 a4 c5 a4]>").s("piano")',
        'setcpm(96/4)\nmel: note("[c4 e4 g4 e4]").transpose("<1P 4P>").s("piano")',
        'setcpm(96/4)\nmel: note("<[c4 e4 g4 [e4 d4]] [g4 b4 d5 [b4 a4]]>").s("piano")',
        'setcpm(96/4)\nhats: s("hh*8").gain(.35)\nmel: note("<[c4 e4 g4 e4] [g4 b4 d5 b4]>").s("piano")',
      ],
      4,
    );
  });

  test('`alsoUses`: the effect first, then the notation the step teaches (U02.L05 "with `.transpose()`")', async () => {
    const r = custom("transposed-copy", { rhythm: "any", alsoUses: ["tb.transpose"] });
    const byHand = 'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("f4 a4 c5 a4").s("piano")';
    const res = await failsWith(
      r,
      byHand,
      /the riff comes back 5 half steps higher; now write it with .+, as the step asks/,
      2,
    );
    expect(res.credit).toBe(0.5);
    await passes(
      r,
      ['setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c4 e4 g4 e4").transpose(5).s("piano")'],
      2,
    );
    // Without the effect the notation alone does not pass.
    await failsWith(
      r,
      'setcpm(96/4)\nmel: note("c4 e4 g4 e4").transpose(0).s("piano")',
      /`\.transpose\(0\)` moves nothing/,
      2,
    );
  });

  test('sounds with `track` (U02.L06 "the octave line on a synth wave")', async () => {
    const synth = {
      rule: "sounds",
      track: "vox",
      anyOf: ["snd.wave.sine", "snd.wave.triangle", "snd.wave.square", "snd.wave.sawtooth"],
    };
    await failsWith(
      synth,
      'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c5 e5 g5 e5").s("piano").gain(.4)',
      /`vox` plays piano, none of sine, triangle, square, sawtooth/,
      1,
    );
    await failsWith(synth, 'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")', /nothing plays in `vox`/, 1);
    await passes(
      synth,
      [
        'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c5 e5 g5 e5").s("triangle").gain(.4)',
        'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c4 e4 g4 e4").transpose(12).s("square").gain(.4)',
        'setcpm(96/4)\nmel: note("c4 e4 g4 e4").s("piano")\nvox: note("c5 e5 g5 e5").s("sawtooth").lpf(2000).gain(.4)',
      ],
      1,
    );
  });

  test("distinct-keys (U03.L05): `<C4:major!2 C4:major!2>` names one key twice", async () => {
    await failsWith(
      custom("distinct-keys"),
      'setcpm(92/4)\nmel: n("<[0 2 1 4] [3 2 0 ~]>").scale("<C4:major!2 C4:major!2>").s("piano")',
      /the tune stays in C major: every `\.scale\(\)` names the same key/,
      4,
    );
    await passes(
      custom("distinct-keys"),
      [
        'setcpm(92/4)\nmel: n("<[0 2 1 4] [3 2 0 ~]>").scale("<C4:major!2 F4:major!2>").s("piano")',
        'setcpm(92/4)\nmel: n("<[0 2 4 2] [4 [5 4] 2 1] [0 2 4 7] [4 2 0@2]>").scale("<C4:major!4 D4:major!4 F4:major!4 G3:major!4>").s("piano")',
        'setcpm(92/4)\nmel: n("<[0 2 1 4] [3 2 0 ~]>").scale("<C4:major!2 A3:minor!2>").s("piano")',
      ],
      8,
    );
    // `differentNotes`: C major and A minor are one set of notes.
    await failsWith(
      custom("distinct-keys", { differentNotes: true }),
      'setcpm(92/4)\nmel: n("<[0 2 1 4] [3 2 0 ~]>").scale("<C4:major!2 A3:minor!2>").s("piano")',
      /the tune stays in/,
      4,
    );
  });

  test('stack-intervals `above` (U04.CP "a second note a 3rd above"): a sixth below is not a third above', async () => {
    const thirds = custom("stack-intervals", { track: "mel", semitones: [3, 4], above: true });
    await failsWith(
      thirds,
      'setcpm(90/4)\nmel: n("<[[0,-5] [1,-4] [2,-3] [0,-5]] [[3,-2] [2,-3] [1,-4] ~]>").scale("C4:major").s("piano")',
      /0 of 7 stacks are 3 or 4 half steps apart \(bar 1, beat 1: E3 is 8 half steps below C4, not above it\)/,
      2,
    );
    await failsWith(
      thirds,
      'setcpm(90/4)\nmel: n("<[[0,9] [1,10] [2,11] [0,9]] [[3,12] [2,11] [1,10] ~]>").scale("C4:major").s("piano")',
      /C4 to E5 is 16 half steps/,
      2,
    );
    await passes(
      thirds,
      [
        'setcpm(90/4)\nmel: n("<[[0,2] [1,3] [2,4] [0,2]] [[3,5] [2,4] [1,3] ~]>").scale("C4:major").s("piano")',
        'setcpm(90/4)\nmel: n("<[[0,2] [1,3] [2,4] [0,2]] [[3,5] [2,4] [1,3] ~]>").scale("C4:major").s("piano").gain(.8)',
        'setcpm(90/4)\nmel: note("<[[c4,e4] [d4,f4] [e4,g4] [c4,e4]] [[f4,a4] [e4,g4] [d4,f4] ~]>").s("rhodes")',
      ],
      2,
    );
  });
});

describe("U05–U07: the voicing gate round the loop, a register lift, coverage, a cadence's own chords", () => {
  const loop = (chords: string) =>
    `setcpm(80/4)\nbass: note("<c2 f2 g2 c2>").s("ebass").lpf(800)\nchords: note("<${chords}>").s("piano")`;
  const gate = {
    rule: "voice-leading",
    track: "chords",
    maxMovePerVoice: 3,
    voices: 3,
    commonTones: true,
    noCrossing: true,
    loop: true,
  };

  test("voice-leading `loop` (U05.L07): E4 G4 C5 back to C4 E4 G4 is judged too", async () => {
    await failsWith(gate, loop("[c4,e4,g4] [c4,f4,a4] [d4,g4,b4] [e4,g4,c5]"), /.+/, 4);
    await passes(
      gate,
      [
        loop("[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]"),
        loop("[c5,e5,g5] [c5,f5,a5] [b4,d5,g5] [c5,e5,g5]"),
        loop("[e4,g4,c5] [f4,a4,c5] [d4,g4,b4] [e4,g4,c5]"),
      ],
      4,
    );
    // Without `loop` the old reading stands (the wrap is not judged).
    const { loop: _, ...open } = gate;
    await passes(open, [loop("[c4,e4,g4] [c4,f4,a4] [d4,g4,b4] [e4,g4,c5]")], 4);
  });

  test('range `within` checks a register lift (U05.L08 `.anchor("g5")`): `.anchor("g3")` moves the chords down', async () => {
    const code = (a: string) =>
      `setcpm(92/4)\nbass: note("<c2 f2 g2 c2>").s("ebass").lpf(800)\nchords: chord("<C F G C>")${a}.voicing().s("rhodes")`;
    const high = { rule: "range", track: "chords", within: ["f3", "d6"] };
    await failsWith(high, code('.anchor("g3")'), /.+/, 4);
    await failsWith(high, code(""), /.+/, 4);
    await passes(high, [code('.anchor("g5")'), code('.anchor("e5")'), code('.anchor("a5")')], 4);
  });

  test('chord-tones-strong `cover` (U06.L05 "on beat 1 of every bar"): an empty downbeat is a miss', async () => {
    const r = {
      rule: "chord-tones-strong",
      melody: "bass",
      harmony: "chords",
      strength: "downbeat",
      minRatio: 1,
      cover: true,
    };
    const code = (b: string) =>
      `setcpm(88/4)\nbass: n("${b}").scale("C2:major").s("ebass").lpf(800)\nchords: chord("<C G Am F>").voicing().s("piano").gain(.5)`;
    await failsWith(
      r,
      code("<0 ~ ~ ~>"),
      /a chord tone on 1 of 4 beat 1s; at least 100% \(bar 2, beat 1: no note sounds; 3 beat 1s are empty\)/,
      4,
    );
    await failsWith(r, code("[0 ~ ~ 0 ~ ~ 0 ~]"), /the note is not in the chord/, 4);
    await passes(
      r,
      [
        code("<0 4 5 3>"),
        code("<4 1 2 0>"),
        code("<[0 0 ~ 0 ~ 2 3 ~] [4 4 ~ 4 ~ 4 6 ~] [5 5 ~ 5 ~ 5 4 ~] [3 3 ~ 3 ~ 3 2 1]>"),
        code("<[0 ~ 4 ~] [4 ~ 1 ~] [5 ~ 2 ~] [3 ~ 0 ~]>"),
      ],
      4,
    );
  });

  test('cadence `before: ["V"]` (U06.L04 "V to I"): vii° → I is not V → I', async () => {
    const r = { rule: "cadence", types: ["PAC", "IAC"], at: "last", before: ["V"] };
    const code = (roots: string) =>
      `setcpm(88/4)\nchords: n("[0,2,4]").add(n("<${roots}>")).scale("C3:major").s("piano")`;
    await failsWith(r, code("0 3 0 4 0 3 6 0"), /bar 8 ends .*; the brief asks for V → I/, 8);
    await passes(r, [code("0 3 0 4 0 3 4 0"), code("0 2 3 4 0 5 4 0"), code("0 5 3 4 0 3 4 0")], 8);
    // A dominant seventh is V.
    await passes(r, ['setcpm(88/4)\nchords: chord("<C F C G C F G7 C>").voicing().s("piano")'], 8);
  });

  test('chords-per-bar (U06.L08 "one chord in some bars, two in others"): the hint\'s own answer passes', async () => {
    const r = custom("chords-per-bar", { one: 1, two: 1, max: 2 });
    const code = (roots: string) =>
      `setcpm(100/4)\nchords: n("<${roots}>").add(n("[0,2,4]")).scale("C3:major").s("piano")`;
    await passes(r, [code("0 5 1 [4 0]"), code("0 5 1 4 0 5 3 [1 4]"), code("0 5 [3 1] [4 0]")], 8);
    await failsWith(r, code("0 5 1 4"), /the brief asks for at least 1 bar with two chords/, 4);
    await failsWith(r, code("[0 5 3 4] [0 5 1 4] [0 5 3 4] [1 4 0 4]"), /no bar with more than 2 chords/, 4);
  });

  test('call-response (U07.L07 "two parts that take turns"): a call copied onto vox is doubling', async () => {
    const r = custom("call-response", { a: "mel", b: "vox" });
    const call = 'mel: n("<[0 2 4 ~] ~ [2 4 5 ~] ~>").scale("C4:major").s("piano")';
    await failsWith(
      r,
      `setcpm(96/4)\n${call}\nvox: n("<[0 2 4 ~] ~ [2 4 5 ~] ~>").scale("C4:major").s("rhodes")`,
      /`mel` and `vox` play together in 6 of the 6 beats where either plays \(bar 1, beat 1 first\): a reply waits for the call to stop/,
      4,
    );
    await passes(
      r,
      [
        `setcpm(96/4)\n${call}\nvox: n("<~ [4 ~ 1 ~] ~ [3 ~ 0 ~]>").scale("C4:major").s("rhodes")`,
        `setcpm(96/4)\nmel: n("<[0 2 4 ~] ~ [2 4 5 ~] ~>").scale("C4:major").off(1/2, x => x.scaleTranspose(2)).s("piano")\nvox: n("<~ [6 4 ~ 1] ~ [5 3 1 0]>").scale("C4:major").s("organ").gain(.7)`,
        `setcpm(96/4)\n${call}\nvox: n("<~ [2 ~ ~ 0] ~ [4 3 2 0]>").scale("C4:major").s("piano")`,
      ],
      4,
    );
  });

  test("pickup `leadsIn` (U07.L08): a full bar 0 is no pickup, and a rest before the bar line does not lead in", async () => {
    const r = { rule: "pickup", track: "@melody", leadsIn: true };
    const code = (bar0: string) =>
      `setcpm(84/4)\nchords: n("<~ [0,2,4] [3,5,7] [4,6,8] [0,2,4]>").scale("C3:major").s("piano").gain(.6)\nmel: n("<${bar0} [0 ~ 2 ~] [3 ~ 5 ~] [4 ~ 1 ~] [0@4]>").scale("C4:major").s("piano")`;
    await failsWith(
      r,
      code("[-3 -2 -1 -3]"),
      /the line starts on the downbeat of bar 0, so there is no pickup/,
      5,
    );
    await failsWith(
      r,
      code("[~ ~ -3 ~]"),
      /the pickup stops before the bar line: .*let its last note run into bar 1/,
      5,
    );
    await passes(
      r,
      [code("[~ ~ ~ -3]"), code("[~ ~ -2 -1]"), code("[~ ~ -3@2]"), code("[~ ~ ~ [-2 -1]]")],
      5,
    );
  });

  test('motif-reuse `loopRepeats` (U07.L10 "the same, or moved"): bar 1 written four times returns', async () => {
    const r = { rule: "motif-reuse", track: "@melody", minRatio: 0.66, shape: "either", loopRepeats: true };
    const code = (bars: string) => `setcpm(104/4)\nmel: n("<${bars}>").scale("C4:major").s("piano")`;
    await passes(
      r,
      [
        code("[7 ~ 7 5] [7 ~ 7 5] [7 ~ 7 5] [7 ~ 7 5]"),
        code("[7 ~ 7 5] [4 ~ 4 2] [7 ~ 7 5] [5 ~ 5 3]"),
        code("[7 ~ 7 5] [4 ~ 4 2] [5 ~ 5 3] [5 ~ 5 3]"),
      ],
      4,
    );
    await failsWith(r, code("[7 ~ 7 5] [4 2 6 1] [5 9 0 5] [3 7 5 0]"), /.+/, 4);
  });

  test("step-ratio: no melody, one held note or one repeated pitch is no stepwise line (U07.L01)", async () => {
    const r = { rule: "step-ratio", track: "@melody", min: 0.6 };
    await failsWith(
      r,
      'setcpm(96/4)\nchords: note("[c3,e3,g3]").s("piano")',
      /no melody line to measure yet/,
      8,
    );
    await failsWith(
      r,
      'setcpm(96/4)\nmel: note("c4").slow(8).s("piano")',
      /one note only: a line needs at least two notes/,
      8,
    );
    await failsWith(r, 'setcpm(96/4)\nmel: note("c4*4").s("piano")', /the line stays on one pitch/, 2);
    await passes(r, ['setcpm(96/4)\nmel: n("<[0 1 2 3] [4 3 2 0]>").scale("C4:major").s("piano")'], 2);
  });

  test('orbits-differ (A1.L04 "two rooms"): `.orbit(2)` on both parts, or on the hats, keeps one room', async () => {
    const r = custom("orbits-differ", { a: "snare", b: "mel" });
    const code = (sn: string, mel: string, hh = "") =>
      `setcpm(100/4)\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd").room(.5).roomsize(6)${sn}\nhats: s("hh*8").gain(.5)${hh}\nmel: n("<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>").scale("C4:major").s("square").room(.3).roomsize(1)${mel}.gain(.8)`;
    await failsWith(
      r,
      code(".orbit(2)", ".orbit(2)"),
      /`snare` and `mel` share orbit 2, so they share one reverb/,
      2,
    );
    await failsWith(r, code("", "", ".orbit(2)"), /share orbit 1/, 2);
    await passes(r, [code("", ".orbit(2)"), code(".orbit(2)", ""), code("", ".orbit(3)")], 2);
  });
});

describe("U12–U17 (Wave 6 review): guide tones per bar, triplet lines, the kick's shuffle, modal 3rds, arrivals", () => {
  const cycle = (mel: string) =>
    `setcpm(96/4)\nconst changes = "<Dm7 G7 C^7 F^7 Bm7b5 E7 Am7 Am7>"\nchords: chord(changes).voicing().s("rhodes")\nbass: chord(changes).rootNotes(2).s("upright")\nmel: note("<${mel}>").s("piano")`;

  test('guide-tones `at: "bar"` (U12.L05): a root on beat 1, a repeated chord\'s bar included, is a miss', async () => {
    const r = { rule: "guide-tones", track: "mel", harmony: "chords", minRatio: 1, at: "bar" };
    await failsWith(
      r,
      cycle("d5 f5 e5 e5 d5 d5 c5 a4"),
      /6 of 8 bars meet a 3rd or a 7th \(75%\); at least 100%\. Bar 1: over Dm7 the line has D \(the root\); Dm7's guide tones are F \(the 3rd\) and C \(the 7th\)/,
      8,
    );
    await passes(
      r,
      [
        cycle("f5 f5 e5 e5 d5 d5 c5 c5"),
        cycle(
          "[f5 ~ e5 d5] [f5 d5 b4 g4] [e5 ~ g5 b5] [e5 c5 a4 c5] [d5 ~ f5 a5] [d5 b4 g#4 b4] [c5 e5 b4 g4] [c5 a4@3]",
        ),
        cycle("c5 b4 b4 a4 a4 g#4 g4 c5"),
      ],
      8,
    );
  });

  test("tuplets-every-bar (U13.L05 S8): two hits near the start of each bar are no triplet line", async () => {
    const ballad = (chords: string, hats = 'hats: s("hh*8").gain(.5)') =>
      `setcpm(76/4)\nconst changes = "<C^7 Am7 Dm7 G7>"\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\n${hats}\nchords: chord(changes).voicing()${chords}.s("piano").gain(.6)`;
    const r = custom("tuplets-every-bar");
    await failsWith(
      r,
      ballad('.struct("~ x x ~ ~ ~ ~ ~ ~ ~ ~ ~")'),
      /no line keeps triplets going through every bar/,
      4,
    );
    await failsWith(r, ballad('.struct("x*4").ply(2)'), /every beat of every bar needs 3/, 4);
    await passes(
      r,
      [
        ballad('.struct("x*4").ply(3)'),
        ballad('.struct("x*4")', 'hats: s("hh*4").ply(3).velocity("[1 .5 .6]*4").gain(.5)'),
        ballad('.struct("[x x x]*4")'),
        ballad('.struct("x*12")'),
      ],
      4,
    );
    // `track` names the line: the hats in triplets do not make the piano's.
    await failsWith(
      custom("tuplets-every-bar", { track: "chords" }),
      ballad('.struct("x*4")', 'hats: s("hh*4").ply(3)'),
      /in `chords`, bar 1 has 0 beats of 3 even notes/,
      4,
    );
  });

  test("swung-offbeats on the kick (U13.L06): a straight kick under swung hats does not shuffle", async () => {
    const r = custom("swung-offbeats", { track: "kick" });
    const code = (kick: string) =>
      `setcpm(92/4)\nkick: s("<[bd ~ ~ bd bd ~ ~ ~] [bd ~ ~ ~ ~ bd ~ bd]>")${kick}\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").swingBy(1/3, 4).gain(.5)`;
    await failsWith(
      r,
      code(""),
      /bar 1, 2& in `kick` divides its beat 1:1, straight; a shuffle plays it later, 1\.6:1 to 2\.4:1/,
      2,
    );
    await passes(r, [code(".swingBy(1/3, 4)"), code(".swing(4)"), code(".swingBy(1/3, 4).gain(.9)")], 2);
  });

  test("swing ratio [1.45, 2.4] takes the lighter `.swingBy(.2, 4)` (U11.L07, 1.5:1)", async () => {
    const r = { rule: "swing", track: "hats", subdivision: 8, ratio: [1.45, 2.4] };
    const code = (x: string) => `setcpm(112/4)\nhats: s("hh*8")${x}.gain(.5)\ndrums: s("bd ~ sd ~")`;
    await passes(r, [code(".swingBy(.2, 4)"), code(".swingBy(1/3, 4)"), code(".swing(4)")], 2);
    await failsWith(r, code(""), /.+/, 2);
  });

  test('velocity-ghosts with `drum: "snare"` (U13.L02): hi-hats in the snare\'s place are not snare ghosts', async () => {
    const r = {
      rule: "velocity-ghosts",
      track: "snare",
      min: 3,
      on: "16th-offbeat",
      accents: 2,
      drum: "snare",
    };
    const code = (snd: string, vel: string) =>
      `setcpm(96/4)\nkick: s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")\nsnare: s("~ ~ ~ ~ ${snd} ~ ~ ${snd} ~ ${snd} ~ ~ ${snd} ~ ~ ${snd}").velocity("${vel}")`;
    await failsWith(r, code("hh", "1 1 1 1 1 1 1 .3 1 .3 1 1 1 1 1 .3"), /.+/, 1);
    await passes(
      r,
      [
        code("sd", "1 1 1 1 1 1 1 .3 1 .3 1 1 1 1 1 .3"),
        code("sd", "[1 .3]*8"),
        code("sd", "[1 1 1 1] [1 1 1 .2] [1 .2 1 1] [1 1 1 .2]"),
      ],
      1,
    );
  });

  test("mode (U14.L06, C6): the home chord carries the mode's own 3rd", async () => {
    const r = {
      rule: "mode",
      tonic: "declared",
      mode: "mixolydian",
      anyOf: ["mixolydian", "dorian"],
      requireCharacteristic: true,
    };
    await failsWith(
      r,
      'setcpm(100/4)\nchords: chord("D").voicing().s("piano")\nmel: n("5 2 5 2").scale("D4:dorian").s("piano")',
      /the home chord in bar 1 is D, with F♯; D Dorian's home chord is minor, with F as its 3rd/,
      16,
      null,
    );
    await failsWith(
      r,
      'setcpm(100/4)\nchords: chord("Gm").voicing().s("piano")\nmel: n("6 0 6 0").scale("G4:mixolydian").s("piano")',
      /the home chord in bar 1 is Gm, with B♭; G Mixolydian's home chord is major, with B as its 3rd/,
      16,
      null,
    );
    await passes(
      r,
      [
        'setcpm(100/4)\nchords: chord("<Dm G>").voicing().s("piano")\nmel: n("<[5 ~ 2 ~] [5 ~ 3 ~]>").scale("D4:dorian").s("piano")',
        'setcpm(100/4)\nchords: chord("<G F>").voicing().s("piano")\nmel: n("<[6 ~ 4 ~] [6 ~ 2 ~]>").scale("G4:mixolydian").s("piano")',
        'setcpm(100/4)\nchords: chord("<E D A E>").voicing().struct("x ~ ~ x ~ ~ x ~").early(1/8).s("piano")\nmel: n("<[6 ~ 4 ~] [6 ~ 5 4] [3 ~ 2 ~] [0 ~ ~ ~]>").scale("E4:mixolydian").s("piano")',
      ],
      16,
      null,
    );
  });

  test("contains-rn `mustResolve` (U15.L02–L06): A is not vi, Gm is not V, D+ is not ii; a chain's D7 still is ii's", async () => {
    const r = { rule: "contains-rn", rn: ["V/vi", "V/ii", "V/IV", "V/V"], min: 1, mustResolve: true };
    const code = (ch: string) => `setcpm(100/4)\nchords: chord("<${ch}>").voicing().s("piano")`;
    for (const wrong of ["C E7 A C", "C D7 Gm C", "C D7 Gaug C", "C C7 Fm C", "C A7 Daug G7"])
      await failsWith(r, code(wrong), /doesn't resolve/, 4);
    await passes(r, [code("C E7 Am C"), code("C A7 Dm G7"), code("C C7 F G7"), code("C A7 D7 G7")], 4);
  });

  test('contains-rn `inOrder` with the tonic (U15.L05 "landing home"): A7 D7 G7 F does not land', async () => {
    const r = { rule: "contains-rn", rn: ["V/ii", "V/V", "V", "I"], min: 1, inOrder: true };
    const code = (ch: string) =>
      `setcpm(120/4)\nchords: chord("<${ch}>").voicing().struct("~ x ~ x").s("jazzgtr")`;
    await failsWith(r, code("C Em A7 A7 D7 G7 F F"), /.+/, 8);
    await passes(r, [code("C Em A7 A7 D7 G7 C G7"), code("C E7 A7 A7 D7 G7 C C")], 8);
  });

  test("last-chord (U16.L04 Picardy): `[A Am]` or `[A E]` in bar 8 is not an ending on A major", async () => {
    const r = custom("last-chord", { rn: ["I"] });
    const Am: KeySpec = { tonic: "A", mode: "minor" };
    const code = (last: string, mel = "[0@3 ~]") =>
      `setcpm(88/4)\nconst changes = "<Am Dm F E Am Dm E ${last}>"\nchords: chord(changes).voicing().struct("x x x x").s("piano")\nbass: chord(changes).rootNotes(2).s("upright")\nmel: n("<[4 ~ 2 0] [3 ~ 0 ~] [5 ~ 2 ~] [1 ~ ~ ~] [4 ~ 2 0] [3 ~ 4 3] [1 ~ 6# ~] ${mel}>").scale("A3:minor").s("acgtr")`;
    await failsWith(
      r,
      code("[A Am]"),
      /the last chord that sounds is Am, in bar 8; the brief asks the piece to end on I \(A\)/,
      8,
      Am,
    );
    await failsWith(r, code("[A E]"), /the last chord that sounds is E, in bar 8/, 8, Am);
    await failsWith(r, code("Am"), /is Am/, 8, Am);
    await passes(r, [code("A"), code("A", "[2#@3 ~]"), code("[E A]"), code("[Dm A]")], 8, Am);
  });

  test("key-change at the last chorus (U17.L02, U17.CP): music that never changes key has no lift", async () => {
    const r = { rule: "key-change", at: "last", semitones: [2], minBarsAfter: 4 };
    const song = (scale: string, chorus2: string) =>
      `setcpm(100/4)\nconst chV = chord("<C Am F G>").voicing()\nconst chC = chord("<F G C C>").voicing()\nconst chC2 = chord("<${chorus2}>").voicing()\nconst mV = n("<[0 2 4 2] [4 2 0 ~] [3 5 4 2] [1 ~ ~ ~]>")\nconst mC = n("<[3 5 7 5] [4 6 8 6] [7 5 4 2] [0 ~ ~ ~]>")\nchords: arrange([4, chV], [4, chC], [4, chC2]).s("piano")\nmel: arrange([4, mV], [4, mC], [4, mC]).scale("${scale}").s("piano")`;
    await failsWith(
      r,
      song("D4:major", "F G C C"),
      /stays in D major, the key of .+: nothing lifts; the brief asks for a lift of \+2/,
      12,
    );
    await failsWith(r, song("C4:major", "F G C C"), /stays in C major/, 12);
    // Chords lifted, tune left behind.
    await failsWith(
      r,
      song("C4:major", "G A D D").replace(
        "mel: arrange",
        'bass: arrange([4, n("0")], [4, n("0")], [4, n("0")]).scale("<C2:major!8 D2:major!4>").s("ebass")\nmel: arrange',
      ),
      /its tune is still in C major: lift the tune's `\.scale\(\)` too/,
      12,
    );
    await passes(r, [song("<C4:major!8 D4:major!4>", "G A D D")], 12);
    // A lift that starts inside the last section names where it starts and how long it lasts (gate leftover:
    // it read "C major → C major is +0").
    await failsWith(
      { ...r, minBarsAfter: 4 },
      song("<C4:major!10 D4:major!2>", "F G D D"),
      /^the key changes at bar 11, 2 bars into .+ \(bar 9\): change it where the section starts; the new key lasts 2 bars, at least 4/,
      12,
    );
  });

  test("modulation `cadence` (U17.L03): a key plan over chords that still go G → C does not reach A minor", async () => {
    const r = { rule: "modulation", to: "relative", cadence: true };
    const code = (bridge: string, scale: string) =>
      `setcpm(92/4)\nconst chordsVerse = chord("<C Am F G>").voicing()\nconst chordsBridge = chord("<${bridge}>").voicing()\nconst melVerse = n("<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~]>")\nconst melBridge = n("<[4 ~ 2 4] [5 ~ 3 5] [4 ~ 6 4] [7 ~ ~ ~]>")\nchords: arrange([4, chordsVerse], [4, chordsBridge]).s("rhodes")\nmel: arrange([4, melVerse], [4, melBridge]).scale("${scale}").s("piano")`;
    await failsWith(
      r,
      code("Am Dm G C", "<C4:major!4 A3:harmonic:minor!4>"),
      /the chords do not: from bar 5 they are Am, Dm, G, C, with no E or E7 going to Am/,
      8,
    );
    await passes(
      r,
      [
        code("Am Dm E7 Am", "<C4:major!4 A3:harmonic:minor!4>"),
        code("Am F E Am", "<C4:major!4 A3:minor!4>"),
        code("Dm E7 Am Am", "<C4:major!4 A3:harmonic:minor!4>"),
      ],
      8,
    );
  });

  test("song-kept (CF-T.S4): a constant chord for 32 bars drops the song; the song's changes after an intro pass", async () => {
    const harmony = [
      ...["C", "E7", "A7", "A7", "D7", "G7", "C", "G7"],
      ...["C", "E7", "A7", "A7", "D7", "G7", "C", "C"],
      ...["E7", "E7", "A7", "A7", "D7", "D7", "G7", "G7"],
      ...["C", "E7", "A7", "A7", "D7", "G7", "C", "C"],
    ];
    const songForm = ["A", "A", "B", "A"].map((label, s) => ({
      label,
      bars: 8,
      chords: harmony.slice(s * 8, s * 8 + 8).map((c) => [c]),
    }));
    const run2 = async (code: string, bars: number) => {
      const n = await strudel(code, bars);
      const ctx: RubricContext = { meter: "4/4", code, params: {}, bars, totalBars: bars, key: C, songForm };
      return evalRule(rule(custom("song-kept")), n, ctx);
    };
    const constant = await run2(
      'setcpm(192/4)\nchords: note("[c3,c4]").s("piano")\nmel: note("c4").s("piano")',
      32,
    );
    expect(constant.ok).toBe(false);
    expect(constant.detail).toMatch(
      /0 of the song's 32 bars keep its chords; at least 75% \(bar 1 of the song is C; your bar 1 plays no chord\)\. An arrangement keeps the song's changes/,
    );
    const changes = (h: string[]) => `setcpm(192/4)\nchords: chord("<${h.join(" ")}>").voicing().s("piano")`;
    for (const code of [
      changes(harmony),
      changes(["C", "G7", "C", "G7", ...harmony]),
      changes(harmony.map((c) => c.replace("7", ""))),
    ])
      expect((await run2(code, 36)).ok).toBe(true);
    const none = await evalRule(rule(custom("song-kept")), await strudel(changes(harmony), 32), {
      meter: "4/4",
      code: "",
      params: {},
      bars: 32,
    });
    expect(none.detail).toBe("the song's chart is not available to compare with");
  });
});
