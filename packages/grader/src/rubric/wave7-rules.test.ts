// Wave 7 Build (grader): the rule fields content-kit 6 added (`clave.coverage`, `polyrhythm.together`,
// `voice-leading.top`, `reharmonize.devices`), the five whole rules that sat in PLANNED since Wave 0 (`euclid`,
// `clave`, `polyrhythm`, `register-separation`, `no-muddy-low`), and the device detector's gaps the J5 spec probed
// (a chord heard only as its root, a ♭VIImaj7 "backdoor", a secondary ii–V that never arrives), on real Strudel
// output. Each: right answers pass; the pre-flight's counterexample and a wrong answer that uses the right function
// fail with a line that names the fault.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, MeterId, RubricRule } from "@oak/content-kit";
import type { Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import { evalRule } from "./rules.ts";
import { heard } from "./wave7-custom.test.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "w7", label: "w7", required: true, skills: [], ...body }) as unknown as RubricRule;
interface Opts {
  bars?: number;
  key?: KeySpec | null;
  meter?: MeterId;
  extra?: Partial<RubricContext>;
}
async function run(body: Record<string, unknown>, code: string, o: Opts = {}) {
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
  return evalRule(rule(body), n, ctx);
}
async function passes(body: Record<string, unknown>, codes: string[], o: Opts = {}) {
  for (const code of codes) {
    const r = await run(body, code, o);
    if (!r.ok) throw new Error(`expected a pass for:\n${code}\n→ ${r.detail}`);
  }
}
async function fails(body: Record<string, unknown>, code: string, re: RegExp, o: Opts = {}) {
  const r = await run(body, code, o);
  if (r.ok) throw new Error(`expected a fail for:\n${code}\n→ ${r.detail}`);
  expect(r.detail).toMatch(re);
  expect(r.detail.startsWith("not built yet")).toBe(false);
  return r;
}

const SON32 = '"<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>"';
describe("clave (feature clave.coverage, w7plan A5)", () => {
  const r = { rule: "clave", track: "perc", type: "son", direction: "3-2", minBars: 8 };
  test("eight bars of son clave 3-2 from bar 1, written three ways", async () => {
    await passes(
      r,
      [
        `perc: s(${SON32})`,
        'perc: s("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>").s("rim")',
        'perc: s("<rim(3,8) [~ ~ rim ~ rim ~ ~ ~]>")',
      ],
      { bars: 8, key: null },
    );
    await passes({ ...r, direction: "2-3" }, ['perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")'], {
      bars: 8,
      key: null,
    });
    await passes({ ...r, type: "rumba" }, ['perc: s("<[rim ~ ~ rim ~ ~ ~ rim] [~ ~ rim ~ rim ~ ~ ~]>")'], {
      bars: 8,
      key: null,
    });
  });
  test("two bars of clave in an eight-bar piece fail RC2's eight bars (the pre-flight's counterexample)", async () => {
    await fails(
      r,
      `perc: s(${SON32}).mask("<1 1 0 0 0 0 0 0>")`,
      /bars 3–4 do not hold the whole son clave 3-2 \(it holds for 2 bars from bar 1\)/,
      {
        bars: 8,
        key: null,
      },
    );
  });
  test("the right strokes in the other direction, the rumba, or with extra strokes fail", async () => {
    await fails(
      r,
      'perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")',
      /play the son clave 2-3; the brief asks for the son clave 3-2/,
      {
        bars: 8,
        key: null,
      },
    );
    await fails(r, 'perc: s("<[rim ~ ~ rim ~ ~ ~ rim] [~ ~ rim ~ rim ~ ~ ~]>")', /rumba clave 3-2/, {
      bars: 8,
      key: null,
    });
    await fails(
      r,
      'perc: s("<[rim ~ rim rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")',
      /more than the clave's five strokes/,
      {
        bars: 8,
        key: null,
      },
    );
    // `exact: false` lets the clave line play more than the clave.
    await passes({ ...r, exact: false }, ['perc: s("<[rim ~ rim rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")'], {
      bars: 8,
      key: null,
    });
  });
});

describe("polyrhythm (feature polyrhythm.together, w7plan A6)", () => {
  const r = { rule: "polyrhythm", a: "a", b: "b", ratio: [3, 2], minBars: 2 };
  test("3 against 2 in the same bars, three ways", async () => {
    await passes(
      r,
      [
        'a: s("rim*3")\nb: s("bd*2")',
        'a: note("c5 c5 c5")\nb: note("c3 c3")',
        'a: s("[cp cp cp]")\nb: s("[bd ~ bd ~]")',
      ],
      {
        bars: 2,
        key: null,
      },
    );
    await passes({ ...r, ratio: [3, 4], span: 1 }, ['a: s("rim*3")\nb: s("hh*4")'], { bars: 2, key: null });
  });
  test("parts that take turns bar by bar never meet (the pre-flight's counterexample)", async () => {
    await fails(r, 'a: s("<rim*3 ~>")\nb: s("<~ bd*2>")', /never in the same bars/, { bars: 4, key: null });
  });
  test("the right pulses, unevenly spaced, or 2 against 2, fail", async () => {
    await fails(r, 'a: s("[rim rim ~ rim]")\nb: s("bd*2")', /does not play 3 evenly spaced attacks/, {
      bars: 2,
      key: null,
    });
    await fails(r, 'a: s("rim*2")\nb: s("bd*2")', /does not play 3 evenly spaced attacks/, {
      bars: 2,
      key: null,
    });
    await fails(r, 'a: s("rim*3").gain(.02)\nb: s("bd*2").gain(1)', /nothing plays in `a`/, {
      bars: 2,
      key: null,
    });
  });
});

describe("euclid, register-separation, no-muddy-low (PLANNED since Wave 0)", () => {
  test("euclid: E(3,8) from the onsets, however it is written", async () => {
    const r = { rule: "euclid", track: "perc", k: 3, n: 8, rotationFree: false };
    await passes(
      r,
      ['perc: s("rim(3,8)")', 'perc: s("rim").euclid(3, 8)', 'perc: s("rim ~ ~ rim ~ ~ rim ~")'],
      {
        bars: 2,
        key: null,
      },
    );
    await passes({ ...r, k: 5, rotationFree: true }, ['perc: s("rim(5,8,1)")', 'perc: s("rim(5,8)")'], {
      bars: 2,
      key: null,
    });
    // The right function, rotated, when the brief asks for E(3,8) from its first hit.
    await fails(r, 'perc: s("rim(3,8,2)")', /turned to start elsewhere/, { bars: 2, key: null });
    await fails(r, 'perc: s("rim(4,8)")', /not spread as evenly/, { bars: 2, key: null });
    await fails(r, 'perc: s("rim ~ rim ~ ~ ~ rim ~")', /not spread as evenly/, { bars: 2, key: null });
  });
  test("register-separation: the chords above the bass with room between", async () => {
    const r = { rule: "register-separation", low: "bass", high: "chords", minGapSemis: 5 };
    await passes(
      r,
      [
        'bass: note("c2 g2")\nchords: note("[c4,e4,g4]")',
        'bass: note("a1 e2")\nchords: chord("Am").voicing()',
      ],
      {
        bars: 1,
      },
    );
    await fails(r, 'bass: note("c3 g3")\nchords: note("[c3,e3,g3]")', /cross/, { bars: 1 });
    await fails(r, 'bass: note("c2 g2")\nchords: note("[a2,c3,e3]")', /only 2 half steps/, { bars: 1 });
  });
  test("no-muddy-low: thirds low down are mud; an octave and a fifth are not", async () => {
    const r = { rule: "no-muddy-low", track: "*" };
    await passes(
      r,
      [
        'chords: note("[c2,g2,e3]")',
        'chords: note("[c2,c3,g3,e4]")',
        'bass: note("e1 e2")\nchords: note("[e3,g3,b3]")',
      ],
      {
        bars: 1,
      },
    );
    await fails(r, 'chords: note("[c2,e2,g2]")', /4 half steps apart this low/, { bars: 1 });
    await fails(r, 'chords: note("[g2,a2]")', /blur into mud/, { bars: 1 });
  });
});

describe("voice-leading top (feature voice-leading.top, AC2; w7plan A7)", () => {
  const r = { rule: "voice-leading", track: "chords", maxMovePerVoice: 2, voice: "top", minRatio: 0.8 };
  test("a hand-voiced top line moving by step", async () => {
    await passes(
      r,
      [
        'chords: note("<[d3,f3,c4,e4] [g2,f3,b3,d4] [c3,e3,b3,e4] [a2,g3,c4,d4]>").s("rhodes")',
        'chords: note("<[f3,a3,c4,e4] [f3,a3,b3,e4] [e3,g3,b3,d4] [e3,g3,b3,d4]>").s("rhodes")',
        'chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>").s("piano")',
      ],
      { bars: 4 },
    );
  });
  test("a voicing() line fails with a reason; a top voice that leaps fails", async () => {
    await fails(r, 'chords: chord("<Dm9 G13 C^9 C^9>").voicing()', /voiced by the dictionary/, { bars: 4 });
    await fails(
      r,
      'chords: note("<[d3,f3,c4,e4] [g2,f3,b3,g4] [c3,e3,b3,c4] [a2,g3,c4,a4]>").s("rhodes")',
      /leaps/,
      { bars: 4 },
    );
  });
});

describe("reharmonize devices (feature reharmonize.devices, J5.L01–L04)", () => {
  const tune = 'mel: note("<[e5 d5] c5 [d5 b4] c5>").s("piano")';
  const original = `${tune}\nchords: chord("<C^7 C^7 Dm7 G7>").voicing()`;
  const withRef = async (): Promise<Partial<RubricContext>> => {
    const ref: Normalized = await heard(original, 4);
    return { resolveReference: () => ref };
  };
  const r = (devices: string[], min: number) => ({
    rule: "reharmonize",
    melody: "mel",
    reference: { ex: "S1", bars: 4 },
    min,
    devices,
  });
  test("each device against the original's chord in its bar; min counts different devices", async () => {
    const extra = await withRef();
    await passes(r(["tritone sub"], 1), [`${tune}\nchords: chord("<C^7 C^7 [Dm7 Db7] C^7>").voicing()`], {
      extra,
    });
    await passes(r(["secondary ii–V"], 1), [`${tune}\nchords: chord("<C^7 [Em7 A7] Dm7 G7>").voicing()`], {
      extra,
    });
    await passes(
      r(["tritone sub", "secondary ii–V"], 2),
      [`${tune}\nchords: chord("<C^7 [Em7 A7] [Dm7 Db7] C^7>").voicing()`],
      {
        extra,
      },
    );
    await passes(r(["backdoor"], 1), [`${tune}\nchords: chord("<C^7 [Fm7 Bb7] C^7 G7>").voicing()`], {
      extra,
    });
  });
  test("the tune changed, no device, or the same device twice fail", async () => {
    const extra = await withRef();
    await fails(
      r(["tritone sub"], 1),
      `mel: note("<[e5 d5] c5 [d5 b4] d5>")\nchords: chord("<C^7 C^7 [Dm7 Db7] C^7>").voicing()`,
      /The tune stays as it is/,
      { extra },
    );
    await fails(r(["tritone sub"], 1), original, /none of the new chords works as tritone sub/, { extra });
    await fails(
      r(["tritone sub", "secondary ii–V"], 2),
      `${tune}\nchords: chord("<C^7 [Eb7 D7] [Dm7 Db7] C^7>").voicing()`,
      /1 different device/,
      { extra },
    );
  });
});

describe("device-count: the J5 spec's probes (gaps 1–3)", () => {
  const dc = (device: string) => ({ rule: "device-count", devices: [device], min: 1 });
  test("a chord heard only as its root is not that chord (muted chords over rootNotes)", async () => {
    const changes = '"<Dm7 Db7 C^7 C^7>"';
    await passes(dc("tritone sub"), [
      `chords: chord(${changes}).voicing()\nbass: chord(${changes}).rootNotes(2)`,
    ]);
    await fails(
      dc("tritone sub"),
      `chords: chord(${changes}).voicing().gain(0)\nbass: chord(${changes}).rootNotes(2)`,
      /tritone sub/,
    );
  });
  test("the backdoor's ♭VII is a dominant: a ♭VIImaj7 or a triad is not one", async () => {
    await passes(dc("backdoor"), [
      'chords: chord("<Fm7 Bb7 C^7 C^7>").voicing()',
      'chords: chord("<Fm6 Bb9 C^7 C^7>").voicing()',
    ]);
    await fails(dc("backdoor"), 'chords: chord("<Fm7 Bb^7 C^7 C^7>").voicing()', /backdoor/);
    await fails(dc("backdoor"), 'chords: chord("<Fm Bb C C>").voicing()', /backdoor/);
  });
  test("a secondary ii–V counts where its target arrives", async () => {
    await passes(dc("secondary ii–V"), [
      'chords: chord("<C^7 [Em7 A7] Dm7 G7>").voicing()',
      'chords: chord("<C^7 [Gm7 C7] F^7 G7>").voicing()',
    ]);
    await fails(dc("secondary ii–V"), 'chords: chord("<C^7 [Em7 A7] C^7 G7>").voicing()', /secondary ii–V/);
  });
});

describe("blues-form jazz: bar 4's ii–V of IV and bar 2 on I (J3/J4 spec)", () => {
  test("the chart @oak/theory jazzBlues teaches passes as a jazz blues", async () => {
    const F: KeySpec = { tonic: "F", mode: "major" };
    const r = { rule: "blues-form", variant: "jazz" };
    await passes(
      r,
      [
        'chords: chord("<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 [F7 D7] [Gm7 C7]>").voicing()',
        'chords: chord("<F7 F7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 [F7 D7] [Gm7 C7]>").voicing()',
        'chords: chord("<F7 Bb7 F7 F7 Bb7 Bb7 F7 [Am7 D7] Gm7 C7 [F7 D7] [Gm7 C7]>").voicing()',
      ],
      { bars: 12, key: F },
    );
    await fails(r, 'chords: chord("<F7 F7 F7 F7 Bb7 Bb7 F7 F7 C7 Bb7 F7 C7>").voicing()', /bar/, {
      bars: 12,
      key: F,
    });
  });
});

describe("carry f4: the corrections gate's LEFT wrong answers the grader can fix", () => {
  test("AS-52 (U17.L04): a 'bass' above the chords is no bass", async () => {
    const r = { rule: "bass-line", track: "bass", roots: { on: "change", minRatio: 0.75 } };
    const chords = 'chords: chord("<F Bb C F>").voicing().s("piano")';
    await passes(
      r,
      [
        `${chords}\nbass: n("<0 3 4 0>").scale("F2:major").s("ebass")`,
        `${chords}\nbass: note("<f1 bb1 c2 f2>")`,
      ],
      {
        key: { tonic: "F", mode: "major" },
      },
    );
    await fails(
      r,
      `${chords}\nbass: n("<0 3 4 0>").scale("F5:major").s("ebass")`,
      /the bass sits above the chords/,
      {
        key: { tonic: "F", mode: "major" },
      },
    );
  });
  test("AS-35 (C4): a V heard as the last 16th of a bar does not count as the V that resolves", async () => {
    const r = { rule: "contains-rn", rn: ["V"], min: 1, mustResolve: true };
    const Am: KeySpec = { tonic: "A", mode: "minor" };
    await passes(
      r,
      ['chords: chord("<Dm E Am Am>").voicing()', 'chords: chord("<Dm [G E] Am Am>").voicing()'],
      { key: Am },
    );
    await fails(r, 'chords: chord("<Dm [G@15 E] Am Am>").voicing()', /0 × V/, { key: Am });
  });
});
