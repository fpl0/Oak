import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  centsVsTarget,
  detect,
  HOP_SIZE,
  hzToMidi,
  median,
  midiToNoteName,
  PitchFrameAnalyzer,
  type PitchFrame,
  PitchTracker,
  WINDOW_SIZE,
} from './pitch.ts';
import { decodeWav16, SUNG_NOTES, sungSequence, tone, type Wave } from './synth.ts';

/** Run a signal through the exact worklet DSP path in 128-sample render quanta. */
function analyze(signal: Float32Array, sampleRate: number): PitchFrame[] {
  const a = new PitchFrameAnalyzer(sampleRate);
  const frames: PitchFrame[] = [];
  for (let i = 0; i + 128 <= signal.length; i += 128) a.push(signal.subarray(i, i + 128), i, (f) => frames.push(f));
  return frames;
}

const FREQS = [110, 220, 440, 660];
const RATES = [44100, 48000];
const rows: Record<string, string | number>[] = [];

describe('detect() on synthesized tones with -40 dB white noise', () => {
  for (const sampleRate of RATES) {
    for (const wave of ['sine', 'saw'] as Wave[]) {
      for (const hz of FREQS) {
        test(`${wave} ${hz} Hz @ ${sampleRate}`, () => {
          const sig = tone({ hz, seconds: 1.2, sampleRate, wave, amp: 0.5, noiseDb: -40, seed: hz });
          const frames = analyze(sig, sampleRate);
          const cents = frames.map((f) => 1200 * Math.log2(f.hz / hz));
          const voiced = frames.filter((f) => f.clarity >= 0.9).length / frames.length;
          const med = median(cents);
          const maxAbs = Math.max(...cents.map(Math.abs));
          rows.push({
            wave,
            hz,
            sampleRate,
            frames: frames.length,
            medianCents: +med.toFixed(3),
            maxAbsCents: +maxAbs.toFixed(3),
            minClarity: +Math.min(...frames.map((f) => f.clarity)).toFixed(4),
            voicedPct: +(voiced * 100).toFixed(1),
          });
          expect(Math.abs(med)).toBeLessThan(2);
          expect(maxAbs).toBeLessThan(5);
          expect(voiced).toBe(1);
        });
      }
    }
  }

  for (const sampleRate of RATES) {
    for (const hz of FREQS) {
      test(`vibrato voice ${hz} Hz (+-20 cents @ 5.5 Hz) @ ${sampleRate}`, () => {
        // 2 s = 11 full vibrato cycles, so the mean deviation is ~0
        const sig = tone({ hz, seconds: 2, sampleRate, wave: 'voice', amp: 0.5, vibratoCents: 20, vibratoHz: 5.5, noiseDb: -40, seed: hz + 1 });
        const frames = analyze(sig, sampleRate);
        const cents = frames.map((f) => 1200 * Math.log2(f.hz / hz));
        const voiced = frames.filter((f) => f.clarity >= 0.9).length / frames.length;
        const med = median(cents);
        const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
        const lo = Math.min(...cents);
        const hi = Math.max(...cents);
        // compare each frame against the true instantaneous pitch at the window centre
        const trackErr = frames.map((f) => {
          const tc = f.time - WINDOW_SIZE / 2 / sampleRate;
          const truth = 20 * Math.sin(2 * Math.PI * 5.5 * tc);
          return Math.abs(1200 * Math.log2(f.hz / hz) - truth);
        });
        rows.push({
          wave: 'voice+vib',
          hz,
          sampleRate,
          frames: frames.length,
          medianCents: +med.toFixed(3),
          maxAbsCents: `${lo.toFixed(1)}..${hi.toFixed(1)}`,
          minClarity: +Math.min(...frames.map((f) => f.clarity)).toFixed(4),
          voicedPct: +(voiced * 100).toFixed(1),
          meanCents: +mean.toFixed(3),
          maxTrackErr: +Math.max(...trackErr).toFixed(2),
        });
        expect(Math.abs(mean)).toBeLessThan(3);
        expect(lo).toBeGreaterThan(-25);
        expect(hi).toBeLessThan(25);
        expect(voiced).toBeGreaterThan(0.95);
      });
    }
  }

  test('prints the cents-error table', () => {
    console.table(rows);
    expect(rows.length).toBe(24);
  });

  test('one-shot detect() and silence gate', () => {
    const sig = tone({ hz: 440, seconds: 0.1, sampleRate: 48000 }).subarray(0, WINDOW_SIZE);
    const r = detect(sig, 48000);
    expect(Math.abs(1200 * Math.log2(r.hz / 440))).toBeLessThan(1);
    expect(r.clarity).toBeGreaterThan(0.99);
    // -60 dBFS-peak tone is below the -45 dBFS RMS gate => [0, 0]
    const quiet = tone({ hz: 440, seconds: 0.1, sampleRate: 48000, amp: 0.001 }).subarray(0, WINDOW_SIZE);
    expect(detect(quiet, 48000)).toEqual({ hz: 0, clarity: 0 });
    // -40 dBFS-peak tone (-43 dBFS RMS) passes the gate
    const soft = tone({ hz: 440, seconds: 0.1, sampleRate: 48000, amp: 0.01 }).subarray(0, WINDOW_SIZE);
    expect(detect(soft, 48000).clarity).toBeGreaterThan(0.99);
  });

  test('white noise is unvoiced (clarity < 0.9)', () => {
    // pitchy alone reports clarity 1.0 at ~sampleRate/2046 Hz for ~4% of noise frames; the minPeriods guard removes them
    const noise = tone({ hz: 440, seconds: 10, sampleRate: 48000, amp: 0, noiseDb: -20, seed: 5 });
    const frames = analyze(noise, 48000);
    const maxClarity = Math.max(...frames.map((f) => f.clarity));
    console.log('white noise max clarity:', maxClarity.toFixed(3));
    expect(maxClarity).toBeLessThan(0.9);
  });
});

describe('PitchFrameAnalyzer', () => {
  test('hop cadence and timestamps', () => {
    const frames = analyze(tone({ hz: 440, seconds: 1, sampleRate: 48000 }), 48000);
    // first frame when 2048 samples have arrived, then every 512
    expect((frames[0] as PitchFrame).time).toBeCloseTo(WINDOW_SIZE / 48000, 9);
    expect((frames[1] as PitchFrame).time - (frames[0] as PitchFrame).time).toBeCloseTo(HOP_SIZE / 48000, 9);
    expect(frames.length).toBe(Math.floor((48000 - WINDOW_SIZE) / HOP_SIZE) + 1);
    expect((frames[5] as PitchFrame).rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });
});

describe('cents / octave folding', () => {
  test('centsVsTarget', () => {
    expect(centsVsTarget(440, 440).cents).toBeCloseTo(0, 9);
    expect(centsVsTarget(220, 440).cents).toBeCloseTo(-1200, 9);
    const folded = centsVsTarget(220 * 2 ** (10 / 1200), 440, { foldOctaves: true });
    expect(folded.cents).toBeCloseTo(10, 6);
    expect(folded.octaveOffset).toBe(-1);
    const up = centsVsTarget(880 * 2 ** (-30 / 1200), 440, { foldOctaves: true });
    expect(up.cents).toBeCloseTo(-30, 6);
    expect(up.octaveOffset).toBe(1);
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(60)).toBe('C4');
    expect(hzToMidi(261.6255653)).toBeCloseTo(60, 5);
  });
});

describe('PitchTracker', () => {
  const frame = (i: number, hz: number, clarity = 0.99, rmsv = 0.2): PitchFrame => ({ time: i * (512 / 48000), hz, clarity, rms: rmsv });

  test('median-of-5 rejects a single octave error', () => {
    const t = new PitchTracker();
    const out = [440, 440, 440, 880, 440, 440].map((hz, i) => t.push(frame(i, hz)));
    for (const o of out) expect(o.midi).toBeCloseTo(69, 6);
  });

  test('clarity and rms gates', () => {
    const t = new PitchTracker();
    expect(t.push(frame(0, 440, 0.89)).voiced).toBe(false);
    expect(t.push(frame(1, 440, 0.95, 0.001)).voiced).toBe(false); // -60 dB
    expect(t.push(frame(2, 440, 0.95)).voiced).toBe(true);
  });

  test('segments a synthesized A3-C#4-E4 melody (pure pipeline, both sample rates, gapped + legato)', () => {
    for (const sr of RATES) {
      for (const legato of [false, true]) {
        const t = new PitchTracker();
        for (const f of analyze(sungSequence(sr, { legato }), sr)) t.push(f);
        const segs = t.segments();
        console.log(
          `sr=${sr} legato=${legato}:`,
          segs.map((s) => `${s.note}${s.cents >= 0 ? '+' : ''}${s.cents.toFixed(1)}c [${s.start.toFixed(3)}-${s.end.toFixed(3)}]`).join('  '),
        );
        expect(segs.map((s) => s.note)).toEqual(['A3', 'C#4', 'E4']);
        segs.forEach((s, i) => {
          const truth = SUNG_NOTES[i] as (typeof SUNG_NOTES)[number];
          expect(Math.abs(s.cents)).toBeLessThan(10);
          if (!legato) {
            // frame time = window end, so a note is first seen ~1 window after its true onset
            expect(s.start - truth.start).toBeGreaterThan(0);
            expect(s.start - truth.start).toBeLessThan(0.09);
          }
        });
      }
    }
  });

  test('the WAV fixture decodes and segments identically (16-bit quantisation)', () => {
    const { samples, sampleRate } = decodeWav16(new Uint8Array(readFileSync(join(import.meta.dir, '..', 'fixtures', 'sung-a3-cs4-e4.wav'))));
    const t = new PitchTracker();
    for (const f of analyze(samples, sampleRate)) t.push(f);
    expect(t.segments().map((s) => s.note)).toEqual(['A3', 'C#4', 'E4']);
  });
});

describe('cost', () => {
  test('findPitch cost per 2048-sample window (this machine, JSC)', () => {
    const sig = tone({ hz: 220, seconds: 0.2, sampleRate: 48000, wave: 'voice', noiseDb: -40 }).subarray(0, WINDOW_SIZE);
    for (let i = 0; i < 200; i++) detect(sig, 48000);
    const N = 2000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) detect(sig, 48000);
    const per = (performance.now() - t0) / N;
    const hopMs = (HOP_SIZE / 48000) * 1000;
    console.log(`findPitch: ${(per * 1000).toFixed(1)} us/call; hop = ${hopMs.toFixed(2)} ms => ${((per / hopMs) * 100).toFixed(2)}% of one core`);
    expect(per).toBeLessThan(2);
  });
});
