// The 25-second silence proof. Slow by design (~26 s): four requests run concurrently against one
// server, each with a cassette that goes silent for 25 s mid-stream (Opus thinking with
// display:'omitted' looks exactly like this to the socket).
//
//   A  no server.timeout(req,0), no heartbeat  -> Bun's default idleTimeout (10 s) kills the socket
//   B  server.timeout(req,0),    no heartbeat  -> survives 25 s of total silence
//   C  no server.timeout(req,0), 5 s heartbeat -> survives (pings count as activity)
//   D  server.timeout(req,0)  +  5 s heartbeat -> production config
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { silentGapCassette } from './cassette.ts';
import { SseParser } from './events.ts';
import { FakeTutorClient } from './fake-client.ts';
import { PREFIX } from './harness.ts';
import { startServer, type SessionCfg } from './server.ts';

const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const GAP_MS = 25_000;

const cfgs: Record<string, Pick<SessionCfg, 'disableIdleTimeout' | 'heartbeatMs'>> = {
  A: { disableIdleTimeout: false, heartbeatMs: 0 },
  B: { disableIdleTimeout: true, heartbeatMs: 0 },
  C: { disableIdleTimeout: false, heartbeatMs: 5000 },
  D: { disableIdleTimeout: true, heartbeatMs: 5000 },
};
const fakes: Record<string, FakeTutorClient> = {};

let server: Bun.Server<undefined>;
beforeAll(() => {
  server = startServer({
    port: PORT,
    prefix: PREFIX,
    // NOTE: no idleTimeout passed -> Bun's default applies.
    session: (id) => {
      const fake = (fakes[id] = new FakeTutorClient(silentGapCassette(GAP_MS)));
      return { client: fake, rung: 0, ...cfgs[id]! };
    },
  });
});
afterAll(async () => {
  await server.stop(true);
});

interface Outcome {
  id: string;
  status: number;
  events: string[];
  text: string;
  pings: number;
  end: 'eof' | 'error';
  error?: string;
  ms: number;
  lastByteAtMs: number;
  upstreamAborted: boolean;
}

async function run(id: string): Promise<Outcome> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/tutor/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-oak': '1' },
    body: JSON.stringify({ conversationId: id, text: 'hi' }),
  });
  const out: Outcome = { id, status: res.status, events: [], text: '', pings: 0, end: 'eof', ms: 0, lastByteAtMs: 0, upstreamAborted: false };
  const parser = new SseParser();
  const dec = new TextDecoder();
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      out.lastByteAtMs = Math.round(performance.now() - t0);
      for (const e of parser.push(dec.decode(chunk, { stream: true }))) {
        out.events.push(e.event);
        if (e.event === 'text') out.text += (e.data as { delta: string }).delta;
      }
    }
  } catch (e) {
    out.end = 'error';
    out.error = `${(e as Error).name}: ${(e as Error).message}`;
  }
  out.pings = parser.comments.filter((c) => c === 'ping').length;
  out.ms = Math.round(performance.now() - t0);
  // give the server a beat to run its abort path
  await new Promise((r) => setTimeout(r, 200));
  out.upstreamAborted = fakes[id]?.requests[0]?.aborted ?? false;
  return out;
}

test(
  '25 s silent gap: dropped at Bun default idleTimeout without server.timeout(req,0); survives with it (and/or with 5 s pings)',
  async () => {
    const [A, B, C, D] = (await Promise.all(['A', 'B', 'C', 'D'].map(run))) as [Outcome, Outcome, Outcome, Outcome];
    for (const o of [A, B, C, D]) console.log('[idle]', JSON.stringify(o));

    // A: connection dropped during the silence. No done event, far short of 25 s.
    expect(A.events).toEqual(['text']);
    expect(A.text).toBe('before-gap');
    expect(A.ms).toBeGreaterThan(8_000);
    expect(A.ms).toBeLessThan(15_000);
    expect(A.upstreamAborted).toBe(true); // the drop propagated into the loop

    // B: 25 s of complete silence on the wire, then the rest arrives.
    expect(B.end).toBe('eof');
    expect(B.events).toEqual(['text', 'text', 'done']);
    expect(B.text).toBe('before-gapafter-gap');
    expect(B.pings).toBe(0);
    expect(B.ms).toBeGreaterThan(GAP_MS - 500);

    // C: heartbeats alone also keep it alive.
    expect(C.events).toEqual(['text', 'text', 'done']);
    expect(C.pings).toBeGreaterThanOrEqual(4);

    // D: production config.
    expect(D.end).toBe('eof');
    expect(D.events).toEqual(['text', 'text', 'done']);
    expect(D.pings).toBeGreaterThanOrEqual(4);
    expect(D.pings).toBeLessThanOrEqual(6);
  },
  60_000,
);
