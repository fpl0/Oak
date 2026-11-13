// Wave 5 in the lesson and checkpoint players: side lessons (optional, framed, never reported to a session that is
// not theirs, back to where the learner was), a step whose answer cannot be drawn yet (Continue opens, never a
// pass), "match this sound" steps, the scope panel a step asks for, and the five exemplars' steps resolving to
// answer surfaces the player knows.
import { describe, expect, test } from "bun:test";
import type { Exercise, GradeResult, LessonDef, StepDef, StepState } from "@oak/api";
import { SIDE_LESSON_IDS } from "@oak/api";
import { createActor, waitFor } from "xstate";
import a1l01 from "../../../content/advanced/A1/L01/lesson.ts";
import u08l01 from "../../../content/core/U08/L01/lesson.ts";
import u09l02 from "../../../content/core/U09/L02/lesson.ts";
import u10l01 from "../../../content/core/U10/L01/lesson.ts";
import u11l05 from "../../../content/core/U11/L05/lesson.ts";
import type { AnswerSpec } from "../answers/types.ts";
import { issueLines, shapeOf, summaryOf, viewFor } from "./feedback.ts";
import { type LessonDeps, lessonMachine, progressOf, snapshotOf } from "./machine.ts";
import { answerSpecOf, canContinue, continueLabel, partsOf, stepDone } from "./model.ts";
import { atOrAfter, singLabelsFor } from "./rules.ts";
import {
  aboutMinutes,
  isLessonOrigin,
  isSideLesson,
  nextSideLesson,
  originLink,
  reportsToSession,
  SIDE_OFFERS,
  sideInfo,
  sideMinutes,
} from "./side.ts";
import { answerMissing, isMatchSound, MATCH_SOUND_LABELS, stepScopePanel } from "./wave5.ts";

const EXEMPLARS = [u08l01, u09l02, u10l01, u11l05, a1l01] as unknown as LessonDef[];

describe("side lessons", () => {
  test("A1.L01–L04 are side lessons, by their course-map row or their ID; the core is not", () => {
    for (const id of SIDE_LESSON_IDS) expect(isSideLesson(id, null)).toBe(true);
    expect(isSideLesson("A1.L05", null)).toBe(false);
    expect(isSideLesson("A1.L05", { side: true })).toBe(true);
    expect(isSideLesson("U08.L01", null)).toBe(false);
    expect(isSideLesson("U03.L02", { side: false })).toBe(false);
  });

  test("the framing says optional, how long, what it makes better and that nothing waits for it", () => {
    const info = sideInfo("A1.L01", { objective: "x" }, sideMinutes(a1l01 as unknown as LessonDef));
    expect(info.heading).toBe("Optional side lesson, about 15 minutes");
    expect(info.offer).toBe(SIDE_OFFERS["A1.L01"] as string);
    expect(info.offer).toContain("sawtooth");
    expect(info.note).toMatch(/Nothing in the course waits for it/);
    // Never "required", never a count of what is left (A1 spec conventions).
    for (const id of SIDE_LESSON_IDS) {
      const t = `${sideInfo(id, null, 12).heading} ${sideInfo(id, null, 12).offer}`;
      expect(t).not.toMatch(/required|must|left to do|remaining/i);
      expect(sideInfo(id, null, 12).offer.length).toBeGreaterThan(20);
    }
    // A side lesson without an offer line reads its course-map objective.
    expect(sideInfo("A1.L09", { objective: "Saturation and bit reduction." }, 10).offer).toBe(
      "Saturation and bit reduction.",
    );
  });

  test("minutes are never understated: up to the next five", () => {
    expect(aboutMinutes(11.55)).toBe(15);
    expect(aboutMinutes(15)).toBe(15);
    expect(aboutMinutes(15.2)).toBe(20);
    expect(aboutMinutes(1)).toBe(5);
    // A1.L01 at 8.25 authored minutes: 11.55 scaled.
    expect(sideMinutes(a1l01 as unknown as LessonDef)).toBeCloseTo(11.55, 2);
  });

  test("the track goes on in order; the last one has no next", () => {
    expect(nextSideLesson("A1.L01", SIDE_LESSON_IDS)).toBe("A1.L02");
    expect(nextSideLesson("A1.L03", SIDE_LESSON_IDS)).toBe("A1.L04");
    expect(nextSideLesson("A1.L04", SIDE_LESSON_IDS)).toBeNull();
    expect(nextSideLesson("U08.L01", SIDE_LESSON_IDS)).toBeNull();
  });

  test("back to where the learner came from", () => {
    expect(originLink(undefined)).toEqual({ to: "/", label: "Back to Today" });
    expect(originLink("today").to).toBe("/");
    expect(originLink("toolbox")).toEqual({ to: "/toolbox", label: "Back to the Toolbox" });
    expect(originLink("map").to).toBe("/oak");
    expect(originLink("progress").to).toBe("/progress");
    expect(isLessonOrigin("toolbox")).toBe(true);
    expect(isLessonOrigin("studio")).toBe(false);
  });

  test("only the session's own lesson reports to it: a side lesson beside a core session leaves it alone", () => {
    expect(reportsToSession("U10.L03", { mapItemId: "U10.L03" })).toBe(true);
    expect(reportsToSession("A1.L01", { mapItemId: "U10.L03" })).toBe(false);
    expect(reportsToSession("A1.L02", { mapItemId: "A1.L02" })).toBe(true);
    expect(reportsToSession("U10.L03", null)).toBe(false);
  });

  test("a side lesson is judged at its gate: it sings on numbers, like U03.L02", () => {
    expect(atOrAfter("A1.L01", "U03.L02")).toBe(true);
    expect(atOrAfter("A1.L03", "U03.L08")).toBe(false);
    expect(singLabelsFor({}, "A1.L02")).toBe("numbers");
    expect(singLabelsFor({}, "U10.L01")).toBe("syllables");
  });
});

describe("an answer the app cannot draw yet", () => {
  const form: Exercise = {
    kind: "identify",
    id: "which-form",
    version: 1,
    role: "lesson",
    prompt: "Label each section.",
    skills: [{ skill: "F02" as never, w: 1 }],
    hints: null,
    tests: [],
    stimulus: { src: "code", code: 'note("c")', bars: 16 },
    answer: { ui: "form", sections: 4, vocabulary: "letters", input: "label" },
    correct: { sections: ["A", "A", "B", "A"] },
  } as unknown as Exercise;
  const none = () => false;
  const all = () => true;
  const noForm = (s: AnswerSpec) => s.ui !== "form";

  test("found per part; code and listen steps never count as missing", () => {
    expect(answerMissing(form, none)).toBe(true);
    expect(answerMissing(form, all)).toBe(false);
    expect(answerMissing(form, noForm)).toBe(true);
    expect(answerMissing(undefined, none)).toBe(false);
    const listen = u08l01.steps[0]?.exercise as Exercise;
    expect(answerMissing(listen, none)).toBe(false);
    const modify = u08l01.steps.find((s) => s.id === "S4")?.exercise as Exercise;
    expect(answerMissing(modify, none)).toBe(false);
    const all2 = { kind: "all", parts: [listen, form] } as unknown as Exercise;
    expect(answerMissing(all2, noForm)).toBe(true);
  });

  test("Continue opens on a graded step whose answer is unavailable; it reads Skip and never counts as done", () => {
    const step = { id: "S5", kind: "ear", graded: true, exercise: form } as unknown as StepDef;
    const base = { state: null, result: null, done: false, disputed: false };
    expect(canContinue(step, base)).toBe(false);
    expect(canContinue(step, { ...base, unavailable: true })).toBe(true);
    expect(continueLabel(step, { ...base, unavailable: true })).toBe("Skip");
    expect(stepDone(step, { ...base, unavailable: true })).toBe(false);
  });

  test("the machine: UNAVAILABLE on the current step lets Continue move on (once), nothing is posted", async () => {
    const def = u10l01 as unknown as LessonDef;
    const posted: string[] = [];
    const st = (stepId: string): StepState => ({
      lessonId: def.id,
      stepId,
      rung: 0,
      passed: false,
      attempts: 0,
      seriesNo: 0,
      revealAvailable: false,
      result: null,
    });
    const deps: LessonDeps = {
      async postAttempt(a) {
        posted.push(a.stepId);
        return { state: st(a.stepId), testedOut: [] };
      },
      async hint(stepId) {
        return st(stepId);
      },
      async newSeries(stepId) {
        return st(stepId);
      },
      async finish() {
        return { sketchId: "sk", result: null as never };
      },
      async quickSketch() {
        return { sketchId: "sk" };
      },
      position() {},
      stepLeft() {},
    };
    const actor = createActor(lessonMachine, {
      input: { lessonId: def.id, target: 20, sessionId: null, deps },
    }).start();
    actor.send({ type: "LOADED", lesson: def, resumeStep: "S5", splitPart: null });
    const at = () => snapshotOf(actor.getSnapshot())?.stepId;
    expect(at()).toBe("S5");
    actor.send({ type: "CONTINUE" });
    expect(at(), "a graded step without a pass holds").toBe("S5");
    actor.send({ type: "UNAVAILABLE", stepId: "S5" });
    actor.send({ type: "UNAVAILABLE", stepId: "S5" });
    const ctx = actor.getSnapshot().context;
    expect(progressOf(ctx, "S5").unavailable).toBe(true);
    expect(progressOf(ctx, "S4").unavailable).toBe(false);
    actor.send({ type: "CONTINUE" });
    await waitFor(actor, () => at() === "S6");
    expect(posted).toEqual([]);
    const result: GradeResult | null = ctx.results.S5 ?? null;
    expect(result).toBeNull();
  });
});

describe("match this sound, and the scope panel", () => {
  test("a code step graded on its controls is a match-this-sound step; an events step is not", () => {
    const s5 = a1l01.steps.find((s) => s.id === "S5")?.exercise as Exercise;
    expect(isMatchSound(s5)).toBe(false);
    const match = {
      ...s5,
      matcher: { m: "controls", controls: [{ control: "lpf", scale: "log", tol: 0.5 }] },
    };
    expect(isMatchSound(match as unknown as Exercise)).toBe(true);
    expect(isMatchSound({ ...match, kind: "identify" } as unknown as Exercise)).toBe(false);
    expect(isMatchSound(undefined)).toBe(false);
    expect(MATCH_SOUND_LABELS).toEqual({ a: "Your sound", b: "The sound to match" });
  });

  test("a step's scope and spectrum panels and probe, merged with the code's own .scope()", () => {
    expect(stepScopePanel(undefined)).toBeNull();
    expect(stepScopePanel({ initialPanels: ["chords"] })).toBeNull();
    expect(stepScopePanel({ initialPanels: ["scope"] })).toEqual({
      panels: ["scope"],
      source: { kind: "master" },
      probe: null,
    });
    expect(stepScopePanel(undefined, ["scope"])?.panels).toEqual(["scope"]);
    expect(stepScopePanel({ initialPanels: ["scope", "spectrum"] }, ["scope"])?.panels).toEqual([
      "scope",
      "fscope",
    ]);
    expect(stepScopePanel({ probe: { kind: "filter", track: "bass" } })).toEqual({
      panels: [],
      source: { kind: "track", label: "bass" },
      probe: { kind: "filter", track: "bass" },
    });
  });
});

describe("the five Wave 5 exemplars", () => {
  const KNOWN = new Set([
    "choice",
    "degree-pad",
    "quality-pad",
    "rn-palette",
    "text",
    "number",
    "keyboard",
    "staff-input",
    "mic",
    "tap",
    "slot-choice",
    "form",
    "bar-grid",
    "scale-builder",
    "order",
    "blanks",
    "hum",
  ]);
  for (const def of EXEMPLARS)
    test(`${def.id}: every step resolves to a surface the player knows; A1.L01 is the side lesson`, () => {
      expect(isSideLesson(def.id, null)).toBe(def.id === "A1.L01");
      for (const step of def.steps) {
        if (!step.exercise) continue;
        for (const part of partsOf(step.exercise)) {
          const spec = answerSpecOf(part);
          if (spec) expect(KNOWN.has(spec.ui), `${def.id} ${step.id} ${spec.ui}`).toBe(true);
        }
      }
      // Each lesson ends in a Make (something the learner made, to replay).
      expect(def.steps.at(-1)?.kind).toBe("make");
    });
});

describe("feedback words for the Wave 5 answers", () => {
  const fail = (where: { slot?: number }[], ids: string[] = []): GradeResult =>
    ({
      status: "fail",
      score: 0,
      dims: {},
      diagnostics: where.map((w, i) => ({
        id: ids[i] ?? "id.wrong",
        severity: "error",
        params: {},
        where: w,
      })),
      messages: [],
    }) as unknown as GradeResult;
  const ex = (answer: Record<string, unknown>, kind = "fact") =>
    ({ kind, id: "x", answer, prompt: "", skills: [], hints: null, tests: [] }) as unknown as Exercise;

  test("a chart names its bars, a form its sections", () => {
    const grid = shapeOf(ex({ ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"] }));
    expect(grid).toMatchObject({ kind: "answer", slotted: true, slotNoun: "bar" });
    const r = fail([{ slot: 10 }]);
    expect(
      summaryOf(
        viewFor(r, 0, false, () => ""),
        r,
        grid,
      ),
    ).toBe("Bar 10 is not right yet.");
    const form = shapeOf(ex({ ui: "form", sections: 4, vocabulary: "letters", input: "label" }));
    const f = fail([{ slot: 2 }, { slot: 3 }, { slot: 4 }]);
    expect(
      summaryOf(
        viewFor(f, 0, false, () => ""),
        f,
        form,
      ),
    ).toBe("Sections 2, 3 and 4 are not right yet.");
    const lines = issueLines(
      viewFor(f, 2, false, () => "Not this one."),
      form,
    );
    expect(lines.map((l) => l.where)).toEqual(["Section 2", "Section 3", "Section 4"]);
  });

  test("taps along a groove: a count of taps to look at, each line names its own note (no 'Answer n')", () => {
    const tap = shapeOf({ kind: "tap" } as unknown as Exercise);
    expect(tap.kind).toBe("tapped");
    const r = fail([{ slot: 1 }, { slot: 3 }], ["tap.missed", "tap.missed"]);
    const view = viewFor(r, 2, false, () => "No tap for this note of the rhythm.");
    const said = summaryOf(view, r, tap);
    expect(said).toBe("Not in time yet: 2 taps to look at. Listen, then tap along again.");
    expect(said).not.toMatch(/Answer/);
    expect(issueLines(view, tap).every((l) => l.where === "")).toBe(true);
  });
});
