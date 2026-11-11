import { describe, expect, test } from "bun:test";
import type { TutorEvent, TutorTurnRequest } from "@oak/api";
import {
  INITIAL_TURN,
  reduceTurn,
  retryAt,
  runTutorTurn,
  STALLED_COPY,
  settleTurn,
  startTurn,
  type TurnState,
} from "./tutor-stream.ts";

const usage = {
  backend: "claude-cli" as const,
  requests: 1,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  costUsd: null,
  includedInPlan: true,
  servedBy: ["claude-cli"],
};

const request: TutorTurnRequest = {
  thread: { subjectKind: "general", subjectId: "general" },
  kind: "chat",
  userText: "What is a cadence?",
};

function sse(events: TutorEvent[], opts: { comments?: boolean } = {}): string {
  return events
    .map((e) => `${opts.comments ? ": ping\n\n" : ""}event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
}

/** A fetch that answers one SSE body, split into small chunks to exercise the parser. */
function fakeFetch(body: string, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
  };
  return { fn, calls };
}

describe("reduceTurn", () => {
  test("accumulates text deltas and tool progress, then finishes on done", () => {
    let s: TurnState = startTurn();
    const events: TutorEvent[] = [
      { type: "status", data: { phase: "tool", label: "Listening to bars 1–4" } },
      { type: "tool_start", data: { toolUseId: "t1", name: "evaluate_strudel" } },
      {
        type: "tool_result",
        data: { toolUseId: "t1", name: "evaluate_strudel", ok: true, summary: "4 bars" },
      },
      { type: "text", data: { delta: "A cadence " } },
      { type: "text", data: { delta: "is a resting point." } },
      { type: "done", data: { stopReason: "end_turn", backend: "claude-cli", iterations: 2, usage } },
    ];
    for (const e of events) s = reduceTurn(s, e);
    expect(s.status).toBe("done");
    expect(s.text).toBe("A cadence is a resting point.");
    expect(s.tools).toEqual([{ toolUseId: "t1", name: "evaluate_strudel", ok: true }]);
    expect(s.phase).toBeNull();
    expect(s.usage).toEqual(usage);
  });

  test("ignores everything after a terminal event", () => {
    let s = reduceTurn(startTurn(), { type: "error", data: { kind: "overloaded", message: "busy" } });
    s = reduceTurn(s, { type: "text", data: { delta: "late" } });
    expect(s.status).toBe("error");
    expect(s.text).toBe("");
  });

  test("a card replaces its draft", () => {
    let s = reduceTurn(startTurn(), {
      type: "tool_input",
      data: { toolUseId: "c1", partialJson: '{"code":' },
    });
    expect(s.drafts.c1).toBe('{"code":');
    s = reduceTurn(s, {
      type: "card",
      data: {
        cardId: "card1",
        toolUseId: "c1",
        kind: "variation",
        title: "Try a fill",
        code: 'drums: s("bd*2 sd")',
        explanation: "",
        bars: 1,
        apply: "applicable",
        applyAllowed: true,
        lockedTools: [],
      },
    });
    expect(s.drafts.c1).toBeUndefined();
    expect(s.cards).toHaveLength(1);
  });

  test("settleTurn turns an unfinished stream into a network error", () => {
    const s = settleTurn(reduceTurn(startTurn(), { type: "text", data: { delta: "half a sen" } }));
    expect(s.status).toBe("error");
    expect(s.error?.kind).toBe("network");
    expect(s.text).toBe("half a sen");
    expect(settleTurn(INITIAL_TURN).status).toBe("error");
  });
});

describe("runTutorTurn over a real SSE body", () => {
  test("a complete stream ends done, with the X-Oak header sent to the chat route", async () => {
    const { fn, calls } = fakeFetch(
      sse(
        [
          { type: "text", data: { delta: "Hi" } },
          { type: "done", data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage } },
        ],
        { comments: true },
      ),
    );
    const states: TurnState[] = [];
    const final = await runTutorTurn(request, { fetch: fn, onState: (s) => states.push(s) });
    expect(final.status).toBe("done");
    expect(final.text).toBe("Hi");
    expect(calls[0]?.url).toBe("/api/tutor/chat");
    expect(((calls[0]?.init.headers ?? {}) as Record<string, string>)["X-Oak"]).toBe("1");
    expect(states[0]?.status).toBe("streaming");
  });

  test("a stream that ends without done is an error, not a silent success", async () => {
    const { fn } = fakeFetch(sse([{ type: "text", data: { delta: "The answer is" } }]));
    const final = await runTutorTurn(request, { fetch: fn });
    expect(final.status).toBe("error");
    expect(final.error?.kind).toBe("network");
    expect(final.text).toBe("The answer is");
  });

  test("an HTTP 429 becomes a rate_limit error", async () => {
    const { fn } = fakeFetch("", 429);
    const final = await runTutorTurn({ ...request, kind: "hint" }, { fetch: fn });
    expect(final.status).toBe("error");
    expect(final.error?.kind).toBe("rate_limit");
  });

  test("abort resolves as an aborted error", async () => {
    const ac = new AbortController();
    const fn = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const run = runTutorTurn(request, { signal: ac.signal, fetch: fn });
    ac.abort();
    const final = await run;
    expect(final.status).toBe("error");
    expect(final.error?.kind).toBe("aborted");
  });

  test("an explain request goes to the hint route", async () => {
    const { fn, calls } = fakeFetch(
      sse([{ type: "done", data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage } }]),
    );
    const final = await runTutorTurn({ ...request, kind: "explain", stepId: "S6" }, { fetch: fn });
    expect(final.status).toBe("done");
    expect(calls[0]?.url).toBe("/api/tutor/hint");
  });

  test("pings keep a quiet turn alive; silence stalls it with its own copy and keeps the text", async () => {
    const enc = new TextEncoder();
    // Pings every 20 ms for 120 ms, then a done: with idleMs 80 the turn must survive.
    const pinging = async () => {
      const stream = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(enc.encode(sse([{ type: "text", data: { delta: "Listen " } }])));
          for (let i = 0; i < 6; i++) {
            await Bun.sleep(20);
            c.enqueue(enc.encode(": ping\n\n"));
          }
          c.enqueue(
            enc.encode(
              sse([
                {
                  type: "done",
                  data: { stopReason: "end_turn", backend: "claude-cli", iterations: 1, usage },
                },
              ]),
            ),
          );
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    };
    const alive = await runTutorTurn(request, { fetch: pinging, idleMs: 80, watchEveryMs: 10 });
    expect(alive.status).toBe("done");

    // One text event, then nothing at all: the watchdog aborts and the turn reads as stalled.
    const silent = async (_url: string, init: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(sse([{ type: "text", data: { delta: "Half an ans" } }])));
          init.signal?.addEventListener("abort", () =>
            c.error(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        },
      });
      return new Response(stream, { status: 200 });
    };
    const stalled = await runTutorTurn(request, { fetch: silent, idleMs: 60, watchEveryMs: 10 });
    expect(stalled.status).toBe("error");
    expect(stalled.error).toMatchObject({ kind: "network", message: STALLED_COPY, stalled: true });
    expect(stalled.text).toBe("Half an ans");
  });

  test("a learner's Stop is aborted, never stalled", async () => {
    const ac = new AbortController();
    const enc = new TextEncoder();
    const fn = async (_url: string, init: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(sse([{ type: "text", data: { delta: "Slowly" } }])));
          init.signal?.addEventListener("abort", () =>
            c.error(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        },
      });
      return new Response(stream, { status: 200 });
    };
    const run = runTutorTurn(request, { fetch: fn, signal: ac.signal, idleMs: 10_000 });
    await Bun.sleep(20);
    ac.abort();
    const final = await run;
    expect(final.error?.kind).toBe("aborted");
    expect(final.text).toBe("Slowly");
  });
});

describe("retryAt", () => {
  test("a rate limit waits retryAfterSec; other errors may retry at once", () => {
    const limited = reduceTurn(startTurn(), {
      type: "error",
      data: { kind: "rate_limit", message: "slow down", retryAfterSec: 20 },
    });
    expect(retryAt(limited, 1_000)).toBe(21_000);
    const busy = reduceTurn(startTurn(), { type: "error", data: { kind: "overloaded", message: "busy" } });
    expect(retryAt(busy, 1_000)).toBe(1_000);
  });

  test("tool results keep no server summary; duplicate cards and tool starts are ignored", () => {
    let s = reduceTurn(startTurn(), { type: "tool_start", data: { toolUseId: "t1", name: "compare_haps" } });
    s = reduceTurn(s, { type: "tool_start", data: { toolUseId: "t1", name: "compare_haps" } });
    s = reduceTurn(s, {
      type: "tool_result",
      data: { toolUseId: "t1", name: "compare_haps", ok: true, summary: "fail, score 0.40" },
    });
    expect(s.tools).toEqual([{ toolUseId: "t1", name: "compare_haps", ok: true }]);
    expect(JSON.stringify(s)).not.toContain("score 0.40");
  });
});
