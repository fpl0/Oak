// The lesson machine with fake server calls: loading and resume, the check flow (posted, error not posted, a
// failed save), Continue rules, hints and reveal, a new series, revisits, the tutor's applied card, "Wrap up",
// the 15-minute split at `wrapAt` (parts A and B), the Make's save and lesson completion.
import { describe, expect, test } from "bun:test";
import type {
  AttemptResponse,
  Exercise,
  GradeResult,
  HintRung,
  LessonCompleteResult,
  LessonDef,
  StepState,
} from "@oak/api";
import { createActor, waitFor } from "xstate";
import sample from "../../../content/core/_sample/L00/lesson.ts";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import {
  type AttemptInput,
  type FinishInput,
  type LessonDeps,
  latestCode,
  lessonMachine,
  type QuickSketchInput,
  snapshotOf,
} from "./machine.ts";

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

function result(status: GradeResult["status"], score = status === "pass" ? 1 : 0): GradeResult {
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

interface Calls {
  attempts: AttemptInput[];
  hints: { stepId: string; reveal: boolean }[];
  series: string[];
  finish: FinishInput[];
  quick: QuickSketchInput[];
  positions: { stepId: string; wrapped: boolean }[];
  left: string[];
}

function fakeDeps(opts: { failAttempt?: boolean } = {}): { deps: LessonDeps; calls: Calls } {
  const calls: Calls = {
    attempts: [],
    hints: [],
    series: [],
    finish: [],
    quick: [],
    positions: [],
    left: [],
  };
  const rungs = new Map<string, HintRung>();
  const deps: LessonDeps = {
    async postAttempt(a) {
      calls.attempts.push(a);
      if (opts.failAttempt) throw new Error("offline");
      return {
        state: stateOf(a.stepId, { passed: a.result.status === "pass", attempts: 1 }),
        testedOut: [],
      };
    },
    async hint(stepId, reveal) {
      calls.hints.push({ stepId, reveal });
      const r = reveal ? 4 : Math.min(3, (rungs.get(stepId) ?? 0) + 1);
      rungs.set(stepId, r as HintRung);
      return stateOf(stepId, { rung: r as HintRung });
    },
    async newSeries(stepId) {
      calls.series.push(stepId);
      return stateOf(stepId, { seriesNo: 1 });
    },
    async finish(f) {
      calls.finish.push(f);
      return { sketchId: "sk_1", result: { opened: ["U01.L02"] } as unknown as LessonCompleteResult };
    },
    async quickSketch(q) {
      calls.quick.push(q);
      return { sketchId: "sk_quick" };
    },
    position(stepId, wrapped) {
      calls.positions.push({ stepId, wrapped });
    },
    stepLeft(stepId) {
      calls.left.push(stepId);
    },
  };
  return { deps, calls };
}

function start(
  def: LessonDef,
  o: { target?: 15 | 20 | 25; resume?: string | null; split?: "A" | "B" | null; failAttempt?: boolean } = {},
) {
  const { deps, calls } = fakeDeps(o.failAttempt ? { failAttempt: true } : {});
  const actor = createActor(lessonMachine, {
    input: { lessonId: def.id, target: o.target ?? 20, sessionId: null, deps },
  }).start();
  actor.send({ type: "LOADED", lesson: def, resumeStep: o.resume ?? null, splitPart: o.split ?? null });
  return { actor, calls };
}

const stepId = (a: ReturnType<typeof start>["actor"]) => snapshotOf(a.getSnapshot())?.stepId;
const exOf = (def: LessonDef, id: string) => def.steps.find((s) => s.id === id)?.exercise as Exercise;

function submit(
  a: ReturnType<typeof start>["actor"],
  def: LessonDef,
  id: string,
  status: GradeResult["status"],
  response: AttemptResponse = { code: "x" },
) {
  a.send({ type: "CHECK" });
  a.send({
    type: "SUBMIT",
    response,
    result: result(status),
    extraReplays: 0,
    exercise: exOf(def, id),
    seriesNo: 0,
    params: {},
  });
}

describe("loading and resume", () => {
  test("opens at the first step, or where the server says the learner was", () => {
    expect(stepId(start(sample).actor)).toBe("S1");
    expect(stepId(start(sample, { resume: "S4" }).actor)).toBe("S4");
  });

  test("optional stretch steps show only at the 25-minute target", () => {
    const at20 = start(sample)
      .actor.getSnapshot()
      .context.steps.map((s) => s.id);
    const at25 = start(sample, { target: 25 })
      .actor.getSnapshot()
      .context.steps.map((s) => s.id);
    expect(at20).not.toContain("S9");
    expect(at20).not.toContain("S10");
    expect(at25).toContain("S9");
    expect(at25.length).toBe(12);
  });

  test("the snapshot names the lesson, the step and its kind", () => {
    const snap = snapshotOf(start(u01l01).actor.getSnapshot());
    expect(snap).toMatchObject({ lessonId: "U01.L01", stepId: "S1", stepKind: "listen", status: "step" });
  });
});

describe("Continue", () => {
  test("ungraded steps can always move on; a graded step needs a pass", async () => {
    const { actor, calls } = start(u01l01, { resume: "S5" });
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S6");
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S6");
    submit(actor, u01l01, "S6", "fail");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S6");
    submit(actor, u01l01, "S6", "pass");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(calls.attempts.length).toBe(2);
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S7");
    expect(calls.positions.at(-1)).toEqual({ stepId: "S7", wrapped: false });
    expect(calls.left).toContain("S6");
  });

  test("a result that did not run is shown but never posted", async () => {
    const { actor, calls } = start(u01l01, { resume: "S6" });
    submit(actor, u01l01, "S6", "error");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(calls.attempts).toEqual([]);
    expect(actor.getSnapshot().context.results.S6?.status).toBe("error");
  });

  test("a save that fails keeps the result and says so calmly", async () => {
    const { actor } = start(u01l01, { resume: "S6", failAttempt: true });
    submit(actor, u01l01, "S6", "pass");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    const c = actor.getSnapshot().context;
    expect(c.results.S6?.status).toBe("pass");
    expect(c.notice).toContain("could not save");
    expect(c.notice).not.toContain("!");
  });

  test("a disputed grading opens Continue at once", () => {
    const { actor } = start(u01l01, { resume: "S6" });
    actor.send({ type: "DISPUTED", stepId: "S6" });
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S7");
  });
});

describe("hints and series", () => {
  test("each hint asks the server; reveal takes rung 4 and completes a graded step", async () => {
    const { actor, calls } = start(u01l01, { resume: "S6" });
    actor.send({ type: "HINT", reveal: false });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    actor.send({ type: "HINT", reveal: false });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(snapshotOf(actor.getSnapshot())?.rung).toBe(2);
    actor.send({ type: "HINT", reveal: true });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(snapshotOf(actor.getSnapshot())?.rung).toBe(4);
    expect(calls.hints.map((h) => h.reveal)).toEqual([false, false, true]);
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S7");
  });

  test("steps without a ladder (listen, predict) take no hint", () => {
    const { actor, calls } = start(u01l01);
    actor.send({ type: "HINT", reveal: false });
    expect(actor.getSnapshot().matches({ active: "idle" })).toBe(true);
    expect(calls.hints).toEqual([]);
  });

  test("Try a new one starts a new series and clears the step's result and code", async () => {
    const { actor, calls } = start(u01l01, { resume: "S6" });
    actor.send({ type: "CODE", code: "setcpm(99/4)" });
    submit(actor, u01l01, "S6", "fail");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    actor.send({ type: "NEW_SERIES" });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    const c = actor.getSnapshot().context;
    expect(calls.series).toEqual(["S6"]);
    expect(c.results.S6).toBeNull();
    expect(c.code.S6).toBeUndefined();
    expect(c.states.S6?.seriesNo).toBe(1);
  });
});

describe("revisits, the editor and the tutor's card", () => {
  test("earlier steps can be revisited and the learner returns to the furthest one", () => {
    const { actor } = start(u01l01, { resume: "S3" });
    actor.send({ type: "CONTINUE" });
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S5");
    actor.send({ type: "BACK" });
    actor.send({ type: "BACK" });
    expect(stepId(actor)).toBe("S3");
    actor.send({ type: "GOTO", stepId: "S8" });
    expect(stepId(actor)).toBe("S3");
    actor.send({ type: "FORWARD" });
    actor.send({ type: "FORWARD" });
    actor.send({ type: "FORWARD" });
    expect(stepId(actor)).toBe("S5");
  });

  test("an applied card is tutor-assisted until the next hand edit", async () => {
    const { actor, calls } = start(u01l01, { resume: "S6" });
    actor.send({ type: "APPLY_CARD", code: "setcpm(120/4)", cardId: "c1" });
    expect(snapshotOf(actor.getSnapshot())?.code).toBe("setcpm(120/4)");
    submit(actor, u01l01, "S6", "fail");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    actor.send({ type: "CODE", code: "setcpm(121/4)" });
    submit(actor, u01l01, "S6", "fail");
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(calls.attempts.map((a) => a.tutorAssisted)).toEqual([true, false]);
  });

  test("the editor starts from the clean starter (markers stripped)", () => {
    const { actor } = start(u01l01, { resume: "S6" });
    expect(snapshotOf(actor.getSnapshot())?.code).toBe(
      'setcpm(80/4)\n\ndrums: s("bd sd bd sd")\nhats: s("hh*8")',
    );
  });
});

describe("Wrap up and the 15-minute split", () => {
  test("Wrap up before the Make opens the Quick sketch; it can be taken back", () => {
    const { actor, calls } = start(u01l01, { resume: "S4" });
    actor.send({ type: "WRAP_UP" });
    expect(snapshotOf(actor.getSnapshot())?.status).toBe("wrapping");
    expect(calls.positions.at(-1)).toEqual({ stepId: "S4", wrapped: true });
    actor.send({ type: "CANCEL_WRAP" });
    expect(snapshotOf(actor.getSnapshot())?.status).toBe("step");
  });

  test("Wrap up saves the Quick sketch and resumes at the next unfinished step", async () => {
    const { actor, calls } = start(u01l01, { resume: "S4" });
    actor.send({ type: "CODE", code: 'setcpm(70/4)\n\ndrums: s("bd sd bd sd")' });
    actor.send({ type: "WRAP_UP" });
    actor.send({ type: "SAVE_QUICK", code: latestCode(actor.getSnapshot().context), title: "Quick sketch" });
    await waitFor(actor, (s) => s.matches("complete"));
    expect(calls.quick[0]).toMatchObject({
      part: null,
      resumeStep: "S4",
      code: 'setcpm(70/4)\n\ndrums: s("bd sd bd sd")',
    });
    expect(actor.getSnapshot().context.sketchId).toBe("sk_quick");
  });

  test("Wrap up is not offered on the Make", () => {
    const { actor } = start(u01l01, { resume: "S8" });
    actor.send({ type: "WRAP_UP" });
    expect(snapshotOf(actor.getSnapshot())?.status).toBe("make");
  });

  test("part A stops at wrapAt with a Quick sketch; part B starts after it", async () => {
    const a = start(sample, { target: 15, split: "A", resume: "S6" });
    expect(a.actor.getSnapshot().context.range).toEqual([0, 5]);
    a.actor.send({ type: "DISPUTED", stepId: "S6" });
    a.actor.send({ type: "CONTINUE" });
    expect(snapshotOf(a.actor.getSnapshot())?.status).toBe("wrapping");
    a.actor.send({ type: "CANCEL_WRAP" });
    expect(snapshotOf(a.actor.getSnapshot())?.status).toBe("wrapping");
    a.actor.send({ type: "SAVE_QUICK", code: "c", title: "t" });
    await waitFor(a.actor, (s) => s.matches("complete"));
    expect(a.calls.quick[0]).toMatchObject({ part: "A", resumeStep: "S7" });

    const b = start(sample, { target: 15, split: "B" });
    expect(stepId(b.actor)).toBe("S7");
    b.actor.send({ type: "BACK" });
    expect(stepId(b.actor)).toBe("S7");
  });
});

describe("the Make", () => {
  test("Save sketch finishes the lesson with the Make's code and last check", async () => {
    const { actor, calls } = start(u01l01, { resume: "S8" });
    expect(snapshotOf(actor.getSnapshot())?.status).toBe("make");
    actor.send({ type: "LOCAL_RESULT", stepId: "S8", result: result("pass") });
    actor.send({ type: "SAVE_MAKE", code: 'setcpm(100/4)\n\ndrums: s("bd sd bd sd")', title: "Heartbeat" });
    await waitFor(actor, (s) => s.matches("complete"));
    expect(calls.finish[0]).toMatchObject({ stepId: "S8", title: "Heartbeat" });
    expect(calls.finish[0]?.result?.status).toBe("pass");
    const c = actor.getSnapshot().context;
    expect(c.sketchId).toBe("sk_1");
    expect(c.completion?.opened).toEqual(["U01.L02"]);
    expect(snapshotOf(actor.getSnapshot())?.status).toBe("complete");
  });

  test("Continue never skips the Make", () => {
    const { actor } = start(u01l01, { resume: "S8" });
    actor.send({ type: "CONTINUE" });
    expect(stepId(actor)).toBe("S8");
  });
});
