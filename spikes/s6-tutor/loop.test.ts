import { describe, expect, test } from 'bun:test';
import type { BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  hintCassette,
  invalidToolInputCassette,
  maxTokensMidToolCassette,
  midStreamOverloadCassette,
  pauseTurnCassette,
  plainCassette,
  rateLimitCassette,
  refusalCassette,
  runawayCassette,
  silentGapCassette,
} from './cassette.ts';
import { FAKE_KINDS, runCassette, textOf } from './harness.ts';
import { CHAT_ROUTE } from './request.ts';

describe.each(FAKE_KINDS)('agent loop [%s]', (kind) => {
  test('plain text turn: text deltas -> done(end_turn), assistant appended verbatim', async () => {
    const { events, conversation, h } = await runCassette(kind, plainCassette('Hello from the tutor.'));
    expect(textOf(events)).toBe('Hello from the tutor.');
    const done = events.at(-1)!;
    expect(done.type).toBe('done');
    if (done.type !== 'done') throw new Error('unreachable');
    expect(done.data.stopReason).toBe('end_turn');
    expect(done.data.iterations).toBe(1);
    expect(done.data.usage.requests).toBe(1);
    expect(h.sent()).toHaveLength(1);
    // user, system(context), assistant
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
    expect(conversation[2]!.content).toEqual([{ type: 'text', text: 'Hello from the tutor.', citations: null }]);
  });

  test('tool loop: 3 requests, parallel tool_results in ONE user message, code_card, usage summed', async () => {
    const { events, conversation, h } = await runCassette(kind, hintCassette(), { rung: 0 });
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'tool_start')).toHaveLength(3);
    expect(types.filter((t) => t === 'tool_result')).toHaveLength(3);
    expect(types.filter((t) => t === 'code_card')).toHaveLength(1);
    expect(types.at(-1)).toBe('done');

    // Event order within the first request: thinking, text, tool_start x2, then tool_result x2.
    expect(types.slice(0, 2)).toEqual(['thinking', 'thinking']);
    expect(types.indexOf('tool_start')).toBeLessThan(types.indexOf('tool_result'));

    expect(events.flatMap((e) => (e.type === 'thinking' ? [e.data.delta] : [])).join('')).toBe('The learner asks why it sounds unfinished. Check the lesson first.');
    expect(textOf(events)).toBe('Let me look at what you wrote.Here is the same idea in a different key.Where does your last note land compared with the first one?');

    expect(h.sent()).toHaveLength(3);
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant', 'user', 'assistant']);

    // Assistant turn 1 verbatim: thinking (with signature), text, two tool_use blocks with parsed input.
    const a1 = conversation[2]!.content as { type: string; [k: string]: unknown }[];
    expect(a1.map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use', 'tool_use']);
    expect(a1[0]).toMatchObject({ type: 'thinking', signature: 'sig-opaque==', thinking: 'The learner asks why it sounds unfinished. Check the lesson first.' });
    expect(a1[2]).toMatchObject({ type: 'tool_use', id: 'toolu_01', name: 'get_lesson_context', input: { lesson_id: 'u03.04' } });
    expect(a1[3]).toMatchObject({ type: 'tool_use', id: 'toolu_02', name: 'compare_haps', input: { learner_code: 'n("0 2 4 6").scale("D:dorian")', target_id: 'u03.04#arpeggio-1358' } });

    // ONE user message with both results, in tool_use order.
    const r1 = conversation[3]!.content as BetaToolResultBlockParam[];
    expect(r1.map((b) => [b.type, b.tool_use_id])).toEqual([
      ['tool_result', 'toolu_01'],
      ['tool_result', 'toolu_02'],
    ]);
    expect(r1.every((b) => b.is_error === undefined)).toBe(true);

    // What request #2 carried is exactly the conversation up to that point (append-only replay).
    const req2 = h.sent()[1]!.params.messages;
    expect(JSON.stringify(req2)).toBe(JSON.stringify(conversation.slice(0, 4)));
    const req3 = h.sent()[2]!.params.messages;
    expect(JSON.stringify(req3)).toBe(JSON.stringify(conversation.slice(0, 6)));
    // ...and request N is a strict prefix of request N+1 (cache-friendly).
    expect(JSON.stringify(req3).startsWith(JSON.stringify(req2).slice(0, -1))).toBe(true);

    const card = events.find((e) => e.type === 'code_card')!;
    if (card.type !== 'code_card') throw new Error('unreachable');
    expect(card.data).toEqual({ toolUseId: 'toolu_03', title: 'Octave in G major', code: 'n("0 1 2 3").scale("G:major")', explanation: 'Count the steps from zero.', applyAllowed: false });

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('unreachable');
    expect(done.data.iterations).toBe(3);
    expect(done.data.usage).toMatchObject({
      requests: 3,
      inputTokens: 92,
      outputTokens: 185,
      cacheReadInputTokens: 12400,
      cacheCreationInputTokens: 6550,
      cacheCreation1hInputTokens: 6000,
      cacheCreation5mInputTokens: 550,
      servedBy: ['claude-opus-5-5'],
    });
    // 92*4 + 12400*4*0.05 + 550*4*1.25 + 6000*4*2 + 185*20 = 57298 micro-dollars
    expect(done.data.usage.costUsd).toBeCloseTo(0.057298, 9);
  });

  test('refusal: error(refusal) and the refused tail turn is NOT appended', async () => {
    const { events, conversation } = await runCassette(kind, refusalCassette());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', data: { kind: 'refusal', message: 'cyber' } });
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system']);
  });

  test('max_tokens with a truncated tool_use: tool is NOT executed, nothing appended', async () => {
    const { events, conversation, h } = await runCassette(kind, maxTokensMidToolCassette());
    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'code_card')).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'error', data: { kind: 'max_tokens' } });
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system']);
    expect(h.sent()).toHaveLength(1);
  });

  test('pause_turn: assistant appended, re-sent with no extra user message', async () => {
    const { events, conversation, h } = await runCassette(kind, pauseTurnCassette());
    expect(textOf(events)).toBe('Working on it ... done.');
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'assistant']);
    expect(h.sent()).toHaveLength(2);
    expect(h.sent()[1]!.params.messages.map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { stopReason: 'end_turn', iterations: 2 } });
  });

  test('iteration cap: stops after maxIterations model calls', async () => {
    const { events, h } = await runCassette(kind, runawayCassette(10), { route: { ...CHAT_ROUTE, maxIterations: 3 } });
    expect(h.sent()).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: 'error', data: { kind: 'iteration_limit' } });
    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(3);
  });

  test('invalid tool input: is_error tool_result goes back, loop continues', async () => {
    const { events, conversation } = await runCassette(kind, invalidToolInputCassette());
    const tr = events.find((e) => e.type === 'tool_result')!;
    expect(tr).toMatchObject({ type: 'tool_result', data: { ok: false, summary: 'invalid input' } });
    const block = (conversation[3]!.content as BetaToolResultBlockParam[])[0]!;
    expect(block.is_error).toBe(true);
    expect(JSON.parse(block.content as string)).toMatchObject({ error: 'INVALID_JSON' });
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { stopReason: 'end_turn', iterations: 2 } });
  });

  test('mid-stream overloaded_error (after HTTP 200): surfaced as error(overloaded), nothing appended', async () => {
    const { events, conversation } = await runCassette(kind, midStreamOverloadCassette());
    expect(textOf(events)).toBe('Partial ');
    expect(events.at(-1)).toMatchObject({ type: 'error', data: { kind: 'overloaded' } });
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system']);
  });

  test('HTTP 429: error(rate_limit) with retry-after', async () => {
    const { events } = await runCassette(kind, rateLimitCassette());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', data: { kind: 'rate_limit', retryAfterSec: 17 } });
  });

  test('abort mid-stream: loop stops promptly, upstream stream is aborted, nothing appended', async () => {
    const ac = new AbortController();
    const t0 = performance.now();
    setTimeout(() => ac.abort(), 150);
    const { events, conversation, h } = await runCassette(kind, silentGapCassette(30_000), { signal: ac.signal });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    expect(textOf(events)).toBe('before-gap');
    expect(events.at(-1)).toMatchObject({ type: 'error', data: { kind: 'aborted' } });
    expect(conversation.map((m) => m.role)).toEqual(['user', 'system']);
    expect(h.aborted()).toEqual([true]);
  });
});
