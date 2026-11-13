// The voicing gate in the lesson player (contracts §3.1 rule 6): the pure rules (what meets it, which steps
// show, which tools stay locked, what the gate box says) and the machine (U05.L08's second chance shown only
// while the gate is unmet, the one hard gate: Continue opens on a gate pass only, never on a reveal or below 0.9;
// a pass inside the visit opens it at once).
import { describe, expect, test } from "bun:test";
import type { GradeResult, LessonDef, StepState, UnlockableId } from "@oak/api";
import { createActor } from "xstate";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import { VOICING_GATE } from "../../../content/toolbox.ts";
import {
  continueNote,
  type GateRule,
  type GateState,
  gateAllowsContinue,
  gatedIds,
  gateLine,
  gateMetBy,
  gateNeedsFreshTry,
  isGateExercise,
  pct,
  stepsForGate,
  withoutGated,
} from "./gate.ts";
import { type LessonDeps, lessonMachine, snapshotOf } from "./machine.ts";
import { canContinue } from "./model.ts";

const RULE: GateRule = {
  exercise: VOICING_GATE.exercise,
  variants: VOICING_GATE.variants,
  minScore: VOICING_GATE.minScore,
};

function result(score: number, o: { revealed?: boolean; status?: GradeResult["status"] } = {}): GradeResult {
  return {
    exerciseId: "U05.L08/hand-voiced-cadence-again",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: o.status ?? (score >= 0.85 ? "pass" : "fail"),
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: [],
    assist: { rung: o.revealed ? 4 : 0, tutorHints: 0, extraReplays: 0, revealed: o.revealed ?? false },
  };
}

describe("the rule", () => {
  test("the check and its variant are the gate; nothing else is", () => {
    expect(isGateExercise(RULE, "U05.L07/hand-voiced-cadence")).toBe(true);
    expect(isGateExercise(RULE, "U05.L08/hand-voiced-cadence-again")).toBe(true);
    expect(isGateExercise(RULE, "U05.L07/voice-v-after-i")).toBe(false);
  });

  test("0.9 unrevealed meets it; 0.89, a reveal, an error do not", () => {
    expect(gateMetBy(result(0.9), 0.9)).toBe(true);
    expect(gateMetBy(result(1), 0.9)).toBe(true);
    // A step pass (≥ 0.85) below the gate's 0.9 is not a gate pass.
    expect(gateMetBy(result(0.88), 0.9)).toBe(false);
    expect(gateMetBy(result(1, { revealed: true }), 0.9)).toBe(false);
    expect(gateMetBy(result(1, { status: "error" }), 0.9)).toBe(false);
    expect(gateMetBy(null, 0.9)).toBe(false);
  });

  test("the second chance shows only while the gate is unmet (unknown counts as unmet)", () => {
    const steps = [{ id: "S1", gateCheck: true as const }, { id: "S2" }];
    expect(stepsForGate(steps, true).map((s) => s.id)).toEqual(["S2"]);
    expect(stepsForGate(steps, false).map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(stepsForGate(steps, null).map((s) => s.id)).toEqual(["S1", "S2"]);
  });

  test("the gated rows stay locked until the gate is met", () => {
    const toolbox = [
      { id: "tb.voicing", unlock: { condition: VOICING_GATE } },
      { id: "snd.rhodes", unlock: { condition: VOICING_GATE } },
      { id: "tb.add", unlock: {} },
    ];
    const gated = gatedIds(toolbox);
    expect([...gated].sort()).toEqual(["snd.rhodes", "tb.voicing"]);
    const held = ["tb.voicing", "snd.rhodes", "tb.add"] as UnlockableId[];
    expect([...withoutGated(held, gated, false)]).toEqual(["tb.add"]);
    expect([...withoutGated(held, gated, true)].sort()).toEqual([...held].sort());
  });

  test("the real toolbox holds voicing, chord, rhodes and organ behind the gate", async () => {
    const { TOOLBOX } = (await import("../../../content/toolbox.ts")) as unknown as {
      TOOLBOX?: { id: string; unlock: { condition?: unknown } }[];
    };
    const rows =
      TOOLBOX ??
      (
        (await import("../../../content/toolbox.ts")) as unknown as {
          default: { id: string; unlock: { condition?: unknown } }[];
        }
      ).default;
    const gated = gatedIds(rows);
    for (const id of ["tb.voicing", "tb.chord", "snd.rhodes", "snd.organ"]) expect(gated.has(id)).toBe(true);
    expect(gated.has("tb.add")).toBe(false);
  });

  test("Continue on a gateCheck step: a gate pass only", () => {
    const step = { gateCheck: true as const };
    const unmet: GateState = { rule: RULE, passed: false };
    expect(gateAllowsContinue(step, result(0.95), unmet)).toBe(true);
    expect(gateAllowsContinue(step, result(0.86), unmet)).toBe(false);
    expect(gateAllowsContinue(step, result(1, { revealed: true }), unmet)).toBe(false);
    expect(gateAllowsContinue(step, null, { rule: RULE, passed: true })).toBe(true);
    // Any other step is not the gate's business.
    expect(gateAllowsContinue({}, null, unmet)).toBe(true);
  });

  test("the gate box says where the learner stands, exactly and calmly", () => {
    expect(gateLine(null, RULE, "lesson").body).toContain("90%");
    const near = gateLine(result(0.84), RULE, "lesson");
    expect(near.tone).toBe("near");
    expect(near.title).toBe("84% of the 90% the gate needs");
    expect(gateLine(result(1, { revealed: true }), RULE, "lesson").title).toContain("revealed");
    const met = gateLine(result(0.93), RULE, "second-chance");
    expect(met.tone).toBe("met");
    expect(met.title).toBe("93%: the gate is open");
    for (const r of [null, result(0.5), result(0.95)])
      for (const w of ["lesson", "second-chance"] as const)
        expect(gateLine(r, RULE, w).body).not.toMatch(/fail|wrong|sorry/i);
    expect(pct(0.666)).toBe(67);
    expect(gateLine(result(0.899), RULE, "lesson").title).toBe("89% of the 90% the gate needs");
  });
});

// --- the machine ----------------------------------------------------------------------------------

/** U01.L01 with S1 turned into a second chance at the gate (the shape of U05.L08 S1). */
const withHints = u01l01.steps.find((s) => s.exercise && s.exercise.hints !== null && s.kind === "modify");
const gated: LessonDef = {
  ...u01l01,
  steps: u01l01.steps.map((s, i) =>
    i === 0 ? { ...s, gateCheck: true as const, graded: true, exercise: withHints?.exercise } : s,
  ),
} as LessonDef;

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

function start(gate: GateState | null) {
  const deps: LessonDeps = {
    async postAttempt(a) {
      return {
        state: stateOf(a.stepId, { passed: a.result.status === "pass", attempts: 1 }),
        testedOut: [],
      };
    },
    async hint(stepId, reveal) {
      return stateOf(stepId, { rung: reveal ? 4 : 1 });
    },
    async newSeries(stepId) {
      return stateOf(stepId, { seriesNo: 1 });
    },
    async finish() {
      return { sketchId: "sk", result: null };
    },
    async quickSketch() {
      return { sketchId: "q" };
    },
    position() {},
  };
  const actor = createActor(lessonMachine, {
    input: { lessonId: gated.id, target: 20, sessionId: null, deps },
  }).start();
  actor.send({ type: "LOADED", lesson: gated, resumeStep: null, splitPart: null, gate });
  return actor;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const stepOf = (a: ReturnType<typeof start>) => snapshotOf(a.getSnapshot())?.stepId;
const first = gated.steps[0]?.id as string;
const second = gated.steps[1]?.id as string;

async function check(a: ReturnType<typeof start>, r: GradeResult) {
  a.send({ type: "CHECK" });
  a.send({
    type: "SUBMIT",
    response: { code: "x" },
    result: r,
    extraReplays: 0,
    exercise: gated.steps[0]?.exercise as never,
    seriesNo: 0,
    params: {},
  });
  await flush();
}

describe("a revealed gate check (review:journey)", () => {
  const open: GateState = { rule: RULE, passed: false };
  test("offers a fresh try only on a gate check revealed while the gate is unmet", () => {
    expect(gateNeedsFreshTry(open, RULE.variants[0] ?? "", 4)).toBe(true);
    expect(gateNeedsFreshTry(open, RULE.exercise, 4)).toBe(true);
    expect(gateNeedsFreshTry(open, RULE.exercise, 3), "hints 1 to 3 count").toBe(false);
    expect(gateNeedsFreshTry({ rule: RULE, passed: true }, RULE.exercise, 4)).toBe(false);
    expect(gateNeedsFreshTry(open, "U05.L07/something-else", 4)).toBe(false);
    expect(gateNeedsFreshTry(null, RULE.exercise, 4)).toBe(false);
  });
  test("the revealed line names the fresh try, never 'check again' alone", () => {
    for (const where of ["lesson", "second-chance"] as const) {
      const l = gateLine(result(1, { revealed: true }), RULE, where);
      expect(l.title).toBe("A revealed answer does not open the gate");
      expect(l.body).toContain("Start a fresh try");
    }
    expect(gateLine(result(1, { revealed: true }), RULE, "lesson").body).toContain("the next lesson");
  });
  test("a held second chance says what opens it, and never 'show the answer'", () => {
    expect(continueNote({ gateCheck: true }, open)).toBe(
      "Pass the check at 90% or more to go on. Hints 1 to 3 are fine.",
    );
    expect(continueNote({}, open)).toBe("Pass the check, or show the answer, to go on.");
  });
});

describe("the machine", () => {
  test("a met gate drops the second chance: the lesson opens at its next step", () => {
    const a = start({ rule: RULE, passed: true });
    expect(stepOf(a)).toBe(second);
    expect(a.getSnapshot().context.steps.some((s) => s.gateCheck)).toBe(false);
  });

  test("an unmet or unknown gate keeps it first", () => {
    expect(stepOf(start({ rule: RULE, passed: false }))).toBe(first);
    expect(stepOf(start(null))).toBe(first);
  });

  test("below 0.9 the step does not open, even as a step pass; a retry at once can", async () => {
    const a = start({ rule: RULE, passed: false });
    await check(a, result(0.87));
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(first);
    expect(a.getSnapshot().context.gate?.passed).toBe(false);
    await check(a, result(0.92));
    expect(a.getSnapshot().context.gate?.passed).toBe(true);
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(second);
  });

  test("a reveal never opens it: the hard gate holds", async () => {
    const a = start({ rule: RULE, passed: false });
    a.send({ type: "HINT", reveal: true });
    await flush();
    expect(a.getSnapshot().context.states[first]?.rung).toBe(4);
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(first);
    await check(a, result(1, { revealed: true }));
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(first);
    // A report does not open it either (contracts §3.1 rule 6: the only hard gate of the course).
    a.send({ type: "DISPUTED", stepId: first });
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(first);
  });

  test("the server's word that the gate is met opens the step", () => {
    const a = start({ rule: RULE, passed: false });
    a.send({ type: "GATE", passed: true });
    a.send({ type: "CONTINUE" });
    expect(stepOf(a)).toBe(second);
  });

  test("canContinue reads the gate; lessons without one are unchanged", () => {
    const s = gated.steps[0] as LessonDef["steps"][number];
    const p = { state: null, result: result(0.95), done: false, disputed: false };
    expect(canContinue(s, p, { rule: RULE, passed: false })).toBe(true);
    expect(canContinue(s, { ...p, result: result(0.8) }, { rule: RULE, passed: false })).toBe(false);
    const plain = u01l01.steps[0] as LessonDef["steps"][number];
    expect(canContinue(plain, { ...p, result: null })).toBe(canContinue(plain, { ...p, result: null }, null));
  });
});
