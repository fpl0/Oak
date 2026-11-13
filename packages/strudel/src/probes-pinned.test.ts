// The visual probes' defaults pinned against superdough as installed (wave5.md §3.4: "the sound engineer pins them").
// What the probes draw must be what superdough plays: the same envelope resolution for every combination of set
// controls, the same delay defaults and the same synth envelope. wave5.pw.ts checks the rendered audio against
// the drawn curves; this file checks the numbers against superdough's own code.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as superdough from "superdough";
import { adsrValues, DELAY_DEFAULTS, FILTER_Q_DEFAULT, SYNTH_ENVELOPE_DEFAULTS } from "./probes.ts";

const sd = superdough as unknown as {
  getADSRValues(p: (number | undefined)[], curve?: string, defaults?: number[]): number[];
  getDefaultValue(control: string): unknown;
};
const root = dirname(createRequire(import.meta.url).resolve("superdough/package.json"));
const source = (file: string) => readFileSync(join(root, file), "utf8");

describe("probe defaults = superdough's", () => {
  test("the synth envelope defaults are the ones every superdough synth passes", () => {
    const synth = source("synth.mjs");
    const want = `[${SYNTH_ENVELOPE_DEFAULTS.attack}, ${SYNTH_ENVELOPE_DEFAULTS.decay}, ${SYNTH_ENVELOPE_DEFAULTS.sustain}, ${SYNTH_ENVELOPE_DEFAULTS.release}]`;
    expect(synth).toContain(want);
    // the basic waves (sine, triangle, square, sawtooth) are the ones registered with them
    expect(synth).toMatch(/registerSynthSounds\(\) \{\s*\[\.\.\.waveforms\]/);
  });

  test("every combination of set envelope controls resolves as superdough resolves it", () => {
    const values = [undefined, 0, 0.2, 0.8] as const;
    let n = 0;
    for (const attack of values)
      for (const decay of values)
        for (const sustain of values)
          for (const release of values) {
            const set: Record<string, number> = {};
            if (attack !== undefined) set.attack = attack;
            if (decay !== undefined) set.decay = decay;
            if (sustain !== undefined) set.sustain = sustain;
            if (release !== undefined) set.release = release;
            const p = adsrValues(set);
            const want = sd.getADSRValues([attack, decay, sustain, release], "linear", [
              SYNTH_ENVELOPE_DEFAULTS.attack,
              SYNTH_ENVELOPE_DEFAULTS.decay,
              SYNTH_ENVELOPE_DEFAULTS.sustain,
              SYNTH_ENVELOPE_DEFAULTS.release,
            ]);
            expect([p.attack, p.decay, p.sustain, p.release], JSON.stringify(set)).toEqual(want);
            n++;
          }
    expect(n).toBe(256);
  });

  test("the delay defaults: feedback 0.5, a 3/16-cycle time, feedback clamped at 0.98", () => {
    expect(sd.getDefaultValue("delayfeedback")).toBe(DELAY_DEFAULTS.feedback);
    expect(sd.getDefaultValue("delaysync")).toBe(DELAY_DEFAULTS.syncCycles);
    expect(source("superdough.mjs")).toContain(
      `delayfeedback = clamp(delayfeedback, 0, ${DELAY_DEFAULTS.maxFeedback})`,
    );
    // A1.L04: the left-out delay time at 100 BPM in 4/4 is 0.45 s
    expect(DELAY_DEFAULTS.syncCycles / (100 / 240)).toBeCloseTo(0.45, 10);
  });

  test("the filter's Q defaults to 1 (createFilter), and the filter envelope is in octaves above the cutoff", () => {
    const helpers = source("helpers.mjs");
    expect(helpers).toMatch(new RegExp(`q = ${FILTER_Q_DEFAULT},`));
    expect(helpers).toContain("let max = clamp(2 ** (envAbs - offset) * frequency, 0, 20000);");
  });
});
