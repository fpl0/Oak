// "Try again" in the lesson machine (docs/design/retry.md §2.5, §4): the verdict on screen is the `result` state,
// Try again goes back to `answering` with the same series, params and rung, posts nothing, and the next Check is
// the one attempt the server counts (as first, retry or practice: `StepState.practiceNext`). Covered: after a
// right, a wrong and an error result, at each hint rung, after a reveal, across step moves and over a reload.
import { describe, expect, test } from "bun:test";
import type { AttemptResponse, Exercise, GradeResult, HintRung, LessonDef, StepState } from "@oak/api";
import { createActor, waitFor } from "xstate";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import { type AttemptInput, type LessonDeps, lessonMachine, resultShown, snapshotOf } from "./machine.ts";
import { resultOnScreen } from "./model.ts";

function stateOf(stepId: string, patch: Partial<StepState> = {}): StepState {
  return {
    lessonId: "U01.L01",
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

/** A server stand-in that keeps the series like course.ts: attempts, rung (never lowered), passed, practiceNext. */
function fakeServer(opts: { failSaves?: number } = {}) {
  const posted: AttemptInput[] = [];
  const states = new Map<string, StepState>();
  let failSaves = opts.failSaves ?? 0;
  let key = 0;
  const get = (id: string) => states.get(id) ?? stateOf(id);
  const deps: LessonDeps = {
    async postAttempt(a) {
      posted.push(a);
      if (failSaves > 0) {
        failSaves -= 1;
        throw new Error("offline");
      }
      const s = get(a.stepId);
      const passed = s.passed || a.result.status === "pass";
      const next = { ...s, attempts: s.attempts + 1, passed, practiceNext: passed };
      states.set(a.stepId, next);
      return { state: next, testedOut: [] };
    },
    async hint(stepId, reveal) {
      const s = get(stepId);
      const rung = (reveal ? 4 : Math.min(3, s.rung + 1)) as HintRung;
      const next = { ...s, rung: Math.max(s.rung, rung) as HintRung };
      states.set(stepId, next);
      return next;
    },
    async newSeries(stepId) {
      const s = get(stepId);
      const next = { ...s, seriesNo: s.seriesNo + 1, attempts: 0, rung: 0 as HintRung };
      states.set(stepId, next);
      return next;
    },
    async finish() {
      return { sketchId: "sk", result: null };
    },
    async quickSketch() {
      return { sketchId: "sk" };
    },
    position() {},
    newKey: () => `k${++key}`,
  };
  return { deps, posted, states };
}

type Actor = ReturnType<typeof open>["actor"];

function open(resume = "S6", server = fakeServer(), loadStates: StepState[] = []) {
  const actor = createActor(lessonMachine, {
    input: { lessonId: u01l01.id, target: 20, sessionId: null, deps: server.deps },
  }).start();
  actor.send({ type: "LOADED", lesson: u01l01, resumeStep: resume, splitPart: null });
  for (const st of loadStates) actor.send({ type: "STATE", state: st });
  return { actor, ...server };
}

const exOf = (id: string) => u01l01.steps.find((s) => s.id === id)?.exercise as Exercise;

async function check(
  a: Actor,
  id: string,
  status: GradeResult["status"],
  response: AttemptResponse = { code: "note(60)" },
  seriesNo = 0,
) {
  a.send({ type: "CHECK" });
  a.send({
    type: "SUBMIT",
    response,
    result: result(status),
    extraReplays: 0,
    exercise: exOf(id),
    seriesNo,
    params: {},
  });
  await waitFor(a, (s) => s.matches({ active: "idle" }));
}

const showing = (a: Actor) => a.getSnapshot().matches({ active: { idle: "result" } });
const answering = (a: Actor) => a.getSnapshot().matches({ active: { idle: "answering" } });

describe("Try again after each kind of result", () => {
  test("after a wrong answer: the verdict goes, the series stays, nothing is posted", async () => {
    const { actor, posted } = open();
    expect(answering(actor)).toBe(true);
    await check(actor, "S6", "fail");
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    const c = actor.getSnapshot().context;
    expect(c.results.S6).toBeNull();
    expect(c.retried.S6).toBe(1);
    expect(c.states.S6?.seriesNo).toBe(0);
    expect(c.states.S6?.attempts).toBe(1);
    expect(posted.length).toBe(1);
    // The next Check is one more attempt in the same series.
    await check(actor, "S6", "pass", { code: "note(62)" });
    expect(posted.length).toBe(2);
    expect(posted.map((p) => p.seriesNo)).toEqual([0, 0]);
    expect(new Set(posted.map((p) => p.idempotencyKey)).size).toBe(2);
    expect(showing(actor)).toBe(true);
  });

  test("after a right answer: Continue stays open and the next take is practice by the server's word", async () => {
    const { actor, posted } = open();
    await check(actor, "S6", "pass");
    expect(actor.getSnapshot().context.states.S6?.practiceNext).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    // Passed is the server's: the cleared verdict does not close Continue.
    expect(snapshotOf(actor.getSnapshot())?.passed).toBe(true);
    actor.send({ type: "CONTINUE" });
    expect(snapshotOf(actor.getSnapshot())?.stepId).toBe("S7");
    actor.send({ type: "BACK" });
    await check(actor, "S6", "fail");
    // The practice take is posted once and leaves the step passed.
    expect(posted.length).toBe(2);
    expect(actor.getSnapshot().context.states.S6?.passed).toBe(true);
  });

  test("after a result that did not run: shown, never posted, and Try again clears it", async () => {
    const { actor, posted } = open();
    await check(actor, "S6", "error");
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    expect(posted).toEqual([]);
  });

  test("Try again with no result on screen, or while a check is saving, does nothing", async () => {
    const { actor } = open();
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    expect(actor.getSnapshot().context.retried.S6).toBeUndefined();
    actor.send({ type: "CHECK" });
    actor.send({
      type: "SUBMIT",
      response: { code: "x" },
      result: result("fail"),
      extraReplays: 0,
      exercise: exOf("S6"),
      seriesNo: 0,
      params: {},
    });
    expect(actor.getSnapshot().matches({ active: "posting" })).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    // The verdict that was saving is on screen; the early Try again was dropped.
    expect(showing(actor)).toBe(true);
    expect(actor.getSnapshot().context.retried.S6).toBeUndefined();
  });
});

describe("Try again and the hint ladder", () => {
  for (const rung of [0, 1, 2, 3] as const)
    test(`at rung ${rung}: the rung is kept and the next Check goes in the same series`, async () => {
      const { actor, posted } = open();
      for (let i = 0; i < rung; i++) {
        actor.send({ type: "HINT", reveal: false });
        await waitFor(actor, (s) => s.matches({ active: "idle" }));
      }
      await check(actor, "S6", "fail");
      actor.send({ type: "TRY_AGAIN" });
      expect(answering(actor)).toBe(true);
      expect(snapshotOf(actor.getSnapshot())?.rung).toBe(rung);
      // A hint while the question is open again keeps the step open.
      if (rung < 3) {
        actor.send({ type: "HINT", reveal: false });
        await waitFor(actor, (s) => s.matches({ active: "idle" }));
        expect(answering(actor)).toBe(true);
        expect(snapshotOf(actor.getSnapshot())?.rung).toBe(rung + 1);
      }
      await check(actor, "S6", "pass", { code: "y" });
      expect(posted.map((p) => p.seriesNo)).toEqual([0, 0]);
    });

  test("a hint after a verdict keeps the verdict on screen until Try again", async () => {
    const { actor } = open();
    await check(actor, "S6", "fail");
    actor.send({ type: "HINT", reveal: false });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(showing(actor)).toBe(true);
    expect(snapshotOf(actor.getSnapshot())?.rung).toBe(1);
  });

  test("after a reveal: Try again re-opens the question at rung 4; a pass then finishes the step", async () => {
    const { actor, posted, states } = open();
    await check(actor, "S6", "fail");
    actor.send({ type: "TRY_AGAIN" });
    await check(actor, "S6", "fail", { code: "b" });
    states.set("S6", { ...(states.get("S6") as StepState), revealAvailable: true });
    actor.send({ type: "HINT", reveal: true });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(snapshotOf(actor.getSnapshot())?.rung).toBe(4);
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    expect(snapshotOf(actor.getSnapshot())?.rung).toBe(4);
    await check(actor, "S6", "pass", { code: "c" });
    expect(posted.length).toBe(3);
    expect(actor.getSnapshot().context.states.S6?.passed).toBe(true);
  });

  test("Try a new one after a verdict starts a new series and opens the question", async () => {
    const { actor } = open();
    await check(actor, "S6", "fail");
    actor.send({ type: "NEW_SERIES" });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
    expect(answering(actor)).toBe(true);
    expect(actor.getSnapshot().context.states.S6?.seriesNo).toBe(1);
  });
});

describe("Try again, saving and moving between steps", () => {
  test("a save that failed: Try again and the same answer reuse its key (one attempt on the server)", async () => {
    const { actor, posted } = open("S6", fakeServer({ failSaves: 1 }));
    await check(actor, "S6", "pass");
    expect(actor.getSnapshot().context.notice).toContain("Try again");
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    await check(actor, "S6", "pass");
    expect(posted.length).toBe(2);
    expect(posted[0]?.idempotencyKey).toBe(posted[1]?.idempotencyKey);
  });

  test("each step keeps its own verdict: leaving and coming back shows it again", async () => {
    const { actor } = open();
    await check(actor, "S6", "pass");
    actor.send({ type: "CONTINUE" });
    expect(snapshotOf(actor.getSnapshot())?.stepId).toBe("S7");
    expect(answering(actor)).toBe(true);
    actor.send({ type: "BACK" });
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    actor.send({ type: "FORWARD" });
    expect(answering(actor)).toBe(true);
    actor.send({ type: "GOTO", stepId: "S6" });
    expect(answering(actor)).toBe(true);
  });

  test("a reload during a retry opens the step on the server's state, with no verdict and the same series", async () => {
    const server = fakeServer();
    const first = open("S6", server);
    await check(first.actor, "S6", "fail");
    first.actor.send({ type: "HINT", reveal: false });
    await waitFor(first.actor, (s) => s.matches({ active: "idle" }));
    first.actor.send({ type: "TRY_AGAIN" });
    first.actor.stop();
    // The page reloads: the machine starts again from the server's step states.
    const saved = server.states.get("S6") as StepState;
    const again = open("S6", server, [saved]);
    expect(answering(again.actor)).toBe(true);
    const snap = snapshotOf(again.actor.getSnapshot());
    expect(snap).toMatchObject({ stepId: "S6", rung: 1, attempts: 1, lastResult: null });
    await check(again.actor, "S6", "pass", { code: "z" }, saved.seriesNo);
    expect(server.posted.map((p) => p.seriesNo)).toEqual([0, 0]);
  });

  test("a reloaded predict that was answered shows its outcome, and Try again re-opens the guess", () => {
    const { actor } = open("S3", fakeServer(), [stateOf("S3", { attempts: 1, practiceNext: true })]);
    expect(snapshotOf(actor.getSnapshot())?.stepId).toBe("S3");
    expect(showing(actor)).toBe(true);
    actor.send({ type: "TRY_AGAIN" });
    expect(answering(actor)).toBe(true);
    expect(resultShown(actor.getSnapshot().context)).toBe(false);
  });
});

describe("resultOnScreen", () => {
  const step = (id: string) => u01l01.steps.find((s) => s.id === id) as LessonDef["steps"][number];
  const p = (patch: Partial<Parameters<typeof resultOnScreen>[1]> = {}) => ({
    state: null,
    result: null,
    done: false,
    disputed: false,
    ...patch,
  });
  test("a verdict is a result; a Make's live checklist and a step without one are not", () => {
    expect(resultOnScreen(step("S6"), p(), 0)).toBe(false);
    expect(resultOnScreen(step("S6"), p({ result: result("fail") }), 0)).toBe(true);
    expect(resultOnScreen(step("S6"), p({ result: result("pass") }), 3)).toBe(true);
    expect(resultOnScreen(step("S8"), p({ result: result("pass") }), 0)).toBe(false);
    expect(resultOnScreen(step("S1"), p(), 0)).toBe(false);
  });
  test("a predict answered before shows its outcome until Try again", () => {
    const answered = p({ state: stateOf("S3", { attempts: 1 }) });
    expect(resultOnScreen(step("S3"), answered, 0)).toBe(true);
    expect(resultOnScreen(step("S3"), answered, 1)).toBe(false);
  });
});
