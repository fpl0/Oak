// sessions, gym_sessions.
import type { GymSession, Session } from "@oak/api";
import { all, type Db, fromJson, get, run, toJsonOrNull } from "../index.ts";

interface SessionRow {
  id: string;
  day: string;
  kind: string;
  target_minutes: number;
  content_version: string | null;
  map_item_id: string | null;
  phase: string;
  started_at: string;
  ended_at: string | null;
  active_minutes: number;
  plan_json: string | null;
  summary_json: string | null;
  tab_id: string | null;
}

function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    day: r.day,
    kind: r.kind as Session["kind"],
    targetMinutes: r.target_minutes as Session["targetMinutes"],
    mapItemId: r.map_item_id as Session["mapItemId"],
    contentVersion: r.content_version,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    activeMinutes: r.active_minutes,
    phase: r.phase as Session["phase"],
    tabId: r.tab_id ?? null,
  };
}

export class SessionsRepo {
  constructor(private readonly db: Db) {}

  create(s: Session, plan: unknown = null): Session {
    run(
      this.db,
      `INSERT INTO sessions (id, day, kind, target_minutes, content_version, map_item_id, phase, started_at, ended_at, active_minutes, plan_json, tab_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.id,
      s.day,
      s.kind,
      s.targetMinutes,
      s.contentVersion,
      s.mapItemId,
      s.phase,
      s.startedAt,
      s.endedAt,
      s.activeMinutes,
      toJsonOrNull(plan),
      s.tabId ?? null,
    );
    return s;
  }
  get(id: string): Session | null {
    const row = get<SessionRow>(this.db, "SELECT * FROM sessions WHERE id = ?", id);
    return row === null ? null : toSession(row);
  }
  heartbeat(id: string, phase: Session["phase"], activeMinutes: number): void {
    run(
      this.db,
      "UPDATE sessions SET phase = ?, active_minutes = MAX(active_minutes, ?) WHERE id = ? AND ended_at IS NULL",
      phase,
      activeMinutes,
      id,
    );
  }
  end(id: string, endedAt: string, activeMinutes: number, summary: unknown): void {
    run(
      this.db,
      "UPDATE sessions SET ended_at = ?, phase = 'done', active_minutes = MAX(active_minutes, ?), summary_json = ? WHERE id = ?",
      endedAt,
      activeMinutes,
      toJsonOrNull(summary),
      id,
    );
  }
  summary(id: string): unknown {
    return fromJson(
      get<{ summary_json: string | null }>(this.db, "SELECT summary_json FROM sessions WHERE id = ?", id)
        ?.summary_json,
      null,
    );
  }
  /** The most recent session of `day` that has not ended. */
  openOn(day: string): Session | null {
    const row = get<SessionRow>(
      this.db,
      "SELECT * FROM sessions WHERE day = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      day,
    );
    return row === null ? null : toSession(row);
  }
  /** Wave 6 (d21): every session of `day` that has not ended, oldest first (one per tab). */
  openAllOn(day: string): Session[] {
    return all<SessionRow>(
      this.db,
      "SELECT * FROM sessions WHERE day = ? AND ended_at IS NULL ORDER BY started_at",
      day,
    ).map(toSession);
  }
  /** Sessions that ended, in order (the end of the core counts them; a Coda summary is read per session). */
  endedCount(): number {
    return (
      get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM sessions WHERE ended_at IS NOT NULL")?.n ?? 0
    );
  }
  onDay(day: string): Session[] {
    return all<SessionRow>(this.db, "SELECT * FROM sessions WHERE day = ? ORDER BY started_at", day).map(
      toSession,
    );
  }
  since(day: string): Session[] {
    return all<SessionRow>(this.db, "SELECT * FROM sessions WHERE day >= ? ORDER BY started_at", day).map(
      toSession,
    );
  }
  first(): Session | null {
    const row = get<SessionRow>(this.db, "SELECT * FROM sessions ORDER BY started_at LIMIT 1");
    return row === null ? null : toSession(row);
  }
}

interface GymRow {
  gym_id: string;
  session_id: string | null;
  kind: string;
  ladder_level: number | null;
  realism: number | null;
  transcription_id: string | null;
  at: string;
  source: string | null;
}
const toGym = (r: GymRow): GymSession => ({
  gymId: r.gym_id,
  sessionId: r.session_id,
  kind: r.kind as GymSession["kind"],
  ladderLevel: r.ladder_level,
  realism: r.realism,
  transcriptionId: r.transcription_id,
  at: r.at,
  ...(r.source === null ? {} : { source: r.source }),
});

export class GymRepo {
  constructor(private readonly db: Db) {}
  list(): GymSession[] {
    return all<GymRow>(this.db, "SELECT * FROM gym_sessions ORDER BY gym_id").map(toGym);
  }
  insert(g: GymSession): GymSession {
    run(
      this.db,
      "INSERT INTO gym_sessions (gym_id, session_id, kind, ladder_level, realism, transcription_id, at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      g.gymId,
      g.sessionId,
      g.kind,
      g.ladderLevel,
      g.realism,
      g.transcriptionId,
      g.at,
      g.source ?? null,
    );
    return g;
  }
  setTranscription(gymId: string, transcriptionId: string): void {
    run(this.db, "UPDATE gym_sessions SET transcription_id = ? WHERE gym_id = ?", transcriptionId, gymId);
  }
}
