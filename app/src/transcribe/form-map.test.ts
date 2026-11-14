// The form map: cutting and naming, the answer as the server takes it, a check's marks per section, the map as
// the project's regions (kept on the server, exported with the project), and — through the real grader — that the
// answer this file builds is what `gradeFormMap` reads.
import { describe, expect, test } from "bun:test";
import type { GradeResult, SongDef } from "@oak/content-kit";
import { gradeFormMap } from "@oak/grader";
import {
  allNamed,
  barsInRecording,
  cleanLabel,
  emptyFormMap,
  type FormMap,
  formComment,
  formLettersOf,
  formMapAnswer,
  formMapOfRegions,
  formMapProblem,
  formMarks,
  formSummary,
  formVerdict,
  hasCut,
  normalizeFormMap,
  regionsOfFormMap,
  sameFormMap,
  sectionIndexAt,
  sectionsOf,
  setLabel,
  stepCut,
  toggleCut,
  withFormComment,
  withFormRegions,
} from "./form-map.ts";

const cut = (m: FormMap, ...bars: number[]) => bars.reduce((x, b) => toggleCut(x, b), m);
const name = (m: FormMap, ...labels: string[]) => labels.reduce((x, l, i) => setLabel(x, i, l), m);
const AABA = name(cut(emptyFormMap(32), 9, 17, 25), "A", "A", "B", "A");

const result = (over: Partial<GradeResult>): GradeResult =>
  ({
    exerciseId: "ladder",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "capstone",
    status: "fail",
    score: 0,
    adjustedScore: 0,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: [],
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
    ...over,
  }) as GradeResult;

describe("cutting and naming", () => {
  test("a tune starts as one unnamed section; a cut starts a new, unnamed one", () => {
    const m = emptyFormMap(32);
    expect(sectionsOf(m)).toEqual([{ index: 0, label: "", from: 1, to: 32, bars: 32 }]);
    const two = toggleCut(m, 17);
    expect(two.cuts).toEqual([1, 17]);
    expect(two.labels).toEqual(["", ""]);
    expect(hasCut(two, 17)).toBe(true);
    // Cuts land in order whatever order they are made in.
    expect(cut(m, 25, 9, 17).cuts).toEqual([1, 9, 17, 25]);
  });

  test("the same key joins two sections again: the left one keeps its name", () => {
    const joined = toggleCut(AABA, 17);
    expect(joined.cuts).toEqual([1, 9, 25]);
    expect(joined.labels).toEqual(["A", "A", "A"]);
    expect(sectionsOf(joined)[1]).toMatchObject({ from: 9, to: 24, bars: 16 });
  });

  test("bar 1 always starts a section, and a cut outside the tune does nothing", () => {
    expect(toggleCut(AABA, 1)).toBe(AABA);
    expect(toggleCut(AABA, 33)).toBe(AABA);
    expect(toggleCut(AABA, 0)).toBe(AABA);
  });

  test("labels: a letter is a capital, a variant keeps its digit, a word stays as typed", () => {
    expect(cleanLabel(" a ")).toBe("A");
    expect(cleanLabel("a2")).toBe("A2");
    expect(cleanLabel(" Bridge  two ")).toBe("Bridge two");
    expect(cleanLabel("x".repeat(40))).toHaveLength(24);
    expect(setLabel(AABA, 2, "bridge").labels).toEqual(["A", "A", "bridge", "A"]);
    expect(setLabel(AABA, 9, "C")).toBe(AABA);
  });

  test("sections, the one a bar is in, and stepping along the cuts", () => {
    expect(sectionsOf(AABA).map((s) => [s.from, s.to])).toEqual([
      [1, 8],
      [9, 16],
      [17, 24],
      [25, 32],
    ]);
    expect([1, 8, 9, 24, 25, 32, 40].map((b) => sectionIndexAt(AABA, b))).toEqual([0, 0, 1, 2, 3, 3, 3]);
    expect(stepCut(AABA, 9, 1)).toBe(17);
    expect(stepCut(AABA, 9, -1)).toBe(1);
    expect(stepCut(AABA, 25, 1)).toBeNull();
  });

  test("normalize: sorted, inside the tune, bar 1 first, no duplicates", () => {
    expect(normalizeFormMap({ bars: 16, cuts: [9, 9, 40, 5], labels: ["B", "x", "C", "Verse 2 "] })).toEqual({
      bars: 16,
      cuts: [1, 5, 9],
      labels: ["", "Verse 2", "B"],
    });
  });
});

describe("the form in words", () => {
  test("letters by first appearance; a section without a name is a dot", () => {
    expect(formLettersOf(AABA)).toBe("AABA");
    expect(formLettersOf(name(cut(emptyFormMap(32), 9, 17, 25), "verse", "verse", "bridge", "verse"))).toBe(
      "AABA",
    );
    expect(formLettersOf(setLabel(AABA, 2, ""))).toBe("AA·A");
    expect(allNamed(AABA)).toBe(true);
  });
  test("the summary names the labels as written and the lengths", () => {
    expect(formSummary(AABA)).toBe("A A B A · 4 sections of 8 bars");
    expect(formSummary(name(cut(emptyFormMap(32), 17, 25), "A", "B", "A"))).toBe("A B A · 16 + 8 + 8 bars");
  });
  test("what is still missing before a check, in the learner's words", () => {
    expect(formMapProblem(emptyFormMap(32))).toContain("Cut the tune");
    expect(formMapProblem(setLabel(AABA, 1, ""))).toBe(
      "Name section 2 (bars 9–16): a letter, or a word like chorus.",
    );
    expect(formMapProblem(AABA)).toBeNull();
  });
  test("a comment line for the code", () => {
    expect(formComment(AABA)).toBe("// Form: A (bars 1–8) · A (9–16) · B (17–24) · A (25–32)");
  });
  test("the comment goes under the tempo line and header comments, and replaces an earlier one", () => {
    const code = 'setcpm(120/4)\n// My song · C major\n\nmelody: n("0").scale("C4:major").s("piano")\n';
    const once = withFormComment(code, "// Form: A (bars 1–8) · B (9–16)");
    expect(once.split("\n").slice(0, 3)).toEqual([
      "setcpm(120/4)",
      "// My song · C major",
      "// Form: A (bars 1–8) · B (9–16)",
    ]);
    expect(once).toContain('melody: n("0")');
    const twice = withFormComment(once, "// Form: A (bars 1–16)");
    expect(twice.match(/^\/\/ Form: /gm)).toHaveLength(1);
    expect(twice).toContain("// Form: A (bars 1–16)");
    expect(withFormComment('melody: n("0")', "// Form: A (bars 1–4)")).toBe(
      '// Form: A (bars 1–4)\nmelody: n("0")',
    );
  });
});

const SONG = {
  answerKey: {
    bars: 32,
    code: "",
    layers: {},
    sections: [
      { label: "A", bars: [1, 8] },
      { label: "A", bars: [9, 16] },
      { label: "B", bars: [17, 24] },
      { label: "A", bars: [25, 32] },
    ],
  },
} as unknown as Pick<SongDef, "answerKey">;

describe("the answer, through the real grader", () => {
  test("the map as sent passes at 1, whatever the sections are called", () => {
    expect(formMapAnswer(AABA)).toEqual({ sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] });
    expect(gradeFormMap(formMapAnswer(AABA), SONG).passed).toBe(true);
    const words = name(cut(emptyFormMap(32), 9, 17, 25), "verse", "verse", "bridge", "verse");
    expect(gradeFormMap(formMapAnswer(words), SONG).score).toBe(1);
    // A tagged variant is the same section (A A2 B A3).
    const tagged = name(cut(emptyFormMap(32), 9, 17, 25), "A", "A2", "B", "A3");
    expect(gradeFormMap(formMapAnswer(tagged), SONG).passed).toBe(true);
  });
  test("a wrong name, a missing cut and an extra cut all fail, each short of 1", () => {
    expect(gradeFormMap(formMapAnswer(setLabel(AABA, 1, "B")), SONG).score).toBe(0.75);
    const halves = name(cut(emptyFormMap(32), 17), "A", "B");
    expect(gradeFormMap(formMapAnswer(halves), SONG).passed).toBe(false);
    const extra = name(cut(emptyFormMap(32), 9, 17, 21, 25), "A", "A", "B", "C", "A");
    expect(gradeFormMap(formMapAnswer(extra), SONG).score).toBe(0.8);
  });
});

describe("a check on the strip", () => {
  test("sections the grader named are issues; the rest are right", () => {
    const r = result({ score: 0.75, messages: [{ id: "form.label", text: "x", where: { bar: 9 } }] });
    expect([...formMarks(r, AABA)]).toEqual([
      [0, "ok"],
      [1, "issue"],
      [2, "ok"],
      [3, "ok"],
    ]);
    // A message inside a section marks that section, wherever in it the bar is.
    const mid = result({ messages: [{ id: "form.extra", text: "x", where: { bar: 21 } }] });
    expect(formMarks(mid, AABA).get(2)).toBe("issue");
    expect(formMarks(result({ status: "error" }), AABA).size).toBe(0);
  });
  test("the verdict counts sections and never says the answer", () => {
    expect(formVerdict({ passed: true, result: result({ status: "pass", score: 1 }) }, AABA)).toBe(
      "The form: that's it, A A B A.",
    );
    const v = formVerdict({ passed: false, result: result({ score: 0.75 }) }, AABA);
    expect(v).toContain("About 3 of your 4 sections are right");
    expect(v).not.toMatch(/AABA|bridge/);
    expect(formVerdict({ passed: false, result: result({ score: 0 }) }, AABA)).toContain(
      "No section is right yet",
    );
  });
});

describe("the map as the project's regions", () => {
  // A pattern source: 100 BPM in 4/4, no pickup. Own audio: bar 1 at 0.5 s.
  const clock = { firstBarS: 0, barSec: 2.4 };
  test("one section region per section, from its first bar line to the next section's", () => {
    const r = regionsOfFormMap(AABA, clock);
    expect(r.map((x) => [x.id, x.label, x.startS, x.endS, x.kind])).toEqual([
      ["form-1", "A", 0, 19.2, "section"],
      ["form-9", "A", 19.2, 38.4, "section"],
      ["form-17", "B", 38.4, 57.6, "section"],
      ["form-25", "A", 57.6, 76.8, "section"],
    ]);
  });
  test("read back, it is the same map (a backup, another device)", () => {
    const back = formMapOfRegions(regionsOfFormMap(AABA, clock), clock, 32);
    expect(back && sameFormMap(back, AABA)).toBe(true);
    const own = { firstBarS: 0.5, barSec: 2 };
    const again = formMapOfRegions(regionsOfFormMap(AABA, own), own, 32);
    expect(again?.cuts).toEqual([1, 9, 17, 25]);
  });
  test("sections named from loops on a recording snap to the nearest bar line", () => {
    const own = { firstBarS: 0.5, barSec: 2 };
    const m = formMapOfRegions(
      [
        { id: "s1", label: "Verse", startS: 0.52, endS: 16.4, kind: "section" },
        { id: "s2", label: "Chorus", startS: 16.61, endS: 32, kind: "section" },
        { id: "l1", label: "lick", startS: 4, endS: 5, kind: "loop" },
      ],
      own,
      24,
    );
    expect(m).toEqual({ bars: 24, cuts: [1, 9], labels: ["Verse", "Chorus"] });
    expect(m && formLettersOf(m)).toBe("AB");
    expect(formMapOfRegions([], own, 24)).toBeNull();
    expect(
      formMapOfRegions([{ id: "s", label: "x", startS: 0, endS: 1, kind: "section" }], null, 24),
    ).toBeNull();
  });
  test("writing the map keeps the learner's loops and replaces every section with the map's", () => {
    const own = { firstBarS: 0.5, barSec: 2 };
    const before = [
      { id: "l1", label: "lick", startS: 4, endS: 5, kind: "loop" as const },
      { id: "s1", label: "Verse", startS: 0.5, endS: 16.5, kind: "section" as const },
      { id: "s2", label: "Solo", startS: 8.6, endS: 12, kind: "section" as const },
      { id: "form-9", label: "B", startS: 16.5, endS: 32.5, kind: "section" as const },
    ];
    // The strip shows all three as sections (bars 1, 5 and 9); joining at bar 5 removes the hand-named one too.
    const read = formMapOfRegions(before, own, 16) as FormMap;
    expect(read.cuts).toEqual([1, 5, 9]);
    const after = withFormRegions(before, toggleCut(read, 5), own);
    expect(after.map((r) => [r.id, r.label])).toEqual([
      ["l1", "lick"],
      ["form-1", "Verse"],
      ["form-9", "B"],
    ]);
    // One unnamed section is no map at all: the sections go, the loop stays.
    expect(withFormRegions(before, emptyFormMap(16), own).map((r) => r.id)).toEqual(["l1"]);
  });
  test("whole bars of a recording from bar 1 on", () => {
    expect(barsInRecording(64.5, { firstBarS: 0.5, barSec: 2 })).toBe(32);
    expect(barsInRecording(1, { firstBarS: 0.5, barSec: 2 })).toBe(1);
  });
});
