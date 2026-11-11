// Turn serialisation and stopping, seen through the service: a paced backend holds a turn open
// while others arrive.
import { describe, expect, test } from "bun:test";
import { PacedBackend } from "./http/testing/paced-backend.ts";
import { createTutorService } from "./service.ts";
import type { ServiceEvent } from "./service-types.ts";
import { makePorts } from "./testing/fakes.ts";
import { GRADE, LEARNER_CODE, LESSON_ID, STEP_ID } from "./testing/fixtures.ts";
import type { TurnRequest, TutorBackend } from "./types.ts";

const never = new AbortController().signal;
const lesson = { subjectKind: "lesson", subjectId: LESSON_ID } as const;
const hint: TurnRequest = {
  thread: lesson,
  kind: "hint",
  userText: "",
  learnerCode: LEARNER_CODE,
  graderResult: GRADE,
  stepId: STEP_ID,
};
const chat: TurnRequest = {
  thread: lesson,
  kind: "chat",
  userText: "Why does my arpeggio sound unfinished?",
};

function setup(backends: TutorBackend[]) {
  const ports = makePorts();
  const service = createTutorService({ ports, backends, log: () => {} });
  const run = async (request: TurnRequest, signal: AbortSignal = never) => {
    const events: ServiceEvent[] = [];
    const summary = await service.turn(request, (e) => events.push(e), signal);
    return { events, summary, types: events.map((e) => e.type) };
  };
  return { ports, service, run };
}

describe("one turn at a time per conversation", () => {
  test("turns on one conversation queue; other conversations run alongside", async () => {
    let openGate!: () => void;
    const gate = new Promise<void>((r) => {
      openGate = r;
    });
    const backend = new PacedBackend("anthropic-api", [{ text: "a" }, { until: gate }, { text: "b" }]);
    const { run } = setup([backend]);
    const first = run(chat);
    const second = run({ ...chat, userText: "second" });
    const other = run({ ...hint });
    await Bun.sleep(20);
    // The second chat turn has not reached the backend; the hint conversation has.
    expect(backend.turns.map((t) => t.lane)).toEqual(["chat", "hint"]);
    openGate();
    const results = await Promise.all([first, second, other]);
    for (const r of results) expect(r.types.at(-1)).toBe("done");
    const chats = backend.spans.filter((s) => s.conversationId.endsWith(":chat"));
    expect(chats).toHaveLength(2);
    expect((chats[1] as { start: number }).start).toBeGreaterThan((chats[0] as { end: number }).end);
    // The queued turn saw the first one's exchange as history.
    expect(backend.turns.find((t) => t.user.text === "second")?.transcript).toHaveLength(2);
  });

  test("a waiter that is aborted leaves the queue without running or spending a rung", async () => {
    let openGate!: () => void;
    const gate = new Promise<void>((r) => {
      openGate = r;
    });
    const backend = new PacedBackend("anthropic-api", [{ until: gate }, { text: "x" }]);
    const { run, ports } = setup([backend]);
    const first = run(hint);
    await Bun.sleep(5);
    const stop = new AbortController();
    const second = run(hint, stop.signal);
    await Bun.sleep(5);
    stop.abort();
    const waited = await second;
    expect(waited.events).toEqual([{ type: "error", data: { kind: "aborted", message: "Stopped." } }]);
    openGate();
    expect((await first).types.at(-1)).toBe("done");
    expect(backend.turns).toHaveLength(1);
    expect(ports.progress.advances).toHaveLength(1);
    // The queue is free again.
    expect((await run(hint)).types.at(-1)).toBe("done");
  });

  test("stopping a running turn reaches the backend's signal and frees the conversation", async () => {
    const backend = new PacedBackend("anthropic-api", [{ text: "a" }, { wait: 30_000 }, { text: "never" }]);
    const { run, ports } = setup([backend]);
    const stop = new AbortController();
    const running = run(chat, stop.signal);
    await Bun.sleep(10);
    stop.abort();
    const { types, summary } = await running;
    expect(types).toEqual(["meta", "text", "error"]);
    expect(summary.errorKind).toBe("aborted");
    const all = await ports.conversations.timeline(lesson);
    expect(all.map((e) => [e.excluded, e.errorKind])).toEqual([
      [true, null],
      [true, "aborted"],
    ]);
  });
});
