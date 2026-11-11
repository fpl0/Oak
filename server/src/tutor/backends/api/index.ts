// The 'anthropic-api' backend: the Messages API through @anthropic-ai/sdk, behind TutorBackend.
// Nothing here knows about rungs or redaction: the backend sends what it is handed.
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { errorInfo, TutorError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import { type TutorBackend, UNAVAILABLE } from "../../types.ts";
import { emptyUsage } from "../../usage.ts";
import { BACKEND_ID, runLoop } from "./loop.ts";
import type { RequestOptions } from "./request.ts";
import { runStructuredTurn } from "./structured.ts";
import { warmPrefix } from "./warm.ts";

export { BACKEND_ID } from "./loop.ts";
export { BETAS, type ContextPlacement, type RequestOptions } from "./request.ts";
export { StructuredTurnError } from "./structured.ts";

export interface AnthropicApiOptions extends RequestOptions {
  /**
   * Passed explicitly, never read from the environment here: the server removes the key from its
   * own environment before it spawns anything (contracts §11).
   */
  apiKey?: string | null | undefined;
  /** A ready client instead of a key (tests). */
  client?: Anthropic | undefined;
  fetch?: ClientOptions["fetch"];
  baseURL?: string | undefined;
  /** SDK retries for 408/409/429/5xx before a stream starts. Default 2. */
  maxRetries?: number | undefined;
  /** The warm-up is a billed call with no turn to hang its usage on; log it from here. */
  onWarmUsage?: ((usage: UsageSummary) => void) | undefined;
}

export function createAnthropicApiBackend(opts: AnthropicApiOptions = {}): TutorBackend {
  const key = opts.apiKey?.trim() ?? "";
  let client: Anthropic | null = opts.client ?? null;
  if (client === null && key !== "") {
    const init: ClientOptions = { apiKey: key, maxRetries: opts.maxRetries ?? 2 };
    if (opts.fetch !== undefined) init.fetch = opts.fetch;
    if (opts.baseURL !== undefined) init.baseURL = opts.baseURL;
    client = new Anthropic(init);
  }
  const request: RequestOptions = {};
  if (opts.contextPlacement !== undefined) request.contextPlacement = opts.contextPlacement;
  if (opts.tailCache !== undefined) request.tailCache = opts.tailCache;

  // The key lives in this closure and in the SDK client only. The returned object has no field
  // that holds it, and every error leaves through errors.ts with fixed copy.
  return {
    id: BACKEND_ID,

    async available() {
      // Presence only: checking validity would be a billed call. An invalid key shows up as an
      // `auth` error on the first turn.
      return client === null ? { ok: false, reason: UNAVAILABLE.missingKey } : { ok: true };
    },

    async runTurn(input, emit, signal) {
      if (client === null) {
        const usage = emptyUsage(BACKEND_ID);
        return { status: "failed", error: errorInfo("auth"), iterations: 0, usage, calls: [] };
      }
      return runLoop({ client, input, emit, signal, options: request });
    },

    async runStructured(input, signal) {
      if (client === null) throw new TutorError("auth");
      return runStructuredTurn(client, input, signal, request);
    },

    async warm(input, signal) {
      if (client === null) throw new TutorError("auth");
      const usage = await warmPrefix(client, input, signal);
      opts.onWarmUsage?.(usage);
    },
  };
}
