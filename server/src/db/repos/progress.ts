// unlocks, cando_ledger, terms_introduced, checkpoint_attempts, repair_queue, capstone_state.
import type { CanDoEntry, CheckpointItemSpec, TermIntroduced, Unlock } from "@oak/api";
import type { GradeResult } from "@oak/content-kit";
import { all, bool, type Db, fromJson, get, int, run, toJson, toJsonOrNull } from "../index.ts";

interface UnlockRow {
  item_id: string;
  kind: string;
  source_kind: string;
  source_id: string;
  unlocked_at: string;
  seen: number;
}
const toUnlock = (r: UnlockRow): Unlock => ({
  itemId: r.item_id,
  kind: r.kind as Unlock["kind"],
  sourceKind: r.source_kind as Unlock["sourceKind"],
  sourceId: r.source_id,
  unlockedAt: r.unlocked_at,
  seen: bool(r.seen),
});

export class UnlocksRepo {
  constructor(private readonly db: Db) {}
  list(): Unlock[] {
    return all<UnlockRow>(this.db, "SELECT * FROM unlocks ORDER BY unlocked_at, item_id").map(toUnlock);
  }
  ids(): Set<string> {
    return new Set(all<{ item_id: string }>(this.db, "SELECT item_id FROM unlocks").map((r) => r.item_id));
  }
  get(itemId: string): Unlock | null {
    const row = get<UnlockRow>(this.db, "SELECT * FROM unlocks WHERE item_id = ?", itemId);
    return row === null ? null : toUnlock(row);
  }
  /** Inserts the row unless the item is already unlocked. Returns the new row, or `null` when it existed. */
  grant(u: Unlock): Unlock | null {
    const { changes } = run(
      this.db,
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, ?, ?, ?, ?)",
      u.itemId,
      u.kind,
      u.sourceKind,
      u.sourceId,
      u.unlockedAt,
      int(u.seen),
    );
    return changes > 0 ? u : null;
  }
  markSeen(itemId: string): boolean {
    return run(this.db, "UPDATE unlocks SET seen = 1 WHERE item_id = ?", itemId).changes > 0;
  }
  since(at: string): Unlock[] {
    return all<UnlockRow>(
      this.db,
      "SELECT * FROM unlocks WHERE unlocked_at >= ? ORDER BY unlocked_at, item_id",
      at,
    ).map(toUnlock);
  }
}

interface CanDoRow {
  cando_id: string;
  status: string;
  evidence_kind: string;
  evidence_id: string;
  at: string;
}
const toCanDo = (r: CanDoRow): CanDoEntry => ({
  candoId: r.cando_id as CanDoEntry["candoId"],
  status: r.status as CanDoEntry["status"],
  evidenceKind: r.evidence_kind as CanDoEntry["evidenceKind"],
  evidenceId: r.evidence_id,
  at: r.at,
});

export class CanDoRepo {
  constructor(private readonly db: Db) {}
  /** Appends a status row. Two changes in the same millisecond keep both (the later instant is nudged). */
  append(e: CanDoEntry): CanDoEntry {
    let at = e.at;
    while (get(this.db, "SELECT 1 FROM cando_ledger WHERE cando_id = ? AND at = ?", e.candoId, at) !== null)
      at = new Date(Date.parse(at) + 1).toISOString();
    run(
      this.db,
      "INSERT INTO cando_ledger (cando_id, status, evidence_kind, evidence_id, at) VALUES (?, ?, ?, ?, ?)",
      e.candoId,
      e.status,
      e.evidenceKind,
      e.evidenceId,
      at,
    );
    return { ...e, at };
  }
  /** The current status of every can-do: its latest row. */
  current(): CanDoEntry[] {
    return all<CanDoRow>(
      this.db,
      `SELECT l.* FROM cando_ledger l
       JOIN (SELECT cando_id, MAX(at) AS at FROM cando_ledger GROUP BY cando_id) m
         ON m.cando_id = l.cando_id AND m.at = l.at
       ORDER BY l.at, l.cando_id`,
    ).map(toCanDo);
  }
  history(candoId: string): CanDoEntry[] {
    return all<CanDoRow>(this.db, "SELECT * FROM cando_ledger WHERE cando_id = ? ORDER BY at", candoId).map(
      toCanDo,
    );
  }
  since(at: string): CanDoEntry[] {
    return all<CanDoRow>(this.db, "SELECT * FROM cando_ledger WHERE at >= ? ORDER BY at, cando_id", at).map(
      toCanDo,
    );
  }
}

export class TermsRepo {
  constructor(private readonly db: Db) {}
  list(): TermIntroduced[] {
    return all<{ term_id: string; lesson_id: string; at: string }>(
      this.db,
      "SELECT * FROM terms_introduced ORDER BY at, term_id",
    ).map((r) => ({
      termId: r.term_id as TermIntroduced["termId"],
      lessonId: r.lesson_id as TermIntroduced["lessonId"],
      at: r.at,
    }));
  }
  /** Returns the row when the term is new, `null` when it was already introduced. */
  introduce(t: TermIntroduced): TermIntroduced | null {
    const { changes } = run(
      this.db,
      "INSERT OR IGNORE INTO terms_introduced (term_id, lesson_id, at) VALUES (?, ?, ?)",
      t.termId,
      t.lessonId,
      t.at,
    );
    return changes > 0 ? t : null;
  }
}

export interface PerSkillScore {
  skillId: string;
  role: "gating" | "level-setting";
  mean: number;
  items: number;
  ok: boolean;
}
export interface CheckpointAttemptRow {
  id: number;
  cpId: string;
  attemptNo: number;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  passed: boolean;
  softPass: boolean;
  perSkill: PerSkillScore[];
  items: CheckpointItemSpec[];
  detail: unknown;
}
interface CpRow {
  id: number;
  cp_id: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  passed: number;
  soft_pass: number;
  per_skill_json: string | null;
  items_json: string;
  detail_json: string | null;
}
const toCp = (r: CpRow): CheckpointAttemptRow => ({
  id: r.id,
  cpId: r.cp_id,
  attemptNo: r.attempt_no,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  score: r.score,
  passed: bool(r.passed),
  softPass: bool(r.soft_pass),
  perSkill: fromJson<PerSkillScore[]>(r.per_skill_json, []),
  items: fromJson<CheckpointItemSpec[]>(r.items_json, []),
  detail: fromJson(r.detail_json, null),
});

export interface RepairRow {
  id: number;
  cpId: string;
  skillId: string;
  familyId: string | null;
  setsRemaining: number;
  createdAt: string;
}

export class CheckpointsRepo {
  constructor(private readonly db: Db) {}
  attempts(cpId: string): CheckpointAttemptRow[] {
    return all<CpRow>(
      this.db,
      "SELECT * FROM checkpoint_attempts WHERE cp_id = ? ORDER BY attempt_no",
      cpId,
    ).map(toCp);
  }
  allAttempts(): CheckpointAttemptRow[] {
    return all<CpRow>(this.db, "SELECT * FROM checkpoint_attempts ORDER BY cp_id, attempt_no").map(toCp);
  }
  attempt(cpId: string, attemptNo: number): CheckpointAttemptRow | null {
    const row = get<CpRow>(
      this.db,
      "SELECT * FROM checkpoint_attempts WHERE cp_id = ? AND attempt_no = ?",
      cpId,
      attemptNo,
    );
    return row === null ? null : toCp(row);
  }
  start(
    cpId: string,
    attemptNo: number,
    startedAt: string,
    items: CheckpointItemSpec[],
  ): CheckpointAttemptRow {
    run(
      this.db,
      `INSERT INTO checkpoint_attempts (cp_id, attempt_no, started_at, items_json) VALUES (?, ?, ?, ?)
       ON CONFLICT (cp_id, attempt_no) DO UPDATE SET started_at = excluded.started_at, items_json = excluded.items_json`,
      cpId,
      attemptNo,
      startedAt,
      toJson(items),
    );
    return this.attempt(cpId, attemptNo) as CheckpointAttemptRow;
  }
  finish(
    cpId: string,
    attemptNo: number,
    f: {
      finishedAt: string;
      score: number;
      passed: boolean;
      softPass: boolean;
      perSkill: PerSkillScore[];
      detail: unknown;
    },
  ): void {
    run(
      this.db,
      `UPDATE checkpoint_attempts SET finished_at = ?, score = ?, passed = ?, soft_pass = ?, per_skill_json = ?, detail_json = ?
       WHERE cp_id = ? AND attempt_no = ?`,
      f.finishedAt,
      f.score,
      int(f.passed),
      int(f.softPass),
      toJson(f.perSkill),
      toJsonOrNull(f.detail),
      cpId,
      attemptNo,
    );
  }
  /** Marks a finished attempt as a soft pass ("Continue anyway" accepted afterwards). */
  setSoftPass(cpId: string, attemptNo: number): void {
    run(
      this.db,
      "UPDATE checkpoint_attempts SET soft_pass = 1 WHERE cp_id = ? AND attempt_no = ?",
      cpId,
      attemptNo,
    );
  }

  repairs(): RepairRow[] {
    return all<{
      id: number;
      cp_id: string;
      skill_id: string;
      family_id: string | null;
      sets_remaining: number;
      created_at: string;
    }>(this.db, "SELECT * FROM repair_queue WHERE sets_remaining > 0 ORDER BY id").map((r) => ({
      id: r.id,
      cpId: r.cp_id,
      skillId: r.skill_id,
      familyId: r.family_id,
      setsRemaining: r.sets_remaining,
      createdAt: r.created_at,
    }));
  }
  /** Replaces the queue of one checkpoint (a new fail supersedes the old plan). */
  setRepairs(
    cpId: string,
    rows: { skillId: string; familyId: string | null; sets: number }[],
    at: string,
  ): void {
    run(this.db, "DELETE FROM repair_queue WHERE cp_id = ?", cpId);
    for (const r of rows)
      run(
        this.db,
        "INSERT INTO repair_queue (cp_id, skill_id, family_id, sets_remaining, created_at) VALUES (?, ?, ?, ?, ?)",
        cpId,
        r.skillId,
        r.familyId,
        r.sets,
        at,
      );
  }
  clearRepairs(cpId: string): void {
    run(this.db, "DELETE FROM repair_queue WHERE cp_id = ?", cpId);
  }
  /** One repair set done for a family: decrements the oldest open row. */
  consumeRepair(familyId: string): boolean {
    const row = get<{ id: number }>(
      this.db,
      "SELECT id FROM repair_queue WHERE family_id = ? AND sets_remaining > 0 ORDER BY id LIMIT 1",
      familyId,
    );
    if (row === null) return false;
    run(this.db, "UPDATE repair_queue SET sets_remaining = sets_remaining - 1 WHERE id = ?", row.id);
    return true;
  }
}

export interface CapstoneRow {
  capstoneId: string;
  status: "open" | "in_progress" | "released";
  sessions: string[];
  sketchId: string | null;
  trackId: string | null;
  flavour: string | null;
  lastResult: GradeResult | null;
  /**
   * The sketch version `lastResult` was graded on (migration 0005). Left out of a save, the stored value is kept;
   * `null` for a row checked before the column existed.
   */
  checked?: { sketchId: string; version: number } | null;
  startedAt: string | null;
  releasedAt: string | null;
  updatedAt: string;
}

export class CapstonesRepo {
  constructor(private readonly db: Db) {}
  get(capstoneId: string): CapstoneRow | null {
    const r = get<{
      capstone_id: string;
      status: string;
      sessions_json: string;
      sketch_id: string | null;
      track_id: string | null;
      flavour: string | null;
      last_result_json: string | null;
      checked_sketch_id: string | null;
      checked_sketch_version: number | null;
      started_at: string | null;
      released_at: string | null;
      updated_at: string;
    }>(this.db, "SELECT * FROM capstone_state WHERE capstone_id = ?", capstoneId);
    if (r === null) return null;
    return {
      capstoneId: r.capstone_id,
      status: r.status as CapstoneRow["status"],
      sessions: fromJson<string[]>(r.sessions_json, []),
      sketchId: r.sketch_id,
      trackId: r.track_id,
      flavour: r.flavour,
      lastResult: fromJson<GradeResult | null>(r.last_result_json, null),
      checked:
        r.checked_sketch_id !== null && r.checked_sketch_version !== null
          ? { sketchId: r.checked_sketch_id, version: r.checked_sketch_version }
          : null,
      startedAt: r.started_at,
      releasedAt: r.released_at,
      updatedAt: r.updated_at,
    };
  }
  all(): CapstoneRow[] {
    return all<{ capstone_id: string }>(
      this.db,
      "SELECT capstone_id FROM capstone_state ORDER BY capstone_id",
    )
      .map((r) => this.get(r.capstone_id))
      .filter((r): r is CapstoneRow => r !== null);
  }
  save(c: CapstoneRow): CapstoneRow {
    run(
      this.db,
      `INSERT INTO capstone_state (capstone_id, status, sessions_json, sketch_id, track_id, flavour, last_result_json, started_at, released_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (capstone_id) DO UPDATE SET status = excluded.status, sessions_json = excluded.sessions_json,
         sketch_id = excluded.sketch_id, track_id = excluded.track_id, flavour = excluded.flavour,
         last_result_json = excluded.last_result_json, started_at = excluded.started_at,
         released_at = excluded.released_at, updated_at = excluded.updated_at`,
      c.capstoneId,
      c.status,
      toJson(c.sessions),
      c.sketchId,
      c.trackId,
      c.flavour,
      toJsonOrNull(c.lastResult),
      c.startedAt,
      c.releasedAt,
      c.updatedAt,
    );
    if (c.checked !== undefined)
      run(
        this.db,
        "UPDATE capstone_state SET checked_sketch_id = ?, checked_sketch_version = ? WHERE capstone_id = ?",
        c.checked?.sketchId ?? null,
        c.checked?.version ?? null,
        c.capstoneId,
      );
    return c;
  }
  releasedIds(): Set<string> {
    return new Set(
      all<{ capstone_id: string }>(
        this.db,
        "SELECT capstone_id FROM capstone_state WHERE status = 'released'",
      ).map((r) => r.capstone_id),
    );
  }
}
