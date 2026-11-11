// The detector and the worklet ring buffer on synthesized tones (ported from spike S5, extended).
import { describe, expect, test } from "bun:test";
import { createDetector, PitchFrameAnalyzer } from "./detector.ts";
import { analyze } from "./fixtures.test-data.ts";
import { dbToRms, median, rmsDb, rmsOf } from "./math.ts";
import { concat, decodeWav16, encodeWav16, silence, tone, type Wave } from "./synth.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

describe("detect() through the worklet path, −40 dB white noise added", () => {
  for (const sampleRate of [44100, 48000]) {
    for (const wave of ["sine", "saw", "voice"] as Wave[]) {
      for (const hz of [82.41, 110, 220, 440, 660, 880]) {
        test(`${wave} ${hz} Hz @ ${sampleRate}`, () => {
          const sig = tone({
            hz,
            seconds: 0.8,
            sampleRate,
            wave,
            amp: 0.5,
            noiseDb: -40,
            seed: Math.round(hz),
          });
          const frames = analyze(sig, sampleRate);
          const c = frames.map((f) => cents(f.hz, hz));
          expect(frames.every((f) => f.clarity >= 0.9)).toBe(true);
          expect(Math.abs(median(c))).toBeLessThan(2);
          expect(Math.max(...c.map(Math.abs))).toBeLessThan(5);
        });
      }
    }
  }

  test("vibrato (±20¢ at 5.5 Hz) is followed at the window centre, not smeared", () => {
    const sr = 48000;
    const sig = tone({
      hz: 220,
      seconds: 2,
      sampleRate: sr,
      wave: "voice",
      amp: 0.5,
      vibratoCents: 20,
      noiseDb: -40,
    });
    const frames = analyze(sig, sr);
    const err = frames.map((f) => {
      const tc = f.t - WINDOW_SIZE / 2 / sr;
      return Math.abs(cents(f.hz, 220) - 20 * Math.sin(2 * Math.PI * 5.5 * tc));
    });
    expect(Math.max(...err)).toBeLessThan(3);
    const c = frames.map((f) => cents(f.hz, 220));
    expect(Math.min(...c)).toBeLessThan(-15);
    expect(Math.max(...c)).toBeGreaterThan(15);
  });
});

describe("gates", () => {
  test("the RMS gate uses the amplitude convention: −60 dBFS is rejected, −43 dBFS passes", () => {
    const det = createDetector();
    const quiet = tone({ hz: 440, seconds: 0.1, sampleRate: 48000, amp: 0.001 }).subarray(0, WINDOW_SIZE);
    expect(det.detect(quiet, 48000)).toEqual({ hz: 0, clarity: 0 });
    const soft = tone({ hz: 440, seconds: 0.1, sampleRate: 48000, amp: 0.01 }).subarray(0, WINDOW_SIZE);
    expect(det.detect(soft, 48000).clarity).toBeGreaterThan(0.99);
    // A custom gate: −30 dBFS rejects the −43 dBFS tone.
    expect(createDetector({ minVolumeDb: -30 }).detect(soft, 48000)).toEqual({ hz: 0, clarity: 0 });
  });

  test("white and low-lag noise never pass as voiced (the minPeriods guard)", () => {
    for (const sr of [44100, 48000]) {
      const noise = silence(8, sr, -20, 5);
      const frames = analyze(noise, sr);
      expect(frames.filter((f) => f.clarity >= 0.9).length).toBe(0);
      // Without the guard pitchy reports ~sampleRate/2046 Hz at clarity ≥ 0.9 for a few % of frames.
      const raw = createDetector({ minPeriods: 0 });
      let lowLag = 0;
      for (let i = 0; i + WINDOW_SIZE <= noise.length; i += HOP_SIZE * 4) {
        const r = raw.detect(noise.subarray(i, i + WINDOW_SIZE), sr);
        if (r.clarity >= 0.9 && r.hz < (2 * sr) / WINDOW_SIZE) lowLag++;
      }
      expect(lowLag).toBeGreaterThan(0);
    }
  });

  test("10 dB SNR still tracks; lower SNRs fail closed (unvoiced), never wrong", () => {
    const sr = 48000;
    const level = rmsDb(rmsOf(tone({ hz: 220, seconds: 1, sampleRate: sr, wave: "voice", amp: 0.3 })));
    const at = (snr: number) =>
      analyze(
        tone({ hz: 220, seconds: 1, sampleRate: sr, wave: "voice", amp: 0.3, noiseDb: level - snr }),
        sr,
      ).filter((f) => f.clarity >= 0.9);
    const ten = at(10);
    expect(ten.length).toBeGreaterThan(50);
    expect(Math.abs(median(ten.map((f) => cents(f.hz, 220))))).toBeLessThan(5);
    for (const snr of [5, 0]) {
      for (const f of at(snr)) expect(Math.abs(cents(f.hz, 220))).toBeLessThan(50);
    }
  });
});

describe("PitchFrameAnalyzer", () => {
  test("one frame per hop once a full window has arrived; t is the time of the window's last sample", () => {
    const sr = 48000;
    const a = new PitchFrameAnalyzer(sr);
    const sig = tone({ hz: 440, seconds: 0.5, sampleRate: sr });
    const t0 = 10;
    const out = [];
    for (let i = 0; i + 128 <= sig.length; i += 128)
      out.push(...a.push(sig.subarray(i, i + 128), t0 + i / sr));
    expect(out[0]?.t).toBeCloseTo(t0 + WINDOW_SIZE / sr, 9);
    expect((out[1]?.t ?? 0) - (out[0]?.t ?? 0)).toBeCloseTo(HOP_SIZE / sr, 9);
    expect(out.length).toBe(Math.floor((Math.floor(sig.length / 128) * 128 - WINDOW_SIZE) / HOP_SIZE) + 1);
    expect(out[0]?.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  test("reset() empties the ring: the first frame after it never holds old audio", () => {
    const sr = 48000;
    const a = new PitchFrameAnalyzer(sr, { warmUp: 4 });
    const loud = tone({ hz: 440, seconds: 0.2, sampleRate: sr });
    for (let i = 0; i + 128 <= loud.length; i += 128) a.push(loud.subarray(i, i + 128), i / sr);
    a.reset();
    const next = tone({ hz: 330, seconds: 0.2, sampleRate: sr });
    const out = [];
    for (let i = 0; i + 128 <= next.length; i += 128)
      out.push(...a.push(next.subarray(i, i + 128), 1 + i / sr));
    expect(out[0]?.t).toBeCloseTo(1 + WINDOW_SIZE / sr, 9);
    for (const f of out) expect(Math.abs(cents(f.hz, 330))).toBeLessThan(1);
  });

  test("warm-up does not touch the ring", () => {
    const a = new PitchFrameAnalyzer(48000);
    a.warmUp(3);
    const quiet = new Float32Array(WINDOW_SIZE);
    const out = a.push(quiet, 0);
    expect(out.length).toBe(1);
    expect(out[0]?.rms).toBe(0);
    expect(out[0]?.hz).toBe(0);
  });

  test("rejects a bad sample rate", () => {
    expect(() => new PitchFrameAnalyzer(0)).toThrow(RangeError);
  });
});

test("WAV encode/decode round-trips at 16 bit", () => {
  const sig = concat([tone({ hz: 440, seconds: 0.05, sampleRate: 48000 }), silence(0.01, 48000)]);
  const { samples, sampleRate } = decodeWav16(encodeWav16(sig, 48000));
  expect(sampleRate).toBe(48000);
  expect(samples.length).toBe(sig.length);
  let maxErr = 0;
  for (let i = 0; i < sig.length; i++)
    maxErr = Math.max(maxErr, Math.abs((samples[i] as number) - (sig[i] as number)));
  expect(maxErr).toBeLessThan(dbToRms(-80));
});
