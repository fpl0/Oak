import { DefaultScheduler, Rating } from 'ts-fsrs';
const now = new Date('2026-01-01T09:00:00.000Z');
type G = 1 | 2 | 3 | 4;
async function seq(version: 'FSRS-6' | 'FSRS-7', dr: number, grades: G[], shortTerm = false) {
  const s = await DefaultScheduler({ version, desiredRetention: dr, enableShortTerm: shortTerm, learningSteps: [], relearningSteps: [], enableFuzz: false, maximumInterval: 36500 });
  let c: any = s.newCard({ now, cardId: 'x' }); let t = now; const out: string[] = [];
  for (const g of grades) { c = s.review({ card: c, grade: g, now: t }).card; out.push(`${c.scheduledDays < 10 ? c.scheduledDays.toFixed(2) : c.scheduledDays.toFixed(0)}d(S${c.stability.toFixed(1)})`); t = new Date(Math.max(c.dueAt.getTime(), t.getTime() + 86400000)); }
  return out.join(' ');
}
const G5: G[] = [3, 3, 3, 3, 3], H5: G[] = [2, 2, 2, 2, 2], mix: G[] = [3, 2, 3, 1, 3, 3], hg: G[] = [2, 3, 2, 3, 2, 3];
for (const v of ['FSRS-6', 'FSRS-7'] as const) for (const dr of [0.85, 0.9, 0.95]) {
  console.log(`\n${v} dr=${dr} (no fuzz, no cap, enableShortTerm:false; next review at max(due, +1d))`);
  console.log('  Good x5      :', await seq(v, dr, G5));
  console.log('  Hard x5      :', await seq(v, dr, H5));
  console.log('  H G H G H G  :', await seq(v, dr, hg));
  console.log('  G H G A G G  :', await seq(v, dr, mix));
  console.log('  Easy,Good x3 :', await seq(v, dr, [4, 3, 3, 3]));
  console.log('  Again x3,G x3:', await seq(v, dr, [1, 1, 1, 3, 3, 3]));
}
// FSRS-7: what does "stability" mean? interval where R = 0.9 / 0.85 for given S (Sf = 0.8 S, D = 5)
const s7 = await DefaultScheduler({ version: 'FSRS-7' });
console.log('\nFSRS-7: stability vs interval-at-R (D=5, Sf=0.8S)');
for (const S of [1, 3.92, 7, 14, 21, 30, 60, 120]) { const st = { stability: S, stabilityFast: 0.8 * S, difficulty: 5 }; console.log(`  S=${String(S).padEnd(5)} t(R=.90)=${s7.model.nextInterval(st, 0.9).toFixed(1).padStart(7)}d  t(R=.85)=${s7.model.nextInterval(st, 0.85).toFixed(1).padStart(7)}d  R(S days)=${s7.model.forgettingCurve(st, S).toFixed(3)}  R(21d)=${s7.model.forgettingCurve(st, 21).toFixed(3)}`); }
const s6 = await DefaultScheduler({ version: 'FSRS-6' });
console.log('FSRS-6: stability vs interval-at-R');
for (const S of [3.92, 21, 60]) { const st = { stability: S, difficulty: 5 }; console.log(`  S=${String(S).padEnd(5)} t(R=.90)=${s6.model.nextInterval(st, 0.9).toFixed(1).padStart(7)}d  t(R=.85)=${s6.model.nextInterval(st, 0.85).toFixed(1).padStart(7)}d  R(S days)=${s6.model.forgettingCurve(st, S).toFixed(3)}`); }
// the Easy x12 anomaly with cap 180 + fuzz
const FAM = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85, enableShortTerm: false, learningSteps: [], relearningSteps: [], enableFuzz: true, maximumInterval: 180 });
{ let c: any = FAM.newCard({ now, cardId: 'cap' }); let t = now; console.log('\nEasy x10 (fuzz on, cap 180):');
  for (let i = 0; i < 10; i++) { const r = FAM.review({ card: c, grade: Rating.Easy, now: t }); c = r.card; console.log(`  #${i + 1} S=${c.stability.toFixed(1)} Sf=${c.stabilityFast.toFixed(1)} D=${c.difficulty.toFixed(2)} model.nextInterval=${FAM.model.nextInterval(c, 0.85).toFixed(1)} scheduledDays=${c.scheduledDays}`); t = c.dueAt; } }
// forget() shape
{ const c = FAM.review({ card: FAM.newCard({ now, cardId: 'f' }), grade: Rating.Good, now }).card; const f: any = FAM.forget({ card: c, now }); console.log('\nforget() returns keys:', Object.keys(f), JSON.stringify(f)); }
