// The sound-quality metrics against synthetic signals with known answers.
import { describe, expect, test } from "bun:test";
import {
  cents,
  fundamental,
  fundamentalShare,
  levelSpreadDb,
  loudness,
  midiToHz,
  scanClicks,
  yin,
} from "./quality.ts";

const FS = 44100;

function tone(hz: number, sec: number, harmonics: number[] = [1], amp = 0.5): Float32Array {
  const x = new Float32Array(Math.round(sec * FS));
  for (let i = 0; i < x.length; i++) {
    let v = 0;
    harmonics.forEach((a, k) => {
      v += a * Math.sin((2 * Math.PI * hz * (k + 1) * i) / FS);
    });
    x[i] = amp * v;
  }
  return x;
}
const stereo = (x: Float32Array) => ({ left: x, right: x });

describe("pitch", () => {
  test("midiToHz and cents", () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(45)).toBeCloseTo(110, 6);
    expect(cents(441, 440)).toBeCloseTo(3.93, 2);
    expect(cents(220, 440)).toBeCloseTo(-1200, 6);
  });

  test("YIN finds A4 and A2 within a cent, a harmonic-rich tone at its fundamental", () => {
    for (const hz of [440, 110, 55, 261.63]) {
      const e = fundamental(tone(hz, 1, [1, 0.6, 0.4, 0.3]), FS, 0.1);
      expect(e).not.toBeNull();
      expect(Math.abs(cents((e as { hz: number }).hz, hz))).toBeLessThan(1);
    }
  });

  test("a tone a few cents sharp reads a few cents sharp", () => {
    const hz = 440 * 2 ** (7 / 1200);
    const e = fundamental(tone(hz, 1), FS, 0.1);
    expect(cents((e as { hz: number }).hz, 440)).toBeCloseTo(7, 0);
  });

  test("a weak fundamental under a strong octave still reads at the fundamental (no octave-up error)", () => {
    const e = yin(tone(110, 1, [0.3, 1, 0.5]), FS, 4410, 3528);
    expect(Math.abs(cents((e as { hz: number }).hz, 110))).toBeLessThan(2);
  });

  test("silence has no fundamental", () => {
    expect(fundamental(new Float32Array(FS), FS, 0.1)).toBeNull();
  });
});

describe("clicks", () => {
  test("a sine cut at its peak clicks; the same sine with a 50 ms fade does not", () => {
    const n = Math.round(0.5 * FS);
    const cut = new Float32Array(FS);
    const faded = new Float32Array(FS);
    // 110 Hz: cut a quarter period in, at the waveform's peak.
    const stop = n + Math.round(FS / 110 / 4);
    for (let i = 0; i < stop; i++) cut[i] = 0.5 * Math.sin((2 * Math.PI * 110 * i) / FS);
    const fade = Math.round(0.05 * FS);
    for (let i = 0; i < n + fade; i++) {
      const g = i < n ? 1 : 1 - (i - n) / fade;
      faded[i] = 0.5 * g * Math.sin((2 * Math.PI * 110 * i) / FS);
    }
    const c = scanClicks(cut, FS, 0.05);
    const f = scanClicks(faded, FS, 0.05);
    expect(c.worstDb).toBeGreaterThan(12);
    expect(c.atSec).toBeCloseTo(stop / FS, 1);
    expect(f.worstDb).toBeLessThan(6);
  });
});

describe("loudness", () => {
  test("a 1 kHz stereo sine at −23 dBFS reads −23.0 LUFS (EBU Tech 3341 case 1)", () => {
    const amp = 10 ** (-23 / 20);
    const l = loudness(stereo(tone(1000, 3, [1], amp)), FS);
    expect(l).toBeCloseTo(-23, 1);
  });

  test("6 dB quieter reads 6 LU lower; silence is −Infinity", () => {
    const a = loudness(stereo(tone(440, 2, [1], 0.5)), FS);
    const b = loudness(stereo(tone(440, 2, [1], 0.25)), FS);
    expect(a - b).toBeCloseTo(6.02, 1);
    expect(loudness(stereo(new Float32Array(FS)), FS)).toBe(Number.NEGATIVE_INFINITY);
  });

  test("K-weighting: a 40 Hz sine reads quieter than a 1 kHz sine of the same amplitude", () => {
    expect(loudness(stereo(tone(40, 2)), FS)).toBeLessThan(loudness(stereo(tone(1000, 2)), FS) - 1);
  });
});

describe("drone metrics", () => {
  test("a steady tone has a small level spread, a decaying one a large spread", () => {
    const steady = tone(220, 2);
    const decay = tone(220, 2).map((v, i) => v * Math.exp(-i / FS / 0.4));
    expect(levelSpreadDb(steady, FS, 0.2, 1.8)).toBeLessThan(0.5);
    expect(levelSpreadDb(decay, FS, 0.2, 1.8)).toBeGreaterThan(10);
  });

  test("the fundamental's share: dominant for a triangle-like tone, small when the octave dominates", () => {
    expect(fundamentalShare(tone(220, 1, [1, 0, 1 / 9, 0, 1 / 25]), FS, 220, 0.1)).toBeGreaterThan(0.9);
    expect(fundamentalShare(tone(220, 1, [0.3, 1, 0.5]), FS, 220, 0.1)).toBeLessThan(0.1);
  });
});

describe("partialHz", () => {
  test("finds the first partial of a stretched (inharmonic) tone to a tenth of a cent", async () => {
    const { partialHz } = await import("./quality.ts");
    const f = 220 * 2 ** (3 / 1200);
    const x = new Float32Array(2 * FS);
    for (let i = 0; i < x.length; i++)
      for (let k = 1; k <= 6; k++)
        x[i] =
          (x[i] as number) + (0.5 / k) * Math.sin((2 * Math.PI * f * k * (1 + 0.002 * (k * k - 1)) * i) / FS);
    const hz = partialHz(x, FS, 220, 0.2, 1) as number;
    expect(cents(hz, 220)).toBeCloseTo(3, 1);
  });
});
