// Wave 7: the rhythm track's taps — two hands at once, timelines and the clave, odd-meter groupings, the
// lay-back in milliseconds and the swing ratio — graded by the §8.4 rule and read back as music.
import { describe, expect, test } from "bun:test";
import type { Diagnostic, TapTolerance } from "@oak/content-kit";
import { FEEL_MS, lateMs, SWING_FEELS } from "@oak/content-kit";
import { CINQUILLO, claveSteps, swingRatio, TRESILLO } from "@oak/theory";
import { PROFILE, TAP_TOL } from "./fixtures.test-data.ts";
import { gradeSwingTaps, ratioOfAmount, ratioText, swungTargets } from "./swing-taps.ts";
import { mulberry32 } from "./synth.ts";
import {
  claveTargets,
  gradeClaveTaps,
  gradeGroupingTaps,
  gradeLaneTaps,
  gradeLayBackTaps,
  gradeTimelineTaps,
  gridText,
  groupingTargets,
  groupingWords,
  layBackVerdict,
  measureLayBack,
  polyrhythmLanes,
  swingFeelOf,
  TRACK_TAP_FEEDBACK,
  timelineTargets,
  trackTapText,
} from "./track-taps.ts";

const ids = (ds: readonly Diagnostic[]) => ds.map((d) => d.id);
const jitter = (xs: readonly number[], ms: number, seed = 3) => {
  const r = mulberry32(seed);
  return xs.map((x) => x + ((r() * 2 - 1) * ms) / 1000);
};
const LEVEL3: { level: number; levels: number } = { level: 3, levels: 4 };

// R2.L04: left hand the two (the kick), right hand the three (the cowbell), four bars at 66 BPM.
const GRID = { downbeat: 1, bpm: 66, a: 3, b: 2, cycles: 4 } as const;
const BAR = (60 / 66) * 4;
const lanes = () => {
  const l = polyrhythmLanes(GRID);
  return [
    { label: "Left hand: the two", key: "F", targets: l.b },
    { label: "Right hand: the three", key: "J", targets: l.a },
  ];
};

describe("two lanes: three against two", () => {
  test("the lanes: the three on 0, 1/3, 2/3 of the bar, the two on 0 and 1/2, both on the downbeat", () => {
    const l = polyrhythmLanes(GRID);
    expect(l.a.slice(0, 3).map((t) => (t - 1) / BAR)).toEqual(
      [0, 1 / 3, 2 / 3].map((x) => expect.closeTo(x, 9)),
    );
    expect(l.b.slice(0, 2).map((t) => (t - 1) / BAR)).toEqual([0, 0.5].map((x) => expect.closeTo(x, 9)));
    expect(l.a).toHaveLength(12);
    expect(l.b).toHaveLength(8);
    expect(l.together.map((t) => (t - 1) / BAR)).toEqual([0, 1, 2, 3].map((x) => expect.closeTo(x, 9)));
    const closing = polyrhythmLanes({ ...GRID, closing: true });
    expect(closing.a).toHaveLength(13);
    expect(closing.together).toHaveLength(5);
  });

  test("an even take passes per lane and as a whole, with nothing to say", () => {
    const L = lanes();
    const r = gradeLaneTaps(
      L.map((l, k) => jitter(l.targets, 8, k + 1)),
      L,
      TAP_TOL,
      PROFILE,
    );
    expect(r.pass).toBe(true);
    expect(r.lanes.map((l) => l.pass)).toEqual([true, true]);
    expect(r.composite.pass).toBe(true);
    expect(r.lanes.map((l) => l.name)).toEqual(["two", "three"]);
    expect(r.lanes.map((l) => l.key)).toEqual(["F", "J"]);
    expect(r.together.n).toBe(4);
    expect(ids(r.diagnostics)).toEqual([]);
    expect(r.f1).toBe(Math.min(r.lanes[0]?.f1 ?? 0, r.lanes[1]?.f1 ?? 0));
  });

  test("the three rushing against the two is said, lane by name, with the note that rushes most", () => {
    const L = lanes();
    const three = (L[1]?.targets ?? []).map((t, i) => (i % 3 === 0 ? t : t - (i % 3 === 1 ? 0.035 : 0.06)));
    const r = gradeLaneTaps([L[0]?.targets ?? [], three], L, TAP_TOL, PROFILE, {
      cycleSec: BAR,
      downbeat: 1,
    });
    const d = r.diagnostics.find((x) => x.id === "tap.lane-rushing");
    expect(d?.params).toMatchObject({
      lane: "three",
      other: "two",
      ms: 47,
      dir: "early",
      note: "third",
      noteMs: 60,
    });
    expect(trackTapText(d as Diagnostic)).toBe(
      "Your three is rushing against the two: its taps come 47 ms early.",
    );
    expect(r.lanes[1]?.byPosition.map((x) => (x === null ? null : Math.round(x)))).toEqual([0, -35, -60]);
    expect(r.lanes[0]?.leanMs).toBeCloseTo(0, 6);
    // Inside the window: the take still passes (the feedback is for the feel of it).
    expect(r.pass).toBe(true);
  });

  test("the two dragging: dragging, named for the two", () => {
    const L = lanes();
    const two = (L[0]?.targets ?? []).map((t, i) => (i % 2 === 1 ? t + 0.05 : t));
    const r = gradeLaneTaps([two, L[1]?.targets ?? []], L, TAP_TOL, PROFILE);
    expect(r.diagnostics.find((x) => x.id === "tap.lane-dragging")?.params).toMatchObject({
      lane: "two",
      other: "three",
      ms: 50,
    });
  });

  test("an offset common to both hands is forgiven at level 1 and never read as a lean", () => {
    const L = lanes();
    const late = L.map((l) => l.targets.map((t) => t + 0.07));
    const r = gradeLaneTaps(late, L, TAP_TOL, PROFILE);
    expect(r.pass).toBe(true);
    expect(Math.round(r.offsetMs)).toBe(70);
    expect(r.diagnostics.find((d) => d.id === "tap.offset")).toMatchObject({ severity: "info" });
    expect(ids(r.diagnostics).filter((id) => id.startsWith("tap.lane"))).toEqual([]);
    // At level 3 of 4 it is not forgiven: the same take now loses timing.
    const strict = gradeLaneTaps(late, L, TAP_TOL, PROFILE, LEVEL3);
    expect(strict.diagnostics.find((d) => d.id === "tap.offset")).toMatchObject({ severity: "warn" });
    expect(strict.timing).toBeLessThan(r.timing);
  });

  test("a lane leaning by itself is never forgiven as an offset, even at level 1", () => {
    const L = lanes();
    // The whole three 80 ms early, shared downbeats included: the hands split on the one (a flam), and only half of
    // that split can be the common offset; the rest is the three leaning, which costs that lane timing.
    const r = gradeLaneTaps(
      [L[0]?.targets ?? [], (L[1]?.targets ?? []).map((t) => t - 0.08)],
      L,
      TAP_TOL,
      PROFILE,
    );
    expect(r.lanes[1]?.timing).toBeLessThan(0.7);
    expect(r.diagnostics.find((d) => d.id === "tap.lanes-flam")?.params.ms).toBe(80);
    expect(r.diagnostics.find((d) => d.id === "tap.lane-rushing")?.params).toMatchObject({
      lane: "three",
      ms: 40,
    });
  });

  test("swapped keys: each hand tapped the other's pulse — fails, and is said as a swap", () => {
    const L = lanes();
    const r = gradeLaneTaps([L[1]?.targets ?? [], L[0]?.targets ?? []], L, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.swapped).toBe(true);
    const d = r.diagnostics.find((x) => x.id === "tap.lanes-swapped") as Diagnostic;
    expect(trackTapText(d)).toBe("Your hands swapped parts: F tapped the three and J the two.");
    expect(ids(r.diagnostics)).not.toContain("tap.lane-rushing");
  });

  test("one hand silent fails, and says which key", () => {
    const L = lanes();
    const r = gradeLaneTaps([L[0]?.targets ?? [], []], L, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.lanes[0]?.pass).toBe(true);
    const d = r.diagnostics.find((x) => x.id === "tap.lane-silent") as Diagnostic;
    expect(trackTapText(d)).toBe("No taps on J: that hand plays the three while the other plays the two.");
  });

  test("the right keys, the wrong rhythm: both pulses on one key, the other hand silent — fails", () => {
    const L = lanes();
    const both = [...new Set([...(L[0]?.targets ?? []), ...(L[1]?.targets ?? [])])];
    const r = gradeLaneTaps([both, []], L, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.lanes[0]?.pass).toBe(false);
  });

  test("the three tapped as even quarter notes (four to the bar) fails its lane", () => {
    const L = lanes();
    const quarters = Array.from({ length: 16 }, (_, i) => 1 + (i * BAR) / 4);
    const r = gradeLaneTaps([L[0]?.targets ?? [], quarters], L, TAP_TOL, PROFILE);
    expect(r.lanes[1]?.pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  test("four against three, two lanes over one bar", () => {
    const l = polyrhythmLanes({ downbeat: 0, bpm: 80, a: 4, b: 3, cycles: 2 });
    const L = [
      { label: "Left hand: the three", targets: l.b },
      { label: "Right hand: the four", targets: l.a },
    ];
    const ok = gradeLaneTaps([jitter(l.b, 6, 9), jitter(l.a, 6, 10)], L, TAP_TOL, PROFILE);
    expect(ok.pass).toBe(true);
    expect(ok.lanes.map((x) => x.name)).toEqual(["three", "four"]);
    const thinFour = gradeLaneTaps([l.b, l.a.filter((_, i) => i % 4 !== 3)], L, TAP_TOL, PROFILE);
    expect(thinFour.pass).toBe(false);
  });

  test("a calibration off by more than the window: both hands 150 ms late pair up, forgiven at level 1 only", () => {
    const L = lanes();
    const late = L.map((l) =>
      jitter(
        l.targets.map((t) => t + 0.15),
        5,
        31,
      ),
    );
    const r = gradeLaneTaps(late, L, TAP_TOL, PROFILE);
    expect(Math.round(r.offsetMs / 10)).toBe(15);
    expect(r.pass).toBe(true);
    expect(ids(r.diagnostics).filter((id) => id.startsWith("tap.lane"))).toEqual([]);
    expect(gradeLaneTaps(late, L, TAP_TOL, PROFILE, LEVEL3).pass).toBe(false);
  });

  test("lanes must be two", () => {
    expect(() => gradeLaneTaps([[1]], [{ label: "x", targets: [1] }], TAP_TOL, PROFILE)).toThrow(RangeError);
  });
});

describe("timelines: tresillo, cinquillo and the clave", () => {
  test("the grid reads as Oak draws it", () => {
    expect(gridText([...TRESILLO], 8)).toBe("x · · x · · x ·");
    expect(gridText([...CINQUILLO], 8)).toBe("x · x x · x x ·");
  });

  const TRES = { downbeat: 0.5, bpm: 100, steps: [...TRESILLO], stepsPerBar: 8, cycles: 4 };
  test("the tresillo tapped passes; three other right takes pass", () => {
    const T = timelineTargets(TRES);
    expect(T).toHaveLength(12);
    expect(T.slice(0, 3).map((t) => (t - 0.5) / 0.3)).toEqual([0, 3, 6].map((x) => expect.closeTo(x, 9)));
    for (const take of [T, jitter(T, 15, 2), T.map((t) => t + 0.04), jitter(T, 20, 7)]) {
      const r = gradeTimelineTaps(take, TRES, TAP_TOL, PROFILE);
      expect(r.pass).toBe(true);
      expect(r.cycles.every((c) => c.right)).toBe(true);
      expect(ids(r.diagnostics)).not.toContain("tap.timeline");
    }
  });

  test("straight quarters against the tresillo fail and are drawn on the grid", () => {
    const quarters = Array.from({ length: 16 }, (_, i) => 0.5 + i * 0.6);
    const r = gradeTimelineTaps(quarters, TRES, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    const d = r.diagnostics[0] as Diagnostic;
    expect(d.id).toBe("tap.timeline");
    expect(trackTapText(d)).toBe("Bar 1: you tapped x · x · x · x ·. The pattern is x · · x · · x ·.");
    expect(r.cycles[0]?.euclid).toEqual({ pulses: 4, steps: 8, rotation: 0 });
  });

  test("the right count of notes in the wrong places (3+2+3, not 3+3+2) fails", () => {
    const wrong = timelineTargets({ ...TRES, steps: [0, 3, 5] });
    const r = gradeTimelineTaps(wrong, TRES, TAP_TOL, PROFILE, LEVEL3);
    expect(r.pass).toBe(false);
    expect(r.diagnostics[0]?.params.got).toBe("x · · x · x · ·");
  });

  const SON = { downbeat: 1, bpm: 96, type: "son", direction: "3-2", bars: 4 } as const;
  test("son clave 3-2: on 0 3 6 | 10 12 of sixteen eighths; a good take passes", () => {
    expect(claveSteps("son", "3-2")).toEqual([0, 3, 6, 10, 12]);
    const T = claveTargets(SON);
    expect(T).toHaveLength(10);
    const r = gradeClaveTaps(jitter(T, 12, 4), SON, TAP_TOL, PROFILE);
    expect(r.pass).toBe(true);
    expect(r.clave.heard).toBeNull();
    expect(r.pattern).toBe("x · · x · · x · · · x · x · · ·");
  });

  test("the clave tapped from the other side fails and is named as 2-3", () => {
    const r = gradeClaveTaps(claveTargets({ ...SON, direction: "2-3" }), SON, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.clave.heard).toEqual({ type: "son", direction: "2-3" });
    expect(trackTapText(r.diagnostics[0] as Diagnostic)).toBe(
      "You tapped the clave 2-3, starting from its two side. This one runs 3-2: the three side first.",
    );
    expect(ids(r.diagnostics)).not.toContain("tap.timeline");
  });

  test("the rumba clave for the son (one note an eighth late) fails and is named", () => {
    const r = gradeClaveTaps(claveTargets({ ...SON, type: "rumba" }), SON, TAP_TOL, PROFILE, LEVEL3);
    expect(r.pass).toBe(false);
    expect(r.clave.heard).toEqual({ type: "rumba", direction: "3-2" });
    expect(trackTapText(r.diagnostics[0] as Diagnostic)).toBe(
      "You tapped a rumba clave: its three side ends on the “and” of 4. This one is a son clave, ending on beat 4.",
    );
  });

  test("a take that is neither clave is drawn, not named", () => {
    const quarters = Array.from({ length: 16 }, (_, i) => 1 + i * 0.625);
    const r = gradeClaveTaps(quarters, SON, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.clave.heard).toBeNull();
    expect(r.diagnostics[0]?.id).toBe("tap.timeline");
  });
});

describe("odd-meter groupings", () => {
  const SEVEN = { downbeat: 0, bpm: 210, meter: "7/8", bars: 4 } as const;
  test("7/8 as 2+2+3: three taps a bar on eighths 0, 2 and 4", () => {
    const T = groupingTargets(SEVEN);
    const eighth = 60 / 210;
    expect(T.slice(0, 4).map((t) => Math.round(t / eighth))).toEqual([0, 2, 4, 7]);
    for (const take of [T, jitter(T, 15, 11), T.map((t) => t - 0.03), jitter(T, 25, 12)]) {
      const r = gradeGroupingTaps(take, SEVEN, TAP_TOL, PROFILE);
      expect(r.pass).toBe(true);
      expect(r.heard).toEqual([2, 2, 3]);
    }
  });

  test("3+2+2 where 2+2+3 is asked: the right number of taps, the wrong order — fails, named", () => {
    const wrong = groupingTargets({ ...SEVEN, groups: [3, 2, 2] });
    const r = gradeGroupingTaps(wrong, SEVEN, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(r.heard).toEqual([3, 2, 2]);
    expect(trackTapText(r.diagnostics[0] as Diagnostic)).toBe(
      "You tapped 3+2+2 (long, short, short). This bar of 7/8 goes 2+2+3: short, short, long.",
    );
  });

  test("even taps every two eighths ignore the long group — fails, named", () => {
    const even = Array.from({ length: 16 }, (_, i) => (i * 2 * 60) / 210).filter(
      (t) => t < (4 * 7 * 60) / 210,
    );
    const r = gradeGroupingTaps(even, SEVEN, TAP_TOL, PROFILE);
    expect(r.pass).toBe(false);
    expect(trackTapText(r.diagnostics[0] as Diagnostic)).toBe(
      "You tapped evenly, every two eighths. This bar of 7/8 goes 2+2+3: short, short, long.",
    );
  });

  test("5/4 as 3+2 in quarters; 9/8i as 2+2+2+3", () => {
    const five = { downbeat: 0, bpm: 120, meter: "5/4", bars: 2 } as const;
    expect(groupingTargets(five).map((t) => t * 2)).toEqual([0, 3, 5, 8]);
    expect(gradeGroupingTaps(groupingTargets(five), five, TAP_TOL, PROFILE).heard).toEqual([3, 2]);
    const r = gradeGroupingTaps(groupingTargets({ ...five, groups: [2, 3] }), five, TAP_TOL, PROFILE);
    expect(r.diagnostics[0]?.params).toMatchObject({ got: "2+3", exp: "3+2" });
    const nine = { downbeat: 0, bpm: 240, meter: "9/8i", bars: 2 } as const;
    expect(gradeGroupingTaps(groupingTargets(nine), nine, TAP_TOL, PROFILE).heard).toEqual([2, 2, 2, 3]);
    expect(groupingWords([2, 2, 2, 3])).toBe("short, short, short, long");
    expect(() => groupingTargets({ ...nine, groups: [2, 2, 2] })).toThrow(RangeError);
  });
});

describe("laid back: milliseconds behind the click", () => {
  const beats = Array.from({ length: 16 }, (_, i) => 1 + (i * 60) / 92);
  test("the verdict bands are FEEL_MS: under 8 on, 8–45 a feel, beyond a rhythm", () => {
    expect(FEEL_MS).toEqual([8, 45]);
    expect([0, 5, 8, 21, 45, 46, -21, -82].map(layBackVerdict)).toEqual([
      "on",
      "on",
      "behind",
      "behind",
      "behind",
      "late",
      "ahead",
      "early",
    ]);
    // R1.L05's numbers: `.late(.008)` at 92 BPM is 21 ms, a feel; `.late(1/32)` is 82 ms, a displacement.
    expect(Math.round(lateMs(0.008, 92))).toBe(21);
    expect(Math.round(lateMs(1 / 32, 92))).toBe(82);
  });

  test("21 ms behind with a steady hand: behind, sure, and the ± is honest", () => {
    const taps = jitter(
      beats.map((b) => b + 0.021),
      6,
      21,
    );
    const r = measureLayBack(taps, beats, PROFILE);
    expect(r.n).toBe(16);
    expect(r.medianMs).toBeGreaterThan(17);
    expect(r.medianMs).toBeLessThan(25);
    expect(r.verdict).toBe("behind");
    expect(r.plusMinusMs).toBeGreaterThan(2);
    expect(r.plusMinusMs).toBeLessThan(12);
    expect(r.sure).toBe(true);
  });

  test("a sloppy hand at 12 ms behind is behind, but not sure", () => {
    const taps = jitter(
      beats.map((b) => b + 0.012),
      30,
      5,
    );
    const r = measureLayBack(taps, beats, { tapJitterMs: 20 });
    expect(r.sure).toBe(false);
  });

  test("the step asks for behind: 21 ms is right, 82 ms is a displacement, ahead is wrong; pass is the §8.4 rule", () => {
    const want = { direction: "late" as const };
    const behind = gradeLayBackTaps(
      beats.map((b) => b + 0.021),
      beats,
      TAP_TOL,
      PROFILE,
      { want },
    );
    expect(behind.layBack.feelOk).toBe(true);
    expect(behind.pass).toBe(true);
    expect(trackTapText(behind.diagnostics[0] as Diagnostic)).toBe(
      "You sat 21 ms behind the beat (± 9 ms): laid back, a feel.",
    );
    const displaced = gradeLayBackTaps(
      beats.map((b) => b + 0.082),
      beats,
      TAP_TOL,
      PROFILE,
      { want, ...LEVEL3 },
    );
    expect(displaced.layBack.verdict).toBe("late");
    expect(displaced.layBack.feelOk).toBe(false);
    expect(displaced.diagnostics[0]).toMatchObject({ id: "tap.lay-back", severity: "warn" });
    const ahead = gradeLayBackTaps(
      beats.map((b) => b - 0.02),
      beats,
      TAP_TOL,
      PROFILE,
      { want },
    );
    expect(ahead.layBack.verdict).toBe("ahead");
    expect(ahead.layBack.feelOk).toBe(false);
    expect(trackTapText(ahead.diagnostics[0] as Diagnostic)).toContain("ahead of the beat");
    const none = gradeLayBackTaps([], beats, TAP_TOL, PROFILE, { want });
    expect(none.layBack.feelOk).toBe(false);
    expect(none.pass).toBe(false);
  });
});

describe("swing ratios of tapped 8ths and 16ths", () => {
  test("the feels and their ratios agree with content-kit and theory", () => {
    for (const f of SWING_FEELS) {
      expect(ratioOfAmount(f.amount)).toBeCloseTo(f.ratio, 9);
      expect(swingRatio(f.amount)).toBeCloseTo(f.ratio, 9);
      expect(swingFeelOf(f.ratio)?.id).toBe(f.id);
    }
    expect(swingFeelOf(1.1)?.label).toBe("Straight (1:1)");
    expect(swingFeelOf(Number.NaN)).toBeNull();
  });

  test("16ths swung by .2 at 76 BPM (AC2's hats) read 1.5:1, a light swing", () => {
    const grid = { downbeat: 0.5, bpm: 76, slots: 8, amount: 0.2, subdivision: 16 as const };
    const taps = jitter(swungTargets(grid), 4, 8);
    const r = gradeSwingTaps(taps, grid, TAP_TOL, PROFILE);
    expect(r.pass).toBe(true);
    expect(ratioText(r.swing.ratio)).toBe("1.5:1");
    expect(swingFeelOf(r.swing.ratio)?.id).toBe("light");
    expect(r.swing.feelOk).toBe(true);
  });

  test("8ths swung 2:1 at 88 BPM (R1.L02) read 2:1; straight 8ths against them fail the off-beats", () => {
    const grid = { downbeat: 0, bpm: 88, slots: 8, amount: 1 / 3 };
    const ok = gradeSwingTaps(swungTargets(grid), grid, TAP_TOL, PROFILE);
    expect(ratioText(ok.swing.ratio)).toBe("2:1");
    const straight = gradeSwingTaps(swungTargets({ ...grid, amount: 0 }), grid, TAP_TOL, PROFILE, LEVEL3);
    expect(straight.swing.cls).toBe("straight");
    expect(straight.swing.feelOk).toBe(false);
    expect(straight.pass).toBe(false);
  });
});

describe("the catalog rows", () => {
  test("every id this module adds renders with no unfilled slot", () => {
    const L = lanes();
    const tol: TapTolerance = TAP_TOL;
    const runs: Diagnostic[][] = [
      gradeLaneTaps(
        [L[0]?.targets ?? [], (L[1]?.targets ?? []).map((t, i) => (i % 3 ? t - 0.05 : t))],
        L,
        tol,
        PROFILE,
        { cycleSec: BAR, downbeat: 1 },
      ).diagnostics,
      gradeLaneTaps(
        [(L[0]?.targets ?? []).map((t, i) => (i % 2 ? t + 0.05 : t)), L[1]?.targets ?? []],
        L,
        tol,
        PROFILE,
      ).diagnostics,
      gradeLaneTaps([L[0]?.targets ?? [], []], L, tol, PROFILE).diagnostics,
      gradeLaneTaps([L[1]?.targets ?? [], L[0]?.targets ?? []], L, tol, PROFILE).diagnostics,
      gradeLaneTaps([L[0]?.targets ?? [], (L[1]?.targets ?? []).map((t) => t - 0.06)], L, tol, PROFILE)
        .diagnostics,
      gradeTimelineTaps(
        Array.from({ length: 8 }, (_, i) => i * 0.6),
        { downbeat: 0, bpm: 100, steps: [0, 3, 6], stepsPerBar: 8, cycles: 2 },
        tol,
        PROFILE,
      ).diagnostics,
      gradeClaveTaps(
        claveTargets({ downbeat: 0, bpm: 96, type: "son", direction: "2-3", bars: 2 }),
        { downbeat: 0, bpm: 96, type: "son", direction: "3-2", bars: 2 },
        tol,
        PROFILE,
      ).diagnostics,
      gradeClaveTaps(
        claveTargets({ downbeat: 0, bpm: 96, type: "rumba", direction: "3-2", bars: 2 }),
        { downbeat: 0, bpm: 96, type: "son", direction: "3-2", bars: 2 },
        tol,
        PROFILE,
        LEVEL3,
      ).diagnostics,
      gradeGroupingTaps(
        groupingTargets({ downbeat: 0, bpm: 210, meter: "7/8", groups: [3, 2, 2], bars: 2 }),
        { downbeat: 0, bpm: 210, meter: "7/8", bars: 2 },
        tol,
        PROFILE,
      ).diagnostics,
      gradeGroupingTaps(
        Array.from({ length: 7 }, (_, i) => (i * 2 * 60) / 210),
        { downbeat: 0, bpm: 210, meter: "7/8", bars: 2 },
        tol,
        PROFILE,
      ).diagnostics,
      gradeLayBackTaps([1.02, 2.02, 3.02, 4.02], [1, 2, 3, 4], tol, PROFILE).diagnostics,
    ];
    const seen = new Set<string>();
    for (const run of runs)
      for (const d of run) {
        const text = trackTapText(d);
        if (text === null) continue;
        seen.add(d.id);
        expect(text).not.toMatch(/[{}]|undefined|NaN/);
      }
    expect([...seen].sort()).toEqual(Object.keys(TRACK_TAP_FEEDBACK).sort());
    expect(trackTapText({ id: "tap.missed", params: {} })).toBeNull();
  });
});
