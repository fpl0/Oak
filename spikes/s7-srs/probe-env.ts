// Environment facts that matter for ts-fsrs 6.0.0 on Bun.
import { DefaultScheduler, Rating } from 'ts-fsrs';
console.log('Bun', Bun.version, '| typeof Temporal:', typeof (globalThis as { Temporal?: unknown }).Temporal, '| crypto.randomUUID:', typeof globalThis.crypto?.randomUUID);
const t0 = performance.now();
const s = await DefaultScheduler({ version: 'FSRS-7' });
console.log('first DefaultScheduler() resolved in', (performance.now() - t0).toFixed(1), 'ms');
const t1 = performance.now();
await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85 });
console.log('second (preset cached) in', (performance.now() - t1).toFixed(2), 'ms');
const now = new Date('2026-01-01T00:00:00Z');
const c = s.review({ card: s.newCard({ now, cardId: 'x' }), grade: Rating.Good, now }).card;
const f = s.forget({ card: c, now }) as Record<string, unknown>;
console.log('forget() result has keys card/revlog?', 'card' in f, 'revlog' in f, '| top-level keys:', Object.keys(f).join(','));
console.log('engines in ts-fsrs/package.json:', JSON.stringify((await import('ts-fsrs/package.json', { with: { type: 'json' } }).catch(() => ({ default: { engines: 'not exported' } }))).default.engines));
