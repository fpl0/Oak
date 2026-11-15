// Wave 7 integration (packages): "tap 3 against 2" asks for both hands (contracts §8.4, wave7.md §11 `tap.lanes`).
// The generator writes the two lanes (`params.tapLanes`); a take sent as `response.lanes` is graded by @oak/pitch
// `gradeLaneTaps`, which forgives only the offset both hands share; a one-lane take on `taps` keeps the old grade.
import { describe, expect, test } from "bun:test";
import type { Answer, FamilyDef, Trial } from "@oak/content-kit";
import { FAMILIES } from "./catalog/families.ts";
import { bindFamily, DEFAULT_PROFILE, generateTrial, gradeTrial } from "./engine.ts";
import { tapLanesOfTrial } from "./grade.ts";
import { trialSeed } from "./rng.ts";

const def = FAMILIES.find((f) => f.id === "fam.rhy.polyrhythm") as FamilyDef;
const fam = bindFamily(def);
const make = (i: number, level = 3) =>
  generateTrial(
    fam,
    { index: i, family: def.id, level, category: "tap-3-over-2", seed: trialSeed(def.id, "lanes", i) },
    DEFAULT_PROFILE,
    ["tap-3-over-2"],
  ) as Trial<Answer>;
const grade = (t: Trial<Answer>, lanes: number[][]) =>
  gradeTrial(
    fam,
    t,
    { lanes, taps: lanes.flat().sort((a, b) => a - b), rtMs: 0, replays: 0 },
    DEFAULT_PROFILE,
  );

describe("tap 3 against 2 with two hands", () => {
  test("the trial carries both lanes: the 2 on F with the kick, the 3 on J, from bar 2", () => {
    for (let i = 0; i < 4; i++) {
      const t = make(i);
      const lanes = tapLanesOfTrial(t);
      expect(lanes?.map((l) => [l.key, l.targets.length])).toEqual([
        ["F", 6],
        ["J", 9],
      ]);
      // The 3 is the one-lane target list; the 2 falls with the kick, which plays every bar.
      expect(lanes?.[1]?.targets).toEqual(t.params.tapTargets as number[]);
      const kick = t.events
        .filter((e) => e.track === "low" && e.onset[0] / e.onset[1] >= 1)
        .map((e) => e.onset[0] / e.onset[1] / t.cps);
      for (const x of lanes?.[0]?.targets ?? []) expect(kick.some((k) => Math.abs(k - x) < 1e-9)).toBe(true);
    }
  });
  test("both hands right passes; three other right takes (late together, a little loose) pass", () => {
    const t = make(1);
    const [two, three] = (tapLanesOfTrial(t) ?? []).map((l) => l.targets) as [number[], number[]];
    const jig = (xs: number[], ms: number) => xs.map((x, i) => x + ((i % 3) - 1) * (ms / 1000));
    for (const [a, b] of [
      [two, three],
      [two.map((x) => x + 0.03), three.map((x) => x + 0.03)],
      [jig(two, 10), jig(three, 10)],
      [jig(two, 15), three],
    ] as [number[], number[]][])
      expect(grade(t, [a, b]).correct).toBe(true);
  });
  test("the right taps on swapped hands, one hand silent, or the three as even quarters fail", () => {
    const t = make(2);
    const [two, three] = (tapLanesOfTrial(t) ?? []).map((l) => l.targets) as [number[], number[]];
    const swapped = grade(t, [three, two]);
    expect(swapped.correct).toBe(false);
    expect(swapped.diagnostics.map((d) => d.id)).toContain("tap.lanes-swapped");
    expect(grade(t, [two, []]).correct).toBe(false);
    const beat = (two[1] as number) - (two[0] as number);
    const quarters = Array.from({ length: 12 }, (_, i) => (two[0] as number) + (i * beat) / 2);
    expect(grade(t, [two, quarters]).correct).toBe(false);
  });
  test("a one-lane take (taps only) is graded on the 3, as before", () => {
    const t = make(3);
    const three = t.params.tapTargets as number[];
    expect(gradeTrial(fam, t, { taps: three, rtMs: 0, replays: 0 }, DEFAULT_PROFILE).correct).toBe(true);
  });
});
