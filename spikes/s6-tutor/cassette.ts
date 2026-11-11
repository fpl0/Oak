// "Cassettes": scripted Anthropic stream events, replayable through either fake client.
// A cassette is a list of responses; response N answers API request N of a test.
import type {
  BetaMessage,
  BetaMessageDeltaUsage,
  BetaRawMessageStreamEvent,
  BetaRefusalStopDetails,
  BetaStopReason,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

export type CassetteStep =
  | { kind: 'event'; event: BetaRawMessageStreamEvent }
  | { kind: 'delay'; ms: number }
  /** A mid-stream `event: error` frame (HTTP 200 already sent), e.g. overloaded_error. */
  | { kind: 'error'; errorType: 'overloaded_error' | 'api_error' | 'rate_limit_error'; message: string };

export interface CassetteResponse {
  /** HTTP-level failure instead of a stream (status + error body), e.g. 429/401/400. */
  httpError?: { status: number; type: string; message: string; headers?: Record<string, string> };
  steps: CassetteStep[];
}

export interface Cassette {
  name: string;
  responses: CassetteResponse[];
}

export interface UsageSpec {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite1h?: number;
  cacheWrite5m?: number;
}

function usage(u: UsageSpec, output: number): BetaUsage {
  const w1 = u.cacheWrite1h ?? 0;
  const w5 = u.cacheWrite5m ?? 0;
  return {
    cache_creation: { ephemeral_1h_input_tokens: w1, ephemeral_5m_input_tokens: w5 },
    cache_creation_input_tokens: w1 + w5,
    cache_read_input_tokens: u.cacheRead ?? 0,
    fallback_credit: null,
    inference_geo: null,
    input_tokens: u.input ?? 10,
    iterations: null,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
    speed: 'standard',
  };
}

const ev = (event: BetaRawMessageStreamEvent): CassetteStep => ({ kind: 'event', event });

export function messageStart(id: string, u: UsageSpec = {}, model = 'claude-opus-5-5'): CassetteStep {
  const message: BetaMessage = {
    id,
    container: null,
    content: [],
    context_management: null,
    diagnostics: null,
    model,
    role: 'assistant',
    stop_details: null,
    stop_reason: null,
    stop_sequence: null,
    type: 'message',
    usage: usage(u, 1),
  };
  return ev({ type: 'message_start', message });
}

export function thinkingBlock(index: number, chunks: string[], signature = 'sig-opaque=='): CassetteStep[] {
  return [
    ev({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } }),
    ...chunks.map((thinking) => ev({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking, estimated_tokens: null } })),
    ev({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } }),
    ev({ type: 'content_block_stop', index }),
  ];
}

export function textBlock(index: number, chunks: string[]): CassetteStep[] {
  return [
    ev({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } }),
    ...chunks.map((text) => ev({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })),
    ev({ type: 'content_block_stop', index }),
  ];
}

/** `jsonChunks` are concatenated by the client into the tool input, exactly like input_json_delta on the wire. */
export function toolUseBlock(index: number, id: string, name: string, jsonChunks: string[]): CassetteStep[] {
  return [
    ev({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }),
    ...jsonChunks.map((partial_json) => ev({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } })),
    ev({ type: 'content_block_stop', index }),
  ];
}

export function messageEnd(stop_reason: BetaStopReason, output: number, stop_details: BetaRefusalStopDetails | null = null): CassetteStep[] {
  const u: BetaMessageDeltaUsage = {
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
    ev({ type: 'message_delta', context_management: null, delta: { container: null, stop_details, stop_reason, stop_sequence: null }, usage: u }),
    ev({ type: 'message_stop' }),
  ];
}

export const delay = (ms: number): CassetteStep => ({ kind: 'delay', ms });

/** Split a JSON string into uneven fragments, the way input_json_delta arrives. */
export function chunkJson(value: unknown, size = 7): string[] {
  const s = JSON.stringify(value);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Scripted conversations
// ---------------------------------------------------------------------------------------------

/**
 * Turn 1: thinking + text + TWO parallel tool calls (get_lesson_context, compare_haps).
 * Turn 2: text + propose_code (eager-streamed input).
 * Turn 3: final text, end_turn.
 * The scripted "model" never writes the solution itself, so any solution text seen downstream
 * can only have come from Oak's own tool results / injected context.
 */
export function hintCassette(): Cassette {
  return {
    name: 'hint-with-tools',
    responses: [
      {
        steps: [
          messageStart('msg_01', { input: 42, cacheWrite1h: 6000 }),
          ...thinkingBlock(0, ['The learner asks why it sounds ', 'unfinished. Check the lesson first.']),
          ...textBlock(1, ['Let me look at ', 'what you wrote.']),
          ...toolUseBlock(2, 'toolu_01', 'get_lesson_context', chunkJson({ lesson_id: 'u03.04' })),
          ...toolUseBlock(3, 'toolu_02', 'compare_haps', chunkJson({ learner_code: 'n("0 2 4 6").scale("D:dorian")', target_id: 'u03.04#arpeggio-1358' })),
          ...messageEnd('tool_use', 90),
        ],
      },
      {
        steps: [
          messageStart('msg_02', { input: 30, cacheRead: 6000, cacheWrite5m: 400 }),
          ...textBlock(0, ['Here is the same idea ', 'in a different key.']),
          ...toolUseBlock(1, 'toolu_03', 'propose_code', chunkJson({ title: 'Octave in G major', code: 'n("0 1 2 3").scale("G:major")', explanation: 'Count the steps from zero.' }, 5)),
          ...messageEnd('tool_use', 70),
        ],
      },
      {
        steps: [
          messageStart('msg_03', { input: 20, cacheRead: 6400, cacheWrite5m: 150 }),
          ...textBlock(0, ['Where does your last note land ', 'compared with the first one?']),
          ...messageEnd('end_turn', 25),
        ],
      },
    ],
  };
}

export function plainCassette(text = 'Hello from the tutor.'): Cassette {
  return { name: 'plain', responses: [{ steps: [messageStart('msg_p1'), ...textBlock(0, [text]), ...messageEnd('end_turn', 6)] }] };
}

export function refusalCassette(): Cassette {
  return {
    name: 'refusal',
    responses: [
      {
        steps: [
          messageStart('msg_r1'),
          ...messageEnd('refusal', 1, {
            type: 'refusal',
            category: 'cyber',
            explanation: 'declined',
            fallback_credit_token: null,
            fallback_has_prefill_claim: null,
            recommended_model: null,
          }),
        ],
      },
    ],
  };
}

export function maxTokensMidToolCassette(): Cassette {
  return {
    name: 'max-tokens-mid-tool',
    responses: [
      {
        steps: [
          messageStart('msg_m1'),
          ...textBlock(0, ['Let me draft a card.']),
          // Truncated JSON: the block closes but the input never completed.
          ...toolUseBlock(1, 'toolu_m1', 'propose_code', ['{"title":"Half a ca', 'rd","code":"n(\\"0 1']),
          ...messageEnd('max_tokens', 16000),
        ],
      },
    ],
  };
}

export function pauseTurnCassette(): Cassette {
  return {
    name: 'pause-turn',
    responses: [
      { steps: [messageStart('msg_pt1'), ...textBlock(0, ['Working on it']), ...messageEnd('pause_turn', 5)] },
      { steps: [messageStart('msg_pt2'), ...textBlock(0, [' ... done.']), ...messageEnd('end_turn', 5)] },
    ],
  };
}

/** Every response asks for another tool call: exercises the iteration cap. */
export function runawayCassette(n: number): Cassette {
  return {
    name: 'runaway',
    responses: Array.from({ length: n }, (_, i) => ({
      steps: [messageStart(`msg_run${i}`), ...toolUseBlock(0, `toolu_run${i}`, 'get_learner_progress', ['{}']), ...messageEnd('tool_use', 5)],
    })),
  };
}

export function midStreamOverloadCassette(): Cassette {
  return {
    name: 'mid-stream-overload',
    responses: [{ steps: [messageStart('msg_o1'), ...textBlock(0, ['Partial ']).slice(0, 2), { kind: 'error', errorType: 'overloaded_error', message: 'Overloaded' }] }],
  };
}

export function rateLimitCassette(): Cassette {
  return { name: 'rate-limit', responses: [{ httpError: { status: 429, type: 'rate_limit_error', message: 'slow down', headers: { 'retry-after': '17' } }, steps: [] }] };
}

/** One text delta, then a long silence, then the rest. Used for the idle-timeout and abort proofs. */
export function silentGapCassette(gapMs: number): Cassette {
  return {
    name: `silent-gap-${gapMs}`,
    responses: [{ steps: [messageStart('msg_g1'), ...textBlock(0, ['before-gap']).slice(0, 2), delay(gapMs), ...textBlock(0, ['after-gap']).slice(1), ...messageEnd('end_turn', 4)] }],
  };
}

/** Bad input for a strict tool (wrong type + extra key): executor must return is_error, loop continues. */
export function invalidToolInputCassette(): Cassette {
  return {
    name: 'invalid-tool-input',
    responses: [
      { steps: [messageStart('msg_i1'), ...toolUseBlock(0, 'toolu_i1', 'evaluate_strudel', chunkJson({ code: 'n("0 1")', cycles: 'two', extra: true })), ...messageEnd('tool_use', 9)] },
      { steps: [messageStart('msg_i2'), ...textBlock(0, ['Sorry, retrying differently.']), ...messageEnd('end_turn', 9)] },
    ],
  };
}
