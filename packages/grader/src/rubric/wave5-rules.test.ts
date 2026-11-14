// Wave 5 Foundation (docs/design/wave5.md §3.2): every rule the C3, C4, C5 and X2 rubrics of contracts §6.6 name
// has an analyzer; `bass-line` grades on the bass view; `notates` and the `controls` matcher are typed stubs.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Matcher, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { runMatcher } from "../match/index.ts";
import type { RubricContext } from "./context.ts";
import { evaluateRubric } from "./index.ts";
import { RULES } from "./rules.ts";

setDefaultTimeout(30_000);
const C = { tonic: "C", mode: "major" } as const;

const WAVE5_CAPSTONE_RULES = [
  // C3 Verse–Chorus Demo
  "form",
  "contrast",
  "duration-sec",
  "groove-lock",
  "notates",
  "bass-line",
  // C4 Minor Indie Ballad
  "progression",
  "contains-rn",
  "degree-set",
  "ends-on-degree",
  "tempo-bpm",
  // C5 12-Bar Shuffle
  "blues-form",
  "chord-qualities",
  "swing",
  "motif-reuse",
] as const;

const bassLine = (body: Record<string, unknown>): RubricRule =>
  ({
    id: "bass",
    label: "bass",
    required: true,
    skills: [],
    rule: "bass-line",
    track: "bass",
    ...body,
  }) as RubricRule;
async function row(r: RubricRule, code: string, bars: number) {
  const n = await strudel(code, bars);
  const ctx: RubricContext = { meter: "4/4", code, params: {}, bars, key: C };
  return evaluateRubric([r], n, ctx).rows[0];
}
const PIECE = `chords: chord("<C G Am F>").voicing()
bass: note("<[c2 g2 c3 f#2] [g2 d3 g3 g#2] [a2 e3 a3 g2] [f2 c3 f3 b1]>").s("sawtooth")`;

describe("Wave 5 capstone rules", () => {
  test("each has an analyzer", () => {
    for (const r of WAVE5_CAPSTONE_RULES) expect({ r, has: typeof RULES[r] }).toEqual({ r, has: "function" });
  });
  test("bass-line: roots on the changes, root–five–octave members, approach notes", async () => {
    expect((await row(bassLine({ roots: { on: "change", minRatio: 0.75 } }), PIECE, 4))?.ok).toBe(true);
    expect(
      (
        await row(
          bassLine({
            members: { allowed: ["root", "fifth", "octave", "approach"], minRatio: 0.9, each: true },
          }),
          PIECE,
          4,
        )
      )?.ok,
    ).toBe(true);
    expect((await row(bassLine({ approach: { min: 3 } }), PIECE, 4))?.ok).toBe(true);
    expect((await row(bassLine({ approach: { min: 3, kinds: ["diatonic"] } }), PIECE, 4))?.ok).toBe(false);
    const thirds = `chords: chord("<C G>").voicing()\nbass: note("<e2 b2>").s("sawtooth")`;
    expect((await row(bassLine({ roots: { on: "downbeat", minRatio: 0.75 } }), thirds, 2))?.ok).toBe(false);
  });
  test("notates: a plain lead sheet writes exactly; a line off the grid names its bars", async () => {
    const notates = {
      id: "n",
      label: "The lead sheet renders",
      required: true,
      skills: [],
      rule: "notates",
      view: "lead-sheet",
    } as RubricRule;
    const tune = `chords: chord("<C G Am F>").voicing()
mel: n("<[0 2 4 2] [1 ~ 4 ~] [2 4 5 4] [3@3 ~]>").scale("C4:major")`;
    const good = await row(notates, tune, 4);
    expect(good?.ok).toBe(true);
    // A tune pushed off the grid by an odd fraction (`.late(0.07)`) cannot be written without rounding.
    const off = await row(notates, tune.replace('.scale("C4:major")', '.scale("C4:major").late(0.07)'), 4);
    expect(off?.ok).toBe(false);
    expect(String(off?.diag?.params.detail)).toMatch(/can't be written exactly/);
    // Swung 8ths are carried by the notation ("Swing 8ths"), so a swung flavour still renders exactly.
    const swung = await row(
      notates,
      `chords: chord("<C7 F7>").voicing()\nmel: n("<[0 2 4 2 0 2 4 2] [3 5 7 5 3 5 7 5]>").scale("C4:major").swingBy(1/3, 4)`,
      2,
    );
    expect(swung?.ok).toBe(true);
  });
  test("controls: a matching filter passes, an open or far filter fails and says which way", async () => {
    const ref = await strudel('a: note("c3 e3 g3 c4").s("sawtooth").lpf(600)', 1);
    const cfg: Matcher = { m: "controls", controls: [{ control: "lpf", scale: "log", tol: 0.5 }] };
    const near = await strudel('a: note("c3 e3 g3 c4").s("sawtooth").lpf(700)', 1);
    expect(runMatcher(cfg, ref, near, { meter: "4/4" }).score).toBe(1);
    const open = await strudel('a: note("c3 e3 g3 c4").s("sawtooth")', 1);
    const m = runMatcher(cfg, ref, open, { meter: "4/4" });
    expect(m.score).toBe(0);
    expect(m.diagnostics.map((d) => d.id)).toEqual(["code.control-missing"]);
    const bright = runMatcher(cfg, ref, await strudel('a: note("c3 e3 g3 c4").s("sawtooth").lpf(3000)', 1), {
      meter: "4/4",
    });
    expect(bright.diagnostics[0]?.params.how).toMatch(/brighter than the target/);
  });
});

describe("bass-line under comping that enters after the beat (U12.L06)", () => {
  const roots = bassLine({ roots: { on: "change", minRatio: 0.75 } });
  const comp = 'chords: chord("<Dm7 G7 C^7 A7>").voicing().struct("~ x ~ ~ x ~ ~ ~")';
  test("a held root on each downbeat belongs to the chord that enters on the & of 1", async () => {
    const r = await row(roots, `${comp}\nbass: note("<d2 g2 c2 a1>").s("sawtooth")`, 4);
    expect(r?.ok).toBe(true);
  });
  test("a held wrong note is still wrong", async () => {
    const r = await row(roots, `${comp}\nbass: note("<d2 e2 c2 e2>").s("sawtooth")`, 4);
    expect(r?.ok).toBe(false);
  });
});
