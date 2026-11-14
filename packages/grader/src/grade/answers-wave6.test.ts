// Wave 6 answers that are not code: the form map of a whole tune (`form` with `input: "map"`; CF-T.S1, ladder
// L8), the scale builder on the modes (U14: "raise or lower one note"), and Roman numerals with applied chords,
// sevenths and borrowed chords (U12, U15, U16). The key-per-slot palette is in key-plan-wave6.test.ts.
import { describe, expect, test } from "bun:test";
import type { Answer, AnswerUi, KeySpec } from "@oak/content-kit";
import { renderFeedback } from "../feedback/catalog.ts";
import { foldRefined, gradeAnswer } from "./answers.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const say = (
  ui: AnswerUi,
  correct: Answer,
  got: Answer,
  key: KeySpec = C,
  overrides?: Record<string, string>,
) => {
  const r = gradeAnswer(ui, correct, got, { key });
  return {
    score: r.score,
    slots: r.slots,
    ids: foldRefined(r.diagnostics, overrides).map((d) => d.id),
    texts: foldRefined(r.diagnostics, overrides).map((d) => renderFeedback(d, overrides)),
  };
};

describe("the form map (form.map)", () => {
  const ui: AnswerUi = {
    ui: "form",
    sections: 4,
    vocabulary: "letters",
    input: "map",
    bars: 32,
    sectionBars: [8, 8, 8, 8],
  };
  const key: Answer = { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] };
  test("right starts and the right shape, whatever the sections are called", () => {
    expect(say(ui, key, key).score).toBe(1);
    expect(
      say(ui, key, { sections: ["verse", "verse", "bridge", "verse"], bars: [1, 9, 17, 25] }).score,
    ).toBe(1);
  });
  test("a missing boundary costs its own section only, and points at the learner's section, never the bar", () => {
    const r = say(ui, key, { sections: ["A", "B", "A"], bars: [1, 17, 25] });
    expect([r.score, r.slots]).toEqual([0.75, [1, 0, 1, 1]]);
    expect(r.texts).toEqual([
      "Bars 1–16 hold more than one section: listen through them for the bar where the tune starts again or turns somewhere new.",
    ]);
    // The bar stays in the params for a host that marks the strip once the answer is revealed.
    const d = gradeAnswer(ui, key, { sections: ["A", "B", "A"], bars: [1, 17, 25] }, { key: C }).diagnostics;
    expect(d.find((x) => x.id === "form.map-start")?.params).toMatchObject({ bar: 9, from: 1, to: 16 });
  });
  test("the last section's missing boundary reads to the end of the tune", () => {
    const r = say(ui, key, { sections: ["A", "A", "B"], bars: [1, 9, 17] });
    expect(r.texts).toEqual([
      "Bars 17–32 hold more than one section: listen through them for the bar where the tune starts again or turns somewhere new.",
    ]);
  });
  test("a boundary where the tune has none lowers the score and is named", () => {
    const r = say(ui, key, { sections: ["A", "A", "A", "B", "A"], bars: [1, 5, 9, 17, 25] });
    expect(r.score).toBe(0.8);
    expect(r.texts).toEqual(["Bar 5 is inside a section: nothing new starts there."]);
  });
  test("a wrong label says what that section is", () => {
    const r = say(ui, key, { sections: ["A", "B", "B", "A"], bars: [1, 9, 17, 25] });
    expect(r.score).toBe(0.75);
    expect(r.texts).toEqual(["Section 2 is a repeat of section 1, not a new section."]);
  });
  test("an empty map is asked for, never graded as wrong", () => {
    expect(say(ui, key, { sections: [], bars: [] }).ids).toEqual(["id.missing"]);
  });
});

describe("the scale builder on the modes (U14)", () => {
  const ui = (tonic: string): AnswerUi =>
    ({
      ui: "scale-builder",
      tonic,
      input: "degrees",
      palette: ["1", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"],
      from: "major",
    }) as AnswerUi;
  const mixolydian: Answer = { degrees: ["1", "2", "3", "4", "5", "6", "b7"] };
  test("the scale it started from: one sentence names it and the note the mode changes", () => {
    const r = say(ui("G"), mixolydian, { degrees: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(r.texts[0]).toBe("That is the major scale; Mixolydian has ♭7 (F) in place of 7 (F♯).");
    // The note-by-note findings follow as notes, for a lesson that words them itself.
    expect(r.ids).toEqual(["id.scale-other", "id.scale-missing", "id.scale-extra"]);
    expect(r.score).toBeCloseTo(12 / 14, 6);
  });
  test("another mode: the F♯ and the C♯ make it Lydian", () => {
    const r = say(ui("G"), mixolydian, { degrees: ["1", "2", "3", "#4", "5", "6", "7"] });
    expect(r.texts[0]).toBe(
      "That is Lydian; Mixolydian has 4 (C) in place of ♯4 (C♯) and ♭7 (F) in place of 7 (F♯).",
    );
  });
  test("Lydian on F from F major: the 4 is raised to B", () => {
    const r = say(
      ui("F"),
      { degrees: ["1", "2", "3", "#4", "5", "6", "7"] },
      { degrees: ["1", "2", "3", "4", "5", "6", "7"] },
    );
    expect(r.texts[0]).toBe("That is the major scale; Lydian has ♯4 (B) in place of 4 (B♭).");
  });
  test("a note left out is still said note by note", () => {
    const r = say(ui("G"), mixolydian, { degrees: ["1", "2", "3", "4", "5", "6"] });
    expect(r.texts).toEqual(["Mixolydian also has ♭7 (te), the note F."]);
  });
});

describe("numerals with sevenths, applied and borrowed chords", () => {
  const ui: AnswerUi = { ui: "rn-palette", slots: 4, allow: ["triads", "sevenths", "secondary", "borrowed"] };
  test("right answers in every spelling of a flat", () => {
    expect(say(ui, { rn: ["IV", "V7/V", "V7", "I"] }, { rn: ["IV", "V7/V", "V7", "I"] }).score).toBe(1);
    expect(say(ui, { rn: ["I", "bVI", "bVII", "I"] }, { rn: ["I", "♭VI", "♭VII", "I"] }).score).toBe(1);
  });
  test("the right chord under its root name is told how an applied chord is named", () => {
    const r = say(ui, { rn: ["IV", "V7/V", "V7", "I"] }, { rn: ["IV", "II7", "V7", "I"] });
    expect(r.ids).toEqual(["harmony.rn-applied"]);
    expect(r.texts).toEqual([
      "Chord 2: II7 names the right notes (D7), but it leads to V (G), so it is named as that chord's own V: V7/V.",
    ]);
  });
  test("one applied chord for another: that is V7 of ii, the step asks for V7 of vi", () => {
    const r = say(ui, { rn: ["I", "V7/vi", "vi", "V"] }, { rn: ["I", "V7/ii", "vi", "V"] });
    expect(r.ids).toEqual(["harmony.rn-target"]);
    expect(r.texts).toEqual([
      "Chord 2: V7/ii is A7, which leads to ii (Dm); this chord is V7/vi (E7): it leads to vi (Am).",
    ]);
  });
  test("a missing 7th is a quality miss, not a slip of case", () => {
    const r = say(ui, { rn: ["ii7", "V7", "Imaj7", "I"] }, { rn: ["ii7", "V", "Imaj7", "I"] });
    expect(r.ids).toEqual(["harmony.rn-quality"]);
    expect(r.texts).toEqual(["Chord 2: right degree, but V7 is dominant 7th, not major (V)."]);
  });
  test("a real slip of case stays one; a borrowed chord a half step off is a degree miss", () => {
    expect(say(ui, { rn: ["I", "IV", "iv", "I"] }, { rn: ["I", "IV", "IV", "I"] }).ids).toEqual([
      "harmony.rn-case",
    ]);
    const r = say(ui, { rn: ["I", "bVI", "bVII", "I"] }, { rn: ["I", "VI", "bVII", "I"] });
    expect(r.texts).toEqual([
      "Chord 2: VI is built on degree 6 (A); this chord is ♭VI, built on degree ♭6 (A♭).",
    ]);
  });
  test("a lesson that words the older finding itself still gets it (the code it pinned stays)", () => {
    const overrides = {
      "harmony.rn-degree": "Chord {slot}: {got} does not fit {expChord} here.",
      "harmony.rn-case": "Chord {slot}: {got} is close; it is {exp}.",
    };
    const root = say(ui, { rn: ["IV", "V7/V", "V7", "I"] }, { rn: ["IV", "II7", "V7", "I"] }, C, overrides);
    expect([root.ids, root.texts]).toEqual([["harmony.rn-degree"], ["Chord 2: II7 does not fit D7 here."]]);
    const seventh = say(
      ui,
      { rn: ["IV", "V7/V", "V7", "I"] },
      { rn: ["IV", "V/V", "V7", "I"] },
      C,
      overrides,
    );
    expect([seventh.ids, seventh.texts]).toEqual([
      ["harmony.rn-case"],
      ["Chord 2: V/V is close; it is V7/V."],
    ]);
  });
  test("degrees are printed, not shown as the code spells them", () => {
    const pad: AnswerUi = { ui: "degree-pad", set: ["4", "#4", "5", "b7"], syllables: true };
    const r = say(pad, { degrees: ["#4"] }, { degrees: ["4"] });
    expect(r.texts).toEqual(["That was ♯4, not 4. Listen to both."]);
  });
});
