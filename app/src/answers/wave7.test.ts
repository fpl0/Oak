// The Wave 7 answer contract: the two new kinds' empty value, completeness and wire response; the pad's grid in
// the odd meters; which choices and strips the registry draws as the tracks' pickers; the slider's new formats.
import { describe, expect, test } from "bun:test";
import { AttemptResponseSchema } from "@oak/api";
import { CLAVE_OPTIONS, SOUND_COMPARE_OPTIONS, TENSION_OPTIONS } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { sliderText } from "./keys.ts";
import { emptyValue, incompleteReason, isComplete, responseOf } from "./response.ts";
import { isClaveChoice } from "./rhythm7.ts";
import { comparePairOf, isRegisterChoice } from "./sound7.ts";
import { padGrid } from "./tap.ts";
import type { AnswerSpecOf } from "./types.ts";
import { isTensionChoice } from "./widgets/TensionPick.tsx";

const g78: AnswerSpecOf<"grouping"> = { ui: "grouping", meter: "7/8" };
const g54: AnswerSpecOf<"grouping"> = { ui: "grouping", meter: "5/4" };
const e8: AnswerSpecOf<"euclid"> = { ui: "euclid", maxSteps: 8, rotation: false };
const e16: AnswerSpecOf<"euclid"> = { ui: "euclid", maxSteps: 16, rotation: true };

describe("grouping and euclid answers", () => {
  test("a grouping is complete when 2s and 3s fill the bar", () => {
    expect(emptyValue(g78)).toEqual([]);
    expect(isComplete(g78, [2, 2])).toBe(false);
    expect(incompleteReason(g78, [2, 2])).toBe("3 eighths still to group.");
    expect(incompleteReason(g78, [])).toBe("7 eighths still to group.");
    expect(incompleteReason(g54, [3])).toBe("2 quarters still to group.");
    expect(isComplete(g78, [2, 2, 3])).toBe(true);
    expect(isComplete(g78, [2, 2, 3, 2])).toBe(false);
    expect(isComplete(g54, [3, 2])).toBe(true);
    expect(incompleteReason(g78, [2, 2, 3])).toBeNull();
  });

  test("a Euclid answer is complete as a rhythm", () => {
    expect(emptyValue(e8)).toEqual([]);
    expect(isComplete(e8, [])).toBe(false);
    expect(incompleteReason(e8, [])).toBe("Set the hits and the steps.");
    expect(isComplete(e8, [3, 8])).toBe(true);
    expect(isComplete(e8, [9, 8])).toBe(false);
    expect(isComplete(e16, [5, 16, 10])).toBe(true);
  });

  test("the wire response is the numbers, and passes the grader's schema; nothing set is skipped", () => {
    expect(responseOf(g78, [2, 2, 3])).toEqual({ answer: { grouping: [2, 2, 3] } });
    expect(responseOf(e16, [5, 16, 10])).toEqual({ answer: { euclid: [5, 16, 10] } });
    expect(responseOf(g78, [])).toEqual({ skipped: true });
    expect(responseOf(e8, [])).toEqual({ skipped: true });
    expect(AttemptResponseSchema.safeParse(responseOf(g78, [2, 2, 3])).success).toBe(true);
    expect(AttemptResponseSchema.safeParse(responseOf(e16, [5, 16, 10])).success).toBe(true);
  });
});

describe("the tap pad in odd meters", () => {
  test("7/8 is counted in its groups on a sixteenth grid, strong lines on the group starts", () => {
    const g = padGrid({ meter: METERS["7/8"] });
    expect(g.beatsPerBar).toBe(7);
    expect(g.stepsPerBeat).toBe(2);
    expect(g.counts.join(" ")).toBe("1 & 2 & 1 & 2 & 1 & 2 & 3 &");
    expect(g.groupStarts?.flatMap((s, i) => (s ? [i] : []))).toEqual([0, 4, 8]);
  });
  test("5/4 keeps its quarters, grouped 3+2", () => {
    const g = padGrid({ meter: METERS["5/4"] });
    expect(g.counts.filter((c) => /\d/.test(c)).join(" ")).toBe("1 2 3 1 2");
    expect(g.groupStarts?.flatMap((s, i) => (s ? [i] : []))).toEqual([0, 12]);
  });
  test("9/8i is 2+2+2+3; the other meters keep their grid without group lines", () => {
    expect(padGrid({ meter: METERS["9/8i"] }).groupStarts?.filter(Boolean)).toHaveLength(4);
    expect(padGrid({ meter: METERS["4/4"] }).groupStarts).toBeUndefined();
    expect(padGrid({ meter: METERS["6/8"] }).groupStarts).toBeUndefined();
  });
});

describe("which choices the registry draws as the tracks' pickers", () => {
  test("claves, tensions, A/B pairs and register bands; anything else stays a plain choice", () => {
    expect(isClaveChoice(CLAVE_OPTIONS)).toBe(true);
    expect(isClaveChoice(CLAVE_OPTIONS.slice(0, 2))).toBe(true);
    expect(isTensionChoice(TENSION_OPTIONS)).toBe(true);
    expect(isTensionChoice([{ id: "9" }, { id: "13" }])).toBe(true);
    expect(isTensionChoice([{ id: "9" }, { id: "major" }])).toBe(false);
    for (const pair of Object.values(SOUND_COMPARE_OPTIONS))
      expect(comparePairOf(pair as never)).not.toBeNull();
    expect(
      comparePairOf([
        { id: "major", label: "Major" },
        { id: "minor", label: "Minor" },
      ]),
    ).toBeNull();
    expect(isRegisterChoice([{ id: "bass" }, { id: "mid" }, { id: "high" }])).toBe(true);
    expect(isRegisterChoice([{ id: "tonic" }, { id: "dominant" }])).toBe(false);
  });
});

describe("slider formats", () => {
  test("milliseconds and hertz", () => {
    expect(sliderText(20, { format: "ms" })).toBe("20 ms");
    expect(sliderText(800, { format: "hz" })).toBe("800 Hz");
    expect(sliderText(2400, { format: "hz" })).toBe("2.4 kHz");
    expect(sliderText(1 / 3, { format: "swing" })).toBe("1/3 (triplet swing)");
  });
});
