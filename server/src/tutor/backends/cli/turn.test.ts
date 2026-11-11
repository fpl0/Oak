// The window between "Oak has decided this turn is over" and "the process is gone". The fake
// process here uses that window to try a tool call with its still-known token.
import { describe, expect, test } from "bun:test";
import { buildPrefix } from "../../prompt/persona.ts";
import { CATALOG, SYLLABUS } from "../../testing/fixtures.ts";
import { TOOLS } from "../../tools/defs.ts";
import type { BackendTurn, ToolCall } from "../../types.ts";
import { createMcpEndpoint, RPC } from "./mcp.ts";
import type { SpawnFn } from "./process.ts";
import { OAK_TOOLS, SESSION } from "./testing/replay.ts";
import { type CliRuntime, runOnSession } from "./turn.ts";

const enc = new TextEncoder();
const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const init = (tools: string[]) => line({ type: "system", subtype: "init", session_id: SESSION, tools });
const TEXT = line({
  type: "stream_event",
  event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
});
const START = line({ type: "stream_event", event: { type: "message_start", message: {} } });

function setup(lines: string[]) {
  const endpoint = createMcpEndpoint();
  const executed: ToolCall[] = [];
  const late: unknown[] = [];
  const spawned: string[][] = [];
  // Writes its lines, then stays alive. When killed it makes one more tool call before it dies.
  const spawn: SpawnFn = (argv) => {
    spawned.push(argv);
    const dead = Promise.withResolvers<void>();
    const exit = Promise.withResolvers<number | null>();
    const config = JSON.parse(argv[argv.indexOf("--mcp-config") + 1] as string);
    const stdout = new ReadableStream<Uint8Array>({
      async start(ctl) {
        for (const l of lines) ctl.enqueue(enc.encode(l));
        await dead.promise;
        ctl.close();
        exit.resolve(143);
      },
    });
    return {
      stdout,
      stderr: new ReadableStream<Uint8Array>({ start: (ctl) => ctl.close() }),
      exited: exit.promise,
      kill() {
        const request = endpoint.app.request("/", {
          method: "POST",
          headers: { host: "127.0.0.1:8787", ...config.mcpServers.oak.headers },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_learner_progress", arguments: {} },
          }),
        });
        void Promise.resolve(request)
          .then(async (res) => late.push(await res.json()))
          .finally(() => dead.resolve());
      },
    };
  };
  const rt: CliRuntime = {
    claudePath: "claude",
    spawn,
    cwd: async () => "/tmp",
    env: () => ({}),
    mcpUrl: () => "http://127.0.0.1:8787/mcp/tutor",
    mcpHeaders: undefined,
    registry: endpoint.registry,
    makeSessionId: () => SESSION,
    log: () => {},
  };
  const input: BackendTurn = {
    conversationId: "lesson:U03.L02:2026-11-11:chat",
    kind: "chat",
    lane: "chat",
    model: "claude-opus-5-5",
    effort: "medium",
    limits: { maxTokens: 16_000, maxIterations: 6 },
    prefix: buildPrefix({ syllabus: SYLLABUS, catalog: CATALOG }),
    prefixVersion: "test",
    tools: TOOLS,
    executeTool: async (call) => {
      executed.push(call);
      return { content: "{}", isError: false };
    },
    transcript: [],
    continuity: { records: [], commit: async () => {} },
    user: { oakContext: '<oak_context v="1">\n</oak_context>', learnerCode: null, text: "hi" },
    isFirstTurn: true,
  };
  const run = (signal: AbortSignal, emit: () => void = () => {}) =>
    runOnSession(rt, {
      input,
      plan: { mode: "new", sessionId: SESSION, seed: null },
      prompt: () => "PROMPT",
      emit,
      signal,
      timeoutMs: 5_000,
    });
  return { run, executed, late, spawned, registry: endpoint.registry };
}

const refused = [
  { jsonrpc: "2.0", id: 1, error: { code: RPC.noTurn, message: "unknown or expired turn token" } },
];

describe("the turn token is revoked before the process has died", () => {
  test("a failed init check: the dying process can no longer call a tool", async () => {
    const s = setup([init([...OAK_TOOLS, "Bash"]), START, TEXT]);
    const report = await s.run(new AbortController().signal);
    expect(report.verdict).toMatchObject({ ok: false, error: { kind: "internal" } });
    expect(s.late).toEqual(refused);
    expect(s.executed).toEqual([]);
    expect(s.registry.size).toBe(0);
  });

  test("a Stop: the same", async () => {
    const s = setup([init(OAK_TOOLS), START, TEXT]);
    const stop = new AbortController();
    const report = await s.run(stop.signal, () => stop.abort());
    expect(report.verdict).toMatchObject({ ok: false, error: { kind: "aborted" } });
    expect(s.late).toEqual(refused);
    expect(s.executed).toEqual([]);
  });

  test("the iteration limit: the same", async () => {
    const s = setup([init(OAK_TOOLS), ...Array.from({ length: 7 }, () => START)]);
    const report = await s.run(new AbortController().signal);
    expect(report.verdict).toMatchObject({ ok: false, error: { kind: "iteration_limit" } });
    expect(s.late).toEqual(refused);
  });

  test("the CLI is offered the five learner tools, not the review tools", async () => {
    const s = setup([init([...OAK_TOOLS, "mcp__oak__submit_capstone_review"])]);
    const report = await s.run(new AbortController().signal);
    expect(report.verdict.ok).toBe(false);
    const argv = s.spawned[0] ?? [];
    expect(argv[argv.indexOf("--allowedTools") + 1]).toBe(OAK_TOOLS.join(","));
  });
});
