// The tutor's JSON routes (status, warm, timeline, cards, notes) and the mount point for the CLI
// backend's MCP endpoint, through app.request().
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { LESSON_ID, STEP_ID } from "../testing/fixtures.ts";
import { ScriptedBackend } from "../testing/scripted-backend.ts";
import type { ExtraApp } from "./routes.ts";
import { BASE, HEADERS, SECRET, setup } from "./testing/harness.ts";
import { PacedBackend } from "./testing/paced-backend.ts";

const lesson = { subjectKind: "lesson", subjectId: LESSON_ID };

describe("JSON routes", () => {
  test("status reports the backends and never the key, even one sitting on the backend object", async () => {
    const api = Object.assign(new PacedBackend("anthropic-api"), {
      apiKey: SECRET,
      client: { apiKey: SECRET },
    });
    const cli = new PacedBackend("claude-cli");
    cli.isAvailable = { ok: false, reason: `x-api-key: ${SECRET}` };
    const { get } = setup([api, cli]);
    for (const path of ["/tutor/status", "/tutor/status?refresh=1"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const raw = await res.text();
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain("sk-ant");
      expect(raw.toLowerCase()).not.toContain("apikey");
      expect(JSON.parse(raw)).toMatchObject({
        tutor: "ready",
        active: "anthropic-api",
        backends: [
          { id: "anthropic-api", ok: true, active: true },
          { id: "claude-cli", ok: false, reason: "unreachable" },
        ],
      });
    }
    expect((await get("/tutor/status?refresh=yes")).status).toBe(400);
  });

  test("warm, under both names", async () => {
    const api = new PacedBackend("anthropic-api");
    const { post } = setup([api]);
    expect(await (await post("/tutor/warm", {})).json()).toEqual({
      warmed: true,
      backend: "anthropic-api",
      reason: null,
    });
    expect(await (await post("/tutor/session-warm")).json()).toMatchObject({
      warmed: false,
      reason: "fresh",
    });
    expect(api.warmCalls).toHaveLength(1);
  });

  test("the thread timeline, card applied and note retract", async () => {
    const card = { kind: "example", title: "t", code: 's("bd sd")', explanation: "e", bars: 1 };
    const backend = new ScriptedBackend("anthropic-api", [
      { text: "Try [[deg:5]]. <script>alert(1)</script>" },
      { tool: { name: "propose_code", input: card } },
    ]);
    const { post, get, ports } = setup([backend]);
    await (await post("/tutor/chat", { thread: lesson, userText: "show me", stepId: STEP_ID })).text();
    await (
      await post("/tutor/chat", {
        thread: { subjectKind: "general", subjectId: "general" },
        userText: "and here",
      })
    ).text();

    const res = await get(`/tutor/threads/lesson/${encodeURIComponent(LESSON_ID)}?limit=50`);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("<script");
    const view = JSON.parse(raw) as {
      entries: { role: string; segments: { type: string }[] | null; cards: unknown[] }[];
    };
    expect(view.entries.map((e) => e.role)).toEqual(["user", "assistant"]);
    expect(view.entries[1]?.segments?.map((s) => s.type)).toEqual(["text", "token", "text"]);
    expect(view.entries[1]?.cards).toMatchObject([{ cardId: "card-1", apply: "preview_only" }]);
    expect((await get("/tutor/threads/nope/x")).status).toBe(400);
    expect((await get(`/tutor/threads/lesson/${LESSON_ID}?limit=0`)).status).toBe(400);
    expect(
      ((await (await get("/tutor/threads/sketch/none")).json()) as { entries: unknown[] }).entries,
    ).toEqual([]);

    // card-1 sits on a graded step (preview only); card-2 is general chat (applicable).
    expect((await post("/tutor/cards/card-1/applied")).status).toBe(409);
    expect(await (await post("/tutor/cards/card-2/applied")).json()).toEqual({ status: "applied" });
    expect((await post("/tutor/cards/card-404/applied")).status).toBe(404);
    expect((await ports.conversations.card("card-1"))?.applied).toBe(false);

    const note = await ports.notes.add({
      day: "2026-11-11",
      subjectKind: "lesson",
      subjectId: LESSON_ID,
      source: "observation",
      text: "x",
      skillId: null,
    });
    expect(await (await post(`/tutor/notes/${note.id}/retract`)).json()).toEqual({ status: "retracted" });
    expect(ports.notes.notes[0]?.retractedAt).not.toBeNull();
  });

  test("an unexpected failure is a 500 with fixed copy, and the detail goes to the log scrubbed", async () => {
    const { get, ports, logs } = setup([new PacedBackend()]);
    ports.conversations.timeline = async () => {
      throw new Error(`db broke, authorization: Bearer ${SECRET}`);
    };
    const res = await get(`/tutor/threads/lesson/${LESSON_ID}`);
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({
      error: { kind: "internal", message: "Something went wrong in the tutor." },
    });
    expect(raw).not.toContain("db broke");
    const entry = logs.find((l) => l.msg === "tutor route failed");
    expect(entry?.detail).toContain("db broke");
    expect(entry?.detail).not.toContain(SECRET);
  });
});

describe("extra apps (the CLI backend's MCP endpoint)", () => {
  test("mounted beside the tutor routes, relative to its path, under the Host rule only", async () => {
    const seen: { path: string; turn: string | null; env: unknown }[] = [];
    // Shaped like createMcpEndpoint().app: its routes are relative to the mount point.
    const mcp = new Hono();
    mcp.post("/", (c) => {
      seen.push({ path: c.req.path, turn: c.req.header("x-oak-turn") ?? null, env: c.env });
      return c.json({ jsonrpc: "2.0", id: 1, result: {} });
    });
    mcp.get("/health", (c) => c.text("ok"));
    const extra: ExtraApp = { path: "/mcp/tutor", app: mcp };
    const { app } = setup([new PacedBackend()], { extraApps: [extra] });
    const server = { timeout() {} };
    const call = async (headers: Record<string, string>, path = "/mcp/tutor", method = "POST") =>
      app.request(
        `${BASE}${path}`,
        { method, headers, ...(method === "POST" ? { body: "{}" } : {}) },
        server,
      );

    // The Claude CLI sends no Origin and no X-Oak; its per-turn token is the MCP endpoint's business.
    const cli = { host: "127.0.0.1:8787", "content-type": "application/json", "x-oak-turn": "tok" };
    const ok = await call(cli);
    expect(ok.status).toBe(200);
    expect(seen).toEqual([{ path: "/mcp/tutor", turn: "tok", env: server }]);
    expect((await call({ host: "127.0.0.1:8787" }, "/mcp/tutor/health", "GET")).status).toBe(200);

    // The Host rule covers the mount point and everything under it; a browser page is refused.
    expect((await call({ ...cli, host: "evil.example:8787" })).status).toBe(403);
    expect((await call({ host: "evil.example:8787" }, "/mcp/tutor/health", "GET")).status).toBe(403);
    expect((await call({ ...cli, origin: BASE, "x-oak": "1" })).status).toBe(403);
    expect(seen).toHaveLength(1);
    // The tutor routes keep the full rules: the CLI's headers are not enough there.
    expect((await call({ host: "127.0.0.1:8787" }, "/tutor/status", "GET")).status).toBe(403);
  });

  test("basePath moves the tutor routes, not the extra apps", async () => {
    const mcp = new Hono();
    mcp.post("/", (c) => c.json({ ok: true }));
    const { app, get } = setup([new PacedBackend()], {
      basePath: "/api",
      extraApps: [{ path: "/mcp/tutor", app: mcp }],
    });
    expect((await get("/api/tutor/status")).status).toBe(200);
    expect((await get("/tutor/status")).status).toBe(404);
    const { "x-oak": _x, ...noOak } = HEADERS;
    expect(await (await get("/api/tutor/status", noOak)).json()).toEqual({
      error: "forbidden",
      reason: "x-oak",
    });
    const cli = await app.request(`${BASE}/mcp/tutor`, {
      method: "POST",
      headers: { host: "127.0.0.1:8787" },
      body: "{}",
    });
    expect(cli.status).toBe(200);
    expect((await app.request(`${BASE}/api/mcp/tutor`, { method: "POST", headers: HEADERS })).status).toBe(
      404,
    );
  });

  test("an extra app can ask for the full browser rules instead", async () => {
    const page = new Hono();
    page.get("/", (c) => c.text("hi"));
    const { app } = setup([new PacedBackend()], { extraApps: [{ path: "/x", app: page, guard: "browser" }] });
    const bare = await app.request(`${BASE}/x`, { headers: { host: "127.0.0.1:8787" } });
    expect(bare.status).toBe(403);
    const good = await app.request(`${BASE}/x`, { headers: { host: "127.0.0.1:8787", "x-oak": "1" } });
    expect(good.status).toBe(200);
  });
});
