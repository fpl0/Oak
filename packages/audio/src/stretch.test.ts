// The Wave 4 Transcribe engine seam (docs/design/wave4.md §3.4): the fake's clock and the drift measure the
// engine's gate is checked with. The real engine is proven in packages/audio/e2e by the audio engineer.
import { describe, expect, test } from "bun:test";
import {
  AB_DRIFT_GATE_MS,
  abDriftMs,
  fakeMasterRecorder,
  fakeStretchPlayer,
  sourceBarTimes,
} from "./stretch.ts";

const buffer = { duration: 30 } as AudioBuffer;

describe("fakeStretchPlayer", () => {
  test("source time runs at the rate; the clock maps source time to context time", async () => {
    const p = fakeStretchPlayer({ durationS: 30 });
    await p.load(buffer);
    p.setRate(0.75);
    await p.play({ at: 0, fromS: 2 });
    p.advance(4);
    expect(p.state.time).toBeCloseTo(5, 9);
    expect(p.clock.ctxTimeOf(5)).toBeCloseTo(4, 9);
    expect(p.clock.sourceTimeAt(8)).toBeCloseTo(8, 9);
    p.pause();
    p.advance(10);
    expect(p.state.time).toBeCloseTo(5, 9);
    expect(p.clock.ctxTimeOf(6)).toBeNull();
  });
  test("an A–B loop wraps; rate and pitch clamp to the engine's ranges", async () => {
    const p = fakeStretchPlayer({ durationS: 30 });
    await p.load(buffer);
    p.setLoop({ startS: 4, endS: 6 });
    await p.play({ at: 0, fromS: 4 });
    p.advance(3);
    expect(p.state.time).toBeCloseTo(5, 9);
    p.setRate(3);
    p.setSemitones(20);
    p.setCents(-80);
    expect([p.state.rate, p.state.semitones, p.state.cents]).toEqual([1.5, 12, -50]);
  });
});

describe("A/B drift (the Wave 4 gate)", () => {
  test("bar lines through the fake clock line up with a pattern at the same tempo", async () => {
    const p = fakeStretchPlayer({ durationS: 60 });
    await p.load({ duration: 60 } as AudioBuffer);
    p.setRate(0.75);
    await p.play({ at: 1, fromS: 0.5 });
    // 120 BPM in 4/4: a bar is 2 s at rate 1, 2.667 s at 0.75×; bar 1 starts at 0.5 s in the file.
    const src = sourceBarTimes(p.clock, { downbeatS: 0.5, barSec: 2 }, 0, 8);
    const mine = Array.from({ length: 9 }, (_, b) => 1 + (b * 2) / 0.75 + 0.004);
    expect(src).toHaveLength(9);
    expect(abDriftMs(src, mine)).toBeCloseTo(4, 6);
    expect(abDriftMs(src, mine)).toBeLessThan(AB_DRIFT_GATE_MS);
  });
});

describe("the fake recorder", () => {
  test("resolves an empty recording of the asked length", async () => {
    const r = await fakeMasterRecorder().record({ seconds: 8 });
    expect(r.durationS).toBe(10);
    expect(r.blob.size).toBe(0);
  });
});
