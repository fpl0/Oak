// The A/B transport on the fake stretch player and a pattern side with its own (skewed) scheduler clock: one
// musical clock, switching keeps the position, loop passes restart both sides together, the drift measure.
import { describe, expect, test } from "bun:test";
import { createAbSwitchWith, mineRateFor, sideGains } from "./ab-switch.ts";
import { FakeContext, ManualTimers } from "./fakes.test-data.ts";
import {
  AB_DRIFT_GATE_BARS,
  AB_DRIFT_GATE_MS,
  AB_DRIFT_GATE_RATE,
  abDriftMs,
  fakeStretchPlayer,
  type PatternSideLike,
  sourceBarTimes,
} from "./stretch.ts";

/** A pattern side whose scheduler starts `skewSec` after the asked time (as a real cyclist may). */
function patternSide(ctx: { currentTime: number }, cps: number, skewSec = 0.007) {
  const log: { at: number; fromBar: number; rate: number }[] = [];
  let started: { at: number; fromBar: number; rate: number } | null = null;
  const gains: number[] = [];
  const side: PatternSideLike & { log: typeof log; gains: number[]; stopped: number } = {
    log,
    gains,
    stopped: 0,
    cps: () => cps,
    async start(o) {
      started = { at: Math.max(o.at, ctx.currentTime) + skewSec, fromBar: o.fromBar, rate: o.rate };
      log.push({ ...o });
    },
    stop() {
      started = null;
      side.stopped++;
    },
    setGain: (g) => gains.push(g),
    timeOfCycle(cycle) {
      if (!started) return Number.NaN;
      return started.at + (cycle - started.fromBar) / (cps * started.rate);
    },
  };
  return side;
}

function setup(o: { cps?: number; skew?: number } = {}) {
  const ctx = new FakeContext();
  ctx.currentTime = 1;
  const timers = new ManualTimers(ctx);
  const source = fakeStretchPlayer({ durationS: 120, now: () => ctx.currentTime });
  void source.load({ duration: 120 } as AudioBuffer);
  // 96 bpm in 4/4: a bar is 2.5 s; bar 1 of the file starts at 0.8 s.
  const grid = { downbeatS: 0.8, barSec: 2.5 };
  const mine = patternSide(ctx, o.cps ?? 1 / 2.5, o.skew ?? 0.007);
  const ab = createAbSwitchWith({
    ctx,
    source,
    mine,
    grid,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return { ctx, timers, source, grid, mine, ab };
}

test("gains per side and the pattern's rate for one bar per cycle", () => {
  expect(sideGains("source")).toEqual({ source: 1, mine: 0 });
  expect(sideGains("mine")).toEqual({ source: 0, mine: 1 });
  expect(sideGains("both")).toEqual({ source: 1, mine: 1 });
  // A pattern left at cps 0.5 (120 bpm) under a 96 bpm source at 0.75×: it must run at 0.6× of its tempo.
  expect(mineRateFor(0.75, { downbeatS: 0, barSec: 2.5 }, 0.5)).toBeCloseTo(0.6, 9);
});

describe("createAbSwitch", () => {
  test("play: the pattern first, the source anchored on the pattern's own bar time; 8 bars at 0.75× drift 0", async () => {
    const { ctx, source, grid, mine, ab } = setup();
    ab.setRate(AB_DRIFT_GATE_RATE);
    await ab.play({ fromBar: 2 });
    expect(mine.log[0]).toMatchObject({ fromBar: 2, rate: 0.75 });
    expect(mine.log[0]?.at).toBeCloseTo(1.2, 9);
    // The pattern really starts 7 ms late; the source follows it, not the asked time: bar 2 sounds at 1.207 s.
    expect(source.clock.ctxTimeOf(0.8 + 2 * 2.5)).toBeCloseTo(1.207, 9);
    // A fresh start runs the stretch 0.1 s of source early (its first window fades in from silence).
    expect(source.clock.anchor?.sourceS).toBeCloseTo(0.8 + 2 * 2.5 - 0.1, 9);
    expect(source.clock.anchor?.ctxTime).toBeCloseTo(1.207 - 0.1 / 0.75, 9);
    const src = sourceBarTimes(source.clock, grid, 2, AB_DRIFT_GATE_BARS);
    const pat = Array.from({ length: AB_DRIFT_GATE_BARS + 1 }, (_, i) => mine.timeOfCycle(2 + i));
    expect(src).toHaveLength(9);
    expect(abDriftMs(src, pat)).toBeLessThan(1e-6);
    expect(abDriftMs(src, pat)).toBeLessThan(AB_DRIFT_GATE_MS);
    ctx.currentTime = 1.207 + 2.5 / 0.75;
    expect(ab.state.bar).toBeCloseTo(3, 6);
  });

  test("switching sides changes gains only: nothing restarts, the bar is kept", async () => {
    const { ctx, source, mine, ab } = setup();
    await ab.play({ fromBar: 0 });
    ctx.currentTime = 4;
    const bar = ab.state.bar;
    ab.setSide("mine");
    expect(source.state.gain).toBe(0);
    expect(mine.gains.at(-1)).toBe(1);
    ab.toggle();
    expect(ab.state.side).toBe("source");
    expect(source.state.gain).toBe(1);
    expect(mine.gains.at(-1)).toBe(0);
    ab.setSide("both");
    expect([source.state.gain, mine.gains.at(-1)]).toEqual([1, 1]);
    expect(mine.log).toHaveLength(1);
    expect(ab.state.bar).toBeCloseTo(bar, 9);
  });

  test("a loop of whole bars: each pass restarts both sides at the same context time", async () => {
    const { ctx, timers, source, mine, ab } = setup({ skew: 0 });
    ab.setLoop({ fromBar: 1, bars: 2 });
    await ab.play({ fromBar: 0 });
    // Bar 0 is outside the loop: it starts at bar 1.
    expect(mine.log[0]?.fromBar).toBe(1);
    const t0 = source.clock.ctxTimeOf(0.8 + 2.5) as number;
    const pass = 2 * 2.5;
    await timers.runTo(t0 + pass + 0.01);
    expect(mine.log).toHaveLength(2);
    expect(mine.log[1]?.at).toBeCloseTo(t0 + pass, 9);
    expect(source.clock.anchor?.ctxTime).toBeCloseTo(t0 + pass, 9);
    expect(source.clock.anchor?.sourceS).toBeCloseTo(0.8 + 2.5, 9);
    await timers.runTo(t0 + 2 * pass + 0.01);
    expect(mine.log).toHaveLength(3);
    expect(mine.log[2]?.at).toBeCloseTo(t0 + 2 * pass, 9);
    expect(ctx.currentTime).toBeGreaterThan(t0 + 2 * pass);
    ab.setLoop(null);
    await timers.runTo(t0 + 4 * pass);
    expect(mine.log).toHaveLength(3);
  });

  test("rate while playing restarts both from the bar they were at; pause keeps the bar", async () => {
    const { ctx, source, mine, ab } = setup({ skew: 0 });
    await ab.play({ fromBar: 0 });
    ctx.currentTime = (source.clock.ctxTimeOf(0.8) as number) + 2.5 * 1.5;
    ab.setRate(0.5);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(mine.stopped).toBe(1);
    expect(mine.log[1]?.fromBar).toBeCloseTo(1.5, 6);
    expect(mine.log[1]?.rate).toBeCloseTo(0.5, 9);
    expect(source.state.rate).toBe(0.5);
    ctx.currentTime += 1;
    ab.pause();
    expect(ab.state.playing).toBe(false);
    expect(ab.state.bar).toBeGreaterThan(1.5);
    expect(source.state.playing).toBe(false);
    expect(mine.stopped).toBe(2);
  });

  test("a scheduler that reports nonsense falls back to the asked time", async () => {
    const { source, ab } = setup({ skew: 50 });
    await ab.play({ fromBar: 0 });
    expect(source.clock.ctxTimeOf(0.8)).toBeCloseTo(1.2, 9);
    ab.dispose();
    await expect(ab.play()).rejects.toThrow("disposed");
  });
});
