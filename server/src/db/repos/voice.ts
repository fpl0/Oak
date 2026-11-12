// Wave 3 tables (migration 0003): idempotency_keys, voice_state (one row) and sung_notes.
import { all, bool, type Db, fromJson, get, int, run, toJson } from "../index.ts";

// --- idempotency keys ---------------------------------------------------------------------------

export interface StoredResponse {
  bodyHash: string;
  response: unknown;
  at: string;
}

export class IdempotencyRepo {
  constructor(private readonly db: Db) {}

  get(endpoint: string, key: string): StoredResponse | null {
    const r = get<{ body_hash: string; response_json: string; at: string }>(
      this.db,
      "SELECT body_hash, response_json, at FROM idempotency_keys WHERE endpoint = ? AND key = ?",
      endpoint,
      key,
    );
    return r === null ? null : { bodyHash: r.body_hash, response: fromJson(r.response_json, null), at: r.at };
  }
  /** Stores the first response under the key (a second write of the same key keeps the first). */
  put(endpoint: string, key: string, bodyHash: string, response: unknown, at: string): void {
    run(
      this.db,
      `INSERT INTO idempotency_keys (endpoint, key, body_hash, response_json, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint, key) DO NOTHING`,
      endpoint,
      key,
      bodyHash,
      toJson(response),
      at,
    );
  }
  /** Drops keys stored before `before` (an ISO instant). */
  prune(before: string): number {
    return run(this.db, "DELETE FROM idempotency_keys WHERE at < ?", before).changes;
  }
}

// --- voice state ----------------------------------------------------------------------------------

export interface LadderChange {
  from: 70 | 50 | 35 | 25;
  to: 70 | 50 | 35 | 25;
  at: string;
  reason: "evidence" | "learner" | "loosen";
}
export interface VoiceStateRow {
  /** The learner day the `quietToday` choice was made for (it lapses at the next day). */
  quietDay: string | null;
  quietToday: boolean;
  lastChange: LadderChange | null;
  /** When the Coda announced `lastChange` (an evidence change is announced once). */
  announcedAt: string | null;
}

const EMPTY_VOICE: VoiceStateRow = { quietDay: null, quietToday: false, lastChange: null, announcedAt: null };

export class VoiceRepo {
  constructor(private readonly db: Db) {}

  get(): VoiceStateRow {
    const r = get<{
      quiet_day: string | null;
      quiet_today: number;
      last_change_json: string | null;
      announced_at: string | null;
    }>(this.db, "SELECT * FROM voice_state WHERE id = 1");
    if (r === null) return { ...EMPTY_VOICE };
    return {
      quietDay: r.quiet_day,
      quietToday: bool(r.quiet_today),
      lastChange: fromJson<LadderChange | null>(r.last_change_json, null),
      announcedAt: r.announced_at,
    };
  }
  save(s: VoiceStateRow, at: string): VoiceStateRow {
    run(
      this.db,
      `INSERT INTO voice_state (id, quiet_day, quiet_today, last_change_json, announced_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET quiet_day = excluded.quiet_day, quiet_today = excluded.quiet_today,
         last_change_json = excluded.last_change_json, announced_at = excluded.announced_at,
         updated_at = excluded.updated_at`,
      s.quietDay,
      int(s.quietToday),
      s.lastChange === null ? null : toJson(s.lastChange),
      s.announcedAt,
      at,
    );
    return this.get();
  }

  /**
   * Checkpoints the planner has offered (decision 29): checkpoint ID → the last learner day it was offered.
   * Internal state kept as one row of the key/value `settings` table (as `srs.state` is), so no migration and
   * backups carry it; the Settings API never lists it.
   */
  offers(): Record<string, string> {
    const r = get<{ value_json: string }>(
      this.db,
      "SELECT value_json FROM settings WHERE key = ?",
      OFFERS_KEY,
    );
    const v = r === null ? null : fromJson<unknown>(r.value_json, null);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  }
  /** Records that `cpId` was offered on `day` (a later day replaces an earlier one, never the reverse). */
  recordOffer(cpId: string, day: string, at: string): void {
    const offers = this.offers();
    if ((offers[cpId] ?? "") >= day) return;
    offers[cpId] = day;
    run(
      this.db,
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      OFFERS_KEY,
      toJson(offers),
      at,
    );
  }
}

/** The settings-table key of the checkpoint offers (internal; not a learner setting). */
export const OFFERS_KEY = "voice.cpOffers";

// --- sung notes -------------------------------------------------------------------------------------

export type SungSource = "step" | "trial" | "resolution";
export interface SungNoteRow {
  sourceKind: SungSource;
  sourceId: string;
  idx: number;
  day: string;
  absCents: number;
  credit: number;
  tolCents: number | null;
  at: string;
}

export class SungNotesRepo {
  constructor(private readonly db: Db) {}

  /** Replaces the notes of one source (a re-posted trial replaces its rows; an empty list removes them). */
  replace(
    sourceKind: SungSource,
    sourceId: string,
    notes: readonly Omit<SungNoteRow, "sourceKind" | "sourceId">[],
  ): void {
    run(this.db, "DELETE FROM sung_notes WHERE source_kind = ? AND source_id = ?", sourceKind, sourceId);
    for (const n of notes)
      run(
        this.db,
        `INSERT INTO sung_notes (source_kind, source_id, idx, day, abs_cents, credit, tol_cents, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        sourceKind,
        sourceId,
        n.idx,
        n.day,
        n.absCents,
        n.credit,
        n.tolCents,
        n.at,
      );
  }
  /** Notes on learner days `from`…`to` (inclusive) recorded after `since` (an instant; `null`: all). */
  between(from: string, to: string, since: string | null): SungNoteRow[] {
    return all<{
      source_kind: string;
      source_id: string;
      idx: number;
      day: string;
      abs_cents: number;
      credit: number;
      tol_cents: number | null;
      at: string;
    }>(
      this.db,
      "SELECT * FROM sung_notes WHERE day >= ? AND day <= ? AND at > ? ORDER BY day, at, idx",
      from,
      to,
      since ?? "",
    ).map((r) => ({
      sourceKind: r.source_kind as SungSource,
      sourceId: r.source_id,
      idx: r.idx,
      day: r.day,
      absCents: r.abs_cents,
      credit: r.credit,
      tolCents: r.tol_cents,
      at: r.at,
    }));
  }
}
