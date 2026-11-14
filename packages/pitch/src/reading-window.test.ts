// d24 (Wave 6): why a cents reading through the fake microphone moved with load. The estimate of a timed note is
// the median of the voiced frames in its window (contracts §8.1). Over a voice with vibrato that median depends
// on which part of the vibrato the window covers: for the review suite's "flat-c4" take (60¢ flat, a 6¢ vibrato
// at 5.5 Hz) it runs from −60.5 to −59.4¢ as the window slides — the two rounding edges of "−60¢". A page under
// load opens the capture, starts the take and delivers frames a little differently each time, so the window
// falls elsewhere on the file and the printed cent flips (−61¢ was read beside another unit, −60¢ alone). No
// frame is lost and the detector is not at fault: on a steady voice every window reads the same to a hundredth
// of a cent, with every third frame dropped as well. A fixture that pins a rounded cent must therefore be steady.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { analyze, PROFILE, SING_TOL, SR } from "./fixtures.test-data.ts";
import { gradeSung } from "./sung.ts";
import { concat, silence, tone } from "./synth.ts";
import type { PitchFrame } from "./types.ts";

setDefaultTimeout(30_000);

const C4 = 261.6256;
/** e2e/review/make-fixtures.bun.ts `flat-c4.wav`, eight seconds of it. */
const flatC4 = (vibratoCents: number): PitchFrame[] =>
  analyze(
    concat([
      silence(0.05, SR, -70),
      tone({
        hz: C4 * 2 ** (-60 / 1200),
        seconds: 8,
        sampleRate: SR,
        amp: 0.35,
        wave: "voice",
        fade: 0.02,
        vibratoCents,
      }),
    ]),
  );

/** The reading of one note on C4 lasting `dur`, for a window starting every 11 ms through three seconds. */
function readings(frames: readonly PitchFrame[], dur = 0.7): number[] {
  const out: number[] = [];
  for (let at = 1; at < 4; at += 0.011) {
    const r = gradeSung(
      frames.filter((f) => f.t >= at - 0.3 && f.t <= at + dur + 0.3),
      [{ midi: 60, on: at, off: at + dur }],
      { ...SING_TOL, driftCompCents: 0 },
      "degree",
      PROFILE,
    );
    const c = r.notes[0]?.cents;
    if (typeof c === "number") out.push(c);
  }
  return out;
}

describe("a cents reading and where its window falls", () => {
  test("a steady voice reads the same wherever the window falls, and with frames dropped", () => {
    const frames = flatC4(0);
    const all = readings(frames);
    expect(all.length).toBeGreaterThan(250);
    expect(Math.max(...all) - Math.min(...all)).toBeLessThan(0.02);
    expect(new Set(all.map((c) => Math.round(c)))).toEqual(new Set([-60]));
    // A page that loses frames (every third one here) still reads the same cent.
    const dropped = readings(frames.filter((_, i) => i % 3 !== 0));
    expect(Math.max(...dropped) - Math.min(...dropped)).toBeLessThan(0.02);
    expect(new Set(dropped.map((c) => Math.round(c)))).toEqual(new Set([-60]));
  });

  test("a 6¢ vibrato moves the reading by about a cent across windows: its rounding is not a constant", () => {
    const all = readings(flatC4(6));
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    // Both rounding edges of −60 are inside the spread or within a few hundredths of it.
    expect(hi - lo).toBeGreaterThan(0.8);
    expect(lo).toBeLessThan(-60.4);
    expect(hi).toBeGreaterThan(-59.5);
    // The spread is the vibrato's own (well inside ±6¢), not an error of the detector.
    expect(lo).toBeGreaterThan(-61.5);
    expect(hi).toBeLessThan(-58.5);
    expect(new Set(all.map((c) => Math.round(c))).size).toBeGreaterThan(1);
    // A shorter note (fewer vibrato cycles in the window) spreads further.
    const short = readings(flatC4(6), 0.35);
    expect(Math.max(...short) - Math.min(...short)).toBeGreaterThan(hi - lo);
  });
});
