// Oak's tools for the Claude CLI: a minimal MCP "streamable HTTP" endpoint, hand-written JSON-RPC
// over POST with plain JSON replies (no MCP SDK; spike S8 proved this subset is all the CLI needs).
//
// The security property lives in the turn registry. Each turn opens a random token; the CLI sends
// it back as `X-Oak-Turn` on every request; the token maps to that turn's executor, which already
// carries the server-side hint rung. A tool call therefore cannot name its own rung, cannot reach
// another turn, and stops working the moment the turn ends.
import { Hono } from "hono";
import { z } from "zod";
import type { ToolDef } from "../../tools/defs.ts";
import { MAX_TOOL_CALLS_PER_TURN } from "../../tools/execute.ts";
import type { ExecuteTool, ToolResult } from "../../types.ts";
import { TURN_HEADER } from "./argv.ts";

export interface RecordedToolResult {
  toolUseId: string;
  name: string;
  input: unknown;
  /** Exactly the text that was returned to the model. */
  content: string;
  isError: boolean;
}

export interface OpenTurn {
  /** The tools this turn lists and accepts. Anything else is an unknown tool. */
  tools: readonly ToolDef[];
  executeTool: ExecuteTool;
  /** The turn's own signal: a Stop cancels tool calls that are still running. */
  signal: AbortSignal;
  /** One model message may hold many tool calls; this bounds a runaway turn. */
  maxCalls?: number;
}

export interface TurnHandle {
  readonly token: string;
  /** Every tool result this turn returned to the model, in order. */
  readonly results: readonly RecordedToolResult[];
  /** Tool calls the model has started in this turn. */
  readonly calls: number;
  /** Expire the token. Idempotent. */
  close(): void;
}

interface Entry extends Required<OpenTurn> {
  id: string;
  results: RecordedToolResult[];
  names: Set<string>;
  /** Calls started, finished or not: concurrent calls must not share an ID. */
  calls: number;
  closed: boolean;
}

/** The endpoint's own bound; the tool session behind it enforces the same number for both backends. */
export const DEFAULT_MAX_CALLS = MAX_TOOL_CALLS_PER_TURN;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export class TurnRegistry {
  readonly #turns = new Map<string, Entry>();
  readonly #observe: ((result: RecordedToolResult) => void) | undefined;

  /** `observe` sees every tool result of every turn: tests assert on it, production leaves it out. */
  constructor(observe?: (result: RecordedToolResult) => void) {
    this.#observe = observe;
  }

  open(turn: OpenTurn): TurnHandle {
    const token = randomHex(32);
    const entry: Entry = {
      ...turn,
      maxCalls: turn.maxCalls ?? DEFAULT_MAX_CALLS,
      // Shown to the browser as part of tool-use IDs, so it must not be derived from the token.
      id: randomHex(4),
      results: [],
      names: new Set(turn.tools.map((t) => t.name)),
      calls: 0,
      closed: false,
    };
    this.#turns.set(token, entry);
    return {
      token,
      results: entry.results,
      get calls() {
        return entry.calls;
      },
      close: () => {
        entry.closed = true;
        this.#turns.delete(token);
      },
    };
  }

  /** @internal Used by the endpoint. */
  lookup(token: string | undefined): Entry | undefined {
    return token === undefined ? undefined : this.#turns.get(token);
  }

  /** @internal */
  record(entry: Entry, result: RecordedToolResult): void {
    entry.results.push(result);
    this.#observe?.(result);
  }

  get size(): number {
    return this.#turns.size;
  }
}

const RpcMessage = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
type RpcMessage = z.infer<typeof RpcMessage>;

const CallParams = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

/** JSON-RPC codes. -32001 is ours: the turn behind the token is gone or never existed. */
export const RPC = {
  parse: -32700,
  invalid: -32600,
  noMethod: -32601,
  params: -32602,
  noTurn: -32001,
} as const;

const PROTOCOL_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BATCH = 32;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

const rpcError = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});
const toolText = (r: ToolResult) => ({ content: [{ type: "text", text: r.content }], isError: r.isError });

async function handle(
  registry: TurnRegistry,
  msg: RpcMessage,
  turn: Entry | undefined,
  requestSignal: AbortSignal,
): Promise<unknown | undefined> {
  if (msg.id === undefined) return undefined; // A notification: nothing to answer.
  const id = msg.id;
  const ok = (result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: typeof asked === "string" ? asked : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "oak", version: "1" },
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      if (!turn) return rpcError(id, RPC.noTurn, "unknown or expired turn token");
      return ok({
        tools: turn.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
        })),
      });
    case "tools/call": {
      if (!turn) return rpcError(id, RPC.noTurn, "unknown or expired turn token");
      const params = CallParams.safeParse(msg.params);
      if (!params.success) return rpcError(id, RPC.params, "invalid params");
      const { name } = params.data;
      if (!turn.names.has(name)) return rpcError(id, RPC.params, `unknown tool: ${name}`);
      if (turn.calls >= turn.maxCalls) {
        return ok(toolText({ content: JSON.stringify({ error: "TOOL_LIMIT" }), isError: true }));
      }
      const call = { id: `mcp_${turn.id}_${++turn.calls}`, name, input: params.data.arguments ?? {} };
      let out: ToolResult;
      try {
        out = await turn.executeTool(call, AbortSignal.any([turn.signal, requestSignal]));
      } catch {
        out = { content: JSON.stringify({ error: "TOOL_FAILED" }), isError: true };
      }
      // The turn may have ended while the tool ran. Its result no longer has a model to go to.
      if (turn.closed) return rpcError(id, RPC.noTurn, "unknown or expired turn token");
      registry.record(turn, {
        toolUseId: call.id,
        name,
        input: call.input,
        content: out.content,
        isError: out.isError,
      });
      return ok(toolText(out));
    }
    default:
      return rpcError(id, RPC.noMethod, `method not found: ${msg.method}`);
  }
}

export interface McpEndpointOptions {
  registry?: TurnRegistry;
  /**
   * Exact `Host` values to accept, e.g. `["127.0.0.1:8787", "localhost:8787"]` (contracts §11.1).
   * Default: any loopback host. Either way a rebound DNS name is refused.
   */
  hosts?: readonly string[];
}

/**
 * Mount with `app.route("/mcp/tutor", endpoint.app)` and give the backend the same URL. The CLI
 * cannot send `X-Oak: 1` unless told to (`mcpHeaders`), so either mount this outside that rule or
 * pass the header.
 */
export function createMcpEndpoint(opts: McpEndpointOptions = {}): { app: Hono; registry: TurnRegistry } {
  const registry = opts.registry ?? new TurnRegistry();
  const hosts = opts.hosts ? new Set(opts.hosts.map((h) => h.toLowerCase())) : null;
  const app = new Hono();

  app.post("/", async (c) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!(hosts ? hosts.has(host) : LOOPBACK_HOST.test(host))) return c.text("forbidden", 403);
    // The CLI sends no Origin; a browser always does on a POST. A page from anywhere else is refused.
    const origin = c.req.header("origin");
    if (origin !== undefined && !LOOPBACK_ORIGIN.test(origin)) return c.text("forbidden", 403);
    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return c.text("too large", 413);

    const text = await c.req.text();
    if (text.length > MAX_BODY_BYTES) return c.text("too large", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json(rpcError(null, RPC.parse, "parse error"), 400);
    }
    const batch = Array.isArray(body);
    const list: unknown[] = batch ? (body as unknown[]) : [body];
    if (list.length === 0 || list.length > MAX_BATCH) {
      return c.json(rpcError(null, RPC.invalid, "invalid request"), 400);
    }

    const turn = registry.lookup(c.req.header(TURN_HEADER));
    const replies: unknown[] = [];
    // In order, one at a time: tool events reach the panel in the order the model asked.
    for (const raw of list) {
      const msg = RpcMessage.safeParse(raw);
      if (!msg.success) {
        // A response to a request we never sent is ignored; anything else malformed is an error.
        const isResponse = typeof raw === "object" && raw !== null && !("method" in raw);
        if (!isResponse) replies.push(rpcError(null, RPC.invalid, "invalid request"));
        continue;
      }
      const reply = await handle(registry, msg.data, turn, c.req.raw.signal);
      if (reply !== undefined) replies.push(reply);
    }
    if (replies.length === 0) return c.body(null, 202);
    return c.json(batch ? replies : replies[0]);
  });

  // No server-initiated stream and no MCP session state: the token is the only state there is.
  app.get("/", (c) => c.body(null, 405));
  app.delete("/", (c) => c.body(null, 200));
  return { app, registry };
}
