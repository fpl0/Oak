// What SDK 1.8.0 actually serialises for our request (captured by the fake fetch; no network).
import { describe, expect, test } from 'bun:test';
import type { BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { hintCassette, messageEnd, messageStart, textBlock, toolUseBlock } from './cassette.ts';
import { runCassette } from './harness.ts';

describe('SDK wire format (real @anthropic-ai/sdk 1.8.0, fake fetch)', () => {
  test('betas -> anthropic-beta header (not body); fallbacks:"default" in body; API version 2026-10-21; Bearer auth', async () => {
    const { h } = await runCassette('sdk+fake-fetch', hintCassette());
    expect(h.wire).toHaveLength(3);
    for (const w of h.wire) {
      expect(w.method).toBe('POST');
      expect(new URL(w.url).pathname).toBe('/v1/messages');
      expect(new URL(w.url).hostname).toBe('127.0.0.1'); // never api.anthropic.com in tests
      expect(w.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
      expect(w.headers['anthropic-version']).toBe('2026-10-21');
      expect(w.headers.authorization).toMatch(/^Bearer /);
      expect(w.headers['x-api-key']).toBeUndefined();
      expect(w.headers['x-stainless-helper-method']).toBe('stream');
      expect('betas' in w.body).toBe(false);
      expect(w.body.fallbacks).toBe('default');
      expect(w.body.stream).toBe(true);
      expect(w.body.model).toBe('claude-opus-5-5');
      expect(w.body.max_tokens).toBe(16000);
      expect(w.body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(w.body.output_config).toEqual({ effort: 'medium' });
      expect(Object.keys(w.body)).toEqual(['model', 'max_tokens', 'fallbacks', 'thinking', 'output_config', 'tool_choice', 'tools', 'system', 'cache_control', 'messages', 'stream']);
    }
    // mid-conversation system message goes out as-is, right after the user turn
    const m = h.wire[0]!.body.messages as { role: string; content: unknown }[];
    expect(m.map((x) => x.role)).toEqual(['user', 'system']);
    expect(typeof m[1]!.content).toBe('string');
    // thinking block is echoed back verbatim (signature intact) on the follow-up request
    const m2 = h.wire[1]!.body.messages as { role: string; content: { type: string; signature?: string }[] }[];
    expect(m2[2]!.content[0]).toMatchObject({ type: 'thinking', signature: 'sig-opaque==' });
  });

  test('truncated eager tool input: the SDK hands back a silently shortened object; zod rejects it', async () => {
    const cassette = {
      name: 'truncated-eager',
      responses: [
        { steps: [messageStart('m1'), ...toolUseBlock(0, 'toolu_t', 'propose_code', ['{"title":"Half a ca', 'rd","code":"n(\\"0 1']), ...messageEnd('tool_use', 5)] },
        { steps: [messageStart('m2'), ...textBlock(0, ['ok']), ...messageEnd('end_turn', 1)] },
      ],
    };
    const { events, conversation } = await runCassette('sdk+fake-fetch', cassette);
    const assistant = conversation[2]!.content as { type: string; input?: unknown }[];
    expect(assistant[0]!.input).toEqual({ title: 'Half a card' }); // no exception from the SDK
    expect(events.filter((e) => e.type === 'code_card')).toHaveLength(0);
    const block = (conversation[3]!.content as BetaToolResultBlockParam[])[0]!;
    expect(block.is_error).toBe(true);
    expect(JSON.parse(block.content as string).error).toBe('INVALID_JSON');
  });

  test('tool input the SDK cannot parse at all: AnthropicError from the stream -> error(internal), nothing appended, no tool run', async () => {
    const cassette = { name: 'garbage', responses: [{ steps: [messageStart('m1'), ...toolUseBlock(0, 'toolu_g', 'evaluate_strudel', ['not json at all']), ...messageEnd('tool_use', 5)] }] };
    const { events, conversation } = await runCassette('sdk+fake-fetch', cassette);
    expect(events.at(-1)).toMatchObject({ type: 'error', data: { kind: 'internal', message: 'stream_protocol_error' } });
    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(0);
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system']);
  });

  test('truncation can silently DROP a required field (cycles): still caught by validation', async () => {
    const cassette = {
      name: 'dropped-field',
      responses: [
        { steps: [messageStart('m1'), ...toolUseBlock(0, 'toolu_d', 'evaluate_strudel', ['{"code":"n(\\"0 1\\")","cycles":2']), ...messageEnd('tool_use', 5)] },
        { steps: [messageStart('m2'), ...textBlock(0, ['ok']), ...messageEnd('end_turn', 1)] },
      ],
    };
    const { conversation } = await runCassette('sdk+fake-fetch', cassette);
    expect((conversation[2]!.content as { input?: unknown }[])[0]!.input).toEqual({ code: 'n("0 1")' });
    expect(((conversation[3]!.content as BetaToolResultBlockParam[])[0]!).is_error).toBe(true);
  });
});
