// The `controls` matcher ("match this sound", A1.L02–L04): the sound controls of the learner's code against the
// hidden reference's, event by event, each within its tolerance; a control left out plays superdough's default.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Matcher } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { adsrValues, controlValue, filterEnvelopeValues, withinTolerance } from "./controls.ts";
import { runMatcher } from "./index.ts";

setDefaultTimeout(30_000);
const NOTES = 'note("c3 eb3 g3 c4").s("sawtooth")';
const m = (...controls: [string, "linear" | "log" | "exact", number][]): Matcher => ({
  m: "controls",
  controls: controls.map(([control, scale, tol]) => ({ control, scale, tol })),
});
async function score(matcher: Matcher, ref: string, answer: string) {
  const r = runMatcher(matcher, await strudel(`a: ${ref}`, 1), await strudel(`a: ${answer}`, 1), {
    meter: "4/4",
  });
  return { score: r.score, texts: r.diagnostics.map((d) => renderFeedback(d)) };
}

describe("controls: A1's match-this-sound steps", () => {
  test("filters (A1.L02): log tolerance in octaves; a missing .lpf() is fully open and a miss", async () => {
    const lpf = m(["lpf", "log", 0.5]);
    expect((await score(lpf, `${NOTES}.lpf(800)`, `${NOTES}.lpf(1000)`)).score).toBe(1);
    expect((await score(lpf, `${NOTES}.lpf(800)`, `${NOTES}.lpf(2000)`)).texts).toEqual([
      "`.lpf()`: yours is brighter than the target: bring it down.",
    ]);
    expect((await score(lpf, `${NOTES}.lpf(800)`, `${NOTES}.lpf(200)`)).texts).toEqual([
      "`.lpf()`: yours is darker than the target: open it up.",
    ]);
    const open = await score(lpf, `${NOTES}.lpf(800)`, NOTES);
    expect(open.score).toBe(0);
    expect(open.texts[0]).toContain("The target sound uses `.lpf()`; yours leaves it out");
    // .hpf and resonance read their own keys; the default resonance is 1.
    expect(
      (
        await score(
          m(["hpf", "log", 0.5], ["lpq", "linear", 2]),
          `${NOTES}.hpf(400).lpq(1)`,
          `${NOTES}.hpf(500)`,
        )
      ).score,
    ).toBe(1);
  });
  test("envelopes (A1.L03): superdough's dependent defaults, so .decay(.2) alone matches a decay-only target", async () => {
    const env = m(
      ["attack", "linear", 0.05],
      ["decay", "linear", 0.05],
      ["sustain", "linear", 0.1],
      ["release", "linear", 0.1],
    );
    expect((await score(env, `${NOTES}.decay(.2).sustain(0)`, `${NOTES}.decay(.2)`)).score).toBe(1);
    const slow = await score(env, `${NOTES}.attack(.01).release(.1)`, `${NOTES}.attack(.5).release(.1)`);
    expect(slow.score).toBe(0.75);
    expect(slow.texts).toEqual(["`.attack()`: yours is slower to start than the target: shorten it."]);
    expect(adsrValues({})).toEqual({ attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01 });
    expect(adsrValues({ decay: 0.2 })).toEqual({ attack: 0.001, decay: 0.2, sustain: 0.001, release: 0.01 });
    expect(adsrValues({ attack: 0.3 }).sustain).toBe(1);
  });
  test("space (A1.L04): room, roomsize, delay time and feedback; exact wave names", async () => {
    const space = m(
      ["room", "linear", 0.15],
      ["delaytime", "linear", 0.05],
      ["delayfeedback", "linear", 0.1],
    );
    const ref = `${NOTES}.room(.5).delay(.5).delaytime(.25).delayfeedback(.6)`;
    expect(
      (await score(space, ref, `${NOTES}.room(.6).delay(.5).delaytime(.25).delayfeedback(.55)`)).score,
    ).toBe(1);
    const dry = await score(space, ref, `${NOTES}.delay(.5).delaytime(.25).delayfeedback(.6)`);
    expect(dry.texts).toEqual([
      "The target sound uses `.room()`; yours leaves it out, so it plays at Strudel's default. Add it and listen again.",
    ]);
    const wave = m(["s", "exact", 0]);
    expect((await score(wave, NOTES, NOTES.replace("sawtooth", "square"))).texts).toEqual([
      "`.s()`: yours is not the sound of the target: try another one.",
    ]);
  });
  test("tolerances and defaults, unit by unit", () => {
    expect(withinTolerance(1000, 800, { scale: "log", tol: 0.5 })).toBe(true);
    expect(withinTolerance(1200, 800, { scale: "log", tol: 0.5 })).toBe(false);
    expect(withinTolerance(0.45, 0.4, { scale: "linear", tol: 0.1 })).toBe(true);
    expect(withinTolerance("square", "square", { scale: "exact", tol: 0 })).toBe(true);
    const bare = {
      id: "x",
      track: "a",
      onset: [0, 1],
      dur: [1, 4],
      midi: 48,
      pitchSource: "note-str",
      gain: 0.8,
      locs: [],
    } as const;
    expect(controlValue({ ...bare, onset: [0, 1], dur: [1, 4], locs: [] }, "cutoff", 0.5)).toBe(20_000);
    // A left-out delay time is 3/16 of a cycle, in seconds (at 0.5 cycles a second: 0.375 s).
    expect(controlValue({ ...bare, onset: [0, 1], dur: [1, 4], locs: [] }, "delaytime", 0.5)).toBe(0.375);
    expect(controlValue({ ...bare, onset: [0, 1], dur: [1, 4], locs: [] }, "s", 0.5)).toBe("triangle");
  });
  test("notes and rhythm are given: a different note count lowers the score by coverage only", async () => {
    const r = await score(
      m(["lpf", "log", 0.5]),
      `${NOTES}.lpf(800)`,
      'note("c3 eb3").s("sawtooth").lpf(800)',
    );
    expect(r.score).toBe(0.5);
  });
});

describe("the defaults agree with @oak/strudel/probes (the panel draws what the grader grades)", () => {
  test("envelope, delay and filter defaults, and adsrValues for every set of envelope controls", async () => {
    // Imported by a computed path: the probes module re-exports DOM types this package's build cannot see.
    const probesPath = new URL("../../../strudel/src/probes.ts", import.meta.url).pathname;
    const probes = (await import(probesPath)) as {
      SYNTH_ENVELOPE_DEFAULTS: Record<string, number>;
      adsrValues: (s: Record<string, number>) => Record<string, number>;
    };
    expect(adsrValues({})).toEqual({ ...probes.SYNTH_ENVELOPE_DEFAULTS } as never);
    const keys = ["attack", "decay", "sustain", "release"] as const;
    const values = { attack: 0.2, decay: 0.3, sustain: 0.4, release: 0.5 };
    for (let mask = 0; mask < 16; mask++) {
      const set = Object.fromEntries(keys.filter((_, i) => mask & (1 << i)).map((k) => [k, values[k]]));
      const { kind: _kind, ...panel } = probes.adsrValues(set);
      expect([mask, adsrValues(set)]).toEqual([mask, panel as never]);
    }
    const n = await strudel('a: note("c3").s("sawtooth").delay(.5)', 1);
    const e = n.all[0] as Parameters<typeof controlValue>[0];
    // A missing delay time is 3/16 of a cycle (superdough's delaysync), at 0.5 cps 0.375 s.
    expect(controlValue(e, "delaytime", 0.5)).toBeCloseTo(0.375, 9);
  });
});

describe("d6: a control the answer leaves out is compared at superdough's default", () => {
  test("A1.L02 S6: .lpenv(4) without .lpd() sweeps for 0.14 s, inside a 0.1 tolerance of the target's 0.2", async () => {
    const env = m(["lpenv", "linear", 1], ["lpd", "linear", 0.1]);
    const target = `${NOTES}.lpf(400).lpenv(4).lpd(.2)`;
    expect((await score(env, target, `${NOTES}.lpf(400).lpenv(4)`)).score).toBe(1);
    expect((await score(env, target, `${NOTES}.lpf(400).lpenv(4).lpd(.2)`)).score).toBe(1);
    // A decay far from the target is off, and says which way; it is not "left out".
    expect((await score(env, target, `${NOTES}.lpf(400).lpenv(4).lpd(.6)`)).texts).toEqual([
      "`.lpd()`: yours is not like the target yet.",
    ]);
    // No filter envelope at all: both controls are missing.
    const none = await score(env, target, `${NOTES}.lpf(400)`);
    expect(none.score).toBe(0);
    expect(none.texts.some((t) => t.includes("The target sound uses `.lpd()`; yours leaves it out"))).toBe(
      true,
    );
  });
  test("the filter envelope's values as superdough plays them", () => {
    expect(filterEnvelopeValues({})).toBeNull();
    expect(filterEnvelopeValues({ lpenv: 4 })).toEqual({
      lpattack: 0.005,
      lpdecay: 0.14,
      lpsustain: 0,
      lprelease: 0.1,
    });
    // One time set: the others fall to the minimum, as the amplitude envelope's do (`getADSRValues`).
    expect(filterEnvelopeValues({ lpenv: 4, lpdecay: 0.3 })).toEqual({
      lpattack: 0.001,
      lpdecay: 0.3,
      lpsustain: 0.001,
      lprelease: 0.01,
    });
    expect(filterEnvelopeValues({ lpattack: 0.2 })?.lpsustain).toBe(1);
  });
});
