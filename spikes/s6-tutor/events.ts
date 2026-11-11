// App-level SSE protocol between the Oak server and the browser tutor panel.
// These are NOT Anthropic stream events; the relay translates.
import type { BetaStopReason } from '@anthropic-ai/sdk/resources/beta/messages/messages';

export type ToolName =
  | 'compare_haps'
  | 'evaluate_strudel'
  | 'get_learner_progress'
  | 'get_lesson_context'
  | 'propose_code';

export interface UsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheCreation5mInputTokens: number;
  costUsd: number;
  /** Model ids that actually produced output (more than one if a fallback served a turn). */
  servedBy: string[];
}

export type TutorErrorKind =
  | 'rate_limit'
  | 'overloaded'
  | 'auth'
  | 'bad_request'
  | 'network'
  | 'refusal'
  | 'max_tokens'
  | 'iteration_limit'
  | 'aborted'
  | 'internal';

export type TutorEvent =
  | { type: 'text'; data: { delta: string } }
  | { type: 'thinking'; data: { delta: string } }
  | { type: 'tool_start'; data: { toolUseId: string; name: string } }
  | { type: 'tool_result'; data: { toolUseId: string; name: string; ok: boolean; summary: string } }
  | { type: 'code_card'; data: { toolUseId: string; title: string; code: string; explanation: string; applyAllowed: boolean } }
  | { type: 'done'; data: { stopReason: BetaStopReason | null; iterations: number; usage: UsageSummary } }
  | { type: 'error'; data: { kind: TutorErrorKind; message: string; retryAfterSec?: number; usage?: UsageSummary } };

export function encodeSse(ev: TutorEvent): string {
  // JSON.stringify never emits raw newlines, so one data: line is always enough.
  return `event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

export interface ParsedSse {
  event: string;
  data: unknown;
}

/** Incremental SSE parser for tests and the browser client. Returns comments separately. */
export class SseParser {
  #buf = '';
  comments: string[] = [];
  push(chunk: string): ParsedSse[] {
    this.#buf += chunk;
    const out: ParsedSse[] = [];
    for (;;) {
      const i = this.#buf.indexOf('\n\n');
      if (i < 0) break;
      const frame = this.#buf.slice(0, i);
      this.#buf = this.#buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) this.comments.push(line.slice(1).trim());
        else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) out.push({ event, data: JSON.parse(data.join('\n')) });
    }
    return out;
  }
}
