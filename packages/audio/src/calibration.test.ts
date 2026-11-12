// The calibration wizard's measurements, driven by a fake clock and a scripted "world" the mic hears.
import { describe, expect, test } from "bun:test";
import type { PitchFrame } from "@oak/pitch";
import { CALIBRATION, createCalibration, quietCheckOf } from "./calibration.ts";
import { FakeContext, framesBetween } from "./fakes.test-data.ts";
import type { MicGraph, MicSession, MicState } from "./types.ts";

type World = (tc: number) => { midi: number | null; rms?: number };

function rig(world: (played: { midi: number; at: number; dur: number }[]) => World) {
  const ctx = new FakeContext();
  const played: { midi: number; at: number; dur: number }[] = [];
  const clicks: number[] = [];
  const panned: [number, number][] = [];
  let open: { frames: PitchFrame[]; subs: Set<(f: PitchFrame) => void>; closed: boolean } | null = null;
  let opens = 0;
  let state: MicState = "closed";
  const mic: MicGraph = {
    prepare: async () => {},
    async open() {
      opens++;
      state = "live";
      const s = { frames: [] as PitchFrame[], subs: new Set<(f: PitchFrame) => void>(), closed: false };
      open = s;
      const session: MicSession = {
        onFrame: (cb) => {
          s.subs.add(cb);
          return () => s.subs.delete(cb);
        },
        frames: () => [...s.frames],
        levelDb: () => -60,
        deviceId: "mic",
        sampleRate: 48000,
        close: () => {
          s.closed = true;
          state = "closed";
        },
      };
      return session;
    },
    get state() {
      return state;
    },
    subscribe: () => () => {},
    closeAll: () => {},
    dispose: () => {},
  };
  const sleep = async (ms: number) => {
    const from = ctx.currentTime;
    ctx.advance(ms / 1000);
    const s = open;
    if (s && !s.closed) {
      for (const f of framesBetween(from, ctx.currentTime, world(played))) {
        s.frames.push(f);
        for (const cb of s.subs) cb(f);
      }
    }
    await Promise.resolve();
  };
  const cal = createCalibration({
    ctx: ctx as unknown as AudioContext,
    mic,
    playClick: (at) => clicks.push(at),
    playTone: (midi, at, dur) => played.push({ midi, at, dur }),
    playPanned: (hz, pan) => panned.push([hz, pan]),
    sleep,
  });
  return { ctx, cal, played, clicks, panned, state: () => state, opens: () => opens };
}

const silent: World = () => ({ midi: null, rms: 10 ** (-62 / 20) });

describe("calibration", () => {
  test("output check plays left then right", async () => {
    const r = rig(() => silent);
    await r.cal.outputCheck();
    expect(r.panned.map(([, pan]) => pan)).toEqual([-1, 1]);
    expect(r.ctx.currentTime).toBeGreaterThan(2);
  });

  test("noise floor: median input level; the mic is closed afterwards", async () => {
    const r = rig(() => silent);
    const db = await r.cal.noiseFloor(1);
    expect(db).toBeCloseTo(-62, 3);
    expect(r.state()).toBe("closed");
    expect(r.opens()).toBe(1);
  });

  test("quiet check: a quiet room passes; humming through it is caught, not stored as the floor", async () => {
    const quiet = await rig(() => silent).cal.noiseCheck(1);
    expect(quiet.voiced).toBe(false);
    expect(quiet.floorDb).toBeCloseTo(-62, 3);
    // The learner hums C4 at −30 dBFS for the middle half of the check.
    const hum = rig(() => (tc) => (tc > 0.5 && tc < 1.0 ? { midi: 60, rms: 10 ** (-30 / 20) } : silent(tc)));
    const r = await hum.cal.noiseCheck(1.2);
    expect(r.voiced).toBe(true);
    expect(r.voicedSec).toBeGreaterThan(0.3);
    expect(hum.state()).toBe("closed");
    // A short cough is not a voice.
    const cough = quietCheckOf(
      Array.from({ length: 280 }, (_, i) => ({
        t: i * 0.0107,
        hz: i > 100 && i < 110 ? 200 : 0,
        clarity: i > 100 && i < 110 ? 0.95 : 0.1,
        rms: i > 100 && i < 110 ? 0.05 : 0.0008,
      })),
    );
    expect(cough.voiced).toBe(false);
  });

  test("bleed test: true when the mic hears the 880/1175/1568 Hz tones, false on headphones", async () => {
    const speakers = rig((played) => (tc) => {
      const p = played.find((x) => tc >= x.at + 0.03 && tc < x.at + x.dur);
      return p ? { midi: p.midi, rms: 0.02 } : { midi: null };
    });
    expect(await speakers.cal.bleedTest()).toBe(true);
    expect(speakers.played.map((p) => p.midi)).toEqual([...CALIBRATION.bleedTones]);
    const phones = rig(() => silent);
    expect(await phones.cal.bleedTest()).toBe(false);
  });

  test("tap latency: 16 clicks, median and MAD; 'high' above 120 ms", async () => {
    for (const [lat, high] of [
      [0.08, false],
      [0.21, true],
    ] as const) {
      const r = rig(() => silent);
      const progress: number[] = [];
      async function* taps() {
        // The learner taps a little after each click (the clicks are known once the step starts).
        while (r.clicks.length === 0) await Promise.resolve();
        for (const [k, c] of r.clicks.entries()) yield c + lat + (k % 2 ? 0.004 : -0.004);
      }
      const res = await r.cal.tapLatency(taps(), (i) => progress.push(i));
      expect(r.clicks.length).toBe(16);
      expect(res.taps).toBe(16);
      expect(res.latencyMs).toBeCloseTo(lat * 1000, 0);
      expect(res.jitterMs).toBeCloseTo(4, 3);
      expect(res.high).toBe(high);
      expect(progress).toEqual(Array.from({ length: 16 }, (_, i) => i));
    }
  });

  test("sing latency: the learner's 'da' starts 140 ms after each click", async () => {
    let clicks: number[] = [];
    const r = rig(() => (tc) => {
      const c = clicks.find((x) => tc >= x + 0.14 && tc < x + 0.44);
      return c === undefined ? { midi: null } : { midi: 57 };
    });
    // The clicks are scheduled at the start of the step: read them as soon as they exist.
    const p = r.cal.singLatency();
    clicks = r.clicks;
    const ms = await p;
    expect(r.clicks.length).toBe(8);
    expect(Math.abs(ms - 140)).toBeLessThan(12);
  });

  test("range sweep: lowest and highest sustained notes, comfort inside", async () => {
    const r = rig(() => (tc) => {
      const k = Math.floor((tc - 0.5) / 0.35);
      return k >= 0 && k <= 24 && (tc - 0.5) % 0.35 < 0.3 ? { midi: 45 + k } : { midi: null };
    });
    const seen: number[] = [];
    const res = await r.cal.rangeSweep((f) => seen.push(f.t));
    expect(res).toEqual({ lowMidi: 45, highMidi: 69, comfortLowMidi: 49, comfortHighMidi: 65 });
    expect(seen.length).toBeGreaterThan(100);
  });

  test("range sweep with no voice rejects", async () => {
    const r = rig(() => silent);
    await expect(r.cal.rangeSweep()).rejects.toBeInstanceOf(RangeError);
    expect(r.state()).toBe("closed");
  });

  test("pitch match: cents error of each trial, folded; NaN when nothing is sung", async () => {
    const r = rig((played) => (tc) => {
      const p = played.find((x) => tc >= x.at + x.dur + 0.35 && tc < x.at + x.dur + 2.6);
      if (!p) return { midi: null };
      if (p.midi === 64) return { midi: null };
      return { midi: p.midi - 12 + 0.2 }; // an octave down, 20 cents sharp
    });
    const errs = await r.cal.pitchMatch([57, 60, 64]);
    expect(errs[0]).toBeCloseTo(20, 3);
    expect(errs[1]).toBeCloseTo(20, 3);
    expect(Number.isNaN(errs[2])).toBe(true);
  });
});
