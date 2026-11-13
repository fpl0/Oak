// Wave 5 (U11.L07): a shuffle tapped against a click — graded by the §8.4 rule, its swing measured.
import { describe, expect, test } from "bun:test";
import { PROFILE, TAP_TOL } from "./fixtures.test-data.ts";
import {
  feelWord,
  gradeSwingTaps,
  measureTapSwing,
  offbeatOf,
  ratioOfAmount,
  ratioText,
  swungTargets,
  tapSwingClass,
} from "./swing-taps.ts";
import { mulberry32 } from "./synth.ts";

const BPM = 112;
const BEAT = 60 / BPM;
const GRID = { downbeat: 2, bpm: BPM, slots: 8, amount: 1 / 3 };

/** Taps with the off-beat at fraction `p` of each beat, plus a closing downbeat; jitter ±`jitterMs`, offset. */
function take(
  p: number,
  o: { jitterMs?: number; offsetMs?: number; slots?: number; seed?: number } = {},
): number[] {
  const rand = mulberry32(o.seed ?? 3);
  const j = () => (((rand() * 2 - 1) * (o.jitterMs ?? 0)) / 1000) as number;
  const off = (o.offsetMs ?? 0) / 1000;
  const out: number[] = [];
  const slots = o.slots ?? 8;
  for (let k = 0; k < slots; k++) {
    const t = GRID.downbeat + k * BEAT + off;
    out.push(t + j(), t + p * BEAT + j());
  }
  out.push(GRID.downbeat + slots * BEAT + off + j());
  return out;
}

describe("the swung grid", () => {
  test("targets: on-beat and off-beat at (1 + amount) / 2 of each beat", () => {
    const t = swungTargets({ ...GRID, slots: 2 });
    expect(t[0]).toBe(2);
    expect(t[1]).toBeCloseTo(2 + (2 / 3) * BEAT, 12);
    expect(t[2]).toBeCloseTo(2 + BEAT, 12);
    expect(offbeatOf(0)).toBe(0.5);
    expect(ratioOfAmount(1 / 3)).toBeCloseTo(2, 12);
    expect(ratioOfAmount(0)).toBe(1);
    // 16th swing: the slot is half a beat.
    const s16 = swungTargets({ ...GRID, slots: 1, subdivision: 16 });
    expect(s16[1]).toBeCloseTo(2 + (2 / 3) * (BEAT / 2), 12);
  });

  test("classes match the grader's swingClass", () => {
    expect([1, 1.3, 2, 3].map(tapSwingClass)).toEqual(["straight", "light", "triplet", "hard"]);
    expect(ratioText(2.04)).toBe("2:1");
    expect(ratioText(Number.NaN)).toBe("–");
    expect(feelWord("triplet")).toBe("swung (long–short)");
  });
});

describe("measureTapSwing", () => {
  test("a clean shuffle measures 2:1", () => {
    const m = measureTapSwing(take(2 / 3), GRID);
    expect(m.n).toBe(8);
    expect(m.ratio).toBeCloseTo(2, 6);
    expect(m.amount).toBeCloseTo(1 / 3, 6);
    expect(m.cls).toBe("triplet");
  });

  test("straight eighths measure 1:1; a hard swing 3:1", () => {
    expect(measureTapSwing(take(0.5), GRID).cls).toBe("straight");
    const hard = measureTapSwing(take(0.75), GRID);
    expect(hard.ratio).toBeCloseTo(3, 6);
    expect(hard.cls).toBe("hard");
  });

  test("measured between the learner's own beats: a constant 60 ms lateness and a slow drag do not change it", () => {
    const late = measureTapSwing(take(2 / 3, { offsetMs: 60 }), GRID);
    expect(late.ratio).toBeCloseTo(2, 6);
    // Each beat 2 % longer than the click's (dragging): p stays 2/3 of the learner's own beat.
    const drag: number[] = [];
    let t = GRID.downbeat;
    for (let k = 0; k <= 8; k++) {
      const beat = BEAT * (1 + 0.02 * k);
      drag.push(t);
      if (k < 8) drag.push(t + (2 / 3) * beat);
      t += beat;
    }
    expect(measureTapSwing(drag, GRID).ratio).toBeCloseTo(2, 6);
  });

  test("slots with a missing or doubled off-beat are not measured; nothing measurable is NaN", () => {
    const taps = take(2 / 3).filter((_, i) => i !== 3);
    taps.push(GRID.downbeat + 5 * BEAT + 0.4 * BEAT);
    const m = measureTapSwing(taps, GRID);
    expect(m.n).toBe(6);
    expect(m.perSlot.map((s) => s.slot)).toEqual([0, 2, 3, 4, 6, 7]);
    const quarters = measureTapSwing(
      Array.from({ length: 9 }, (_, k) => GRID.downbeat + k * BEAT),
      GRID,
    );
    expect(quarters.n).toBe(0);
    expect(Number.isNaN(quarters.ratio)).toBe(true);
    expect(quarters.cls).toBeNull();
  });
});

describe("gradeSwingTaps (§8.4 rule, measured feel)", () => {
  test("a shuffle tapped with human jitter passes, measures about 2:1 and the feel is right", () => {
    const r = gradeSwingTaps(take(2 / 3, { jitterMs: 15 }), GRID, TAP_TOL, PROFILE);
    expect(r.pass).toBe(true);
    expect(r.swing.ratio).toBeGreaterThan(1.8);
    expect(r.swing.ratio).toBeLessThan(2.25);
    expect(r.swing.feelOk).toBe(true);
    expect(r.swing.targetRatio).toBeCloseTo(2, 9);
    const d = r.diagnostics.find((x) => x.id === "tap.swing");
    expect(d?.severity).toBe("info");
    expect(d?.params).toMatchObject({ exp: "2:1", expFeel: "swung (long–short)" });
  });

  test("straight eighths against a shuffle: off-beats miss the window, it fails and the feel says straight", () => {
    const r = gradeSwingTaps(take(0.5), GRID, TAP_TOL, PROFILE);
    // At 112 BPM the off-beat lands 89 ms early: outside the 50 ms window (the short part is 179 ms).
    expect(r.windowMs).toBe(50);
    expect(r.pass).toBe(false);
    expect(r.swing.cls).toBe("straight");
    expect(r.swing.feelOk).toBe(false);
    expect(r.swing.offbeatErrorMs).toBeCloseTo(-89.3, 0);
    const d = r.diagnostics.find((x) => x.id === "tap.swing");
    expect(d).toMatchObject({ severity: "warn" });
    expect(d?.params).toMatchObject({ got: "1:1", gotFeel: "straight (even eighths)", dir: "early" });
  });

  test("a light swing inside the window still counts; Bluetooth output widens the window to 70 ms", () => {
    // Off-beat at 0.62 of the beat: 25 ms early against 2/3.
    const light = gradeSwingTaps(take(0.62), GRID, TAP_TOL, PROFILE);
    expect(light.swing.feelOk).toBe(true);
    expect(light.pass).toBe(true);
    // 0.58: 46 ms early — inside 50 ms; 0.56: 57 ms early — out at 50, in at 70 (Bluetooth).
    expect(gradeSwingTaps(take(0.56), GRID, TAP_TOL, PROFILE).swing.feelOk).toBe(false);
    const bt = gradeSwingTaps(take(0.56), GRID, TAP_TOL, { ...PROFILE, outputKind: "bluetooth" });
    expect(bt.windowMs).toBe(70);
    expect(bt.swing.feelOk).toBe(true);
  });

  test("a constant offset is forgiven at levels 1–2 and does not change the feel", () => {
    const r = gradeSwingTaps(take(2 / 3, { offsetMs: 70 }), GRID, TAP_TOL, PROFILE, { level: 1, levels: 4 });
    expect(r.pass).toBe(true);
    expect(r.diagnostics.some((d) => d.id === "tap.offset")).toBe(true);
    expect(r.swing.feelOk).toBe(true);
  });

  test("too few measurable slots: no feel verdict (and no swing line when nothing was measured)", () => {
    const quarters = Array.from({ length: 9 }, (_, k) => GRID.downbeat + k * BEAT);
    const r = gradeSwingTaps(quarters, GRID, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.swing.feelOk).toBe(false);
    expect(r.diagnostics.some((d) => d.id === "tap.swing")).toBe(false);
  });
});
