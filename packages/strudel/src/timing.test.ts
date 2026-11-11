// The transport's time mapping against Strudel's own Cyclist formula, and the audibility metrics.
import { describe, expect, test } from "bun:test";
import {
  balance,
  db,
  diffRms,
  isAudible,
  isAudibleSpectral,
  isAudibleWidth,
  rms,
  sideRatio,
  spectralDiffDb,
} from "./audibility/metrics.ts";
import { type CyclistLike, cycleAtTime, timeOfCycleFor } from "./transport.ts";

const cyclist = (over: Partial<CyclistLike> = {}): CyclistLike => ({
  started: true,
  cps: 0.5,
  latency: 0.1,
  now: () => 3.2,
  setCps: () => {},
  num_cycles_at_cps_change: 2,
  seconds_at_cps_change: 10,
  num_ticks_since_cps_change: 5,
  ...over,
});

describe("transport time", () => {
  test("cycle c sounds at (c − c0)/cps + s0 + latency, and cycleAtTime inverts it", () => {
    const s = cyclist();
    expect(timeOfCycleFor(s, 4, 0)).toBeCloseTo((4 - 2) / 0.5 + 10 + 0.1);
    for (const c of [2, 3.25, 7.5]) expect(cycleAtTime(s, timeOfCycleFor(s, c, 0), 0)).toBeCloseTo(c);
  });
  test("stopped or right after a tempo change: estimate from now", () => {
    const s = cyclist({ started: false, now: () => 0 });
    expect(timeOfCycleFor(s, 1, 5)).toBeCloseTo(5 + 0.1 + 2);
    const fresh = cyclist({ num_ticks_since_cps_change: 0 });
    expect(timeOfCycleFor(fresh, 4.2, 20)).toBeCloseTo(20 + 0.1 + (4.2 - 3.2) / 0.5);
  });
});

describe("audibility metrics", () => {
  const sine = (f: number, amp = 0.5, n = 16384, pan = 0) => {
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = amp * Math.sin((2 * Math.PI * f * i) / 44100);
      left[i] = x * (1 - pan);
      right[i] = x * (1 + pan);
    }
    return { left, right };
  };
  test("identical renders are −Infinity dB apart; half the amplitude is −6 dB", () => {
    const a = sine(440);
    expect(db(diffRms(a, sine(440)) / rms(a))).toBe(Number.NEGATIVE_INFINITY);
    expect(db(diffRms(a, sine(440, 0.25)) / rms(a))).toBeCloseTo(-6.02, 1);
    expect(isAudible(-6, Number.NEGATIVE_INFINITY)).toBe(true);
    expect(isAudible(-50, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isAudible(2, 1)).toBe(false); // inside its own run-to-run noise
  });
  test("spectrum ignores phase; width sees panning", () => {
    const a = sine(440);
    const shifted = { left: a.left.slice(10), right: a.right.slice(10) };
    expect(
      spectralDiffDb({ left: a.left.slice(0, -10), right: a.right.slice(0, -10) }, shifted),
    ).toBeLessThan(-20);
    expect(spectralDiffDb(a, sine(880))).toBeGreaterThan(-3);
    expect(isAudibleSpectral(-7, -12)).toBe(true);
    expect(sideRatio(a)).toBe(0);
    expect(sideRatio(sine(440, 0.5, 16384, 1))).toBeCloseTo(1);
    expect(balance(sine(440, 0.5, 16384, 1))).toBeCloseTo(1);
    expect(isAudibleWidth(0.3, 0, 0.01)).toBe(true);
    expect(isAudibleWidth(0.3, 0.33, 0.29)).toBe(false);
  });
});
