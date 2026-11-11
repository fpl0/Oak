// Error kinds of the tutor protocol (contracts §10.1) and the mapping helpers both backends use.
// The helpers duck-type what they are given, so this file needs neither the Anthropic SDK nor any
// CLI knowledge; each backend passes in what it caught.

export const TUTOR_ERROR_KINDS = [
  "rate_limit",
  "overloaded",
  "auth",
  "bad_request",
  "network",
  "refusal",
  "max_tokens",
  "iteration_limit",
  "budget",
  "aborted",
  "internal",
] as const;

export type TutorErrorKind = (typeof TUTOR_ERROR_KINDS)[number];

export interface TutorErrorInfo {
  kind: TutorErrorKind;
  message: string;
  retryAfterSec?: number;
}

/**
 * What the learner reads. Fixed copy per kind: raw upstream messages are never forwarded, because
 * they can quote request headers or bodies (contracts §11.1 rule 6: the key appears in no response).
 */
export const ERROR_COPY: Record<TutorErrorKind, string> = {
  rate_limit: "The tutor is being rate limited. Try again in a moment.",
  overloaded: "The tutor is busy right now. Try again.",
  auth: "The tutor could not sign in. Check the tutor setup in Settings.",
  bad_request: "The tutor could not handle that request.",
  network: "The tutor could not be reached. Check your connection.",
  refusal: "The tutor declined to answer that. Try asking in a different way.",
  max_tokens: "The tutor's answer was cut off. Try again.",
  iteration_limit: "The tutor took too many steps without finishing. Try again.",
  budget: "The monthly tutor cap you set has been reached. You can raise it in Settings.",
  aborted: "Stopped.",
  internal: "Something went wrong in the tutor.",
};

export class TutorError extends Error {
  readonly kind: TutorErrorKind;
  readonly retryAfterSec: number | undefined;
  /** Diagnostic text for the server log, already scrubbed of secrets. Never sent to the browser. */
  readonly detail: string | undefined;

  constructor(kind: TutorErrorKind, opts: { retryAfterSec?: number; detail?: string } = {}) {
    super(ERROR_COPY[kind]);
    this.name = "TutorError";
    this.kind = kind;
    this.retryAfterSec = opts.retryAfterSec;
    this.detail = opts.detail === undefined ? undefined : redactSecrets(opts.detail);
  }

  toInfo(): TutorErrorInfo {
    return errorInfo(this.kind, this.retryAfterSec);
  }
}

/** Token counts of one or more model calls; `UsageSummary` (events.ts) is assignable to it. */
type Spent = { requests: number };

/**
 * A structured turn (a review) that failed after model calls were made. A failed review still
 * cost tokens: the error carries them, so the runner logs the calls and the budget sees them.
 */
export class StructuredTurnError<U extends Spent = Spent> extends TutorError {
  readonly usage: U;
  readonly calls: U[];

  constructor(error: TutorErrorInfo, usage: U, calls: U[], detail?: string) {
    super(error.kind, {
      ...(error.retryAfterSec === undefined ? {} : { retryAfterSec: error.retryAfterSec }),
      ...(detail === undefined ? {} : { detail }),
    });
    this.name = "StructuredTurnError";
    this.usage = usage;
    this.calls = calls;
  }
}

export function errorInfo(kind: TutorErrorKind, retryAfterSec?: number): TutorErrorInfo {
  const info: TutorErrorInfo = { kind, message: ERROR_COPY[kind] };
  if (retryAfterSec !== undefined) info.retryAfterSec = retryAfterSec;
  return info;
}

/** Scrub anything that looks like a credential before a string is logged. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{4,}/g, "sk-ant-[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(/((?:x-api-key|authorization|x-oak-turn)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[redacted]");
}

export function classifyHttpStatus(status: number): TutorErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408) return "network";
  if (status >= 500) return "overloaded";
  if (status >= 400) return "bad_request";
  return "internal";
}

/** The `error.type` of an Anthropic error body, also seen in-stream after an HTTP 200. */
export function classifyApiErrorType(type: string): TutorErrorKind {
  switch (type) {
    case "overloaded_error":
    case "api_error":
    case "timeout_error":
      return "overloaded";
    case "rate_limit_error":
      return "rate_limit";
    case "authentication_error":
    case "permission_error":
    case "billing_error":
      return "auth";
    case "invalid_request_error":
    case "not_found_error":
    case "request_too_large":
      return "bad_request";
    default:
      return "internal";
  }
}

/** `retry-after` is seconds or an HTTP date. Accepts a Headers object or a plain record. */
export function parseRetryAfter(headers: unknown, nowMs: number = Date.now()): number | undefined {
  let raw: string | null | undefined;
  if (headers && typeof (headers as Headers).get === "function")
    raw = (headers as Headers).get("retry-after");
  else if (headers && typeof headers === "object") {
    const rec = headers as Record<string, unknown>;
    const v = rec["retry-after"] ?? rec["Retry-After"];
    raw = typeof v === "string" ? v : undefined;
  }
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, Math.ceil(secs));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "ConnectionRefused",
  "ConnectionClosed",
  "FailedToOpenSocket",
]);

/**
 * Map anything thrown while talking to a model. Most specific first (architecture §5.9).
 * `aborted` wins over everything: once the learner pressed Stop, whatever the stream threw
 * afterwards is a consequence of that.
 */
export function classifyThrown(e: unknown, opts: { aborted?: boolean; nowMs?: number } = {}): TutorErrorInfo {
  if (e instanceof TutorError) return e.toInfo();
  const err = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
  const name = typeof err.name === "string" ? err.name : "";
  if (opts.aborted || name === "AbortError" || name === "APIUserAbortError") return errorInfo("aborted");
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError" || name === "TimeoutError") {
    return errorInfo("network");
  }
  if (typeof err.code === "string" && NETWORK_CODES.has(err.code)) return errorInfo("network");
  if (typeof err.status === "number") {
    const kind = classifyHttpStatus(err.status);
    return errorInfo(kind, kind === "rate_limit" ? parseRetryAfter(err.headers, opts.nowMs) : undefined);
  }
  // An in-stream `error` event arrives as an error whose body carries `{ type: "overloaded_error" }`.
  const body = (err.error ?? null) as { type?: unknown; error?: { type?: unknown } } | null;
  const type = typeof body?.error?.type === "string" ? body.error.type : body?.type;
  if (typeof type === "string" && type !== "error") return errorInfo(classifyApiErrorType(type));
  return errorInfo("internal");
}

/** A response's stop reason, checked BEFORE its content is used or its tools are run. */
export function classifyStopReason(stopReason: string | null, hasToolUse: boolean): TutorErrorKind | null {
  if (stopReason === "refusal") return "refusal";
  // A truncated tool call has incomplete input: never execute it, never store it.
  if ((stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") && hasToolUse) {
    return "max_tokens";
  }
  return null;
}

export interface CliExit {
  exitCode: number | null;
  /** Whether a `result` event was seen. A killed process leaves none (spike S8). */
  sawResult: boolean;
  resultIsError: boolean;
  resultSubtype: string | null;
  /** The result text or stderr, used only for classification. */
  text: string;
  aborted: boolean;
}

/** How a finished `claude -p` process maps onto the protocol. `null` means the turn succeeded. */
export function classifyCliExit(x: CliExit): TutorErrorKind | null {
  if (x.aborted) return "aborted";
  if (!x.sawResult) {
    // SIGTERM / SIGINT without our own abort: something else killed the process.
    if (x.exitCode === 143 || x.exitCode === 130) return "aborted";
    return /not logged in|\/login|authenticat/i.test(x.text) ? "auth" : "internal";
  }
  if (!x.resultIsError) return null;
  if (x.resultSubtype === "error_max_turns") return "iteration_limit";
  if (/usage limit|rate limit|too many requests|429/i.test(x.text)) return "rate_limit";
  if (/not logged in|\/login|authenticat|unauthorized|401/i.test(x.text)) return "auth";
  if (/overloaded|529|503/i.test(x.text)) return "overloaded";
  if (/ECONN|ENOTFOUND|network|fetch failed/i.test(x.text)) return "network";
  return "internal";
}
