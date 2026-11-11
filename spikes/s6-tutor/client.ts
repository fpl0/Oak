// The injectable seam between the agent loop and the Anthropic SDK.
// The loop only needs: start a stream, iterate raw events, get the final message, abort.
// `client.beta.messages.stream(...)` returns a BetaMessageStream, which satisfies TutorStream
// structurally, so the production adapter is a one-liner and tests can substitute a fake.
import type Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

export interface TutorStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<BetaMessage>;
  abort(): void;
  /** Present on the real SDK stream once connected. */
  readonly request_id?: string | null | undefined;
}

export interface TutorClient {
  stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): TutorStream;
}

/** Production adapter. `anthropic` is constructed once at server start: new Anthropic({ maxRetries: 2 }). */
export function sdkClient(anthropic: Anthropic): TutorClient {
  return {
    stream(params, options) {
      return anthropic.beta.messages.stream(params, options);
    },
  };
}
