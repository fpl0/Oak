// U05.CP, U06.CP and U07.CP in the checkpoint player (contracts §7.6): every family their recipes draw from
// (chord quality, inversions, spelling, numerals, function, cadence, bass degrees, schemas, progressions,
// non-chord tones, melodic dictation, reading, sight-singing) gets an answer surface its drawn trial can be answered
// with and the drill engine grades right as right; and the ear and voice skills those checkpoints list
// (E08, E09, V05, V04) set levels and never gate: a zero on them still passes, a skip is left out.
import { describe, expect, test } from "bun:test";
import type { AttemptResponse, CheckpointItemSpec } from "@oak/api";
import { createRegistry, DECKS, FAMILIES, generateTrial, gradeTrial } from "@oak/drills";
import checkpointMetas from "../../../../content/checkpoints.ts";
import { expectedStaffValue } from "../../drills/staff.ts";
import { NEUTRAL_PROFILE } from "../grading.ts";
import { familyAnswerSpec, familyResponse, isSungTrial, scoreLocal } from "./model.ts";

const W4_FAMILIES = [
  "fam.chd.quality-triad",
  "fam.chd.inversion",
  "fam.chd.spell",
  "fam.har.rn",
  "fam.har.function",
  "fam.har.cadence",
  "fam.har.bass",
  "fam.har.schema",
  "fam.har.progression",
  "fam.mel.nct",
  "fam.mel.dictation",
  "fam.not.read",
  "fam.mel.sight",
] as const;

const registry = createRegistry(FAMILIES, DECKS);

describe("every U05–U07 checkpoint family has a surface, and its right answer grades right", () => {
  for (const id of W4_FAMILIES) {
    test(id, () => {
      const fam = registry.family(id as never);
      const cats = fam.def.categories.map((c) => c.id);
      for (const level of [1, Math.max(1, fam.def.levels.length)]) {
        for (const seed of [1, 7, 42]) {
          const trial = generateTrial(
            fam,
            { index: 0, family: fam.def.id, level, category: cats[seed % cats.length] ?? "", seed },
            NEUTRAL_PROFILE,
            cats,
          );
          // A sung item is answered with the microphone (level-setting; set aside in Quiet mode).
          if (isSungTrial(trial) || fam.def.answer === "mic") continue;
          const spec = familyAnswerSpec(fam.def.answer, trial, cats, fam.def);
          expect(spec, `${id} L${level} seed ${seed}: a widget`).not.toBeNull();
          // A tune written in code or on the staff (dictation's top levels) is graded as the code it spells.
          let response: AttemptResponse = { answer: trial.expected } as AttemptResponse;
          if (spec?.ui === "code") response = { code: trial.code };
          if (spec?.ui === "staff-input") response = { staff: expectedStaffValue(trial) ?? "" };
          if (spec?.ui === "code" && fam.def.answer === "code") continue;
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
        }
      }
    });
  }
});

const item = (idx: number, skillId: string, role: CheckpointItemSpec["role"]): CheckpointItemSpec =>
  ({
    idx,
    skillId,
    role,
    source: { kind: "authored", exerciseId: `U05.CP/x${idx}` },
    debt: false,
  }) as CheckpointItemSpec;

describe("ear and voice set levels, never gate (contracts §7.6)", () => {
  const metas = new Map(checkpointMetas.map((m) => [m.id, m]));
  test("the map lists E08, E09 and V05, V04 as level-setting", () => {
    expect(metas.get("U05.CP")?.levelSetting).toEqual(["E08"]);
    expect(metas.get("U06.CP")?.levelSetting).toEqual(["E09", "V05"]);
    expect(metas.get("U07.CP")?.levelSetting).toEqual(["V04"]);
  });

  for (const cpId of ["U05.CP", "U06.CP", "U07.CP"] as const) {
    test(`${cpId}: every gated skill right and every ear or voice item at 0 still passes`, () => {
      const meta = metas.get(cpId);
      if (!meta) throw new Error(cpId);
      const items: CheckpointItemSpec[] = [];
      for (const s of meta.gated)
        items.push(item(items.length, s, "gating"), item(items.length + 1, s, "gating"));
      for (const s of meta.levelSetting) items.push(item(items.length, s, "level-setting"));
      const records = new Map(
        items.map((it) => [it.idx, { score: it.role === "gating" ? 0.95 : 0, skipped: false }] as const),
      );
      const out = scoreLocal(items, records, 1);
      expect(out.passed).toBe(true);
      // Skipped (Quiet mode sets sung items aside) is left out, never counted as 0.
      const skipped = new Map(
        items.map((it) => [it.idx, { score: 0.95, skipped: it.role === "level-setting" }] as const),
      );
      expect(scoreLocal(items, skipped, 1).passed).toBe(true);
      // A gated skill below 0.70 does hold it.
      const low = new Map(records);
      low.set(0, { score: 0.2, skipped: false });
      low.set(1, { score: 0.2, skipped: false });
      expect(scoreLocal(items, low, 1).passed).toBe(false);
    });
  }
});
