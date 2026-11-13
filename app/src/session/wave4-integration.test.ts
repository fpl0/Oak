// Wave 4 integration seams of the session: a gym day's New block starts its gym session once (`gym.start`) and
// opens the project it holds; the capstone resume card is decided once per session, so a draft bound mid-block
// never swaps the workspace out; a saved transcription version is the gym day's Make.
import { describe, expect, test } from "bun:test";
import type { GymPlan, GymSession } from "@oak/api";
import { ladderCoda } from "./gym-day.ts";
import { type GymStartApi, startBody, startGym, startGymOnce, versionsThisSession } from "./gym-start.ts";
import { resumeDecision } from "./resume-once.ts";

type Next = NonNullable<GymPlan["next"]>;
const next = (over: Partial<Next> = {}): Next => ({
  gymId: "GYM.01" as Next["gymId"],
  kind: "ladder",
  ladderLevel: 1,
  realism: 0,
  ownAudioFallback: false,
  transcriptionId: null,
  ...over,
});
const row = (over: Partial<GymSession> = {}): GymSession => ({
  gymId: "GYM.01",
  sessionId: "ses_1",
  kind: "ladder",
  ladderLevel: 1,
  realism: 0,
  transcriptionId: null,
  at: "2026-11-12T10:00:00.000Z",
  ...over,
});

function fakeApi(history: GymSession[], n: Next | null) {
  const calls = { start: [] as unknown[], next: [] as unknown[] };
  const port: GymStartApi = {
    plan: async () => ({ next: n, history }),
    start: async (body) => {
      calls.start.push(body);
      const g = row({
        gymId: n?.gymId ?? "GYM.01",
        sessionId: body.sessionId,
        kind: body.kind,
        transcriptionId: body.transcriptionId,
      });
      history.push(g);
      return g;
    },
    nextItem: async (body) => {
      calls.next.push(body);
      const item = `trn_${body.gymId}`;
      const g = history.find((h) => h.gymId === body.gymId);
      if (g) g.transcriptionId = item;
      return { itemId: item };
    },
  };
  return { port, calls };
}

describe("a gym day's New block", () => {
  test("an odd slot: gym.start as a ladder session, then a ladder item drawn for that gym session", async () => {
    const { port, calls } = fakeApi([], next());
    const g = await startGym(port, "ses_1");
    expect(g).toEqual({ gymId: "GYM.01", kind: "ladder", projectId: "trn_GYM.01", fresh: true });
    expect(calls.start).toEqual([{ sessionId: "ses_1", kind: "ladder", transcriptionId: null }]);
    expect(calls.next).toEqual([{ sessionId: "ses_1", gymId: "GYM.01" }]);
  });

  test("an even slot with an audio project opens that project; without one it is a ladder session", async () => {
    const own = next({ gymId: "GYM.02" as Next["gymId"], kind: "own-audio", transcriptionId: "trn_own" });
    expect(startBody(own, "s")).toEqual({ sessionId: "s", kind: "own-audio", transcriptionId: "trn_own" });
    const { port, calls } = fakeApi([], own);
    expect(await startGym(port, "s")).toMatchObject({ kind: "own-audio", projectId: "trn_own" });
    expect(calls.next).toEqual([]);
    const fallback = next({ gymId: "GYM.02" as Next["gymId"], kind: "own-audio", ownAudioFallback: true });
    expect(startBody(fallback, "s")).toEqual({ sessionId: "s", kind: "ladder", transcriptionId: null });
  });

  test("a reload finds the gym session started for this Oak session and its item: nothing new starts", async () => {
    const history = [row({ sessionId: "ses_1", transcriptionId: "trn_kept" })];
    const { port, calls } = fakeApi(history, next({ gymId: "GYM.02" as Next["gymId"] }));
    expect(await startGym(port, "ses_1")).toEqual({
      gymId: "GYM.01",
      kind: "ladder",
      projectId: "trn_kept",
      fresh: false,
    });
    expect(calls.start).toEqual([]);
    expect(calls.next).toEqual([]);
  });

  test("two renders in one tab start it once", async () => {
    const { port, calls } = fakeApi([], next());
    const [a, b] = await Promise.all([startGymOnce(port, "ses_once"), startGymOnce(port, "ses_once")]);
    expect(a).toBe(b);
    expect(calls.start).toHaveLength(1);
  });

  test("a failed start can be retried", async () => {
    const { port } = fakeApi([], next());
    let fail = true;
    const flaky: GymStartApi = {
      ...port,
      plan: async () => {
        if (fail) throw new Error("offline");
        return port.plan();
      },
    };
    await expect(startGymOnce(flaky, "ses_retry")).rejects.toThrow("offline");
    fail = false;
    expect((await startGymOnce(flaky, "ses_retry")).gymId).toBe("GYM.01");
  });

  test("the Make: versions saved since the session started", () => {
    const p = {
      versions: [
        { transcriptionId: "t", version: 1, code: "", createdAt: "2026-11-11T09:00:00.000Z" },
        { transcriptionId: "t", version: 2, code: "", createdAt: "2026-11-12T10:05:00.000Z" },
      ],
    };
    expect(versionsThisSession(p, "2026-11-12T10:00:00.000Z")).toBe(1);
    expect(versionsThisSession({ versions: [] }, "2026-11-12T10:00:00.000Z")).toBe(0);
  });
});

describe("the capstone resume card", () => {
  test("decided once per session, when the block has its data, and kept after a draft is bound", () => {
    expect(resumeDecision("ses_a", false, false)).toBeNull();
    // S1 opens with no draft: no card. A draft bound mid-block (now `in_progress`) must not bring one in.
    expect(resumeDecision("ses_a", true, false)).toBe(false);
    expect(resumeDecision("ses_a", true, true)).toBe(false);
    // S2 opens with the draft: the card, and it stays the decision for that session.
    expect(resumeDecision("ses_b", true, true)).toBe(true);
    expect(resumeDecision("ses_b", true, false)).toBe(true);
  });
});

describe("the ladder Coda names today's work", () => {
  const h = (score: number, passed: boolean, day = "2026-11-12") => ({
    level: 1 as const,
    realism: 0 as const,
    score,
    passed,
    day,
    gymId: "GYM.01" as never,
  });
  const ladder = (history: ReturnType<typeof h>[]) => ({
    level: 1 as const,
    realism: 0 as const,
    history,
    gradedPasses: {},
    levelUp: null,
  });

  test("a graded pass today, its best score; a try below 85% says what a pass is; another day says nothing", () => {
    expect(ladderCoda(ladder([h(0.7, false), h(1, true)]), "2026-11-12")?.today).toEqual({
      level: 1,
      realism: 0,
      passed: true,
      line: "Level 1, drum loops, at R0: 100%, a graded pass.",
    });
    expect(ladderCoda(ladder([h(0.62, false)]), "2026-11-12")?.today?.line).toBe(
      "Level 1, drum loops, at R0: 62% so far. A pass is 85% or better; the item waits in Transcribe.",
    );
    expect(ladderCoda(ladder([h(1, true, "2026-11-01")]), "2026-11-12")).toBeNull();
  });
});
