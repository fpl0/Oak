// U09.CP, U10.CP and U11.CP in the checkpoint player (contracts §7.6): every family their recipes draw from (the
// groove lock and sections, minor degrees by ear, mode and key, the blues form and swing) gets an answer surface its
// drawn trial can be answered with, and the drill engine grades right as right; U10.CP's E10 sets a level and never
// gates; and the result names what a pass opens by title, never by ID.
import { describe, expect, test } from "bun:test";
import type { AttemptResponse, CheckpointItemSpec } from "@oak/api";
import { createRegistry, DECKS, FAMILIES, generateTrial, gradeTrial } from "@oak/drills";
import checkpointMetas from "../../../../content/checkpoints.ts";
import { syllabus } from "../../../../content/syllabus.ts";
import { lessonTitles } from "../../lib/content-model.ts";
import { NEUTRAL_PROFILE } from "../grading.ts";
import { familyAnswerSpec, familyResponse, isSungTrial, openedText, scoreLocal } from "./model.ts";

const W5_FAMILIES = [
  "fam.rhy.groove-lock",
  "fam.frm.sections",
  "fam.deg.fet-minor",
  "fam.key.mode",
  "fam.key.circle",
  "fam.frm.blues",
  "fam.rhy.swing",
] as const;

const registry = createRegistry(FAMILIES, DECKS);

describe("every U09–U11 checkpoint family has a surface, and its right answer grades right", () => {
  for (const id of W5_FAMILIES) {
    test(id, () => {
      const fam = registry.family(id as never);
      const cats = fam.def.categories.map((c) => c.id);
      let answered = 0;
      for (const level of [1, Math.max(1, fam.def.levels.length)]) {
        for (const seed of [1, 7, 42]) {
          const trial = generateTrial(
            fam,
            { index: 0, family: fam.def.id, level, category: cats[seed % cats.length] ?? "", seed },
            NEUTRAL_PROFILE,
            cats,
          );
          // A sung item is answered with the microphone (level-setting; set aside in Quiet mode); a tapped one
          // with real timing (the e2e covers it).
          if (isSungTrial(trial) || fam.def.answer === "mic" || fam.def.answer === "tap") continue;
          const spec = familyAnswerSpec(fam.def.answer, trial, cats, fam.def);
          expect(spec, `${id} L${level} seed ${seed}: a widget`).not.toBeNull();
          const response: AttemptResponse = { answer: trial.expected } as AttemptResponse;
          const r = gradeTrial(
            fam,
            trial,
            familyResponse(response, 1500, 1, 0, trial.expected, trial),
            NEUTRAL_PROFILE,
          );
          expect(
            r.credit,
            `${id} L${level} seed ${seed}: the expected answer is right`,
          ).toBeGreaterThanOrEqual(0.99);
          answered++;
        }
      }
      if (fam.def.answer !== "tap" && fam.def.answer !== "mic") expect(answered).toBeGreaterThan(0);
    });
  }
});

const item = (idx: number, skillId: string, role: CheckpointItemSpec["role"]): CheckpointItemSpec =>
  ({
    idx,
    skillId,
    role,
    source: { kind: "authored", exerciseId: `U10.CP/x${idx}` },
    debt: false,
  }) as CheckpointItemSpec;

describe("U09.CP–U11.CP: what gates and what sets a level", () => {
  const metas = new Map(checkpointMetas.map((m) => [m.id, m]));
  test("only U10.CP has a level-setting skill (E10, minor degrees by ear)", () => {
    expect(metas.get("U09.CP")?.levelSetting).toEqual([]);
    expect(metas.get("U10.CP")?.levelSetting).toEqual(["E10"]);
    expect(metas.get("U11.CP")?.levelSetting).toEqual([]);
  });

  for (const cpId of ["U09.CP", "U10.CP", "U11.CP"] as const) {
    test(`${cpId}: every gated skill right passes; E10 at 0 never holds it; a soft pass on a retake at 0.75`, () => {
      const meta = metas.get(cpId);
      if (!meta) throw new Error(cpId);
      const items: CheckpointItemSpec[] = [];
      for (const s of meta.gated)
        items.push(item(items.length, s, "gating"), item(items.length + 1, s, "gating"));
      for (const s of meta.levelSetting) items.push(item(items.length, s, "level-setting"));
      const at = (gate: number, level: number) =>
        new Map(
          items.map(
            (it) => [it.idx, { score: it.role === "gating" ? gate : level, skipped: false }] as const,
          ),
        );
      expect(scoreLocal(items, at(0.95, 0), 1).passed).toBe(true);
      // Under the line on a first attempt: not yet, no "Continue anyway".
      const first = scoreLocal(items, at(0.8, 1), 1);
      expect(first.passed).toBe(false);
      expect(first.softPassOffered).toBe(false);
      // The same score on the retake offers it (contracts §7.6: a retake ≥ 0.75).
      const retake = scoreLocal(items, at(0.8, 1), 2);
      expect(retake.passed).toBe(false);
      expect(retake.softPassOffered).toBe(true);
    });
  }
});

describe("the result names what opens by title", () => {
  const titles = lessonTitles(syllabus);
  test("U09.CP opens Grit and the Verse–Chorus Demo, never a lesson ID", () => {
    const text = openedText(["A1.L05", "C3"], titles);
    expect(text).toBe("Grit, C3 Verse–Chorus Demo");
    expect(text).not.toMatch(/\b[A-Z]\d+\.(L|CP|S)\d*/);
  });
  test("a capstone session reads as its capstone; an unknown ID is left out", () => {
    expect(openedText(["C4.S1"], titles)).toBe(titles.get("C4") as string);
    expect(openedText(["Z9.L99"], titles)).toBe("");
  });
});
