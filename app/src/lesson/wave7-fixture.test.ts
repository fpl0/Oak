// The Wave 7 two-hand tap in the lesson player (`tap.lanes`, contracts §8.4), against the real grader realm: every
// authored test of the dev fixture (R2.L99) through `gradeStep` as the player sends it (`{ lanes }`, seconds from
// bar 1), graded at once by @oak/pitch `gradeLaneTaps`; the wrong answers that use the right pad (swapped hands,
// one hand silent, four for three, one hand leaning early against the other) fail and say which hand; three other
// right answers pass; the take reaches the grader exactly as the pad's two voices split it (`lanesResponse`); and
// the stimulus plays what the lanes are graded against (headless Strudel).
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AttemptResponse, Exercise, SessionId } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import fixture, { at, BAR, FIXTURE7_CONTEXT, STIMULUS, THREE, TWO } from "./dev/wave7-fixture.ts";
import { type GradeEnv, type GraderDeps, gradeStep, NEUTRAL_PROFILE } from "./grading.ts";
import { lanesResponse, tapLanesOf } from "./wave7.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};

beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const env: GradeEnv = {
  ownerId: fixture.id,
  key: fixture.key,
  meter: fixture.meter,
  bpm: fixture.bpm,
  unlocked: unlockedAt(courseGraph(), toolbox, FIXTURE7_CONTEXT as SessionId),
  allowPreview: false,
  profile: NEUTRAL_PROFILE,
};
const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
const ex = fixture.steps[0]?.exercise as Exercise;
const grade = (lanes: number[][]) => gradeStep(deps, env, ex, { lanes } as unknown as AttemptResponse, opts);

describe("every authored test of the fixture, through the player's grading path", () => {
  for (const t of ex.tests)
    test(`S1 ${ex.id}: ${t.name} → ${t.expect}`, async () => {
      const r = await gradeStep(deps, env, ex, t.response as AttemptResponse, opts);
      if (t.expect === "pass") expect(r.status).toBe("pass");
      else expect(r.status).not.toBe("pass");
      for (const code of t.feedback ?? []) expect(r.diagnostics.map((d) => d.id)).toContain(code);
    });
});

describe("two hands graded together", () => {
  test("three other right answers pass: both hands early together, a few ms of spread, an extra bar's taps cut", async () => {
    const jitter = (xs: number[], ms: number) => xs.map((t, i) => t + ((i % 2 ? 1 : -1) * ms) / 1000);
    for (const lanes of [
      [TWO.map((t) => t - 0.04), THREE.map((t) => t - 0.04)],
      [jitter(TWO, 12), jitter(THREE, 15)],
      [TWO.slice(0, 7).concat(TWO[7] as number), THREE],
    ])
      expect((await grade(lanes)).status).toBe("pass");
  });

  test("the wrong answers that use the pad fail, each said for its hand", async () => {
    const swapped = await grade([THREE, TWO]);
    expect(swapped.status).not.toBe("pass");
    expect(swapped.diagnostics.map((d) => d.id)).toContain("tap.lanes-swapped");
    // The right hand silent: the three is missing; the left hand alone is not three against two.
    const silent = await grade([TWO, []]);
    expect(silent.status).not.toBe("pass");
    // Four for three on the right hand.
    const four = await grade([TWO, at([0, 1 / 4, 1 / 2, 3 / 4])]);
    expect(four.status).not.toBe("pass");
    // The right hand 70 ms early against the left throughout: one lane forgiven alone would pass it.
    const rushing = await grade([TWO, THREE.map((t, i) => (i % 3 === 0 ? t : t - 0.07))]);
    expect(rushing.status).not.toBe("pass");
  });

  test("the pad's take reaches the grader as the lanes it was tapped on", () => {
    expect(tapLanesOf(ex)).toEqual([
      { label: "Left hand: the 2, with the kick" },
      { label: "Right hand: the 3, with the cowbell" },
    ]);
    // AudioContext seconds, the take started at 10.0: F, J, J, F, J …
    const start = 10;
    const taps = [10, 10.002, 10 + BAR / 3, 10 + BAR / 2, 10 + (2 * BAR) / 3];
    const voices = [0, 1, 1, 0, 1] as const;
    expect(lanesResponse(taps, voices, start)).toEqual({
      lanes: [
        [0, Math.round((BAR / 2) * 1000) / 1000],
        [0.002, Math.round((BAR / 3) * 1000) / 1000, Math.round(((2 * BAR) / 3) * 1000) / 1000],
      ],
    } as unknown as AttemptResponse);
  });
});

describe("the fixture's music", () => {
  test("the kick plays the two and the cowbell the three, in every bar", async () => {
    const r = await evalHeadless(STIMULUS, 4);
    const on = (track: string) =>
      r.events
        .filter((e) => e.track === track)
        .map((e) => Math.round(Number(e.onset) * 1000) / 1000)
        .sort((a, b) => a - b);
    // One cycle a bar: onsets in cycles.
    const cycles = (fracs: number[]) =>
      [0, 1, 2, 3].flatMap((b) => fracs.map((f) => Math.round((b + f) * 1000) / 1000));
    expect(on("kick")).toEqual(cycles([0, 1 / 2]));
    expect(on("perc")).toEqual(cycles([0, 1 / 3, 2 / 3]));
    expect(TWO).toHaveLength(8);
    expect(THREE).toHaveLength(12);
  });
});
