import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { LearnerProfile } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { minIoiMs, performancePasses, singTargets, tapPlace, tapTargets, tapWindow } from "./index.ts";

setDefaultTimeout(20_000);
const profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs"> = { outputKind: "wired", tapJitterMs: 10 };

describe("tap targets and window (contracts §8.4)", () => {
  test("'beat' at 120 BPM in 4/4: one target every 0.5 s", async () => {
    const n = await strudel('setcpm(120/4)\ns("bd sd")', 2);
    expect(tapTargets("beat", n, 2, "4/4")).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });
  test("a drum filter keeps only that line's onsets", async () => {
    const n = await strudel('setcpm(120/4)\ndrums: s("bd sd [bd bd] sd")', 1);
    expect(tapTargets({ drum: ["kick"] }, n, 1, "4/4")).toEqual([0, 1, 1.25]);
    expect(minIoiMs(tapTargets({ drum: ["kick"] }, n, 1, "4/4"))).toBe(250);
  });
  test("auto window: clamp(0.25·minIOI, 50, 120)·levelFactor, never below the floor", () => {
    expect(tapWindow({ windowMs: "auto" }, 500, profile)).toBe(120);
    expect(tapWindow({ windowMs: "auto" }, 250, profile)).toBe(62.5);
    expect(tapWindow({ windowMs: "auto" }, 100, profile)).toBe(50);
    // At the top level the factor is 0.6, but the 50 ms floor holds.
    expect(tapWindow({ windowMs: "auto" }, 250, profile, 5, 5)).toBe(50);
    expect(tapWindow({ windowMs: "auto" }, 500, profile, 5, 5)).toBeCloseTo(72, 9);
    expect(tapWindow({ windowMs: "auto" }, 100, { outputKind: "bluetooth", tapJitterMs: 10 })).toBe(70);
    expect(tapWindow({ windowMs: "auto" }, 100, { outputKind: "wired", tapJitterMs: 30 })).toBe(80);
    expect(tapWindow({ windowMs: 40 }, 100, profile)).toBe(40);
  });
  test("tap place: bar and beat of a time", () => {
    expect(tapPlace(2.25, 0.5, "4/4")).toEqual({ bar: 2, beat: 1.5 });
  });
});

describe("sing targets", () => {
  test("degrees 1 3 5 in D major from D4, one per beat at 120 BPM", () => {
    expect(
      singTargets(
        { from: "degrees", degrees: ["1", "3", "5"] },
        null,
        { tonic: "D", mode: "major" },
        "4/4",
        0.5,
      ),
    ).toEqual([
      { midi: 62, on: 0, off: 0.5 },
      { midi: 66, on: 0.5, off: 1 },
      { midi: 69, on: 1, off: 1.5 },
    ]);
  });
  test("from the stimulus melody", async () => {
    const n = await strudel('setcpm(60/4)\nmel: note("c4 ~ e4 g4")', 1);
    expect(singTargets({ from: "stimulus" }, n, null, "4/4", n.cps)).toEqual([
      { midi: 60, on: 0, off: 1 },
      { midi: 64, on: 2, off: 3 },
      { midi: 67, on: 3, off: 4 },
    ]);
  });
});

describe("pass rules (contracts §8.1 rule 7, §8.4)", () => {
  const tapTol = {
    windowMs: "auto" as const,
    tempo: "locked" as const,
    forgiveOffset: true,
    passF1: 0.9,
    passTiming: 0.5,
  };
  const singTol = {
    cents: "learner" as const,
    octave: "per-note" as const,
    driftCompCents: 0,
    minCoverage: 0.4,
    passHitRate: 0.8,
  };
  test("taps: F1 ≥ 0.9 and timing ≥ 0.5", () => {
    expect(
      performancePasses("tap", { score: 0.9, dims: {}, diagnostics: [], f1: 0.95, timing: 0.6 }, tapTol),
    ).toBe(true);
    expect(
      performancePasses("tap", { score: 0.9, dims: {}, diagnostics: [], f1: 0.85, timing: 0.9 }, tapTol),
    ).toBe(false);
    expect(
      performancePasses("tap", { score: 0.9, dims: {}, diagnostics: [], f1: 1, timing: 0.4 }, tapTol),
    ).toBe(false);
  });
  test("singing: mean pitch credit ≥ 0.8 and at most one missed note", () => {
    const notes = (cs: number[], missed = 0) =>
      cs.map((credit, i) => ({ credit, feedback: i < missed ? "sing.missed" : null }));
    expect(
      performancePasses(
        "sing",
        { score: 0.85, dims: {}, diagnostics: [], notes: notes([1, 1, 1, 0.5]) },
        singTol,
      ),
    ).toBe(true);
    expect(
      performancePasses(
        "sing",
        { score: 0.7, dims: {}, diagnostics: [], notes: notes([1, 0.5, 0.5, 1]) },
        singTol,
      ),
    ).toBe(false);
    expect(
      performancePasses(
        "sing",
        { score: 0.8, dims: {}, diagnostics: [], notes: notes([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 2) },
        singTol,
      ),
    ).toBe(false);
    expect(performancePasses("sing", { score: 0.2, dims: {}, diagnostics: [], pass: true }, singTol)).toBe(
      true,
    );
  });
});
