import { describe, expect, test } from "bun:test";
import type { OnboardingState } from "@oak/api";
import { createActor } from "xstate";
import {
  canVisit,
  FLOW,
  freshState,
  frontier,
  nextAfter,
  positionOf,
  prevBefore,
  railOf,
  STEP_META,
  stepFromParam,
} from "./flow.ts";
import {
  applyDone,
  applyEdited,
  applyQuiet,
  applySkip,
  type OnboardingContext,
  onboardingMachine,
  patchOf,
} from "./machine.ts";

const ctx = (over: Partial<OnboardingContext> = {}): OnboardingContext => ({
  ...freshState(),
  quiet: false,
  ...over,
});

describe("flow", () => {
  test("covers every API step exactly once", () => {
    expect(new Set(FLOW).size).toBe(13);
  });
  test("URL params: ids and Today's 1-based numbers", () => {
    expect(stepFromParam("mic")).toBe("mic");
    expect(stepFromParam("1")).toBe("welcome");
    expect(stepFromParam("3")).toBe("edit");
    expect(stepFromParam("99")).toBeNull();
    expect(stepFromParam("nope")).toBeNull();
  });
  test("the frontier is the first step neither done nor skipped", () => {
    expect(frontier({ completed: [], skipped: [] })).toBe("welcome");
    expect(frontier({ completed: ["welcome", "loop"], skipped: [] })).toBe("edit");
    expect(frontier({ completed: [...FLOW], skipped: [] })).toBe("coda");
  });
  test("a step ahead of the frontier cannot be opened", () => {
    const st = { completed: ["welcome", "loop"] as const, skipped: [] as const };
    expect(canVisit({ completed: [...st.completed], skipped: [] }, "loop")).toBe(true);
    expect(canVisit({ completed: [...st.completed], skipped: [] }, "edit")).toBe(true);
    expect(canVisit({ completed: [...st.completed], skipped: [] }, "mic")).toBe(false);
  });
  test("Quiet mode passes over the range; the first note becomes a listening step, never passed over", () => {
    expect(nextAfter("mic", true)).toEqual({ next: "latency", autoSkipped: ["range"] });
    expect(nextAfter("latency", true)).toEqual({ next: "first-sing", autoSkipped: [] });
    expect(nextAfter("mic", false)).toEqual({ next: "range", autoSkipped: [] });
    expect(nextAfter("coda", false)).toEqual({ next: null, autoSkipped: [] });
  });
  test("Back goes to the previous completed step, never to welcome", () => {
    expect(prevBefore({ completed: ["welcome", "loop", "edit"], skipped: [] }, "react")).toBe("edit");
    expect(prevBefore({ completed: ["welcome"], skipped: [] }, "loop")).toBeNull();
    expect(
      prevBefore(
        { completed: ["welcome", "loop", "edit", "react", "prefs"], skipped: ["tutor"] },
        "headphones",
      ),
    ).toBe("prefs");
  });
  test("the rail marks done, current, skipped and to do", () => {
    const rail = railOf({ completed: ["welcome"], skipped: ["tutor"] }, "loop");
    expect(rail[0]?.state).toBe("done");
    expect(rail[1]?.state).toBe("current");
    // A step set up later reads "skipped" (not "to do", not "optional").
    expect(rail.find((r) => r.id === "tutor")?.state).toBe("skipped");
    expect(rail.at(-1)?.state).toBe("todo");
    expect(rail[1]?.sub).toBeUndefined();
  });
  test("the current step carries its sub-step; the position reads Step N of 13 · name · sub", () => {
    const rail = railOf({ completed: ["welcome"], skipped: [] }, "mic", "2 of 3: a quiet moment");
    expect(rail.find((r) => r.id === "mic")?.sub).toBe("2 of 3: a quiet moment");
    expect(rail.filter((r) => r.sub !== undefined)).toHaveLength(1);
    expect(positionOf("mic", "2 of 3: a quiet moment")).toBe(
      "Step 8 of 13 · Microphone · 2 of 3: a quiet moment",
    );
    expect(positionOf("first-sing")).toBe("Step 11 of 13 · Your first note");
  });
  test("one name per step: the rail label is the heading and the Back label", () => {
    expect(STEP_META.tutor.label).toBe("Your tutor");
    expect(STEP_META["first-sing"].label).toBe("Your first note");
    expect(new Set(FLOW.map((s) => STEP_META[s].label)).size).toBe(FLOW.length);
  });
});

describe("transitions", () => {
  test("DONE adds the step, moves on and keeps the first edit", () => {
    const c = applyDone(ctx({ step: "edit", completed: ["welcome", "loop"] }), {
      type: "DONE",
      step: "edit",
      firstEdit: 6,
      at: "2026-11-11T10:00:00.000Z",
    });
    expect(c.completed).toEqual(["welcome", "loop", "edit"]);
    expect(c.step).toBe("react");
    expect(c.firstEdit).toBe(6);
    expect(c.startedAt).toBe("2026-11-11T10:00:00.000Z");
  });
  test("redoing an earlier step returns to the frontier, not to the step after it", () => {
    const base = ctx({
      step: "prefs",
      completed: ["welcome", "loop", "edit", "react", "prefs", "tutor", "headphones"],
    });
    const c = applyDone({ ...base, step: "prefs" }, { type: "DONE", step: "prefs" });
    expect(c.step).toBe("mic");
  });
  test("Quiet mode records the mic steps as skipped", () => {
    let c = ctx({
      quiet: true,
      step: "mic",
      completed: ["welcome", "loop", "edit", "react", "prefs", "tutor", "headphones"],
    });
    c = applyDone(c, { type: "DONE", step: "mic" });
    expect(c.step).toBe("latency");
    expect(c.skipped).toEqual(["range"]);
    c = applyDone(c, { type: "DONE", step: "latency" });
    expect(c.step).toBe("first-sing");
    expect(c.skipped).toEqual(["range"]);
  });
  test("each run on the reaction screen makes that number the learner's (sketch and coda follow it)", () => {
    let c = applyDone(ctx({ step: "edit", completed: ["welcome", "loop"] }), {
      type: "DONE",
      step: "edit",
      firstEdit: 6,
    });
    expect(c.step).toBe("react");
    c = applyEdited(c, 0);
    expect(c.firstEdit).toBe(0);
    expect(c.step).toBe("react");
    expect(patchOf(c).firstEdit).toBe(0);
    // Not a number from 0 to 7: nothing changes.
    expect(applyEdited(c, 9)).toBe(c);
  });
  test("Quiet off again (Back to the mic, Allow): the range is offered again, not left skipped", () => {
    let c = ctx({
      quiet: true,
      step: "mic",
      completed: ["welcome", "loop", "edit", "react", "prefs", "tutor", "headphones"],
    });
    c = applyDone(c, { type: "DONE", step: "mic" });
    c = applyDone(c, { type: "DONE", step: "latency" });
    expect(c.skipped).toEqual(["range"]);
    // Back to the microphone, Allow, the three sub-steps: Quiet goes off, then the mic is done.
    c = applyQuiet({ ...c, step: "mic" }, false);
    expect(c.quiet).toBe(false);
    expect(c.skipped).toEqual([]);
    c = applyDone(c, { type: "DONE", step: "mic" });
    expect(c.step).toBe("range");
    // A step the learner set up later themselves stays skipped (only the mic-only steps reopen).
    expect(applyQuiet(ctx({ quiet: true, skipped: ["tutor", "range"] }), false).skipped).toEqual(["tutor"]);
  });
  test("Quiet switched on in another tab while the range is on screen: the range is passed over", () => {
    const before = ctx({
      step: "range",
      completed: ["welcome", "loop", "edit", "react", "prefs", "tutor", "headphones", "mic"],
    });
    const c = applyQuiet(before, true);
    expect(c.quiet).toBe(true);
    expect(c.step).toBe("latency");
    expect(c.skipped).toEqual(["range"]);
    // Anywhere else nothing moves; a range already done stays done and on screen; on twice is once.
    const atLatency = applyQuiet({ ...before, step: "latency" }, true);
    expect(atLatency.step).toBe("latency");
    expect(atLatency.skipped).toEqual([]);
    const done = applyQuiet({ ...before, completed: [...before.completed, "range"] }, true);
    expect(done.step).toBe("range");
    expect(done.skipped).toEqual([]);
    expect(applyQuiet(c, true)).toBe(c);
    // Off again: the range is offered again.
    expect(applyQuiet(c, false).skipped).toEqual([]);
  });
  test("a skipped step done later is no longer skipped", () => {
    const c = applyDone(ctx({ skipped: ["tutor"], completed: ["welcome"] }), { type: "DONE", step: "tutor" });
    expect(c.skipped).toEqual([]);
    expect(c.completed).toContain("tutor");
  });
  test("only skippable steps can be skipped", () => {
    const c = ctx({ step: "edit" });
    expect(applySkip(c, "edit")).toBe(c);
    const s = applySkip(ctx({ step: "tutor" }), "tutor");
    expect(s.skipped).toEqual(["tutor"]);
    expect(s.step).toBe("headphones");
  });
  test("the patch is the whole resumable state; finished only after the coda", () => {
    const c = ctx({ step: "mic", completed: ["welcome"], firstEdit: 3 });
    expect(patchOf(c)).toEqual({
      step: "mic",
      completed: ["welcome"],
      skipped: [],
      firstEdit: 3,
      sketchId: null,
    });
    expect(patchOf({ ...c, finishedAt: "x" }).finished).toBe(true);
  });
});

describe("the machine", () => {
  const saved: OnboardingState = {
    ...freshState(),
    step: "mic",
    completed: ["welcome", "loop", "edit", "react", "prefs", "tutor", "headphones"],
  };
  test("resumes at the saved step and walks to the end", () => {
    const a = createActor(onboardingMachine).start();
    a.send({ type: "LOADED", state: saved, quiet: false });
    expect(a.getSnapshot().value).toBe("active");
    expect(a.getSnapshot().context.step).toBe("mic");
    for (const step of ["mic", "range", "latency", "first-sing", "sketch"] as const)
      a.send({ type: "DONE", step, ...(step === "sketch" ? { sketchId: "sk1" } : {}) });
    expect(a.getSnapshot().context.step).toBe("coda");
    expect(a.getSnapshot().context.sketchId).toBe("sk1");
    a.send({ type: "DONE", step: "coda" });
    expect(a.getSnapshot().status).toBe("done");
    expect(a.getSnapshot().context.finishedAt).not.toBeNull();
  });
  test("a saved step ahead of the work done falls back to the frontier", () => {
    const a = createActor(onboardingMachine).start();
    a.send({
      type: "LOADED",
      state: { ...freshState(), step: "sketch", completed: ["welcome"] },
      quiet: false,
    });
    expect(a.getSnapshot().context.step).toBe("loop");
  });
  test("VISIT only reaches done steps or the frontier", () => {
    const a = createActor(onboardingMachine).start();
    a.send({ type: "LOADED", state: saved, quiet: false });
    a.send({ type: "VISIT", step: "sketch" });
    expect(a.getSnapshot().context.step).toBe("mic");
    a.send({ type: "VISIT", step: "prefs" });
    expect(a.getSnapshot().context.step).toBe("prefs");
  });
  test("QUIET switches the mic path off for the rest of the flow", () => {
    const a = createActor(onboardingMachine).start();
    a.send({ type: "LOADED", state: saved, quiet: false });
    a.send({ type: "QUIET", on: true });
    a.send({ type: "DONE", step: "mic" });
    expect(a.getSnapshot().context.step).toBe("latency");
    a.send({ type: "DONE", step: "latency" });
    expect(a.getSnapshot().context.step).toBe("first-sing");
  });
  test("EDITED on the reaction screen keeps the learner there with the new number", () => {
    const a = createActor(onboardingMachine).start();
    a.send({
      type: "LOADED",
      state: { ...freshState(), step: "react", completed: ["welcome", "loop", "edit"], firstEdit: 6 },
      quiet: false,
    });
    a.send({ type: "EDITED", value: 2 });
    expect(a.getSnapshot().context).toMatchObject({ step: "react", firstEdit: 2 });
    a.send({ type: "DONE", step: "react" });
    expect(a.getSnapshot().context).toMatchObject({ step: "prefs", firstEdit: 2 });
  });
  test("a finished onboarding loads as finished", () => {
    const a = createActor(onboardingMachine).start();
    a.send({ type: "LOADED", state: { ...saved, finishedAt: "2026-11-11T10:00:00.000Z" }, quiet: false });
    expect(a.getSnapshot().status).toBe("done");
  });
});
