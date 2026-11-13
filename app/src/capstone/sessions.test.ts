import { describe, expect, test } from "bun:test";
import type { CapstoneDef, CapstoneSessions } from "@oak/api";
import { currentSession, isResume, sessionLabel, sessionsDone, sessionViews } from "./sessions.ts";

const def = {
  sessionDefs: [
    { id: "X1.S1", title: "Phrases 1–2", goal: "Phrases 1–2." },
    { id: "X1.S2", title: "Phrases 3–4", goal: "Phrases 3–4." },
    { id: "X1.S3", title: "Chords", goal: "Chords.", review: true, release: true },
  ],
} as unknown as Pick<CapstoneDef, "sessionDefs">;

const at = "2026-11-11T10:00:00.000Z";

describe("sessionViews", () => {
  test("Wave 3 fallback: done, then in progress (a draft exists), then locked", () => {
    const v = sessionViews(def, { sessions: ["X1.S1"], sketchId: "s1", status: "in_progress" }, null);
    expect(v.map((x) => x.status)).toEqual(["done", "in_progress", "locked"]);
    expect(v.map((x) => x.release)).toEqual([false, false, true]);
    expect(currentSession(v)?.id).toBe("X1.S2");
    expect(sessionsDone(v)).toBe(1);
  });

  test("fallback with nothing started: the first is open", () => {
    const v = sessionViews(def, { sessions: [], sketchId: null, status: "open" }, null);
    expect(v.map((x) => x.status)).toEqual(["open", "locked", "locked"]);
  });

  test("the server's sessions win, with their drafts and checks; `current` picks the session", () => {
    const server = {
      capstoneId: "X1",
      current: "X1.S3",
      sessions: [
        {
          capstoneSessionId: "X1.S1",
          status: "done",
          sessionId: null,
          draft: { sketchId: "s", sketchVersion: 3, savedAt: at },
          checks: [],
          startedAt: at,
          completedAt: at,
        },
        {
          capstoneSessionId: "X1.S2",
          status: "done",
          sessionId: null,
          draft: { sketchId: "s", sketchVersion: 5, savedAt: at },
          checks: [
            {
              checkId: "phrase-3",
              phrase: 3,
              layer: "melody",
              stage: null,
              open: true,
              score: 0.9,
              passed: true,
              revealed: false,
              attempts: 2,
              lastAt: at,
            },
          ],
          startedAt: at,
          completedAt: at,
        },
        {
          capstoneSessionId: "X1.S3",
          status: "open",
          sessionId: null,
          draft: null,
          checks: [],
          startedAt: null,
          completedAt: null,
        },
      ],
    } as unknown as CapstoneSessions;
    const v = sessionViews(def, { sessions: [], sketchId: null, status: "in_progress" }, server);
    expect(v.map((x) => x.status)).toEqual(["done", "done", "open"]);
    expect(v[1]?.checks[0]?.checkId).toBe("phrase-3");
    expect(v[0]?.draft?.sketchVersion).toBe(3);
    expect(currentSession(v, server)?.id).toBe("X1.S3");
  });

  test("all done: the current session is the last one (revision)", () => {
    const v = sessionViews(
      def,
      { sessions: ["X1.S1", "X1.S2", "X1.S3"], sketchId: "s", status: "released" },
      null,
    );
    expect(currentSession(v)?.id).toBe("X1.S3");
    expect(sessionsDone(v)).toBe(3);
  });
});

describe("isResume and labels", () => {
  test("a saved draft means a return; no draft means a first visit", () => {
    const v = sessionViews(def, { sessions: [], sketchId: null, status: "open" }, null);
    const now = Date.parse(at) + 60 * 60_000;
    expect(isResume(v, null, now)).toBe(false);
    expect(isResume(v, { version: 2, createdAt: at }, now)).toBe(true);
    // The draft Start made a minute ago is not a return.
    expect(isResume(v, { version: 1, createdAt: at }, Date.parse(at) + 60_000)).toBe(false);
    const done = sessionViews(def, { sessions: ["X1.S1"], sketchId: "s", status: "in_progress" }, null);
    expect(isResume(done, { version: 1, createdAt: at }, Date.parse(at) + 60_000)).toBe(true);
  });
  test("session label", () => {
    expect(sessionLabel({ index: 1, title: "Melody" }, 2)).toBe("Session 2 of 2 · Melody");
  });
});
