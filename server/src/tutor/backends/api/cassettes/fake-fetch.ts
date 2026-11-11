// The REAL @anthropic-ai/sdk client on a fake transport: an injected `fetch` serves a cassette as
// wire-format SSE and records every request exactly as the SDK serialised it. This exercises the
// SDK's own request building, SSE parser, snapshot accumulation and abort path, and it never
// touches the network. Test code only.
import Anthropic from "@anthropic-ai/sdk";
import type { Cassette, CassetteResponse } from "./builders.ts";

export interface WireRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  /** The request body exactly as sent. Leak tests search this. */
  bodyText: string;
  aborted: boolean;
}

/** Not a key: the SDK only needs a non-empty string, and tests assert it never leaves the client. */
export const CASSETTE_KEY = "sk-ant-cassette-not-a-real-key-0000";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseBody(
  res: CassetteResponse,
  signal: AbortSignal | null | undefined,
  wire: WireRequest,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const inner = new AbortController();
  const stop = () => {
    wire.aborted = true;
    inner.abort();
  };
  signal?.addEventListener("abort", stop, { once: true });
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const step of res.steps) {
          if (step.kind === "delay") await sleep(step.ms, inner.signal);
          else if (step.kind === "cut") break;
          else if (step.kind === "error") {
            const error = { type: step.errorType, message: step.message };
            controller.enqueue(enc.encode(frame("error", { type: "error", error })));
          } else if (step.kind === "raw") controller.enqueue(enc.encode(frame(step.event, step.data)));
          else {
            controller.enqueue(enc.encode(frame(step.event.type, step.event)));
            // Yield between events, as a network stream would.
            await Promise.resolve();
          }
        }
        controller.close();
      } catch (e) {
        controller.error(signal?.reason ?? e);
      }
    },
    cancel: stop,
  });
}

export interface CassetteTransport {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  wire: WireRequest[];
}

export function cassetteFetch(cassette: Cassette): CassetteTransport {
  const wire: WireRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    const rec: WireRequest = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {},
      bodyText,
      aborted: false,
    };
    const res = cassette.responses[wire.length];
    wire.push(rec);
    if (!res) throw new Error(`cassette "${cassette.name}" has no response #${wire.length}`);
    if (res.networkError !== undefined) throw new TypeError(res.networkError);
    const base = { "request-id": `req_cassette_${wire.length}` };
    if (res.httpError) {
      const e = res.httpError;
      const body = { type: "error", error: { type: e.type, message: e.message } };
      const errHeaders = { "content-type": "application/json", ...base, ...(e.headers ?? {}) };
      return new Response(JSON.stringify(body), { status: e.status, headers: errHeaders });
    }
    if (res.json !== undefined) {
      const okHeaders = { "content-type": "application/json", ...base };
      return new Response(JSON.stringify(res.json), { status: 200, headers: okHeaders });
    }
    return new Response(sseBody(res, init?.signal, rec), {
      status: 200,
      headers: { "content-type": "text/event-stream", ...base },
    });
  };
  return { fetch, wire };
}

/** baseURL is the discard port: anything that ever bypassed the fake fetch would fail locally. */
export const CASSETTE_BASE_URL = "http://127.0.0.1:9";

export function cassetteClient(cassette: Cassette): { client: Anthropic; wire: WireRequest[] } {
  const { fetch, wire } = cassetteFetch(cassette);
  const client = new Anthropic({ apiKey: CASSETTE_KEY, baseURL: CASSETTE_BASE_URL, maxRetries: 0, fetch });
  return { client, wire };
}
