// The one rule for a sung note (contracts §8.1): credits, octave policies, drift, modes, live grading.
import { describe, expect, test } from "bun:test";
import type { SingTolerance } from "@oak/content-kit";
import { analyze, frames, PROFILE, type Seg, SING_TOL, SR } from "./fixtures.test-data.ts";
import { midiToHz } from "./math.ts";
import {
  alignSung,
  calibrateRange,
  detectBleed,
  estimateRange,
  firstSingPasses,
  fitToRange,
  gradeSung,
  gradeSungLive,
  sungCredit,
} from "./sung.ts";
import { SUNG_NOTES, sungSequence } from "./synth.ts";
import type { PitchFrame, SungTarget } from "./types.ts";

const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({ ...SING_TOL, ...over });
/** Three half-second targets, each followed by 0.1 s of silence. */
const TARGETS: SungTarget[] = [60, 64, 67].map((midi, i) => ({
  midi,
  on: 0.2 + i * 0.6,
  off: 0.7 + i * 0.6,
}));
const sing = (cents: (i: number) => number | null, over: Partial<Seg> = {}): PitchFrame[] =>
  frames(
    TARGETS.map((t, i) => {
      const c = cents(i);
      return { midi: c === null ? null : t.midi + c / 100, from: t.on, to: t.off, ...over };
    }),
    2.2,
  );

describe("per-note credit", () => {
  test("the table of rule 5", () => {
    expect(sungCredit(50, 50)).toBe(1);
    expect(sungCredit(51, 50)).toBe(0.5);
    expect(sungCredit(100, 50)).toBe(0.5);
    expect(sungCredit(101, 50)).toBe(0);
    expect(sungCredit(70, 70)).toBe(1);
    expect(sungCredit(101, 70)).toBe(0); // min(2T, 100) caps the half-credit band at 100¢
    expect(sungCredit(50, 25)).toBe(0.5);
    expect(sungCredit(51, 25)).toBe(0);
  });

  test("in tune: full credit, pass, medianAbsCents feeds the ladder", () => {
    const r = gradeSung(
      sing(() => 5),
      TARGETS,
      tol({ driftCompCents: 0 }),
      "pitch",
      PROFILE,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.pass).toBe(true);
    expect(r.score).toBeCloseTo(1, 9);
    expect(r.medianAbsCents).toBeCloseTo(5, 0);
    expect(r.tolCents).toBe(50);
  });

  test("sharp / flat / wrong note and the learner tolerance", () => {
    const errs = [70, -80, 200];
    const r = gradeSung(
      sing((i) => errs[i] ?? 0),
      TARGETS,
      tol({ driftCompCents: 0 }),
      "pitch",
      PROFILE,
    );
    expect(r.notes.map((n) => n.feedback)).toEqual(["sing.sharp", "sing.flat", "sing.wrong-note"]);
    expect(r.notes.map((n) => n.credit)).toEqual([0.5, 0.5, 0]);
    expect(r.pass).toBe(false);
    const wrong = r.diagnostics.find((d) => d.id === "sing.wrong-note");
    expect(wrong?.params).toMatchObject({ i: 3, exp: "G4", got: "A4" });
    // A fixed tolerance in the step overrides the learner's rung.
    const loose = gradeSung(
      sing((i) => [60, 60, 60][i] ?? 0),
      TARGETS,
      tol({ cents: 70, driftCompCents: 0 }),
      "pitch",
      PROFILE,
    );
    expect(loose.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(loose.tolCents).toBe(70);
  });

  test("a missed note: coverage below minCoverage; at most one missed note passes", () => {
    const one = gradeSung(
      sing((i) => (i === 1 ? null : 0)),
      TARGETS,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(one.notes[1]?.feedback).toBe("sing.missed");
    expect(one.notes[1]?.coverage).toBe(0);
    expect(one.diagnostics.some((d) => d.id === "sing.missed")).toBe(true);
    // 2/3 mean credit < 0.8: fails on pitch even with one miss.
    expect(one.pass).toBe(false);
    const five: SungTarget[] = [0, 1, 2, 3, 4].map((k) => ({
      midi: 60 + k,
      on: 0.2 + 0.6 * k,
      off: 0.7 + 0.6 * k,
    }));
    const fr = frames(
      five.map((t, k) => ({ midi: k === 2 ? null : t.midi, from: t.on, to: t.off })),
      3.4,
    );
    const r5 = gradeSung(fr, five, tol(), "pitch", PROFILE);
    expect(r5.pass).toBe(true); // 4/5 = 0.8 and one miss
  });

  test("no voice at all reports sing.no-voice with the input level", () => {
    const r = gradeSung(
      sing(() => null),
      TARGETS,
      tol(),
      "pitch",
      PROFILE,
    );
    expect(r.diagnostics[0]?.id).toBe("sing.no-voice");
    expect(r.diagnostics[0]?.params.db).toBe(-80);
  });
});

describe("octave policy", () => {
  test("per-note folds each error into (−600, 600]", () => {
    const r = gradeSung(
      sing((i) => (i === 1 ? -1200 + 10 : 12 + 1200)),
      TARGETS,
      tol({ driftCompCents: 0 }),
      "pitch",
      PROFILE,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.notes.map((n) => n.octaveShift)).toEqual([1, -1, 1]);
  });

  test("global: one best octave shift; a note 12 off from it earns 0.5 with sing.octave-jump", () => {
    const r = gradeSung(
      sing((i) => (i === 2 ? 0 : -1200)),
      TARGETS,
      tol({ octave: "global", driftCompCents: 0 }),
      "echo",
      PROFILE,
    );
    expect(r.notes.map((n) => n.octaveShift)).toEqual([-1, -1, 0]);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 0.5]);
    expect(r.notes[2]?.feedback).toBe("sing.octave-jump");
  });

  test("exact: no folding", () => {
    const r = gradeSung(
      sing(() => -1200),
      TARGETS,
      tol({ octave: "exact" }),
      "pitch",
      PROFILE,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([0, 0, 0]);
  });
});

describe("drift compensation", () => {
  test("a constant 30¢ flat line is compensated (≤ driftCompCents) and reported (> 15¢)", () => {
    const r = gradeSung(
      sing(() => -30),
      TARGETS,
      tol({ cents: 25, driftCompCents: 30 }),
      "pitch",
      PROFILE,
    );
    expect(r.driftCents).toBeCloseTo(-30, 0);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.diagnostics.find((d) => d.id === "sing.drift")?.params).toMatchObject({ dir: "flat" });
  });
  test("drift beyond driftCompCents is not removed", () => {
    const r = gradeSung(
      sing(() => -40),
      TARGETS,
      tol({ cents: 25, driftCompCents: 30 }),
      "pitch",
      PROFILE,
    );
    expect(r.notes.map((n) => n.credit)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("timing (timed modes)", () => {
  test("sight: 0.75 pitch + 0.25 timing; onset error measured at the window centre", () => {
    const late = frames(
      TARGETS.map((t) => ({ midi: t.midi, from: t.on + 0.12, to: t.off })),
      2.2,
    );
    const r = gradeSung(late, TARGETS, tol({ onsetMs: 50 }), "sight", PROFILE);
    for (const n of r.notes) expect(n.onsetErrorMs ?? 0).toBeGreaterThan(100);
    expect(r.notes.map((n) => n.timingCredit)).toEqual([0, 0, 0]);
    expect(r.dims.timing?.weight).toBe(0.25);
    expect(r.score).toBeCloseTo(0.75, 9);
    expect(r.diagnostics.some((d) => d.id === "sing.late")).toBe(true);
    const ontime = gradeSung(
      sing(() => 0),
      TARGETS,
      tol({ onsetMs: 50 }),
      "sight",
      PROFILE,
    );
    expect(ontime.notes.map((n) => n.timingCredit)).toEqual([1, 1, 1]);
  });

  test("sing latency is removed before windows are read", () => {
    const shifted = frames(
      TARGETS.map((t) => ({ midi: t.midi, from: t.on + 0.15, to: t.off + 0.15 })),
      2.4,
    );
    const r = gradeSung(shifted, TARGETS, tol({ onsetMs: 60 }), "sight", { ...PROFILE, singLatencyMs: 150 });
    expect(r.notes.map((n) => n.timingCredit)).toEqual([1, 1, 1]);
    expect(r.notes.every((n) => n.coverage > 0.95)).toBe(true);
  });
});

describe("free modes", () => {
  test("echo: segmentation + alignment on folded pitch; an extra note does not shift the rest", () => {
    const fr = frames(
      [
        { midi: 60, from: 0.3, to: 0.7 },
        { midi: 62, from: 0.8, to: 1.0 }, // extra
        { midi: 64, from: 1.1, to: 1.5 },
        { midi: 55, from: 1.6, to: 2.0 }, // G3 for G4: per-note fold
      ],
      2.2,
    );
    const r = gradeSung(fr, TARGETS, tol(), "echo", PROFILE);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.pass).toBe(true);
    expect(r.dims.rhythm).toBeDefined();
  });

  test("alignSung leaves unmatched targets null", () => {
    expect(alignSung([60, 62, 64], [60, 64])).toEqual([0, null, 1]);
    expect(alignSung([60, 62], [72, 62, 99])).toEqual([0, 1]);
  });

  test("the real DSP path: A3 C#4 E4 echoed from the S5 fixture", () => {
    const targets = SUNG_NOTES.map((n) => ({ midi: n.midi, on: n.start, off: n.start + n.dur }));
    const r = gradeSung(analyze(sungSequence(SR)), targets, tol({ cents: 25 }), "echo", PROFILE);
    expect(r.pass).toBe(true);
    expect(r.notes.every((n) => Math.abs(n.cents ?? 99) < 5)).toBe(true);
    const timed = gradeSung(
      analyze(sungSequence(SR)),
      targets,
      tol({ cents: 25, onsetMs: 60 }),
      "sight",
      PROFILE,
    );
    expect(timed.pass).toBe(true);
    expect(timed.notes.map((n) => n.timingCredit)).toEqual([1, 1, 1]);
  });
});

describe("gradeSungLive", () => {
  test("a note whose window is open is never missed; pass waits for every note", () => {
    const all = sing(() => 0);
    const upTo = (t: number) => all.filter((f) => f.t <= t);
    const mid = gradeSungLive(upTo(0.95), TARGETS, tol(), "pitch", PROFILE, 0.95);
    expect(mid.notes[0]?.credit).toBe(1);
    expect(mid.notes[1]?.feedback).toBe(null);
    expect(mid.notes[2]?.coverage).toBe(0);
    expect(mid.diagnostics.some((d) => d.id === "sing.missed")).toBe(false);
    expect(mid.pass).toBe(false);
    const done = gradeSungLive(all, TARGETS, tol(), "pitch", PROFILE, 2.3);
    const final = gradeSung(all, TARGETS, tol(), "pitch", PROFILE);
    expect(done.notes.map((n) => n.credit)).toEqual(final.notes.map((n) => n.credit));
    expect(done.pass).toBe(true);
  });
  test("live echo: targets after the last sung note are still to come", () => {
    const fr = frames([{ midi: 60, from: 0.3, to: 0.7 }], 0.9);
    const r = gradeSungLive(fr, TARGETS, tol(), "echo", PROFILE, 0.9);
    expect(r.notes.map((n) => n.feedback)).toEqual([null, null, null]);
    expect(r.notes[0]?.credit).toBe(1);
  });
});

describe("first sing, range, bleed", () => {
  test("firstSingPasses: any sustained pitch within ±100¢ of the tonic in any octave, for 600 ms", () => {
    const tonic = 60;
    expect(firstSingPasses(frames([{ midi: 48.8, from: 0.2, to: 1.0 }], 1.2), tonic, PROFILE)).toBe(true);
    expect(firstSingPasses(frames([{ midi: 62, from: 0.2, to: 1.0 }], 1.2), tonic, PROFILE)).toBe(false);
    expect(firstSingPasses(frames([{ midi: 60, from: 0.2, to: 0.4 }], 1.2), tonic, PROFILE)).toBe(false);
  });

  test("fitToRange moves targets by whole octaves into the comfort range", () => {
    // A bass voice: comfort G2..D4.
    const bass = { comfLow: 43, comfHigh: 62, rangeLow: 40, rangeHigh: 65 };
    expect(fitToRange([67, 71, 74], bass)).toBe(-12);
    expect(fitToRange([60, 64, 67], PROFILE)).toBe(0);
    expect(fitToRange([84, 88, 91], PROFILE)).toBe(-24);
    expect(fitToRange([], PROFILE)).toBe(0);
  });

  test("estimateRange from a sweep: a crack or a short octave error cannot set it", () => {
    const sweep: Seg[] = [];
    for (let m = 48; m <= 72; m++)
      sweep.push({ midi: m, from: 0.2 + (m - 48) * 0.2, to: 0.38 + (m - 48) * 0.2 });
    const fr = frames(sweep, 5.4);
    // A 3-frame crack up to C6 at the top.
    const last = fr.findLast((f) => f.hz > 0) as PitchFrame;
    const k = fr.indexOf(last);
    for (const j of [k - 2, k - 1, k]) (fr[j] as PitchFrame).hz = midiToHz(84);
    const r = estimateRange(fr);
    expect(r).not.toBeNull();
    expect(r?.low).toBe(48);
    expect(r?.high).toBe(72);
    expect(r?.comfLow).toBe(52);
    expect(r?.comfHigh).toBe(68);
    expect(calibrateRange(fr)).toEqual({ low: 48, high: 72, comfLow: 52, comfHigh: 68 });
    expect(() => calibrateRange(frames([], 1))).toThrow(RangeError);
  });

  test("detectBleed: voiced frames on the playing note for > 300 ms", () => {
    const playing: SungTarget[] = [{ midi: 81, on: 0.2, off: 0.8 }];
    expect(detectBleed(frames([{ midi: 81.1, from: 0.25, to: 0.8 }], 1), playing)).toBe(true);
    expect(detectBleed(frames([{ midi: 81.1, from: 0.25, to: 0.45 }], 1), playing)).toBe(false);
    expect(detectBleed(frames([{ midi: 83, from: 0.25, to: 0.8 }], 1), playing)).toBe(false);
  });
});
