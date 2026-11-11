import { describe, expect, test } from "bun:test";
import type { SessionPlan, SessionSummary } from "@oak/api";
import { createActor, fromPromise, waitFor } from "xstate";
import { fixturePlan, fixtureSession, fixtureSummary, PLANS } from "./fixtures.ts";
import { type EndInput, isPausedValue, type RunnerStatus, sessionMachine, statusOf } from "./machine.ts";
import { INITIAL_SESSION, sessionEndBody, sessionReducer } from "./store.ts";
import type { BlockReport, SessionEvent, SessionState } from "./types.ts";

/** Drives the store reducer and the machine together, the way the runner does. */
function harness(plan: SessionPlan, end?: (input: EndInput) => Promise<SessionSummary>) {
  const ends: EndInput[] = [];
  const blocks: string[] = [];
  let done = 0;
  const machine = sessionMachine.provide({
    actors: {
      endSession: fromPromise<SessionSummary, EndInput>(async ({ input }) => {
        ends.push(input);
        return end ? end(input) : fixtureSummary();
      }),
    },
    actions: {
      onBlock: (_, params) => {
        blocks.push(params.block);
      },
      onDone: () => {
        done++;
      },
    },
  });
  const actor = createActor(machine, { input: {} });
  actor.start();
  let state: SessionState = INITIAL_SESSION;
  const session = fixtureSession({ kind: plan.kind, mapItemId: plan.mapItemId });
  const send = (ev: SessionEvent) => {
    const before = state.block;
    state = sessionReducer(state, ev);
    if (state.block !== before)
      actor.send({ type: "SYNC", block: state.block, endBody: sessionEndBody(state) });
  };
  send({ type: "begin", plan, session });
  actor.send({ type: "BEGIN", plan, session, block: state.block ?? "coda" });
  return {
    actor,
    ends,
    blocks,
    get done() {
      return done;
    },
    get state() {
      return state;
    },
    status: (): RunnerStatus => statusOf(actor.getSnapshot().value),
    report: (report: BlockReport) => send({ type: "report", report }),
    send,
  };
}

const warm = (id: string): BlockReport => ({
  block: "warmup",
  source: "drills",
  warmupItemId: id,
  drillSessionId: `dr_${id}`,
  meanCredit: 0.9,
});

describe("session machine: a lesson day (contracts §9.3)", () => {
  test("idle → warmup (item by item) → main → make → coda → done", async () => {
    const h = harness(PLANS.lesson);
    expect(h.status()).toBe("warmup");
    h.report(warm("w1"));
    h.report(warm("w2"));
    expect(h.status()).toBe("warmup");
    h.report(warm("w3"));
    expect(h.status()).toBe("main");
    h.send({ type: "tick", ms: 30_000 });
    h.report({ block: "new", source: "lesson", itemId: "U01.L01", completed: true });
    expect(h.status()).toBe("make");
    h.report({ block: "make", source: "lesson", sketchId: "sk_1" });
    await waitFor(h.actor, (s) => statusOf(s.value) === "coda");
    expect(h.ends).toHaveLength(1);
    expect(h.ends[0]?.sessionId).toBe("ses_1");
    expect(h.ends[0]?.body.phaseMs.main).toBe(30_000);
    expect(h.actor.getSnapshot().context.summary?.sketchesSaved).toEqual(["sk_1"]);
    h.report({ block: "coda", source: "coda" });
    expect(h.status()).toBe("done");
    expect(h.done).toBe(1);
    expect(h.blocks).toEqual(["warmup", "main", "make", "coda"]);
  });

  test("nothing due: the session starts at New", () => {
    const h = harness(PLANS.noWarmup);
    expect(h.status()).toBe("main");
    expect(h.blocks).toEqual(["main"]);
  });

  test("Wrap up during New jumps to the Quick sketch (make) and ends wrapped early", async () => {
    const h = harness(PLANS.lesson);
    h.send({ type: "enter", block: "new" });
    h.send({ type: "wrap-up" });
    expect(h.status()).toBe("make");
    h.report({ block: "make", source: "quick-sketch", sketchId: "sk_q" });
    await waitFor(h.actor, (s) => statusOf(s.value) === "coda");
    expect(h.ends[0]?.body.wrappedEarly).toBe(true);
  });

  test("the 15-minute split: part A ends at wrapAt (completed: false) and goes to the Quick sketch", () => {
    const h = harness(PLANS.splitA);
    for (const id of ["w1", "w2", "w3"]) h.report(warm(id));
    h.report({ block: "new", source: "lesson", itemId: "U01.L01", completed: false, resumeStep: "S5" });
    expect(h.status()).toBe("make");
    expect(h.state.wrappedEarly).toBe(false);
  });

  test("never moves backwards and ignores stale syncs", () => {
    const h = harness(PLANS.lesson);
    h.send({ type: "enter", block: "make" });
    expect(h.status()).toBe("make");
    h.actor.send({ type: "SYNC", block: "warmup", endBody: sessionEndBody(h.state) });
    h.actor.send({ type: "SYNC", block: "new", endBody: sessionEndBody(h.state) });
    expect(h.status()).toBe("make");
  });

  test("pause and resume at a step: the clock region pauses, the store stops counting", () => {
    const h = harness(PLANS.lesson);
    h.actor.send({ type: "PAUSE" });
    h.send({ type: "pause" });
    expect(isPausedValue(h.actor.getSnapshot().value)).toBe(true);
    h.send({ type: "tick", ms: 20_000 });
    expect(h.state.activeMs).toBe(0);
    h.actor.send({ type: "RESUME" });
    h.send({ type: "resume" });
    h.send({ type: "tick", ms: 20_000 });
    expect(isPausedValue(h.actor.getSnapshot().value)).toBe(false);
    expect(h.state.activeMs).toBe(20_000);
    expect(h.status()).toBe("warmup");
  });

  test("ending fails: the Coda can retry; FINISH works once it has a summary", async () => {
    let fail = true;
    const h = harness(PLANS.noWarmup, async () => {
      if (fail) throw new Error("the server is offline");
      return fixtureSummary();
    });
    h.send({ type: "enter", block: "coda" });
    await waitFor(h.actor, (s) => statusOf(s.value) === "end-failed");
    expect(h.actor.getSnapshot().context.endError).toBe("the server is offline");
    fail = false;
    h.actor.send({ type: "RETRY_END" });
    await waitFor(h.actor, (s) => statusOf(s.value) === "coda");
    h.actor.send({ type: "FINISH" });
    expect(h.status()).toBe("done");
  });

  test("abandoning leaves without ending the session on the server", () => {
    const h = harness(PLANS.lesson);
    h.actor.send({ type: "ABANDON" });
    expect(h.status()).toBe("done");
    expect(h.ends).toHaveLength(0);
    expect(h.done).toBe(0);
  });
});

describe("session machine: other days", () => {
  test("checkpoint day: warm-up → checkpoint → Make → Coda", () => {
    const h = harness(PLANS.checkpoint);
    for (const id of ["w1", "w2", "w3"]) h.report(warm(id));
    expect(h.status()).toBe("main");
    h.report({ block: "new", source: "checkpoint", itemId: "U01.CP", completed: true });
    expect(h.status()).toBe("make");
    h.report({ block: "make", source: "checkpoint", sketchId: "sk_cp" });
    expect(["ending", "coda"]).toContain(h.status());
  });

  test("capstone and gym days: the work is the Make, straight to the Coda", () => {
    for (const plan of [PLANS.capstone, PLANS.gym]) {
      const h = harness(plan);
      for (const id of ["w1", "w2", "w3"]) h.report(warm(id));
      h.report({
        block: "new",
        source: plan.kind === "gym" ? "gym" : "capstone",
        itemId: plan.mapItemId ?? "",
        completed: true,
      });
      expect(["ending", "coda"]).toContain(h.status());
      expect(h.blocks).toEqual(["warmup", "main", "coda"]);
    }
  });

  test("review day: warm-up then Coda", () => {
    const h = harness(PLANS.review);
    for (const id of ["w1", "w2", "w3"]) h.report(warm(id));
    expect(["ending", "coda"]).toContain(h.status());
    expect(h.blocks).toEqual(["warmup", "coda"]);
  });

  test("keep-alive: one set, then the optional riff, then Coda", () => {
    const plan = fixturePlan({
      kind: "keepalive",
      mapItemId: null,
      main: null,
      warmup: { ...PLANS.lesson.warmup, items: PLANS.lesson.warmup.items.slice(0, 1) },
    });
    const h = harness(plan);
    h.report(warm("w1"));
    expect(h.status()).toBe("make");
    h.send({ type: "enter", block: "coda" });
    expect(["ending", "coda"]).toContain(h.status());
  });

  test("light day after a long break: warm-up → light lesson → make → coda", () => {
    const h = harness(PLANS.light);
    for (const id of ["w1", "w2", "w3"]) h.report(warm(id));
    expect(h.status()).toBe("main");
    h.report({ block: "new", source: "light", itemId: "U01.L01", completed: true });
    h.report({ block: "make", source: "lesson", sketchId: "sk_l" });
    expect(["ending", "coda"]).toContain(h.status());
  });
});
