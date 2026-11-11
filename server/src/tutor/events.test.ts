import { describe, expect, test } from "bun:test";
import {
  asTutorEvent,
  encodeSse,
  SSE_PING,
  SSE_PING_INTERVAL_MS,
  SseParser,
  TUTOR_EVENT_TYPES,
  type TutorEvent,
} from "./events.ts";
import { callUsage } from "./usage.ts";

const usage = callUsage("anthropic-api", { input_tokens: 10, output_tokens: 5 }, "claude-opus-5-5");

const EVENTS: TutorEvent[] = [
  {
    type: "meta",
    data: {
      conversationId: "lesson:U03.L02:2026-11-11:hint",
      kind: "hint",
      lane: "hint",
      backend: "claude-cli",
      model: "claude-opus-5-5",
      rung: 1,
      revealAllowed: true,
    },
  },
  { type: "status", data: { phase: "tool", label: "Checking your code" } },
  { type: "thinking", data: { delta: "The learner…" } },
  { type: "text", data: { delta: "Bar 3:\n\nyour bass — “is” on [[deg:6]]." } },
  { type: "tool_start", data: { toolUseId: "tu_1", name: "compare_haps" } },
  { type: "tool_input", data: { toolUseId: "tu_1", partialJson: '{"code":"n(\\"0' } },
  {
    type: "tool_result",
    data: { toolUseId: "tu_1", name: "compare_haps", ok: true, summary: "fail, score 0.67" },
  },
  {
    type: "card",
    data: {
      cardId: "card-1",
      toolUseId: "tu_2",
      kind: "example",
      title: "t",
      code: 'mel: n("<0 2>")\n',
      explanation: "e",
      bars: 4,
      apply: "preview_only",
      applyAllowed: false,
      lockedTools: ["tb.voicing"],
    },
  },
  { type: "usage", data: usage },
  { type: "done", data: { stopReason: "end_turn", backend: "claude-cli", iterations: 2, usage } },
  { type: "error", data: { kind: "rate_limit", message: "Try again in a moment.", retryAfterSec: 17 } },
];

describe("SSE protocol", () => {
  test("the event set is the contract's, plus `review`", () => {
    expect([...TUTOR_EVENT_TYPES].sort() as string[]).toEqual(
      [
        "card",
        "done",
        "error",
        "meta",
        "review",
        "status",
        "text",
        "thinking",
        "tool_input",
        "tool_result",
        "tool_start",
        "usage",
      ].sort(),
    );
  });

  test("one frame per event, one data line, newlines inside the JSON", () => {
    for (const ev of EVENTS) {
      const frame = encodeSse(ev);
      expect(frame).toStartWith(`event: ${ev.type}\ndata: `);
      expect(frame).toEndWith("\n\n");
      expect(frame.split("\n")).toHaveLength(4);
    }
  });

  test("round-trips through the parser at any chunk size, with pings in between", () => {
    const wire = EVENTS.map((e) => encodeSse(e) + SSE_PING).join("");
    for (const size of [1, 2, 3, 7, 64, wire.length]) {
      const parser = new SseParser();
      const out: TutorEvent[] = [];
      for (let i = 0; i < wire.length; i += size) {
        for (const frame of parser.push(wire.slice(i, i + size))) {
          const ev = asTutorEvent(frame);
          if (ev) out.push(ev);
        }
      }
      expect(out).toEqual(EVENTS);
      expect(parser.comments).toEqual(EVENTS.map(() => "ping"));
      expect(parser.pending).toBe("");
    }
  });

  test("CRLF framing and multi-line data are understood", () => {
    const parser = new SseParser();
    expect(parser.push('event: text\r\ndata: {"delta":\r\ndata: "x"}\r\n\r\n')).toEqual([
      { event: "text", data: { delta: "x" } },
    ]);
  });

  test("a frame that is not ours does not crash the client and is not a TutorEvent", () => {
    const parser = new SseParser();
    const frames = parser.push(
      "event: error\ndata: upstream proxy timeout\n\nevent: weird\ndata: {}\n\ndata: 5\n\n",
    );
    expect(frames).toEqual([
      { event: "error", data: "upstream proxy timeout" },
      { event: "weird", data: {} },
      { event: "message", data: 5 },
    ]);
    expect(frames.map(asTutorEvent)).toEqual([null, null, null]);
  });

  test("a cut-off stream leaves a pending frame: the client must treat it as a network error", () => {
    const parser = new SseParser();
    expect(parser.push('event: text\ndata: {"delta":"hal')).toEqual([]);
    expect(parser.pending).not.toBe("");
  });

  test("the heartbeat is under Bun's 10 s idle timeout", () => {
    expect(SSE_PING).toBe(": ping\n\n");
    expect(SSE_PING_INTERVAL_MS).toBeLessThan(10_000);
  });
});
