// Minimal MCP "streamable HTTP" server exposing Oak's tutor tools to the Claude CLI.
// Hand-written JSON-RPC (no MCP SDK dependency): initialize, ping, tools/list, tools/call.
// Each tutor turn gets a random token; the CLI sends it as a header, and the server maps it to
// that turn's ToolCtx (hint rung etc.). The model never sees or chooses the rung.
import type { BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Hono } from "hono";
import type { TutorEvent } from "../s6-tutor/events.ts";
import { TOOLS } from "../s6-tutor/request.ts";
import { executeTool, type ToolCtx } from "../s6-tutor/tools.ts";

export interface TurnState {
  ctx: ToolCtx;
  events: TutorEvent[];
  /** Raw JSON text of every tool result returned to the model (for leak assertions). */
  toolResults: string[];
  calls: { name: string; ms: number }[];
}

export const turns = new Map<string, TurnState>();
export const mcpLog: { method: string; at: number; headers?: Record<string, string> }[] = [];

type Rpc = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };

let seq = 0;

async function handle(msg: Rpc, turn: TurnState | undefined, signal: AbortSignal): Promise<unknown | undefined> {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  if (msg.id === undefined) return undefined; // notification
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "oak", version: "0.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
      });
    case "tools/call": {
      if (!turn) return err(-32001, "unknown or expired turn token");
      const name = String(msg.params?.name);
      const use = { type: "tool_use", id: `mcp_${++seq}`, name, input: msg.params?.arguments ?? {} } as BetaToolUseBlock;
      const t0 = performance.now();
      turn.events.push({ type: "tool_start", data: { toolUseId: use.id, name } });
      const out = await executeTool(use, turn.ctx, signal);
      turn.events.push(...out.events);
      turn.calls.push({ name, ms: performance.now() - t0 });
      const text = typeof out.block.content === "string" ? out.block.content : JSON.stringify(out.block.content);
      turn.toolResults.push(text);
      return ok({ content: [{ type: "text", text }], isError: out.block.is_error === true });
    }
    default:
      return err(-32601, `method not found: ${msg.method}`);
  }
}

export function mcpApp() {
  const app = new Hono();
  app.post("/mcp", async (c) => {
    const host = c.req.header("host") ?? "";
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return c.text("forbidden", 403);
    const turn = turns.get(c.req.header("x-oak-turn") ?? "");
    const body = (await c.req.json()) as Rpc | Rpc[];
    const list = Array.isArray(body) ? body : [body];
    for (const m of list) mcpLog.push({ method: m.method, at: Date.now() });
    const replies = (await Promise.all(list.map((m) => handle(m, turn, c.req.raw.signal)))).filter((r) => r !== undefined);
    if (replies.length === 0) return c.body(null, 202);
    return c.json(Array.isArray(body) ? replies : replies[0]);
  });
  // No server-initiated stream and no MCP session state in this spike.
  app.get("/mcp", (c) => c.body(null, 405));
  app.delete("/mcp", (c) => c.body(null, 200));
  return app;
}
