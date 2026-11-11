// The MCP endpoint as the security boundary of a turn: the token, what a turn may call, what
// happens at the edges, and the real executors behind it.
import { describe, expect, test } from "bun:test";
import { findLeaks, leakMarkers } from "../../redaction.ts";
import { makePorts } from "../../testing/fakes.ts";
import { EXERCISE_REF, GRADE, LEARNER_CODE, LESSON_ID, STEP, STEP_ID } from "../../testing/fixtures.ts";
import { createToolSession } from "../../tools/execute.ts";
import type { TurnContext } from "../../types.ts";
import { RPC } from "./mcp.ts";
import { errorCode, HOST, LEARNER_TOOLS, setup } from "./testing/mcp-client.ts";

describe("the turn token", () => {
  test("an unknown or missing token: JSON-RPC error, no tool list, no execution", async () => {
    const { rpc, calls, app } = setup();
    for (const token of ["", "0".repeat(64), "not-a-token"]) {
      const list = await rpc("tools/list", undefined, { "x-oak-turn": token });
      expect(list.json.error).toEqual({ code: RPC.noTurn, message: "unknown or expired turn token" });
      const call = await rpc(
        "tools/call",
        { name: "get_learner_progress", arguments: {} },
        { "x-oak-turn": token },
      );
      expect(call.json.error.code).toBe(RPC.noTurn);
    }
    const none = await app.request("/", {
      method: "POST",
      headers: { host: HOST },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "propose_code" } }),
    });
    expect(await errorCode(none)).toBe(RPC.noTurn);
    expect(calls).toEqual([]);
  });

  test("the token expires when the turn closes", async () => {
    const { rpc, calls, turn, registry } = setup();
    expect(registry.size).toBe(1);
    turn.close();
    turn.close(); // idempotent
    expect(registry.size).toBe(0);
    const { json } = await rpc("tools/call", { name: "get_learner_progress", arguments: {} });
    expect(json.error.code).toBe(RPC.noTurn);
    expect(calls).toEqual([]);
  });

  test("tokens are random, long, and each reaches only its own turn", async () => {
    const a = setup();
    const other: string[] = [];
    const b = a.registry.open({
      tools: LEARNER_TOOLS,
      executeTool: async (call) => {
        other.push(call.name);
        return { content: '"b"', isError: false };
      },
      signal: new AbortController().signal,
    });
    expect(a.turn.token).toMatch(/^[0-9a-f]{64}$/);
    expect(b.token).not.toBe(a.turn.token);
    const viaB = await a.rpc(
      "tools/call",
      { name: "get_learner_progress", arguments: {} },
      { "x-oak-turn": b.token },
    );
    expect(viaB.json.result.content[0]?.text).toBe('"b"');
    expect(other).toEqual(["get_learner_progress"]);
    expect(a.calls).toEqual([]);
    expect(a.turn.results).toEqual([]);
    expect(b.results).toHaveLength(1);
  });

  test("a tool the turn does not list is unknown: built-ins, and the review tools on a learner turn", async () => {
    const { rpc, calls } = setup();
    for (const name of ["Bash", "Read", "submit_capstone_review", "mcp__oak__propose_code", "__proto__"]) {
      const { json } = await rpc("tools/call", { name, arguments: {} });
      expect(json.error).toEqual({ code: RPC.params, message: `unknown tool: ${name}` });
    }
    expect(calls).toEqual([]);
  });

  test("the token is never echoed in a response", async () => {
    const { rpc, turn } = setup();
    for (const [method, params] of [
      ["initialize", {}],
      ["tools/list", undefined],
      ["tools/call", { name: "get_learner_progress", arguments: {} }],
      ["nope", undefined],
    ] as const) {
      expect(JSON.stringify((await rpc(method, params)).json).includes(turn.token)).toBe(false);
    }
  });
});

describe("limits and failures", () => {
  test("a runaway turn is cut off after maxCalls; the calls beyond it never run", async () => {
    const { rpc, calls } = setup({ maxCalls: 2 });
    const call = () => rpc("tools/call", { name: "get_learner_progress", arguments: {} });
    await call();
    await call();
    const third = await call();
    expect<unknown>(third.json.result).toEqual({
      content: [{ type: "text", text: '{"error":"TOOL_LIMIT"}' }],
      isError: true,
    });
    expect(calls).toHaveLength(2);
  });

  test("concurrent calls get distinct IDs", async () => {
    const { rpc, calls } = setup();
    await Promise.all(
      [1, 2, 3].map(() => rpc("tools/call", { name: "get_learner_progress", arguments: {} })),
    );
    expect(new Set(calls.map((c) => c.call.id)).size).toBe(3);
  });

  test("an executor that throws becomes an error result without its message", async () => {
    const { rpc, turn } = setup({
      executeTool: async () => {
        throw new Error("SQLITE_BUSY at /Users/someone/oak.db");
      },
    });
    const { json } = await rpc("tools/call", { name: "propose_code", arguments: {} });
    expect<unknown>(json.result).toEqual({
      content: [{ type: "text", text: '{"error":"TOOL_FAILED"}' }],
      isError: true,
    });
    expect(turn.results).toHaveLength(1);
  });

  test("a result that arrives after the turn ended goes nowhere", async () => {
    const gate = Promise.withResolvers<void>();
    const { rpc, turn, seen } = setup({
      executeTool: async () => {
        await gate.promise;
        return { content: '"late"', isError: false };
      },
    });
    const pending = rpc("tools/call", { name: "get_learner_progress", arguments: {} });
    await new Promise((r) => setTimeout(r, 5));
    turn.close();
    gate.resolve();
    expect((await pending).json.error.code).toBe(RPC.noTurn);
    expect(seen).toEqual([]);
  });

  test("Stop reaches a running tool through its signal", async () => {
    const { rpc, calls, stop } = setup();
    stop.abort();
    await rpc("tools/call", { name: "get_learner_progress", arguments: {} });
    expect(calls[0]?.signal.aborted).toBe(true);
  });
});
describe("with the real executors", () => {
  async function real(rung: 0 | 4) {
    const ports = makePorts();
    ports.progress.set(STEP_ID, { rung });
    const ctx = {
      conversationId: "lesson:U03.L02:2026-11-11:chat",
      kind: "chat",
      lane: "chat",
      disclosure: rung,
      learnerCode: LEARNER_CODE,
      limits: { maxTokens: 1, maxIterations: 1, maxCards: 6, maxWords: null },
      apply: "preview_only",
      gradedContext: true,
      lesson: null,
      review: null,
    } as unknown as TurnContext;
    const session = createToolSession({ ctx, ports, emit: () => {} });
    return setup({ executeTool: session.execute });
  }
  const lessonArgs = { lesson_id: LESSON_ID, step_id: STEP_ID };
  const compareArgs = {
    learner_code: null,
    target: { kind: "exercise", ref: EXERCISE_REF },
    from_bar: 1,
    bars: 1,
    mode: "auto",
  };

  test("results are cut to the server's rung: no solution or expected value at rung 0", async () => {
    const s = await real(0);
    await s.rpc("tools/call", { name: "get_lesson_context", arguments: lessonArgs });
    await s.rpc("tools/call", { name: "compare_haps", arguments: compareArgs });
    const sent = s.turn.results.map((r) => r.content).join("\n");
    expect(s.turn.results.map((r) => r.isError)).toEqual([false, false]);
    expect(findLeaks(sent, leakMarkers(STEP, GRADE), 0)).toEqual([]);
    expect(sent).toContain('"redacted_to_rung":0');
  });

  test("at rung 4 the same calls return the solution", async () => {
    const s = await real(4);
    await s.rpc("tools/call", { name: "get_lesson_context", arguments: lessonArgs });
    expect(s.turn.results[0]?.content).toContain("0 2 4 7 4 2");
  });

  test("the model cannot supply a rung: an extra argument is rejected by validation", async () => {
    const s = await real(0);
    for (const extra of [{ hint_rung: 4 }, { rung: 4 }, { disclosure: 4 }]) {
      const { json } = await s.rpc("tools/call", {
        name: "get_lesson_context",
        arguments: { ...lessonArgs, ...extra },
      });
      expect(json.result.isError).toBe(true);
      expect(json.result.content[0]?.text).toContain("INVALID_JSON");
    }
    expect(findLeaks(s.turn.results.map((r) => r.content).join("\n"), leakMarkers(STEP, GRADE), 0)).toEqual(
      [],
    );
  });
});
