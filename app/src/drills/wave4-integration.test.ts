// Wave 4 integration of the drills: the tutor's debrief at a set summary (tutor/context.ts `debriefDrill`), each
// finished trial with the answer it wanted and what the learner gave; and the Practice hub's honest status of a
// stage D family in mixed practice (graduated at mastery, or below it on a gated ladder, with its composite).
import { describe, expect, test } from "bun:test";
import { families } from "@content/families.ts";
import type { DrillTrialRecord, FamilyDef, FamilyState, Trial } from "@oak/api";
import { compositeLine, debriefTrials, familyStatus } from "./model.ts";

const trial = (expected: Trial["expected"]): Trial =>
  ({ expected, seed: 1, family: "fam.chd.quality-triad", level: 1, category: "maj" }) as unknown as Trial;
const rec = (idx: number, over: Partial<DrillTrialRecord> = {}): DrillTrialRecord =>
  ({
    idx,
    familyId: "fam.chd.quality-triad",
    seed: 1,
    level: 1,
    category: "maj",
    params: {},
    response: { answer: null, taps: null, sung: null, skipped: false },
    credit: 0,
    correct: false,
    rtMs: 900,
    replays: 0,
    confusion: null,
    centsError: null,
    at: "2026-11-12T10:00:00.000Z",
    ...over,
  }) as DrillTrialRecord;

describe("debriefTrials", () => {
  test("names the wanted answer and the learner's, trial by trial, 1-based", () => {
    const out = debriefTrials(
      [trial({ qualities: ["maj"] }), trial({ rn: ["I", "V", "vi", "IV"] }), trial({ degrees: ["1", "5"] })],
      [
        rec(0, {
          response: { answer: { qualities: ["maj"] }, taps: null, sung: null, skipped: false },
          correct: true,
        }),
        rec(1, {
          response: { answer: { rn: ["I", "V", "IV", "IV"] }, taps: null, sung: null, skipped: false },
        }),
        rec(2, { revealed: true }),
      ],
    );
    expect(out).toEqual([
      { n: 1, asked: "answer major", answered: "major", ok: true },
      { n: 2, asked: "answer I V vi IV", answered: "I V IV IV", ok: false },
      { n: 3, asked: "answer 1 5", answered: "nothing yet (I asked to be shown)", ok: false },
    ]);
  });

  test("a skipped trial, and a sung one with no picked answer", () => {
    const out = debriefTrials(
      [trial({ degrees: ["1"] }), trial({ degrees: ["3"] })],
      [
        rec(0, { response: { answer: null, taps: null, sung: null, skipped: true } }),
        rec(1, {
          credit: 0.8,
          correct: true,
          response: { answer: null, taps: null, sung: [{ midi: 64, cents: 5, credit: 0.8 }], skipped: false },
        }),
      ],
    );
    expect(out[0]?.answered).toBe("nothing (skipped)");
    expect(out[1]).toEqual({ n: 2, asked: "answer 3", answered: "by singing (80% in tune)", ok: true });
  });
});

const defs = new Map<string, FamilyDef>(families.map((f) => [f.id, f]));
const def = (id: string) => defs.get(id) as FamilyDef;
const state = (familyId: string, over: Partial<FamilyState> = {}): FamilyState =>
  ({
    familyId,
    level: 1,
    promoDay: null,
    categoryStats: {},
    confusion: {},
    blockedRemaining: 0,
    compositeId: null,
    graduatedAt: null,
    openCategories: [],
    maxOpenLevel: 1,
    restingSince: null,
    ...over,
  }) as FamilyState;

describe("stage D families in mixed practice", () => {
  const done = new Set(["U05.L01", "U06.L05", "U07.L04"]);
  const grad = { compositeId: "fam.mix.harmony", graduatedAt: "2026-10-18T10:00:00.000Z" };

  test("graduated at its mastery level: mastered, in Mixed harmony with the others", () => {
    const quality = def("fam.chd.quality-triad");
    const st = state(quality.id, { level: quality.masteryLevel, ...grad });
    const states = new Map([
      [quality.id, st],
      ["fam.har.bass", state("fam.har.bass", { level: 3, ...grad })],
      ["fam.har.cadence", state("fam.har.cadence", { level: 1 })],
    ]);
    expect(familyStatus(quality, st, done)).toBe("mastered");
    expect(compositeLine(st, states, defs)).toBe(
      "In Mixed harmony with 1 other family: two trials whenever it comes up, and its own sets come back if it needs them.",
    );
    expect(compositeLine(states.get("fam.har.cadence"), states, defs)).toBeNull();
  });

  test("graduated below its mastery level (a gated ladder) is in mixed practice, never mastered", () => {
    const dictation = def("fam.mel.dictation");
    expect(dictation.masteryLevel).toBeGreaterThan(3);
    const st = state(dictation.id, { level: 3, compositeId: "fam.mix.pitch", graduatedAt: grad.graduatedAt });
    expect(familyStatus(dictation, st, done)).toBe("resting");
    // Resting as the server reports it (decision 27) reads the same.
    expect(familyStatus(dictation, { ...st, restingSince: "2026-11-01" }, done)).toBe("resting");
    // On its own card below mastery: open.
    expect(familyStatus(dictation, state(dictation.id, { level: 3 }), done)).toBe("unlocked");
  });
});
