// Wave 6 (U13.L03, U13.L05; wave6.md §11 `staff-input.ties`, `.dots`, `.triplets`): a staff answer with ties, dotted
// values and triplets is graded by the events matcher with `durations: true`, on the events the staff widget sends.
// Those events come from @oak/notation's `parseNoteList`, as app/src/answers/staff/rhythm.ts builds them: a tied
// note is ONE event (it is one sound), a dotted quarter lasts 3/8 of a 4/4 bar, a triplet eighth 1/12. The
// references are Strudel's own `@` weights and brackets, so the code and the staff are compared as sounds.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExBase, ExerciseOf, GradeResult, NEvent } from "@oak/content-kit";
import { parseNoteList } from "@oak/notation";
import { METERS } from "@oak/theory";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";

setDefaultTimeout(30_000);
const deps = headlessDeps();
const base = <K extends string>(kind: K, id = "x"): ExBase<K> => ({
  kind,
  id,
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
});
const ctx: GradeContext = {
  exerciseGlobalId: "U13.L03/test",
  mode: "lesson",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 90,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
};
const ex = (
  solution: string,
  bars: number,
  durations: string[],
  ties = false,
): ExerciseOf<"staff-write"> => ({
  ...base("staff-write"),
  answer: {
    ui: "staff-input",
    clef: "treble",
    bars,
    key: { tonic: "C", mode: "major" },
    palette: { durations, accidentals: true, ties, rests: false },
  },
  expect: {
    e: "events",
    reference: { solutions: [solution], bars },
    matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: true },
  },
});
/** The events the staff widget sends for a note list (`C4:4.`, `G4:4~ | G4:4`, `C4:8t`). */
const staff = (list: string): { staff: NEvent[] } => ({
  staff: parseNoteList(list, { meter: METERS["4/4"], track: "staff" }),
});
const grade = (e: ExerciseOf<"staff-write">, list: string): Promise<GradeResult> =>
  gradeWith({ exercise: e, response: staff(list), ctx }, deps);
const texts = (r: GradeResult): string[] => r.diagnostics.map((d) => renderFeedback(d));
const findings = (r: GradeResult): string[] =>
  r.diagnostics.filter((d) => d.severity === "error" || d.severity === "warn").map((d) => d.id);

describe("ties: a note held over the bar line is one sound", () => {
  // G4 starts on beat 4 of bar 1 and holds into bar 2: `@2` in a line slowed over two bars.
  const e = ex('note("c4 d4 e4 g4@2 a4 b4 c5").slow(2).s("piano")', 2, ["4", "2"], true);
  test("written with a tie, it passes", async () => {
    const r = await grade(e, "C4:4 D4:4 E4:4 G4:4~ | G4:4 A4:4 B4:4 C5:4");
    expect(findings(r)).toEqual([]);
    expect(r.status).toBe("pass");
  });
  test("the tie left out strikes the G again: a note too many, at bar 2", async () => {
    const r = await grade(e, "C4:4 D4:4 E4:4 G4:4 | G4:4 A4:4 B4:4 C5:4");
    expect(r.status).toBe("fail");
    expect(texts(r)).toEqual(["Bar 2, 1: extra note 1.", "Bar 1, 4: a beat long, should be 2 beats."]);
  });
});

describe("dotted values: a dotted quarter is three eighths", () => {
  const e = ex('note("c4@3 d4 e4@2 f4@2").s("piano")', 1, ["4", "4.", "8"]);
  test("written dotted, it passes", async () => {
    const r = await grade(e, "C4:4. D4:8 E4:4 F4:4");
    expect(findings(r)).toEqual([]);
    expect(r.status).toBe("pass");
  });
  test("written as two quarters, the D lands on beat 2 instead of its and; the C is named a dotted quarter", async () => {
    const r = await grade(e, "C4:4 D4:4 E4:4 F4:4");
    expect(r.status).toBe("fail");
    expect(texts(r)).toContain("Bar 1, 1: a beat long, should be a dotted quarter.");
    expect(texts(r)).toContain("Bar 1, 2&: note 2 missing.");
  });
});

describe("triplets: three even notes to the beat", () => {
  const e = ex('note("[c4 d4 e4] f4 g4@2").s("piano")', 1, ["4", "2", "8", "8t"]);
  test("written as a triplet, it passes", async () => {
    const r = await grade(e, "C4:8t D4:8t E4:8t F4:4 G4:2");
    expect(findings(r)).toEqual([]);
    expect(r.status).toBe("pass");
  });
  test("written as straight eighths, the notes miss their places", async () => {
    const r = await grade(e, "C4:8 D4:8 E4:4 F4:4 G4:4");
    expect(r.status).toBe("fail");
    expect(texts(r)).toContain("Bar 1, 1: an 8th long, should be a triplet 8th.");
    expect(texts(r)).toContain("Bar 1, 1-trip: note 2 missing.");
  });
});
