// The player's pure rules: steps at each target, the 15-minute split, resume, Continue, answer surfaces for
// every exercise kind, params per series, the rail, the reveal, and the feedback a widget is shown.
import { describe, expect, test } from "bun:test";
import type { Exercise, GradeResult, LessonDef, StepDef, StepState } from "@oak/api";
import sample from "../../../content/core/_sample/L00/lesson.ts";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import u06l11 from "../../../content/core/U06/L11/lesson.ts";
import type { AnswerSpec } from "../answers/types.ts";
import { answerFeedback, partMarks, revealValue } from "./feedback.ts";
import {
  answerSpecOf,
  canContinue,
  continueLabel,
  editorStart,
  hintText,
  initialTabOf,
  isCheckable,
  ladderOf,
  partRange,
  partsOf,
  questionSpec,
  railOf,
  revealCode,
  showsWorkbench,
  splitPartFor,
  startIndex,
  stepParams,
  viewsOf,
  visibleSteps,
  withParams,
  withTrialOptions,
} from "./model.ts";

const step = (def: LessonDef, id: string) => def.steps.find((s) => s.id === id) as StepDef;
const ex = (def: LessonDef, id: string) => step(def, id).exercise as Exercise;
const st = (patch: Partial<StepState> = {}): StepState => ({
  lessonId: "L",
  stepId: "S1",
  rung: 0,
  passed: false,
  attempts: 0,
  seriesNo: 0,
  revealAvailable: false,
  result: null,
  ...patch,
});
const result = (
  status: GradeResult["status"],
  diagnostics: GradeResult["diagnostics"] = [],
): GradeResult => ({
  exerciseId: "x",
  exerciseVersion: 1,
  attemptNo: 1,
  firstAttempt: true,
  mode: "lesson",
  status,
  score: status === "pass" ? 1 : 0,
  adjustedScore: 0,
  dims: {},
  constraints: [],
  diagnostics,
  messages: [],
  assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
});
const none = { state: null, result: null, done: false, disputed: false };

describe("targets and the 15-minute split", () => {
  test("optional steps only at 25", () => {
    expect(visibleSteps(sample, 20).map((s) => s.id)).not.toContain("S9");
    expect(visibleSteps(sample, 25).length).toBe(12);
  });

  test("U01.L01 (12.6 scaled minutes) splits at 15: part A, then part B once A is stored", () => {
    expect(splitPartFor(u01l01, 15, null)).toBe("A");
    expect(splitPartFor(u01l01, 20, null)).toBeNull();
    expect(splitPartFor(u01l01, 15, { splitPart: "A", status: "in_progress" })).toBe("B");
    expect(splitPartFor(u01l01, 20, { splitPart: "A", status: "in_progress" })).toBe("B");
    expect(splitPartFor(u01l01, 15, { splitPart: null, status: "completed" })).toBeNull();
  });

  test("part ranges end and start at wrapAt", () => {
    const steps = visibleSteps(u01l01, 15);
    expect(partRange(steps, "S6", "A")).toEqual([0, 5]);
    expect(partRange(steps, "S6", "B")).toEqual([6, 7]);
    expect(partRange(steps, "S6", null)).toEqual([0, 7]);
  });

  test("resume: ?step= wins, then the server's step inside the part, else the part's first", () => {
    const steps = visibleSteps(u01l01, 20);
    expect(startIndex(steps, { search: "S3", currentStep: "S5", range: [0, 7] })).toBe(2);
    expect(startIndex(steps, { currentStep: "S5", range: [0, 7] })).toBe(4);
    expect(startIndex(steps, { currentStep: "S6", range: [6, 7] })).toBe(6);
    expect(startIndex(steps, { currentStep: null, range: [0, 7] })).toBe(0);
  });
});

describe("Continue", () => {
  test("an ungraded step can be skipped; a graded one needs a pass, a reveal or a dispute", () => {
    expect(canContinue(step(u01l01, "S1"), none)).toBe(true);
    expect(continueLabel(step(u01l01, "S1"), none)).toBe("Skip");
    expect(continueLabel(step(u01l01, "S1"), { ...none, done: true })).toBe("Continue");
    const s6 = step(u01l01, "S6");
    expect(canContinue(s6, none)).toBe(false);
    expect(canContinue(s6, { ...none, result: result("fail") })).toBe(false);
    expect(canContinue(s6, { ...none, result: result("pass") })).toBe(true);
    expect(canContinue(s6, { ...none, state: st({ rung: 4 }) })).toBe(true);
    expect(canContinue(s6, { ...none, disputed: true })).toBe(true);
    expect(canContinue(step(u01l01, "S8"), { ...none, result: result("pass") })).toBe(false);
  });

  test("the rail marks done, current and assisted steps", () => {
    const steps = visibleSteps(u01l01, 20);
    const rail = railOf(steps, 2, (id) =>
      id === "S1"
        ? { ...none, done: true }
        : id === "S2"
          ? { ...none, state: st({ passed: true, rung: 1 }) }
          : none,
    );
    expect(rail.slice(0, 4).map((r) => r.state)).toEqual(["done", "done", "current", "todo"]);
    expect(rail[1]?.assisted).toBe(true);
    expect(rail[0]?.label).toBe("Listen: Find the beat");
  });
});

describe("answer surfaces (contracts §5.4)", () => {
  test("every non-code kind of the gate sample has one", () => {
    const parts = sample.steps.flatMap((s) => (s.exercise ? partsOf(s.exercise) : []));
    const surfaces = Object.fromEntries(parts.map((p) => [p.id, answerSpecOf(p)?.ui ?? null]));
    expect(surfaces).toMatchObject({
      "which-way": "choice",
      "index-of-5": "number",
      "keys-135": "keyboard",
      "read-1353": "choice",
      "see-the-climb": "choice",
      "which-degree": "degree-pad",
      "write-1353": "degree-pad",
      "sing-135": "mic",
      "tap-beat": "tap",
      "write-staff-1353": "staff-input",
      "fill-the-five": "blanks",
      "order-bars": "order",
      "hunt-the-six": null,
      "make-degree-tune": null,
    });
  });

  test("investigate questions map to choice, number and click surfaces", () => {
    const q = (ex(sample, "S4") as Extract<Exercise, { kind: "run-investigate" }>).questions;
    expect(q.map((x) => questionSpec(x).ui)).toEqual(["choice", "number"]);
    const all = ex(sample, "S11") as Extract<Exercise, { kind: "all" }>;
    const click = all.parts.find((p) => p.kind === "run-investigate") as Extract<
      Exercise,
      { kind: "run-investigate" }
    >;
    expect(questionSpec(click.questions[0] as never).ui).toBe("click-code");
  });

  test("the editor starts from the clean starter with its editable regions", () => {
    const start = editorStart(ex(sample, "S5"), undefined);
    expect(start?.code).toBe('setcpm(90/4)\n\nmel: n("0 1 2 3").scale("C4:major").s("piano")');
    expect(start?.editable).toEqual([{ from: 22, to: 29 }]);
  });

  test("checkable, ladders and workbench", () => {
    expect(isCheckable(ex(sample, "S1"))).toBe(false);
    expect(isCheckable(ex(sample, "S3"))).toBe(false);
    expect(isCheckable(ex(sample, "S4"))).toBe(true);
    expect(ladderOf(ex(sample, "S2"))).toBeNull();
    expect(hintText(ladderOf(ex(sample, "S5")) ?? (["", "", "", "auto"] as never), 1)).toBe(
      "Which number plays degree 1?",
    );
    expect(showsWorkbench(step(sample, "S6"))).toBe(false);
    expect(showsWorkbench(step(sample, "S5"))).toBe(true);
    expect(viewsOf(step(sample, "S6"))).toEqual(["staff", "keyboard"]);
  });

  test("the reveal shows the first solution, the answer of a choice, a keyboard chord", () => {
    expect(revealCode(ex(sample, "S5"))).toBe(
      'setcpm(90/4)\n\nmel: n("0 2 4 2").scale("C4:major").s("piano")',
    );
    const all = ex(sample, "S6") as Extract<Exercise, { kind: "all" }>;
    const read = all.parts[2] as Exercise;
    expect(revealValue(read, answerSpecOf(read), null)).toEqual(["1353"]);
    const kb = all.parts[1] as Exercise;
    expect(revealValue(kb, answerSpecOf(kb), null)).toBeNull();
  });
});

describe("params per series (contracts §5.5)", () => {
  const withParam = {
    ...ex(u01l01, "S6"),
    prompt: "Make it play at **{{param:target}}** beats per minute.",
    params: { target: { gen: "int", min: 70, max: 140, awayFrom: { value: 100, by: 15 } } },
  } as Exercise;
  test("the same series draws the same values; a new series draws again", () => {
    const a = stepParams("U01.L01", withParam, 0);
    expect(stepParams("U01.L01", withParam, 0)).toEqual(a);
    const values = new Set([0, 1, 2, 3, 4, 5].map((n) => stepParams("U01.L01", withParam, n).target));
    expect(values.size).toBeGreaterThan(1);
    for (const v of values) {
      expect(v as number).toBeGreaterThanOrEqual(70);
      expect(v as number).toBeLessThanOrEqual(140);
      expect(Math.abs((v as number) - 100)).toBeGreaterThanOrEqual(15);
    }
    expect(withParams(withParam, a).prompt).toBe(`Make it play at **${a.target}** beats per minute.`);
    expect(stepParams("U01.L01", ex(u01l01, "S6"), 3)).toEqual({});
  });
});

describe("widget feedback (redacted)", () => {
  const spec = { ui: "degree-pad" as const, set: ["1", "3", "5"] as never, sequenceLen: 4, syllables: false };
  const wrongSlot2 = result("fail", [
    { id: "melody.wrong-degree" as never, severity: "error", where: { slot: 2 }, params: {} },
  ]);
  test("a wrong slot is marked where it is; nothing more at rung 0", () => {
    expect(partMarks(wrongSlot2, spec)).toEqual([{ part: 1, ok: false }]);
    const fb = answerFeedback({
      result: wrongSlot2,
      checking: false,
      rung: 0,
      spec,
      reveal: ["1", "3", "5", "3"],
    });
    expect(fb.state).toBe("wrong");
  });
  test("pending while checking, correct on a pass, revealed at rung 4", () => {
    expect(answerFeedback({ result: null, checking: true, rung: 0, spec, reveal: null }).state).toBe(
      "pending",
    );
    expect(
      answerFeedback({ result: result("pass"), checking: false, rung: 0, spec, reveal: null }).state,
    ).toBe("correct");
    expect(
      answerFeedback({ result: wrongSlot2, checking: false, rung: 4, spec, reveal: ["1", "3", "5", "3"] }),
    ).toMatchObject({
      state: "revealed",
      correct: ["1", "3", "5", "3"],
    });
    expect(
      answerFeedback({ result: result("error"), checking: false, rung: 0, spec, reveal: null }).state,
    ).toBe("idle");
  });
});

describe("locked-tool copy", () => {
  test("the lint's locked-tool params fill the catalog's slots", async () => {
    const { lockedParams } = await import("./feedback.ts");
    const d = lockedParams(
      {
        id: "code.locked-mini" as never,
        severity: "error",
        params: { name: "alt", id: "tb.mini.alt", at: "U01.L07" },
      },
      (id) => (id === "tb.mini.alt" ? "< >" : null),
    );
    expect(d.params).toMatchObject({ tool: "< >", lesson: "U01.L07" });
  });
});

describe("a drawn trial's own choice options (U03.L01 Find home)", () => {
  const authored = {
    ui: "choice" as const,
    layout: "audio-cards" as const,
    options: [
      { id: "C", label: "C" },
      { id: "G", label: "G" },
    ],
  };
  test("the trial's options replace the authored ones, spelled, with their audio", () => {
    const spec = withTrialOptions(authored, {
      params: { options: ["Bb", "D", "F"], choiceAudio: [{ id: "Bb", audio: 'note("bb3")' }] },
    });
    expect(spec).toEqual({
      ui: "choice",
      layout: "audio-cards",
      options: [
        { id: "Bb", label: "B♭", audio: 'note("bb3")' },
        { id: "D", label: "D" },
        { id: "F", label: "F" },
      ],
    });
  });
  test("no trial, or a trial without options: the authored spec", () => {
    expect(withTrialOptions(authored, null)).toBe(authored);
    // A drawn melody sets how many degrees the pad takes (U03.L10 S2).
    const pad = { ui: "degree-pad", set: ["1", "2", "3"] } as AnswerSpec;
    expect(withTrialOptions(pad, { params: { sequenceLen: 4 } })).toEqual({ ...pad, sequenceLen: 4 });
    expect(withTrialOptions(pad, { params: {} })).toBe(pad);
    expect(withTrialOptions(authored, { params: {} })).toBe(authored);
    expect(withTrialOptions({ ui: "number" }, { params: { options: ["1"] } })).toEqual({ ui: "number" });
  });
});

describe("the Workbench tab a step opens on (review:journey)", () => {
  test("roll with the grand staff or the bass clef opens on Both; anything else keeps the default", () => {
    const at = (id: string) => u06l11.steps.find((x) => x.id === id) as StepDef;
    expect(initialTabOf(at("S3"))).toBe("both");
    expect(initialTabOf(at("S8"))).toBe("both");
    // The grand staff alone (no roll) has nothing to tab.
    expect(initialTabOf(at("S1"))).toBeUndefined();
    expect(initialTabOf(step(sample, "S6"))).toBeUndefined();
  });
});
