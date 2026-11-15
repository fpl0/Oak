// "Try again" over every answer kind (docs/design/retry.md §3.1, §4): each kind's right and wrong answer (the
// answer gallery's fixtures, the same values its widgets produce) goes through the lesson machine's one Check path
// to a server that keeps the series as docs/design/retry.md §3.1 says. After a right, a wrong and a revealed
// answer, Try again posts nothing, the next Check is exactly one attempt, and what is recorded follows the policy:
//   right → Try again → wrong   : practice; the step stays passed, the best score stays, no new evidence;
//   wrong → Try again → right   : a retry after a fail (evidence 0.3 at the adjusted score); the step passes;
//   wrong, reveal → Try again → right : a retry at rung 4 (adjusted ×0: never counts as known); the step finishes.
// The widget lock follows the same table for every kind: a verdict disables the widget, except a take.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type {
  AttemptResponse,
  Exercise,
  GradeResult,
  HintRung,
  LessonDef,
  StepDef,
  StepState,
} from "@oak/api";
import { adjustScore } from "@oak/content-kit";
import { createActor, waitFor } from "xstate";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import { demoCheck, FIXTURES, type Fixture } from "../answers/dev/fixtures.ts";
import { responseOf } from "../answers/response.ts";
import { TAKE_KINDS, widgetDisabled } from "../answers/types.ts";
import { PRACTICE_LINE, REVEALED_LINE, retryLine } from "../lib/retry.ts";
import { type LessonDeps, lessonMachine } from "./machine.ts";

/** One evidence row as course.ts writes it for a lesson step (contracts §7.5). */
interface Evidence {
  score: number;
  weight: number;
}

/** docs/design/retry.md §3.1, as the server keeps it: first / retry / practice, the rung, passed, best score. */
function policyServer() {
  let state: StepState = {
    lessonId: "L",
    stepId: "S1",
    rung: 0,
    passed: false,
    attempts: 0,
    seriesNo: 0,
    revealAvailable: false,
    result: null,
    practiceNext: false,
  };
  const evidence: Evidence[] = [];
  const posted: { response: AttemptResponse; key: string; practice: boolean }[] = [];
  let counted = 0;
  let best = 0;
  let key = 0;
  const deps: LessonDeps = {
    async postAttempt(a) {
      const graded = a.result.status !== "error";
      const practice = graded && state.passed;
      posted.push({ response: a.response, key: a.idempotencyKey, practice });
      if (graded && !practice) {
        const adjusted = adjustScore(a.result.score, state.rung, 0);
        evidence.push({ score: adjusted, weight: counted === 0 ? 1 : 0.3 });
        counted += 1;
        best = Math.max(best, a.result.score);
      }
      const passed = practice ? state.passed : state.passed || a.result.status === "pass";
      state = {
        ...state,
        attempts: state.attempts + (graded ? 1 : 0),
        passed,
        revealAvailable: state.attempts + 1 >= 2,
        practiceNext: passed,
      };
      return { state, testedOut: [] };
    },
    async hint(_id, reveal) {
      state = { ...state, rung: (reveal ? 4 : Math.min(3, state.rung + 1)) as HintRung };
      return state;
    },
    async newSeries() {
      return state;
    },
    async finish() {
      return { sketchId: "s", result: null };
    },
    async quickSketch() {
      return { sketchId: "s" };
    },
    position() {},
    newKey: () => `k${++key}`,
  };
  return {
    deps,
    posted,
    evidence,
    get best() {
      return best;
    },
    get state() {
      return state;
    },
  };
}

/** A one-step graded lesson asking the fixture's question (the machine needs a step, not its answer UI). */
function lessonFor(f: Fixture): { def: LessonDef; step: StepDef } {
  const template = u01l01.steps.find((s) => s.id === "S6") as StepDef;
  const step = { ...template, id: "S1", title: f.title } as StepDef;
  return { def: { ...u01l01, steps: [step], wrapAt: "S1" } as unknown as LessonDef, step };
}

/**
 * The verdict for the fixture's right answer (its own check) or its wrong one, as a GradeResult. A hum is
 * completion only and a click-roll sample can land on a right cell: their wrong answer is a fail by fiat.
 */
function gradeOf(f: Fixture, right: boolean): GradeResult {
  const pass = right && demoCheck(f, f.expected).state === "correct";
  return {
    exerciseId: f.id,
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: pass ? "pass" : "fail",
    score: pass ? 1 : 0.4,
    adjustedScore: pass ? 1 : 0.4,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: [],
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
  };
}

function run(f: Fixture) {
  const server = policyServer();
  const { def, step } = lessonFor(f);
  const actor = createActor(lessonMachine, {
    input: { lessonId: def.id, target: 20, sessionId: null, deps: server.deps },
  }).start();
  actor.send({ type: "LOADED", lesson: def, resumeStep: "S1", splitPart: null });
  const check = async (right: boolean) => {
    const value = right ? f.expected : f.sample;
    actor.send({ type: "CHECK" });
    actor.send({
      type: "SUBMIT",
      response: responseOf(f.spec, value),
      result: gradeOf(f, right),
      extraReplays: 0,
      exercise: step.exercise as Exercise,
      seriesNo: 0,
      params: {},
    });
    await waitFor(actor, (s) => s.matches({ active: { idle: "result" } }));
  };
  const tryAgain = () => {
    const before = server.posted.length;
    actor.send({ type: "TRY_AGAIN" });
    expect(actor.getSnapshot().matches({ active: { idle: "answering" } })).toBe(true);
    expect(actor.getSnapshot().context.results.S1).toBeNull();
    // Try again never posts: the next Check does, once.
    expect(server.posted.length).toBe(before);
  };
  const reveal = async () => {
    actor.send({ type: "HINT", reveal: true });
    await waitFor(actor, (s) => s.matches({ active: "idle" }));
  };
  return { actor, server, check, tryAgain, reveal };
}

// Every answer kind the widgets draw, once (the gallery holds one or more fixtures per kind).
const byKind = new Map<string, Fixture>();
for (const f of FIXTURES)
  if (!byKind.has(f.kind) && demoCheck(f, f.expected).state === "correct") byKind.set(f.kind, f);
const kinds = [...byKind.values()];

describe("every answer kind can be tried again", () => {
  test("every kind the answer registry draws is covered, each with a right answer", () => {
    // The registry's table, read from its source (importing it loads the browser-only pitch worklet).
    const src = readFileSync(new URL("../answers/registry.tsx", import.meta.url), "utf8");
    const table = src.slice(
      src.indexOf("export const ANSWER_WIDGETS"),
      src.indexOf("};", src.indexOf("export const ANSWER_WIDGETS")),
    );
    const registered = [...table.matchAll(/^\s+"?([a-z-]+)"?: [A-Z]\w+,$/gm)].map((m) => m[1]);
    expect(registered.length).toBeGreaterThan(20);
    expect(new Set(kinds.map((f) => f.kind))).toEqual(new Set(registered));
  });

  for (const f of kinds)
    describe(`${f.kind}`, () => {
      test("right → Try again → wrong is practice: still passed, best kept, no new evidence", async () => {
        const r = run(f);
        await r.check(true);
        expect(r.server.state.passed).toBe(true);
        expect(retryLine({ surface: "lesson-step", counted: r.server.state.practiceNext === true })).toBe(
          PRACTICE_LINE,
        );
        r.tryAgain();
        await r.check(false);
        expect(r.server.posted.map((p) => p.practice)).toEqual([false, true]);
        expect(r.server.state.passed).toBe(true);
        expect(r.server.best).toBe(1);
        expect(r.server.evidence).toEqual([{ score: 1, weight: 1 }]);
        // The wrong practice take is on screen as a verdict and can be tried again in turn.
        expect(r.actor.getSnapshot().context.results.S1?.status).toBe("fail");
        r.tryAgain();
      });

      test("wrong → Try again → right is a retry after a fail: 0.3, and the step passes", async () => {
        const r = run(f);
        await r.check(false);
        r.tryAgain();
        await r.check(true);
        expect(r.server.posted.length).toBe(2);
        expect(r.server.posted[0]?.key).not.toBe(r.server.posted[1]?.key);
        expect(r.server.evidence).toEqual([
          { score: 0.4, weight: 1 },
          { score: 1, weight: 0.3 },
        ]);
        expect(r.server.state.passed).toBe(true);
      });

      test("wrong, revealed → Try again → right finishes the step but never counts as known", async () => {
        const r = run(f);
        await r.check(false);
        r.tryAgain();
        await r.check(false);
        await r.reveal();
        expect(r.server.state.rung).toBe(4);
        expect(retryLine({ surface: "lesson-step", counted: false, revealed: true })).toBe(REVEALED_LINE);
        r.tryAgain();
        await r.check(true);
        expect(r.server.posted.length).toBe(3);
        expect(r.server.evidence.at(-1)).toEqual({ score: 0, weight: 0.3 });
        expect(r.server.state.passed).toBe(true);
      });

      test("a verdict locks the widget until Try again; a take keeps its playback", () => {
        const take = TAKE_KINDS.includes(f.kind);
        expect(widgetDisabled(f.kind, false, true)).toBe(!take);
        expect(widgetDisabled(f.kind, false, false)).toBe(false);
        expect(widgetDisabled(f.kind, true, false)).toBe(true);
      });
    });
});
