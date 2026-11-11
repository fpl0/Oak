// srs_cards, srs_revlog, family_state, drill_sessions, drill_trials. The scheduling rules live in
// `@oak/srs` and `services/srs.ts`; this file only stores and reads.
import type { DrillSession, DrillTrialRecord } from "@oak/api";
import type { Card, CardKind, CardStatus, Revlog } from "@oak/srs";
import { all, bool, type Db, fromJson, get, int, run, toJson, toJsonOrNull } from "../index.ts";

export interface StoredCard {
  card: Card;
  desiredRetention: number;
  payload: unknown;
  introducedBy: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
interface CardRow {
  card_id: string;
  kind: string;
  status: string;
  payload_json: string | null;
  fsrs_json: string;
  model: string;
  desired_retention: number;
  due_at: string;
  state: number;
  introduced_by: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}
function toStoredCard(r: CardRow): StoredCard {
  const fsrs = fromJson<Partial<Card>>(r.fsrs_json, {});
  const card: Card = {
    stability: 0,
    stabilityFast: 0,
    difficulty: 0,
    scheduleStatus: "",
    lastReviewAt: null,
    reps: 0,
    lapses: 0,
    scheduledDays: 0,
    learningStep: 0,
    lastRatings: [],
    ...fsrs,
    // The columns win over the JSON copy: they are what queries and status changes write.
    id: r.card_id,
    kind: r.kind as CardKind,
    status: r.status as CardStatus,
    model: r.model,
    state: r.state as Card["state"],
    dueAt: r.due_at,
  };
  return {
    card,
    desiredRetention: r.desired_retention,
    payload: fromJson(r.payload_json, null),
    introducedBy: r.introduced_by,
    releasedAt: r.released_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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
interface FamRow {
  family_id: string;
  level: number;
  promo_day: string | null;
  category_stats_json: string;
  confusion_json: string;
  blocked_remaining: number;
  composite_id: string | null;
  graduated_at: string | null;
  updated_at: string;
}
const toFamily = (r: FamRow): FamilyStateRow => ({
  familyId: r.family_id,
  level: r.level,
  promoDay: r.promo_day,
  categoryStats: fromJson(r.category_stats_json, {}),
  confusion: fromJson(r.confusion_json, {}),
  blockedRemaining: r.blocked_remaining,
  compositeId: r.composite_id,
  graduatedAt: r.graduated_at,
  updatedAt: r.updated_at,
});

export interface RevlogRow {
  id: number;
  cardId: string;
  reviewedAt: string;
  rating: 1 | 2 | 3 | 4;
  revlog: Revlog | null;
  drillSessionId: string | null;
  meanCredit: number | null;
  trialsTotal: number | null;
  medianRtMs: number | null;
}

/** The parts of a `DrillSession` that are decided when the set starts. */
export type DrillPlan = Pick<DrillSession, "levels" | "openCategories" | "focus" | "trialsPlanned">;
interface DrillRow {
  id: string;
  session_id: string | null;
  purpose: string;
  family_ids: string;
  set_id: string;
  warmup_item_id: string | null;
  plan_json: string | null;
  started_at: string;
  finished_at: string | null;
  trials_total: number;
  mean_credit: number | null;
}
function toDrill(r: DrillRow): DrillSession & { warmupItemId: string | null; meanCredit: number | null } {
  const plan = fromJson<DrillPlan>(r.plan_json, { levels: {}, openCategories: {}, focus: {}, trialsPlanned: 0 });
  return {
    id: r.id,
    sessionId: r.session_id,
    purpose: r.purpose as DrillSession["purpose"],
    familyIds: fromJson<DrillSession["familyIds"]>(r.family_ids, []),
    setId: r.set_id,
    ...plan,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    warmupItemId: r.warmup_item_id,
    meanCredit: r.mean_credit,
  };
}

interface TrialRow {
  idx: number;
  family_id: string;
  seed: number;
  level: number;
  category: string;
  trial_json: string;
  response_json: string;
  credit: number;
  correct: number;
  cents_error: number | null;
  rt_ms: number;
  replays: number;
  at: string;
}
function toTrial(r: TrialRow): DrillTrialRecord {
  const trial = fromJson<{ params: Record<string, unknown>; confusion: [string, string] | null }>(r.trial_json, {
    params: {},
    confusion: null,
  });
  return {
    idx: r.idx,
    familyId: r.family_id as DrillTrialRecord["familyId"],
    seed: r.seed,
    level: r.level,
    category: r.category,
    params: trial.params,
    response: fromJson<DrillTrialRecord["response"]>(r.response_json, {
      answer: null,
      taps: null,
      sung: null,
      skipped: true,
    }),
    credit: r.credit,
    correct: bool(r.correct),
    rtMs: r.rt_ms,
    replays: r.replays,
    confusion: trial.confusion,
    centsError: r.cents_error,
    at: r.at,
  };
}

export class SrsRepo {
  constructor(private readonly db: Db) {}

  // --- cards ---
  card(cardId: string): StoredCard | null {
    const row = get<CardRow>(this.db, "SELECT * FROM srs_cards WHERE card_id = ?", cardId);
    return row === null ? null : toStoredCard(row);
  }
  cards(filter: { status?: CardStatus; kind?: CardKind } = {}): StoredCard[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.status !== undefined) {
      where.push("status = ?");
      params.push(filter.status);
    }
    if (filter.kind !== undefined) {
      where.push("kind = ?");
      params.push(filter.kind);
    }
    return all<CardRow>(
      this.db,
      `SELECT * FROM srs_cards ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY due_at, card_id`,
      ...params,
    ).map(toStoredCard);
  }
  /** Active cards due at or before `at`. */
  due(at: string): StoredCard[] {
    return all<CardRow>(
      this.db,
      "SELECT * FROM srs_cards WHERE status = 'active' AND due_at <= ? ORDER BY due_at, card_id",
      at,
    ).map(toStoredCard);
  }
  saveCard(
    card: Card,
    meta: { desiredRetention: number; payload?: unknown; introducedBy?: string | null; releasedAt?: string | null },
    at: string,
  ): StoredCard {
    run(
      this.db,
      `INSERT INTO srs_cards (card_id, kind, status, payload_json, fsrs_json, model, desired_retention, due_at, state,
         introduced_by, released_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (card_id) DO UPDATE SET kind = excluded.kind, status = excluded.status,
         payload_json = COALESCE(excluded.payload_json, srs_cards.payload_json), fsrs_json = excluded.fsrs_json,
         model = excluded.model, desired_retention = excluded.desired_retention, due_at = excluded.due_at,
         state = excluded.state, introduced_by = COALESCE(excluded.introduced_by, srs_cards.introduced_by),
         released_at = COALESCE(excluded.released_at, srs_cards.released_at), updated_at = excluded.updated_at`,
      card.id,
      card.kind,
      card.status,
      toJsonOrNull(meta.payload),
      toJson(card),
      card.model,
      meta.desiredRetention,
      card.dueAt,
      card.state,
      meta.introducedBy ?? null,
      meta.releasedAt ?? null,
      at,
      at,
    );
    return this.card(card.id) as StoredCard;
  }
  setCardStatus(cardId: string, status: CardStatus, at: string): void {
    run(this.db, "UPDATE srs_cards SET status = ?, updated_at = ? WHERE card_id = ?", status, at, cardId);
  }

  // --- revlog ---
  addRevlog(entry: Omit<RevlogRow, "id">): number {
    return run(
      this.db,
      `INSERT INTO srs_revlog (card_id, reviewed_at, rating, revlog_json, drill_session_id, mean_credit, trials_total, median_rt_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.cardId,
      entry.reviewedAt,
      entry.rating,
      toJson(entry.revlog),
      entry.drillSessionId,
      entry.meanCredit,
      entry.trialsTotal,
      entry.medianRtMs,
    ).lastInsertRowid;
  }
  revlog(cardId: string): RevlogRow[] {
    return all<{
      id: number;
      card_id: string;
      reviewed_at: string;
      rating: number;
      revlog_json: string;
      drill_session_id: string | null;
      mean_credit: number | null;
      trials_total: number | null;
      median_rt_ms: number | null;
    }>(this.db, "SELECT * FROM srs_revlog WHERE card_id = ? ORDER BY reviewed_at, id", cardId).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      reviewedAt: r.reviewed_at,
      rating: r.rating as RevlogRow["rating"],
      revlog: fromJson<Revlog | null>(r.revlog_json, null),
      drillSessionId: r.drill_session_id,
      meanCredit: r.mean_credit,
      trialsTotal: r.trials_total,
      medianRtMs: r.median_rt_ms,
    }));
  }
  /** Reviews recorded on or after `since`. */
  reviewsSince(since: string): number {
    return Number(get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM srs_revlog WHERE reviewed_at >= ?", since)?.n ?? 0);
  }

  // --- family_state ---
  family(familyId: string): FamilyStateRow | null {
    const row = get<FamRow>(this.db, "SELECT * FROM family_state WHERE family_id = ?", familyId);
    return row === null ? null : toFamily(row);
  }
  families(): FamilyStateRow[] {
    return all<FamRow>(this.db, "SELECT * FROM family_state ORDER BY family_id").map(toFamily);
  }
  saveFamily(f: FamilyStateRow): FamilyStateRow {
    run(
      this.db,
      `INSERT INTO family_state (family_id, level, promo_day, category_stats_json, confusion_json, blocked_remaining, composite_id, graduated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (family_id) DO UPDATE SET level = excluded.level, promo_day = excluded.promo_day,
         category_stats_json = excluded.category_stats_json, confusion_json = excluded.confusion_json,
         blocked_remaining = excluded.blocked_remaining, composite_id = excluded.composite_id,
         graduated_at = excluded.graduated_at, updated_at = excluded.updated_at`,
      f.familyId,
      f.level,
      f.promoDay,
      toJson(f.categoryStats),
      toJson(f.confusion),
      f.blockedRemaining,
      f.compositeId,
      f.graduatedAt,
      f.updatedAt,
    );
    return f;
  }

  // --- drill sessions and trials ---
  createDrill(d: DrillSession, warmupItemId: string | null): void {
    const plan: DrillPlan = {
      levels: d.levels,
      openCategories: d.openCategories,
      focus: d.focus,
      trialsPlanned: d.trialsPlanned,
    };
    run(
      this.db,
      `INSERT INTO drill_sessions (id, session_id, purpose, family_ids, set_id, warmup_item_id, plan_json, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      d.id,
      d.sessionId,
      d.purpose,
      toJson(d.familyIds),
      d.setId,
      warmupItemId,
      toJson(plan),
      d.startedAt,
    );
  }
  drill(id: string): (DrillSession & { warmupItemId: string | null; meanCredit: number | null }) | null {
    const row = get<DrillRow>(this.db, "SELECT * FROM drill_sessions WHERE id = ?", id);
    return row === null ? null : toDrill(row);
  }
  finishDrill(id: string, finishedAt: string, trialsTotal: number, meanCredit: number): void {
    run(
      this.db,
      "UPDATE drill_sessions SET finished_at = ?, trials_total = ?, mean_credit = ? WHERE id = ?",
      finishedAt,
      trialsTotal,
      meanCredit,
      id,
    );
  }
  /** Stores trials; a resent index replaces the earlier row (the client may retry a batch). */
  saveTrials(drillSessionId: string, trials: readonly DrillTrialRecord[]): void {
    for (const t of trials)
      run(
        this.db,
        `INSERT INTO drill_trials (drill_session_id, idx, family_id, seed, level, category, trial_json, response_json, credit, correct, cents_error, rt_ms, replays, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (drill_session_id, idx) DO UPDATE SET family_id = excluded.family_id, seed = excluded.seed,
           level = excluded.level, category = excluded.category, trial_json = excluded.trial_json,
           response_json = excluded.response_json, credit = excluded.credit, correct = excluded.correct,
           cents_error = excluded.cents_error, rt_ms = excluded.rt_ms, replays = excluded.replays, at = excluded.at`,
        drillSessionId,
        t.idx,
        t.familyId,
        t.seed,
        t.level,
        t.category,
        toJson({ params: t.params, confusion: t.confusion }),
        toJson(t.response),
        t.credit,
        int(t.correct),
        t.centsError,
        t.rtMs,
        t.replays,
        t.at,
      );
  }
  trials(drillSessionId: string): DrillTrialRecord[] {
    return all<TrialRow>(
      this.db,
      "SELECT * FROM drill_trials WHERE drill_session_id = ? ORDER BY idx",
      drillSessionId,
    ).map(toTrial);
  }
  /** Finished rated sets on `day` boundaries are counted by the streak service; this gives the raw rows. */
  drillsFinishedBetween(from: string, to: string): { id: string; purpose: string; trialsTotal: number }[] {
    return all<{ id: string; purpose: string; trials_total: number }>(
      this.db,
      "SELECT id, purpose, trials_total FROM drill_sessions WHERE finished_at >= ? AND finished_at < ? ORDER BY finished_at",
      from,
      to,
    ).map((r) => ({ id: r.id, purpose: r.purpose, trialsTotal: r.trials_total }));
  }
}
