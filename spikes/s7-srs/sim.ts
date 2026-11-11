/**
 * Spike S7 — 300-day review-load simulation for one learner. Deterministic: every random draw comes from
 * mulberry32 seeded by FNV-1a of (seed, event key), so two variants see the same luck for the same event.
 */
import {
  admitFamilies,
  admitNewFacts,
  DEFAULT_GOVERNOR,
  type EarGroup,
  type GovernorConfig,
  intervalCap,
  landingDay,
  makeDayPicker,
  planWarmup,
  type ReviewItem,
  shouldGraduate,
  smoothBacklog,
} from './governor.ts';
import { dayIndex, dayStart, type Grade, type OakCard, type Outcome, type Srs } from './srs.ts';

// ───────────────────────────── catalog (docs/design/exercises.md §4.4) ─────────────────────────────

export interface FamilyDef {
  id: string;
  /** P = perceptual or production (counts toward the active cap); C = concept. */
  kind: 'P' | 'C';
  group: EarGroup;
  unlock: string;
  trials: number;
  mastery: number;
  maxLevel: number;
  set: 'identify' | 'dictation' | 'mic';
}

// id | kind | group | unlock lesson | trials/set | ★ mastery level | top level | set type
const CATALOG = `
rhy.pulse P rhythm u01.01 3 3 5 mic
rhy.echo P rhythm u01.04 5 4 7 mic
rhy.read P rhythm u01.07 4 4 7 mic
rhy.dictation P rhythm u01.09 4 4 7 dictation
rhy.count C rhythm u01.05 8 3 4 identify
rhy.meter P rhythm u01.08 6 3 5 identify
rhy.subdivision P rhythm u13.05 8 2 3 identify
rhy.syncopation P rhythm u13.01 6 3 4 identify
rhy.swing P rhythm u11.07 8 2 4 identify
rhy.clave P rhythm rh.12 6 3 4 identify
rhy.odd-grouping P rhythm rh.07 6 2 4 identify
rhy.polyrhythm P rhythm rh.09 6 2 4 identify
rhy.groove-lock P rhythm u08.04 6 2 3 identify
pit.compare P pitch u02.01 10 2 3 identify
pit.match P pitch u00.03 5 3 4 mic
pit.steps P pitch u02.02 8 2 2 identify
pit.keyboard C pitch u02.03 8 2 3 identify
deg.tonic P pitch u03.01 5 3 5 identify
deg.fet-major P pitch u03.04 8 4 7 identify
deg.fet-minor P pitch u10.03 8 3 5 identify
deg.fet-chromatic P pitch u15.04 8 2 4 identify
deg.sing P pitch u03.04 6 3 4 mic
deg.resolve P pitch u03.06 5 3 4 mic
deg.index C pitch u03.03 8 2 4 identify
int.in-key P pitch u04.03 8 3 5 identify
int.isolated P pitch u04.05 8 4 6 identify
int.spell C pitch u04.02 6 3 4 identify
int.sing P pitch u04.06 5 2 3 mic
chd.quality-triad P harmony u05.01 8 4 5 identify
chd.quality-7th P harmony u12.01 8 4 6 identify
chd.inversion P harmony u05.05 8 2 4 identify
chd.spell C harmony u05.03 6 2 4 identify
har.rn C harmony u06.02 8 2 5 identify
har.function P harmony u06.03 8 2 4 identify
har.bass P harmony u06.09 4 3 6 dictation
har.progression P harmony u06.10 3 3 6 dictation
har.schema P harmony u06.06 6 3 6 identify
har.cadence P harmony u06.04 6 2 4 identify
har.chromatic P harmony u15.06 5 3 4 identify
har.modulation P harmony u17.04 4 2 3 identify
mel.dictation P pitch u03.09 3 4 8 dictation
mel.echo P pitch u03.09 4 3 6 mic
mel.sight P pitch u03.10 3 3 6 mic
mel.nct P pitch u07.06 6 2 4 identify
key.circle C pitch u03.08 8 2 4 identify
key.scale-spell C pitch u03.02 4 2 5 identify
key.mode P harmony u10.01 6 4 6 identify
frm.blues P harmony u11.05 6 2 4 identify
frm.sections P harmony u09.03 3 2 3 identify
jzz.ii-v P harmony jz.05 6 3 4 identify
jzz.extension P harmony jz.02 8 3 5 identify
jzz.guide P harmony jz.07 4 2 4 mic
jzz.chord-scale C harmony jz.04 8 2 4 identify
jzz.subs P harmony jz.14 6 2 3 identify
jzz.voicing C harmony jz.08 6 2 3 identify
snd.params P harmony ar.07 6 3 5 identify
snd.roles P harmony ar.01 6 2 2 identify
code.mini C rhythm u01.02 6 3 6 identify
code.functions C pitch u03.03 6 1 1 identify
`;

export const FAMILIES: FamilyDef[] = CATALOG.trim()
  .split('\n')
  .map((line) => {
    const [id, kind, group, unlock, trials, mastery, maxLevel, set] = line.split(' ') as [string, 'P' | 'C', EarGroup, string, string, string, string, FamilyDef['set']];
    return { id, kind, group, unlock, trials: Number(trials), mastery: Number(mastery), maxLevel: Number(maxLevel), set };
  });

/** Fact decks from the catalog: [deck, unlock lesson, cards, newPerDay]. */
export const DECK_BATCHES: [string, string, number, number][] = [
  ['pit.staff-names', 'u02.05', 14, 6],
  ['pit.staff-names', 'u05.04', 14, 6],
  ['key.signature', 'u03.07', 30, 4],
  ['key.signature', 'u10.08', 30, 4],
  ['chd.symbols', 'u05.03', 4, 4],
  ['chd.symbols', 'u12.01', 5, 4],
  ['chd.symbols', 'jz.01', 6, 4],
];

const UNIT_LESSONS = [3, 9, 8, 10, 6, 8, 12, 9, 5, 5, 9, 8, 6, 6, 6, 6, 5, 4]; // u00..u17 = 125 lessons
const CHECKPOINT_AFTER_UNIT = new Set([1, 2, 3, 5, 6, 8, 10, 11, 13, 14, 16, 17]); // cp01..cp12
const TRACKS: [string, number][] = [
  ['jz', 34],
  ['rh', 20],
  ['ar', 20],
];

/** Session-by-session curriculum: 125 lessons + 26 capstone sessions + 12 checkpoints + 74 track lessons = 237. */
export function buildTimeline(): string[] {
  const out: string[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  UNIT_LESSONS.forEach((n, u) => {
    for (let l = 1; l <= n; l++) out.push(`u${pad(u)}.${pad(l)}`);
    for (let c = 1; c <= (n >= 8 ? 2 : 1); c++) out.push(`cap.u${pad(u)}.${c}`);
    if (CHECKPOINT_AFTER_UNIT.has(u)) out.push(`cp.u${pad(u)}`);
  });
  for (const [t, n] of TRACKS) for (let l = 1; l <= n; l++) out.push(`${t}.${pad(l)}`);
  return out;
}
const isLesson = (id: string) => !id.startsWith('cap.') && !id.startsWith('cp.');

// ───────────────────────────── seeded randomness ─────────────────────────────

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ───────────────────────────── options ─────────────────────────────

export interface LearnerModel {
  /** Per-trial success at a level after k sets there: asymptote − startGap·exp(−k / tau). */
  asymptote: number;
  startGap: number;
  tau: number;
  /** Day-to-day wobble of ability (sd). */
  dayNoise: number;
  /** Minimum effective trial count for the sampling noise of one set's mean credit. */
  nEffMin: number;
  /** P(fast | set) — only matters for Easy. */
  fastProb: number;
  compositeP: number;
  conceptP: number;
  /** Accuracy lost per unit of recall below the family target. */
  forgetSlope: number;
  /** One-off penalty on the first session back after a gap of >= 3 / >= 10 days. */
  layoff3: number;
  layoff10: number;
  factNewP: number;
  factBias: number;
  factFastProb: number;
  factSlowProb: number;
  /** A lesson re-exercises each family unlocked in the last `inLessonWindow` lessons with this probability. */
  inLessonEvidenceProb: number;
  inLessonWindow: number;
}
export const DEFAULT_LEARNER: LearnerModel = {
  asymptote: 0.955,
  startGap: 0.16,
  tau: 2.5,
  dayNoise: 0.03,
  nEffMin: 8,
  fastProb: 0.4,
  compositeP: 0.9,
  conceptP: 0.88,
  forgetSlope: 0.6,
  layoff3: 0.03,
  layoff10: 0.08,
  factNewP: 0.85,
  factBias: -0.02,
  factFastProb: 0.3,
  factSlowProb: 0.1,
  inLessonEvidenceProb: 0.5,
  inLessonWindow: 6,
};

export interface SimOptions {
  seed: string;
  days: number;
  /** 'weekdays' = Mon–Fri; 'random5' = five random days each week. */
  calendar: 'weekdays' | 'random5';
  /** Inclusive [firstDay, lastDay] ranges with no practice. */
  gaps: [number, number][];
  governor: GovernorConfig;
  /** Baseline only: cadence cap for families still below their mastery level (null = pure FSRS). */
  ungovernedCadenceDays: number | null;
  learner: LearnerModel;
  factsPerLesson: number;
  factSec: number;
  conceptSetSec: number;
  /** Actual duration = estimate × (1 ± jitter). */
  durationJitter: number;
  /** Deck / term intake ceiling per session when the governor is off. */
  ungovernedMaxNewFacts: number;
  /** 1 = one lesson per session (20/25-min settings); 2 = a lesson is split at its save-and-wrap midpoint (15-min setting). */
  sessionsPerLesson: number;
}
export const DEFAULT_SIM: SimOptions = {
  seed: 'oak-s7',
  days: 300,
  calendar: 'weekdays',
  gaps: [
    [61, 64], // Sat–Tue: 4 days
    [145, 154], // Sat–Mon: 10 days
    [229, 232], // Sat–Tue: 4 days
  ],
  governor: DEFAULT_GOVERNOR,
  ungovernedCadenceDays: null,
  learner: DEFAULT_LEARNER,
  factsPerLesson: 3,
  factSec: 8,
  conceptSetSec: 45,
  durationJitter: 0.12,
  ungovernedMaxNewFacts: 15,
  sessionsPerLesson: 1,
};

// ───────────────────────────── result ─────────────────────────────

export interface SessionRow {
  day: number;
  gap: number;
  entry: string;
  /** Seconds actually spent in the warm-up. */
  warmupSec: number;
  /** Seconds of everything due at session start (what an ungoverned warm-up would cost). */
  demandSec: number;
  /** Seconds still due after the warm-up (hidden overflow). */
  backlogSec: number;
  backlogItems: number;
  active: number;
  queued: number;
  graduated: number;
  newFactQueue: number;
  sets: number;
  facts: number;
}
export interface SimSummary {
  sessions: number;
  curriculumSessions: number;
  warmupMin: { p50: number; p95: number; max: number; mean: number };
  demandMin: { p50: number; p95: number; max: number; mean: number };
  backlogSec: { p50: number; p95: number; max: number };
  /** Same, ignoring the 8 sessions after each gap (the return windows). */
  steadyBacklogSec: { p50: number; p95: number; max: number };
  steadyDemandMin: { p50: number; p95: number; max: number };
  /** Days late (review day − due day) of executed reviews. */
  lateDays: { p95: number; max: number };
  families: { unlocked: number; active: number; queued: number; graduated: number; atMastery: number; maxQueued: number; maxActive: number; neverPractisedInWarmup: number };
  /** Days from unlock to activation (still-queued families count up to the last day). */
  queueWaitDays: { p50: number; p95: number; max: number };
  /** Days from activation to graduation, graduated families only. */
  daysToGraduate: { p50: number; max: number };
  accuracy: number;
  grades: Record<Grade, number>;
  recallAtReview: { family: number; fact: number };
  facts: { cards: number; maxNewQueue: number; newQueueAtEnd: number; reviews: number };
  setReviews: number;
  /** Sessions needed after each gap until the hidden overflow is back to at most one set (90 s); -1 = never within the run. */
  sessionsToClearAfterGap: number[];
  backlogByMonth: { month: number; meanSec: number; maxSec: number; meanWarmupMin: number; maxWarmupMin: number }[];
}
export interface SimResult {
  rows: SessionRow[];
  summary: SimSummary;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] as number;
}

// ───────────────────────────── simulation ─────────────────────────────

interface Fam {
  def: FamilyDef;
  status: 'locked' | 'queued' | 'active' | 'graduated';
  card: OakCard | null;
  sec: number;
  level: number;
  k: number;
  hiDays: number[];
  unlockDay: number;
  unlockLesson: number;
  activatedDay: number;
  graduatedDay: number;
  warmupSets: number;
  deferUntil: number;
}
interface Composite {
  group: EarGroup;
  card: OakCard | null;
  members: number;
  deferUntil: number;
}
interface Fact {
  card: OakCard;
  deferUntil: number;
}

export function simulate(srs: Srs, partial: Partial<SimOptions> = {}): SimResult {
  const o: SimOptions = { ...DEFAULT_SIM, ...partial };
  const cfg = o.governor;
  const L = o.learner;
  const rng = (key: string) => mulberry32(fnv1a(`${o.seed}|${key}`));
  const BASE = dayIndex(new Date('2027-01-04T12:00:00.000Z')); // a Monday
  const timeline = buildTimeline();

  // practice calendar
  const practice = new Array<boolean>(o.days).fill(false);
  for (let w = 0; w * 7 < o.days; w++) {
    let off = [5, 6];
    if (o.calendar === 'random5') {
      const r = rng(`week:${w}`);
      const a = Math.floor(r() * 7);
      let b = Math.floor(r() * 6);
      if (b >= a) b++;
      off = [a, b];
    }
    for (let d = 0; d < 7 && w * 7 + d < o.days; d++) practice[w * 7 + d] = !off.includes(d);
  }
  for (const [a, b] of o.gaps) for (let d = a; d <= b && d < o.days; d++) practice[d] = false;

  // state
  const fams: Fam[] = FAMILIES.map((def) => {
    const u = rng(`sec:${def.id}`)();
    const sec = def.kind === 'C' ? o.conceptSetSec : def.set === 'dictation' ? 90 : def.set === 'mic' ? 60 : Math.round(60 + 15 * u);
    return { def, status: 'locked', card: null, sec, level: 1, k: 0, hiDays: [], unlockDay: -1, unlockLesson: -1, activatedDay: -1, graduatedDay: -1, warmupSets: 0, deferUntil: -1 };
  });
  const composites: Record<EarGroup, Composite> = {
    pitch: { group: 'pitch', card: null, members: 0, deferUntil: -1 },
    harmony: { group: 'harmony', card: null, members: 0, deferUntil: -1 },
    rhythm: { group: 'rhythm', card: null, members: 0, deferUntil: -1 },
  };
  const facts: Fact[] = [];
  const famById = new Map(fams.map((f) => [f.def.id, f]));
  const factById = new Map<string, Fact>();
  const newFactQueue: { id: string; deck: string | null; perDay: number }[] = [];
  let factSeq = 0;

  const rows: SessionRow[] = [];
  const late: number[] = [];
  const famAcc: number[] = [];
  const grades: Record<Grade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const recallFam: number[] = [];
  const recallFact: number[] = [];
  let factReviews = 0;
  let setReviews = 0;
  let maxNewQueue = 0;
  let maxQueued = 0;
  let lastDay = -1;
  let cursor = 0;
  let lessonsDone = 0;
  let lessonPart = 0;
  const practised: number[] = []; // Oak-day indices of past sessions

  const pTrial = (f: Fam) => (f.def.kind === 'C' ? L.conceptP : L.asymptote - L.startGap * Math.exp(-f.k / L.tau));

  function setOutcome(key: string, p0: number, nTrials: number, recall: number, target: number, layoff: number): Outcome {
    const r = rng(key);
    const p = clamp(p0 + L.dayNoise * gauss(r) - L.forgetSlope * Math.max(0, target - recall) - layoff, 0.3, 0.99);
    const n = Math.max(nTrials, L.nEffMin);
    const accuracy = clamp(p + Math.sqrt((p * (1 - p)) / n) * gauss(r), 0, 1);
    return { accuracy, fast: r() < L.fastProb, revealed: false };
  }

  function staircase(f: Fam, acc: number, today: number) {
    f.k++;
    if (acc >= 0.9 && !f.hiDays.includes(today)) f.hiDays.push(today);
    if (f.hiDays.length >= 2 && f.level < f.def.maxLevel) {
      f.level++;
      f.k = 0;
      f.hiDays = [];
    } else if (acc < 0.6 && f.level > 1) {
      f.level--;
      f.k = 3;
      f.hiDays = [];
    }
  }

  const famCap = (f: Fam): number | undefined => {
    if (f.def.kind !== 'P') return undefined;
    if (cfg.enabled) return intervalCap('active', cfg);
    return o.ungovernedCadenceDays !== null && f.level < f.def.mastery ? o.ungovernedCadenceDays : undefined;
  };

  for (let d = 0; d < o.days; d++) {
    if (!practice[d]) continue;
    const today = BASE + d;
    const hour = 7 + 15 * rng(`hour:${d}`)();
    const now = new Date(dayStart(today).getTime() + (hour - srs.config.rolloverUtcHour) * 3_600_000);
    const gap = lastDay < 0 ? 0 : d - lastDay - 1;
    const layoff = gap >= 10 ? L.layoff10 : gap >= 3 ? L.layoff3 : 0;
    const returning = gap >= cfg.gapDays;

    // ── every schedulable item, with its due day ──
    const famItem = (f: Fam): ReviewItem => {
      const cap = famCap(f);
      // a family that waited in the intake queue is "due" from the day it was activated, not from its seed review
      return { id: f.def.id, cls: f.def.kind === 'P' ? 'family' : 'concept', sec: f.sec, dueDay: Math.max(dayIndex(f.card!.dueAt), BASE + f.activatedDay), recall: 0, ...(f.deferUntil > today ? { deferUntilDay: f.deferUntil } : {}), ...(cap ? { repeatDays: cap } : {}) };
    };
    const buildItems = (): ReviewItem[] => {
      const items: ReviewItem[] = [];
      for (const f of fams) if (f.status === 'active' && f.card) items.push(famItem(f));
      for (const c of Object.values(composites)) if (c.card) items.push({ id: `mixed.${c.group}`, cls: 'composite', sec: cfg.compositeSetSec, dueDay: dayIndex(c.card.dueAt), recall: 0, ...(c.deferUntil > today ? { deferUntilDay: c.deferUntil } : {}) });
      for (const x of facts) items.push({ id: x.card.id, cls: 'fact', sec: o.factSec, dueDay: dayIndex(x.card.dueAt), recall: 0, ...(x.deferUntil > today ? { deferUntilDay: x.deferUntil } : {}) });
      return items;
    };
    const cardOf = (id: string): OakCard => {
      if (id.startsWith('mixed.')) return composites[id.slice(6) as EarGroup].card!;
      if (id.startsWith('fact:')) return factById.get(id)!.card;
      return famById.get(id)!.card!;
    };
    const isDueNow = (it: ReviewItem) => srs.isDue(cardOf(it.id), now);
    const withRecall = (it: ReviewItem): ReviewItem => ({ ...it, recall: srs.recallProbability(cardOf(it.id), now) });

    // ── 1. return mode: spread the overdue backlog ──
    let items = buildItems();
    if (cfg.enabled && returning) {
      const overdue = items.filter(isDueNow).map(withRecall);
      for (const [id, until] of smoothBacklog(overdue, today, cfg)) {
        if (id.startsWith('mixed.')) composites[id.slice(6) as EarGroup].deferUntil = until;
        else if (id.startsWith('fact:')) factById.get(id)!.deferUntil = until;
        else famById.get(id)!.deferUntil = until;
      }
      items = buildItems();
    }

    // ── 2. family intake ──
    const queued = fams.filter((f) => f.status === 'queued').sort((a, b) => a.unlockLesson - b.unlockLesson);
    const backlogPending = items.some((it) => (it.deferUntilDay ?? 0) > today);
    const nAdmit = admitFamilies({ activeCount: fams.filter((f) => f.status === 'active' && f.def.kind === 'P').length, queuedSecs: queued.map((f) => f.sec), items, today, paused: returning || backlogPending }, cfg);
    for (const f of queued.slice(0, nAdmit)) {
      f.status = 'active';
      f.activatedDay = d;
    }
    if (nAdmit > 0) items = buildItems();

    // ── 3. plan and run the warm-up ──
    const due = items.filter(isDueNow).map(withRecall);
    const plan = planWarmup(due, today, gap, cfg);
    // the learner's usual practice weekdays, learned from the last 4 weeks (unknown until 2 weeks of history exist)
    const recent = practised.filter((p) => p >= today - 28);
    const weekdayHits = new Array<number>(7).fill(0);
    for (const p of recent) weekdayHits[((p % 7) + 7) % 7]!++;
    const weeksSeen = Math.min(4, Math.floor((today - (practised[0] ?? today)) / 7));
    const likely = weeksSeen >= 2 ? (day: number) => weekdayHits[((day % 7) + 7) % 7]! / weeksSeen >= 0.5 : undefined;
    const loadByDay = new Map<number, number>();
    const addLoad = (day: number, sec: number) => {
      const land = landingDay(day, likely);
      loadByDay.set(land, (loadByDay.get(land) ?? 0) + sec);
    };
    for (const it of items) if (it.dueDay > today) addLoad(it.dueDay, it.sec);
    let warmupSec = 0;
    let nSets = 0;
    let nFacts = 0;
    const retry: Fact[] = [];

    const doReview = (card: OakCard, outcome: Outcome, sec: number, cap: number | undefined, key: string): OakCard => {
      const jr = rng(`fuzz:${key}`);
      const pickDay = makeDayPicker(loadByDay, today, cfg, (lo, hi) => lo + Math.floor(jr() * (hi - lo + 1)), likely);
      const res = srs.review(card, outcome, now, { pickDay, ...(cap !== undefined ? { maxIntervalDays: cap } : {}) });
      grades[res.grade]++;
      addLoad(dayIndex(res.card.dueAt), sec);
      return res.card;
    };
    const spend = (sec: number, key: string) => {
      warmupSec += sec * (1 + o.durationJitter * (2 * rng(`dur:${key}`)() - 1));
    };

    const reviewFact = (x: Fact, isNew: boolean) => {
      const key = `${x.card.id}:${x.card.reps}`;
      const recall = srs.recallProbability(x.card, now);
      const r = rng(`fact:${key}`);
      const p = isNew ? L.factNewP : clamp(recall + L.factBias - layoff, 0.3, 0.99);
      const correct = r() < p;
      const u = r();
      const outcome: Outcome = { accuracy: correct ? (u < L.factSlowProb ? 0.75 : 1) : 0, fast: u > 1 - L.factFastProb, revealed: false };
      if (!isNew) {
        recallFact.push(recall);
        late.push(today - dayIndex(x.card.dueAt));
      }
      x.card = doReview(x.card, outcome, o.factSec, undefined, key);
      x.deferUntil = -1;
      spend(o.factSec, key);
      factReviews++;
      nFacts++;
      if (!correct) retry.push(x);
    };

    for (const it of plan.selected) {
      if (it.cls === 'fact') {
        reviewFact(factById.get(it.id)!, false);
        continue;
      }
      late.push(today - it.dueDay);
      recallFam.push(it.recall);
      nSets++;
      setReviews++;
      if (it.cls === 'composite') {
        const c = composites[it.id.slice(6) as EarGroup];
        const key = `${it.id}:${c.card!.reps}`;
        const outcome = setOutcome(`set:${key}`, L.compositeP, 8, it.recall, srs.config.family.desiredRetention, layoff);
        famAcc.push(outcome.accuracy);
        c.card = doReview(c.card!, outcome, it.sec, intervalCap('composite', cfg), key);
        c.deferUntil = -1;
        spend(it.sec, key);
        continue;
      }
      const f = famById.get(it.id)!;
      const key = `${f.def.id}:${f.card!.reps}`;
      const outcome = setOutcome(`set:${key}`, pTrial(f), f.def.trials, it.recall, srs.config.family.desiredRetention, layoff);
      famAcc.push(outcome.accuracy);
      f.card = doReview(f.card!, outcome, f.sec, famCap(f), key);
      f.deferUntil = -1;
      f.warmupSets++;
      spend(f.sec, key);
      if (f.def.kind === 'P') {
        staircase(f, outcome.accuracy, today);
        if (shouldGraduate({ level: f.level, masteryLevel: f.def.mastery, t90Days: srs.intervalAt(f.card, 0.9), stability: f.card.stability }, cfg)) {
          f.status = 'graduated';
          f.graduatedDay = d;
          const c = composites[f.def.group];
          c.members++;
          if (!c.card) {
            // the graduating set doubles as the composite card's first review
            const fresh = srs.createCard('family', now, `mixed.${c.group}`);
            c.card = doReview(fresh, { accuracy: 0.875, fast: false, revealed: false }, cfg.compositeSetSec, intervalCap('composite', cfg), `mixed.${c.group}:seed`);
            grades[3]--; // not a learner review
          }
        }
      }
    }

    // new fact cards fill the remaining budget
    const allowance = cfg.enabled
      ? admitNewFacts({ waiting: newFactQueue.length, usedSec: plan.usedSec, factSec: o.factSec, items, today, paused: backlogPending }, cfg)
      : Math.min(newFactQueue.length, o.ungovernedMaxNewFacts);
    const perDeck = new Map<string, number>();
    let admitted = 0;
    for (let i = 0; i < newFactQueue.length && admitted < allowance; ) {
      const q = newFactQueue[i]!;
      const used = q.deck ? (perDeck.get(q.deck) ?? 0) : 0;
      if (q.deck && used >= q.perDay) {
        i++;
        continue;
      }
      if (q.deck) perDeck.set(q.deck, used + 1);
      newFactQueue.splice(i, 1);
      const x: Fact = { card: srs.createCard('fact', now, q.id), deferUntil: -1 };
      facts.push(x);
      factById.set(q.id, x);
      reviewFact(x, true);
      admitted++;
    }
    // a missed fact comes back once at the end of the same warm-up (5-minute learning step) if there is room
    let plannedSec = plan.usedSec + admitted * o.factSec;
    for (const x of retry) {
      if (cfg.enabled && plannedSec + o.factSec > cfg.budgetSec * cfg.planFraction) break;
      plannedSec += o.factSec;
      const key = `${x.card.id}:${x.card.reps}:retry`;
      const stepNow = new Date(now.getTime() + 6 * 60_000);
      const res = srs.review(x.card, { accuracy: rng(`fact:${key}`)() < 0.9 ? 1 : 0, fast: false, revealed: false }, stepNow);
      grades[res.grade]++;
      x.card = res.card;
      spend(o.factSec, key);
      factReviews++;
      nFacts++;
    }

    const backlogSec = plan.leftover.reduce((a, it) => a + it.sec, 0);

    // ── 4. curriculum: one timeline entry per session (a light session after a 10+ day gap adds nothing new) ──
    let entry = 'light';
    if (gap < 10 && cursor < timeline.length) {
      entry = timeline[cursor]!;
      const finishes = !isLesson(entry) || ++lessonPart >= o.sessionsPerLesson;
      if (finishes) {
        cursor++;
        lessonPart = 0;
      } else entry = `${entry}(part)`;
      if (finishes && isLesson(entry)) {
        lessonsDone++;
        for (let i = 0; i < o.factsPerLesson; i++) newFactQueue.push({ id: `fact:${entry}:${i}`, deck: null, perDay: 99 });
        for (const [deck, lesson, n, perDay] of DECK_BATCHES) if (lesson === entry) for (let i = 0; i < n; i++) newFactQueue.push({ id: `fact:${deck}:${factSeq++}`, deck, perDay });
        // in-lesson evidence for recently unlocked families (free: not warm-up time)
        for (const f of fams) {
          if (f.status === 'locked' || f.status === 'graduated' || f.def.kind !== 'P' || !f.card) continue;
          if (lessonsDone - f.unlockLesson > L.inLessonWindow) continue;
          const key = `lesson:${entry}:${f.def.id}`;
          if (rng(key)() >= L.inLessonEvidenceProb) continue;
          const recall = srs.recallProbability(f.card, now);
          const outcome = setOutcome(`set:${key}`, pTrial(f), f.def.trials, recall, srs.config.family.desiredRetention, 0);
          staircase(f, outcome.accuracy, today);
          if (recall < 0.9) f.card = doReview(f.card, outcome, f.sec, famCap(f), key); // review-if-due
        }
        // families unlocked by this lesson: seed the card from the lesson's own first attempts
        for (const f of fams) {
          if (f.def.unlock !== entry) continue;
          f.unlockDay = d;
          f.unlockLesson = lessonsDone;
          f.status = cfg.enabled && f.def.kind === 'P' ? 'queued' : 'active';
          if (f.status === 'active') f.activatedDay = d;
          const key = `seed:${f.def.id}`;
          const outcome = setOutcome(`set:${key}`, pTrial(f), f.def.trials, 1, 0, 0);
          f.card = doReview(srs.createCard('family', now, f.def.id), outcome, f.sec, famCap(f), key);
          staircase(f, outcome.accuracy, today);
        }
      }
    }

    const nQueued = fams.filter((f) => f.status === 'queued').length;
    maxQueued = Math.max(maxQueued, nQueued);
    maxNewQueue = Math.max(maxNewQueue, newFactQueue.length);
    rows.push({
      day: d,
      gap,
      entry,
      warmupSec,
      demandSec: plan.demandSec,
      backlogSec,
      backlogItems: plan.leftover.length,
      active: fams.filter((f) => f.status === 'active' && f.def.kind === 'P').length,
      queued: nQueued,
      graduated: fams.filter((f) => f.status === 'graduated').length,
      newFactQueue: newFactQueue.length,
      sets: nSets,
      facts: nFacts,
    });
    lastDay = d;
    practised.push(today);
  }

  // ── summary ──
  const stat = (v: number[]) => ({ p50: percentile(v, 50), p95: percentile(v, 95), max: Math.max(0, ...v), mean: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length) });
  const perceptual = fams.filter((f) => f.def.kind === 'P');
  const waits = perceptual.filter((f) => f.unlockDay >= 0).map((f) => (f.activatedDay >= 0 ? f.activatedDay : o.days - 1) - f.unlockDay);
  const gradTimes = perceptual.filter((f) => f.graduatedDay >= 0).map((f) => f.graduatedDay - f.activatedDay);
  const sessionsToClearAfterGap = o.gaps.map(([, end]) => {
    const i = rows.findIndex((r) => r.day > end);
    if (i < 0) return -1;
    const j = rows.findIndex((r, idx) => idx >= i && r.backlogSec <= 90);
    return j < 0 ? -1 : j - i + 1;
  });
  const backlogByMonth: SimSummary['backlogByMonth'] = [];
  for (let m = 0; m * 30 < o.days; m++) {
    const rs = rows.filter((r) => r.day >= m * 30 && r.day < (m + 1) * 30);
    if (rs.length === 0) continue;
    backlogByMonth.push({
      month: m + 1,
      meanSec: rs.reduce((a, r) => a + r.backlogSec, 0) / rs.length,
      maxSec: Math.max(...rs.map((r) => r.backlogSec)),
      meanWarmupMin: rs.reduce((a, r) => a + r.warmupSec, 0) / rs.length / 60,
      maxWarmupMin: Math.max(...rs.map((r) => r.warmupSec)) / 60,
    });
  }
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const inReturnWindow = new Set<number>();
  for (const [, end] of o.gaps) {
    const i = rows.findIndex((r) => r.day > end);
    if (i >= 0) for (let k = i; k < Math.min(rows.length, i + 8); k++) inReturnWindow.add(k);
  }
  const steady = rows.filter((_, i) => !inReturnWindow.has(i));
  const summary: SimSummary = {
    sessions: rows.length,
    curriculumSessions: cursor,
    warmupMin: stat(rows.map((r) => r.warmupSec / 60)),
    demandMin: stat(rows.map((r) => r.demandSec / 60)),
    backlogSec: stat(rows.map((r) => r.backlogSec)),
    steadyBacklogSec: stat(steady.map((r) => r.backlogSec)),
    steadyDemandMin: stat(steady.map((r) => r.demandSec / 60)),
    lateDays: { p95: percentile(late, 95), max: Math.max(0, ...late) },
    families: {
      unlocked: perceptual.filter((f) => f.status !== 'locked').length,
      active: perceptual.filter((f) => f.status === 'active').length,
      queued: perceptual.filter((f) => f.status === 'queued').length,
      graduated: perceptual.filter((f) => f.status === 'graduated').length,
      atMastery: perceptual.filter((f) => f.status !== 'locked' && f.level >= f.def.mastery).length,
      maxQueued,
      maxActive: Math.max(0, ...rows.map((r) => r.active)),
      neverPractisedInWarmup: perceptual.filter((f) => f.status !== 'locked' && f.warmupSets === 0).length,
    },
    queueWaitDays: { p50: percentile(waits, 50), p95: percentile(waits, 95), max: Math.max(0, ...waits) },
    daysToGraduate: { p50: percentile(gradTimes, 50), max: Math.max(0, ...gradTimes) },
    accuracy: mean(famAcc),
    grades,
    recallAtReview: { family: mean(recallFam), fact: mean(recallFact) },
    facts: { cards: facts.length, maxNewQueue, newQueueAtEnd: newFactQueue.length, reviews: factReviews },
    setReviews,
    sessionsToClearAfterGap,
    backlogByMonth,
  };
  return { rows, summary };
}
