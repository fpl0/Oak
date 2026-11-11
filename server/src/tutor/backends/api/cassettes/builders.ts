// Cassettes: scripted Anthropic responses, typed against the SDK's stream-event types and served
// as wire-format SSE by fake-fetch.ts. Response N answers API request N of a test.
//
// These are AUTHORED, not recorded: no call to api.anthropic.com has been made yet. They follow
// the documented wire format and the SDK 1.8.0 types (spike S6). Test code only.
import type {
  BetaMessage,
  BetaMessageDeltaUsage,
  BetaRawMessageStreamEvent,
  BetaRefusalStopDetails,
  BetaStopReason,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type CassetteStep =
  | { kind: "event"; event: BetaRawMessageStreamEvent }
  /** A content block the SDK's event union has no start type for (`fallback`), sent as raw JSON. */
  | { kind: "raw"; event: string; data: unknown }
  | { kind: "delay"; ms: number }
  /** A mid-stream `event: error` frame, after HTTP 200 has been sent. */
  | { kind: "error"; errorType: "overloaded_error" | "api_error" | "rate_limit_error"; message: string }
  /** The connection ends here, with no message_stop. */
  | { kind: "cut" };

export interface CassetteResponse {
  /** An HTTP-level failure instead of a stream. */
  httpError?: { status: number; type: string; message: string; headers?: Record<string, string> };
  /** The transport itself fails (DNS, refused connection). */
  networkError?: string;
  /** A non-streaming JSON body (the warm-up). */
  json?: unknown;
  steps: CassetteStep[];
}

export interface Cassette {
  name: string;
  responses: CassetteResponse[];
}

export interface UsageSpec {
  input?: number;
  cacheRead?: number | null;
  cacheWrite1h?: number;
  cacheWrite5m?: number;
  /** Send `cache_creation: null` and null totals, as the types allow. */
  nullCache?: boolean;
  iterations?: BetaUsage["iterations"];
}

export function usageOf(u: UsageSpec, output: number): BetaUsage {
  const w1 = u.cacheWrite1h ?? 0;
  const w5 = u.cacheWrite5m ?? 0;
  return {
    cache_creation: u.nullCache ? null : { ephemeral_1h_input_tokens: w1, ephemeral_5m_input_tokens: w5 },
    cache_creation_input_tokens: u.nullCache ? null : w1 + w5,
    cache_read_input_tokens: u.nullCache ? null : (u.cacheRead ?? 0),
    fallback_credit: null,
    inference_geo: null,
    input_tokens: u.input ?? 10,
    iterations: u.iterations ?? null,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: "standard",
    speed: "standard",
  };
}

const ev = (event: BetaRawMessageStreamEvent): CassetteStep => ({ kind: "event", event });

export function message(id: string, u: UsageSpec = {}, model = "claude-opus-5-5"): BetaMessage {
  return {
    id,
    container: null,
    content: [],
    context_management: null,
    diagnostics: null,
    model,
    role: "assistant",
    stop_details: null,
    stop_reason: null,
    stop_sequence: null,
    type: "message",
    usage: usageOf(u, 1),
  };
}

export function messageStart(id: string, u: UsageSpec = {}, model = "claude-opus-5-5"): CassetteStep {
  return ev({ type: "message_start", message: message(id, u, model) });
}

export function thinkingBlock(index: number, chunks: string[], signature = "sig-opaque=="): CassetteStep[] {
  return [
    ev({
      type: "content_block_start",
      index,
      content_block: { type: "thinking", thinking: "", signature: "" },
    }),
    ...chunks.map((thinking) =>
      ev({
        type: "content_block_delta",
        index,
        delta: { type: "thinking_delta", thinking, estimated_tokens: null },
      }),
    ),
    ev({ type: "content_block_delta", index, delta: { type: "signature_delta", signature } }),
    ev({ type: "content_block_stop", index }),
  ];
}

export function textBlock(index: number, chunks: string[]): CassetteStep[] {
  return [
    ev({ type: "content_block_start", index, content_block: { type: "text", text: "", citations: null } }),
    ...chunks.map((text) => ev({ type: "content_block_delta", index, delta: { type: "text_delta", text } })),
    ev({ type: "content_block_stop", index }),
  ];
}

/** `jsonChunks` are concatenated by the SDK into the tool input, like input_json_delta on the wire. */
export function toolUseBlock(index: number, id: string, name: string, jsonChunks: string[]): CassetteStep[] {
  return [
    ev({ type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } }),
    ...jsonChunks.map((partial_json) =>
      ev({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } }),
    ),
    ev({ type: "content_block_stop", index }),
  ];
}

/** The boundary block of a fallback hop. Sent raw: it has no deltas. */
export function fallbackBlock(index: number, from: string, to: string): CassetteStep[] {
  const content_block = { type: "fallback", from: { model: from }, to: { model: to }, trigger: null };
  return [
    {
      kind: "raw",
      event: "content_block_start",
      data: { type: "content_block_start", index, content_block },
    },
    ev({ type: "content_block_stop", index }),
  ];
}

export function messageEnd(
  stop_reason: BetaStopReason,
  output: number,
  stop_details: BetaRefusalStopDetails | null = null,
): CassetteStep[] {
  const usage: BetaMessageDeltaUsage = {
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    fallback_credit: null,
    input_tokens: null,
    iterations: null,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
  };
  return [
    ev({
      type: "message_delta",
      context_management: null,
      delta: { container: null, stop_details, stop_reason, stop_sequence: null },
      usage,
    }),
    ev({ type: "message_stop" }),
  ];
}

export const delay = (ms: number): CassetteStep => ({ kind: "delay", ms });

/** Split a JSON value into uneven fragments, the way input_json_delta arrives. */
export function chunkJson(value: unknown, size = 7): string[] {
  const s = JSON.stringify(value);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** One response: message_start, the given blocks, message_delta + message_stop. */
export function response(
  id: string,
  blocks: CassetteStep[][],
  stop: BetaStopReason,
  opts: { usage?: UsageSpec; output?: number; model?: string; details?: BetaRefusalStopDetails } = {},
): CassetteResponse {
  return {
    steps: [
      messageStart(id, opts.usage, opts.model),
      ...blocks.flat(),
      ...messageEnd(stop, opts.output ?? 20, opts.details ?? null),
    ],
  };
}
