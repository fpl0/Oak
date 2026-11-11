import { afterEach, describe, expect, test } from "bun:test";
import type { SessionSummary } from "@oak/api";
import { fixtureSession, fixtureSummary, PLANS } from "./fixtures.ts";
import type { EndInput } from "./machine.ts";
import { ACTIVE_KEY, ENDED_KEY, type KeyValue, loadActive, loadEnded } from "./persist.ts";
import { createRunner, isSessionSurface, type RunnerDeps, type SessionPath } from "./runner.ts";
import { reportBlockDone, useSession } from "./store.ts";

class MemoryKV implements KeyValue {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function fakes(over: Partial<RunnerDeps> = {}) {
  let now = 1_000_000;
  let path = "/";
  let interval: (() => void) | null = null;
  const nav: SessionPath[] = [];
  const beats: { phase: string; activeMs: number }[] = [];
  const ends: EndInput[] = [];
  const kv = new MemoryKV();
  let activity: (() => void) | null = null;
  const deps: RunnerDeps = {
    startSession: async (body) => fixtureSession({ kind: body.kind, mapItemId: body.mapItemId }),
    endSession: async (input) => {
      ends.push(input);
      return fixtureSummary();
    },
    baseline: async () => ({ levels: [["R01", "available"]], canDo: [] }),
    heartbeat: (b) => beats.push({ phase: b.phase, activeMs: b.activeMs }),
    stepId: () => null,
    playing: () => false,
    path: () => path,
    storage: kv,
    now: () => now,
    listen: (onActivity) => {
      activity = onActivity;
      return () => {
        activity = null;
      };
    },
    setInterval: (fn) => {
      interval = fn;
      return 1;
    },
    clearInterval: () => {
      interval = null;
    },
    ...over,
  };
  const runner = createRunner(deps);
  runner.setNavigator((to) => {
    nav.push(to);
    path = to;
  });
  return {
    runner,
    kv,
    nav,
    beats,
    ends,
    /** `ms` of a learner who keeps pressing keys. */
    play(ms: number) {
      for (let t = 0; t < ms; t += 1_000) {
        now += 1_000;
        activity?.();
        interval?.();
      }
    },
    idle(ms: number) {
      now += ms;
      interval?.();
    },
    setPath(p: string) {
      path = p;
    },
    get ticking() {
      return interval !== null;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => useSession.getState().reset());

describe("the session runner", () => {
  test("Start → /session, active time counted, idle cut at 60 s, heartbeat per phase", async () => {
    const f = fakes();
    await f.runner.start(PLANS.lesson);
    expect(f.nav).toEqual(["/session"]);
    expect(useSession.getState().block).toBe("warmup");
    f.play(10_000);
    f.idle(5 * 60_000);
    expect(useSession.getState().phaseMs.warmup).toBe(70_000);
    expect(f.beats[0]?.phase).toBe("warmup");
    f.runner.dispose();
  });

  test("time is not counted away from session surfaces, nor while paused", async () => {
    const f = fakes();
    await f.runner.start(PLANS.noWarmup);
    f.setPath("/oak");
    f.play(5_000);
    expect(useSession.getState().activeMs).toBe(0);
    f.setPath("/session");
    f.runner.pause();
    f.play(5_000);
    expect(useSession.getState().activeMs).toBe(0);
    expect(f.runner.view.getState().paused).toBe(true);
    f.runner.resumeClock();
    f.play(3_000);
    expect(useSession.getState().activeMs).toBe(3_000);
    f.runner.dispose();
  });

  test("a whole day: blocks report, the Coda ends the session, Done for today goes home", async () => {
    const f = fakes();
    await f.runner.start(PLANS.lesson);
    for (const id of ["w1", "w2", "w3"])
      reportBlockDone({
        block: "warmup",
        source: "drills",
        warmupItemId: id,
        drillSessionId: null,
        meanCredit: 1,
      });
    f.play(4_000);
    reportBlockDone({ block: "new", source: "lesson", itemId: "U01.L01", completed: true });
    reportBlockDone({ block: "make", source: "lesson", sketchId: "sk_1" });
    await flush();
    expect(f.nav).toEqual(["/session", "/session", "/session", "/session/coda"]);
    expect(f.ends).toHaveLength(1);
    expect(f.ends[0]?.body.phaseMs.main).toBe(4_000);
    expect(f.runner.view.getState().status).toBe("coda");
    // The ended session is remembered (Today shows "done"), the active one is cleared.
    expect(loadEnded(f.kv)?.sessionId).toBe("ses_1");
    expect(loadEnded(f.kv)?.baseline.levels).toEqual([["R01", "available"]]);
    expect(f.kv.getItem(ACTIVE_KEY)).toBeNull();
    f.runner.finish();
    expect(f.nav.at(-1)).toBe("/");
    expect(useSession.getState().session).toBeNull();
    expect(f.ticking).toBe(false);
  });

  test("a reload resumes the saved block", async () => {
    const f = fakes();
    await f.runner.start(PLANS.lesson);
    reportBlockDone({
      block: "warmup",
      source: "drills",
      warmupItemId: "w1",
      drillSessionId: null,
      meanCredit: 1,
    });
    f.play(3_000);
    const saved = loadActive(f.kv, "ses_1");
    expect(saved?.state.warmupIndex).toBe(1);
    // A new tab: a fresh runner over the same storage.
    f.runner.dispose();
    const g = fakes();
    for (const [k, v] of f.kv.m) g.kv.setItem(k, v);
    await g.runner.resume(fixtureSession(), PLANS.lesson);
    expect(useSession.getState().warmupIndex).toBe(1);
    expect(useSession.getState().block).toBe("warmup");
    expect(g.nav).toEqual(["/session"]);
    g.runner.dispose();
  });

  test("a session open on the server but unknown here starts from the top of the plan", async () => {
    const f = fakes();
    await f.runner.resume(fixtureSession(), PLANS.noWarmup);
    expect(useSession.getState().block).toBe("new");
    expect(f.nav).toEqual(["/session"]);
    f.runner.dispose();
  });

  test("ending fails: retry", async () => {
    let fail = true;
    const f = fakes({
      endSession: async (): Promise<SessionSummary> => {
        if (fail) throw new Error("offline");
        return fixtureSummary();
      },
    });
    await f.runner.start(PLANS.noWarmup);
    f.runner.toCoda();
    await flush();
    expect(f.runner.view.getState().status).toBe("end-failed");
    expect(f.runner.view.getState().endError).toBe("offline");
    expect(f.kv.getItem(ENDED_KEY)).toBeNull();
    fail = false;
    f.runner.retryEnd();
    await flush();
    expect(f.runner.view.getState().status).toBe("coda");
    f.runner.dispose();
  });

  test("a failed start leaves no session and says why", async () => {
    const f = fakes({
      startSession: async () => {
        throw new Error("U01.L02 is not open yet");
      },
    });
    await expect(f.runner.start(PLANS.lesson)).rejects.toThrow("not open yet");
    expect(f.runner.view.getState().startError).toBe("U01.L02 is not open yet");
    expect(useSession.getState().session).toBeNull();
  });

  test("session surfaces", () => {
    for (const p of ["/session", "/session/coda", "/learn/U01.L01", "/checkpoint/U01", "/capstone/C0"])
      expect(isSessionSurface(p)).toBe(true);
    for (const p of ["/", "/oak", "/progress", "/settings/audio", "/album"])
      expect(isSessionSurface(p)).toBe(false);
  });
});
