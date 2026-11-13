import { describe, expect, test } from "bun:test";
import { harmonicLevels, spectrumBands, steadyWave, triggerIndex } from "./scope.ts";

const sine = (n: number, period: number, phase = 0) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / period + phase));

describe("scope", () => {
  test("triggers on a rising zero crossing so a held note stands still", () => {
    const w = sine(256, 32, Math.PI / 2);
    const i = triggerIndex(w);
    expect(w[i - 1] as number).toBeLessThan(0);
    expect(w[i] as number).toBeGreaterThanOrEqual(0);
    const a = steadyWave(sine(256, 32, 0.3), 64);
    const b = steadyWave(sine(256, 32, 2.1), 64);
    expect(Math.abs((a[10] as number) - (b[10] as number))).toBeLessThan(0.2);
    expect(triggerIndex(new Float32Array(16).fill(1))).toBe(0);
  });
});

describe("spectrum", () => {
  const rate = 48_000;
  const bins = 1024;
  const spec = new Float32Array(bins).fill(-120);
  // A saw-like series on 375 Hz (bin 16 at 23.4375 Hz a bin): harmonic k at −6·log2(k) dB.
  for (let k = 1; k <= 8; k++) spec[16 * k] = k === 1 ? 0 : -6 * Math.log2(k);
  test("harmonic levels of a known fundamental", () => {
    const h = harmonicLevels(spec, rate, 375, 4);
    expect(h).toEqual([0, -6, expect.closeTo(-9.51, 2), -12] as never);
    expect(harmonicLevels(spec, rate, 20_000, 2)[1]).toBeNull();
  });
  test("log bands carry the loudest bin", () => {
    const bands = spectrumBands(spec, rate, { bands: 10, minHz: 100, maxHz: 10_000 });
    expect(bands).toHaveLength(10);
    const at375 = bands.find((b) => b.lowHz <= 375 && b.highHz > 375);
    expect(at375?.db).toBe(0);
    expect(bands[0]?.db).toBe(-100);
  });
});
