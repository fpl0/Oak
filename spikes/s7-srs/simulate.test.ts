/**
 * S7 — review-load governor: unit tests + the 300-day simulation gate.
 * Run: bun test spikes/s7-srs/simulate.test.ts   (prints the tables that FINDINGS.md quotes)
 *
 * Deterministic: every draw is mulberry32(FNV-1a(seed | event key)). No Math.random, no wall clock.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  admitFamilies,
  admitNewFacts,
  BUDGET_SEC_BY_SESSION_MIN,
  DEFAULT_GOVERNOR,
  forecastLoad,
  type GovernorConfig,
  makeDayPicker,
  planWarmup,
  RECOMMENDED_GOVERNOR,
  type ReviewItem,
  shouldGraduate,
  smoothBacklog,
} from './governor.ts';
import { buildTimeline, DEFAULT_LEARNER, FAMILIES, percentile, type SimOptions, type SimSummary, simulate } from './sim.ts';
import { createSrs, DEFAULT_SRS_CONFIG, type Srs } from './srs.ts';

const SEEDS = ['a1', 'b2', 'c3', 'd4', 'e5'];
const gov = (g: Partial<GovernorConfig>): GovernorConfig => ({ ...DEFAULT_GOVERNOR, ...g });
const item = (id: string, cls: ReviewItem['cls'], sec: number, dueDay: number, recall: number, extra: Partial<ReviewItem> = {}): ReviewItem => ({ id, cls, sec, dueDay, recall, ...extra });

let srsPlan: Srs; // plan schedulers: facts 0.90, families 0.85
let srsRec: Srs; // recommended: facts 0.85, families 0.85
beforeAll(async () => {
  srsPlan = await createSrs();
  srsRec = await createSrs({ fact: { ...DEFAULT_SRS_CONFIG.fact, desiredRetention: 0.85 } });
});

// ───────────────────────────── helpers ─────────────────────────────

const med = (v: number[]) => percentile(v, 50);
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
function runSeeds(srs: Srs, o: Partial<SimOptions>, seeds = SEEDS): SimSummary[] {
  return seeds.map((seed) => simulate(srs, { ...o, seed }).summary);
}
/** "median (min–max)" over seeds */
function mm(rs: SimSummary[], f: (s: SimSummary) => number, fmt: (x: number) => string = (x) => x.toFixed(0)): string {
  const v = rs.map(f);
  return `${fmt(med(v))} (${fmt(Math.min(...v))}–${fmt(Math.max(...v))})`;
}
function printTable(title: string, header: string[], rows: string[][]) {
  console.log(`\n### ${title}\n`);
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
}
const LOAD_HEADER = ['scenario', 'warm-up min p50', 'warm-up min p95', 'warm-up min max', 'due-load min p95', 'hidden overflow s p95 (steady)', 'days late p95', 'new-fact queue at day 300', 'family wait days p95', 'families queued at day 300', 'at mastery / unlocked', 'graduated'];
function loadRow(name: string, rs: SimSummary[]): string[] {
  return [
    name,
    mm(rs, (s) => s.warmupMin.p50, f1),
    mm(rs, (s) => s.warmupMin.p95, f2),
    mm(rs, (s) => s.warmupMin.max, f1),
    mm(rs, (s) => s.demandMin.p95, f1),
    mm(rs, (s) => s.steadyBacklogSec.p95),
    mm(rs, (s) => s.lateDays.p95),
    mm(rs, (s) => s.facts.newQueueAtEnd),
    mm(rs, (s) => s.queueWaitDays.p95),
    mm(rs, (s) => s.families.queued),
    `${med(rs.map((s) => s.families.atMastery))} / ${med(rs.map((s) => s.families.unlocked))}`,
    mm(rs, (s) => s.families.graduated),
  ];
}

/** The configuration this spike recommends (see FINDINGS.md §4). */
const CADENCE_DAYS = 7;
const REC_FACTS_PER_LESSON = 2;
function recommended(sessionMin: 15 | 20 | 25): Partial<SimOptions> {
  return {
    governor: { ...RECOMMENDED_GOVERNOR, budgetSec: BUDGET_SEC_BY_SESSION_MIN[sessionMin] },
    factsPerLesson: REC_FACTS_PER_LESSON,
    sessionsPerLesson: sessionMin === 15 ? 2 : 1, // 15-min setting: lessons are split at the save-and-wrap midpoint
  };
}

// ───────────────────────────── governor unit tests ─────────────────────────────

describe('governor (pure policy)', () => {
  test('budget table', () => {
    expect(BUDGET_SEC_BY_SESSION_MIN).toEqual({ 15: 240, 20: 300, 25: 360 });
    expect(RECOMMENDED_GOVERNOR.activeMaxIntervalDays).toBe(CADENCE_DAYS);
    expect(DEFAULT_GOVERNOR.activeMaxIntervalDays).toBeNull(); // the plan as written has no cadence
  });

  test('planWarmup: strict budget, easy-win opener, leftovers hidden, shares respected', () => {
    const cfg = gov({ budgetSec: 240 });
    const due = [
      item('fam.a', 'family', 70, 100, 0.8),
      item('fam.b', 'family', 70, 100, 0.7),
      item('fam.c', 'family', 90, 99, 0.6),
      item('fam.d', 'family', 65, 100, 0.86),
      ...Array.from({ length: 12 }, (_, i) => item(`fact:${i}`, 'fact', 8, 100, 0.9 - i * 0.01)),
    ];
    const plan = planWarmup(due, 100, 0, cfg);
    expect(plan.demandSec).toBe(70 + 70 + 90 + 65 + 96);
    expect(plan.usedSec).toBeLessThanOrEqual(240 * cfg.planFraction);
    expect(plan.selected[0]?.id).toBe('fact:0'); // highest recall opens
    expect(plan.selected.map((x) => x.id)).toContain('fam.c'); // the most forgotten set gets in
    expect(plan.selected.length + plan.leftover.length).toBe(due.length);
    expect(plan.leftover.length).toBeGreaterThan(0);
    const factSec = plan.selected.filter((x) => x.cls === 'fact').reduce((a, x) => a + x.sec, 0);
    expect(factSec).toBeGreaterThanOrEqual(80); // facts are not starved by sets
    // a single oversized item is still shown (never an empty warm-up when something is due)
    expect(planWarmup([item('big', 'family', 400, 100, 0.5)], 100, 0, cfg).selected.length).toBe(1);
    // governor off = everything
    expect(planWarmup(due, 100, 0, gov({ enabled: false })).selected.length).toBe(due.length);
  });

  test('planWarmup: aging beats recall eventually; return day prefers the 0.75–0.90 band', () => {
    const cfg = gov({ budgetSec: 100, planFraction: 1, factShare: 0 });
    const fresh = item('fresh', 'family', 60, 100, 0.7);
    const stale = item('stale', 'family', 60, 80, 0.93); // 20 days late
    expect(planWarmup([fresh, stale], 100, 0, cfg).selected[0]?.id).toBe('stale'); // also the opener (highest recall)
    const a = item('weak', 'family', 60, 100, 0.5);
    const b = item('band', 'family', 60, 100, 0.85);
    const c = item('strong', 'family', 30, 100, 0.97);
    const back = planWarmup([a, b, c], 100, 5, cfg).selected.map((x) => x.id);
    expect(back).toEqual(['strong', 'band']); // opener, then the in-band item ahead of the weakest
  });

  test('smoothBacklog spreads a post-gap backlog over >= 6 days with bounded daily slices', () => {
    const cfg = gov({ budgetSec: 300 });
    const overdue = Array.from({ length: 12 }, (_, i) => item(`fam.${i}`, 'family', 70, 90, 0.6 + i * 0.03));
    const out = smoothBacklog(overdue, 100, cfg);
    expect(out.size).toBe(12);
    const perDay = new Map<number, number>();
    for (const it of overdue) perDay.set(out.get(it.id)!, (perDay.get(out.get(it.id)!) ?? 0) + it.sec);
    expect(perDay.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...perDay.keys()) - 100).toBeLessThanOrEqual(6);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(cfg.backlogShare * cfg.budgetSec + 70);
    // items in the 0.75–0.90 recall band are served before everything else (fam.5 … fam.10 here)
    const dayOf = (i: number) => out.get(`fam.${i}`)!;
    expect(dayOf(10)).toBe(100);
    const band = [5, 6, 7, 8, 9, 10].map(dayOf);
    const rest = [0, 1, 2, 3, 4, 11].map(dayOf);
    expect(Math.max(...band)).toBeLessThanOrEqual(Math.min(...rest));
    // a huge backlog stretches beyond the default spread instead of overfilling days
    const huge = Array.from({ length: 60 }, (_, i) => item(`f.${i}`, 'family', 70, 90, 0.5));
    expect(Math.max(...smoothBacklog(huge, 100, cfg).values()) - 100).toBeGreaterThan(6);
  });

  test('admitFamilies: cap of 12, forecast headroom, pause', () => {
    const cfg = gov({ budgetSec: 300, activeMaxIntervalDays: 7 });
    const none: ReviewItem[] = [];
    expect(admitFamilies({ activeCount: 0, queuedSecs: new Array(20).fill(5), items: none, today: 0 }, cfg)).toBe(12);
    expect(admitFamilies({ activeCount: 12, queuedSecs: [60], items: none, today: 0 }, cfg)).toBe(0);
    expect(admitFamilies({ activeCount: 3, queuedSecs: [60], items: none, today: 0, paused: true }, cfg)).toBe(0);
    const busy = Array.from({ length: 11 }, (_, i) => item(`fam.${i}`, 'family', 70, i % 7, 0.8, { repeatDays: 7 }));
    expect(admitFamilies({ activeCount: 11, queuedSecs: [70], items: busy, today: 0 }, cfg)).toBe(0); // forecast full before the cap
    expect(admitFamilies({ activeCount: 0, queuedSecs: [70, 70], items: none, today: 0 }, gov({ enabled: false }))).toBe(2);
    expect(forecastLoad([item('x', 'family', 60, 2, 0, { repeatDays: 3 })], 0, 7)).toEqual([0, 0, 60, 0, 0, 60, 0, 0]);
  });

  test('admitNewFacts: bounded by room today, per-session cap and the fact forecast', () => {
    const cfg = gov({ budgetSec: 300 });
    expect(admitNewFacts({ waiting: 30, usedSec: 0, factSec: 8, items: [], today: 0 }, cfg)).toBe(cfg.maxNewFactsPerSession);
    expect(admitNewFacts({ waiting: 30, usedSec: 270, factSec: 8, items: [], today: 0 }, cfg)).toBe(1);
    const heavy = Array.from({ length: 90 }, (_, i) => item(`fact:${i}`, 'fact', 8, i % 8, 0.9));
    expect(admitNewFacts({ waiting: 30, usedSec: 0, factSec: 8, items: heavy, today: 0 }, cfg)).toBe(0);
    expect(admitNewFacts({ waiting: 30, usedSec: 0, factSec: 8, items: [], today: 0, paused: true }, cfg)).toBe(0);
  });

  test('shouldGraduate and the day picker', () => {
    const cfg = gov({});
    expect(shouldGraduate({ level: 3, masteryLevel: 3, t90Days: 22, stability: 10 }, cfg)).toBe(true);
    expect(shouldGraduate({ level: 2, masteryLevel: 3, t90Days: 200, stability: 90 }, cfg)).toBe(false);
    expect(shouldGraduate({ level: 3, masteryLevel: 3, t90Days: 20, stability: 30 }, cfg)).toBe(false);
    expect(shouldGraduate({ level: 3, masteryLevel: 3, t90Days: 20, stability: 30 }, gov({ graduateMetric: 'stability' }))).toBe(true);
    // today = 100; days 103 and 104 are empty but the learner never practises on them (they land on 105)
    const load = new Map([
      [105, 200],
      [106, 10],
      [107, 120],
    ]);
    const hashFuzz = (lo: number) => lo;
    expect(makeDayPicker(load, 100, cfg, hashFuzz)(6, 3, 7)).toBe(4); // naive: an empty day, the one closest to the ideal
    const practisesOn = (day: number) => day % 7 < 5; // 103 % 7 = 5 and 104 % 7 = 6 are the learner's days off
    expect(makeDayPicker(load, 100, cfg, hashFuzz, practisesOn)(6, 3, 7)).toBe(6); // 103/104 would pile onto 105
    expect(makeDayPicker(load, 100, gov({ loadBalance: false }), hashFuzz, practisesOn)(6, 3, 7)).toBe(3); // falls back to the hash fuzz
  });
});

// ───────────────────────────── simulation ─────────────────────────────

describe('300-day simulation', () => {
  test('catalog and timeline match docs/design/exercises.md §4.4', () => {
    const timeline = buildTimeline();
    expect(timeline.length).toBe(237);
    expect(FAMILIES.filter((f) => f.kind === 'P').length).toBe(47);
    expect(FAMILIES.filter((f) => f.kind === 'C').length).toBe(12);
    for (const f of FAMILIES) expect(timeline).toContain(f.unlock);
  });

  test('deterministic for a seed; different for another seed', () => {
    const a = simulate(srsRec, { ...recommended(20), seed: 'a1' });
    const b = simulate(srsRec, { ...recommended(20), seed: 'a1' });
    const c = simulate(srsRec, { ...recommended(20), seed: 'b2' });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c.rows)).not.toBe(JSON.stringify(a.rows));
    // the calendar: 300 days, Mon–Fri, minus two 4-day gaps and one 10-day gap
    expect(a.rows.length).toBe(205);
    expect(a.rows.filter((r) => r.gap === 4).length).toBe(2);
    expect(a.rows.filter((r) => r.gap === 10).length).toBe(1);
  });

  test(
    'TABLE 1 — plan intake (3 fact cards/lesson + decks, facts at 0.90): without vs with the governor',
    () => {
      const rows: string[][] = [];
      const b0 = runSeeds(srsPlan, { governor: gov({ enabled: false }) });
      const b1 = runSeeds(srsPlan, { governor: gov({ enabled: false }), ungovernedCadenceDays: CADENCE_DAYS });
      rows.push(loadRow('no governor · pure FSRS-7 intervals', b0));
      rows.push(loadRow(`no governor · families reviewed at least every ${CADENCE_DAYS} d until mastery`, b1));
      const g0: Record<number, SimSummary[]> = {};
      const g1: Record<number, SimSummary[]> = {};
      for (const m of [15, 20, 25] as const) {
        const budgetSec = BUDGET_SEC_BY_SESSION_MIN[m];
        g0[m] = runSeeds(srsPlan, { governor: gov({ budgetSec }) });
        g1[m] = runSeeds(srsPlan, { governor: gov({ budgetSec, activeMaxIntervalDays: CADENCE_DAYS }) });
        rows.push(loadRow(`plan governor as written · budget ${budgetSec / 60} min`, g0[m]));
      }
      for (const m of [15, 20, 25] as const) rows.push(loadRow(`plan governor + ${CADENCE_DAYS}-day cadence · budget ${BUDGET_SEC_BY_SESSION_MIN[m] / 60} min`, g1[m]!));
      printTable('TABLE 1 — plan intake, 5 seeds: median (min–max)', LOAD_HEADER, rows);
      console.log(`\nrealised set accuracy: no governor ${mm(b0, (s) => s.accuracy, (x) => x.toFixed(3))} · governor+cadence 5 min ${mm(g1[20]!, (s) => s.accuracy, (x) => x.toFixed(3))}`);
      console.log(`reviews in 300 days (median): no governor ${med(b0.map((s) => s.setReviews))} sets + ${med(b0.map((s) => s.facts.reviews))} fact reviews over ${med(b0.map((s) => s.facts.cards))} fact cards`);

      // characterisation: these are the facts FINDINGS.md relies on
      for (const s of b0) expect(s.warmupMin.p95).toBeGreaterThan(6); // ungoverned p95 breaks every budget
      for (const s of b1) expect(s.warmupMin.p95).toBeGreaterThan(9);
      for (const m of [15, 20, 25] as const) {
        const budgetMin = BUDGET_SEC_BY_SESSION_MIN[m] / 60;
        for (const s of g0[m]!) {
          expect(s.warmupMin.p95).toBeLessThanOrEqual(budgetMin); // the plan gate holds by construction...
          expect(s.families.queued).toBeGreaterThanOrEqual(15); // ...because most families never start
        }
        for (const s of g1[m]!) expect(s.warmupMin.p95).toBeLessThanOrEqual(budgetMin);
      }
      // with the cadence the families flow, but plan intake of facts does not fit 4 or 5 minutes
      expect(med(g1[20]!.map((s) => s.facts.newQueueAtEnd))).toBeGreaterThan(60);
      expect(med(g1[15]!.map((s) => s.facts.newQueueAtEnd))).toBeGreaterThan(150);
    },
    120_000,
  );

  test(
    'TABLE 2 — minimal parameter changes, per session length',
    () => {
      const rows: string[][] = [];
      for (const m of [25, 20, 15] as const) {
        const budgetSec = BUDGET_SEC_BY_SESSION_MIN[m];
        const g = gov({ budgetSec, activeMaxIntervalDays: CADENCE_DAYS });
        const spl = m === 15 ? 2 : 1;
        const tag = `${m}-min session (budget ${budgetSec / 60} min${m === 15 ? ', lesson = 2 sessions' : ''})`;
        if (m === 15) rows.push(loadRow(`15-min session, one lesson per session · cadence + facts 0.85 + 2 cards/lesson`, runSeeds(srsRec, { governor: g, factsPerLesson: 2 })));
        rows.push(loadRow(`${tag} · cadence only (3 cards/lesson, facts 0.90)`, runSeeds(srsPlan, { governor: g, sessionsPerLesson: spl })));
        rows.push(loadRow(`${tag} · + facts at 0.85`, runSeeds(srsRec, { governor: g, sessionsPerLesson: spl })));
        rows.push(loadRow(`${tag} · + 2 cards/lesson (facts 0.90)`, runSeeds(srsPlan, { governor: g, sessionsPerLesson: spl, factsPerLesson: 2 })));
        rows.push(loadRow(`${tag} · + both = RECOMMENDED`, runSeeds(srsRec, { ...recommended(m) })));
      }
      printTable('TABLE 2 — governor + 7-day cadence, then one change at a time, 5 seeds: median (min–max)', LOAD_HEADER, rows);
    },
    120_000,
  );

  test(
    'CI GATE — recommended configuration, every budget, every seed',
    () => {
      const rows: string[][] = [];
      for (const m of [15, 20, 25] as const) {
        const budgetMin = BUDGET_SEC_BY_SESSION_MIN[m] / 60;
        const rs = runSeeds(srsRec, recommended(m));
        rows.push([
          `${m} min`,
          String(budgetMin),
          mm(rs, (s) => s.warmupMin.p50, f1),
          mm(rs, (s) => s.warmupMin.p95, f2),
          mm(rs, (s) => s.warmupMin.max, f2),
          mm(rs, (s) => s.steadyBacklogSec.p95),
          mm(rs, (s) => s.lateDays.p95),
          mm(rs, (s) => s.facts.newQueueAtEnd),
          mm(rs, (s) => s.queueWaitDays.p95),
          mm(rs, (s) => (100 * s.families.atMastery) / s.families.unlocked),
          mm(rs, (s) => Math.max(...s.sessionsToClearAfterGap)),
          mm(rs, (s) => s.accuracy, (x) => x.toFixed(3)),
          mm(rs, (s) => s.recallAtReview.family, f2),
          mm(rs, (s) => s.recallAtReview.fact, f2),
        ]);
        for (const s of rs) {
          // 1. THE PLAN GATE: p95 warm-up <= budget
          expect(s.warmupMin.p95).toBeLessThanOrEqual(budgetMin);
          expect(s.warmupMin.max).toBeLessThanOrEqual(budgetMin * 1.05);
          // 2. the hidden overflow stays small and short-lived
          expect(s.steadyBacklogSec.p95).toBeLessThanOrEqual(budgetMin * 60);
          expect(s.lateDays.p95).toBeLessThanOrEqual(4);
          // 3. intake is sustainable: nothing piles up behind the throttle
          expect(s.facts.newQueueAtEnd).toBeLessThanOrEqual(15);
          expect(s.families.queued).toBeLessThanOrEqual(2);
          expect(s.queueWaitDays.p95).toBeLessThanOrEqual(60);
          // 4. learning still happens
          expect(s.families.atMastery / s.families.unlocked).toBeGreaterThanOrEqual(0.85);
          // 5. after every gap the overflow is back to <= one set within 14 sessions
          for (const n of s.sessionsToClearAfterGap) {
            expect(n).toBeGreaterThan(0);
            expect(n).toBeLessThanOrEqual(14);
          }
          // the simulated learner is the one the task asked for
          expect(s.accuracy).toBeGreaterThan(0.82);
          expect(s.accuracy).toBeLessThan(0.88);
        }
      }
      printTable(
        'CI GATE — recommended configuration, 5 seeds: median (min–max)',
        ['session', 'budget min', 'warm-up p50', 'warm-up p95', 'warm-up max', 'hidden overflow s p95 (steady)', 'days late p95', 'new-fact queue at day 300', 'family wait days p95', '% at mastery', 'sessions to clear after a gap (worst of 3)', 'set accuracy', 'recall at review: sets', 'recall at review: facts'],
        rows,
      );
    },
    120_000,
  );

  test(
    'TABLE 3 — backlog and warm-up over time (seed a1)',
    () => {
      const cols: [string, SimSummary][] = [
        ['no governor', simulate(srsPlan, { seed: 'a1', governor: gov({ enabled: false }) }).summary],
        ['plan governor as written, 5 min', simulate(srsPlan, { seed: 'a1', governor: gov({ budgetSec: 300 }) }).summary],
        ['recommended, 4 min', simulate(srsRec, { ...recommended(15), seed: 'a1' }).summary],
        ['recommended, 5 min', simulate(srsRec, { ...recommended(20), seed: 'a1' }).summary],
        ['recommended, 6 min', simulate(srsRec, { ...recommended(25), seed: 'a1' }).summary],
      ];
      const rows: string[][] = [];
      for (let m = 0; m < 10; m++) {
        rows.push([`${m * 30 + 1}–${(m + 1) * 30}`, ...cols.flatMap(([, s]) => {
          const b = s.backlogByMonth[m]!;
          return [`${f1(b.meanWarmupMin)} / ${f1(b.maxWarmupMin)}`, `${b.meanSec.toFixed(0)} / ${b.maxSec.toFixed(0)}`];
        })]);
      }
      printTable('TABLE 3 — by 30-day window: warm-up minutes mean / max, and hidden overflow seconds after the session mean / max', ['days', ...cols.flatMap(([n]) => [`${n}: warm-up`, `${n}: overflow`])], rows);
      const rec = simulate(srsRec, { ...recommended(20), seed: 'a1' });
      const gapRows = rec.rows.filter((r, i) => r.gap >= 3 || (i > 0 && rec.rows.slice(Math.max(0, i - 7), i).some((p) => p.gap >= 3)));
      printTable(
        'TABLE 3b — recommended, 5 min, seed a1: the sessions after each gap',
        ['day', 'days off before', 'session', 'warm-up min', 'due load min', 'hidden overflow s', 'active', 'queued'],
        gapRows.map((r) => [String(r.day), String(r.gap), r.entry, f1(r.warmupSec / 60), f1(r.demandSec / 60), r.backlogSec.toFixed(0), String(r.active), String(r.queued)]),
      );
      expect(rec.rows.find((r) => r.gap === 10)?.entry).toBe('light');
    },
    60_000,
  );

  test(
    'TABLE 4 — robustness of the recommended configuration',
    () => {
      const seeds = SEEDS.slice(0, 3);
      const variants: [string, (o: Partial<SimOptions>) => Partial<SimOptions>][] = [
        ['as recommended', (o) => o],
        ['five random days a week instead of Mon–Fri', (o) => ({ ...o, calendar: 'random5' })],
        ['slow learner (tau 4 sets)', (o) => ({ ...o, learner: { ...DEFAULT_LEARNER, tau: 4 } })],
        ['fast learner (tau 1.5 sets)', (o) => ({ ...o, learner: { ...DEFAULT_LEARNER, tau: 1.5 } })],
        ['no in-lesson evidence', (o) => ({ ...o, learner: { ...DEFAULT_LEARNER, inLessonEvidenceProb: 0 } })],
        ['graduate on raw stability > 21 instead of t90 > 21 d', (o) => ({ ...o, governor: { ...o.governor!, graduateMetric: 'stability' } })],
        ['cadence 5 d', (o) => ({ ...o, governor: { ...o.governor!, activeMaxIntervalDays: 5 } })],
        ['cadence 10 d', (o) => ({ ...o, governor: { ...o.governor!, activeMaxIntervalDays: 10 } })],
        ['active cap 8', (o) => ({ ...o, governor: { ...o.governor!, maxActivePerceptual: 8 } })],
        ['no load balancing', (o) => ({ ...o, governor: { ...o.governor!, loadBalance: false } })],
        ['450 days (whole course)', (o) => ({ ...o, days: 450 })],
      ];
      const rows: string[][] = [];
      for (const m of [15, 20, 25] as const) {
        for (const [name, f] of variants) {
          const rs = runSeeds(srsRec, f(recommended(m)), seeds);
          rows.push(loadRow(`${m} min · ${name}`, rs));
          for (const s of rs) expect(s.warmupMin.p95).toBeLessThanOrEqual(BUDGET_SEC_BY_SESSION_MIN[m] / 60); // the plan gate holds in every variant
        }
      }
      printTable('TABLE 4 — robustness, 3 seeds: median (min–max)', LOAD_HEADER, rows);
    },
    180_000,
  );
});
