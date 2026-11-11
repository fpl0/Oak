// A small typed fetch client over the contract. It sends `X-Oak: 1` on every request, validates what it
// sends and what it receives with the contract's schemas, and reads tutor SSE streams.
import type { z } from "zod";
import {
  buildPath,
  type ConfirmEndpointName,
  contract,
  type EndpointDef,
  type EndpointInput,
  type EndpointName,
  type EndpointOutput,
  HEADERS,
  type JsonEndpointName,
  type SseEndpointName,
} from "./contract.ts";
import { ApiErrorBodySchema, type ConfirmAction, type ConfirmNonce } from "./dto.ts";
import {
  asTutorEvent,
  SseParser,
  TUTOR_ERROR_COPY,
  type TutorErrorKind,
  type TutorEvent,
  type TutorEventOf,
  type TutorTurnRequest,
} from "./tutor.ts";

export type ApiErrorCode =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "confirm_required"
  | "payload_too_large"
  | "unavailable"
  | "internal"
  /** 501: the endpoint is in the contract but its handler is not built yet (Wave 2). */
  | "not_implemented"
  | "network"
  | "contract"
  | "aborted";

export class OakApiError extends Error {
  readonly endpoint: string;
  /** 0 when no response arrived. */
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly issues: { path: string; message: string }[];
  constructor(
    endpoint: string,
    status: number,
    code: ApiErrorCode,
    message: string,
    issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "OakApiError";
    this.endpoint = endpoint;
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export interface OakClientOptions {
  /** Origin to prefix, without a trailing slash. Default "" (same origin: the Vite proxy in dev, the server in production). */
  baseUrl?: string;
  fetch?: FetchLike;
}
/** The part of `fetch` the client uses, so a test can pass a plain function. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export interface CallOptions {
  signal?: AbortSignal;
  /** A nonce from `confirm()`, for a destructive endpoint. */
  confirmNonce?: string;
}
export interface StreamOptions {
  signal?: AbortSignal;
  onEvent(event: TutorEvent): void;
}
export type TutorTerminalEvent = TutorEventOf<"done"> | TutorEventOf<"error">;

export interface OakClient {
  /** Calls a JSON or binary endpoint. Throws `OakApiError`. */
  call<N extends JsonEndpointName>(name: N, ...args: CallArgs<N>): Promise<EndpointOutput<N>>;
  /** The URL of an endpoint, for `<audio src>` and downloads. */
  url<N extends JsonEndpointName>(name: N, ...args: UrlArgs<N>): string;
  /** Asks for a single-use nonce. Call it only after the learner accepted a native confirm dialog that names the action. */
  confirm(action: ConfirmAction, target: string, opts?: CallOptions): Promise<ConfirmNonce>;
  /** `confirm()` followed by the destructive call. */
  destructive<N extends ConfirmEndpointName>(
    name: N,
    target: string,
    ...args: CallArgs<N>
  ): Promise<EndpointOutput<N>>;
  /**
   * Runs one tutor turn. Every event goes to `onEvent`; the returned promise resolves with the terminal
   * `done` or `error` event and never rejects. A stream that ends without one is a `network` error.
   */
  stream(name: SseEndpointName, body: TutorTurnRequest, opts: StreamOptions): Promise<TutorTerminalEvent>;
}

type HasRequired<T> = unknown extends T ? false : Record<string, never> extends T ? false : true;
type CallArgs<N extends EndpointName> =
  HasRequired<EndpointInput<N>> extends true
    ? [input: EndpointInput<N>, opts?: CallOptions]
    : [input?: EndpointInput<N>, opts?: CallOptions];
type UrlInput<N extends EndpointName> = (EndpointInput<N> extends { params: infer P }
  ? { params: P }
  : unknown) &
  (EndpointInput<N> extends { query?: infer Q } ? { query?: Q } : unknown);
type UrlArgs<N extends EndpointName> =
  EndpointInput<N> extends { params: unknown } ? [input: UrlInput<N>] : [input?: UrlInput<N>];

interface LooseInput {
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  contentType?: string;
}

function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

function tutorError(kind: TutorErrorKind, retryAfterSec?: number): TutorEventOf<"error"> {
  return {
    type: "error",
    data: {
      kind,
      message: TUTOR_ERROR_COPY[kind],
      ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
    },
  };
}

export function createClient(options: OakClientOptions = {}): OakClient {
  const baseUrl = options.baseUrl ?? "";
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  function prepare(
    name: EndpointName,
    input: LooseInput,
  ): { def: EndpointDef; url: string; init: RequestInit } {
    const def: EndpointDef = contract[name];
    const headers: Record<string, string> = { [HEADERS.oak]: "1" };
    let params: Record<string, string> = {};
    let query: Record<string, string | undefined> = {};
    let body: NonNullable<RequestInit["body"]> | undefined;
    try {
      if (def.params) params = def.params.parse(input.params ?? {}) as Record<string, string>;
      if (def.query) query = def.query.parse(input.query ?? {}) as Record<string, string | undefined>;
      if (def.body === "binary") {
        body = input.body as NonNullable<RequestInit["body"]>;
        headers["Content-Type"] = input.contentType ?? "application/octet-stream";
      } else if (def.body) {
        body = JSON.stringify(def.body.parse(input.body));
        headers["Content-Type"] = "application/json";
      }
    } catch (e) {
      const issues = e && typeof e === "object" && "issues" in e ? issuesOf(e as z.ZodError) : [];
      throw new OakApiError(
        name,
        0,
        "bad_request",
        `${name}: the request does not match the contract`,
        issues,
      );
    }
    const init: RequestInit = { method: def.method, headers };
    if (body !== undefined) init.body = body;
    return { def, url: baseUrl + buildPath(def, params, query), init };
  }

  async function failure(name: string, res: Response): Promise<OakApiError> {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Not JSON: the security middleware answers 403 with no body.
    }
    const body = ApiErrorBodySchema.safeParse(parsed);
    if (body.success)
      return new OakApiError(
        name,
        res.status,
        body.data.error.code,
        body.data.error.message,
        body.data.error.issues ?? [],
      );
    const code: ApiErrorCode =
      res.status === 403
        ? "forbidden"
        : res.status === 404
          ? "not_found"
          : res.status === 409
            ? "conflict"
            : res.status === 428
              ? "confirm_required"
              : res.status === 501
                ? "not_implemented"
                : res.status >= 500
                  ? "internal"
                  : "bad_request";
    return new OakApiError(name, res.status, code, `${name}: HTTP ${res.status}`);
  }

  async function call(name: EndpointName, input: LooseInput = {}, opts: CallOptions = {}): Promise<unknown> {
    const { def, url, init } = prepare(name, input);
    if (def.res === "sse") throw new OakApiError(name, 0, "bad_request", `${name} is a stream: use stream()`);
    if (def.confirm) {
      if (!opts.confirmNonce)
        throw new OakApiError(
          name,
          0,
          "confirm_required",
          `${name} is destructive and needs a confirm nonce`,
        );
      (init.headers as Record<string, string>)[HEADERS.confirm] = opts.confirmNonce;
    }
    if (opts.signal) init.signal = opts.signal;
    let res: Response;
    try {
      res = await doFetch(url, init);
    } catch (e) {
      if (isAbort(e)) throw new OakApiError(name, 0, "aborted", `${name}: aborted`);
      throw new OakApiError(name, 0, "network", `${name}: the Oak server could not be reached`);
    }
    if (!res.ok) throw await failure(name, res);
    if (def.res === "binary") return res;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new OakApiError(name, res.status, "contract", `${name}: the response is not JSON`);
    }
    const parsed = def.res.safeParse(json);
    if (!parsed.success)
      throw new OakApiError(
        name,
        res.status,
        "contract",
        `${name}: the response does not match the contract`,
        issuesOf(parsed.error),
      );
    return parsed.data;
  }

  async function stream(
    name: SseEndpointName,
    body: TutorTurnRequest,
    opts: StreamOptions,
  ): Promise<TutorTerminalEvent> {
    const finish = (event: TutorTerminalEvent): TutorTerminalEvent => {
      opts.onEvent(event);
      return event;
    };
    let prepared: ReturnType<typeof prepare>;
    try {
      prepared = prepare(name, { body });
    } catch {
      return finish(tutorError("bad_request"));
    }
    const { url, init } = prepared;
    (init.headers as Record<string, string>).Accept = "text/event-stream";
    if (opts.signal) init.signal = opts.signal;
    let terminal: TutorTerminalEvent | null = null;
    try {
      const res = await doFetch(url, init);
      if (!res.ok || !res.body) {
        const retry = Number(res.headers.get("Retry-After"));
        const kind: TutorErrorKind =
          res.status === 429
            ? "rate_limit"
            : res.status === 400 || res.status === 404 || res.status === 422
              ? "bad_request"
              : res.status === 403
                ? "auth"
                : "internal";
        return finish(tutorError(kind, Number.isFinite(retry) && retry > 0 ? retry : undefined));
      }
      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
        for (const parsed of parser.push(text)) {
          const event = asTutorEvent(parsed);
          if (!event || terminal) continue;
          if (event.type === "done" || event.type === "error") terminal = event;
          opts.onEvent(event);
        }
        if (done) break;
      }
    } catch (e) {
      if (terminal) return terminal;
      return finish(tutorError(isAbort(e) || opts.signal?.aborted ? "aborted" : "network"));
    }
    // An idle drop looks exactly like this: the stream ends with no `done` and no `error`.
    return terminal ?? finish(tutorError(opts.signal?.aborted ? "aborted" : "network"));
  }

  const client = {
    call: (name: EndpointName, input?: LooseInput, opts?: CallOptions) => call(name, input, opts),
    url: (name: EndpointName, input?: LooseInput) => prepare(name, input ?? {}).url,
    confirm: (action: ConfirmAction, target: string, opts?: CallOptions) =>
      call("confirm", { body: { action, target } }, opts),
    destructive: async (
      name: ConfirmEndpointName,
      target: string,
      input?: LooseInput,
      opts?: CallOptions,
    ) => {
      const action = (contract[name] as EndpointDef).confirm as ConfirmAction;
      const nonce = (await call("confirm", { body: { action, target } }, opts)) as ConfirmNonce;
      return call(name, input, { ...opts, confirmNonce: nonce.nonce });
    },
    stream,
  };
  return client as unknown as OakClient;
}

/** The tutor route a `ThreadKind` is sent to. */
export const TUTOR_ROUTE_OF = {
  chat: "tutor.chat",
  hint: "tutor.hint",
  explain: "tutor.hint",
  listening: "tutor.note",
  "review-capstone": "tutor.reviewCapstone",
  "review-transcription": "tutor.reviewTranscription",
} as const satisfies Record<TutorTurnRequest["kind"], SseEndpointName>;
