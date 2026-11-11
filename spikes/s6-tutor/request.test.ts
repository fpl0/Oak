import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { hintCassette } from './cassette.ts';
import { FAKE_KINDS, PREFIX, runCassette } from './harness.ts';
import { LESSON } from './lesson-fixture.ts';
import { oakContext, type Rung } from './redaction.ts';
import { BETAS, buildRequest, buildSystem, buildTurnMessages, CHAT_ROUTE, MODEL, prefixBytes, staticBytes, TOOLS, TOOL_NAMES } from './request.ts';

function requestWith(rung: Rung, userText: string, learnerCode: string, now: string, history = 0) {
  const messages = [];
  for (let i = 0; i < history; i++) {
    messages.push(...buildTurnMessages({ userText: `earlier question ${i}`, oakContext: `attempt ${i}` }), { role: 'assistant' as const, content: `earlier answer ${i}` });
  }
  messages.push(...buildTurnMessages({ userText, learnerCode, oakContext: oakContext(LESSON, rung, { attempt: history + 1, streak: 6 + history, now }) }));
  return buildRequest(PREFIX, messages, CHAT_ROUTE);
}

describe('request shape', () => {
  test('matches the plan: model, betas, fallbacks, thinking, effort, tool_choice, max_tokens', () => {
    const p = requestWith(0, 'hi', 'n("0")', 't');
    expect(p.model).toBe('claude-opus-5-5');
    expect(MODEL).toBe('claude-opus-5-5');
    expect(p.max_tokens).toBe(16000);
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect([...BETAS]).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    expect(p.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    for (const banned of ['temperature', 'top_p', 'top_k', 'stream']) expect(banned in p).toBe(false);
  });

  test('tools: the 5 v1 tools, name-sorted, strict, closed schemas, eager only on propose_code', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(['compare_haps', 'evaluate_strudel', 'get_learner_progress', 'get_lesson_context', 'propose_code']);
    expect(names).toEqual([...names].sort());
    expect([...TOOL_NAMES].sort() as string[]).toEqual(names);
    const closed = (schema: unknown): void => {
      const s = schema as { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown };
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required ?? [])].sort()).toEqual(Object.keys(s.properties ?? {}).sort()); // strict: no optional params
        for (const v of Object.values(s.properties ?? {})) closed(v);
      }
      if (s.items) closed(s.items);
      // strict schemas cannot express numeric/string bounds
      for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern']) expect(k in s).toBe(false);
    };
    for (const t of TOOLS as readonly BetaTool[]) {
      expect(t.strict).toBe(true);
      expect(typeof t.description).toBe('string');
      closed(t.input_schema);
      expect(t.eager_input_streaming).toBe(t.name === 'propose_code' ? true : undefined);
      expect('cache_control' in t).toBe(false); // no breakpoint on tools; the system breakpoint covers them
    }
  });

  test('tools are deep-frozen (cannot be mutated into a cache miss)', () => {
    expect(Object.isFrozen(TOOLS)).toBe(true);
    expect(() => {
      (TOOLS[0] as { description?: string }).description = 'changed';
    }).toThrow();
    expect(() => {
      ((TOOLS[0]!.input_schema.properties as Record<string, unknown>).x as unknown) = 1;
    }).toThrow();
  });

  test('system: [persona, syllabus, catalog] with exactly one breakpoint, 1h, on the last block', () => {
    const sys = buildSystem(PREFIX);
    expect(sys.map((b) => b.text)).toEqual([PREFIX.persona, PREFIX.syllabus, PREFIX.catalog]);
    expect(sys.map((b) => b.cache_control ?? null)).toEqual([null, null, { type: 'ephemeral', ttl: '1h' }]);
  });

  test('volatile context: learner text in the user turn, Oak context in a trailing mid-conversation system message', () => {
    const [user, system] = buildTurnMessages({ userText: 'why?', learnerCode: 'n("0 2")', oakContext: 'hint_rung: 2' });
    expect(user).toEqual({ role: 'user', content: [{ type: 'text', text: '<learner_code>\nn("0 2")\n</learner_code>' }, { type: 'text', text: 'why?' }] });
    expect(system).toEqual({ role: 'system', content: '<oak_context v="1">\nhint_rung: 2\n</oak_context>' });
  });
});

describe('prefix byte-stability (the cache precondition)', () => {
  test('two builds with different volatile context -> byte-identical tools+system, and byte-identical everything-but-messages', () => {
    const a = requestWith(0, 'Why does it sound unfinished?', 'n("0 2 4 6").scale("D:dorian")', '2026-11-11T09:00:00.000Z');
    const b = requestWith(4, 'ok show me — ¿y ahora? 🎹', 'n("<0 2> [4 7]").scale("D:dorian").fast(2)', '2027-01-02T23:59:59.999Z', 3);
    expect(JSON.stringify(a.messages)).not.toBe(JSON.stringify(b.messages)); // the contexts really differ
    expect(prefixBytes(a)).toBe(prefixBytes(b));
    expect(staticBytes(a)).toBe(staticBytes(b));
    expect(JSON.stringify(a.tools)).toBe(JSON.stringify(b.tools));
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
    // and it is not vacuous: nothing volatile is inside the prefix, and a real change IS detected
    for (const volatile of ['2026-11-11', '2027-01-02', 'unfinished', 'dorian").fast', 'hint_rung', 'attempt']) expect(prefixBytes(a).includes(volatile)).toBe(false);
    const changed = buildRequest({ ...PREFIX, catalog: `${PREFIX.catalog} ` }, a.messages, CHAT_ROUTE);
    expect(prefixBytes(changed)).not.toBe(prefixBytes(a));
  });

  test('key order is fixed: tools render before system before messages in the serialised body', () => {
    const json = JSON.stringify(requestWith(1, 'x', 'y', 'z'));
    const iTools = json.indexOf('"tools":');
    const iSystem = json.indexOf('"system":');
    const iMessages = json.indexOf('"messages":');
    expect(iTools).toBeGreaterThan(0);
    expect(iTools).toBeLessThan(iSystem);
    expect(iSystem).toBeLessThan(iMessages);
  });

  test.each(FAKE_KINDS)('[%s] every request of a multi-request turn carries the same prefix, across rungs', async (kind) => {
    const prefixes = new Set<string>();
    const statics = new Set<string>();
    for (const rung of [0, 2, 4] as const) {
      const { h } = await runCassette(kind, hintCassette(), { rung, userText: `question at rung ${rung}` });
      expect(h.sent()).toHaveLength(3);
      for (const r of h.sent()) {
        // For the sdk fake this is the body the SDK actually serialised for the wire.
        const body = JSON.parse(r.json) as { tools: unknown; system: unknown; messages: unknown; stream?: boolean };
        prefixes.add(JSON.stringify({ tools: body.tools, system: body.system }));
        const { messages: _m, ...rest } = body;
        statics.add(JSON.stringify(rest));
      }
    }
    expect(prefixes.size).toBe(1);
    expect(statics.size).toBe(1);
  });

  test('stable across processes, time zones and locales (sha256 of the prefix)', () => {
    const script = path.join(import.meta.dir, 'prefix-hash.ts');
    const run = (env: Record<string, string>, args: string[]) => {
      const p = Bun.spawnSync({ cmd: [process.execPath, script, ...args], env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
      if (p.exitCode !== 0) throw new Error(p.stderr.toString());
      return JSON.parse(p.stdout.toString()) as { prefix: string; static: string; prefixLen: number };
    };
    const a = run({ TZ: 'UTC', LANG: 'en_US.UTF-8' }, ['0', 'first question']);
    const b = run({ TZ: 'Asia/Tokyo', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' }, ['4', 'a completely different question']);
    console.log('[prefix] sha256', a.prefix, 'len', a.prefixLen, '| second process', b.prefix);
    expect(a.prefix).toMatch(/^[0-9a-f]{64}$/);
    expect(b.prefix).toBe(a.prefix);
    expect(b.static).toBe(a.static);
  });
});
