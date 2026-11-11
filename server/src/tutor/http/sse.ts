// An SSE response for a tutor turn, for Hono on Bun.serve (spike S6).
//
// What it guarantees to the browser:
//  - the stream always ends with exactly one `done` or `error` frame, whatever happened inside
//    (a stream that ends without one is what a dropped connection looks like, so we never do it);
//  - a `: ping` comment every 5 s, under Bun's 10 s idle timeout, and `server.timeout(req, 0)` on
//    top where the Bun server is reachable. Either alone keeps a silent stream alive; both are set;
//  - when the client goes away, the AbortSignal handed to the producer fires, so no model call
//    outlives its reader.
import type { Context } from "hono";
import { classifyThrown } from "../errors.ts";
import { encodeSse, SSE_PING, SSE_PING_INTERVAL_MS, type TutorEvent } from "../events.ts";
import type { ServiceEvent } from "../service-types.ts";

/** The part of `Bun.Server` used here. */
export interface IdleTimeoutServer {
  timeout(request: Request, seconds: number): void;
}

export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
  "x-content-type-options": "nosniff",
};

export function encodeFrame(event: ServiceEvent): string {
  if (event.type === "notice") return `event: notice\ndata: ${JSON.stringify(event.data)}\n\n`;
  return encodeSse(event);
}

/**
 * Bun calls `fetch(req, server)` and Hono exposes the second argument as `c.env`, so `c.env` IS
 * the Bun server under `Bun.serve({ fetch: app.fetch })`. Under `app.request()` it is undefined.
 */
export function bunServerOf(c: Context): IdleTimeoutServer | null {
  const env = c.env as unknown;
  if (typeof env !== "object" || env === null) return null;
  if (typeof (env as IdleTimeoutServer).timeout === "function") return env as IdleTimeoutServer;
  // An integrator that passes its own bindings object can put the server under `server`.
  const nested = (env as { server?: unknown }).server;
  if (
    typeof nested === "object" &&
    nested !== null &&
    typeof (nested as IdleTimeoutServer).timeout === "function"
  )
    return nested as IdleTimeoutServer;
  return null;
}

export interface SseOptions {
  /** Default 5 s. Tests shorten it. */
  heartbeatMs?: number;
  /** How to find the Bun server; default `bunServerOf`. */
  server?: (c: Context) => IdleTimeoutServer | null;
  /** Called when no Bun server was found, so the missing `timeout(req, 0)` is never silent. */
  onMissingServer?: () => void;
  /** Called with whatever the producer threw. The browser only ever gets fixed copy. */
  onError?: (error: unknown) => void;
}

export type SseProducer = (send: (event: ServiceEvent) => void, signal: AbortSignal) => Promise<unknown>;

export function sseResponse(c: Context, produce: SseProducer, opts: SseOptions = {}): Response {
  const request = c.req.raw;
  const server = (opts.server ?? bunServerOf)(c);
  // Lifts Bun.serve's idle timeout for THIS response only.
  if (server !== null) server.timeout(request, 0);
  else opts.onMissingServer?.();

  const abort = new AbortController();
  const encoder = new TextEncoder();
  const heartbeatMs = opts.heartbeatMs ?? SSE_PING_INTERVAL_MS;
  let open = true;
  let ended = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const onRequestAbort = () => abort.abort();
  // Bun 1.4.4 aborts the request signal on disconnect and also cancels the body; listen to both.
  request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (frame: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          open = false;
        }
      };
      const send = (event: ServiceEvent) => {
        if (ended) return;
        if (event.type === "done" || event.type === "error") ended = true;
        write(encodeFrame(event));
      };
      const fail = (error: unknown) => {
        const info = classifyThrown(error, { aborted: abort.signal.aborted });
        const event: TutorEvent = { type: "error", data: info };
        send(event);
      };
      if (heartbeatMs > 0) heartbeat = setInterval(() => write(SSE_PING), heartbeatMs);

      let work: Promise<unknown>;
      try {
        work = produce(send, abort.signal);
      } catch (e) {
        work = Promise.reject(e);
      }
      void work
        .catch((e: unknown) => {
          opts.onError?.(e);
          fail(e);
        })
        .finally(() => {
          // A producer that returns without a terminal event has a bug; the client still gets one.
          if (!ended) fail(new Error("the turn ended without a terminal event"));
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", onRequestAbort);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // already closed by the runtime
            }
          }
          // Nothing upstream may outlive the response.
          abort.abort();
        });
    },
    cancel() {
      open = false;
      clearInterval(heartbeat);
      abort.abort();
    },
  });

  return new Response(body, { status: 200, headers: SSE_HEADERS });
}
