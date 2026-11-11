// tutor_conversations, tutor_messages, tutor_backend_records, tutor_cards, tutor_notes, tutor_usage.
// Messages and backend records are append-only (triggers in 0001_init.sql); the only rows that change
// are a card's apply state and a note's `retracted_at`.
import type { TutorNote } from "../../tutor/domain.ts";
import type { CardData, UsageSummary } from "../../tutor/events.ts";
import type { CardRecord, ConversationRecord, MonthUsage } from "../../tutor/ports.ts";
import type {
  BackendId,
  ConversationKey,
  Effort,
  Lane,
  NewTranscriptEntry,
  Rung,
  SubjectKind,
  ThreadKind,
  TranscriptEntry,
} from "../../tutor/types.ts";
import { all, bool, type Db, fromJson, get, int, run, toJson, toJsonOrNull } from "../index.ts";

interface ConvRow {
  id: string;
  subject_kind: string;
  subject_id: string;
  day: string;
  thread_kind: string;
  effort: string;
  session_id: string | null;
  model: string | null;
  prefix_version: string | null;
  created_at: string;
}
const toConv = (r: ConvRow): ConversationRecord => ({
  id: r.id,
  key: {
    subjectKind: r.subject_kind as SubjectKind,
    subjectId: r.subject_id,
    day: r.day,
    lane: r.thread_kind as Lane,
  },
  effort: r.effort as Effort,
  prefixVersion: r.prefix_version ?? "",
  createdAt: r.created_at,
});

interface MsgRow {
  id: number;
  conversation_id: string;
  seq: number;
  at: string;
  role: string;
  kind: string;
  text: string;
  learner_code: string | null;
  card_ids_json: string;
  review_json: string | null;
  step_id: string | null;
  rung: number | null;
  summary: string | null;
  backend: string | null;
  excluded: number;
  error_kind: string | null;
}
const toEntry = (r: MsgRow): TranscriptEntry => ({
  conversationId: r.conversation_id,
  seq: r.seq,
  at: r.at,
  role: r.role as TranscriptEntry["role"],
  kind: r.kind as ThreadKind,
  text: r.text,
  learnerCode: r.learner_code,
  cardIds: fromJson<string[]>(r.card_ids_json, []),
  review: fromJson<unknown>(r.review_json, null),
  stepId: r.step_id,
  rung: r.rung as Rung | null,
  summary: r.summary,
  backend: r.backend as BackendId | null,
  excluded: bool(r.excluded),
  errorKind: r.error_kind as TranscriptEntry["errorKind"],
});

interface CardRow {
  id: string;
  conversation_id: string;
  tool_use_id: string;
  kind: string;
  title: string;
  code: string;
  explanation: string;
  bars: number;
  apply_state: string;
  locked_tools_json: string;
  applied_at: string | null;
  saved_sketch_id: string | null;
  created_at: string;
}
export interface StoredCard extends CardRecord {
  appliedAt: string | null;
  savedSketchId: string | null;
  createdAt: string;
}
const toCard = (r: CardRow): StoredCard => {
  // `applied` is a card that was applicable and has been applied; the stored state keeps both facts.
  const apply: CardData["apply"] = r.apply_state === "preview_only" ? "preview_only" : "applicable";
  return {
    cardId: r.id,
    conversationId: r.conversation_id,
    toolUseId: r.tool_use_id,
    kind: r.kind as CardData["kind"],
    title: r.title,
    code: r.code,
    explanation: r.explanation,
    bars: r.bars,
    apply,
    applyAllowed: apply === "applicable",
    lockedTools: fromJson<string[]>(r.locked_tools_json, []),
    applied: r.apply_state === "applied",
    appliedAt: r.applied_at,
    savedSketchId: r.saved_sketch_id,
    createdAt: r.created_at,
  };
};

interface NoteRow {
  id: string;
  day: string;
  subject_kind: string;
  subject_id: string;
  source: string;
  text: string;
  skill_id: string | null;
  conversation_id: string | null;
  retracted_at: string | null;
  at: string;
}
const toNote = (r: NoteRow): TutorNote => ({
  id: r.id,
  day: r.day,
  subjectKind: r.subject_kind,
  subjectId: r.subject_id,
  source: r.source as TutorNote["source"],
  text: r.text,
  skillId: r.skill_id,
  retractedAt: r.retracted_at,
});

export interface UsageInsert {
  at: string;
  day: string;
  conversationId: string;
  kind: ThreadKind;
  lane: Lane;
  usage: UsageSummary;
}

export interface LaneUsage {
  lane: Lane;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export class TutorRepo {
  #lastAt = 0;
  constructor(private readonly db: Db) {}

  // --- conversations ---
  findConversation(key: ConversationKey): ConversationRecord | null {
    const row = get<ConvRow>(
      this.db,
      "SELECT * FROM tutor_conversations WHERE subject_kind = ? AND subject_id = ? AND day = ? AND thread_kind = ?",
      key.subjectKind,
      key.subjectId,
      key.day,
      key.lane,
    );
    return row === null ? null : toConv(row);
  }
  conversation(id: string): ConversationRecord | null {
    const row = get<ConvRow>(this.db, "SELECT * FROM tutor_conversations WHERE id = ?", id);
    return row === null ? null : toConv(row);
  }
  createConversation(init: {
    id: string;
    key: ConversationKey;
    effort: Effort;
    prefixVersion: string;
    model: string;
    at: string;
  }): ConversationRecord {
    run(
      this.db,
      `INSERT INTO tutor_conversations (id, subject_kind, subject_id, day, thread_kind, effort, model, prefix_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      init.id,
      init.key.subjectKind,
      init.key.subjectId,
      init.key.day,
      init.key.lane,
      init.effort,
      init.model,
      init.prefixVersion,
      init.at,
    );
    return this.conversation(init.id) as ConversationRecord;
  }

  // --- messages ---
  /** A strictly increasing instant, so entries of one millisecond keep their order in the timeline. */
  #stamp(now: Date): string {
    const ms = Math.max(now.getTime(), this.#lastAt + 1);
    this.#lastAt = ms;
    return new Date(ms).toISOString();
  }
  entries(conversationId: string, includeExcluded: boolean): TranscriptEntry[] {
    return all<MsgRow>(
      this.db,
      `SELECT * FROM tutor_messages WHERE conversation_id = ? ${includeExcluded ? "" : "AND excluded = 0"} ORDER BY seq`,
      conversationId,
    ).map(toEntry);
  }
  append(conversationId: string, entry: NewTranscriptEntry, now: Date): TranscriptEntry {
    if (this.conversation(conversationId) === null)
      throw new Error(`no tutor conversation ${conversationId}`);
    const last = get<{ seq: number; at: string }>(
      this.db,
      "SELECT seq, at FROM tutor_messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT 1",
      conversationId,
    );
    if (last !== null) this.#lastAt = Math.max(this.#lastAt, Date.parse(last.at));
    const seq = (last?.seq ?? 0) + 1;
    const at = this.#stamp(now);
    run(
      this.db,
      `INSERT INTO tutor_messages (conversation_id, seq, at, role, kind, text, learner_code, card_ids_json, review_json, step_id, rung, summary, backend, excluded, error_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      conversationId,
      seq,
      at,
      entry.role,
      entry.kind,
      entry.text,
      entry.learnerCode,
      toJson(entry.cardIds),
      toJsonOrNull(entry.review),
      entry.stepId,
      entry.rung,
      entry.summary,
      entry.backend,
      int(entry.excluded),
      entry.errorKind,
    );
    return { ...structuredClone(entry), conversationId, seq, at };
  }
  /** Every entry of a subject, all days and lanes, in time order. */
  subjectEntries(
    subjectKind: string,
    subjectId: string,
    opts: { day?: string; includeExcluded: boolean },
  ): TranscriptEntry[] {
    const params: (string | number)[] = [subjectKind, subjectId];
    let where = "c.subject_kind = ? AND c.subject_id = ?";
    if (opts.day !== undefined) {
      where += " AND c.day = ?";
      params.push(opts.day);
    }
    if (!opts.includeExcluded) where += " AND m.excluded = 0";
    return all<MsgRow>(
      this.db,
      `SELECT m.* FROM tutor_messages m JOIN tutor_conversations c ON c.id = m.conversation_id WHERE ${where} ORDER BY m.at, m.id`,
      ...params,
    ).map(toEntry);
  }
  messagesOfSession(): number {
    return Number(get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM tutor_messages")?.n ?? 0);
  }

  // --- backend records ---
  backendRecords(conversationId: string, backend: BackendId): unknown[] {
    return all<{ record_json: string }>(
      this.db,
      "SELECT record_json FROM tutor_backend_records WHERE conversation_id = ? AND backend = ? AND excluded = 0 ORDER BY seq, id",
      conversationId,
      backend,
    ).map((r) => fromJson<unknown>(r.record_json, null));
  }
  appendBackendRecords(
    conversationId: string,
    backend: BackendId,
    records: readonly unknown[],
    excluded: boolean,
    at: string,
  ): void {
    const last = get<{ seq: number }>(
      this.db,
      "SELECT MAX(seq) AS seq FROM tutor_backend_records WHERE conversation_id = ? AND backend = ?",
      conversationId,
      backend,
    );
    let seq = Number(last?.seq ?? 0);
    for (const record of records) {
      seq += 1;
      run(
        this.db,
        "INSERT INTO tutor_backend_records (conversation_id, backend, seq, record_json, excluded, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        conversationId,
        backend,
        seq,
        toJson(record),
        int(excluded),
        at,
      );
    }
  }

  // --- cards ---
  saveCard(card: Omit<CardRecord, "applied"> & { createdAt: string }): StoredCard {
    run(
      this.db,
      `INSERT INTO tutor_cards (id, conversation_id, tool_use_id, kind, title, code, explanation, bars, apply_state, locked_tools_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      card.cardId,
      card.conversationId,
      card.toolUseId,
      card.kind,
      card.title,
      card.code,
      card.explanation,
      card.bars,
      card.apply,
      toJson(card.lockedTools),
      card.createdAt,
    );
    return this.card(card.cardId) as StoredCard;
  }
  card(id: string): StoredCard | null {
    const row = get<CardRow>(this.db, "SELECT * FROM tutor_cards WHERE id = ?", id);
    return row === null ? null : toCard(row);
  }
  cardsOf(conversationIds: readonly string[]): StoredCard[] {
    if (conversationIds.length === 0) return [];
    const marks = conversationIds.map(() => "?").join(", ");
    return all<CardRow>(
      this.db,
      `SELECT * FROM tutor_cards WHERE conversation_id IN (${marks}) ORDER BY created_at, id`,
      ...conversationIds,
    ).map(toCard);
  }
  /** Marks an applicable card applied. Preview-only cards are never applied (contracts §10.7). */
  markApplied(id: string, at: string, sketchId: string | null): boolean {
    return (
      run(
        this.db,
        "UPDATE tutor_cards SET apply_state = 'applied', applied_at = COALESCE(applied_at, ?), saved_sketch_id = COALESCE(?, saved_sketch_id) WHERE id = ? AND apply_state != 'preview_only'",
        at,
        sketchId,
        id,
      ).changes > 0
    );
  }
  conversationIdsOf(subjectKind: string, subjectId: string): string[] {
    return all<{ id: string }>(
      this.db,
      "SELECT id FROM tutor_conversations WHERE subject_kind = ? AND subject_id = ? ORDER BY created_at",
      subjectKind,
      subjectId,
    ).map((r) => r.id);
  }

  /** The newest review delivered on a subject (an accepted review is stored on its assistant message). */
  latestReview(subjectKind: string, subjectId: string): unknown | null {
    const r = get<{ review_json: string }>(
      this.db,
      `SELECT m.review_json FROM tutor_messages m JOIN tutor_conversations c ON c.id = m.conversation_id
       WHERE c.subject_kind = ? AND c.subject_id = ? AND m.review_json IS NOT NULL AND m.excluded = 0
       ORDER BY m.at DESC, m.id DESC LIMIT 1`,
      subjectKind,
      subjectId,
    );
    return r === null ? null : fromJson<unknown>(r.review_json, null);
  }

  // --- notes ---
  addNote(n: Omit<TutorNote, "retractedAt"> & { conversationId: string | null; at: string }): TutorNote {
    run(
      this.db,
      `INSERT INTO tutor_notes (id, day, subject_kind, subject_id, source, text, skill_id, conversation_id, retracted_at, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      n.id,
      n.day,
      n.subjectKind,
      n.subjectId,
      n.source,
      n.text,
      n.skillId,
      n.conversationId,
      n.at,
    );
    return this.note(n.id) as TutorNote;
  }
  note(id: string): TutorNote | null {
    const row = get<NoteRow>(this.db, "SELECT * FROM tutor_notes WHERE id = ?", id);
    return row === null ? null : toNote(row);
  }
  /** Non-retracted notes, newest first; all subjects when none is given. */
  notes(
    filter: { subjectKind?: string; subjectId?: string; limit?: number; includeRetracted?: boolean } = {},
  ): TutorNote[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (!filter.includeRetracted) where.push("retracted_at IS NULL");
    if (filter.subjectKind !== undefined) {
      where.push("subject_kind = ?");
      params.push(filter.subjectKind);
    }
    if (filter.subjectId !== undefined) {
      where.push("subject_id = ?");
      params.push(filter.subjectId);
    }
    params.push(filter.limit ?? 1000);
    return all<NoteRow>(
      this.db,
      `SELECT * FROM tutor_notes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, rowid DESC LIMIT ?`,
      ...params,
    ).map(toNote);
  }
  retractNote(id: string, at: string): boolean {
    return (
      run(this.db, "UPDATE tutor_notes SET retracted_at = ? WHERE id = ? AND retracted_at IS NULL", at, id)
        .changes > 0
    );
  }

  // --- usage ---
  recordUsage(row: UsageInsert): void {
    const u = row.usage;
    run(
      this.db,
      `INSERT INTO tutor_usage (conversation_id, kind, lane, backend, served_by_json, requests, input_tokens, output_tokens,
         cache_write_5m, cache_write_1h, cache_read, cache_creation, cost_usd, included_in_plan, day, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.conversationId,
      row.kind,
      row.lane,
      u.backend,
      toJson(u.servedBy),
      u.requests,
      u.inputTokens,
      u.outputTokens,
      u.cacheCreation5mInputTokens,
      u.cacheCreation1hInputTokens,
      u.cacheReadInputTokens,
      u.cacheCreationInputTokens,
      u.costUsd,
      int(u.includedInPlan),
      row.day,
      row.at,
    );
  }
  /** Totals of a learner-local month (`YYYY-MM`). */
  month(month: string): MonthUsage & { includedInPlan: boolean; requests: number } {
    const r = get<{
      cost: number | null;
      input: number | null;
      output: number | null;
      cread: number | null;
      ccreate: number | null;
      plan: number | null;
      requests: number | null;
    }>(
      this.db,
      `SELECT SUM(COALESCE(cost_usd, 0)) AS cost, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
         SUM(cache_read) AS cread, SUM(cache_creation) AS ccreate, MAX(included_in_plan) AS plan, SUM(requests) AS requests
       FROM tutor_usage WHERE day LIKE ?`,
      `${month}-%`,
    );
    return {
      costUsd: Number(r?.cost ?? 0),
      inputTokens: Number(r?.input ?? 0),
      outputTokens: Number(r?.output ?? 0),
      cacheReadInputTokens: Number(r?.cread ?? 0),
      cacheCreationInputTokens: Number(r?.ccreate ?? 0),
      includedInPlan: bool(r?.plan ?? 0),
      requests: Number(r?.requests ?? 0),
    };
  }
  byLane(month: string): LaneUsage[] {
    return all<{ lane: string; requests: number; input: number; output: number; cost: number }>(
      this.db,
      `SELECT lane, SUM(requests) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
         SUM(COALESCE(cost_usd, 0)) AS cost FROM tutor_usage WHERE day LIKE ? GROUP BY lane ORDER BY lane`,
      `${month}-%`,
    ).map((r) => ({
      lane: r.lane as Lane,
      requests: Number(r.requests),
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
      costUsd: Number(r.cost),
    }));
  }
}
