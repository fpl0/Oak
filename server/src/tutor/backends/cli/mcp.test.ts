import { describe, expect, test } from "bun:test";
import { LEARNER_TOOL_NAMES } from "../../tools/defs.ts";
import { RPC } from "./mcp.ts";
import { errorCode, HOST, setup } from "./testing/mcp-client.ts";

describe("protocol", () => {
  test("initialize echoes the client's protocol version; ping answers; neither needs a turn", async () => {
    const { rpc } = setup();
    const init = await rpc(
      "initialize",
      { protocolVersion: "2025-03-26", capabilities: {} },
      { "x-oak-turn": "" },
    );
    expect(init.body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "oak", version: "1" },
      },
    });
    expect((await rpc("initialize")).json.result.protocolVersion).toBe("2025-06-18");
    expect((await rpc("ping", undefined, { "x-oak-turn": "nope" })).body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    });
  });

  test("tools/list: the turn's tools with their strict schemas, and nothing else", async () => {
    const { rpc } = setup();
    const { json } = await rpc("tools/list");
    expect(json.result.tools.map((t) => t.name)).toEqual([...LEARNER_TOOL_NAMES]);
    for (const t of json.result.tools) {
      expect(Object.keys(t)).toEqual(["name", "description", "inputSchema"]);
      expect(t.inputSchema.additionalProperties).toBe(false);
      // No tool has a parameter through which a model could name its own rung.
      expect(JSON.stringify(t.inputSchema.properties)).not.toMatch(/rung|hint_level|disclosure/i);
    }
  });

  test("tools/call runs the turn's executor and returns its text unchanged", async () => {
    const { rpc, calls, turn, seen } = setup();
    const { json } = await rpc("tools/call", { name: "get_learner_progress", arguments: {} });
    expect<unknown>(json.result).toEqual({
      content: [{ type: "text", text: '{"echo":"get_learner_progress"}' }],
      isError: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.call).toMatchObject({ name: "get_learner_progress", input: {} });
    expect(calls[0]?.call.id).toMatch(/^mcp_[0-9a-f]{8}_1$/);
    // The ID goes to the browser in tool events: it must not give the token away.
    expect(turn.token.includes((calls[0]?.call.id ?? "").split("_")[1] as string)).toBe(false);
    const recorded = {
      toolUseId: calls[0]?.call.id,
      name: "get_learner_progress",
      input: {},
      isError: false,
    };
    expect(turn.results).toMatchObject([recorded]);
    expect(seen).toMatchObject([recorded]);
    expect(turn.calls).toBe(1);
  });

  test("notifications get 202 and no body; a batch gets an array; responses are ignored", async () => {
    const { post } = setup();
    const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
    const batch = await post([
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 7, method: "ping" },
      { jsonrpc: "2.0", id: 8, result: {} },
    ]);
    expect(await batch.json()).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }]);
    expect((await post([{ jsonrpc: "2.0", method: "notifications/cancelled" }])).status).toBe(202);
  });

  test("GET is 405 (no server stream); DELETE is accepted (no session state)", async () => {
    const { app } = setup();
    expect((await app.request("/", { headers: { host: HOST } })).status).toBe(405);
    expect((await app.request("/", { method: "DELETE", headers: { host: HOST } })).status).toBe(200);
  });

  test("malformed input: parse error, invalid request, unknown method, invalid params", async () => {
    const { post, rpc, calls } = setup();
    const bad = await post("{not json");
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe(RPC.parse);
    expect(await errorCode(await post([]))).toBe(RPC.invalid);
    expect(await errorCode(await post({ jsonrpc: "1.0", id: 1, method: "ping" }))).toBe(RPC.invalid);
    expect((await rpc("resources/list")).json.error.code).toBe(RPC.noMethod);
    expect((await rpc("tools/call", { arguments: {} })).json.error.code).toBe(RPC.params);
    expect((await rpc("tools/call", { name: "propose_code", arguments: "x" })).json.error.code).toBe(
      RPC.params,
    );
    expect(calls).toEqual([]);
  });

  test("a body over the limit is refused before it is parsed", async () => {
    const { post } = setup();
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
      params: { pad: "x".repeat(1024 * 1024) },
    });
    expect(res.status).toBe(413);
  });
});
describe("who may talk to the endpoint", () => {
  test("Host must be loopback: a rebound DNS name is refused", async () => {
    const { rpc, calls } = setup();
    for (const host of ["evil.example:8787", "127.0.0.1.evil.example:8787", "oak.local", ""]) {
      const res = await setup().post({ jsonrpc: "2.0", id: 1, method: "ping" }, { host });
      expect(res.status).toBe(403);
    }
    expect((await rpc("ping", undefined, { host: "localhost:5173" })).status).toBe(200);
    expect(calls).toEqual([]);
  });

  test("an explicit host list is exact", async () => {
    const s = setup({}, ["127.0.0.1:8787", "localhost:8787"]);
    expect((await s.rpc("ping", undefined, { host: "LOCALHOST:8787" })).status).toBe(200);
    const other = await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, { host: "127.0.0.1:9999" });
    expect(other.status).toBe(403);
  });

  test("a browser page from another origin is refused, even with a valid token", async () => {
    const { post, calls } = setup();
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_learner_progress", arguments: {} },
    };
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1.evil.example"]) {
      expect((await post(body, { origin })).status).toBe(403);
    }
    expect(calls).toEqual([]);
    expect((await post(body, { origin: "http://localhost:5173" })).status).toBe(200);
  });
});
