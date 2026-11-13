// Wave 4 tables (0004_wave4.sql): capstone sessions and their checks, the generated ladder's state and sessions.
import type { GradeResult } from "@oak/content-kit";
import { all, type Db, fromJson, get, int, run, toJsonOrNull } from "../index.ts";

// --- capstone sessions ------------------------------------------------------------------------------

export interface CapstoneSessionRow {
  capstoneSessionId: string;
  capstoneId: string;
  sessionId: string | null;
  draftSketchId: string | null;
  draftSketchVersion: number | null;
  draftSavedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}
interface SessionRowDb {
  capstone_session_id: string;
  capstone_id: string;
  session_id: string | null;
  draft_sketch_id: string | null;
  draft_sketch_version: number | null;
  draft_saved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}
const toSession = (r: SessionRowDb): CapstoneSessionRow => ({
  capstoneSessionId: r.capstone_session_id,
  capstoneId: r.capstone_id,
  sessionId: r.session_id,
  draftSketchId: r.draft_sketch_id,
  draftSketchVersion: r.draft_sketch_version,
  draftSavedAt: r.draft_saved_at,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  updatedAt: r.updated_at,
});

export type CheckStage = "bass" | "quality" | "rn";
export interface CapstoneCheckRow {
  capstoneId: string;
  checkId: string;
  stage: CheckStage | null;
  capstoneSessionId: string;
  bestScore: number | null;
  passed: boolean;
  revealed: boolean;
  attempts: number;
  sketchId: string | null;
  sketchVersion: number | null;
  lastResult: GradeResult | null;
  lastAt: string | null;
}
interface CheckRowDb {
  capstone_id: string;
  check_id: string;
  stage: string;
  capstone_session_id: string;
  best_score: number | null;
  passed: number;
  revealed: number;
  attempts: number;
  sketch_id: string | null;
  sketch_version: number | null;
  last_result_json: string | null;
  last_at: string | null;
}
const toCheck = (r: CheckRowDb): CapstoneCheckRow => ({
  capstoneId: r.capstone_id,
  checkId: r.check_id,
  stage: r.stage === "" ? null : (r.stage as CheckStage),
  capstoneSessionId: r.capstone_session_id,
  bestScore: r.best_score,
  passed: r.passed === 1,
  revealed: r.revealed === 1,
  attempts: r.attempts,
  sketchId: r.sketch_id,
  sketchVersion: r.sketch_version,
  lastResult: fromJson<GradeResult | null>(r.last_result_json, null),
  lastAt: r.last_at,
});

export class CapstoneSessionsRepo {
  constructor(private readonly db: Db) {}
  of(capstoneId: string): CapstoneSessionRow[] {
    return all<SessionRowDb>(
      this.db,
      "SELECT * FROM capstone_sessions WHERE capstone_id = ? ORDER BY capstone_session_id",
      capstoneId,
    ).map(toSession);
  }
  get(capstoneSessionId: string): CapstoneSessionRow | null {
    const r = get<SessionRowDb>(
      this.db,
      "SELECT * FROM capstone_sessions WHERE capstone_session_id = ?",
      capstoneSessionId,
    );
    return r === null ? null : toSession(r);
  }
  save(s: CapstoneSessionRow): CapstoneSessionRow {
    run(
      this.db,
      `INSERT INTO capstone_sessions (capstone_session_id, capstone_id, session_id, draft_sketch_id, draft_sketch_version,
         draft_saved_at, started_at, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (capstone_session_id) DO UPDATE SET session_id = excluded.session_id,
         draft_sketch_id = excluded.draft_sketch_id, draft_sketch_version = excluded.draft_sketch_version,
         draft_saved_at = excluded.draft_saved_at, started_at = excluded.started_at,
         completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
      s.capstoneSessionId,
      s.capstoneId,
      s.sessionId,
      s.draftSketchId,
      s.draftSketchVersion,
      s.draftSavedAt,
      s.startedAt,
      s.completedAt,
      s.updatedAt,
    );
    return s;
  }

  checks(capstoneId: string): CapstoneCheckRow[] {
    return all<CheckRowDb>(
      this.db,
      "SELECT * FROM capstone_checks WHERE capstone_id = ? ORDER BY check_id, stage",
      capstoneId,
    ).map(toCheck);
  }
  check(capstoneId: string, checkId: string, stage: CheckStage | null): CapstoneCheckRow | null {
    const r = get<CheckRowDb>(
      this.db,
      "SELECT * FROM capstone_checks WHERE capstone_id = ? AND check_id = ? AND stage = ?",
      capstoneId,
      checkId,
      stage ?? "",
    );
    return r === null ? null : toCheck(r);
  }
  saveCheck(c: CapstoneCheckRow): CapstoneCheckRow {
    run(
      this.db,
      `INSERT INTO capstone_checks (capstone_id, check_id, stage, capstone_session_id, best_score, passed, revealed,
         attempts, sketch_id, sketch_version, last_result_json, last_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (capstone_id, check_id, stage) DO UPDATE SET capstone_session_id = excluded.capstone_session_id,
         best_score = excluded.best_score, passed = excluded.passed, revealed = excluded.revealed,
         attempts = excluded.attempts, sketch_id = excluded.sketch_id, sketch_version = excluded.sketch_version,
         last_result_json = excluded.last_result_json, last_at = excluded.last_at`,
      c.capstoneId,
      c.checkId,
      c.stage ?? "",
      c.capstoneSessionId,
      c.bestScore,
      int(c.passed),
      int(c.revealed),
      c.attempts,
      c.sketchId,
      c.sketchVersion,
      toJsonOrNull(c.lastResult),
      c.lastAt,
    );
    return c;
  }
}

// --- the generated ladder -------------------------------------------------------------------------

export interface LadderStateRow {
  level: 1 | 2 | 3 | 4;
  realism: 0 | 1 | 2 | 3 | 4;
  updatedAt: string | null;
}
export interface LadderSessionRow {
  sessionKey: string;
  level: number;
  startRealism: number;
  bestScore: number;
  passed: boolean;
  gradedPass: boolean;
  day: string;
  gymId: string | null;
  firstAt: string;
  at: string;
}
interface LadderSessionDb {
  session_key: string;
  level: number;
  start_realism: number;
  best_score: number;
  passed: number;
  graded_pass: number;
  day: string;
  gym_id: string | null;
  first_at: string;
  at: string;
}
const toLadderSession = (r: LadderSessionDb): LadderSessionRow => ({
  sessionKey: r.session_key,
  level: r.level,
  startRealism: r.start_realism,
  bestScore: r.best_score,
  passed: r.passed === 1,
  gradedPass: r.graded_pass === 1,
  day: r.day,
  gymId: r.gym_id,
  firstAt: r.first_at,
  at: r.at,
});

export class LadderRepo {
  constructor(private readonly db: Db) {}
  state(): LadderStateRow {
    const r = get<{ level: number; realism: number; updated_at: string }>(
      this.db,
      "SELECT level, realism, updated_at FROM ladder_state WHERE id = 1",
    );
    return r === null
      ? { level: 1, realism: 0, updatedAt: null }
      : {
          level: r.level as LadderStateRow["level"],
          realism: r.realism as LadderStateRow["realism"],
          updatedAt: r.updated_at,
        };
  }
  saveState(level: number, realism: number, at: string): void {
    run(
      this.db,
      `INSERT INTO ladder_state (id, level, realism, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET level = excluded.level, realism = excluded.realism, updated_at = excluded.updated_at`,
      level,
      realism,
      at,
    );
  }
  /** Ladder sessions, oldest first. */
  sessions(): LadderSessionRow[] {
    return all<LadderSessionDb>(this.db, "SELECT * FROM ladder_sessions ORDER BY first_at, session_key").map(
      toLadderSession,
    );
  }
  session(key: string): LadderSessionRow | null {
    const r = get<LadderSessionDb>(this.db, "SELECT * FROM ladder_sessions WHERE session_key = ?", key);
    return r === null ? null : toLadderSession(r);
  }
  saveSession(s: LadderSessionRow): void {
    run(
      this.db,
      `INSERT INTO ladder_sessions (session_key, level, start_realism, best_score, passed, graded_pass, day, gym_id, first_at, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_key) DO UPDATE SET level = excluded.level, best_score = excluded.best_score,
         passed = excluded.passed, graded_pass = excluded.graded_pass, gym_id = excluded.gym_id, at = excluded.at`,
      s.sessionKey,
      s.level,
      s.startRealism,
      s.bestScore,
      int(s.passed),
      int(s.gradedPass),
      s.day,
      s.gymId,
      s.firstAt,
      s.at,
    );
  }
}
