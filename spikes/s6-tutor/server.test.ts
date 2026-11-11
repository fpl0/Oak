import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import http from 'node:http';
import { hintCassette, plainCassette, refusalCassette, silentGapCassette, type Cassette } from './cassette.ts';
import { SseParser, type ParsedSse } from './events.ts';
import { FakeTutorClient } from './fake-client.ts';
import { PREFIX } from './harness.ts';
import type { Rung } from './redaction.ts';
import { localOrigins } from './security.ts';
import { createApp, startServer, type SessionCfg, type TurnEndInfo } from './server.ts';

const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const GOOD = { 'content-type': 'application/json', origin: BASE, 'x-oak': '1' };

// Per-conversation scenario registry (stands in for server state).
const sessions = new Map<string, SessionCfg & { fake: FakeTutorClient }>();
const turnEnds = new Map<string, TurnEndInfo>();
const turnEndWaiters = new Map<string, (i: TurnEndInfo) => void>();
const envSeen: { envIsBunServer: boolean; hasTimeoutFn: boolean }[] = [];

function scenario(id: string, cassette: Cassette, cfg: Partial<SessionCfg> = {}): FakeTutorClient {
  const fake = new FakeTutorClient(cassette);
  sessions.set(id, { client: fake, fake, rung: 0 as Rung, ...cfg });
  return fake;
}
function waitTurnEnd(id: string): Promise<TurnEndInfo> {
  const done = turnEnds.get(id);
  if (done) return Promise.resolve(done);
  return new Promise((res) => turnEndWaiters.set(id, res));
}

let server: Bun.Server<undefined>;
beforeAll(() => {
  server = startServer({
    port: PORT,
    prefix: PREFIX,
    session: (id) => {
      const s = sessions.get(id);
      if (!s) throw new Error(`no scenario ${id}`);
      return s;
    },
    onRequest: (i) => envSeen.push(i),
    onTurnEnd: (i) => {
      turnEnds.set(i.conversationId, i);
      turnEndWaiters.get(i.conversationId)?.(i);
    },
  });
});
afterAll(async () => {
  await server.stop(true);
});

interface SseRun {
  status: number;
  contentType: string | null;
  headers: Record<string, string>;
  events: ParsedSse[];
  comments: string[];
  /** ms offsets (from request start) at which each frame/comment chunk arrived */
  arrivals: number[];
  end: 'eof' | 'error';
  error?: string;
  ms: number;
}

async function chat(id: string, opts: { signal?: AbortSignal; onEvent?: (e: ParsedSse) => void } = {}): Promise<SseRun> {
  const t0 = performance.now();
  const init: RequestInit = { method: 'POST', headers: GOOD, body: JSON.stringify({ conversationId: id, text: 'Why does it sound unfinished?', learnerCode: 'n("0 2 4 6").scale("D:dorian")' }) };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(`${BASE}/api/tutor/chat`, init);
  const run: SseRun = { status: res.status, contentType: res.headers.get('content-type'), headers: Object.fromEntries(res.headers), events: [], comments: [], arrivals: [], end: 'eof', ms: 0 };
  const parser = new SseParser();
  const dec = new TextDecoder();
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      run.arrivals.push(Math.round(performance.now() - t0));
      for (const e of parser.push(dec.decode(chunk, { stream: true }))) {
        run.events.push(e);
        opts.onEvent?.(e);
      }
    }
  } catch (e) {
    run.end = 'error';
    run.error = `${(e as Error).name}: ${(e as Error).message}`;
  }
  run.comments = parser.comments;
  run.ms = Math.round(performance.now() - t0);
  return run;
}

describe('SSE relay over real HTTP (Hono on Bun.serve, 127.0.0.1:8796)', () => {
  test('binds loopback only', () => {
    expect(server.hostname).toBe('127.0.0.1');
    expect(server.port).toBe(PORT);
  });

  test('full tool-loop turn arrives as app-level SSE events; c.env is the Bun server', async () => {
    scenario('c-hint', hintCassette());
    const run = await chat('c-hint');
    expect(run.status).toBe(200);
    expect(run.contentType).toBe('text/event-stream');
    expect(run.headers['cache-control']).toBe('no-cache');
    expect(run.headers['access-control-allow-origin']).toBeUndefined();
    console.log('[sse] response headers:', JSON.stringify(run.headers));
    expect(run.end).toBe('eof');
    const kinds = run.events.map((e) => e.event);
    expect(new Set(kinds)).toEqual(new Set(['thinking', 'text', 'tool_start', 'tool_result', 'code_card', 'done']));
    expect(kinds.at(-1)).toBe('done');
    expect(kinds.filter((k) => k === 'tool_start')).toHaveLength(3);
    const done = run.events.at(-1)!.data as { stopReason: string; iterations: number; usage: { requests: number; cacheReadInputTokens: number; costUsd: number } };
    expect(done.stopReason).toBe('end_turn');
    expect(done.iterations).toBe(3);
    expect(done.usage.requests).toBe(3);
    expect(done.usage.cacheReadInputTokens).toBe(12400);
    expect(done.usage.costUsd).toBeGreaterThan(0);
    expect(envSeen.at(-1)).toEqual({ envIsBunServer: true, hasTimeoutFn: true });
  });

  test('client abort propagates: response cancel -> AbortController -> loop -> upstream stream aborted', async () => {
    const fake = scenario('c-abort', silentGapCassette(30_000), { heartbeatMs: 0 });
    const ac = new AbortController();
    const t0 = performance.now();
    const run = await chat('c-abort', {
      signal: ac.signal,
      onEvent: (e) => {
        if (e.event === 'text') setTimeout(() => ac.abort(), 50);
      },
    });
    expect(run.end).toBe('error'); // the client's own AbortError
    expect(run.events.map((e) => e.event)).toEqual(['text']);
    const info = await Promise.race([waitTurnEnd('c-abort'), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('server never noticed the abort')), 5000))]);
    const noticedAfterMs = Math.round(performance.now() - t0);
    console.log('[abort] server turn-end info:', JSON.stringify(info), 'noticed after', noticedAfterMs, 'ms');
    expect(info.outcome).toBe('aborted');
    expect(info.streamOnAbortAtMs).not.toBeNull();
    expect(info.reqSignalAbortAtMs).not.toBeNull(); // Bun 1.4.4 DOES abort req.signal on client disconnect
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.aborted).toBe(true);
    expect(noticedAfterMs).toBeLessThan(3000); // not the 30 s the cassette would have taken
  });
});

describe('failed turns', () => {
  test('a refused turn leaves no dangling [user, system] pair: the retry request starts clean', async () => {
    // [user, system, user, system] would break the placement rule for mid-conversation system
    // messages (must be last or followed by an assistant turn), so the un-answered pair is dropped.
    const fake = scenario('c-refuse', { name: 'refuse-then-ok', responses: [...refusalCassette().responses, ...plainCassette('Second try.').responses] });
    const first = await chat('c-refuse');
    expect(first.events.map((e) => e.event)).toEqual(['error']);
    expect((first.events[0]!.data as { kind: string }).kind).toBe('refusal');
    const second = await chat('c-refuse');
    expect(second.events.map((e) => e.event)).toEqual(['text', 'done']);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]!.params.messages.map((m) => m.role)).toEqual(['user', 'system']);
  });
});

describe('security middleware', () => {
  const app = createApp({ prefix: PREFIX, security: localOrigins(PORT), session: () => ({ client: new FakeTutorClient(plainCassette()), rung: 0, disableIdleTimeout: false, heartbeatMs: 0 }) });
  const body = JSON.stringify({ conversationId: 'sec', text: 'hi' });
  const post = (headers: Record<string, string>, method = 'POST') => {
    const init: RequestInit = { method, headers: { host: `127.0.0.1:${PORT}`, ...headers } };
    if (method !== 'GET' && method !== 'OPTIONS') init.body = body;
    return app.request('/api/tutor/chat', init);
  };
  const reason = async (r: Response) => ((await r.json()) as { reason?: string }).reason;

  test('accepts the app itself (127.0.0.1 and localhost origins)', async () => {
    const a = await post(GOOD);
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('text/event-stream');
    await a.text();
    const b = await post({ ...GOOD, host: `localhost:${PORT}`, origin: `http://localhost:${PORT}`, 'sec-fetch-site': 'same-origin' });
    expect(b.status).toBe(200);
    await b.text();
  });

  test.each([
    ['cross-origin POST (evil origin, otherwise perfect)', { ...GOOD, origin: 'https://evil.example' }, 'origin'],
    ['same host, different port origin', { ...GOOD, origin: 'http://127.0.0.1:5999' }, 'origin'],
    ['Origin: null (sandboxed iframe / data: URL)', { ...GOOD, origin: 'null' }, 'origin'],
    ['POST with no Origin at all', { 'content-type': 'application/json', 'x-oak': '1' }, 'origin'],
    ['allowed Origin but Sec-Fetch-Site: cross-site', { ...GOOD, 'sec-fetch-site': 'cross-site' }, 'fetch-site'],
    ['missing X-Oak', { 'content-type': 'application/json', origin: BASE }, 'x-oak'],
    ['wrong X-Oak value', { ...GOOD, 'x-oak': 'true' }, 'x-oak'],
    ['form-encoded body (CSRF simple request)', { ...GOOD, 'content-type': 'application/x-www-form-urlencoded' }, 'content-type'],
    ['text/plain body (CSRF simple request)', { ...GOOD, 'content-type': 'text/plain' }, 'content-type'],
    ['DNS rebinding: Host is the attacker domain', { ...GOOD, host: `evil.example:${PORT}`, origin: `http://evil.example:${PORT}` }, 'host'],
    ['Host without port', { ...GOOD, host: '127.0.0.1' }, 'host'],
    ['Host with another port', { ...GOOD, host: '127.0.0.1:9999' }, 'host'],
  ])('rejects: %s', async (_name, headers, why) => {
    const r = await post(headers);
    expect(r.status).toBe(403);
    expect(await reason(r)).toBe(why);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('CORS preflight is refused and never grants anything', async () => {
    const r = await post({ origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-oak,content-type' }, 'OPTIONS');
    expect(r.status).toBe(403);
    expect(await reason(r)).toBe('preflight');
    for (const h of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']) expect(r.headers.get(h)).toBeNull();
  });

  test('GET: no Origin is fine with X-Oak; cross-site GET is not', async () => {
    const get = (headers: Record<string, string>) => app.request('/api/health', { headers: { host: `127.0.0.1:${PORT}`, ...headers } });
    expect((await get({ 'x-oak': '1' })).status).toBe(200);
    expect((await get({ 'x-oak': '1', 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect((await get({ 'x-oak': '1', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await get({})).status).toBe(403);
  });

  test('over the wire: cross-origin POST and spoofed Host are rejected by the running server', async () => {
    const evil = await fetch(`${BASE}/api/tutor/chat`, { method: 'POST', headers: { ...GOOD, origin: 'https://evil.example' }, body });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: 'forbidden', reason: 'origin' });

    // fetch() will not let us lie about Host, so use a raw node:http request.
    const rebind = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/tutor/chat', method: 'POST', headers: { ...GOOD, host: `evil.example:${PORT}`, origin: `http://evil.example:${PORT}` } }, (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
      });
      req.on('error', reject);
      req.end(body);
    });
    expect(rebind.status).toBe(403);
    expect(JSON.parse(rebind.body)).toEqual({ error: 'forbidden', reason: 'host' });
  });
});
