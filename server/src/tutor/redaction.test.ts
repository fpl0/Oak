import { describe, expect, test } from "bun:test";
import type { Rung } from "./domain.ts";
import {
  answerPolicy,
  compareView,
  decodeNested,
  disclosureLevel,
  findLeaks,
  forbiddenKeys,
  hintsShown,
  leakMarkers,
  lessonContextView,
  MAX_ISSUES,
  miniNotationLiterals,
  redactGrade,
  redactIssue,
} from "./redaction.ts";
import {
  GRADE,
  LESSON,
  MAKE_STEP,
  SOLUTION_CODE,
  STEP,
  stepState,
  VARIANT_CODE,
} from "./testing/fixtures.ts";

const RUNGS: Rung[] = [0, 1, 2, 3, 4];
const first = GRADE.issues[0];
const second = GRADE.issues[1];
if (!first || !second) throw new Error("fixture needs two issues");

describe("disclosure level", () => {
  test("is the rung, or 4 once the step has passed", () => {
    expect(disclosureLevel(null)).toBe(0);
    expect(disclosureLevel({ rung: 2, passed: false })).toBe(2);
    expect(disclosureLevel({ rung: 0, passed: true })).toBe(4);
  });

  test("answer policy", () => {
    expect(answerPolicy(STEP, 0)).toBe("socratic");
    expect(answerPolicy(STEP, 3)).toBe("socratic");
    expect(answerPolicy(STEP, 4)).toBe("may_reveal");
    expect(answerPolicy(MAKE_STEP, 0)).toBe("open");
    expect(answerPolicy(null, 0)).toBe("open");
  });
});

describe("issue view, row by row of the matrix", () => {
  test.each(RUNGS)("rung %i", (rung) => {
    const a = redactIssue(first, rung, 0);
    const b = redactIssue(second, rung, 1);
    // Where: every rung.
    for (const v of [a, b]) {
      expect(v.track).toBe("mel");
      expect(v.bar).toBe(1);
      expect(typeof v.beat).toBe("number");
      expect(v.code_range).not.toBeNull();
    }
    // What (kind, direction) and the concept at fault: from 2.
    expect("what" in a).toBe(rung >= 2);
    expect("feedback" in a).toBe(rung >= 2);
    expect("direction" in a).toBe(rung >= 2);
    expect("concept" in a).toBe(rung >= 2);
    // Fix and expected value: the first issue at 3, every issue at 4.
    expect("fix" in a).toBe(rung >= 3);
    expect("expected" in a).toBe(rung >= 3);
    expect("got" in a).toBe(rung >= 3);
    expect("fix" in b).toBe(rung >= 4);
    expect("expected" in b).toBe(rung >= 4);
    // A withheld field is absent, not null.
    const json = JSON.stringify([a, b]);
    for (const key of forbiddenKeys(rung)) expect(json).not.toContain(key);
  });

  test("the view never carries the grader's own IDs", () => {
    expect(Object.keys(redactIssue(first, 4, 0)).sort()).toEqual(
      [
        "bar",
        "beat",
        "code_range",
        "concept",
        "direction",
        "expected",
        "feedback",
        "fix",
        "got",
        "n",
        "severity",
        "track",
        "what",
      ].sort(),
    );
  });
});

describe("grade view", () => {
  test.each(RUNGS)("status, score, dims and counts at rung %i", (rung) => {
    const v = redactGrade(GRADE, rung);
    expect(v.status).toBe("fail");
    expect(v.score).toBe(0.67);
    expect(v.counts).toEqual({ missing: 0, extra: 0, wrong: 2 });
    expect(Object.keys(v.dims)).toEqual(["melody", "rhythm"]);
    expect(v.warnings).toEqual(["code.octave-default"]);
    expect(v.ab_target_allowed).toBe(rung >= 2);
    expect(v.redacted_to_rung).toBe(rung);
  });

  test("caps the number of issues and says how many were left out", () => {
    const many = { ...GRADE, issues: Array.from({ length: MAX_ISSUES + 5 }, () => first) };
    const v = redactGrade(many, 0);
    expect(v.issues).toHaveLength(MAX_ISSUES);
    expect(v.issues_omitted).toBe(5);
  });

  test("compare against an exercise is cut to the level; against code it is not", () => {
    expect("what" in (compareView(GRADE, 0, "exercise").issues[0] ?? {})).toBe(false);
    const open = compareView(GRADE, 0, "code");
    expect(open.issues[0]?.expected).toBe(first.expected);
    expect(open.issues[1]?.fix).toBe(second.fix);
  });
});

describe("get_lesson_context view", () => {
  test.each(RUNGS)("rung %i", (rung) => {
    const state = stepState({ rung, matchedMistakes: ["melody.degree-off-by-one"] });
    const v = lessonContextView(LESSON, STEP, state, disclosureLevel(state));
    const step = v.step;
    if (!step) throw new Error("no step");
    // Always: prompt, starter code, constraints, rubric labels and what is met.
    expect(step.prompt).toBe(STEP.prompt);
    expect(step.starter_code).toBe(STEP.starterCode);
    expect(step.constraints).toEqual(STEP.constraints);
    expect(step.rubric).toEqual([
      { label: "Reaches the octave", required: true, met: false },
      { label: "Ends on a chord tone", required: false, met: false },
    ]);
    expect(step.rung).toBe(rung);
    // Authored hints: nudge, + pointer, + partial, all.
    expect(step.hints_seen).toEqual((STEP.hints ?? []).slice(0, rung));
    // Known mistakes: the matching variant from 2, its code only at 4.
    expect(step.known_mistakes).toHaveLength(rung >= 2 ? 1 : 0);
    expect(step.known_mistakes[0]?.code === VARIANT_CODE).toBe(rung >= 4);
    expect("code" in (step.known_mistakes[0] ?? {})).toBe(rung >= 4);
    // The solution: 4 only.
    expect(step.solution).toBe(rung >= 4 ? SOLUTION_CODE : null);
    expect(step.answer_policy).toBe(rung >= 4 ? "may_reveal" : "socratic");
  });

  test("a known mistake the attempt did not match stays hidden until 4", () => {
    const at = (rung: Rung) =>
      lessonContextView(LESSON, STEP, stepState({ rung }), rung).step?.known_mistakes ?? [];
    expect(at(2)).toEqual([]);
    expect(at(3)).toEqual([]);
    expect(at(4)).toHaveLength(1);
  });

  test("a passed step is open at any rung", () => {
    const state = stepState({ rung: 0, passed: true });
    const v = lessonContextView(LESSON, STEP, state, disclosureLevel(state));
    expect(v.step?.solution).toBe(SOLUTION_CODE);
    expect(v.step?.hints_seen).toHaveLength(4);
  });

  test("a Make step has no reference: nothing to withhold, nothing to show", () => {
    const v = lessonContextView(LESSON, MAKE_STEP, stepState(), 0);
    expect(v.step?.solution).toBeNull();
    expect(v.step?.answer_policy).toBe("open");
    expect(v.step?.hints_seen).toEqual([]);
  });

  test("hintsShown without a ladder", () => {
    expect(hintsShown(null, 4)).toEqual([]);
  });
});

describe("leak markers", () => {
  const markers = leakMarkers(STEP, GRADE);

  test("mini-notation literals are whitespace-normalized and at least 8 characters", () => {
    expect(miniNotationLiterals('n("0  2 4\n7 4 2").scale("D4:dorian").s("x")')).toEqual([
      "0 2 4 7 4 2",
      "D4:dorian",
    ]);
  });

  test("cover the solution, its literal, the variant, hints and issue details", () => {
    const labels = new Set(markers.map((m) => m.label));
    for (const l of [
      "solution",
      "solution-literal",
      "wrong-variant-code",
      "hint-nudge",
      "hint-reveal",
      "issue1.what",
      "issue1.expected",
      "issue2.fix",
    ]) {
      expect(labels.has(l)).toBe(true);
    }
    // A literal that is already public in the starter code is not a secret.
    expect(markers.some((m) => m.text === "D4:dorian")).toBe(false);
  });

  test("finds a solution literal re-wrapped as JSON inside JSON, with odd whitespace", () => {
    const toolResult = JSON.stringify({ solution: 'mel: n("0 2  4 7 4 2")' });
    const body = JSON.stringify({
      messages: [{ role: "user", content: [{ type: "tool_result", content: toolResult }] }],
    });
    expect(decodeNested(body)).toContain('n("0 2  4 7 4 2")');
    expect(findLeaks(body, markers, 3).join("\n")).toContain("solution-literal");
    expect(findLeaks(body, markers, 4)).toEqual([]);
  });

  test.each(RUNGS)("the redacted views are clean at rung %i, and the raw data is not", (rung) => {
    const state = stepState({ rung, matchedMistakes: ["melody.degree-off-by-one"] });
    const views = JSON.stringify([lessonContextView(LESSON, STEP, state, rung), redactGrade(GRADE, rung)]);
    expect(findLeaks(views, markers, rung)).toEqual([]);
    if (rung < 4) expect(findLeaks(JSON.stringify([STEP, GRADE]), markers, rung).length).toBeGreaterThan(0);
  });
});
