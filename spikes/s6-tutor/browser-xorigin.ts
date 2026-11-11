#!/usr/bin/env bun
// Real-browser proof (headless Chromium via Playwright) that:
//   - a page on ANOTHER origin cannot get a POST accepted by the tutor endpoint, by any of the
//     usual routes (CORS fetch with custom header, no-cors simple POST, HTML form POST);
//   - the app's own origin can, and can read the SSE stream with fetch + ReadableStream.
// Run: bun spikes/s6-tutor/browser-xorigin.ts      (starts and stops its own server on 8796)
import { chromium } from '@playwright/test';
import { hintCassette } from './cassette.ts';
import { FakeTutorClient } from './fake-client.ts';
import { PREFIX } from './harness.ts';
import { localOrigins } from './security.ts';
import { createApp } from './server.ts';

const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const app = createApp({ prefix: PREFIX, security: localOrigins(PORT), session: () => ({ client: new FakeTutorClient(hintCassette()), rung: 0 }) });

const seen: string[] = [];
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('<!doctype html><title>oak</title>app', { headers: { 'content-type': 'text/html' } });
    const res = await app.fetch(req, srv);
    let reason = '';
    if (res.status === 403) reason = ` reason=${((await res.clone().json()) as { reason: string }).reason}`;
    seen.push(`${req.method} ${url.pathname} origin=${req.headers.get('origin')} sec-fetch-site=${req.headers.get('sec-fetch-site')} content-type=${req.headers.get('content-type')} x-oak=${req.headers.get('x-oak')} -> ${res.status}${reason}`);
    return res;
  },
});

let failed = false;
const check = (name: string, ok: boolean, detail: unknown) => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
};

const browser = await chromium.launch({ headless: true });
try {
  console.log('chromium', browser.version());
  const ctx = await browser.newContext();

  // ---------------- attacker pages (served from memory via route.fulfill; no second port) ----------------
  // https:// is what a real attacker page would be; http:// is included because Chromium treats the
  // two differently (mixed content / local-network-access), and we want to see what reaches the server.
  const body = JSON.stringify({ conversationId: 'x', text: 'steal' });
  for (const evilOrigin of ['https://evil.example', 'http://evil.example']) {
    const evil = await ctx.newPage();
    await evil.route(`${evilOrigin}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>evil</title>evil' }));
    await evil.goto(`${evilOrigin}/`);

    const a = await evil.evaluate(async ([url, b]) => {
      try {
        const r = await fetch(url!, { method: 'POST', headers: { 'content-type': 'application/json', 'x-oak': '1' }, body: b! });
        return { ok: true, status: r.status, text: (await r.text()).slice(0, 80) };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, [`${BASE}/api/tutor/chat`, body] as const);
    check(`${evilOrigin}: CORS fetch with JSON + X-Oak fails`, a.ok === false, a);

    const b = await evil.evaluate(async ([url, bd]) => {
      try {
        const r = await fetch(url!, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: bd! });
        return { ok: true, type: r.type, status: r.status };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, [`${BASE}/api/tutor/chat`, body] as const);
    check(`${evilOrigin}: no-cors simple POST yields nothing readable (opaque or blocked)`, b.ok === false || (b as { type?: string }).type === 'opaque', b);

    // HTML form POST (a top-level navigation; no CORS involved at all)
    const [formResp] = await Promise.all([
      evil.waitForResponse((r) => r.url().startsWith(`${BASE}/api/tutor/chat`), { timeout: 8000 }).catch(() => null),
      evil.evaluate((url) => {
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = url;
        const i = document.createElement('input');
        i.name = 'text';
        i.value = 'steal';
        f.appendChild(i);
        document.body.appendChild(f);
        f.submit();
      }, `${BASE}/api/tutor/chat`),
    ]);
    check(`${evilOrigin}: HTML form POST is rejected with 403`, formResp === null || formResp.status() === 403, formResp ? `status=${formResp.status()}` : 'blocked before reaching the server');
    await evil.close();
  }

  // ---------------- the app's own origin ----------------
  const own = await ctx.newPage();
  await own.goto(`${BASE}/`);
  const s = await own.evaluate(async (bd) => {
    const r = await fetch('/api/tutor/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-oak': '1' }, body: bd });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    return { status: r.status, contentType: r.headers.get('content-type'), events };
  }, JSON.stringify({ conversationId: 'own', text: 'Why does it sound unfinished?' }));
  check('own origin: POST accepted, SSE read with fetch + ReadableStream', s.status === 200 && s.contentType === 'text/event-stream' && s.events.at(-1) === 'done' && s.events.includes('tool_result') && s.events.includes('code_card'), { status: s.status, contentType: s.contentType, n: s.events.length, last: s.events.at(-1), kinds: [...new Set(s.events)] });

  const noHeader = await own.evaluate(async (bd) => (await fetch('/api/tutor/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: bd })).status, body);
  check('own origin without X-Oak: 403', noHeader === 403, `status=${noHeader}`);
} finally {
  await browser.close();
  await server.stop(true);
}

console.log('\nserver saw:');
for (const l of seen) console.log('  ' + l);
const evilAccepted = seen.filter((l) => !l.includes(`origin=${BASE} `) && l.includes('-> 200'));
check('no request from any other origin was ever answered 200', evilAccepted.length === 0, evilAccepted);
console.log(failed ? '\nBROWSER CHECK FAILED' : '\nBROWSER CHECK OK');
process.exit(failed ? 1 : 0);
