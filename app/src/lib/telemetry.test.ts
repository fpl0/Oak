import { describe, expect, test } from "bun:test";
import type { StepTelemetry } from "@oak/api";
import { ActivityClock, createTelemetry, HEARTBEAT_MS, MAX_BATCH } from "./telemetry.ts";

describe("ActivityClock", () => {
  test("idle gaps count at most 60 s; hidden time never counts", () => {
    let t = 0;
    const c = new ActivityClock(() => t);
    c.activity();
    t = 10_000;
    c.activity();
    t = 10_000 + 5 * 60_000; // five idle minutes
    c.activity();
    expect(c.peek()).toBe(70_000);
    c.setVisible(false);
    t += 10 * 60_000;
    c.setVisible(true);
    t += 2_000;
    expect(c.take()).toBe(72_000);
    t += 1_000;
    expect(c.peek()).toBe(1_000);
  });
});

const row = (stepId: string): StepTelemetry => ({
  sessionId: "ses_1",
  lessonId: "U01.L02",
  lessonVersion: 1,
  stepId,
  stepKind: "modify",
  targetMinutes: 20,
  authoredMinutes: 1,
  scaledMinutes: 1.4,
  startedAt: "2026-11-11T09:00:00.000Z",
  endedAt: "2026-11-11T09:01:30.000Z",
  activeMs: 90_000,
  attempts: 2,
  maxHintRung: 1,
  tutorMessages: 0,
  passed: true,
  skipped: false,
  testedOut: false,
  splitPart: null,
});

describe("telemetry client", () => {
  test("step rows are batched and kept when a send fails", async () => {
    const sent: number[] = [];
    let fail = true;
    const t = createTelemetry({
      sendSteps: async (s) => {
        if (fail) throw new Error("offline");
        sent.push(s.length);
      },
      sendHeartbeat: async () => {},
      now: () => 0,
    });
    t.logStep(row("S1"));
    t.logStep(row("S2"));
    await t.flush();
    expect([t.pending(), sent]).toEqual([2, []]);
    fail = false;
    for (let i = 0; i < MAX_BATCH; i++) t.logStep(row(`S${i}`));
    await t.flush();
    expect(t.pending()).toBe(0);
    expect(sent).toEqual([MAX_BATCH, 2]);
  });

  test("heartbeats: at once on a phase or step change, else at most every 30 s", () => {
    let now = 0;
    const beats: string[] = [];
    const t = createTelemetry({
      sendSteps: async () => {},
      sendHeartbeat: async (_id, b) => void beats.push(`${b.phase}:${b.stepId}:${b.activeMs}`),
      now: () => now,
    });
    t.logBlock({ sessionId: "s", phase: "warmup", activeMs: 1000, stepId: null });
    t.logBlock({ sessionId: "s", phase: "warmup", activeMs: 2000, stepId: null });
    now = HEARTBEAT_MS;
    t.logBlock({ sessionId: "s", phase: "warmup", activeMs: 31000, stepId: null });
    t.logBlock({ sessionId: "s", phase: "main", activeMs: 31500, stepId: "S1" });
    expect(beats).toEqual(["warmup:null:1000", "warmup:null:31000", "main:S1:31500"]);
  });
});
