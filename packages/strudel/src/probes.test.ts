// Wave 5 visual probes (docs/design/wave5.md §3.4): the filter curve, the ADSR shape, the delay taps, and the fake
// scope tap. The biquad facts are the RBJ cookbook as the Web Audio spec defines BiquadFilterNode.
import { describe, expect, test } from "bun:test";
import {
  adsrCurve,
  adsrValues,
  delayTaps,
  fakeScopeTap,
  filterCurve,
  harmonicsOf,
  logFrequencies,
  probeOf,
  SYNTH_ENVELOPE_DEFAULTS,
  waveHarmonics,
} from "./probes.ts";

describe("filter curve", () => {
  test("a 12 dB lowpass: flat below, +Q dB at the cutoff, about −12 dB an octave above", () => {
    const p = { kind: "filter" as const, filter: "lpf" as const, cutoff: 1000, q: 1, slope: 12 as const };
    const [low, at, oct] = filterCurve(p, [100, 1000, 2000]);
    expect(Math.abs(low as number)).toBeLessThan(0.2);
    expect(at as number).toBeCloseTo(1, 1);
    expect(oct as number).toBeLessThan(-9);
    expect(oct as number).toBeGreaterThan(-14);
    const steep = filterCurve({ ...p, slope: 24 }, [2000])[0] as number;
    expect(steep).toBeCloseTo(2 * (oct as number), 6);
  });
  test("resonance raises the peak; a highpass mirrors it", () => {
    const flat = filterCurve(
      { kind: "filter", filter: "lpf", cutoff: 500, q: 1, slope: 12 },
      [500],
    )[0] as number;
    const res = filterCurve(
      { kind: "filter", filter: "lpf", cutoff: 500, q: 12, slope: 12 },
      [500],
    )[0] as number;
    expect(res).toBeGreaterThan(flat + 10);
    const [lo, hi] = filterCurve(
      { kind: "filter", filter: "hpf", cutoff: 1000, q: 1, slope: 12 },
      [100, 10_000],
    );
    expect(lo as number).toBeLessThan(-30);
    expect(Math.abs(hi as number)).toBeLessThan(0.5);
  });
  test("log axis", () => {
    const f = logFrequencies(4, 20, 20_000);
    expect(f[0]).toBeCloseTo(20);
    expect(f[1]).toBeCloseTo(200);
    expect(f[3]).toBeCloseTo(20_000);
  });
});

describe("ADSR", () => {
  test("superdough's resolution of what the code set", () => {
    expect(adsrValues({})).toEqual({ kind: "envelope", ...SYNTH_ENVELOPE_DEFAULTS });
    expect(adsrValues({ decay: 0.2 })).toEqual({
      kind: "envelope",
      attack: 0.001,
      decay: 0.2,
      sustain: 0.001,
      release: 0.01,
    });
    expect(adsrValues({ attack: 0.5 })).toEqual({
      kind: "envelope",
      attack: 0.5,
      decay: 0.001,
      sustain: 1,
      release: 0.01,
    });
    expect(adsrValues({ attack: 0.1, decay: 0.1, sustain: 0.5, release: 1 }).release).toBe(1);
  });
  test("the shape of a held note and of one released during the attack", () => {
    const p = adsrValues({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 });
    expect(adsrCurve(p, 1)).toEqual([
      [0, 0],
      [0.1, 1],
      [expect.closeTo(0.3, 9), 0.5],
      [1, 0.5],
      [1.4, 0],
    ] as never);
    const short = adsrCurve(p, 0.05);
    expect(short[1]).toEqual([0.05, 0.5]);
    expect(short[2]?.[1]).toBe(0);
  });
});

describe("harmonics", () => {
  test("the series of the basic waves, and partials from the code", () => {
    expect(waveHarmonics("sawtooth", 4)).toEqual([1, 0.5, 1 / 3, 0.25]);
    expect(waveHarmonics("square", 4)).toEqual([1, 0, 1 / 3, 0]);
    expect(waveHarmonics("triangle", 3)).toEqual([1, 0, 1 / 9]);
    expect(waveHarmonics("sine", 2)).toEqual([1, 0]);
    expect(waveHarmonics("piano")).toBeNull();
    expect(harmonicsOf({ s: "user", partials: [1, 0, 0.5] })).toEqual({
      kind: "harmonics",
      amplitudes: [1, 0, 0.5],
      source: "partials",
      wave: "user",
    });
    // superdough's default synth wave is a triangle.
    expect(harmonicsOf({}, 3)?.wave).toBe("triangle");
    expect(probeOf("harmonics", { s: "square" })).toMatchObject({ source: "wave", wave: "square" });
  });
});

describe("delay", () => {
  test("taps fall by the feedback each repeat", () => {
    const taps = delayTaps({ kind: "delay", wet: 0.5, time: 0.25, feedback: 0.5 });
    expect(taps.slice(0, 3)).toEqual([
      [0.25, 0.5],
      [0.5, 0.25],
      [0.75, 0.125],
    ]);
    expect(taps.at(-1)?.[1]).toBeGreaterThan(0.001);
    expect(delayTaps({ kind: "delay", wet: 0.5, time: 0.25, feedback: 2 }, { max: 4 })).toHaveLength(4);
  });
});

describe("probes from a hap's controls", () => {
  test("lpf/lpq, hpf, bpf, envelope, delay with superdough's defaults", () => {
    expect(probeOf("filter", { cutoff: 600, resonance: 8 })).toEqual({
      kind: "filter",
      filter: "lpf",
      cutoff: 600,
      q: 8,
      slope: 12,
    });
    expect(probeOf("filter", { hcutoff: 300 })).toMatchObject({ filter: "hpf", q: 1 });
    expect(probeOf("filter", { bandf: 1000, bandq: 4, ftype: "24db" })).toMatchObject({
      filter: "bpf",
      q: 4,
      slope: 24,
    });
    expect(probeOf("filter", { s: "sawtooth" })).toBeNull();
    expect(probeOf("envelope", { release: 0.5 })).toMatchObject({ release: 0.5, sustain: 1 });
    expect(probeOf("delay", { delay: 0.4 }, 0.5)).toEqual({
      kind: "delay",
      wet: 0.4,
      time: 0.375,
      feedback: 0.5,
    });
    expect(probeOf("delay", { delay: 0 })).toBeNull();
  });
});

describe("fake scope tap", () => {
  test("a sine at f0, its spectrum peak, and a settable source", () => {
    const tap = fakeScopeTap({ f0: 375, sampleRate: 48_000, fftSize: 1024 });
    const w = tap.wave();
    expect(w).toHaveLength(1024);
    expect(Math.max(...w)).toBeCloseTo(0.5, 2);
    const s = tap.spectrum();
    const peak = s.indexOf(Math.max(...s));
    expect(peak).toBe(8);
    tap.setSource({ kind: "track", label: "bass" });
    expect(tap.source).toEqual({ kind: "track", label: "bass" });
    tap.open(["scope"]);
    expect(tap.get().panels).toEqual(["scope"]);
  });
});
