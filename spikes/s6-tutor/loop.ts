// Manual streaming tool loop. One call = one learner turn (possibly several API requests).
//
// Invariants:
//  - `conversation` is append-only; assistant content is appended VERBATIM (thinking blocks,
//    signatures, tool_use, fallback blocks) so preserved thinking and the cache prefix stay valid.
//  - All tool_result blocks for one assistant message go back in ONE user message.
//  - A refused / truncated-with-tools / aborted / errored tail turn is NOT appended, so a retry is
//    a clean re-send and nothing earlier in the history ever changes.
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { TutorClient, TutorStream } from './client.ts';
import type { TutorErrorKind, TutorEvent, UsageSummary } from './events.ts';
import { addUsage, emptyUsage } from './pricing.ts';
import { buildRequest, type Prefix, type RouteCfg } from './request.ts';
import { executeTool, type ToolCtx } from './tools.ts';

export interface TurnArgs {
  client: TutorClient;
  prefix: Prefix;
  route: RouteCfg;
  /** Append-only. The caller has already appended the new user (+ system context) messages. */
  conversation: BetaMessageParam[];
  toolCtx: ToolCtx;
  signal: AbortSignal;
}

function errorEvent(kind: TutorErrorKind, message: string, usage: UsageSummary, retryAfterSec?: number): TutorEvent {
  const data: Extract<TutorEvent, { type: 'error' }>['data'] = { kind, message, usage };
  if (retryAfterSec !== undefined) data.retryAfterSec = retryAfterSec;
  return { type: 'error', data };
}

/** Most specific first. Never string-match messages. */
export function classifyError(e: unknown): { kind: TutorErrorKind; message: string; retryAfterSec?: number } {
  if (e instanceof Anthropic.APIUserAbortError) return { kind: 'aborted', message: 'request aborted' };
  if (e instanceof Anthropic.RateLimitError) {
    const ra = Number(e.headers?.get('retry-after'));
    const out: { kind: TutorErrorKind; message: string; retryAfterSec?: number } = { kind: 'rate_limit', message: 'rate limited' };
    if (Number.isFinite(ra) && ra > 0) out.retryAfterSec = ra;
    return out;
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { kind: 'auth', message: 'API key missing or invalid' };
  if (e instanceof Anthropic.BadRequestError) return { kind: 'bad_request', message: e.errorCode ?? e.message };
  if (e instanceof Anthropic.InternalServerError) return { kind: 'overloaded', message: `upstream ${e.status}` };
  if (e instanceof Anthropic.APIConnectionError) return { kind: 'network', message: 'cannot reach the API' };
  if (e instanceof Anthropic.APIError) {
    // Mid-stream errors (HTTP 200 then an `error` SSE event) arrive as a bare APIError with status undefined.
    if (e.type === 'overloaded_error') return { kind: 'overloaded', message: 'upstream overloaded' };
    if (e.type === 'rate_limit_error') return { kind: 'rate_limit', message: 'rate limited' };
    return { kind: 'internal', message: e.type ?? 'api error' };
  }
  if (e instanceof Error && e.name === 'AbortError') return { kind: 'aborted', message: 'request aborted' };
  // A bare AnthropicError (not an APIError) is a client-side stream/protocol failure: tool input the
  // SDK's tolerant parser could not parse at all, or a stream that ended without a message.
  // Identified by class, never by message text. Retryable from the UI; nothing was appended.
  if (e instanceof Anthropic.AnthropicError) return { kind: 'internal', message: 'stream_protocol_error' };
  return { kind: 'internal', message: e instanceof Error ? e.message : String(e) };
}

export async function* runTurn(args: TurnArgs): AsyncGenerator<TutorEvent> {
  const { client, prefix, route, conversation, toolCtx, signal } = args;
  let usage = emptyUsage();

  for (let iter = 1; iter <= route.maxIterations; iter++) {
    if (signal.aborted) {
      yield errorEvent('aborted', 'request aborted', usage);
      return;
    }
    let stream: TutorStream | undefined;
    let msg: BetaMessage;
    try {
      stream = client.stream(buildRequest(prefix, conversation, route), { signal });
      // Tool-use blocks by content index, so tool_start fires as soon as the block opens.
      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          if (ev.content_block.type === 'tool_use') {
            yield { type: 'tool_start', data: { toolUseId: ev.content_block.id, name: ev.content_block.name } };
          }
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') {
            if (ev.delta.text) yield { type: 'text', data: { delta: ev.delta.text } };
          } else if (ev.delta.type === 'thinking_delta') {
            // Non-empty only with thinking.display 'summarized' (default on Opus 5.5 is 'omitted').
            if (ev.delta.thinking) yield { type: 'thinking', data: { delta: ev.delta.thinking } };
          }
        }
      }
      msg = await stream.finalMessage();
    } catch (e) {
      stream?.abort();
      const c = classifyError(signal.aborted ? new Anthropic.APIUserAbortError() : e);
      yield errorEvent(c.kind, c.message, usage, c.retryAfterSec);
      return; // nothing appended for this request
    }

    usage = addUsage(usage, msg.usage, msg.model);

    // Check stop_reason BEFORE touching content or running tools.
    if (msg.stop_reason === 'refusal') {
      // With fallbacks:"default" this means the whole chain declined. Tail turn is not appended.
      yield errorEvent('refusal', msg.stop_details?.category ?? 'refused', usage);
      return;
    }

    const uses = msg.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');

    if (msg.stop_reason === 'max_tokens' || msg.stop_reason === 'model_context_window_exceeded') {
      if (uses.length > 0) {
        // A truncated tool_use has incomplete input; never execute it, never append it.
        yield errorEvent('max_tokens', 'response was cut off mid tool call', usage);
        return;
      }
      conversation.push({ role: 'assistant', content: msg.content });
      yield { type: 'done', data: { stopReason: msg.stop_reason, iterations: iter, usage } };
      return;
    }

    // Verbatim: the response blocks are valid request blocks.
    conversation.push({ role: 'assistant', content: msg.content });

    if (msg.stop_reason === 'pause_turn') {
      // Server-side loop paused (only with server tools). Re-send as-is; do NOT add a user message.
      continue;
    }

    if (msg.stop_reason !== 'tool_use' || uses.length === 0) {
      // end_turn, stop_sequence, compaction, null
      yield { type: 'done', data: { stopReason: msg.stop_reason, iterations: iter, usage } };
      return;
    }

    const outcomes = await Promise.all(uses.map((u) => executeTool(u, toolCtx, signal)));
    for (const o of outcomes) yield* o.events;
    // ONE user message carrying every tool_result, in tool_use order.
    conversation.push({ role: 'user', content: outcomes.map((o) => o.block) });
  }

  yield errorEvent('iteration_limit', `stopped after ${route.maxIterations} model calls`, usage);
}
