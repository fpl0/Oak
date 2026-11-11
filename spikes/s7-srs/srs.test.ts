/** S7 — proofs of the real ts-fsrs 6.0.0 API on Bun, plus the Oak wrapper contract. Run: bun test spikes/s7-srs/srs.test.ts */
import { describe, expect, test } from 'bun:test';
import * as fsrs from 'ts-fsrs';
import { DefaultScheduler, Rating, State } from 'ts-fsrs';
import { createSrs, dayIndex, gradeFor, type OakCard } from './srs.ts';

const T0 = new Date('2026-01-05T09:00:00.000Z');
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

describe('ts-fsrs 6.0.0 raw API (Bun)', () => {
  test('exports and async scheduler creation', async () => {
    expect(fsrs.FSRSVersion).toBe('v6.0.0');
    expect(typeof fsrs.DefaultScheduler).toBe('function');
    expect(typeof fsrs.defineScheduler).toBe('function');
    const p = DefaultScheduler();
    expect(p).toBeInstanceOf(Promise);
    const s = await p;
    expect(s.definition.model.name).toBe('fsrs-7'); // option is 'FSRS-7', stored name is 'fsrs-7'
    expect(s.config.desiredRetention).toEqual({ 1: 0.9, 2: 0.9, 3: 0.9, 4: 0.9 });
    expect(s.config.fractionalDays).toBe(true);
    expect(s.config.enableFuzz).toBe(false);
    expect(s.config.learningSteps).toEqual(['1m', '10m']);
    expect(s.config.maximumInterval).toBe(36500);
    expect(s.config.weights.length).toBe(34);
    expect(Rating).toEqual({ Manual: 0, Again: 1, Hard: 2, Good: 3, Easy: 4 });
    expect(State).toEqual({ New: 0, Learning: 1, Review: 2, Relearning: 3 });
    expect((Rating as Record<string, unknown>)['3']).toBeUndefined(); // no reverse mapping: not a TS enum
    await expect(DefaultScheduler({ version: 'fsrs-7' as never })).rejects.toThrow('Unsupported FSRS version');
  });

  test('newCard / preview / review / forgettingCurve / rollback', async () => {
    const s = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableFuzz: false });
    const card = s.newCard({ now: T0, cardId: 'c1' });
    expect(card).toMatchObject({ stability: 0, stabilityFast: 0, difficulty: 0, state: 0, scheduleStatus: 'new', lastReviewAt: null, cardId: 'c1', reps: 0, lapses: 0 });
    const grades = [...s.preview({ card, now: T0 })].map((p) => p.grade);
    expect(grades).toEqual([1, 2, 3, 4]);
    const snapshot = JSON.stringify(card);
    const { card: next, revlog } = s.review({ card, grade: Rating.Good, now: T0 });
    expect(JSON.stringify(card)).toBe(snapshot); // input not mutated
    expect(next.state).toBe(State.Review); // FSRS-7 Good on a new card skips the learning steps (allowModelOverride)
    expect(next.scheduledDays).toBeCloseTo(4.7777, 3); // fractional days
    expect(revlog.rating).toBe(3);
    expect(revlog.state).toBe(State.New); // revlog holds the PRE-review snapshot
    const r1 = s.model.forgettingCurve(next, s.chrono.difference(T0, plus(T0, 1.5)));
    expect(r1).toBeGreaterThan(0.9);
    expect(r1).toBeLessThan(1);
    expect(s.model.forgettingCurve(next, next.scheduledDays)).toBeCloseTo(0.9, 2); // due exactly at desired retention
    expect(s.model.forgettingCurve(card, 1)).toBeCloseTo(0.0804, 3); // garbage for a NEW card: guard it
    expect(JSON.parse(JSON.stringify(s.rollback({ card: next, revlog })))).toEqual(JSON.parse(snapshot)); // same values, different key order
  });

  test('JSON round-trip needs Date revival; extra keys are dropped', async () => {
    const s = await DefaultScheduler({ version: 'FSRS-7' });
    const a = s.review({ card: s.newCard({ now: T0, cardId: 'rt' }), grade: Rating.Good, now: T0 }).card;
    const parsed = JSON.parse(JSON.stringify(a));
    expect(() => s.review({ card: parsed, grade: Rating.Good, now: plus(T0, 5) })).toThrow('Expected valid Date fields');
    const revived = { ...parsed, dueAt: new Date(parsed.dueAt), lastReviewAt: new Date(parsed.lastReviewAt), oakExtra: 1 };
    const x = s.review({ card: a, grade: Rating.Good, now: plus(T0, 5) });
    const y = s.review({ card: revived, grade: Rating.Good, now: plus(T0, 5) });
    expect(JSON.stringify(y.card)).toBe(JSON.stringify(x.card));
    expect('oakExtra' in y.card).toBe(false);
    const { stabilityFast: _drop, ...fsrs6Shaped } = revived;
    expect(() => s.review({ card: fsrs6Shaped as never, grade: Rating.Good, now: plus(T0, 5) })).toThrow('stabilityFast');
  });

  test('gotchas: sub-day intervals and the fuzz range under a small maximumInterval', async () => {
    const fam = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85, enableShortTerm: false, learningSteps: [], relearningSteps: [], maximumInterval: 180 });
    const again = fam.review({ card: fam.newCard({ now: T0, cardId: 'g' }), grade: Rating.Again, now: T0 }).card;
    expect(again.scheduledDays * 86400).toBeLessThan(15); // due again ~10 seconds later
    expect(fsrs.getFuzzRange(13182, 180, 180)).toEqual({ minInterval: 2, maxInterval: 180 }); // anywhere in [2, 180]
    expect(fsrs.getFuzzRange(454, 98, 180)).toEqual({ minInterval: 155, maxInterval: 180 });
  });
});

describe('Oak srs.ts wrapper', () => {
  test('grade map (plan resolution 6)', () => {
    const g = (accuracy: number, fast = false, revealed = false) => gradeFor({ accuracy, fast, revealed });
    expect(g(0.64)).toBe(1);
    expect(g(0.65)).toBe(2);
    expect(g(0.79)).toBe(2);
    expect(g(0.8)).toBe(3);
    expect(g(0.94, true)).toBe(3);
    expect(g(0.95, false)).toBe(3);
    expect(g(0.95, true)).toBe(4);
    expect(g(1, true, true)).toBe(1); // revealed = Again
    expect(g(Number.NaN)).toBe(1);
  });

  test('createCard / review / recallProbability / isDue, both kinds', async () => {
    const srs = await createSrs();
    expect(srs.modelName).toBe('fsrs-7');
    for (const kind of ['fact', 'family'] as const) {
      const c0 = srs.createCard(kind, T0, `${kind}-1`);
      expect(c0).toMatchObject({ id: `${kind}-1`, kind, model: 'fsrs-7', reps: 0, lastReviewAt: null });
      expect(srs.isDue(c0, T0)).toBe(true);
      expect(srs.recallProbability(c0, T0)).toBe(0);
      const r = srs.review(c0, { accuracy: 0.875, fast: false, revealed: false }, T0);
      expect(r.grade).toBe(3);
      expect(c0.reps).toBe(0); // input untouched
      expect(r.card.reps).toBe(1);
      expect(srs.isDue(r.card, T0)).toBe(false);
      expect(srs.recallProbability(r.card, T0)).toBeCloseTo(1, 3);
      const mid = srs.recallProbability(r.card, plus(T0, r.card.scheduledDays));
      expect(mid).toBeGreaterThan(0.8);
      expect(mid).toBeLessThan(0.95);
      expect(srs.isDue(r.card, plus(T0, r.card.scheduledDays + 1))).toBe(true);
      // due dates of >= 1 day snap to the Oak-day rollover (04:00 UTC by default)
      expect(new Date(r.card.dueAt).getUTCHours()).toBe(4);
      expect(dayIndex(r.card.dueAt) - dayIndex(T0)).toBe(r.card.scheduledDays);
    }
  });

  test('every rating from a new card and from a mature card', async () => {
    const srs = await createSrs();
    const outcomes = { again: { accuracy: 0.5, fast: false, revealed: false }, hard: { accuracy: 0.75, fast: false, revealed: false }, good: { accuracy: 0.875, fast: false, revealed: false }, easy: { accuracy: 1, fast: true, revealed: false } };
    const fresh = srs.createCard('family', T0, 'fam');
    const first = Object.fromEntries(Object.entries(outcomes).map(([k, o]) => [k, srs.review(fresh, o, T0).card.scheduledDays]));
    expect(first.again).toBe(1); // Oak floor: the model said ~10 s
    expect(first.hard).toBeGreaterThanOrEqual(2);
    expect(first.good).toBeGreaterThan(first.hard as number);
    expect(first.easy).toBeGreaterThan(first.good as number);
    expect(first.easy).toBeLessThanOrEqual(180); // Oak cap
    let mature: OakCard = fresh;
    let t = T0;
    for (let i = 0; i < 3; i++) {
      mature = srs.review(mature, outcomes.good, t).card;
      t = new Date(mature.dueAt);
    }
    const lapse = srs.review(mature, outcomes.again, t);
    expect(lapse.card.lapses).toBe(1);
    expect(lapse.card.stability).toBeLessThan(mature.stability);
    expect(lapse.revlog.prev.stability).toBe(mature.stability);
    expect(srs.review(mature, outcomes.easy, t).card.stability).toBeGreaterThan(mature.stability);
    // fact learning step survives (sub-day): Again on a new fact is due in 5 minutes
    const fact = srs.review(srs.createCard('fact', T0, 'f'), outcomes.again, T0).card;
    expect(new Date(fact.dueAt).getTime() - T0.getTime()).toBe(5 * 60_000);
  });

  test('persisted JSON round-trips exactly and reviews identically', async () => {
    const srs = await createSrs();
    let live = srs.createCard('family', T0, 'json');
    let stored: OakCard = JSON.parse(JSON.stringify(live));
    let t = T0;
    for (const accuracy of [0.875, 0.75, 1, 0.5, 0.875, 1]) {
      const a = srs.review(live, { accuracy, fast: true, revealed: false }, t);
      const b = srs.review(stored, { accuracy, fast: true, revealed: false }, t);
      expect(b).toEqual(a);
      expect(JSON.parse(JSON.stringify(b))).toEqual(b); // card + revlog are plain JSON already
      live = a.card;
      stored = JSON.parse(JSON.stringify(b.card));
      t = plus(new Date(live.dueAt), 0.3);
    }
    expect(() => srs.review({ ...stored, model: 'fsrs-6' }, { accuracy: 1, fast: false, revealed: false }, t)).toThrow('migrate');
  });

  test('parameters: retention, caps, floor, deterministic day pick, pickDay hook', async () => {
    const good = { accuracy: 0.875, fast: false, revealed: false };
    const lowRet = await createSrs();
    const highRet = await createSrs({ family: { ...lowRet.config.family, desiredRetention: 0.95 } });
    const run = async (srs: Awaited<ReturnType<typeof createSrs>>, id: string, n: number, opts = {}) => {
      let c = srs.createCard('family', T0, id);
      let t = T0;
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        c = srs.review(c, good, t, opts).card;
        out.push(c.scheduledDays);
        t = new Date(c.dueAt);
      }
      return out;
    };
    const a = await run(lowRet, 'x', 4);
    expect(await run(lowRet, 'x', 4)).toEqual(a); // deterministic for the same card id
    const b = await run(highRet, 'x', 4);
    expect(b[1]).toBeLessThan(a[1] as number); // higher retention => shorter intervals
    expect(Math.max(...a)).toBeLessThanOrEqual(180);
    expect(Math.max(...(await run(lowRet, 'x', 6, { maxIntervalDays: 5 })))).toBeLessThanOrEqual(5);
    const picked = await run(lowRet, 'x', 3, { pickDay: (_ideal: number, lo: number, _hi: number) => lo });
    expect(picked[2]).toBeLessThanOrEqual(a[2] as number);
    expect(lowRet.intervalAt(lowRet.review(lowRet.createCard('family', T0, 'i'), good, T0).card, 0.9)).toBeCloseTo(4.78, 1);
    expect(Object.keys(lowRet.preview(lowRet.createCard('fact', T0, 'p'), T0))).toEqual(['1', '2', '3', '4']);
  });
});
