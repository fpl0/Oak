// Compile-time facts about @anthropic-ai/sdk 1.8.0. This file has no runtime purpose: every line
// is an assertion checked by `tsc --noEmit -p spikes/s6-tutor/tsconfig.json`.
// `@ts-expect-error` lines are NEGATIVE assertions: tsc fails if they ever start compiling.
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta';
import type {
  BetaCacheControlEphemeral,
  BetaContentBlock,
  BetaContentBlockParam,
  BetaFallbacksParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaOutputConfig,
  BetaRawMessageStreamEvent,
  BetaRefusalStopDetails,
  BetaStopReason,
  BetaSystemMessageParam,
  BetaThinkingConfigAdaptive,
  BetaTool,
  BetaUsage,
  MessageCreateParamsBase,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { MessageCreateParamsBase as StableParams, StopReason, ThinkingConfigAdaptive } from '@anthropic-ai/sdk/resources/messages/messages';
import type { TutorStream } from './client.ts';

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const yes = <T extends true>(): T => true as T;

// --- stream(params, options) / finalMessage() ------------------------------------------------
declare const client: Anthropic;
declare const params: BetaMessageStreamParams;
const stream = client.beta.messages.stream(params, { signal: new AbortController().signal, timeout: 600_000, maxRetries: 2, headers: { 'x-test': '1' } });
yes<Eq<typeof stream, BetaMessageStream<null>>>();
yes<Eq<BetaMessageStreamParams, MessageCreateParamsBase>>(); // stream() takes the same params as create()
const final: Promise<BetaMessage> = stream.finalMessage(); // ParsedBetaMessage<null> is assignable to BetaMessage
void final;
const asSeam: TutorStream = stream; // the real stream satisfies the loop's injectable interface
void asSeam;
async function iterate(): Promise<void> {
  for await (const ev of stream) {
    yes<Eq<typeof ev, BetaRawMessageStreamEvent>>();
    yes<Eq<(typeof ev)['type'], 'message_start' | 'message_delta' | 'message_stop' | 'content_block_start' | 'content_block_delta' | 'content_block_stop'>>();
  }
  stream.on('text', (delta: string, snapshot: string) => void [delta, snapshot]);
  stream.on('thinking', (delta: string, snapshot: string) => void [delta, snapshot]);
  stream.on('inputJson', (partialJson: string, jsonSnapshot: unknown) => void [partialJson, jsonSnapshot]);
  stream.abort();
  const rid: string | null | undefined = stream.request_id;
  void rid;
}
void iterate;

// --- betas / fallbacks ------------------------------------------------------------------------
const beta: AnthropicBeta = 'server-side-fallback-2026-07-01'; // a named member of the union (beta.d.ts:75)
void beta;
yes<Eq<BetaFallbacksParam, Array<import('@anthropic-ai/sdk/resources/beta/messages/messages').BetaFallbackParam> | 'default'>>();
yes<Eq<NonNullable<BetaMessageStreamParams['fallbacks']>, BetaFallbacksParam>>();
const fb1: BetaFallbacksParam = 'default';
const fb2: BetaFallbacksParam = [{ model: 'claude-opus-5' }];
// @ts-expect-error only the literal "default" or an array of entries
const fb3: BetaFallbacksParam = 'auto';
void [fb1, fb2, fb3];
// `fallbacks` exists ONLY on the beta params; the stable client.messages surface does not have it.
yes<Eq<'fallbacks' extends keyof StableParams ? true : false, false>>();
yes<Eq<'betas' extends keyof StableParams ? true : false, false>>();

// --- thinking / effort ------------------------------------------------------------------------
yes<Eq<NonNullable<BetaThinkingConfigAdaptive['display']>, 'summarized' | 'omitted' | 'updates'>>();
yes<Eq<NonNullable<ThinkingConfigAdaptive['display']>, 'summarized' | 'omitted'>>(); // stable has no 'updates'
yes<Eq<NonNullable<BetaOutputConfig['effort']>, 'low' | 'medium' | 'high' | 'xhigh' | 'max'>>();
// @ts-expect-error budget_tokens is not part of adaptive thinking
const badThinking: BetaThinkingConfigAdaptive = { type: 'adaptive', budget_tokens: 1024 };
void badThinking;
// @ts-expect-error effort lives in output_config, not at the top level
const badEffort: BetaMessageStreamParams = { ...params, effort: 'medium' };
void badEffort;
// Sampling params are gone from the 1.x types entirely.
yes<Eq<'temperature' extends keyof BetaMessageStreamParams ? true : false, false>>();
yes<Eq<'top_p' extends keyof BetaMessageStreamParams ? true : false, false>>();
yes<Eq<'top_k' extends keyof BetaMessageStreamParams ? true : false, false>>();

// --- tools: strict + eager_input_streaming ------------------------------------------------------
yes<Eq<BetaTool['strict'], boolean | undefined>>();
yes<Eq<BetaTool['eager_input_streaming'], boolean | null | undefined>>();
const tool: BetaTool = { name: 't', strict: true, eager_input_streaming: true, input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } };
void tool;
// @ts-expect-error input_schema.type must be the literal 'object'
const badTool: BetaTool = { name: 't', input_schema: { type: 'string' } };
void badTool;

// --- cache_control ------------------------------------------------------------------------------
yes<Eq<BetaCacheControlEphemeral, { type: 'ephemeral'; ttl?: '5m' | '1h' }>>();
// @ts-expect-error only 5m and 1h exist
const badTtl: BetaCacheControlEphemeral = { type: 'ephemeral', ttl: '24h' };
void badTtl;
yes<Eq<NonNullable<BetaMessageStreamParams['system']>, string | Array<import('@anthropic-ai/sdk/resources/beta/messages/messages').BetaTextBlockParam>>>();
yes<Eq<NonNullable<BetaMessageStreamParams['cache_control']>, BetaCacheControlEphemeral>>(); // top-level automatic caching

// --- mid-conversation system messages --------------------------------------------------------------
yes<Eq<BetaMessageParam['role'], 'user' | 'assistant' | 'system'>>();
const sys: BetaSystemMessageParam = { role: 'system', content: 'context' };
const sysEffort: BetaSystemMessageParam = { role: 'system', content: [], output_config: { effort: 'low' } };
const sysClear: BetaSystemMessageParam = { role: 'system', content: 'reminder', clear_at: 'next_user_message' };
void [sys, sysEffort, sysClear];

// --- response: stop reasons, stop_details, usage ----------------------------------------------------
yes<Eq<BetaStopReason, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'compaction' | 'refusal' | 'model_context_window_exceeded'>>();
yes<Eq<StopReason, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | 'model_context_window_exceeded'>>();
yes<Eq<BetaMessage['stop_reason'], BetaStopReason | null>>();
yes<Eq<BetaMessage['stop_details'], BetaRefusalStopDetails | null>>();
yes<Eq<BetaRefusalStopDetails['category'], 'cyber' | 'bio' | 'frontier_llm' | 'reasoning_extraction' | 'general_harms' | null>>();
yes<Eq<BetaRefusalStopDetails['type'], 'refusal'>>();
yes<Eq<BetaUsage['input_tokens'], number>>();
yes<Eq<BetaUsage['output_tokens'], number>>();
yes<Eq<BetaUsage['cache_read_input_tokens'], number | null>>(); // nullable: always `?? 0`
yes<Eq<BetaUsage['cache_creation_input_tokens'], number | null>>();
yes<Eq<BetaUsage['cache_creation'], { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number } | null>>();
yes<Eq<NonNullable<BetaUsage['iterations']>[number]['type'], 'message' | 'compaction' | 'advisor_message' | 'fallback_message'>>();

// Response content blocks are valid request content blocks (append verbatim, no mapping).
declare const blocks: BetaContentBlock[];
const echoed: BetaContentBlockParam[] = blocks;
void echoed;

// --- errors -----------------------------------------------------------------------------------------
declare const err: unknown;
if (err instanceof Anthropic.RateLimitError) yes<Eq<typeof err.status, 429>>();
if (err instanceof Anthropic.BadRequestError) yes<Eq<typeof err.status, 400>>();
if (err instanceof Anthropic.AuthenticationError) yes<Eq<typeof err.status, 401>>();
if (err instanceof Anthropic.OverloadedError) yes<Eq<typeof err.status, 529>>();
if (err instanceof Anthropic.APIError) {
  yes<Eq<typeof err.requestID, string | null | undefined>>();
  yes<Eq<typeof err.errorCode, string | null>>();
}
if (err instanceof Anthropic.APIUserAbortError) yes<Eq<typeof err.status, undefined>>();
const classes = [Anthropic.AnthropicError, Anthropic.APIError, Anthropic.APIConnectionError, Anthropic.APIConnectionTimeoutError, Anthropic.APIUserAbortError, Anthropic.BadRequestError, Anthropic.AuthenticationError, Anthropic.PermissionDeniedError, Anthropic.NotFoundError, Anthropic.ConflictError, Anthropic.UnprocessableEntityError, Anthropic.RateLimitError, Anthropic.InternalServerError, Anthropic.ServiceUnavailableError, Anthropic.OverloadedError];
void classes;
