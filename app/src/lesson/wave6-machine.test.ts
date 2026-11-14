// The lesson machine on the Wave 6 exemplars, with fake server calls: U15.L02 "Five of Five" from its first step to
// its completion (what opens Continue on each step kind it has: listen, predict, investigate, a several-answer ear
// step, modify, numerals, a sung step, the Make), a completion that met an advanced-track gate kept for the end
// screen (U15.L06 opens more of the Jazz track; wave6.md §5.3), a Make that holds the learner's own sketch from the
// start and saves it (d15), "Try a new one" forgetting the step's code, and U13.L01's tap step, which never gates.
import { describe, expect, test } from "bun:test";
import type {
  AttemptResponse,
  Exercise,
  GradeResult,
  LessonCompleteResult,
  LessonDef,
  StepState,
} from "@oak/api";
import { createActor, waitFor } from "xstate";
import u13l01 from "../../../content/core/U13/L01/lesson.ts";
import u15l02 from "../../../content/core/U15/L02/lesson.ts";
import {
  type AttemptInput,
  codeOf,
  type FinishInput,
  type LessonDeps,
  latestCode,
  lessonMachine,
  progressOf,
  snapshotOf,
} from "./machine.ts";
import { canContinue, continueLabel } from "./model.ts";

const GATE = {
  gateId: "J.forms",
  trackId: "J" as const,
  opens: "J4",
  requires: [{ ref: "U15.L06", kind: "lesson" as const, label: "U15.L06 completed", met: true }],
  open: true,
  openedAt: "2026-11-13T10:00:00.000Z",
  lessonsAuthored: 0,
  lessonsTotal: 4,
};

function stateOf(stepId: string, patch: Partial<StepState> = {}): StepState {
  return {
    lessonId: "L",
    stepId,
    rung: 0,
    passed: false,
    attempts: 0,
    seriesNo: 0,
    revealAvailable: false,
    result: null,
    ...patch,
  };
}

function result(status: GradeResult["status"]): GradeResult {
  const score = status === "pass" ? 1 : 0;
  return {
    exerciseId: "x",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status,
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: [],
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
  };
}

function start(def: LessonDef, resume: string | null = null) {
  const attempts: AttemptInput[] = [];
  const finish: FinishInput[] = [];
  const left: string[] = [];
  const deps: LessonDeps = {
    async postAttempt(a) {
      attempts.push(a);
      return {
        state: stateOf(a.stepId, { passed: a.result.status === "pass", attempts: attempts.length }),
        testedOut: [],
      };
    },
    async hint(stepId, reveal) {
      return stateOf(stepId, { rung: reveal ? 4 : 1 });
    },
    async newSeries(stepId) {
      return stateOf(stepId, { seriesNo: 1 });
    },
    async finish(f) {
      finish.push(f);
      return {
        sketchId: "sk_w6",
        result: { opened: [], gatesOpened: [GATE] } as unknown as LessonCompleteResult,
      };
    },
    async quickSketch() {
      return { sketchId: "sk_quick" };
    },
    position() {},
    stepLeft(stepId) {
      left.push(stepId);
    },
  };
  const actor = createActor(lessonMachine, {
    input: { lessonId: def.id, target: 20, sessionId: null, deps },
  }).start();
  actor.send({ type: "LOADED", lesson: def, resumeStep: resume, splitPart: null });
  return { actor, attempts, finish, left };
}

type Actor = ReturnType<typeof start>["actor"];
const at = (a: Actor) => snapshotOf(a.getSnapshot())?.stepId;
const stepOf = (def: LessonDef, id: string) =>
  def.steps.find((s) => s.id === id) as LessonDef["steps"][number];
const open = (a: Actor, def: LessonDef, id: string) =>
  canContinue(stepOf(def, id), progressOf(a.getSnapshot().context, id));
const label = (a: Actor, def: LessonDef, id: string) =>
  continueLabel(stepOf(def, id), progressOf(a.getSnapshot().context, id));

async function submit(
  a: Actor,
  def: LessonDef,
  id: string,
  status: GradeResult["status"],
  r: AttemptResponse,
) {
  a.send({ type: "CHECK" });
  a.send({
    type: "SUBMIT",
    response: r,
    result: result(status),
    extraReplays: 0,
    exercise: stepOf(def, id).exercise as Exercise,
    seriesNo: 0,
    params: {},
  });
  await waitFor(a, (s) => s.matches({ active: "idle" }));
}

describe("U15.L02 through the lesson machine", () => {
  test("the lesson is the eight steps the spec lists, three of them graded", () => {
    expect(u15l02.steps.map((s) => `${s.id}:${s.kind}`)).toEqual([
      "S1:listen",
      "S2:predict",
      "S3:investigate",
      "S4:ear",
      "S5:modify",
      "S6:quiz",
      "S7:sing",
      "S8:make",
    ]);
    expect(u15l02.steps.filter((s) => s.graded).map((s) => s.id)).toEqual(["S4", "S5", "S6"]);
  });

  test("every step in order: what opens Continue, and the completion that opened a track", async () => {
    const { actor, attempts, finish, left } = start(u15l02);
    // S1 listen: never gates (Skip from the start; Continue once heard).
    expect(at(actor)).toBe("S1");
    expect(open(actor, u15l02, "S1")).toBe(true);
    expect(label(actor, u15l02, "S1")).toBe("Skip");
    actor.send({ type: "DONE", stepId: "S1" });
    expect(label(actor, u15l02, "S1")).toBe("Continue");
    actor.send({ type: "CONTINUE" });
    // S2 predict and S3 investigate are ungraded: they can be left unanswered.
    expect(at(actor)).toBe("S2");
    expect(label(actor, u15l02, "S2")).toBe("Skip");
    actor.send({ type: "CONTINUE" });
    expect(at(actor)).toBe("S3");
    actor.send({ type: "CONTINUE" });
    // S4, the ear step in two parts, is graded: a fail keeps Continue shut, the pass opens it.
    expect(at(actor)).toBe("S4");
    expect(open(actor, u15l02, "S4")).toBe(false);
    actor.send({ type: "CONTINUE" });
    expect(at(actor)).toBe("S4");
    await submit(actor, u15l02, "S4", "fail", {
      parts: [{ answer: { number: 4 } }, { answer: { number: 2 } }],
    });
    expect(open(actor, u15l02, "S4")).toBe(false);
    await submit(actor, u15l02, "S4", "pass", {
      parts: [{ answer: { number: 3 } }, { answer: { number: 2 } }],
    });
    expect(open(actor, u15l02, "S4")).toBe(true);
    actor.send({ type: "CONTINUE" });
    // S5 modify: the pass opens it.
    expect(at(actor)).toBe("S5");
    await submit(actor, u15l02, "S5", "pass", { code: "x" });
    actor.send({ type: "CONTINUE" });
    // S6 numerals: a reveal (rung 4) opens it too.
    expect(at(actor)).toBe("S6");
    expect(open(actor, u15l02, "S6")).toBe(false);
    actor.send({ type: "HINT", reveal: true });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(open(actor, u15l02, "S6")).toBe(true);
    actor.send({ type: "CONTINUE" });
    // S7 is sung: it never gates, taken or not (contracts §7.6, §8).
    expect(at(actor)).toBe("S7");
    expect(open(actor, u15l02, "S7")).toBe(true);
    expect(label(actor, u15l02, "S7")).toBe("Skip");
    actor.send({ type: "CONTINUE" });
    // S8, the Make: Continue never skips it; saving completes the lesson.
    expect(at(actor)).toBe("S8");
    expect(open(actor, u15l02, "S8")).toBe(false);
    actor.send({ type: "CONTINUE" });
    expect(at(actor)).toBe("S8");
    actor.send({ type: "SAVE_MAKE", code: "setcpm(92/4)", title: "Lean" });
    await waitFor(actor, (s) => s.matches("complete"));
    expect(finish).toHaveLength(1);
    expect(finish[0]).toMatchObject({ stepId: "S8", title: "Lean", code: "setcpm(92/4)" });
    // Two checks of S4 and one of S5 were posted; the sung step posted nothing.
    expect(attempts.map((a) => a.stepId)).toEqual(["S4", "S4", "S5"]);
    // Each step left is reported once, in order (telemetry and the kept drafts hang on it).
    expect(left.slice(0, 7)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
    // The completion's track gate reaches the end screen as the server sent it.
    const done = actor.getSnapshot().context.completion;
    expect(done?.gatesOpened?.map((g) => g.gateId)).toEqual(["J.forms"]);
    expect(done?.gatesOpened?.[0]?.lessonsAuthored).toBe(0);
  });

  test("a Make that opens with the learner's sketch holds it from the start and saves it (d15)", async () => {
    const { actor, finish } = start(u15l02, "S8");
    const make = stepOf(u15l02, "S8");
    const c0 = actor.getSnapshot().context;
    // Before the host puts the sketch in, the step's code is Oak's starter (markers stripped).
    const oak = codeOf(c0, make);
    expect(oak).toContain("setcpm(");
    const mine = 'setcpm(92/4)\n\nchords: chord("<C Am D7 G7>").voicing().s("rhodes")';
    actor.send({ type: "CODE", code: mine });
    expect(codeOf(actor.getSnapshot().context, make)).toBe(mine);
    expect(latestCode(actor.getSnapshot().context)).toBe(mine);
    // "Start from Oak's copy" is one more CODE event; "Use my sketch" another. Nothing else changes.
    actor.send({ type: "CODE", code: oak as string });
    expect(codeOf(actor.getSnapshot().context, make)).toBe(oak);
    actor.send({ type: "CODE", code: mine });
    actor.send({ type: "SAVE_MAKE", code: mine, title: "My verse, leaning" });
    await waitFor(actor, (s) => s.matches("complete"));
    expect(finish[0]?.code).toBe(mine);
    expect(finish[0]?.tutorAssisted).toBe(false);
  });

  test("Try a new one clears the step's code and verdict, so nothing stale is kept", async () => {
    const { actor } = start(u15l02, "S5");
    actor.send({ type: "CODE", code: "wrong" });
    await submit(actor, u15l02, "S5", "fail", { code: "wrong" });
    expect(actor.getSnapshot().context.results.S5?.status).toBe("fail");
    actor.send({ type: "NEW_SERIES" });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    const c = actor.getSnapshot().context;
    expect(c.results.S5 ?? null).toBeNull();
    expect(c.states.S5?.seriesNo).toBe(1);
    expect(c.code.S5).toBeUndefined();
  });
});

describe("U13.L01 through the lesson machine", () => {
  test("the tap step is practice: it never gates, and a pass marks it done", async () => {
    const { actor } = start(u13l01, "S2");
    expect(stepOf(u13l01, "S2").exercise?.kind).toBe("tap");
    expect(stepOf(u13l01, "S2").graded ?? false).toBe(false);
    expect(open(actor, u13l01, "S2")).toBe(true);
    expect(label(actor, u13l01, "S2")).toBe("Skip");
    await submit(actor, u13l01, "S2", "pass", { taps: [1.875, 4.375, 6.875, 9.375] });
    expect(label(actor, u13l01, "S2")).toBe("Continue");
    actor.send({ type: "CONTINUE" });
    expect(at(actor)).toBe("S3");
  });
});
