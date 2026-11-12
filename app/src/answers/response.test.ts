import { describe, expect, test } from "bun:test";
import { AttemptResponseSchema } from "@oak/api";
import { emptyValue, isComplete, responseOf } from "./response.ts";
import type { AnswerSpec } from "./types.ts";

const SPECS: AnswerSpec[] = [
  { ui: "choice", options: [{ id: "a", label: "A" }] },
  { ui: "degree-pad", set: ["1", "3", "5"], sequenceLen: 2, syllables: false },
  { ui: "quality-pad", set: ["maj", "min"] },
  { ui: "rn-palette", slots: 3, allow: ["triads"] },
  { ui: "text", normalize: "note" },
  { ui: "number" },
  { ui: "keyboard", range: ["C4", "C5"], mode: "single" },
  {
    ui: "staff-input",
    clef: "treble",
    bars: 1,
    palette: { durations: ["q"], accidentals: false, ties: false, rests: true },
  },
  { ui: "grid", rows: ["hit"], stepsPerBar: 8, bars: 2 },
  { ui: "code", starter: 'drums: s("bd ~ sd ~")' },
  { ui: "tap" },
  { ui: "mic" },
  { ui: "bar-buttons", bars: 4 },
  { ui: "click-code", target: { bar: 1 } },
  { ui: "click-staff", target: { degree: "3" } },
  { ui: "click-roll", target: { nth: 1 } },
  { ui: "order", blocks: [{ id: "b1", text: "x" }], distractors: [], assemble: "lines" },
  { ui: "blanks", starter: 'n("⟦a⟧")', blanks: [{ id: "a", input: "text" }] },
  { ui: "hum", bars: 2 },
  { ui: "same-different", a: 'n("0 2 4")', b: 'n("0 2 5")' },
  { ui: "slider", min: 60, max: 180, step: 1, unit: "BPM" },
];

describe("AnswerWidget values", () => {
  test("every kind has an empty value whose response is a valid AttemptResponse", () => {
    for (const spec of SPECS) {
      const r = responseOf(spec, emptyValue(spec));
      expect({ ui: spec.ui, ok: AttemptResponseSchema.safeParse(r).success }).toEqual({
        ui: spec.ui,
        ok: true,
      });
    }
  });

  test("empty values are incomplete where something must be picked", () => {
    const incomplete = SPECS.filter((s) => !isComplete(s, emptyValue(s))).map((s) => s.ui);
    expect(incomplete).toEqual([
      "choice",
      "degree-pad",
      "quality-pad",
      "rn-palette",
      "text",
      "number",
      "keyboard",
      "staff-input",
      "tap",
      "mic",
      "bar-buttons",
      "click-code",
      "click-staff",
      "click-roll",
      "order",
      "blanks",
      "hum",
      "same-different",
      "slider",
    ]);
  });

  test("responses carry exactly what the grader reads", () => {
    const at = (i: number) => SPECS[i] as AnswerSpec;
    expect(responseOf(at(1), ["5", "1"])).toEqual({ answer: { degrees: ["5", "1"] } });
    expect(isComplete(at(1), ["5"])).toBe(false);
    expect(isComplete(at(1), ["5", "1"])).toBe(true);
    expect(responseOf(at(4), "  F# ")).toEqual({ answer: { text: ["F#"] } });
    expect(responseOf(at(5), 3)).toEqual({ answer: { number: 3 } });
    const grid = emptyValue(at(8) as Extract<AnswerSpec, { ui: "grid" }>);
    expect(grid[0]).toHaveLength(16);
    (grid[0] as boolean[])[0] = true;
    (grid[0] as boolean[])[6] = true;
    expect(responseOf(at(8), grid)).toEqual({ answer: { choice: ["0", "6"] } });
    const drums: AnswerSpec = { ui: "grid", rows: ["kick", "snare"], stepsPerBar: 8, bars: 1 };
    expect(
      responseOf(drums, [
        [true, false, false, false, false, false, false, false],
        [false, false, false, false, true, false, false, false],
      ]),
    ).toEqual({ answer: { choice: ["kick:0", "snare:4"] } });
    expect(responseOf(at(12), [2, 3])).toEqual({ click: "3" });
    expect(responseOf(at(13), { from: 4, to: 9 })).toEqual({ click: { from: 4, to: 9 } });
    expect(responseOf(at(14), "oak-e3")).toEqual({ click: "oak-e3" });
    expect(responseOf(at(17), { a: "0 2 4" })).toEqual({ blanks: { a: "0 2 4" } });
    expect(emptyValue(at(9) as Extract<AnswerSpec, { ui: "code" }>)).toBe('drums: s("bd ~ sd ~")');
    expect(responseOf(at(19), ["different"])).toEqual({ answer: { choice: ["different"] } });
    expect(responseOf(at(20), 96)).toEqual({ answer: { number: 96 } });
    expect(isComplete(at(20), 96)).toBe(true);
  });
});

describe("Wave 3 staff answers", () => {
  const palette = { durations: ["4"], accidentals: true, ties: false, rests: true };
  test("staff notes go out as the note list (bare pitches read as quarters)", () => {
    const spec: AnswerSpec = { ui: "staff-input", clef: "treble", bars: 1, palette };
    expect(responseOf(spec, "C4 E4 G4 C5")).toEqual({ staff: "C4:4 E4:4 G4:4 C5:4" });
    expect(responseOf(spec, "F#4:4 r:4 r:2")).toEqual({ staff: "F#4:4 r:4 r:2" });
  });
  test("a key signature goes out as answer.text in the order placed (wave3.md §10)", () => {
    const spec: AnswerSpec = { ui: "staff-input", clef: "treble", bars: 1, palette, mode: "key-signature" };
    const r = responseOf(spec, "F# C#");
    expect(r).toEqual({ answer: { text: ["F#", "C#"] } });
    expect(AttemptResponseSchema.safeParse(r).success).toBe(true);
    expect(isComplete(spec, "Bb")).toBe(true);
  });
});
