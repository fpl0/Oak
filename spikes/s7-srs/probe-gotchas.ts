import { DefaultScheduler, Rating, getFuzzRange } from 'ts-fsrs';
console.log('getFuzzRange(13182, elapsed 180, max 180) =', getFuzzRange(13182, 180, 180));
console.log('getFuzzRange(13182, elapsed 100, max 180) =', getFuzzRange(13182, 100, 180));
console.log('getFuzzRange(454,   elapsed 98,  max 180) =', getFuzzRange(454, 98, 180));
console.log('getFuzzRange(180,   elapsed 180, max 180) =', getFuzzRange(180, 180, 180));
console.log('getFuzzRange(100,   elapsed 30,  max 180) =', getFuzzRange(100, 30, 180));
const now = new Date('2026-01-01T09:00:00.000Z');
const s = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85, enableShortTerm: false, learningSteps: [], relearningSteps: [], enableFuzz: false, maximumInterval: 36500 });
const c1 = s.review({ card: s.newCard({ now, cardId: 'a' }), grade: Rating.Good, now }).card;
// Oak overrides the schedule (cap to 4 days) without touching memory state
const c1o = { ...c1, scheduledDays: 4, dueAt: new Date(now.getTime() + 4 * 86400000) };
const at = new Date(now.getTime() + 4 * 86400000);
const a = s.review({ card: c1, grade: Rating.Good, now: at }).card;
const b = s.review({ card: c1o, grade: Rating.Good, now: at }).card;
console.log('memory identical after Oak-overridden schedule:', a.stability === b.stability && a.stabilityFast === b.stabilityFast && a.difficulty === b.difficulty, '| sched', a.scheduledDays.toFixed(2), b.scheduledDays.toFixed(2));
// capped-cadence growth: Good every 4 days at dr .85 -> stability, t90
let c: any = s.newCard({ now, cardId: 'b' }); let t = now;
for (let i = 0; i < 8; i++) { c = s.review({ card: c, grade: Rating.Good, now: t }).card; console.log(`Good #${i + 1} (every 4d): S=${c.stability.toFixed(2)} t90=${s.model.nextInterval(c, 0.9).toFixed(1)}d t85=${c.scheduledDays.toFixed(1)}d`); t = new Date(t.getTime() + 4 * 86400000); }
// same-day second review
const again = s.review({ card: s.newCard({ now, cardId: 'c' }), grade: Rating.Again, now }).card;
console.log('Again on new family card (enableShortTerm:false): state', again.state, 'scheduledDays', again.scheduledDays, '=', (again.scheduledDays * 86400).toFixed(1), 's');
const top = await import('ts-fsrs/models/fsrs-7'); console.log('ts-fsrs/models/fsrs-7 exports:', Object.keys(top).join(', '));
const mw = await import('ts-fsrs/middlewares'); console.log('ts-fsrs/middlewares exports:', Object.keys(mw).length, 'names');
