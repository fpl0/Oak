// The checkpoint player's rules: the local score agrees with the server's (gating vs level-setting, skips,
// "Continue anyway"), family items get an answer surface their trial can be answered with and graded by the
// drill engine, and the result copy never shames.
import { describe, expect, test } from "bun:test";
import type { CheckpointItemSpec } from "@oak/api";
import { createRegistry, DECKS, FAMILIES, generateTrial, gradeTrial } from "@oak/drills";
import { NEUTRAL_PROFILE } from "../grading.ts";
import { familyAnswerSpec, familyResponse, resultCopy, scoreLocal, skillLine } from "./model.ts";

const item = (idx: number, skillId: string, role: CheckpointItemSpec["role"]): CheckpointItemSpec =>
  ({
    idx,
    skillId,
    role,
    source: { kind: "authored", exerciseId: `U01.CP/x${idx}` },
    debt: false,
  }) as CheckpointItemSpec;

const ITEMS = [
  item(0, "R02", "gating"),
  item(1, "R02", "gating"),
  item(2, "R03", "gating"),
  item(3, "R03", "gating"),
  item(4, "E01", "level-setting"),
  item(5, "E01", "level-setting"),
];
const rec = (scores: number[], skipped: number[] = []) =>
  new Map(scores.map((s, i) => [i, { score: s, skipped: skipped.includes(i) }]));

describe("the local score (contracts §7.6)", () => {
  test("pass needs 0.85 on gating items and every gated skill at 0.70; level-setting never blocks", () => {
    const r = scoreLocal(ITEMS, rec([1, 1, 1, 1, 0, 0]), 1);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.perSkill.find((p) => p.skillId === "E01")?.ok).toBe(false);
  });

  test("one weak gated skill fails even with a high mean", () => {
    // R02 = 1, R03 = 0.6 → mean 0.8 < 0.85 and R03 < 0.70.
    const r = scoreLocal(ITEMS, rec([1, 1, 0.6, 0.6, 1, 1]), 1);
    expect(r.passed).toBe(false);
    expect(r.softPassOffered).toBe(false);
  });

  test("a skipped level-setting item is left out; a skipped gating item scores 0", () => {
    const left = scoreLocal(ITEMS, rec([1, 1, 1, 1, 0, 0], [4, 5]), 1);
    expect(left.perSkill.find((p) => p.skillId === "E01")).toBeUndefined();
    const zero = scoreLocal(ITEMS, rec([1, 1, 1, 1, 1, 1], [0]), 1);
    expect(zero.score).toBe(0.75);
    expect(zero.passed).toBe(false);
  });

  test("Continue anyway: a retake at 0.75 or more, or any third attempt", () => {
    const s = rec([1, 1, 1, 0, 1, 1]); // gating 0.75, R03 0.5
    expect(scoreLocal(ITEMS, s, 1).softPassOffered).toBe(false);
    expect(scoreLocal(ITEMS, s, 2).softPassOffered).toBe(true);
    expect(scoreLocal(ITEMS, rec([0, 0, 0, 0, 0, 0]), 3).softPassOffered).toBe(true);
  });
});

describe("family items", () => {
  const reg = createRegistry(FAMILIES, DECKS);
  const draw = (id: string, seed = 11) => {
    const fam = reg.family(id as never);
    const cats = fam.def.categories.map((c) => c.id);
    return {
      fam,
      cats,
      trial: generateTrial(
        fam,
        { index: 0, family: fam.def.id, level: 1, category: cats[0] as string, seed },
        NEUTRAL_PROFILE,
        cats,
      ),
    };
  };

  test("a choice family offers the trial's own options, and its expected answer is one of them", () => {
    for (const id of ["fam.rhy.count", "fam.rhy.meter", "fam.pit.compare"]) {
      const { fam, cats, trial } = draw(id);
      const spec = familyAnswerSpec(fam.def.answer, trial, cats);
      expect(spec?.ui).toBe("choice");
      const ids = spec?.ui === "choice" ? spec.options.map((o) => o.id) : [];
      expect(ids).toContain(trial.expected.choice?.[0] as string);
    }
  });

  test("the expected answer earns full credit from the drill engine; another answer does not", () => {
    const { fam, cats, trial } = draw("fam.rhy.count", 5);
    const spec = familyAnswerSpec(fam.def.answer, trial, cats);
    const right = trial.expected.choice?.[0] as string;
    const wrong = (spec?.ui === "choice" ? spec.options.map((o) => o.id) : []).find(
      (o) => o !== right,
    ) as string;
    const ok = gradeTrial(
      fam,
      trial,
      familyResponse({ answer: { choice: [right] } }, 1500, 1),
      NEUTRAL_PROFILE,
    );
    const no = gradeTrial(
      fam,
      trial,
      familyResponse({ answer: { choice: [wrong] } }, 1500, 1),
      NEUTRAL_PROFILE,
    );
    expect(ok.credit).toBe(1);
    expect(no.credit).toBeLessThan(1);
  });

  test("grid, number, text and degree families get their surfaces", () => {
    const grid = draw("fam.rhy.dictation");
    expect(familyAnswerSpec(grid.fam.def.answer, grid.trial, grid.cats)).toMatchObject({
      ui: "grid",
      rows: ["hit"],
    });
    const idx = draw("fam.deg.index");
    expect(familyAnswerSpec(idx.fam.def.answer, idx.trial, idx.cats)?.ui).toBe("number");
    const kb = draw("fam.pit.keyboard");
    expect(familyAnswerSpec(kb.fam.def.answer, kb.trial, kb.cats)?.ui).toBe("text");
    const fet = draw("fam.deg.fet-major");
    expect(familyAnswerSpec(fet.fam.def.answer, fet.trial, fet.cats)).toMatchObject({ ui: "degree-pad" });
  });
});

describe("result copy", () => {
  test("calm in every case: no exclamation marks, never 'failed'", () => {
    for (const o of [
      { passed: true, softPass: false },
      { passed: false, softPass: true },
      { passed: false, softPass: false },
    ]) {
      const c = resultCopy(o);
      expect(`${c.title} ${c.body}`).not.toMatch(/!|fail/i);
    }
    expect(
      skillLine({ skillId: "E01" as never, role: "level-setting", mean: 0.2, items: 2, ok: false }).tone,
    ).toBe("level");
    expect(
      skillLine({ skillId: "R02" as never, role: "gating", mean: 0.5, items: 2, ok: false }).text,
    ).toContain("worth another look");
  });
});

describe("tap items", () => {
  test("an echo's taps are read from its response window; the trial's own targets earn credit", () => {
    const reg = createRegistry(FAMILIES, DECKS);
    for (const id of ["fam.rhy.read", "fam.rhy.echo"]) {
      const fam = reg.family(id as never);
      const cats = fam.def.categories.map((c) => c.id);
      const trial = generateTrial(
        fam,
        { index: 0, family: fam.def.id, level: 1, category: cats[0] as string, seed: 9 },
        NEUTRAL_PROFILE,
        cats,
      );
      const p = trial.params as { tapTargets: number[]; responseAt: number };
      const taps = p.tapTargets.map((t) => t + p.responseAt);
      const r = gradeTrial(fam, trial, familyResponse({ taps }, 1500, 1, p.responseAt), NEUTRAL_PROFILE);
      expect(r.credit).toBeGreaterThan(0.9);
    }
  });
});
