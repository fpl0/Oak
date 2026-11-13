import { describe, expect, test } from "bun:test";
import {
  addTap,
  barAt,
  barLabelEvery,
  barLines,
  barsOfLoop,
  bpmFromTaps,
  clampRate,
  downbeatFromTaps,
  formatCents,
  formatRate,
  formatSemitones,
  formatTime,
  gridOf,
  loopInBars,
  loopLabel,
  loopOf,
  onBarLines,
  setLoopPoint,
  shiftLoop,
  snapLoop,
  stepBar,
  stepCents,
  stepRate,
  stepSemitones,
  TAPS_KEPT,
} from "./grid.ts";

describe("transport steps", () => {
  test("rate moves in 5 % steps inside 25–100 %", () => {
    expect(stepRate(1, -1)).toBe(0.95);
    expect(stepRate(0.75, 1)).toBe(0.8);
    expect(stepRate(1, 1)).toBe(1);
    expect(stepRate(0.25, -1)).toBe(0.25);
    expect(stepRate(0.73, -1)).toBe(0.7);
    expect(clampRate(1.5)).toBe(1);
    expect(clampRate(Number.NaN)).toBe(1);
  });
  test("semitones and cents clamp", () => {
    expect(stepSemitones(12, 1)).toBe(12);
    expect(stepSemitones(-3, -1)).toBe(-4);
    expect(stepCents(45, 1)).toBe(50);
    expect(stepCents(50, 1)).toBe(50);
    expect(stepCents(-2, -1)).toBe(-5);
  });
  test("labels", () => {
    expect(formatRate(0.75)).toBe("75 %");
    expect(formatSemitones(-2)).toBe("−2 st");
    expect(formatSemitones(3)).toBe("+3 st");
    expect(formatCents(0)).toBe("0¢");
    expect(formatCents(-15)).toBe("−15¢");
    expect(formatTime(65.25)).toBe("1:05.3");
  });
});

describe("tap tempo", () => {
  const steady = (bpm: number, from: number, n: number) =>
    Array.from({ length: n }, (_, i) => from + (i * 60) / bpm);
  test("8 steady taps give the tempo and the first tap's downbeat", () => {
    const taps = steady(96, 1.2, 8);
    expect(bpmFromTaps(taps)).toBe(96);
    expect(downbeatFromTaps(taps)).toBeCloseTo(1.2, 6);
  });
  test("one early tap barely moves the fit", () => {
    const taps = steady(120, 0.5, 8);
    taps[3] = (taps[3] as number) - 0.04;
    expect(Math.abs((bpmFromTaps(taps) as number) - 120)).toBeLessThan(1.5);
  });
  test("fewer than 3 taps say nothing; runs reset after a pause and keep the last 8", () => {
    expect(bpmFromTaps([0, 0.5])).toBeNull();
    let run: number[] = [];
    for (const t of steady(100, 0, 12)) run = addTap(run, t);
    expect(run).toHaveLength(TAPS_KEPT);
    expect(addTap(run, (run.at(-1) as number) + 5)).toHaveLength(1);
    expect(addTap([3], 2)).toEqual([2]);
  });
  test("an absurd tempo is refused", () => {
    expect(bpmFromTaps([0, 0.01, 0.02, 0.03])).toBeNull();
  });
});

describe("the bar grid", () => {
  const grid = gridOf(120, "4/4", 0.5);
  test("bars from tempo, meter and downbeat", () => {
    expect(grid).toEqual({ downbeatS: 0.5, barSec: 2 });
    expect(gridOf(90, "3/4", null)?.barSec).toBe(2);
    expect(gridOf(null, "4/4", 0)).toBeNull();
    expect(barAt(grid as never, 4.5)).toBe(2);
    expect(barLines(grid as never, 7).map((l) => l.t)).toEqual([0.5, 2.5, 4.5, 6.5]);
  });
  test("Alt+arrows step to the previous or next bar line", () => {
    const g = grid as NonNullable<typeof grid>;
    expect(stepBar(g, 3, 1, 20)).toBe(4.5);
    expect(stepBar(g, 4.5, 1, 20)).toBe(6.5);
    expect(stepBar(g, 4.51, -1, 20)).toBe(2.5);
    expect(stepBar(g, 3, -1, 20)).toBe(2.5);
    expect(stepBar(g, 0.2, -1, 20)).toBe(0.5);
    expect(stepBar(g, 19.9, 1, 20)).toBe(20);
  });
});

describe("the A–B loop", () => {
  const grid = gridOf(120, "4/4", 0);
  test("A and B in either order, inside the file", () => {
    expect(loopOf(5, 2, 10)).toEqual({ startS: 2, endS: 5 });
    expect(loopOf(9, 12, 10)).toEqual({ startS: 9, endS: 10 });
    expect(loopOf(3, 3.05, 10)).toBeNull();
  });
  test("[ and ] at the playhead", () => {
    expect(setLoopPoint(null, "A", 4, 30, grid)).toEqual({ startS: 4, endS: 6 });
    expect(setLoopPoint({ startS: 4, endS: 6 }, "B", 9, 30, grid)).toEqual({ startS: 4, endS: 9 });
    expect(setLoopPoint({ startS: 4, endS: 9 }, "A", 10, 30, grid)).toEqual({ startS: 10, endS: 12 });
    expect(setLoopPoint(null, "B", 3, 30, null)).toEqual({ startS: 0, endS: 3 });
  });
  test("Alt+arrows move a loop bar by bar, inside the material", () => {
    const g = grid as NonNullable<typeof grid>;
    expect(shiftLoop({ startS: 2, endS: 6 }, g, 1, 20)).toEqual({ startS: 4, endS: 8 });
    expect(shiftLoop({ startS: 0, endS: 2 }, g, -1, 20)).toEqual({ startS: 0, endS: 2 });
    expect(shiftLoop({ startS: 16, endS: 20 }, g, 1, 20)).toEqual({ startS: 16, endS: 20 });
    expect(shiftLoop({ startS: 1, endS: 3 }, null, 1, 20)).toEqual({ startS: 3, endS: 5 });
  });
  test("snapped to bars and named", () => {
    const g = grid as NonNullable<typeof grid>;
    expect(snapLoop({ startS: 2.1, endS: 5.9 }, g)).toEqual({ fromBar: 1, bars: 2 });
    expect(loopLabel({ startS: 2, endS: 6 }, g)).toBe("bars 2–3");
    expect(loopLabel({ startS: 2, endS: 4 }, g)).toBe("bar 2");
    expect(loopLabel(null, g)).toBe("Off");
    expect(loopLabel({ startS: 1, endS: 2.5 }, null)).toBe("0:01.0–0:02.5");
  });
  // Review: a half-beat loop read "bar 3" and moved to a whole bar on Alt+arrow.
  test("a loop inside a bar is named and moved as itself, never as its whole bar", () => {
    const g = grid as NonNullable<typeof grid>;
    const half = { startS: 4.5, endS: 4.75 }; // beat 2 of bar 3, half a beat
    expect(onBarLines(half, g)).toBe(false);
    expect(onBarLines({ startS: 4, endS: 6 }, g)).toBe(true);
    expect(loopInBars(half, g)).toEqual({ fromBar: 2.25, bars: 0.125 });
    expect(loopInBars({ startS: 4.004, endS: 7.996 }, g)).toEqual({ fromBar: 2, bars: 2 });
    expect(loopLabel(half, g)).toBe("0:04.5–0:04.8 in bar 3");
    expect(shiftLoop(half, g, 1, 20)).toEqual({ startS: 6.5, endS: 6.75 });
    expect(shiftLoop(half, g, -1, 20)).toEqual({ startS: 2.5, endS: 2.75 });
    expect(shiftLoop({ startS: 19.5, endS: 19.75 }, g, 1, 20)).toEqual({ startS: 19.5, endS: 19.75 });
  });
  test("a bar loop a few ms off its lines (bar 1 nudged after it was set) is still that bar", () => {
    const g = grid as NonNullable<typeof grid>;
    const off = { startS: 4.02, endS: 6.02 };
    expect(onBarLines(off, g)).toBe(true);
    expect(barsOfLoop(off, g)).toEqual({ fromBar: 2, bars: 1 });
    expect(loopInBars(off, g)).toEqual({ fromBar: 2, bars: 1 });
    expect(loopLabel(off, g)).toBe("bar 3");
    expect(shiftLoop(off, g, 1, 20)).toEqual({ startS: 6, endS: 8 });
  });
});

// Review: a 40-minute recording labelled every 4th of its 1200 bars, 300 numbers on top of each other.
describe("bar numbers on the waveform", () => {
  test("every bar with room, otherwise a power of two that keeps them apart", () => {
    expect(barLabelEvery(160, 8)).toBe(1);
    expect(barLabelEvery(20, 8)).toBe(1);
    expect(barLabelEvery(20, 40)).toBe(2);
    expect(barLabelEvery(8, 40)).toBe(4);
    // 40 minutes at 120 BPM fit into 1265 px: about 1 px a bar, four-digit numbers.
    expect(barLabelEvery(1265 / 1200, 1200)).toBe(64);
    expect(barLabelEvery(0, 10)).toBe(1);
  });
});
