// A small JSON-RPC client for the MCP endpoint tests: one registry, one open turn, and requests
// made straight into the Hono app (no socket). Test code only.
import { LEARNER_TOOL_NAMES, TOOLS } from "../../../tools/defs.ts";
import type { ExecuteTool, ToolCall } from "../../../types.ts";
import { createMcpEndpoint, type OpenTurn, type RecordedToolResult, TurnRegistry } from "../mcp.ts";

/** A JSON-RPC reply as the tests read it: whichever of `result` / `error` is absent throws on access. */
export interface Reply {
  jsonrpc: string;
  id: number | null;
  result: {
    protocolVersion: string;
    tools: { name: string; inputSchema: { additionalProperties: boolean; properties: unknown } }[];
    content: { type: string; text: string }[];
    isError: boolean;
  };
  error: { code: number; message: string };
}
export const errorCode = async (res: Response) => ((await res.json()) as Reply).error.code;

export const LEARNER_TOOLS = TOOLS.filter((t) => LEARNER_TOOL_NAMES.includes(t.name));
export const HOST = "127.0.0.1:8787";

export function setup(over: Partial<OpenTurn> = {}, hosts?: string[]) {
  const seen: RecordedToolResult[] = [];
  const calls: { call: ToolCall; signal: AbortSignal }[] = [];
  const executeTool: ExecuteTool = async (call, signal) => {
    calls.push({ call, signal });
    return { content: JSON.stringify({ echo: call.name }), isError: false };
  };
  const registry = new TurnRegistry((r) => seen.push(r));
  const { app } = createMcpEndpoint({ registry, ...(hosts ? { hosts } : {}) });
  const stop = new AbortController();
  const turn = registry.open({ tools: LEARNER_TOOLS, executeTool, signal: stop.signal, ...over });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/", {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json", "x-oak-turn": turn.token, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const rpc = async (method: string, params?: unknown, headers?: Record<string, string>) => {
    const res = await post(
      { jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) },
      headers,
    );
    const body: unknown = await res.json();
    // `json` for reading fields, `body` (the same value, untyped) for whole-reply comparisons.
    return { status: res.status, json: body as Reply, body };
  };
  return { app, registry, turn, post, rpc, calls, seen, stop };
}
