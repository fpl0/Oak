// Prints the sha256 of the cache-relevant prefix. Run in separate processes (different TZ/LANG)
// to prove the bytes do not depend on process state. Usage: bun prefix-hash.ts [rung] [text]
import { createHash } from 'node:crypto';
import { PREFIX } from './harness.ts';
import { LESSON } from './lesson-fixture.ts';
import { clampRung, oakContext } from './redaction.ts';
import { buildRequest, buildTurnMessages, CHAT_ROUTE, prefixBytes, staticBytes } from './request.ts';

const rung = clampRung(Number(process.argv[2] ?? 0));
const params = buildRequest(
  PREFIX,
  buildTurnMessages({ userText: process.argv[3] ?? 'hi', oakContext: oakContext(LESSON, rung, { attempt: 1, streak: 1, now: new Date().toISOString() }) }),
  CHAT_ROUTE,
);
const h = (s: string) => createHash('sha256').update(s).digest('hex');
console.log(JSON.stringify({ prefix: h(prefixBytes(params)), static: h(staticBytes(params)), prefixLen: prefixBytes(params).length }));
