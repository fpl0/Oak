// App-level SSE protocol between the Oak server and the tutor panel (contracts §10.1).
// These are not Anthropic stream events and not Claude CLI stream-json: each backend translates
// into this one shape, so the panel never knows which backend answered.
//
// This file has no server-only imports: the browser client uses SseParser and the types as they are.
import type { Rung } from "./domain.ts";
import type { TutorErrorKind } from "./errors.ts";
import type { ReviewKind, ReviewValue } from "./reviews.ts";
import type { ApplyState, BackendId, Lane, StopReason, ThreadKind } from "./types.ts";

/** Token accounting for one turn. Works for both backends: tokens always, dollars only for the API. */
export interface UsageSummary {
  backend: BackendId;
  /** Model calls made (API requests, or model iterations reported by the CLI). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheCreation5mInputTokens: number;
  /** List-price ESTIMATE for the API backend (pricing.ts). `null` for the CLI: a subscription is not billed per token. */
  costUsd: number | null;
  /** True for the CLI backend: "included in your Claude plan". */
  includedInPlan: boolean;
  /** Model IDs that produced output (more than one when a fallback served part of a turn). */
  servedBy: string[];
}

export interface CardData {
  cardId: string;
  toolUseId: string;
  kind: "hint" | "fix" | "variation" | "example" | "next_step";
  title: string;
  code: string;
  explanation: string;
  bars: number;
  /** Decided by the server from the subject (contracts §10.7); the model cannot ask for it. */
  apply: ApplyState;
  /** `apply === "applicable"`, spelled out so the UI needs no enum knowledge. */
  applyAllowed: boolean;
  /** Tool IDs the card uses that are still locked: the card is badged "preview: unlocks at ...". */
  lockedTools: string[];
}

export type TutorEvent =
  | {
      type: "meta";
      data: {
        conversationId: string;
        kind: ThreadKind;
        lane: Lane;
        backend: BackendId;
        model: string;
        /** The step's rung after any advance this request caused; `null` when there is no graded step. */
        rung: Rung | null;
        /** Whether `[[reveal]]` renders as the "Reveal (hint 4)" button in this turn. */
        revealAllowed: boolean;
      };
    }
  | { type: "status"; data: { phase: "thinking" | "tool" | "writing"; label: string } }
  | { type: "text"; data: { delta: string } }
  | { type: "thinking"; data: { delta: string } }
  | { type: "tool_start"; data: { toolUseId: string; name: string } }
  | { type: "tool_input"; data: { toolUseId: string; partialJson: string } }
  | { type: "tool_result"; data: { toolUseId: string; name: string; ok: boolean; summary: string } }
  | { type: "card"; data: CardData }
  | { type: "review"; data: { reviewKind: ReviewKind; review: ReviewValue } }
  | { type: "usage"; data: UsageSummary }
  | {
      type: "done";
      data: { stopReason: StopReason; backend: BackendId; iterations: number; usage: UsageSummary };
    }
  | {
      type: "error";
      data: { kind: TutorErrorKind; message: string; retryAfterSec?: number; usage?: UsageSummary };
    };

export type TutorEventType = TutorEvent["type"];

export const TUTOR_EVENT_TYPES = [
  "meta",
  "status",
  "text",
  "thinking",
  "tool_start",
  "tool_input",
  "tool_result",
  "card",
  "review",
  "usage",
  "done",
  "error",
] as const satisfies readonly TutorEventType[];

/** Sent as an SSE comment so intermediaries and Bun's idle timer see traffic. */
export const SSE_PING = ": ping\n\n";
/** Under Bun's 10 s default idle timeout, so the heartbeat alone keeps a stream alive (spike S6). */
export const SSE_PING_INTERVAL_MS = 5_000;

export function encodeSse(ev: TutorEvent): string {
  // JSON.stringify never emits a raw newline, so one data: line is always enough.
  return `event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

export interface ParsedSse {
  event: string;
  data: unknown;
}

/**
 * Incremental SSE parser for tests and the browser client. Feed it decoded text chunks of any
 * size. A stream that ends without a `done` or `error` event must be treated as a network error
 * by the caller (that is what an idle drop looks like).
 */
export class SseParser {
  #buf = "";
  readonly comments: string[] = [];

  push(chunk: string): ParsedSse[] {
    this.#buf += chunk.replace(/\r\n?/g, "\n");
    const out: ParsedSse[] = [];
    for (;;) {
      const i = this.#buf.indexOf("\n\n");
      if (i < 0) break;
      const frame = this.#buf.slice(0, i);
      this.#buf = this.#buf.slice(i + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith(":")) this.comments.push(line.slice(1).trim());
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length === 0) continue;
      try {
        out.push({ event, data: JSON.parse(data.join("\n")) });
      } catch {
        // A frame that is not JSON is not ours (for example a proxy's own error frame). Surface it
        // as text so the client can show "network" instead of crashing on it.
        out.push({ event, data: data.join("\n") });
      }
    }
    return out;
  }

  /** Bytes received after the last complete frame. Non-empty at end of stream means a cut-off frame. */
  get pending(): string {
    return this.#buf;
  }
}

/** Narrow a parsed frame to a TutorEvent, or `null` if it is not one of ours. */
export function asTutorEvent(frame: ParsedSse): TutorEvent | null {
  if (!(TUTOR_EVENT_TYPES as readonly string[]).includes(frame.event)) return null;
  if (typeof frame.data !== "object" || frame.data === null) return null;
  return { type: frame.event, data: frame.data } as TutorEvent;
}
