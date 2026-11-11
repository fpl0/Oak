// The checkpoint and capstone checks of content:check (content/validate/owners.ts) and the onboarding
// preview context, on known inputs: a worked U01.CP (fixtures/checkpoint.example.ts), deliberately broken
// copies of it, and the tested capstone briefs (C0, C1).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CheckpointDef } from "@oak/content-kit";
import { capstones } from "../capstones.ts";
import { exampleCheckpoint } from "./fixtures/checkpoint.example.ts";
import { grade, lint } from "./harness.ts";
import { checkCapstone, checkCheckpoint } from "./owners.ts";

setDefaultTimeout(120_000);
const issues = (sections: { name: string; issues: string[] }[]) =>
  sections.flatMap((s) => s.issues.map((i) => `${s.name}: ${i}`));

describe("checkpoints", () => {
  test("the worked U01.CP passes every check", async () => {
    expect(issues(await checkCheckpoint(exampleCheckpoint))).toEqual([]);
  });
  test("drift from the checkpoint map, a family that unlocks later and an unmeasured skill are caught", async () => {
    const broken: CheckpointDef = {
      ...exampleCheckpoint,
      gated: [...exampleCheckpoint.gated.filter((s) => s !== "R08"), "R08"],
      authored: exampleCheckpoint.authored.slice(0, 1),
      recipe: {
        ...exampleCheckpoint.recipe,
        families: { ...exampleCheckpoint.recipe.families, R08: [], N01: ["fam.not.read"] },
      },
    };
    const found = issues(await checkCheckpoint(broken)).join("\n");
    expect(found).toContain("gated [");
    expect(found).toContain("1 authored items");
    expect(found).toContain("fam.not.read unlocks at U02.L08, after U01.CP");
    expect(found).toContain("gated skill R08 has no authored item");
  });
});

describe("capstone briefs", () => {
  for (const id of ["C0", "C1"])
    test(`${id}: the brief, its tests and its unlocks pass`, async () => {
      const c = capstones.find((x) => x.id === id);
      expect(c?.brief?.tests.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(issues(await checkCapstone(c as NonNullable<typeof c>))).toEqual([]);
    });
});

describe("the onboarding loop is a preview context (contracts §3.1 rule 5a)", () => {
  const LOOP =
    'setcpm(92/4)\n\ndrums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)\nbass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)\nchords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)\nmel: n("<[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [4 ~ ~ ~]>").scale("C4:major").s("piano")';
  test("in U00.L01 the loop lints clean only as a preview", () => {
    const errors = (allowPreview: boolean) =>
      lint(LOOP, { session: "U00.L01", meter: "4/4", allowPreview }).diagnostics.filter(
        (d) => d.severity === "error",
      ).length;
    expect(errors(false)).toBeGreaterThan(0);
    expect(errors(true)).toBe(0);
  });
  test("a graded step in U00.L01 grades the loop instead of refusing its locked tools", async () => {
    const edited = LOOP.replace("[4 ~ ~ ~]>", "[6 ~ ~ ~]>");
    const r = await grade(
      {
        kind: "code-modify",
        id: "change-one-number",
        version: 1,
        role: "practice",
        prompt: "Change the last number.",
        skills: [{ skill: "D01", w: 1 }],
        hints: null,
        code: { starter: LOOP.replace("[4 ~ ~ ~]>", "[⟪4⟫ ~ ~ ~]>") },
        reference: { solutions: [edited], bars: 4 },
        matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false, tracks: ["mel"] },
        constraints: [{ c: "edit-only-regions" }],
        target: { audible: true },
        tests: [],
      },
      { name: "edited", response: { code: edited }, expect: "pass" },
      { id: "U00.L01", key: { tonic: "C", mode: "major" }, meter: "4/4", bpm: 92 },
      "U00.L01",
    );
    expect([r.passed, r.feedback.filter((f) => f.startsWith("code.locked"))]).toEqual([true, []]);
  });
});
