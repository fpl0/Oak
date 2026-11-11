import { beforeEach, describe, expect, test } from "bun:test";
import type { Session, SessionPlan, WarmupItem } from "@oak/api";
import {
  blockBudget,
  blockMinutesLeft,
  INITIAL_SESSION,
  nextBlock,
  reportBlockDone,
  sessionEndBody,
  sessionReducer,
  useSession,
} from "./store.ts";
import type { SessionState } from "./types.ts";

const item = (id: string): WarmupItem => ({
  id,
  kind: "family-set",
  familyId: null,
  members: [],
  cardIds: [],
  level: 1,
  trials: 6,
  estSec: 90,
  mic: false,
  rated: true,
});

const plan = (over: Partial<SessionPlan> = {}): SessionPlan => ({
  day: "2026-11-11",
  targetMinutes: 20,
  kind: "lesson",
  mapItemId: "U01.L02",
  title: "Count to four",
  note: null,
  warmup: {
    budgetSec: 300,
    plannedSec: 180,
    items: [item("w1"), item("w2")],
    label: "≈ 3 min",
    moreAvailable: false,
  },
  main: { resumeStep: null, splitPart: null, light: null, estMinutes: 13 },
  returning: null,
  alternatives: [],
  tutorNote: null,
  ...over,
});

const session: Session = {
  id: "ses_1",
  day: "2026-11-11",
  kind: "lesson",
  targetMinutes: 20,
  mapItemId: "U01.L02",
  contentVersion: null,
  startedAt: "2026-11-11T09:00:00.000Z",
  endedAt: null,
  activeMinutes: 0,
  phase: "idle",
};

const run = (s: SessionState, ...evs: Parameters<typeof sessionReducer>[1][]) =>
  evs.reduce(sessionReducer, s);

describe("budgets (contracts §9.1)", () => {
  test("per kind and target", () => {
    expect(blockBudget("lesson", 15)).toEqual({ warmup: 4, new: 7, make: 3, coda: 1 });
    expect(blockBudget("lesson", 20)).toEqual({ warmup: 5, new: 9, make: 4, coda: 1 });
    expect(blockBudget("lesson", 25)).toEqual({ warmup: 6, new: 13, make: 5, coda: 1 });
    for (const t of [15, 20, 25] as const)
      expect(blockBudget("checkpoint", t)).toEqual({ warmup: 3, new: 12, make: 4, coda: 1 });
    expect(blockBudget("capstone", 20)).toEqual({ warmup: 3, new: 15, make: 0, coda: 1 });
    expect(blockBudget("gym", 25)).toEqual({ warmup: 4, new: 19, make: 0, coda: 1 });
  });

  test("capstone and gym days have no separate Make", () => {
    expect(nextBlock("new", plan({ kind: "capstone" }))).toBe("coda");
    expect(nextBlock("new", plan())).toBe("make");
    expect(nextBlock("warmup", plan({ kind: "review", mapItemId: null, main: null }))).toBe("coda");
    expect(nextBlock("coda", plan())).toBeNull();
  });
});

describe("the session flow (contracts §9.3)", () => {
  test("warm-up item by item, then new, make, coda, done", () => {
    let s = run(INITIAL_SESSION, { type: "begin", plan: plan(), session });
    expect(s.block).toBe("warmup");
    const w = (id: string) => ({
      type: "report" as const,
      report: {
        block: "warmup" as const,
        source: "drills" as const,
        warmupItemId: id,
        drillSessionId: null,
        meanCredit: 0.9,
      },
    });
    s = run(s, w("w1"));
    expect([s.block, s.warmupIndex]).toEqual(["warmup", 1]);
    s = run(s, w("w2"));
    expect(s.block).toBe("new");
    s = run(s, {
      type: "report",
      report: { block: "new", source: "lesson", itemId: "U01.L02", completed: true },
    });
    expect(s.block).toBe("make");
    s = run(s, { type: "report", report: { block: "make", source: "lesson", sketchId: "sk_1" } });
    expect(s.block).toBe("coda");
    s = run(s, { type: "report", report: { block: "coda", source: "coda" } });
    expect(s.block).toBeNull();
    expect(s.reports).toHaveLength(5);
  });

  test("no warm-up planned: straight to New", () => {
    const s = run(INITIAL_SESSION, {
      type: "begin",
      plan: plan({ warmup: { budgetSec: 300, plannedSec: 0, items: [], label: "", moreAvailable: false } }),
      session,
    });
    expect(s.block).toBe("new");
  });

  test("active time per phase; idle gaps are cut at 60 s; paused time is not counted", () => {
    let s = run(INITIAL_SESSION, { type: "begin", plan: plan(), session }, { type: "tick", ms: 30_000 });
    s = run(s, { type: "tick", ms: 10 * 60_000 });
    expect(s.phaseMs.warmup).toBe(90_000);
    s = run(s, { type: "pause" }, { type: "tick", ms: 5_000 }, { type: "resume" });
    expect(s.activeMs).toBe(90_000);
    s = run(s, { type: "enter", block: "new" }, { type: "tick", ms: 20_000 });
    expect(s.phaseMs).toEqual({ warmup: 90_000, main: 20_000, make: 0, coda: 0 });
    expect(blockMinutesLeft(s)).toBeCloseTo(9 - 20 / 60, 5);
  });

  test("at the target the wrap-up line is offered once; Keep going is always allowed", () => {
    let s = run(INITIAL_SESSION, { type: "begin", plan: plan(), session }, { type: "enter", block: "new" });
    for (let i = 0; i < 20; i++) s = run(s, { type: "tick", ms: 60_000 });
    expect(s.wrap).toBe("offered");
    s = run(s, { type: "keep-going" }, { type: "tick", ms: 60_000 });
    expect(s.wrap).toBe("kept-going");
  });

  test("Wrap up before the Make jumps to the Quick sketch and is reported as wrapped early", () => {
    let s = run(INITIAL_SESSION, { type: "begin", plan: plan(), session }, { type: "enter", block: "new" });
    s = run(s, { type: "tick", ms: 60_000 }, { type: "tick", ms: 60_000 }, { type: "wrap-up" });
    expect([s.block, s.wrap, s.wrappedEarly]).toEqual(["make", "wrapping", true]);
    s = run(s, { type: "report", report: { block: "make", source: "quick-sketch", sketchId: "sk_2" } });
    expect(s.block).toBe("coda");
    expect(sessionEndBody(s)).toEqual({
      wrappedEarly: true,
      phaseMs: { warmup: 0, main: 120_000, make: 0, coda: 0 },
    });
  });

  test("a lesson left unfinished goes to the Make; reports outside a session are ignored", () => {
    let s = run(INITIAL_SESSION, { type: "begin", plan: plan(), session }, { type: "enter", block: "new" });
    s = run(s, {
      type: "report",
      report: { block: "new", source: "lesson", itemId: "U01.L02", completed: false, resumeStep: "S4" },
    });
    expect(s.block).toBe("make");
    expect(run(INITIAL_SESSION, { type: "report", report: { block: "coda", source: "coda" } })).toBe(
      INITIAL_SESSION,
    );
  });
});

describe("the zustand binding", () => {
  beforeEach(() => useSession.getState().reset());
  test("reportBlockDone is a no-op outside a session and advances inside one", () => {
    reportBlockDone({ block: "coda", source: "coda" });
    expect(useSession.getState().reports).toEqual([]);
    useSession
      .getState()
      .begin(
        plan({ warmup: { budgetSec: 0, plannedSec: 0, items: [], label: "", moreAvailable: false } }),
        session,
      );
    reportBlockDone({ block: "new", source: "lesson", itemId: "U01.L02", completed: true });
    expect(useSession.getState().block).toBe("make");
  });
});
