// Two fakes that replay cassettes:
//
//  1. FakeTutorClient   – pure in-memory implementation of the TutorClient seam (no SDK code runs).
//  2. sdkCassetteClient – the REAL @anthropic-ai/sdk client with an injected `fetch` that serves the
//                         cassette as wire-format SSE. Exercises the SDK's own request serialisation
//                         (beta header, body) and stream accumulation. Never touches the network.
//
// Both record every request so tests can assert on exactly what would have been sent.
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Cassette, CassetteResponse } from './cassette.ts';
import { sdkClient, type TutorClient, type TutorStream } from './client.ts';

export interface RecordedRequest {
  /** Deep copy taken at call time (the conversation array is mutated afterwards). */
  params: BetaMessageStreamParams;
  /** JSON exactly as serialised at call time. */
  json: string;
  aborted: boolean;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Anthropic.APIUserAbortError());
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Anthropic.APIUserAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function httpError(e: NonNullable<CassetteResponse['httpError']>): Error {
  const body = { type: 'error', error: { type: e.type, message: e.message } };
  return Anthropic.APIError.generate(e.status, body, e.message, new Headers(e.headers ?? {}));
}

class FakeStream implements TutorStream {
  #controller = new AbortController();
  #final: Promise<BetaMessage>;
  #resolve!: (m: BetaMessage) => void;
  #reject!: (e: unknown) => void;
  #started = false;
  #finished = false;
  request_id = 'req_fake';

  constructor(
    private readonly response: CassetteResponse,
    private readonly record: RecordedRequest,
    outer?: AbortSignal,
  ) {
    this.#final = new Promise((res, rej) => {
      this.#resolve = res;
      this.#reject = rej;
    });
    this.#final.catch(() => {}); // rejection is surfaced through the iterator; avoid unhandled-rejection noise
    if (outer) {
      if (outer.aborted) this.#controller.abort();
      else outer.addEventListener('abort', () => this.abort(), { once: true });
    }
  }

  abort(): void {
    // Only count it as an abort if the stream was still in flight (the handler also aborts on normal completion).
    if (!this.#finished) this.record.aborted = true;
    this.#controller.abort();
  }

  finalMessage(): Promise<BetaMessage> {
    if (!this.#started) void this.#drain();
    return this.#final;
  }

  async #drain(): Promise<void> {
    try {
      for await (const _ of this) {
        /* consume */
      }
    } catch {
      /* #final already rejected */
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<BetaRawMessageStreamEvent> {
    if (this.#started) throw new Error('FakeStream can only be iterated once');
    this.#started = true;
    const signal = this.#controller.signal;
    let snapshot: BetaMessage | undefined;
    const jsonBuf = new Map<number, string>();
    try {
      if (this.response.httpError) throw httpError(this.response.httpError);
      for (const step of this.response.steps) {
        if (signal.aborted) throw new Anthropic.APIUserAbortError();
        if (step.kind === 'delay') {
          await sleep(step.ms, signal);
          continue;
        }
        if (step.kind === 'error') {
          throw new Anthropic.APIError(undefined, { type: 'error', error: { type: step.errorType, message: step.message } }, undefined, new Headers(), step.errorType);
        }
        const event = structuredClone(step.event);
        switch (event.type) {
          case 'message_start':
            snapshot = event.message;
            break;
          case 'content_block_start':
            snapshot!.content.push(structuredClone(event.content_block) as BetaContentBlock);
            break;
          case 'content_block_delta': {
            const block = snapshot!.content[event.index]!;
            if (event.delta.type === 'text_delta' && block.type === 'text') block.text += event.delta.text;
            else if (event.delta.type === 'thinking_delta' && block.type === 'thinking') block.thinking += event.delta.thinking;
            else if (event.delta.type === 'signature_delta' && block.type === 'thinking') block.signature = event.delta.signature;
            else if (event.delta.type === 'input_json_delta') jsonBuf.set(event.index, (jsonBuf.get(event.index) ?? '') + event.delta.partial_json);
            break;
          }
          case 'content_block_stop': {
            const block = snapshot!.content[event.index]!;
            if (block.type === 'tool_use') {
              const buf = jsonBuf.get(event.index) ?? '';
              try {
                block.input = buf ? JSON.parse(buf) : {};
              } catch {
                // The real SDK uses a tolerant partial parser here and may hand back a silently
                // truncated object. Either way the executor's zod validation must reject it.
                block.input = { __truncated_json: buf };
              }
            }
            break;
          }
          case 'message_delta':
            snapshot!.stop_reason = event.delta.stop_reason;
            snapshot!.stop_sequence = event.delta.stop_sequence;
            snapshot!.stop_details = event.delta.stop_details;
            snapshot!.usage.output_tokens = event.usage.output_tokens;
            break;
          case 'message_stop':
            break;
        }
        // Yield to the event loop between events, like a network stream would.
        await Promise.resolve();
        yield event;
      }
      if (!snapshot) throw new Anthropic.AnthropicError('stream ended without producing a Message with role=assistant');
      this.#finished = true;
      this.#resolve(snapshot);
    } catch (e) {
      if (signal.aborted) this.record.aborted = true;
      this.#finished = true;
      this.#reject(e);
      throw e;
    }
  }
}

export class FakeTutorClient implements TutorClient {
  readonly requests: RecordedRequest[] = [];
  constructor(private readonly cassette: Cassette) {}

  stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): TutorStream {
    const json = JSON.stringify(params);
    const record: RecordedRequest = { params: JSON.parse(json) as BetaMessageStreamParams, json, aborted: false };
    const response = this.cassette.responses[this.requests.length];
    this.requests.push(record);
    if (!response) throw new Error(`cassette "${this.cassette.name}" has no response #${this.requests.length}`);
    return new FakeStream(response, record, options?.signal);
  }
}

// ---------------------------------------------------------------------------------------------
// Real SDK + fake fetch
// ---------------------------------------------------------------------------------------------

export interface WireRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  bodyText: string;
  aborted: boolean;
}

function sseBody(response: CassetteResponse, signal: AbortSignal | null | undefined, wire: WireRequest): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const inner = new AbortController();
  const onAbort = () => {
    wire.aborted = true;
    inner.abort();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const step of response.steps) {
          if (step.kind === 'delay') await sleep(step.ms, inner.signal);
          else if (step.kind === 'error') {
            controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: step.errorType, message: step.message } })}\n\n`));
          } else {
            controller.enqueue(enc.encode(`event: ${step.event.type}\ndata: ${JSON.stringify(step.event)}\n\n`));
            await Promise.resolve();
          }
        }
        controller.close();
      } catch (e) {
        controller.error(signal?.reason ?? e);
      }
    },
    cancel() {
      wire.aborted = true;
      inner.abort();
    },
  });
}

/** A real Anthropic client whose transport is the cassette. baseURL points at a closed port as a second safety net. */
export function sdkCassetteClient(cassette: Cassette): { client: TutorClient; anthropic: Anthropic; wire: WireRequest[] } {
  const wire: WireRequest[] = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    const rec: WireRequest = { url, method: init?.method ?? 'GET', headers, body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {}, bodyText, aborted: false };
    const response = cassette.responses[wire.length];
    wire.push(rec);
    if (!response) throw new Error(`cassette "${cassette.name}" has no response #${wire.length}`);
    if (response.httpError) {
      const e = response.httpError;
      return new Response(JSON.stringify({ type: 'error', error: { type: e.type, message: e.message } }), {
        status: e.status,
        headers: { 'content-type': 'application/json', 'request-id': 'req_cassette', ...(e.headers ?? {}) },
      });
    }
    return new Response(sseBody(response, init?.signal, rec), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_cassette' } });
  };
  const anthropic = new Anthropic({
    apiKey: 'cassette-not-a-real-key',
    baseURL: 'http://127.0.0.1:9', // discard port: if anything ever bypassed fakeFetch it would fail locally
    maxRetries: 0,
    fetch: fakeFetch,
  });
  return { client: sdkClient(anthropic), anthropic, wire };
}
