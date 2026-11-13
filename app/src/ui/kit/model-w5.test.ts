import { describe, expect, test } from "bun:test";
import {
  axisFraction,
  axisValue,
  barNumber,
  barSpanText,
  chartPath,
  chartPoints,
  chartSummary,
  controlKeyValue,
  controlPointerValue,
  frameInterval,
  gridMove,
  gridRows,
  labelWidth,
  letterTone,
  linearTicks,
  logTicks,
  type RibbonSection,
  ribbonKey,
  ribbonSpan,
  sectionName,
  snapControl,
  thinTicks,
  unitLabel,
} from "./model-w5.ts";

const VCVC: RibbonSection[] = [
  { tag: "verse", text: "Verse", letter: "A", startBar: 0, bars: 4, energy: 0.35 },
  { tag: "chorus", text: "Chorus", letter: "B", startBar: 4, bars: 4, energy: 0.8 },
  { tag: "verse2", text: "Verse 2", letter: "A", startBar: 8, bars: 4, energy: 0.4 },
  { tag: "chorus2", text: "Chorus 2", letter: "B", startBar: 12, bars: 4, energy: 0.9 },
];

describe("bar numbers (c4: count from the first full bar after a pickup)", () => {
  test("without a pickup bars are 1-based", () => {
    expect(barNumber(0)).toBe(1);
    expect(barSpanText(4, 4)).toBe("bars 5–8");
    expect(barSpanText(11, 1)).toBe("bar 12");
  });
  test("with a pickup bar 0 is the pickup and index 1 is bar 1", () => {
    expect(barNumber(0, true)).toBeNull();
    expect(barNumber(1, true)).toBe(1);
    expect(barSpanText(1, 4, true)).toBe("bars 1–4");
    expect(barSpanText(0, 1, true)).toBe("the pickup");
    expect(barSpanText(0, 2, true)).toBe("the pickup and bar 1");
    expect(barSpanText(0, 5, true)).toBe("the pickup and bars 1–4");
  });
});

describe("section ribbon", () => {
  test("span covers the sections and the given total", () => {
    expect(ribbonSpan(VCVC)).toBe(16);
    expect(ribbonSpan(VCVC, 20)).toBe(20);
    expect(ribbonSpan([], undefined)).toBe(1);
  });
  test("letters map to six part tones, wrapping", () => {
    expect([..."ABCDEFG"].map(letterTone)).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(letterTone("?")).toBe(0);
  });
  test("keys: arrows move and stop at the ends, Enter loops and stops, Escape stops", () => {
    expect(ribbonKey({ key: "ArrowRight" }, 0, 4, false)).toEqual({ kind: "move", index: 1 });
    expect(ribbonKey({ key: "ArrowRight" }, 3, 4, false)).toEqual({ kind: "move", index: 3 });
    expect(ribbonKey({ key: "ArrowLeft" }, 0, 4, false)).toEqual({ kind: "move", index: 0 });
    expect(ribbonKey({ key: "End" }, 0, 4, false)).toEqual({ kind: "move", index: 3 });
    expect(ribbonKey({ key: "Enter" }, 2, 4, false)).toEqual({ kind: "loop", index: 2 });
    expect(ribbonKey({ key: " " }, 2, 4, true)).toEqual({ kind: "stop" });
    expect(ribbonKey({ key: "Escape" }, 2, 4, false)).toEqual({ kind: "stop" });
    expect(ribbonKey({ key: "ArrowRight", metaKey: true }, 0, 4, false)).toBeNull();
    expect(ribbonKey({ key: "x" }, 0, 4, false)).toBeNull();
    expect(ribbonKey({ key: "Enter" }, 0, 0, false)).toBeNull();
  });
  test("a block's name says the section, its letter, its bars, its energy and its state", () => {
    expect(sectionName(VCVC[1] as RibbonSection)).toBe("Chorus (B), bars 5–8, energy 80 %");
    expect(sectionName(VCVC[3] as RibbonSection, false, true, true)).toBe(
      "Chorus 2 (B), bars 13–16, energy 90 %, playing now, looping",
    );
  });
});

describe("bar grid", () => {
  test("three lines of four", () => {
    expect(gridRows(12, 4)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ]);
    expect(gridRows(6, 4)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
  });
  test("arrows move a cell or a line; Home/End the line; Mod+Home/End the grid", () => {
    expect(gridMove({ key: "ArrowRight" }, 3, 12, 4)).toBe(4);
    expect(gridMove({ key: "ArrowLeft" }, 0, 12, 4)).toBe(0);
    expect(gridMove({ key: "ArrowDown" }, 5, 12, 4)).toBe(9);
    expect(gridMove({ key: "ArrowDown" }, 9, 12, 4)).toBe(9);
    expect(gridMove({ key: "ArrowUp" }, 9, 12, 4)).toBe(5);
    expect(gridMove({ key: "Home" }, 6, 12, 4)).toBe(4);
    expect(gridMove({ key: "End" }, 4, 12, 4)).toBe(7);
    expect(gridMove({ key: "End" }, 4, 6, 4)).toBe(5);
    expect(gridMove({ key: "Home", ctrlKey: true }, 9, 12, 4)).toBe(0);
    expect(gridMove({ key: "End", metaKey: true }, 1, 12, 4)).toBe(11);
    expect(gridMove({ key: "Enter" }, 1, 12, 4)).toBeNull();
    expect(gridMove({ key: "ArrowRight", altKey: true }, 1, 12, 4)).toBeNull();
  });
});

describe("line chart", () => {
  test("points sit in a 0–1 box, clamped", () => {
    expect(chartPoints([0, 0.5, 2])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ]);
    expect(chartPoints([0.3])).toEqual([[0.5, 0.3]]);
  });
  test("the path runs y downwards and the area closes to the baseline", () => {
    const pts = chartPoints([0, 1]);
    expect(chartPath(pts, 100, 50)).toBe("M 0 50 L 100 0");
    expect(chartPath(pts, 100, 50, true)).toBe("M 0 50 L 100 0 L 100 50 L 0 50 Z");
    expect(chartPath([], 100, 50)).toBe("");
  });
  test("the summary names the lowest and highest point", () => {
    expect(chartSummary([0.35, 0.8, 0.4, 0.9], ["Verse", "Chorus", "Verse 2", "Chorus 2"], "Energy")).toBe(
      "Energy: lowest 35 % at Verse, highest 90 % at Chorus 2.",
    );
    expect(chartSummary([0.5, 0.5], undefined, "Energy")).toBe("Energy: level at 50 % throughout.");
    expect(chartSummary([], undefined, "Energy")).toBe("Energy: nothing to show yet.");
  });
});

describe("axes", () => {
  const hz = { scale: "log" as const, min: 20, max: 20_000 };
  test("a log axis puts each decade at the same distance", () => {
    expect(axisFraction(20, hz)).toBe(0);
    expect(axisFraction(20_000, hz)).toBe(1);
    expect(axisFraction(200, hz)).toBeCloseTo(1 / 3, 6);
    expect(axisFraction(2000, hz)).toBeCloseTo(2 / 3, 6);
    expect(axisValue(0.5, hz)).toBeCloseTo(632.46, 1);
    expect(axisFraction(5, hz)).toBe(0);
  });
  test("a linear axis is linear and clamped", () => {
    expect(axisFraction(0.25, { scale: "linear", min: 0, max: 1 })).toBe(0.25);
    expect(axisFraction(-3, { scale: "linear", min: 0, max: 1 })).toBe(0);
    expect(axisValue(0.5, { scale: "linear", min: -60, max: 0 })).toBe(-30);
  });
  test("ticks are round numbers", () => {
    expect(linearTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(linearTicks(-60, 0, 4)).toEqual([-60, -40, -20, 0]);
    expect(linearTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(logTicks(20, 20_000)).toEqual([20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000]);
    expect(logTicks(0, 10)).toEqual([]);
  });
  test("units read the way Oak prints them", () => {
    expect(unitLabel(440, "Hz")).toBe("440 Hz");
    expect(unitLabel(1200, "Hz")).toBe("1.2 kHz");
    expect(unitLabel(20_000, "Hz")).toBe("20 kHz");
    expect(unitLabel(2000, "Hz", { compact: true })).toBe("2kHz");
    expect(unitLabel(0.25, "s")).toBe("250 ms");
    expect(unitLabel(0.005, "s")).toBe("5 ms");
    expect(unitLabel(1.5, "s")).toBe("1.5 s");
    expect(unitLabel(-12, "dB")).toBe("−12 dB");
    expect(unitLabel(0.6, "%")).toBe("60 %");
    expect(unitLabel(0.375, "")).toBe("0.375");
    expect(unitLabel(Number.NaN, "Hz")).toBe("—");
  });
  test("tick labels never overlap: the ends stay, the middle thins", () => {
    // 10 kHz and 20 kHz near the right end of a 470 px log axis.
    const pos = [0, 100, 200, 300, 400, 423, 470];
    const widths = [30, 30, 30, 30, 32, 32, 32];
    expect(thinTicks(pos, widths)).toEqual([true, true, true, true, true, false, true]);
    expect(thinTicks([0, 30, 60, 90], [30, 30, 30, 30])).toEqual([true, false, false, true]);
    expect(thinTicks([0, 40], [40, 40])).toEqual([true, false]);
    expect(thinTicks([0, 200], [40, 40])).toEqual([true, true]);
    expect(thinTicks([], [])).toEqual([]);
    expect(labelWidth("20kHz")).toBe(31);
  });
  test("reduced motion redraws at most ten times a second", () => {
    expect(frameInterval(true)).toBe(100);
    expect(frameInterval(false)).toBe(0);
  });
});

describe("control read-out", () => {
  const cutoff = { min: 20, max: 20_000, scale: "log" as const };
  const attack = { min: 0, max: 2, scale: "linear" as const, step: 0.01, fine: 0.001, coarse: 0.1 };
  test("log steps are fractions of an octave, rounded to three significant figures", () => {
    expect(controlKeyValue({ key: "ArrowUp" }, 800, cutoff)).toBe(848);
    expect(controlKeyValue({ key: "ArrowUp", shiftKey: true }, 800, cutoff)).toBe(1600);
    expect(controlKeyValue({ key: "PageDown" }, 800, cutoff)).toBe(400);
    expect(controlKeyValue({ key: "ArrowDown", altKey: true }, 800, cutoff)).toBe(789);
    expect(controlKeyValue({ key: "End" }, 800, cutoff)).toBe(20_000);
    expect(controlKeyValue({ key: "ArrowUp", shiftKey: true }, 15_000, cutoff)).toBe(20_000);
    expect(controlKeyValue({ key: "ArrowDown" }, 20, cutoff)).toBe(20);
  });
  test("a fine step never sticks on a rounded value", () => {
    const v = controlKeyValue({ key: "ArrowUp", altKey: true }, 20.1, cutoff) as number;
    expect(v).toBeGreaterThan(20.1);
  });
  test("linear steps keep to the grid", () => {
    expect(controlKeyValue({ key: "ArrowRight" }, 0.1, attack)).toBe(0.11);
    expect(controlKeyValue({ key: "ArrowRight", altKey: true }, 0.1, attack)).toBe(0.101);
    expect(controlKeyValue({ key: "ArrowLeft", shiftKey: true }, 0.05, attack)).toBe(0);
    expect(controlKeyValue({ key: "Home" }, 0.5, attack)).toBe(0);
    expect(controlKeyValue({ key: "ArrowRight", metaKey: true }, 0.5, attack)).toBeNull();
    expect(controlKeyValue({ key: "a" }, 0.5, attack)).toBeNull();
  });
  test("the pointer maps through the scale", () => {
    expect(controlPointerValue(0.5, cutoff)).toBe(632);
    expect(controlPointerValue(1, cutoff)).toBe(20_000);
    expect(controlPointerValue(0.5, attack)).toBe(1);
    expect(snapControl(0.12345, attack)).toBe(0.123);
  });
});
