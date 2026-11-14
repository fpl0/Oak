// Corrections pass, the leftovers (fix:leftovers): the rules the lesson engineers were blocked on, each pinned on
// real Strudel 1.2.6 output with the outside review's counterexample (it fails, with a line the learner can act on)
// and right answers written in other ways (they pass). The lesson steps that use them pin pass/fail in their own
// authored variants (content:check "Grading").
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import type { RubricContext } from "./context.ts";
import { evalRule, withoutMutedLines } from "./rules.ts";

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
async function passes(body: Record<string, unknown>, codes: string[], bars?: number) {
  for (const code of codes) {
    const r = await run(body, code, bars);
    if (!r.ok) throw new Error(`expected a pass for:\n${code}\n→ ${r.detail}`);
  }
}
async function failsWith(body: Record<string, unknown>, code: string, re: RegExp, bars?: number) {
  const r = await run(body, code, bars);
  if (r.ok) throw new Error(`expected a fail for:\n${code}\n→ ${r.detail}`);
  expect(r.detail).toMatch(re);
  return r;
}

describe("transposed-copy: the leftovers' params", () => {
  const deg = (p: string) => `setcpm(84/4)\nmel: n("${p}").scale("C4:major").s("piano")`;
  const answer = custom("transposed-copy", {
    track: "@melody",
    unitBars: 2,
    steps: "diatonic",
    pairs: [[1, 3]],
  });

  test('U03.L10 "bars 3–4 answer bars 1–2, every number moved by the same amount": one move for both bars', async () => {
    // The outside review's counterexample: bar 3 moved by 5, bar 4 a plain copy of bar 2.
    await failsWith(
      answer,
      deg("<[0 0 0 2] [1 0 1 2] [5 5 5 7] [1 0 1 2]>"),
      /bars 3–4 do not bring back bars 1–2: keep the rhythm and move every note by the same number of scale steps/,
      4,
    );
    // The phrase again at the same height is a 2-bar loop: no answer.
    await failsWith(
      answer,
      deg("<[0 0 0 2] [1 0 1 2] [0 0 0 2] [1 0 1 2]>"),
      /bars 3–4 play bars 1–2 again at the same height/,
      4,
    );
    await passes(
      answer,
      [
        deg("<[0 0 0 2] [1 0 1 2] [5 5 5 7] [6 5 6 7]>"),
        // A tonal sequence: by degrees, the 3rds change size (D–F is 3 half steps, C–E 4).
        deg("<[0 0 0 2] [1 0 1 2] [1 1 1 3] [2 1 2 3]>"),
        deg("<[0 0 0 2] [1 0 1 2] [-2 -2 -2 0] [-1 -2 -1 0]>"),
        // Note names in C major, moved up two steps.
        'setcpm(84/4)\nmel: note("<[c4 c4 c4 e4] [d4 c4 d4 e4] [e4 e4 e4 g4] [f4 e4 f4 g4]>").s("piano")',
      ],
      4,
    );
    // `steps: "either"`: an exact move in half steps out of the key keeps the shape too (C♯ D♯ F…).
    const sharp =
      'setcpm(84/4)\nmel: note("<[c4 c4 c4 e4] [d4 c4 d4 e4] [c#4 c#4 c#4 f4] [d#4 c#4 d#4 f4]>").s("piano")';
    expect((await run(answer, sharp, 4)).ok).toBe(false);
    const either = custom("transposed-copy", {
      track: "@melody",
      unitBars: 2,
      steps: "either",
      pairs: [[1, 3]],
    });
    expect((await run(either, sharp, 4)).detail).toBe("bars 3–4 bring back bars 1–2, 1 half step higher");
    expect((await run(either, deg("<[0 0 0 2] [1 0 1 2] [5 5 5 7] [1 0 1 2]>"), 4)).ok).toBe(false);
    const r = await run(answer, deg("<[0 0 0 2] [1 0 1 2] [5 5 5 7] [6 5 6 7]>"), 4);
    expect(r.detail).toBe("bars 3–4 bring back bars 1–2, 5 steps higher");
  });

  test('U03.L11 "bar 5 starts the way bar 1 starts": only the pair asked for counts', async () => {
    const tune = (b5: string) =>
      deg(`<[0 2 4 2] [3 ~ 2 ~] [2 4 7 4] [6 ~ 4 ~] ${b5} [5 ~ 4 ~] [3 2 1 ~] [0 ~ ~ ~]>`);
    const pair = custom("transposed-copy", { track: "@melody", pairs: [[1, 5]], minSemis: 0 });
    // The outside review's counterexamples: bar 5 is bar 2 or bar 3 again.
    await failsWith(pair, tune("[3 ~ 2 ~]"), /bar 5 does not bring back bar 1/, 8);
    await failsWith(pair, tune("[2 4 7 4]"), /bar 5 does not bring back bar 1/, 8);
    // Moved by one degree, the 3rds change size: not bar 1's shape in half steps.
    await failsWith(pair, tune("[1 3 5 3]"), /bar 5 does not bring back bar 1/, 8);
    await passes(pair, [tune("[0 2 4 2]"), tune("[7 9 11 9]"), tune("[3 5 7 5]"), tune("[-7 -5 -3 -5]")], 8);
    expect((await run(pair, tune("[0 2 4 2]"), 8)).detail).toBe("bar 5 brings back bar 1 as it was");
  });

  test('U02.L06 "doubles it on another sound": together, the same height or an octave, other sounds', async () => {
    const dbl = custom("transposed-copy", {
      together: true,
      semis: [0, 12, -12, 24, -24],
      otherSound: true,
      minRatio: 1,
    });
    const two = (vox: string, sound: string) =>
      `setcpm(90/4)\nmel: note("<[c4 e4 g4 e4] [f4 a4 g4 e4]>").s("piano").gain(.5)\nvox: note("${vox}").s("${sound}").gain(.4)`;
    await failsWith(
      dbl,
      two("<[c4 e4 g4 e4] [f4 a4 g4 e4]>", "piano"),
      /`vox` doubles `mel` on the same sound: give the copy another sound with `\.s\(\)`/,
    );
    await failsWith(dbl, two("c5 ~ ~ ~", "sine"), /no line doubles another/);
    await failsWith(dbl, two("<[c4 e4 g4 e4] ~>", "sine"), /the line is doubled in 1 of its 2 bars/);
    // A fifth above is a harmony, not a doubling.
    await failsWith(dbl, two("<[g4 b4 d5 b4] [c5 e5 d5 b4]>", "sine"), /no line doubles another/);
    await passes(dbl, [
      two("<[c4 e4 g4 e4] [f4 a4 g4 e4]>", "sine"),
      two("<[c5 e5 g5 e5] [f5 a5 g5 e5]>", "triangle"),
      two("<[48 52 55 52] [53 57 55 52]>", "sawtooth"),
      'setcpm(90/4)\nmel: note("<[c4 e4 g4 ~] [f4 a4 c5 a4]>").s("<piano sawtooth>").gain(.5)\nvox: note("<[c4 e4 g4 ~] [f4 a4 c5 a4]>").transpose(12).s("triangle").gain(.4)',
    ]);
  });

  test("without the new params the rule reads as before (U02.L05, U04.L04)", async () => {
    await failsWith(
      custom("transposed-copy"),
      'setcpm(96/4)\nmel: note("c4 e4 g4 e4").transpose(0).s("piano")',
      /the riff comes back at the same pitch/,
      1,
    );
    await passes(
      custom("transposed-copy"),
      ['setcpm(96/4)\nmel: note("<[c4 e4 g4 e4] [f4 a4 c5 a4]>").s("piano")'],
      2,
    );
  });
});

describe("control-set (U02.L08 `.room()`, and the A1 Makes)", () => {
  const room = custom("control-set", { control: "room", above: 0, example: ".4" });
  test("`.room(0)` is a dry sound; a room you can hear passes", async () => {
    await failsWith(
      room,
      'setcpm(90/4)\nmel: note("c4 d4 e4 f4").s("piano").room(0)',
      /`\.room\(0\)` changes nothing you can hear: at 0 it adds nothing\. Try `\.room\(\.4\)`/,
      1,
    );
    await failsWith(
      room,
      'setcpm(90/4)\nmel: note("c4 d4 e4 f4").s("piano")',
      /no sound has `\.room\(\)` yet: add `\.room\(\.4\)` to the line/,
      1,
    );
    await passes(
      room,
      [
        'setcpm(90/4)\nmel: note("c4 d4 e4 f4").s("piano").room(.4)',
        'setcpm(90/4)\nmel: note("c4 d4 e4 f4").s("sine").room(.05)',
        'setcpm(90/4)\nmel: note("c4 d4 e4 f4").s("piano").room("<0 .6>")',
      ],
      2,
    );
  });
  test("`not` names a control's neutral value: any other number changes the sound", async () => {
    const env = custom("control-set", { control: "lpenv", not: 0, example: "4" });
    await failsWith(
      env,
      'setcpm(90/4)\nbass: note("c2*4").s("sawtooth").lpf(300).lpenv(0)',
      /`\.lpenv\(0\)` changes nothing/,
      1,
    );
    await passes(env, ['setcpm(90/4)\nbass: note("c2*4").s("sawtooth").lpf(300).lpenv(-3)'], 1);
  });
});

describe("parts-enter (U09.L05 an intro that brings the parts in)", () => {
  const enter = custom("parts-enter", { min: 2, alsoUses: ["tb.mask"] });
  const lines = (
    bass: string,
    chords: string,
    mel = 'n("<[7 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [4 ~ ~ ~]>").scale("C4:major")',
  ) =>
    `setcpm(104/4)\nchords: chord("<C Am F G>").voicing()${chords}.s("piano")\nbass: n("<0 5 3 4>").scale("C2:major")${bass}.s("ebass")\nmel: ${mel}.s("piano")`;
  test('two `.mask("1")` silence nothing (the outside review\'s counterexample)', async () => {
    await failsWith(
      enter,
      lines('.mask("1")', '.mask("1")'),
      /every part plays in every bar: no part comes in late or drops out/,
      4,
    );
    await failsWith(
      enter,
      lines('.mask("<0 1 1 1>")', ""),
      /a part comes in late or drops out once \(`bass` waits bar 1\); the brief asks for 2/,
      4,
    );
  });
  test("parts that come in one at a time, or drop out before a change, pass", async () => {
    await passes(
      enter,
      [
        lines('.mask("<0 1 1 1>")', '.mask("<0 0 1 1>")'),
        lines('.mask("<1 1 1 0>")', '.mask("<0 1 1 1>")'),
        lines(
          '.mask("<0 1 1 1>")',
          "",
          'n("<[7 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [4 ~ ~ ~]>").scale("C4:major").mask("<0 0 1 1>")',
        ),
      ],
      4,
    );
    const r = await run(enter, lines('.mask("<0 1 1 1>")', '.mask("<0 0 1 1>")'), 4);
    expect(r.detail).toBe("2 entries or drop-outs: `bass` waits bar 1, `chords` waits bars 1–2");
  });
  test("the effect alone is not enough: the step asks for `.mask()`", async () => {
    const r = await run(
      enter,
      `setcpm(104/4)\nchords: chord("<~ ~ F G>").voicing().s("piano")\nbass: n("<~ 5 3 4>").scale("C2:major").s("ebass")\nmel: n("<[7 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [4 ~ ~ ~]>").scale("C4:major").s("piano")`,
      4,
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/now write it with .+, as the step asks/);
  });
});

describe("motif-reuse with `loopRepeats: N` (U07.L10, U07.CP)", () => {
  const hook = { rule: "motif-reuse", track: "@melody", minRatio: 0.5, shape: "either", loopRepeats: 4 };
  const mel = (p: string) => `setcpm(100/4)\nmel: n("${p}").scale("C4:major").s("piano")`;
  test("a two-bar hook played twice comes back; a one-bar loop does not", async () => {
    await passes(
      hook,
      [mel("<[2 0 4 1] [3 ~ 1 ~] [2 0 4 1] [3 ~ 1 ~]>"), mel("<[2 0 4 1] [6 4 8 5] [5 2 7 9] [3 1 5 2]>")],
      8,
    );
    await failsWith(
      hook,
      mel("<[2 0 4 1] [2 0 4 1] [2 0 4 1] [2 0 4 1]>"),
      /every bar plays the same thing: a one-bar loop/,
      8,
    );
    await failsWith(hook, mel("<[0 2 4 6] [4 3 1 -1] [5 7 4 2] [3 6 5 0]>"), /0 of 4 bars repeat/, 8);
    // Without the number, the 2-bar hook collapses to its 2 bars and nothing comes back (the old reading).
    const plain = { ...hook, loopRepeats: undefined };
    expect((await run(plain, mel("<[2 0 4 1] [3 ~ 1 ~] [2 0 4 1] [3 ~ 1 ~]>"), 8)).ok).toBe(false);
  });
});

describe("modulation: the arrival has the new key's own 3rd (U17.L01, U17.L03)", () => {
  const pivot = (last: string) =>
    `setcpm(100/4)\nchords: chord("<C Am F G C Am D7 ${last}>").voicing().s("piano")\nmel: n("<[0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 1 ~] [0 2 4 2] [4 2 0 ~]>").scale("<C4:major!6 G4:major!2>").s("piano")`;
  const viaPivot = { rule: "modulation", to: "dominant", via: "pivot" };
  test("`D7 Gm` does not end in G major", async () => {
    await failsWith(
      viaPivot,
      pivot("Gm"),
      /moves to G major at bar 7, but D7 goes to Gm, which is not the home chord of G major: that is G, major/,
      8,
    );
    await passes(viaPivot, [pivot("G"), pivot("G^7"), pivot("Gsus4")], 8);
  });
  test("`cadence`: E7 into A major is no arrival in A minor", async () => {
    const r = { rule: "modulation", to: "relative", cadence: true };
    const code = (bridge: string) =>
      `setcpm(92/4)\nconst chordsVerse = chord("<C Am F G>").voicing()\nconst chordsBridge = chord("<${bridge}>").voicing()\nconst melVerse = n("<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~]>")\nconst melBridge = n("<[4 ~ 2 4] [5 ~ 3 5] [4 ~ 6 4] [7 ~ ~ ~]>")\nchords: arrange([4, chordsVerse], [4, chordsBridge]).s("rhodes")\nmel: arrange([4, melVerse], [4, melBridge]).scale("<C4:major!4 A3:harmonic:minor!4>").s("piano")`;
    await failsWith(
      r,
      code("Am Dm E7 A"),
      /E7 goes to A, which is not the home chord of A minor: that is Am, minor/,
      8,
    );
    await passes(r, [code("Am Dm E7 Am"), code("Dm E7 Am Am")], 8);
  });
});

describe("`uses` reads only the lines that play", () => {
  test("a tool on a muted `_label:` line is not used", async () => {
    const r = { rule: "uses", tool: "tb.transpose" };
    const muted =
      'setcpm(90/4)\nmel: note("c4 e4").s("piano")\n_vox: note("c4 e4")\n  .transpose(12).s("sine")';
    expect((await run(r, muted, 1)).ok).toBe(false);
    expect((await run(r, muted.replace("_vox", "vox"), 1)).ok).toBe(true);
    expect(withoutMutedLines("a: x\n_b: y\n  .z()\nc: w")).toBe("a: x\n     \n      \nc: w");
  });
});

describe("plain words for counts", () => {
  test("`bars` and `tracks` say 1 bar, 1 part", async () => {
    const one = 'setcpm(90/4)\nmel: note("c4 e4").s("piano")';
    expect((await run({ rule: "bars", min: 4 }, one, 1)).detail).toBe("1 bar; the brief asks for at least 4");
    expect((await run({ rule: "tracks", min: 2, roles: ["melody"] }, one, 1)).detail).toBe(
      "1 melody part; at least 2",
    );
  });
});
