import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { asTutorEvent, SSE_PING_INTERVAL_MS, SseParser } from "../events.ts";
import type { ServiceEvent } from "../service-types.ts";
import { emptyUsage } from "../usage.ts";
import { bunServerOf, encodeFrame, type SseOptions, type SseProducer, sseResponse } from "./sse.ts";

const DONE: ServiceEvent = {
  type: "done",
  data: {
    stopReason: "end_turn",
    backend: "anthropic-api",
    iterations: 1,
    usage: emptyUsage("anthropic-api"),
  },
};
const text = (delta: string): ServiceEvent => ({ type: "text", data: { delta } });

function appWith(produce: SseProducer, opts: SseOptions = {}) {
  const app = new Hono();
  app.post("/s", (c) => sseResponse(c, produce, opts));
  return app;
}

async function read(res: Response) {
  const parser = new SseParser();
  const frames = parser.push(await res.text());
  return { frames, events: frames.map((f) => f.event), comments: parser.comments, pending: parser.pending };
}

describe("sseResponse", () => {
  test("headers, frame order, and nothing after the terminal event", async () => {
    const app = appWith(async (send) => {
      send(text("a"));
      send({ type: "notice", data: { kind: "budget_soft_marker", message: "m" } });
      send(DONE);
      send(text("late"));
      send(DONE);
    });
    const res = await app.request("/s", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const { frames, events, pending } = await read(res);
    expect(events).toEqual(["text", "notice", "done"]);
    expect(pending).toBe("");
    expect(frames[1]?.data).toEqual({ kind: "budget_soft_marker", message: "m" });
    // A notice is not a tutor event: a client that only knows the protocol skips it.
    expect(frames.map((f) => asTutorEvent(f)?.type ?? null)).toEqual(["text", null, "done"]);
  });

  test("a producer that throws becomes one JSON error event with fixed copy", async () => {
    const seen: unknown[] = [];
    const app = appWith(
      async (send) => {
        send(text("a"));
        throw new Error("upstream said: Authorization: Bearer sk-ant-api03-SECRETSECRET");
      },
      { onError: (e) => seen.push(e) },
    );
    const body = await (await app.request("/s", { method: "POST" })).text();
    const { frames } = { frames: new SseParser().push(body) };
    expect(frames.map((f) => f.event)).toEqual(["text", "error"]);
    expect(frames[1]?.data).toEqual({ kind: "internal", message: "Something went wrong in the tutor." });
    expect(body).not.toContain("SECRET");
    expect(seen).toHaveLength(1);
  });

  test("a synchronous throw and a producer that forgets to finish still end in an error event", async () => {
    const sync = appWith(() => {
      throw new Error("boom");
    });
    expect((await read(await sync.request("/s", { method: "POST" }))).events).toEqual(["error"]);

    const silent = appWith(async (send) => {
      send(text("a"));
    });
    const { frames } = await read(await silent.request("/s", { method: "POST" }));
    expect(frames.map((f) => f.event)).toEqual(["text", "error"]);
    expect(frames[1]?.data).toMatchObject({ kind: "internal" });
  });

  test("the heartbeat is an SSE comment, sent while the producer is silent", async () => {
    expect(SSE_PING_INTERVAL_MS).toBe(5_000);
    const app = appWith(
      async (send) => {
        send(text("before"));
        await Bun.sleep(120);
        send(text("after"));
        send(DONE);
      },
      { heartbeatMs: 25 },
    );
    const res = await app.request("/s", { method: "POST" });
    const raw = await res.text();
    const parser = new SseParser();
    expect(parser.push(raw).map((f) => f.event)).toEqual(["text", "text", "done"]);
    expect(parser.comments.length).toBeGreaterThanOrEqual(2);
    expect(parser.comments.every((c) => c === "ping")).toBe(true);
    // Pings sit between the two deltas, not after the end.
    expect(raw.indexOf(": ping")).toBeGreaterThan(raw.indexOf("before"));
    expect(raw.lastIndexOf(": ping")).toBeLessThan(raw.indexOf("after"));
  });

  test("lifts Bun's idle timeout for the request when the server is reachable, and says so when not", async () => {
    const calls: [Request, number][] = [];
    const server = { timeout: (r: Request, s: number) => void calls.push([r, s]) };
    let missing = 0;
    const app = appWith(async (send) => send(DONE), { onMissingServer: () => missing++ });

    // Hono passes the third argument of app.request as c.env: what Bun.serve does with its server.
    await (await app.request("/s", { method: "POST" }, server)).text();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe(0);
    expect(calls[0]?.[0]).toBeInstanceOf(Request);
    expect(missing).toBe(0);

    await (await app.request("/s", { method: "POST" }, { server })).text();
    expect(calls).toHaveLength(2);

    await (await app.request("/s", { method: "POST" })).text();
    expect(missing).toBe(1);
    expect(calls).toHaveLength(2);
  });

  test("bunServerOf only accepts something with a timeout function", () => {
    const ctx = (env: unknown) => ({ env }) as Parameters<typeof bunServerOf>[0];
    expect(bunServerOf(ctx(undefined))).toBeNull();
    expect(bunServerOf(ctx({ timeout: 5 }))).toBeNull();
    expect(bunServerOf(ctx({ server: {} }))).toBeNull();
    const s = { timeout() {} };
    expect(bunServerOf(ctx(s))).toBe(s);
    expect(bunServerOf(ctx({ server: s }))).toBe(s);
  });

  test("when the reader cancels, the producer's signal fires and later frames are dropped", async () => {
    let signal!: AbortSignal;
    let finished = false;
    const app = appWith(
      async (send, sig) => {
        signal = sig;
        send(text("first"));
        await new Promise<void>((resolve) => sig.addEventListener("abort", () => resolve(), { once: true }));
        send(text("into the void"));
        finished = true;
      },
      { heartbeatMs: 10 },
    );
    const res = await app.request("/s", { method: "POST" });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: text");
    expect(signal.aborted).toBe(false);
    await reader.cancel();
    await Bun.sleep(20);
    expect(signal.aborted).toBe(true);
    expect(finished).toBe(true);
  });

  test("the signal is aborted once the stream is over, so nothing upstream outlives it", async () => {
    let signal!: AbortSignal;
    const app = appWith(async (send, sig) => {
      signal = sig;
      send(DONE);
    });
    await (await app.request("/s", { method: "POST" })).text();
    expect(signal.aborted).toBe(true);
  });

  test("encodeFrame writes one event per frame, one data line", () => {
    expect(encodeFrame(text("a\nb"))).toBe('event: text\ndata: {"delta":"a\\nb"}\n\n');
    expect(encodeFrame({ type: "notice", data: { kind: "budget_soft_marker", message: "m" } })).toBe(
      'event: notice\ndata: {"kind":"budget_soft_marker","message":"m"}\n\n',
    );
  });
});
