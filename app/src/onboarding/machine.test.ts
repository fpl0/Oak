import { describe, expect, test } from "bun:test";
import type { OnboardingState } from "@oak/api";
import { createActor } from "xstate";
import {
  canVisit,
  FLOW,
  freshState,
  frontier,
  nextAfter,
  prevBefore,
  railOf,
  stepFromParam,
} from "./flow.ts";
import { applyDone, applySkip, type OnboardingContext, onboardingMachine, patchOf } from "./machine.ts";

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
  test("Quiet mode passes over the mic-only steps", () => {
    expect(nextAfter("mic", true)).toEqual({ next: "latency", autoSkipped: ["range"] });
    expect(nextAfter("latency", true)).toEqual({ next: "sketch", autoSkipped: ["first-sing"] });
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
    expect(rail.find((r) => r.id === "tutor")?.state).toBe("optional");
    expect(rail.at(-1)?.state).toBe("todo");
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
    expect(c.step).toBe("sketch");
    expect(c.skipped).toEqual(["range", "first-sing"]);
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
  });
  test("a finished onboarding loads as finished", () => {
    const a = createActor(onboardingMachine).start();
    a.send({ type: "LOADED", state: { ...saved, finishedAt: "2026-11-11T10:00:00.000Z" }, quiet: false });
    expect(a.getSnapshot().status).toBe("done");
  });
});
