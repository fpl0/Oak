import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { chordOfRoman, readChord } from "@oak/theory";
import {
  chordCount,
  currentStage,
  emptyStaged,
  type StagedSpec,
  stageComplete,
  stagedResponse,
  stageStatuses,
  stageWidget,
} from "./stages.ts";

/** U06.L05-style: four chords, bass degree, then quality, then numeral. */
const spec: StagedSpec = {
  stages: ["bass", "quality", "rn"],
  stageAnswers: {
    bass: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6", "7"], sequenceLen: 4, syllables: false },
    quality: { ui: "quality-pad", set: ["maj", "min", "dim"] },
    rn: { ui: "rn-palette", slots: 4, allow: ["triads"] },
  },
};

describe("staged chord dictation", () => {
  test("one entry per chord in every stage: the quality pad becomes a strip of four", () => {
    expect(chordCount(spec)).toBe(4);
    const q = stageWidget(spec, "quality");
    expect(q?.ui).toBe("slot-choice");
    expect(q?.ui === "slot-choice" ? q.options.map((o) => o.id) : []).toEqual(["maj", "min", "dim"]);
    expect(stageWidget(spec, "bass")?.ui).toBe("degree-pad");
    expect(stageWidget(spec, "tonic")).toBeNull();
    const one: StagedSpec = {
      ...spec,
      stageAnswers: { quality: { ui: "quality-pad", set: ["maj", "min"] } },
    };
    expect(stageWidget(one, "quality")?.ui).toBe("quality-pad");
  });

  test("sequential: the bass first, then each stage when the one before is right or shown", () => {
    expect(stageStatuses(spec, {})).toEqual({ bass: "open", quality: "locked", rn: "locked" });
    expect(stageStatuses(spec, { bass: { state: "wrong" } })).toEqual({
      bass: "open",
      quality: "locked",
      rn: "locked",
    });
    expect(stageStatuses(spec, { bass: { state: "correct" } })).toEqual({
      bass: "passed",
      quality: "open",
      rn: "locked",
    });
    expect(
      stageStatuses(spec, { bass: { state: "correct" }, quality: { state: "revealed", correct: [] } }),
    ).toEqual({ bass: "passed", quality: "revealed", rn: "open" });
    expect(stageStatuses(spec, { bass: { state: "pending" } }).bass).toBe("pending");
    expect(currentStage(spec, { bass: { state: "correct" } })).toBe("quality");
    expect(
      currentStage(spec, {
        bass: { state: "correct" },
        quality: { state: "correct" },
        rn: { state: "correct" },
      }),
    ).toBeNull();
  });

  test("together: every unfinished stage is open", () => {
    expect(stageStatuses({ ...spec, flow: "together" }, { quality: { state: "correct" } })).toEqual({
      bass: "open",
      quality: "passed",
      rn: "open",
    });
  });

  test("empty values, completeness, and the response the grader reads", () => {
    const v = emptyStaged(spec);
    expect(v).toEqual({ bass: [], quality: ["", "", "", ""], rn: ["", "", "", ""] });
    expect(stageComplete(spec, "bass", v)).toBe(false);
    const filled = {
      bass: ["1", "5", "6", "4"],
      quality: ["maj", "maj", "min", "maj"],
      rn: ["I", "V", "vi", "IV"],
    };
    expect(stageComplete(spec, "bass", filled)).toBe(true);
    expect(stageComplete(spec, "quality", { ...filled, quality: ["maj", "", "min", "maj"] })).toBe(false);
    expect(stagedResponse(spec, filled, "bass")).toEqual({
      answer: { stages: { bass: ["1", "5", "6", "4"] } },
    });
    expect(stagedResponse(spec, filled)).toEqual({ answer: { stages: filled } });
  });

  test("the gallery's loop is what the stages say: I V vi IV in C, bass 1 5 6 4", async () => {
    const C = { tonic: "C", mode: "major" } as const;
    const evs = await evalHeadless(
      'setcpm(90/4)\nchords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C4:major").s("piano")\nbass: n("<0 4 5 3>").scale("C2:major").s("piano")',
      4,
    );
    const bar = (c: number) =>
      evs.events.filter((e) => Math.floor(e.onset) === c).map((e) => e.midi as number);
    const read = [0, 1, 2, 3].map((c) => {
      const ms = bar(c);
      return readChord(ms, Math.min(...ms));
    });
    expect(read.map((r) => r?.leadSheet)).toEqual(["C", "G", "Am", "F"]);
    expect(read.map((r) => r?.quality)).toEqual(["maj", "maj", "min", "maj"]);
    expect(["I", "V", "vi", "IV"].map((rn) => chordOfRoman(rn, C)?.root)).toEqual(["C", "G", "A", "F"]);
  });
});
