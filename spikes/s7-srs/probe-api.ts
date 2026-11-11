import { DefaultScheduler, Rating, State } from 'ts-fsrs';
const D = (s: string) => new Date(s);
const day = 86400000;
const now = D('2026-01-01T09:00:00.000Z');
const j = (x: unknown) => JSON.stringify(x);
console.log('reverse mapping: Rating[3] =', (Rating as any)[3], '| State[2] =', (State as any)[2]);
const RN = (g: number) => Object.entries(Rating).find(([, v]) => v === g)![0];
const SN = (g: number) => Object.entries(State).find(([, v]) => v === g)![0];

const FACT = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableShortTerm: true, learningSteps: ['5m'], relearningSteps: ['5m'], enableFuzz: true, maximumInterval: 365 });
const FAM = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85, enableShortTerm: false, learningSteps: [], relearningSteps: [], enableFuzz: true, maximumInterval: 180 });
console.log('FACT.config', j({ ...FACT.config, weights: '[' + FACT.config.weights.length + ']' }));
console.log('FAM.config ', j({ ...FAM.config, weights: '[' + FAM.config.weights.length + ']' }));
console.log('model name', FACT.definition.model.name);

for (const [name, s] of [['FACT', FACT], ['FAM', FAM]] as const) {
  console.log(`\n== ${name}: first review of a new card, each rating`);
  const c = s.newCard({ now, cardId: 'card-1' });
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
    const r = s.review({ card: c, grade: g, now });
    console.log(RN(g).padEnd(5), 'state', SN(r.card.state).padEnd(10), 'status', r.card.scheduleStatus.padEnd(10), 'S', r.card.stability.toFixed(3), 'Sf', r.card.stabilityFast.toFixed(3), 'D', r.card.difficulty.toFixed(2), 'schedDays', r.card.scheduledDays.toFixed(4), 'due', r.card.dueAt.toISOString(), 'step', r.card.learningStep);
  }
  console.log(`== ${name}: Good x3 on time, then each rating`);
  let card = c; let t = now;
  for (let i = 0; i < 3; i++) { card = s.review({ card, grade: Rating.Good, now: t }).card; console.log('  after Good', i + 1, 'S', card.stability.toFixed(2), 'schedDays', card.scheduledDays, 'due', card.dueAt.toISOString()); t = card.dueAt; }
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
    const r = s.review({ card, grade: g, now: t });
    console.log(RN(g).padEnd(5), 'state', SN(r.card.state).padEnd(10), 'S', r.card.stability.toFixed(2), 'D', r.card.difficulty.toFixed(2), 'schedDays', r.card.scheduledDays.toFixed(3), 'lapses', r.card.lapses, 'reps', r.card.reps);
  }
  console.log(`== ${name}: forgetting curve after 3x Good (S=${card.stability.toFixed(2)})`);
  const last = card.lastReviewAt!;
  for (const d of [0, 0.5, 1, 3, 7, 14, 30, 60, 120]) {
    console.log('  +', String(d).padStart(4), 'd  R =', s.model.forgettingCurve(card, d).toFixed(4));
  }
  console.log('  R at dueAt =', s.model.forgettingCurve(card, s.chrono.difference(last, card.dueAt)).toFixed(4), '(fuzzed; target', s.config.desiredRetention[3], ')');
  console.log('  model.nextInterval(card, dr) =', s.model.nextInterval(card, s.config.desiredRetention[3]).toFixed(3));
}

console.log('\n== new-card retrievability');
const nc = FAM.newCard({ now, cardId: 'n' });
let rNew: unknown; try { rNew = FAM.model.forgettingCurve(nc, 1); } catch (e) { rNew = 'THROWS ' + (e as Error).message; }
console.log('forgettingCurve(newCard, 1) =', rNew);

console.log('\n== JSON round-trip');
let card = FACT.newCard({ now, cardId: 'rt' });
const r1 = FACT.review({ card, grade: Rating.Good, now });
const json = JSON.stringify(r1.card);
console.log('card JSON:', json);
console.log('revlog JSON:', JSON.stringify(r1.revlog));
console.log('symbol keys on live card:', Object.getOwnPropertySymbols(r1.card).map(String));
const parsed = JSON.parse(json);
let errRaw = 'no error';
try { FACT.review({ card: parsed, grade: Rating.Good, now: D('2026-01-10T09:00:00Z') }); } catch (e) { errRaw = (e as Error).constructor.name + ': ' + (e as Error).message; }
console.log('review with string dates ->', errRaw);
const revived = { ...parsed, dueAt: new Date(parsed.dueAt), lastReviewAt: parsed.lastReviewAt ? new Date(parsed.lastReviewAt) : null };
const a = FACT.review({ card: r1.card, grade: Rating.Good, now: D('2026-01-10T09:00:00Z') });
const b = FACT.review({ card: revived, grade: Rating.Good, now: D('2026-01-10T09:00:00Z') });
console.log('round-trip equal:', JSON.stringify(a.card) === JSON.stringify(b.card), JSON.stringify(a.revlog) === JSON.stringify(b.revlog));
// unknown extra fields + missing optional fields
const extra = { ...revived, oakKind: 'fact', modelName: 'fsrs-7' };
let ex: string; try { const r = FACT.review({ card: extra as never, grade: Rating.Good, now: D('2026-01-10T09:00:00Z') }); ex = 'ok; extra keys preserved in output? ' + ('oakKind' in r.card); } catch (e) { ex = 'THROWS ' + (e as Error).message; }
console.log('extra fields ->', ex);
const { stabilityFast, ...noFast } = revived;
let nf: string; try { FACT.review({ card: noFast as never, grade: Rating.Good, now: D('2026-01-10T09:00:00Z') }); nf = 'ok'; } catch (e) { nf = 'THROWS ' + (e as Error).constructor.name + ': ' + (e as Error).message; }
console.log('FSRS-7 card missing stabilityFast ->', nf);

console.log('\n== fuzz determinism (seed = cardId + reps)');
const mk = (id?: string) => { let c = FACT.newCard({ now, cardId: id }); let t = now; const out: number[] = []; for (let i = 0; i < 6; i++) { c = FACT.review({ card: c, grade: Rating.Good, now: t }).card; out.push(c.scheduledDays); t = c.dueAt; } return out; };
console.log('cardId A run1', mk('A').join(','));
console.log('cardId A run2', mk('A').join(','));
console.log('cardId B     ', mk('B').join(','));
const NOFUZZ = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableShortTerm: true, learningSteps: ['5m'], relearningSteps: ['5m'], enableFuzz: false, maximumInterval: 365 });
{ let c = NOFUZZ.newCard({ now, cardId: 'A' }); let t = now; const out: string[] = []; for (let i = 0; i < 6; i++) { c = NOFUZZ.review({ card: c, grade: Rating.Good, now: t }).card; out.push(c.scheduledDays.toFixed(3)); t = c.dueAt; } console.log('no fuzz      ', out.join(',')); }
console.log('auto cardId (no cardId passed):', FACT.newCard({ now }).cardId);

console.log('\n== maximumInterval cap');
{ let c = FAM.newCard({ now, cardId: 'cap' }); let t = now; const out: number[] = []; for (let i = 0; i < 12; i++) { c = FAM.review({ card: c, grade: Rating.Easy, now: t }).card; out.push(+c.scheduledDays.toFixed(1)); t = c.dueAt; } console.log('Easy x12 schedDays', out.join(','), ' S=', c.stability.toFixed(1)); }

console.log('\n== learning steps (FACT: steps 5m)');
{ let c = FACT.newCard({ now, cardId: 'ls' }); let t = now;
  for (const g of [Rating.Again, Rating.Again, Rating.Hard, Rating.Good, Rating.Good, Rating.Again, Rating.Good] as const) { c = FACT.review({ card: c, grade: g, now: t }).card; console.log(' ', RN(g).padEnd(5), SN(c.state).padEnd(10), 'status', c.scheduleStatus.padEnd(10), 'step', c.learningStep, 'schedDays', c.scheduledDays.toFixed(4), `(${(c.scheduledDays * 1440).toFixed(1)} min)`, 'S', c.stability.toFixed(3)); t = c.dueAt; } }
const STRICT = await DefaultScheduler({ version: 'FSRS-7', learningSteps: ['1m', '10m'], relearningSteps: ['10m'], allowModelOverride: false });
{ let c = STRICT.newCard({ now, cardId: 'ls' }); let t = now; console.log(' allowModelOverride:false, steps 1m,10m');
  for (const g of [Rating.Good, Rating.Good, Rating.Good] as const) { c = STRICT.review({ card: c, grade: g, now: t }).card; console.log(' ', RN(g).padEnd(5), SN(c.state).padEnd(10), 'step', c.learningStep, 'schedDays', c.scheduledDays.toFixed(4), `(${(c.scheduledDays * 1440).toFixed(1)} min)`); t = c.dueAt; } }

console.log('\n== version naming');
for (const v of ['FSRS-7', 'FSRS-6', 'FSRS-5', 'FSRS-4.5', 'FSRS-4', 'FSRS-3'] as const) { const s = await DefaultScheduler({ version: v }); const c = s.newCard({ now, cardId: 'v' }); console.log(v.padEnd(9), '-> definition.model.name =', s.definition.model.name, '| fractionalDays', s.config.fractionalDays, '| card keys:', Object.keys(c).join(',')); }
for (const bad of ['fsrs-7', 'FSRS7', '7']) { try { await DefaultScheduler({ version: bad as never }); console.log(bad, 'accepted'); } catch (e) { console.log(JSON.stringify(bad), '->', (e as Error).constructor.name + ':', (e as Error).message); } }

console.log('\n== early / late review, rollback, forget');
{ let c = FAM.newCard({ now, cardId: 'el' }); let t = now; for (let i = 0; i < 3; i++) { c = FAM.review({ card: c, grade: Rating.Good, now: t }).card; t = c.dueAt; }
  const last = c.lastReviewAt!; const iv = c.scheduledDays;
  for (const f of [0.25, 1, 2, 4]) { const at = new Date(last.getTime() + iv * f * day); const r = FAM.review({ card: c, grade: Rating.Good, now: at }); console.log(`  review at ${f}x interval (${(iv * f).toFixed(1)}d, R=${FAM.model.forgettingCurve(c, iv * f).toFixed(3)}): S ${c.stability.toFixed(2)} -> ${r.card.stability.toFixed(2)}, next ${r.card.scheduledDays}`); }
  const r = FAM.review({ card: c, grade: Rating.Again, now: t });
  const back = FAM.rollback({ card: r.card, revlog: r.revlog });
  console.log('  rollback restores card:', JSON.stringify(back) === JSON.stringify(c));
  const f = FAM.forget({ card: c, now: t }); console.log('  forget ->', j(f.card)); }

console.log('\n== input immutability + perf');
{ const c = FAM.newCard({ now, cardId: 'im' }); const before = j(c); FAM.review({ card: c, grade: Rating.Good, now }); console.log('  input mutated:', before !== j(c));
  let x = c; let t = now; const t0 = performance.now(); for (let i = 0; i < 20000; i++) { x = FAM.review({ card: x, grade: (1 + (i % 4)) as 1 | 2 | 3 | 4, now: t }).card; t = new Date(t.getTime() + day); } console.log('  20000 reviews in', (performance.now() - t0).toFixed(0), 'ms'); }
