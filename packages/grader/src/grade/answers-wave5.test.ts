// Wave 5 answers (docs/design/wave5.md §11): the form strip graded on its shape, the 12-bar grid bar by bar by
// degree and quality (never by string), the scale builder as a set. Each miss names the actual fault.
import { describe, expect, test } from "bun:test";
import type { AnswerUi, ExBase, Exercise } from "@oak/content-kit";
import { renderFeedback } from "../feedback/catalog.ts";
import { gradeExercise } from "../index.ts";
import type { GradeContext } from "../types.ts";
import { gradeAnswer } from "./answers.ts";

const texts = (ds: readonly Parameters<typeof renderFeedback>[0][]) => ds.map((d) => renderFeedback(d));
const FORM: AnswerUi = { ui: "form", sections: 4, vocabulary: ["verse", "chorus", "bridge"], input: "label" };
const LETTERS: AnswerUi = { ui: "form", sections: 4, vocabulary: "letters", input: "label" };

describe("form answers: the shape, by first appearance", () => {
  test("names and letters are the same answer; a tagged chorus2 is a chorus", () => {
    const want = { sections: ["verse", "chorus", "verse", "chorus"] };
    expect(gradeAnswer(FORM, want, { sections: ["verse", "chorus", "verse", "chorus2"] }).score).toBe(1);
    expect(gradeAnswer(LETTERS, want, { sections: ["A", "B", "A", "B"] }).score).toBe(1);
    // A letter key is graded on its shape: BABA is the same form as ABAB.
    expect(
      gradeAnswer(LETTERS, { sections: ["A", "B", "A", "B"] }, { sections: ["B", "A", "B", "A"] }).score,
    ).toBe(1);
  });
  test("named sections are graded by type: calling the verse a chorus is wrong", () => {
    const want = { sections: ["verse", "chorus", "verse", "chorus"] };
    const r = gradeAnswer(FORM, want, { sections: ["chorus", "verse", "chorus", "verse"] });
    expect(r.score).toBe(0);
    expect(texts(r.diagnostics)[0]).toBe(
      "Section 1 is the verse (a new section), not the chorus (a new section).",
    );
  });
  test("a wrong slot says what that section is", () => {
    const r = gradeAnswer(
      FORM,
      { sections: ["verse", "chorus", "verse", "chorus"] },
      { sections: ["verse", "chorus", "bridge", "chorus"] },
    );
    expect(r.score).toBe(0.75);
    expect(r.slots).toEqual([1, 1, 0, 1]);
    expect(texts(r.diagnostics)).toEqual([
      "Section 3 is the verse again (a repeat of section 1), not the bridge (a new section).",
    ]);
    const aaba = gradeAnswer(LETTERS, { sections: ["A", "A", "B", "A"] }, { sections: ["A", "B", "B", "A"] });
    expect(texts(aaba.diagnostics)).toEqual(["Section 2 is a repeat of section 1, not a new section."]);
  });
  test("ordered cards (input order) and empty slots", () => {
    const cards: AnswerUi = {
      ui: "form",
      sections: 3,
      vocabulary: ["intro", "verse", "chorus"],
      input: "order",
    };
    expect(
      gradeAnswer(
        cards,
        { sections: ["intro", "verse", "chorus"] },
        { sections: ["intro", "verse", "chorus"] },
      ).score,
    ).toBe(1);
    // Distinct cards in the wrong order: every distinct order reads ABC, so the order is graded by name.
    const swapped = gradeAnswer(
      cards,
      { sections: ["intro", "verse", "chorus"] },
      { sections: ["intro", "chorus", "verse"] },
    );
    expect(swapped.slots).toEqual([1, 0, 0]);
    const r = gradeAnswer(
      FORM,
      { sections: ["verse", "chorus", "verse", "chorus"] },
      { sections: ["verse", "chorus"] },
    );
    expect(r.score).toBe(0.5);
    expect(r.diagnostics.map((d) => d.id)).toEqual(["id.missing"]);
  });
});

describe("the bar grid: bar by bar, by degree and quality", () => {
  const BLUES = "I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7".split(" ");
  const grid: AnswerUi = { ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"], given: [1] };
  const C_BLUES = { tonic: "C", mode: "blues" } as const;
  test("numerals in a blues key: right chart passes; a bar 5 left on I says it moves to IV", () => {
    expect(gradeAnswer(grid, { rn: BLUES }, { rn: BLUES }, { key: C_BLUES }).score).toBe(1);
    const wrong = [...BLUES];
    wrong[4] = "I7";
    const r = gradeAnswer(grid, { rn: BLUES }, { rn: wrong }, { key: C_BLUES });
    expect(r.score).toBeCloseTo(10 / 11);
    expect(texts(r.diagnostics)).toEqual([
      "Bar 5: IV7 (F7), not I7 (C7). In a 12-bar blues, bar 5 moves to IV.",
    ]);
    expect(r.diagnostics[0]?.where?.bar).toBe(5);
  });
  test("at seventh depth a triad is not the dominant seventh; the given bar 1 is not scored", () => {
    const tri = [...BLUES];
    tri[5] = "IV";
    tri[0] = "";
    const r = gradeAnswer(grid, { rn: BLUES }, { rn: tri }, { key: C_BLUES });
    expect(r.slots).toHaveLength(11);
    expect(texts(r.diagnostics)[0]).toBe(
      "Bar 6: IV7 (F7), not IV (F). Right root, but this bar is a dominant seventh: every chord of this blues is a dominant seventh.",
    );
  });
  test("chord symbols, compared by root and quality in any spelling (a triad grid reads the triad core)", () => {
    const sym: AnswerUi = { ui: "bar-grid", bars: 4, perRow: 4, entry: "symbol", qualities: ["maj", "min"] };
    const want = { text: ["C", "Am", "F", "G"] };
    expect(gradeAnswer(sym, want, { text: ["C", "Am", "F", "G7"] }).score).toBe(1);
    const r = gradeAnswer(sym, want, { text: ["C", "A", "F", "G"] });
    expect(texts(r.diagnostics)).toEqual(["Bar 2: Am, not A. Right root, but this bar is a minor triad."]);
    const blues: AnswerUi = { ui: "bar-grid", bars: 2, perRow: 4, entry: "symbol", qualities: ["7"] };
    expect(gradeAnswer(blues, { text: ["Bb7", "Eb7"] }, { text: ["A#7", "D#7"] }).score).toBe(1);
  });
});

describe("the scale builder: a set of degrees or pitch classes", () => {
  test("degrees ticked on a pad; a missing ♭5 is named with its syllable and note", () => {
    const ui: AnswerUi = { ui: "scale-builder", tonic: "C", input: "degrees" };
    const blues = { degrees: ["1", "b3", "4", "b5", "5", "b7"] as const };
    expect(
      gradeAnswer(ui, { degrees: [...blues.degrees] }, { degrees: ["b7", "5", "b5", "4", "b3", "1"] }).score,
    ).toBe(1);
    const r = gradeAnswer(ui, { degrees: [...blues.degrees] }, { degrees: ["1", "b3", "4", "5", "b7"] });
    expect(r.score).toBeCloseTo(10 / 11);
    expect(texts(r.diagnostics)).toEqual(["The blues scale also has ♭5 (se), the note G♭."]);
  });
  test("notes on a keyboard, any octave; an extra note is named", () => {
    const ui: AnswerUi = { ui: "scale-builder", tonic: "A", input: "keyboard" };
    const minorPent = { degrees: ["1", "b3", "4", "5", "b7"] as ("1" | "b3" | "4" | "5" | "b7")[] };
    expect(gradeAnswer(ui, minorPent, { midi: [57, 60, 62, 64, 67, 69, 72] }).score).toBe(1);
    const r = gradeAnswer(ui, minorPent, { midi: [57, 60, 62, 64, 66] });
    expect(texts(r.diagnostics)).toEqual([
      "The minor pentatonic also has ♭7 (te), the note G.",
      "6 (F♯) is not in the minor pentatonic.",
    ]);
    // Harmonic minor: the raised 7 (G♯ in A) is 7 (ti), not ♭7.
    const harm = gradeAnswer(
      ui,
      { degrees: ["1", "2", "b3", "4", "5", "b6", "7"] },
      { midi: [57, 59, 60, 62, 64, 65, 67] },
    );
    expect(texts(harm.diagnostics)).toEqual([
      "Harmonic minor also has 7 (ti), the note G♯.",
      "♭7 (G) is not in harmonic minor.",
    ]);
  });
});

describe("through gradeExercise: a fact step with a Wave 5 answer", () => {
  const base = <K extends string>(kind: K): ExBase<K> => ({
    kind,
    id: "x",
    version: 1,
    prompt: "",
    skills: [],
    role: "check",
    hints: null,
    tests: [],
  });
  const ctx: GradeContext = {
    exerciseGlobalId: "U11.L05/x",
    mode: "lesson",
    key: { tonic: "C", mode: "blues" },
    meter: "4/4",
    bpm: 100,
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0,
    tutorHints: 0,
    extraReplays: 0,
    lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  };
  test("bar-grid fact: pass and fail with the bar named", async () => {
    const BLUES = "I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7".split(" ");
    const ex = {
      ...base("fact"),
      answer: { ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"] },
      correct: { rn: BLUES },
    } as unknown as Exercise;
    const ok = await gradeExercise({ exercise: ex, response: { answer: { rn: BLUES } }, ctx });
    expect(ok.status).toBe("pass");
    const bad = [...BLUES];
    bad[8] = "IV7";
    const no = await gradeExercise({ exercise: ex, response: { answer: { rn: bad } }, ctx });
    expect(no.status).toBe("fail");
    expect(no.messages[0]?.text).toBe("Bar 9: V7 (G7), not IV7 (F7). Bar 9 is the high point: V.");
  });
});
