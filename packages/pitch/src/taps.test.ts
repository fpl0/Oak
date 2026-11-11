// The one rule for taps (contracts §8.4) and the tap-latency calibration.
import { describe, expect, test } from "bun:test";
import { PROFILE, TAP_TOL } from "./fixtures.test-data.ts";
import { mulberry32 } from "./synth.ts";
import { alignTaps, calibrateTapLatency, gradeTaps, tapFloorMs, tapWindowMs } from "./taps.ts";

/** Quarter notes at 120 BPM for 2 bars. */
const BEATS = Array.from({ length: 8 }, (_, k) => 1 + k * 0.5);

describe("tapWindowMs", () => {
  test("w = max(floor, clamp(0.25 × minIOI, 50, 120) × levelFactor)", () => {
    expect(tapWindowMs(500, 1, 5, PROFILE)).toBe(120);
    expect(tapWindowMs(400, 1, 5, PROFILE)).toBe(100);
    expect(tapWindowMs(100, 1, 5, PROFILE)).toBe(50);
    expect(tapWindowMs(500, 5, 5, PROFILE)).toBeCloseTo(72, 9); // 120 × 0.6
    expect(tapWindowMs(500, 3, 5, PROFILE)).toBeCloseTo(96, 9); // 120 × 0.8
    expect(tapWindowMs(250, 5, 5, PROFILE)).toBe(50); // 62.5 × 0.6 = 37.5 → floor 50
  });
  test("the floor: 70 on Bluetooth output, 80 when calibration jitter exceeds 25 ms", () => {
    expect(tapFloorMs(PROFILE)).toBe(50);
    expect(tapFloorMs({ ...PROFILE, outputKind: "bluetooth" })).toBe(70);
    expect(tapFloorMs({ ...PROFILE, tapJitterMs: 30 })).toBe(80);
    expect(tapWindowMs(250, 5, 5, { ...PROFILE, outputKind: "bluetooth" })).toBe(70);
  });
});

describe("gradeTaps", () => {
  test("exact taps: F1 1, timing 1, pass", () => {
    const r = gradeTaps(BEATS, BEATS, TAP_TOL, PROFILE);
    expect(r.f1).toBe(1);
    expect(r.timing).toBe(1);
    expect(r.score).toBe(1);
    expect(r.pass).toBe(true);
    expect(r.windowMs).toBe(120);
  });

  test("human jitter (±20 ms) passes with timing ~0.85", () => {
    const rnd = mulberry32(3);
    const taps = BEATS.map((t) => t + (rnd() * 2 - 1) * 0.02);
    const r = gradeTaps(taps, BEATS, TAP_TOL, PROFILE);
    expect(r.f1).toBe(1);
    expect(r.timing).toBeGreaterThan(0.8);
    expect(r.pass).toBe(true);
  });

  test("a missed beat and an extra tap", () => {
    const taps = [...BEATS.filter((_, k) => k !== 3), 2.25];
    const r = gradeTaps(taps, BEATS, TAP_TOL, PROFILE);
    expect(r.missed).toEqual([3]);
    expect(r.extra.length).toBe(1);
    expect(r.f1).toBeCloseTo((2 * 7) / 16, 9);
    expect(r.pass).toBe(false);
    expect(r.diagnostics.map((d) => d.id)).toContain("tap.missed");
    expect(r.diagnostics.map((d) => d.id)).toContain("tap.extra");
  });

  test("a constant 60 ms late offset: reported; forgiven at levels 1–2, not at level 3", () => {
    const taps = BEATS.map((t) => t + 0.06);
    const forgiven = gradeTaps(taps, BEATS, TAP_TOL, PROFILE, { level: 2, levels: 5 });
    expect(forgiven.offsetMs).toBeCloseTo(60, 6);
    expect(forgiven.diagnostics.find((d) => d.id === "tap.offset")).toMatchObject({
      severity: "info",
      params: { ms: 60, dir: "late" },
    });
    expect(forgiven.timing).toBeCloseTo(1, 9);
    const strict = gradeTaps(taps, BEATS, TAP_TOL, PROFILE, { level: 3, levels: 5 });
    expect(strict.diagnostics.find((d) => d.id === "tap.offset")?.severity).toBe("warn");
    expect(strict.windowMs).toBeCloseTo(96, 9);
    expect(strict.timing).toBeCloseTo(1 - 60 / 96, 6);
    const noForgive = gradeTaps(taps, BEATS, { ...TAP_TOL, forgiveOffset: false }, PROFILE);
    expect(noForgive.timing).toBeCloseTo(0.5, 6);
  });

  test("rushing is reported from the slope of the errors", () => {
    const taps = BEATS.map((t, k) => t - k * 0.008);
    const r = gradeTaps(taps, BEATS, { ...TAP_TOL, forgiveOffset: false }, PROFILE);
    expect(r.diagnostics.find((d) => d.id === "tap.rushing")?.params.ms).toBe(56);
  });

  test("free tempo: a steady 10 % faster performance aligns and reports the tempo ratio", () => {
    const taps = BEATS.map((t) => 3 + (t - 1) / 1.1);
    const locked = gradeTaps(taps, BEATS, TAP_TOL, PROFILE);
    expect(locked.pass).toBe(false);
    const free = gradeTaps(taps, BEATS, { ...TAP_TOL, tempo: "free" }, PROFILE);
    expect(free.f1).toBe(1);
    expect(free.timing).toBeGreaterThan(0.99);
    expect(free.tempoRatio).toBeCloseTo(1.1, 6);
  });

  test("a numeric window (calibration steps) is used as given", () => {
    const r = gradeTaps([1.03], [1], { ...TAP_TOL, windowMs: 40, forgiveOffset: false }, PROFILE);
    expect(r.windowMs).toBe(40);
    expect(r.timing).toBeCloseTo(0.25, 6);
  });

  test("empty input", () => {
    const r = gradeTaps([], BEATS, TAP_TOL, PROFILE);
    expect(r.f1).toBe(0);
    expect(r.pass).toBe(false);
    expect(r.missed.length).toBe(8);
  });
});

test("alignTaps is monotone and only matches inside the window", () => {
  expect(alignTaps([1, 2, 3], [1.01, 2.5, 2.99], 0.05)).toEqual([
    [0, 0],
    [2, 2],
  ]);
});

describe("calibrateTapLatency", () => {
  const clicks = Array.from({ length: 16 }, (_, k) => 2 + k * 0.6);
  test("median and MAD of (tap − click)", () => {
    const rnd = mulberry32(9);
    const taps = clicks.map((c) => c + 0.04 + (rnd() * 2 - 1) * 0.01);
    const r = calibrateTapLatency(taps, clicks);
    expect(r.latencyMs).toBeGreaterThan(35);
    expect(r.latencyMs).toBeLessThan(45);
    expect(r.jitterMs).toBeLessThan(8);
  });
  test("Bluetooth latency longer than half the click spacing, with a missed and a doubled tap", () => {
    const taps = clicks.map((c) => c + 0.32).filter((_, k) => k !== 5);
    taps.push(clicks[9] as number);
    const r = calibrateTapLatency(taps, clicks);
    expect(r.latencyMs).toBeCloseTo(320, 6);
    expect(r.jitterMs).toBeCloseTo(0, 6);
  });
  test("too few taps throw", () => {
    expect(() => calibrateTapLatency([2.04], clicks)).toThrow(RangeError);
  });
});
