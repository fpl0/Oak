// The tutor app on a real Bun.serve socket (127.0.0.1, ephemeral port): what app.request() cannot
// show. Frames arrive while the turn is still running, the heartbeat fills a silent gap, a client
// that goes away aborts the backend, and the security rules hold on the wire.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { request as httpRequest } from "node:http";
import { SseParser } from "../events.ts";
import { createTutorService } from "../service.ts";
import { type FakePorts, makePorts } from "../testing/fakes.ts";
import { LESSON_ID } from "../testing/fixtures.ts";
import { createTutorApp } from "./routes.ts";
import { localSecurity } from "./security.ts";
import { PacedBackend, type PacedStep } from "./testing/paced-backend.ts";

const SECRET = "sk-ant-api03-THIS-IS-THE-KEY-0123456789";
const lesson = { subjectKind: "lesson", subjectId: LESSON_ID } as const;

let server: Bun.Server<undefined>;
let base: string;
let ports: FakePorts;
let backend: PacedBackend;
const timeouts: number[] = [];

beforeAll(() => {
  ports = makePorts();
  backend = Object.assign(new PacedBackend("anthropic-api"), { apiKey: SECRET });
  const service = createTutorService({ ports, backends: [backend], log: () => {} });
  let app: ReturnType<typeof createTutorApp> | undefined;
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    // Bun hands its server to fetch as the second argument; Hono exposes it as c.env.
    fetch: (req, srv) => {
      const spy = {
        timeout(r: Request, seconds: number) {
          timeouts.push(seconds);
          srv.timeout(r, seconds);
        },
      };
      return (app as ReturnType<typeof createTutorApp>).fetch(req, spy);
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  app = createTutorApp({
    service,
    security: localSecurity(server.port as number),
    heartbeatMs: 40,
    idleTimeout: "require",
  });
});

afterAll(async () => {
  await server.stop(true);
});

const headers = () => ({ origin: base, "x-oak": "1", "content-type": "application/json" });
const chat = (text: string, init: RequestInit = {}) =>
  fetch(`${base}/tutor/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ thread: lesson, userText: text }),
    ...init,
  });

function script(steps: PacedStep[]) {
  backend.steps = steps;
}

describe("SSE over a real socket", () => {
  test("frames arrive in order while the turn runs, with heartbeats in the silence, ending in done", async () => {
    script([{ text: "before" }, { wait: 250 }, { text: " after" }]);
    const t0 = performance.now();
    const res = await chat("hello");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();

    const parser = new SseParser();
    const decoder = new TextDecoder();
    const seen: { event: string; ms: number; pingsSoFar: number }[] = [];
    for await (const chunk of res.body as ReadableStream<Uint8Array>) {
      for (const frame of parser.push(decoder.decode(chunk, { stream: true })))
        seen.push({ event: frame.event, ms: performance.now() - t0, pingsSoFar: parser.comments.length });
    }
    expect(seen.map((s) => s.event)).toEqual(["meta", "text", "text", "done"]);
    expect(parser.pending).toBe("");
    // The first delta was on the wire long before the turn finished: this is a stream, not a buffer.
    const [, first, second] = seen as [unknown, { ms: number }, { ms: number; pingsSoFar: number }];
    expect(second.ms - first.ms).toBeGreaterThan(150);
    // Heartbeats filled the 250 ms of silence (one every 40 ms here, every 5 s in production).
    expect(second.pingsSoFar).toBeGreaterThanOrEqual(3);
    expect(parser.comments.every((c) => c === "ping")).toBe(true);
    // The idle timeout was lifted for this request through the Bun server.
    expect(timeouts.at(-1)).toBe(0);
  });

  test("a client that disconnects aborts the backend's signal, and the turn is stored as a stopped tail", async () => {
    script([{ text: "first" }, { wait: 30_000 }, { text: "never sent" }]);
    const stop = new AbortController();
    const res = await chat("stop me", { signal: stop.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const events: string[] = [];
    while (!events.includes("text")) {
      const { value, done } = await reader.read();
      if (done) break;
      events.push(...parser.push(decoder.decode(value, { stream: true })).map((f) => f.event));
    }
    expect(events).toEqual(["meta", "text"]);
    const t0 = performance.now();
    stop.abort();
    await Promise.race([
      backend.aborted,
      Bun.sleep(3_000).then(() => {
        throw new Error("the backend never saw the abort");
      }),
    ]);
    expect(performance.now() - t0).toBeLessThan(2_000);

    // The turn winds down on its own: nothing waits for the 30 s script.
    let stored = await ports.conversations.timeline(lesson);
    for (let i = 0; i < 100 && !stored.some((e) => e.errorKind === "aborted"); i++) {
      await Bun.sleep(10);
      stored = await ports.conversations.timeline(lesson);
    }
    const tail = stored.slice(-2);
    expect(tail.map((e) => [e.role, e.excluded, e.errorKind])).toEqual([
      ["user", true, null],
      ["assistant", true, "aborted"],
    ]);
    // And the conversation is free for the next turn.
    script([{ text: "again" }]);
    const next = new SseParser().push(await (await chat("again")).text());
    expect(next.map((f) => f.event)).toEqual(["meta", "text", "done"]);
  });
});

describe("security over a real socket", () => {
  const body = JSON.stringify({ thread: lesson, userText: "hi" });

  test("a cross-origin POST is refused with 403 and no CORS header", async () => {
    const before = backend.turns.length;
    const res = await fetch(`${base}/tutor/chat`, {
      method: "POST",
      headers: { ...headers(), origin: "https://evil.example" },
      body,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden", reason: "origin" });
    expect([...res.headers.keys()].filter((k) => k.startsWith("access-control-"))).toEqual([]);
    // The other loopback name on another port is another origin too.
    const sibling = await fetch(`${base}/tutor/chat`, {
      method: "POST",
      headers: { ...headers(), origin: "http://localhost:5173" },
      body,
    });
    expect(sibling.status).toBe(403);
    expect(backend.turns.length).toBe(before);
  });

  test("a request without X-Oak is refused, as is a preflight", async () => {
    const { "x-oak": _x, ...noOak } = headers();
    const res = await fetch(`${base}/tutor/chat`, { method: "POST", headers: noOak, body });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden", reason: "x-oak" });
    const status = await fetch(`${base}/tutor/status`);
    expect(status.status).toBe(403);
    const pre = await fetch(`${base}/tutor/chat`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(pre.status).toBe(403);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a rebinding Host is refused (raw HTTP, since fetch will not forge Host)", async () => {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/tutor/status",
          method: "GET",
          headers: { host: `evil.example:${server.port}`, "x-oak": "1" },
        },
        (res) => {
          let data = "";
          res.on("data", (d: Buffer) => {
            data += d.toString();
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error: "forbidden", reason: "host" });
  });

  test("status over the wire names the backend and never the key", async () => {
    const res = await fetch(`${base}/tutor/status`, { headers: { "x-oak": "1" } });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(JSON.parse(raw)).toMatchObject({ tutor: "ready", active: "anthropic-api" });
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("sk-ant");
    for (const [, value] of res.headers) expect(value).not.toContain("sk-ant");
  });
});
