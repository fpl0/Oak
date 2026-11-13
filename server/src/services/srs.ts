// Cards, reviews, `family_state`, graduation, composites and recall, through `@oak/srs` (contracts §7.1 to
// §7.4 and §7.9; decisions 2 and 27 of docs/decisions.md: the live governor is the simulated one). The service owns the scheduling rules; storage is behind
// the ports below, which the server implements over SQLite (`db/repos/srs.ts` satisfies `SrsStore`
// structurally; `SrsStatePort` is one JSON value, e.g. the `settings` row `srs.state`).
//
// Day boundaries are the learner's: local time zone and the 04:00 rollover. Every method takes `now`.
import type {
  FamilyState as FamilyStateDto,
  SrsCard as SrsCardDto,
  SrsReviewRequest,
  SrsReviewResult,
  WarmupItem,
} from "@oak/api";
import type { FamilyDef, FamilyId, HintRung, SkillId } from "@oak/content-kit";
import {
  type ActiveFamily,
  admitCreated,
  BLOCKED_INTRO_SETS,
  type Card,
  type CardKind,
  type CardStatus,
  capLessonFacts,
  capRelearning,
  cardWeight,
  compositeSetSec,
  createSrs,
  DECISION_2,
  dayFromIndex,
  dayIndex,
  earlyGraduate,
  factGrade,
  factMeta,
  familyMeta,
  GOVERNOR,
  type GovernorConfig,
  gradeFor,
  intakeForecast,
  intervalCap,
  isPerceptualFamily,
  likelyPracticeDays,
  makeDayPicker,
  memberNeedsRecall,
  type OtherWorkSource,
  otherWorkCredit,
  type PlannedItem,
  pickReleases,
  pickRestReturn,
  planCompositeSet,
  planOverdueReleases,
  planReviewDay,
  planWarmup,
  RATING_NAME,
  type Rating,
  RETURN,
  type ReviewItem,
  type ReviewOutcome,
  type Revlog,
  recommendedGovernor,
  reviewItem,
  type Srs,
  shouldGraduate,
  smoothBacklog,
  stepGrade,
  stepLevel,
  WARMUP_BUDGET_SEC,
  WARMUP_GYM_SEC,
  WARMUP_SHORT_SEC,
  type WaitingCard,
  type WarmupPlan,
} from "@oak/srs";
import { monotonicDay } from "../lib/days.ts";

// --- ports ----------------------------------------------------------------------------------------

/** A card row as stored (`srs_cards`). */
export interface StoredCard {
  card: Card;
  desiredRetention: number;
  payload: unknown;
  introducedBy: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** A `family_state` row. */
export interface FamilyStateRow {
  familyId: string;
  level: number;
  promoDay: string | null;
  categoryStats: Record<string, { n: number; hits: number; lastAt: string | null }>;
  confusion: Record<string, number>;
  blockedRemaining: number;
  compositeId: string | null;
  graduatedAt: string | null;
  updatedAt: string;
}
export interface RevlogEntry {
  cardId: string;
  reviewedAt: string;
  rating: Rating;
  revlog: Revlog | null;
  drillSessionId: string | null;
  meanCredit: number | null;
  trialsTotal: number | null;
  medianRtMs: number | null;
}
/** Storage of cards, revlog and family state. `SrsRepo` (db/repos/srs.ts) implements it. */
export interface SrsStore {
  card(cardId: string): StoredCard | null;
  cards(filter?: { status?: CardStatus; kind?: CardKind }): StoredCard[];
  saveCard(
    card: Card,
    meta: {
      desiredRetention: number;
      payload?: unknown;
      introducedBy?: string | null;
      releasedAt?: string | null;
    },
    at: string,
  ): StoredCard;
  setCardStatus(cardId: string, status: CardStatus, at: string): void;
  addRevlog(entry: RevlogEntry): number;
  family(familyId: string): FamilyStateRow | null;
  families(): FamilyStateRow[];
  saveFamily(f: FamilyStateRow): FamilyStateRow;
}

/** The governor's small working state between requests. Stored as one JSON value. */
export interface SrsWorkingState {
  /** Card → the first learner day backlog smoothing offers it on (`YYYY-MM-DD`). */
  deferUntil: Record<string, string>;
  /** The last day of the current backlog window; no new cards are released until it has passed. */
  backlogUntil: string | null;
  /** The day the return-after-gap smoothing last ran (it runs once per return). */
  smoothedOn: string | null;
  /** Today's counters (reset when `day` changes). */
  today: {
    day: string;
    agains: number;
    newFamilies: number;
    newFacts: number;
    deckIntro: Record<string, number>;
    /** Families the wait bound (decision 27) released today. */
    overdueReleased?: number;
  };
  /** Credits of the last composite trials of each graduated member, newest last. */
  compositeCredits: Record<string, number[]>;
  /** Members recalled from a composite, waiting for a free active slot. */
  recallPending: string[];
  /**
   * Families resting in their composite below their mastery level (decision 27): family → the learner day it
   * rested. One comes back to its own card once nothing waits (`pickRestReturn`).
   */
  resting: Record<string, string>;
  /** Order of deferral: card → sequence number (oldest is released first). */
  deferredSeq: Record<string, number>;
  seq: number;
  /** Learner days with a session, newest last (at most 40 kept), for the load balancer. */
  sessionDays: string[];
}
export interface SrsStatePort {
  get(): SrsWorkingState | null;
  put(state: SrsWorkingState): void;
}
export const EMPTY_SRS_STATE: SrsWorkingState = {
  deferUntil: {},
  backlogUntil: null,
  smoothedOn: null,
  today: { day: "", agains: 0, newFamilies: 0, newFacts: 0, deckIntro: {} },
  compositeCredits: {},
  recallPending: [],
  resting: {},
  deferredSeq: {},
  seq: 0,
  sessionDays: [],
};

/** What the service needs from the content catalog and the learner's course progress. */
export interface SrsCatalogPort {
  family(id: FamilyId): FamilyDef | null;
  /** Ladder limits from the completed lessons: the highest open level and the open categories. */
  levelLimits(id: FamilyId): { maxOpenLevel: number; topLevel: number; openCategories: string[] };
  /** A fact card (deck card or tested term): its answer speed and skills. `null` if unknown. */
  fact(cardId: string): { fastRtMs: number; skills: SkillId[] } | null;
  /** Deck cards whose gate lesson is completed, in deck order, with the deck's daily intake. */
  openDeckCards(): { cardId: string; deckId: string; newPerDay: number }[];
}
/** Things about the learner the planner weighs. */
export interface SrsLearnerPort {
  profile(): {
    targetMinutes: 15 | 20 | 25;
    timeZone: string;
    rolloverHour: number;
    quiet: boolean;
    weeklyGoal: number;
    singToleranceCents: number;
  };
  /** Families with repair sets left (failed checkpoint skills). */
  repairFamilies(): FamilyId[];
  /** Skills with `debt`. */
  debtSkills(): SkillId[];
  /** Skills the next lesson builds on. */
  nextLessonSkills(): SkillId[];
  /** The latest learner day with recorded activity: today never runs backwards past it (`monotonicDay`). */
  dayFloor?(): string | null;
  /**
   * The kinds of the next `n` sessions of the learner's course (the New block of each), for the intake
   * throttle: checkpoint and capstone days have shorter warm-ups. Fewer than `n` when the course runs out.
   */
  upcomingSessions?(n: number): ("lesson" | "checkpoint" | "capstone" | "gym")[];
}
export interface SrsServiceDeps {
  store: SrsStore;
  state: SrsStatePort;
  catalog: SrsCatalogPort;
  learner: SrsLearnerPort;
}

/** Card IDs of the three composite cards. */
export const COMPOSITE_IDS = {
  pitch: "fam.mix.pitch",
  harmony: "fam.mix.harmony",
  rhythm: "fam.mix.rhythm",
} as const;
const isComposite = (id: string) => id.startsWith("fam.mix.");

export interface SeedRequest {
  /** The lesson that seeds the cards (`srs_cards.introduced_by`). */
  lessonId: string;
  /** Families whose unlock lesson this is. */
  families: FamilyId[];
  /** Concept families' first-attempt `adjustedScore` in the lesson (contracts §7.2: the seeding step rates them). */
  conceptScores?: Partial<Record<FamilyId, number>>;
  /** Tested terms (`TermDef.card.testedIn`), with the first-attempt score of the step that introduced them. */
  terms: { factId: string; score: number }[];
}
export interface SeedResult {
  active: string[];
  deferred: string[];
  /** Tested terms over the per-lesson cap: they stay glossary entries. */
  glossaryOnly: string[];
  /** A family graduated early to make room (contracts §7.4 "When the cap is hit"). */
  graduatedEarly: string[];
}

export interface PlanOptions {
  budgetSec?: number;
  /** Days missed since the last qualifying day. */
  gapDays: number;
  micSetsUsed?: number;
  continuation?: boolean;
}

// --- the service ----------------------------------------------------------------------------------

export class SrsService {
  private constructor(
    private readonly deps: SrsServiceDeps,
    /** The scheduler for the learner's current zone (`rezone` replaces it after a zone change). */
    public srs: Srs,
  ) {}

  /** Decision 2 is live: fact cards at 0.85 desired retention (docs/decisions.md row 2). */
  static async create(deps: SrsServiceDeps): Promise<SrsService> {
    const p = deps.learner.profile();
    const srs = await createSrs({
      factRetention: DECISION_2.factRetention,
      timeZone: p.timeZone,
      rolloverHour: p.rolloverHour,
    });
    return new SrsService(deps, srs);
  }

  /** The live governor: decision 2 on the contract's numbers, Quiet mode and the weekly goal applied. */
  governor(targetMinutes?: 15 | 20 | 25): GovernorConfig {
    const p = this.deps.learner.profile();
    return recommendedGovernor(targetMinutes ?? p.targetMinutes, {
      quiet: p.quiet,
      sessionsPerWeek: Math.min(7, Math.max(1, p.weeklyGoal)),
    });
  }

  /**
   * The governor for intake decisions (releases, a lesson's new cards, deck intake): the 7-day forecast is
   * measured against the MEAN warm-up budget of the sessions the window will hold, as the simulation does
   * (checkpoint and capstone days have 3-minute warm-ups, gym days 4; past the course, lesson-sized days).
   */
  intakeGovernor(): GovernorConfig {
    const cfg = this.governor();
    const p = this.deps.learner.profile();
    const n = Math.max(1, Math.round((cfg.forecastDays * Math.min(7, cfg.sessionsPerWeek)) / 7));
    const kinds = this.deps.learner.upcomingSessions?.(n) ?? [];
    const budgets = kinds.map((k) =>
      k === "checkpoint" || k === "capstone"
        ? WARMUP_SHORT_SEC
        : k === "gym"
          ? WARMUP_GYM_SEC
          : WARMUP_BUDGET_SEC[p.targetMinutes],
    );
    while (budgets.length < n) budgets.push(WARMUP_BUDGET_SEC[p.targetMinutes]);
    return { ...cfg, budgetSec: budgets.reduce((a, b) => a + b, 0) / budgets.length };
  }

  /** Today's learner day (never earlier than the latest day with recorded activity, `monotonicDay`). */
  day(now: Date): string {
    return dayFromIndex(this.todayIndex(now));
  }
  /** Today as a day index: the scheduler's day of `now`, held at the learner's activity floor. */
  todayIndex(now: Date): number {
    const raw = this.srs.dayOf(now);
    const floor = this.deps.learner.dayFloor?.() ?? null;
    return floor === null ? raw : dayIndex(monotonicDay(dayFromIndex(raw), floor));
  }

  /**
   * The scheduler counts days in the learner's zone and rollover: after a change in the profile, a new
   * scheduler is built for the new zone (cards keep their instants; only the day arithmetic moves).
   * Returns whether it changed.
   */
  /** Whether the scheduler counts days in the profile's current zone and rollover. */
  zoneCurrent(): boolean {
    const p = this.deps.learner.profile();
    return p.timeZone === this.srs.timeZone && p.rolloverHour === this.srs.rolloverHour;
  }
  async rezone(): Promise<boolean> {
    if (this.zoneCurrent()) return false;
    const p = this.deps.learner.profile();
    this.srs = await createSrs({
      factRetention: DECISION_2.factRetention,
      timeZone: p.timeZone,
      rolloverHour: p.rolloverHour,
    });
    return true;
  }

  // --- state ---

  private loadState(now: Date): SrsWorkingState {
    // Fields a newer version added default from EMPTY_SRS_STATE.
    const s: SrsWorkingState = structuredClone({ ...EMPTY_SRS_STATE, ...(this.deps.state.get() ?? {}) });
    s.today = { ...EMPTY_SRS_STATE.today, ...s.today, deckIntro: { ...(s.today.deckIntro ?? {}) } };
    const day = this.day(now);
    if (s.today.day !== day) s.today = { day, agains: 0, newFamilies: 0, newFacts: 0, deckIntro: {} };
    return s;
  }
  private saveState(s: SrsWorkingState): void {
    this.deps.state.put(s);
  }

  // --- reading ---

  private familyRow(id: string, at: string): FamilyStateRow {
    return (
      this.deps.store.family(id) ?? {
        familyId: id,
        level: 1,
        promoDay: null,
        categoryStats: {},
        confusion: {},
        blockedRemaining: 0,
        compositeId: null,
        graduatedAt: null,
        updatedAt: at,
      }
    );
  }
  private isPerceptualCard(c: Card): boolean {
    if (c.kind === "composite") return true;
    if (c.kind !== "family") return false;
    const def = this.deps.catalog.family(c.id as FamilyId);
    return def ? isPerceptualFamily(def) : true;
  }
  /** How a deferred card waits for release (`pickReleases`): perceptual and production families take a slot. */
  private waitingKind(c: Card): WaitingCard["kind"] {
    if (c.kind === "fact") return "fact";
    if (c.kind === "concept" || !this.isPerceptualCard(c)) return "concept";
    return this.deps.catalog.family(c.id as FamilyId)?.mic === true ? "production" : "perceptual";
  }
  /** Active perceptual families as `earlyGraduate` reads them (those with a composite to join). */
  private graduationCandidates(now: Date) {
    const at = now.toISOString();
    return this.deps.store
      .cards({ status: "active", kind: "family" })
      .filter((c) => this.isPerceptualCard(c.card) && this.deps.catalog.family(c.card.id as FamilyId)?.mix)
      .map((c) => {
        const def = this.deps.catalog.family(c.card.id as FamilyId);
        const row = this.familyRow(c.card.id, at);
        const lim = this.deps.catalog.levelLimits(c.card.id as FamilyId);
        return {
          cardId: c.card.id,
          level: row.level,
          masteryLevel: def?.masteryLevel ?? Number.POSITIVE_INFINITY,
          maxOpenLevel: lim.maxOpenLevel,
          t90Days: this.srs.intervalAt(c.card, 0.9),
          lastRatings: c.card.lastRatings,
        };
      });
  }
  /** Active perceptual families as the wait bound's room-making reads them (decision 27). */
  private activeFamilies(now: Date): ActiveFamily[] {
    const at = now.toISOString();
    return this.graduationCandidates(now).map((g) => {
      const stored = this.deps.store.card(g.cardId);
      return {
        ...g,
        mic: this.deps.catalog.family(g.cardId as FamilyId)?.mic === true,
        reps: stored?.card.reps ?? 0,
        blockedIntroPending: this.familyRow(g.cardId, at).blockedRemaining > 0,
      };
    });
  }
  private activePerceptual(): number {
    return this.deps.store
      .cards({ status: "active", kind: "family" })
      .filter((s) => this.isPerceptualCard(s.card)).length;
  }

  /** The planner's view of every active card. */
  reviewItems(now: Date, state?: SrsWorkingState): ReviewItem[] {
    const s = state ?? this.loadState(now);
    const cfg = this.governor();
    const repair = new Set<string>(this.deps.learner.repairFamilies());
    const debt = new Set<string>(this.deps.learner.debtSkills());
    const next = new Set<string>(this.deps.learner.nextLessonSkills());
    const out: ReviewItem[] = [];
    for (const stored of this.deps.store.cards({ status: "active" })) {
      const c = stored.card;
      const defer = s.deferUntil[c.id];
      const deferUntilDay = defer === undefined ? undefined : dayIndex(defer);
      let meta: ReturnType<typeof factMeta>;
      if (c.kind === "fact") {
        meta = factMeta(this.deps.catalog.fact(c.id)?.skills ?? []);
      } else if (c.kind === "composite") {
        const members = this.compositeMembers(c.id);
        meta = {
          cls: "composite",
          family: c.id as FamilyId,
          domain: c.id,
          sec: compositeSetSec(members.length),
          mic: false,
          perceptual: true,
          skills: [],
        };
      } else {
        const def = this.deps.catalog.family(c.id as FamilyId);
        if (!def) continue;
        const row = this.deps.store.family(c.id);
        const cap = intervalCap(c, isPerceptualFamily(def), cfg);
        meta = familyMeta(def, {
          blockedIntroPending: (row?.blockedRemaining ?? 0) > 0,
          repair: repair.has(def.id),
          ...(cap !== undefined ? { repeatDays: cap } : {}),
        });
      }
      if (deferUntilDay !== undefined) meta.deferUntilDay = deferUntilDay;
      meta.debt = meta.skills.some((k) => debt.has(k));
      meta.linkedToNextLesson = meta.skills.some((k) => next.has(k));
      if (cfg.quiet && meta.mic) continue; // paused in Quiet mode
      out.push(reviewItem(this.srs, c, meta, now));
    }
    return out;
  }

  /** Due today (by learner day). */
  dueItems(now: Date, state?: SrsWorkingState): ReviewItem[] {
    const today = this.todayIndex(now);
    return this.reviewItems(now, state).filter((it) => it.dueDay <= today);
  }

  private compositeMembers(compositeId: string): FamilyStateRow[] {
    return this.deps.store.families().filter((f) => f.compositeId === compositeId);
  }

  // --- the day ---

  /**
   * Once per day before planning: backlog smoothing after a gap of 3+ days, recalled members into free
   * slots, deferred cards released and deck cards introduced (none of these while a backlog is cleared).
   * Idempotent within a day.
   */
  prepareDay(now: Date, gapDays: number): void {
    const s = this.loadState(now);
    const day = this.day(now);
    const today = this.todayIndex(now);
    const at = now.toISOString();
    const cfg = this.governor();
    if (!s.sessionDays.includes(day)) s.sessionDays = [...s.sessionDays, day].slice(-40);

    // 1. After a gap of 3 days or more, deal the overdue backlog out over 5 to 7 days (contracts §7.9).
    if (gapDays >= RETURN.warmupGap && s.smoothedOn !== day) {
      const overdue = this.dueItems(now, { ...s, deferUntil: {} });
      const spread = smoothBacklog(overdue, today, cfg);
      // `smoothBacklog` places an item on the day its midpoint falls in, so a small backlog (two 60 s sets
      // over 5 days) put nothing on the first day back: the return warm-up was empty. Shift the spread so
      // it starts today, keeping its spacing (reported to @oak/srs).
      const first = Math.min(...spread.values());
      if (Number.isFinite(first) && first > today)
        for (const [id, d] of spread) spread.set(id, d - (first - today));
      s.deferUntil = {};
      let last = today;
      for (const [id, d] of spread) {
        if (d > today) s.deferUntil[id] = dayFromIndex(d);
        last = Math.max(last, d);
      }
      s.backlogUntil = dayFromIndex(last);
      s.smoothedOn = day;
    }
    // Spent deferrals are dropped.
    for (const [id, d] of Object.entries(s.deferUntil)) if (dayIndex(d) <= today) delete s.deferUntil[id];
    const backlog = s.backlogUntil !== null && dayIndex(s.backlogUntil) >= today;

    // Production cards seeded while the learner was in Quiet mode were created paused (contracts §8.5). Once
    // the mic is back they join the deferred queue and are released like any other waiting family.
    if (!cfg.quiet)
      for (const stored of this.deps.store.cards({ status: "paused", kind: "family" })) {
        if (this.deps.catalog.family(stored.card.id as FamilyId)?.mic !== true) continue;
        this.deps.store.setCardStatus(stored.card.id, "deferred", now.toISOString());
        s.deferredSeq[stored.card.id] = ++s.seq;
      }

    if (!backlog) {
      // 2. Recalled composite members take free slots first, in the relearning state.
      for (const id of [...s.recallPending]) {
        if (this.activePerceptual() >= cfg.maxActivePerceptual) break;
        const stored = this.deps.store.card(id);
        if (!stored) continue;
        const res = this.srs.rate({ ...stored.card, status: "active" }, 1, now);
        this.deps.store.saveCard(res.card, { desiredRetention: stored.desiredRetention }, at);
        const row = this.familyRow(id, at);
        this.deps.store.saveFamily({ ...row, compositeId: null, graduatedAt: null, updatedAt: at });
        s.recallPending = s.recallPending.filter((x) => x !== id);
        delete s.compositeCredits[id];
        delete s.resting[id];
      }
    }
    // 3. The wait bound (decision 27), a backlog or not: a family still waiting `releaseAfterDays` after its
    // lesson is released today whatever the forecast says, and room is made for it (a family at its mastery
    // level graduates early, otherwise the most stable one rests in its composite). The forecast is
    // measured against the mean warm-up budget of the upcoming sessions.
    const intake = this.intakeGovernor();
    const waitingNow = (): { waiting: WaitingCard[]; deferred: Map<string, StoredCard> } => {
      const deferred = new Map(this.deps.store.cards({ status: "deferred" }).map((d) => [d.card.id, d]));
      const waiting: WaitingCard[] = [...deferred.values()].map((d) => ({
        cardId: d.card.id,
        kind: this.waitingKind(d.card),
        seq: s.deferredSeq[d.card.id] ?? 0,
        waitedDays: Math.max(0, today - this.srs.dayOf(d.createdAt)),
      }));
      return { waiting, deferred };
    };
    {
      const { waiting, deferred } = waitingNow();
      const overdue = planOverdueReleases({
        items: this.reviewItems(now, s),
        waiting,
        active: this.activeFamilies(now),
        activePerceptual: this.activePerceptual(),
        today,
        cfg: intake,
      });
      for (const id of overdue.graduate) this.graduate(id, now);
      for (const id of overdue.rest) {
        this.graduate(id, now);
        s.resting[id] = day;
      }
      for (const id of overdue.release) {
        const d = deferred.get(id);
        if (d !== undefined) this.release(d, now, s);
      }
      s.today.overdueReleased = (s.today.overdueReleased ?? 0) + overdue.release.length;
    }
    if (!backlog) {
      // 4. Deferred cards (contracts §7.4), oldest first, while the forecast is open: `pickReleases` passes
      // over a family that cannot start today (no active slot, or a mic family without mic room) instead of
      // letting it hold up the ones behind it. Families the wait bound released count toward the daily cap.
      const items = this.reviewItems(now, s);
      const { waiting, deferred } = waitingNow();
      const releaseCfg: GovernorConfig = {
        ...intake,
        releasePerDay: {
          ...intake.releasePerDay,
          families: Math.max(0, intake.releasePerDay.families - (s.today.overdueReleased ?? 0)),
        },
      };
      for (const id of pickReleases(items, waiting, this.activePerceptual(), today, releaseCfg)) {
        const d = deferred.get(id);
        if (d !== undefined) this.release(d, now, s);
      }
      // 5. A resting family comes back to its own card, where it left off, once nothing waits (decision 27).
      // One that reached its mastery level meanwhile (evidence from other work) simply stays graduated.
      for (const id of Object.keys(s.resting)) {
        const def = this.deps.catalog.family(id as FamilyId);
        const row = this.deps.store.family(id);
        if (!def || !row?.compositeId || row.level >= def.masteryLevel) delete s.resting[id];
      }
      const back = pickRestReturn({
        items: this.reviewItems(now, s),
        resting: Object.entries(s.resting)
          .filter(([id]) => !s.recallPending.includes(id))
          .map(([id, since]) => ({
            cardId: id,
            restedDays: today - dayIndex(since),
            mic: this.deps.catalog.family(id as FamilyId)?.mic === true,
          })),
        waitingFamilies: this.deps.store
          .cards({ status: "deferred", kind: "family" })
          .filter((d) => this.isPerceptualCard(d.card)).length,
        activePerceptual: this.activePerceptual(),
        today,
        cfg: intake,
      });
      if (back !== null) {
        const stored = this.deps.store.card(back);
        if (stored) {
          this.deps.store.saveCard(
            { ...stored.card, status: "active", dueAt: at },
            { desiredRetention: stored.desiredRetention },
            at,
          );
          const row = this.familyRow(back, at);
          this.deps.store.saveFamily({ ...row, compositeId: null, graduatedAt: null, updatedAt: at });
          delete s.compositeCredits[back];
        }
        delete s.resting[back];
      }
      // 6. Deck cards at each deck's daily pace, while the fact forecast is not closed. Deck cards not yet
      // created are newer than any deferred fact card: they wait while one does.
      const factsWaiting = this.deps.store.cards({ status: "deferred", kind: "fact" }).length > 0;
      if (!factsWaiting && intakeForecast(items, today, intake, 0, "facts").state !== "closed") {
        for (const dc of this.deps.catalog.openDeckCards()) {
          if (s.today.newFacts >= cfg.newPerDay.facts) break;
          if (this.deps.store.card(dc.cardId)) continue;
          const used = s.today.deckIntro[dc.deckId] ?? 0;
          if (used >= dc.newPerDay) continue;
          s.today.deckIntro[dc.deckId] = used + 1;
          const card = this.srs.createCard("fact", dc.cardId, now);
          this.deps.store.saveCard(
            card,
            { desiredRetention: this.srs.desiredRetention("fact"), introducedBy: dc.deckId, releasedAt: at },
            at,
          );
          s.today.newFacts++;
        }
      }
    }
    this.saveState(s);
  }

  private release(d: StoredCard, now: Date, s: SrsWorkingState): void {
    const at = now.toISOString();
    const card: Card = { ...d.card, status: "active", dueAt: at };
    this.deps.store.saveCard(card, { desiredRetention: d.desiredRetention, releasedAt: at }, at);
    delete s.deferredSeq[card.id];
    if (card.kind === "family") {
      const def = this.deps.catalog.family(card.id as FamilyId);
      const row = this.familyRow(card.id, at);
      this.deps.store.saveFamily({
        ...row,
        blockedRemaining: def && isPerceptualFamily(def) ? BLOCKED_INTRO_SETS : 0,
        updatedAt: at,
      });
      s.today.newFamilies++;
    } else if (card.kind === "fact") s.today.newFacts++;
  }

  /**
   * Today's warm-up (contracts §7.4) as the API's `WarmupItem`s. Call `prepareDay` first. Composite sets
   * carry their sampled members; family sets carry the family's level.
   */
  planWarmup(now: Date, opts: PlanOptions): { plan: WarmupPlan; items: WarmupItem[] } {
    const s = this.loadState(now);
    const cfg = this.governor();
    const today = this.todayIndex(now);
    const due = this.offeredDue(now, s);
    const plan = planWarmup(
      due,
      {
        today,
        gapDays: opts.gapDays,
        anchorFallback: this.anchorFallback(now),
        ...(opts.budgetSec !== undefined ? { budgetSec: opts.budgetSec } : {}),
        ...(opts.micSetsUsed !== undefined ? { micSetsUsed: opts.micSetsUsed } : {}),
        ...(opts.continuation ? { continuation: true } : {}),
      },
      cfg,
    );
    return {
      plan,
      items: plan.items.map((p, i) =>
        this.toWarmupItem(p, `${this.day(now)}:${opts.continuation ? "m" : "w"}:${i}`),
      ),
    };
  }
  /**
   * Due items as offered right now: while a backlog is being cleared and 3 cards have already entered
   * relearning today, items with R below 0.60 wait for tomorrow (the Again cascade of contracts §7.9).
   */
  private offeredDue(now: Date, s: SrsWorkingState): ReviewItem[] {
    // Repair-queue families (a failed checkpoint's skills, §7.6) are scheduled into the next warm-ups
    // whether or not their card is due: the planner takes them right after the opener.
    const today = this.todayIndex(now);
    const due = this.reviewItems(now, s).filter((it) => it.dueDay <= today || it.repair);
    const backlog = s.backlogUntil !== null && dayIndex(s.backlogUntil) >= today;
    return capRelearning(due, s.today.agains, backlog).keep;
  }
  /** A reviews-only day: the budget, then "a little more" blocks up to 12 minutes. */
  planReviewDay(now: Date, gapDays: number): ReturnType<typeof planReviewDay> {
    const s = this.loadState(now);
    return planReviewDay(
      this.offeredDue(now, s),
      { today: this.todayIndex(now), gapDays, anchorFallback: this.anchorFallback(now) },
      this.governor(),
    );
  }

  /** Four trials one level down from the highest-R mastered family (no mic in Quiet mode). */
  private anchorFallback(now: Date): ReviewItem | null {
    const cfg = this.governor();
    let best: { item: ReviewItem; r: number } | null = null;
    for (const stored of this.deps.store.cards({ kind: "family" })) {
      if (stored.card.status !== "active" && stored.card.status !== "graduated") continue;
      const def = this.deps.catalog.family(stored.card.id as FamilyId);
      if (!def || !isPerceptualFamily(def) || (cfg.quiet && def.mic)) continue;
      const row = this.deps.store.family(def.id);
      if (!row || row.level < def.masteryLevel || stored.card.reps === 0) continue;
      const it = reviewItem(this.srs, stored.card, familyMeta(def), now);
      if (!best || it.recall > best.r)
        best = { item: { ...it, sec: GOVERNOR.anchorTrials * def.estTrialSec }, r: it.recall };
    }
    return best?.item ?? null;
  }

  private toWarmupItem(p: PlannedItem, id: string): WarmupItem {
    const familyId = p.item.family;
    const row = familyId && !isComposite(familyId) ? this.deps.store.family(familyId) : null;
    const def = familyId && !isComposite(familyId) ? this.deps.catalog.family(familyId) : null;
    let members: FamilyId[] = [];
    let trials = p.kind === "fact-set" ? p.cardIds.length : 0;
    if (p.kind === "composite-set" && familyId) {
      const stored = this.deps.store.card(familyId);
      const s = this.deps.state.get() ?? EMPTY_SRS_STATE;
      const set = planCompositeSet(
        this.compositeMembers(familyId).map((m) => ({
          family: m.familyId as FamilyId,
          recentCredits: s.compositeCredits[m.familyId] ?? [],
          mic: this.deps.catalog.family(m.familyId as FamilyId)?.mic ?? false,
          recalled: s.recallPending.includes(m.familyId),
        })),
        { quiet: this.governor().quiet, setKey: `${familyId}:${stored?.card.reps ?? 0}` },
      );
      members = set.members.map((m) => m.family);
      trials = set.trials;
    } else if (def) {
      trials = p.kind === "anchor" ? GOVERNOR.anchorTrials : def.trialsPerSet;
    }
    // Never above the level its gates open (contracts §7.3): a checkpoint's level-setting item can confirm a family at
    // its mastery level before every level's lesson is done; the set itself runs at the open level (drills.start).
    const open = def ? this.deps.catalog.levelLimits(def.id).maxOpenLevel : Number.POSITIVE_INFINITY;
    const own = row ? Math.min(row.level, open) : null;
    const level = own === null ? null : p.kind === "anchor" ? Math.max(1, own - 1) : Math.max(1, own);
    return {
      id,
      kind: p.kind,
      familyId: p.kind === "fact-set" || p.kind === "listen" ? null : familyId,
      members,
      cardIds: p.cardIds,
      level: p.kind === "listen" ? null : level,
      trials: p.kind === "listen" ? 0 : trials,
      estSec: p.estSec,
      mic: p.kind !== "listen" && p.kind !== "fact-set" && p.item.mic,
      rated: p.rated,
    };
  }

  // --- lessons seed cards ---

  /**
   * A completed lesson seeds its families and tested terms (contracts §7.4): at most 2 fact cards per
   * lesson (decision 2), the daily caps, the active cap (graduating a family early when one qualifies) and
   * the intake throttle decide which start `active` and which wait `deferred`. Concept and term cards get
   * their first rating from the lesson step that seeded them; a perceptual family's first sets are
   * blocked-intro sets in the following warm-ups.
   */
  seedFromLesson(req: SeedRequest, now: Date): SeedResult {
    const s = this.loadState(now);
    const at = now.toISOString();
    const cfg = this.governor();
    const today = this.todayIndex(now);
    const out: SeedResult = { active: [], deferred: [], glossaryOnly: [], graduatedEarly: [] };

    const defs = req.families
      .filter((id) => !this.deps.store.card(id))
      .map((id) => this.deps.catalog.family(id))
      .filter((d): d is FamilyDef => d !== null);
    const perceptual = defs.filter((d) => isPerceptualFamily(d) && !d.mic);
    const production = defs.filter((d) => isPerceptualFamily(d) && d.mic && !cfg.quiet);
    const paused = defs.filter((d) => isPerceptualFamily(d) && d.mic && cfg.quiet);
    const concept = defs.filter((d) => !isPerceptualFamily(d));
    const { cards: tested, glossaryOnly } = capLessonFacts(
      req.terms.filter((t) => !this.deps.store.card(t.factId)),
      cfg,
    );
    out.glossaryOnly = glossaryOnly.map((t) => t.factId);

    // The cap is hit: graduate the strongest family at its mastery level early.
    const want = perceptual.length + production.length;
    while (want > 0 && this.activePerceptual() + want > cfg.maxActivePerceptual) {
      const pick = earlyGraduate(this.graduationCandidates(now), cfg);
      if (!pick) break;
      this.graduate(pick, now);
      out.graduatedEarly.push(pick);
    }

    // The intake throttle measures the forecast against the mean warm-up budget of the upcoming sessions.
    const intake = this.intakeGovernor();
    const admitNow = () =>
      admitCreated({
        items: this.reviewItems(now, s),
        today,
        perceptual: perceptual.length,
        production: production.length,
        concept: concept.length,
        facts: tested.length,
        activePerceptual: this.activePerceptual(),
        newToday: { families: s.today.newFamilies, facts: s.today.newFacts },
        cfg: intake,
      });
    let admit = admitNow();
    // The time cap is hit (contracts §7.4): the throttle would leave a new family waiting while an active
    // family already stands at its mastery level. That one graduates early (it keeps being sampled in its
    // composite), and the lesson's family starts now instead of waiting.
    while (
      admit.perceptual + admit.production < perceptual.length + production.length &&
      s.today.newFamilies + admit.perceptual + admit.production + admit.concept < cfg.newPerDay.families
    ) {
      const pick = earlyGraduate(this.graduationCandidates(now), cfg, "time");
      if (!pick) break;
      this.graduate(pick, now);
      out.graduatedEarly.push(pick);
      admit = admitNow();
    }
    s.today.newFamilies += admit.perceptual + admit.production + admit.concept;
    s.today.newFacts += admit.facts;

    const create = (kind: CardKind, id: string, status: CardStatus, rating: Rating | null) => {
      let card = this.srs.createCard(kind, id, now, status);
      if (rating !== null) {
        const res = this.srs.rate(card, rating, now);
        card = res.card;
        this.deps.store.saveCard(
          card,
          {
            desiredRetention: this.srs.desiredRetention(kind),
            introducedBy: req.lessonId,
            releasedAt: status === "active" ? at : null,
          },
          at,
        );
        this.deps.store.addRevlog({
          cardId: id,
          reviewedAt: at,
          rating: res.rating,
          revlog: res.revlog,
          drillSessionId: null,
          meanCredit: null,
          trialsTotal: null,
          medianRtMs: null,
        });
      } else {
        this.deps.store.saveCard(
          card,
          {
            desiredRetention: this.srs.desiredRetention(kind),
            introducedBy: req.lessonId,
            releasedAt: status === "active" ? at : null,
          },
          at,
        );
      }
      if (status === "deferred") s.deferredSeq[id] = ++s.seq;
      (status === "active" ? out.active : out.deferred).push(id);
    };
    const seedFamily = (def: FamilyDef, active: boolean, status?: CardStatus) => {
      const perceptualFam = isPerceptualFamily(def);
      const score = req.conceptScores?.[def.id];
      const rating = active && !perceptualFam && score !== undefined ? stepGrade(score, NO_ASSIST) : null;
      create(
        perceptualFam ? "family" : "concept",
        def.id,
        status ?? (active ? "active" : "deferred"),
        rating,
      );
      const row = this.familyRow(def.id, at);
      this.deps.store.saveFamily({
        ...row,
        blockedRemaining: active && perceptualFam ? BLOCKED_INTRO_SETS : 0,
        updatedAt: at,
      });
    };
    perceptual.forEach((d, i) => {
      seedFamily(d, i < admit.perceptual);
    });
    production.forEach((d, i) => {
      seedFamily(d, i < admit.production);
    });
    concept.forEach((d, i) => {
      seedFamily(d, i < admit.concept);
    });
    // Production families in Quiet mode are created paused (contracts §8.5).
    for (const d of paused) seedFamily(d, false, "paused");
    tested.forEach((t, i) => {
      const active = i < admit.facts;
      create("fact", t.factId, active ? "active" : "deferred", active ? stepGrade(t.score, NO_ASSIST) : null);
    });
    this.saveState(s);
    return out;
  }

  // --- reviews ---

  /**
   * One rated review: a family or concept set, a composite set (with its per-member trial credits), or a
   * fact card. `null` rating for a disputed attempt or a mic-less skip (contracts §7.2).
   */
  review(
    req: SrsReviewRequest & {
      trials?: readonly { familyId: string; credit: number }[];
      disputed?: boolean;
      skipped?: boolean;
    },
    now: Date,
  ): SrsReviewResult {
    const stored = this.deps.store.card(req.cardId);
    if (!stored) throw new Error(`@oak/server srs: unknown card ${req.cardId}`);
    const at = now.toISOString();
    const s = this.loadState(now);
    const cfg = this.governor();
    const c = stored.card;
    const today = this.todayIndex(now);
    const famRow = c.kind === "family" || c.kind === "concept" ? this.familyRow(c.id, at) : null;
    if (req.disputed || req.skipped) {
      return this.result(stored.card, null, famRow, null, false);
    }

    const def =
      c.kind === "family" || c.kind === "concept" ? this.deps.catalog.family(c.id as FamilyId) : null;
    const fastRtMs = def?.fastRtMs ?? this.deps.catalog.fact(c.id)?.fastRtMs ?? 4000;
    const o = req.outcome;
    let rating: Rating;
    const outcome: ReviewOutcome = {
      meanCredit: o.meanCredit,
      medianRtMs: o.medianRtMs,
      fastRtMs,
      extraReplays: o.extraReplays,
      hintRung: o.hintRung as HintRung,
      revealed: o.revealed,
      atOrAboveLevel: famRow === null || o.playedLevel === null || o.playedLevel >= famRow.level,
    };
    if (def?.mic && o.meanAbsCents !== null) {
      outcome.meanAbsCents = o.meanAbsCents;
      outcome.tolCents = this.deps.learner.profile().singToleranceCents;
    }
    if (c.kind === "fact") {
      rating = o.revealed ? 1 : factGrade(o.meanCredit >= 0.5, o.medianRtMs, fastRtMs, o.hintRung >= 1);
    } else {
      rating = gradeFor(outcome);
    }

    // Oak's interval policy: the governor's cadence cap and the load-balanced due day.
    const cap = intervalCap(c, this.isPerceptualCard(c), cfg);
    const items = this.reviewItems(now, s);
    const loadByDay = new Map<number, number>();
    for (const it of items)
      if (it.dueDay > today && it.cardId !== c.id)
        loadByDay.set(it.dueDay, (loadByDay.get(it.dueDay) ?? 0) + it.sec);
    const likely = likelyPracticeDays(s.sessionDays.map(dayIndex), today);
    const res = this.srs.rate(c, rating, now, {
      pickDay: makeDayPicker(loadByDay, today, likely),
      ...(cap !== undefined ? { maxIntervalDays: cap } : {}),
    });
    const next: Card = res.card;
    this.deps.store.saveCard(next, { desiredRetention: stored.desiredRetention }, at);
    this.deps.store.addRevlog({
      cardId: c.id,
      reviewedAt: at,
      rating,
      revlog: { ...res.revlog, outcome },
      drillSessionId: req.drillSessionId,
      meanCredit: o.meanCredit,
      trialsTotal: req.trials?.length ?? null,
      medianRtMs: o.medianRtMs,
    });
    // The Again cascade counts cards entering relearning today (contracts §7.9).
    if (rating === 1 && c.state === 2) s.today.agains++;
    delete s.deferUntil[c.id];

    let levelChange: "promoted" | "demoted" | null = null;
    let graduated = false;
    let row = famRow;
    if (row && def) {
      const lim = this.deps.catalog.levelLimits(def.id);
      const stepped = stepLevel(
        { level: row.level, promoDay: row.promoDay === null ? null : dayIndex(row.promoDay) },
        o.meanCredit,
        today,
        { maxOpenLevel: lim.maxOpenLevel, topLevel: lim.topLevel },
      );
      levelChange = stepped.change;
      row = {
        ...row,
        level: stepped.level,
        promoDay: stepped.promoDay === null ? null : dayFromIndex(stepped.promoDay),
        blockedRemaining: Math.max(0, row.blockedRemaining - 1),
        updatedAt: at,
      };
      this.deps.store.saveFamily(row);
      if (isPerceptualFamily(def) && def.mix && next.status === "active") {
        if (
          shouldGraduate(
            {
              level: row.level,
              masteryLevel: def.masteryLevel,
              maxOpenLevel: lim.maxOpenLevel,
              t90Days: this.srs.intervalAt(next, 0.9),
              lastRatings: next.lastRatings,
            },
            cfg,
          )
        ) {
          this.graduate(def.id, now);
          graduated = true;
          row = this.familyRow(def.id, at);
        }
      }
    }
    if (c.kind === "composite" && req.trials) {
      for (const t of req.trials) {
        const credits = [...(s.compositeCredits[t.familyId] ?? []), t.credit].slice(-GOVERNOR.recallWindow);
        s.compositeCredits[t.familyId] = credits;
        if (memberNeedsRecall(credits) && !s.recallPending.includes(t.familyId)) {
          s.recallPending.push(t.familyId);
          delete s.resting[t.familyId];
        }
      }
    }
    this.saveState(s);
    const final = this.deps.store.card(c.id)?.card ?? next;
    return this.result(final, rating, row, levelChange, graduated);
  }

  /** Graduate a family into its composite: its card is suspended and the composite card exists. */
  private graduate(familyId: string, now: Date): void {
    const at = now.toISOString();
    const def = this.deps.catalog.family(familyId as FamilyId);
    const stored = this.deps.store.card(familyId);
    if (!def?.mix || !stored) return;
    const compositeId = COMPOSITE_IDS[def.mix];
    this.deps.store.setCardStatus(familyId, "graduated", at);
    const row = this.familyRow(familyId, at);
    this.deps.store.saveFamily({ ...row, compositeId, graduatedAt: at, updatedAt: at });
    if (!this.deps.store.card(compositeId)) {
      // The graduating set doubles as the composite card's first review.
      const res = this.srs.rate(this.srs.createCard("composite", compositeId, now), 3, now);
      this.deps.store.saveCard(
        res.card,
        { desiredRetention: this.srs.desiredRetention("composite"), introducedBy: familyId, releasedAt: at },
        at,
      );
      this.deps.store.addRevlog({
        cardId: compositeId,
        reviewedAt: at,
        rating: 3,
        revlog: res.revlog,
        drillSessionId: null,
        meanCredit: null,
        trialsTotal: null,
        medianRtMs: null,
      });
    }
  }

  /**
   * When a gating lesson opens a graduated family's next level, it is recalled like any other member
   * (contracts §7.4 "Gated ladders"). Call after a lesson completes.
   */
  recallOpenedLadders(now: Date): string[] {
    const s = this.loadState(now);
    const recalled: string[] = [];
    for (const row of this.deps.store.families()) {
      // A resting family (decision 27) comes back through the rest queue, not here.
      if (!row.compositeId || s.recallPending.includes(row.familyId) || s.resting[row.familyId]) continue;
      const def = this.deps.catalog.family(row.familyId as FamilyId);
      if (!def || row.level >= def.masteryLevel) continue;
      if (this.deps.catalog.levelLimits(def.id).maxOpenLevel > row.level) {
        s.recallPending.push(row.familyId);
        recalled.push(row.familyId);
      }
    }
    this.saveState(s);
    return recalled;
  }

  /**
   * Work outside a card's own review (contracts §7.4): an in-lesson ear, sing or tap step, a gym set, a
   * graded transcription step or a checkpoint item moves the family's level, and counts as the card's
   * review only when the card is due within 2 days. Free practice reviews only a card already due.
   */
  otherWork(
    args: {
      source: OtherWorkSource;
      familyId: FamilyId;
      meanCredit: number;
      medianRtMs: number;
      playedLevel: number | null;
    },
    now: Date,
  ): { reviewed: SrsReviewResult | null; levelChange: "promoted" | "demoted" | null } {
    const stored = this.deps.store.card(args.familyId);
    const at = now.toISOString();
    const today = this.todayIndex(now);
    if (!stored) return { reviewed: null, levelChange: null };
    const verdict = otherWorkCredit({
      source: args.source,
      status: stored.card.status,
      dueDay: this.srs.dayOf(stored.card.dueAt),
      today,
    });
    const request: SrsReviewRequest = {
      cardId: args.familyId,
      drillSessionId: null,
      outcome: {
        meanCredit: args.meanCredit,
        medianRtMs: args.medianRtMs,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        playedLevel: args.playedLevel,
        meanAbsCents: null,
      },
    };
    if (verdict === "review" && stored.card.kind !== "composite") {
      const r = this.review(request, now);
      return { reviewed: r, levelChange: r.levelChange };
    }
    // Evidence only: the level staircase moves, the schedule does not.
    const def = this.deps.catalog.family(args.familyId);
    if (!def) return { reviewed: null, levelChange: null };
    const row = this.familyRow(args.familyId, at);
    const lim = this.deps.catalog.levelLimits(def.id);
    const stepped = stepLevel(
      { level: row.level, promoDay: row.promoDay === null ? null : dayIndex(row.promoDay) },
      args.meanCredit,
      today,
      lim,
    );
    this.deps.store.saveFamily({
      ...row,
      level: stepped.level,
      promoDay: stepped.promoDay === null ? null : dayFromIndex(stepped.promoDay),
      updatedAt: at,
    });
    return { reviewed: null, levelChange: stepped.change };
  }

  // --- views ---

  cardDto(stored: StoredCard, now: Date): SrsCardDto {
    const c = stored.card;
    return {
      cardId: c.id,
      kind: c.kind,
      status: c.status,
      desiredRetention: stored.desiredRetention,
      dueAt: c.dueAt,
      state: c.state,
      stability: c.stability,
      difficulty: c.difficulty,
      reps: c.reps,
      lapses: c.lapses,
      scheduledDays: c.scheduledDays,
      lastReviewAt: c.lastReviewAt,
      model: c.model,
      retrievability: this.srs.retrievability(c, now),
      introducedBy: stored.introducedBy,
      releasedAt: stored.releasedAt,
    };
  }
  familyDto(row: FamilyStateRow): FamilyStateDto {
    const lim = this.deps.catalog.levelLimits(row.familyId as FamilyId);
    return {
      familyId: row.familyId as FamilyId,
      level: Math.max(1, row.level),
      promoDay: row.promoDay,
      categoryStats: row.categoryStats,
      confusion: row.confusion,
      blockedRemaining: row.blockedRemaining,
      compositeId: (row.compositeId as FamilyId | null) ?? null,
      graduatedAt: row.graduatedAt,
      openCategories: lim.openCategories,
      maxOpenLevel: lim.maxOpenLevel,
    };
  }
  /**
   * Every non-paused card with its recall, ρ and ω, for mastery's R (contracts §7.5) and map shading
   * (§7.10). A graduated family contributes through its composite: its own row carries the composite's R.
   */
  cardRecalls(now: Date): {
    cardId: string;
    kind: CardKind;
    status: CardStatus;
    retrievability: number;
    desiredRetention: number;
    weight: number;
    viaComposite: string | null;
  }[] {
    const out: ReturnType<SrsService["cardRecalls"]> = [];
    const byId = new Map(this.deps.store.cards().map((s) => [s.card.id, s]));
    // In Quiet mode production (sing) cards are paused: not in map shading either (contracts §8.5).
    const quiet = this.deps.learner.profile().quiet;
    for (const stored of byId.values()) {
      const c = stored.card;
      if (c.status === "paused" || c.status === "retired" || c.status === "deferred") continue;
      if (quiet && c.kind === "family" && this.deps.catalog.family(c.id as FamilyId)?.mic === true) continue;
      let source = stored;
      let via: string | null = null;
      if (c.status === "graduated") {
        const row = this.deps.store.family(c.id);
        const comp = row?.compositeId ? byId.get(row.compositeId) : undefined;
        if (!comp) continue;
        source = comp;
        via = comp.card.id;
      }
      out.push({
        cardId: c.id,
        kind: c.kind,
        status: c.status,
        retrievability: this.srs.retrievability(source.card, now),
        desiredRetention: source.desiredRetention,
        weight: cardWeight(c.kind, this.isPerceptualCard(c)),
        viaComposite: via,
      });
    }
    return out;
  }

  private result(
    card: Card,
    rating: Rating | null,
    row: FamilyStateRow | null,
    levelChange: "promoted" | "demoted" | null,
    graduated: boolean,
  ): SrsReviewResult {
    return {
      cardId: card.id,
      rating: rating === null ? null : RATING_NAME[rating],
      dueAt: card.dueAt,
      scheduledDays: card.scheduledDays,
      status: card.status,
      familyState: row ? this.familyDto(row) : null,
      levelChange,
      graduated,
    };
  }
}

const NO_ASSIST = { hintRung: 0, revealed: false, extraReplays: 0 } as const;
