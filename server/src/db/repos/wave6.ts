// Wave 6 tables (0007_wave6.sql): the recorded advanced-track gates, the end of the core, album takes.
import { all, type Db, get, run } from "../index.ts";

// --- track gates ------------------------------------------------------------------------------------

export interface TrackGateRow {
  gateId: string;
  openedAt: string;
  /** The checkpoint or lesson whose pass or completion met it (`null`: found met at start-up). */
  sourceId: string | null;
  /** The Oak session whose Coda announced it, once one did. */
  announcedSession: string | null;
}
interface GateRowDb {
  gate_id: string;
  opened_at: string;
  source_id: string | null;
  announced_session: string | null;
}
const toGate = (r: GateRowDb): TrackGateRow => ({
  gateId: r.gate_id,
  openedAt: r.opened_at,
  sourceId: r.source_id,
  announcedSession: r.announced_session,
});

export class TrackGatesRepo {
  constructor(private readonly db: Db) {}
  all(): TrackGateRow[] {
    return all<GateRowDb>(this.db, "SELECT * FROM track_gates ORDER BY opened_at, gate_id").map(toGate);
  }
  get(gateId: string): TrackGateRow | null {
    const r = get<GateRowDb>(this.db, "SELECT * FROM track_gates WHERE gate_id = ?", gateId);
    return r === null ? null : toGate(r);
  }
  /** Records a gate once; a second call changes nothing. Returns whether the row is new. */
  record(gateId: string, openedAt: string, sourceId: string | null): boolean {
    return (
      run(
        this.db,
        "INSERT OR IGNORE INTO track_gates (gate_id, opened_at, source_id) VALUES (?, ?, ?)",
        gateId,
        openedAt,
        sourceId,
      ).changes > 0
    );
  }
  /** Gates not announced in any Coda yet that were recorded at or after `since`. */
  unannouncedSince(since: string): TrackGateRow[] {
    return all<GateRowDb>(
      this.db,
      "SELECT * FROM track_gates WHERE announced_session IS NULL AND source_id IS NOT NULL AND opened_at >= ? ORDER BY opened_at, gate_id",
      since,
    ).map(toGate);
  }
  announce(gateId: string, sessionId: string): void {
    run(
      this.db,
      "UPDATE track_gates SET announced_session = ? WHERE gate_id = ? AND announced_session IS NULL",
      sessionId,
      gateId,
    );
  }
}

// --- the end of the core ----------------------------------------------------------------------------

export interface CoreStateRow {
  completedAt: string;
  /** The Oak session the last piece landed in (`null`: found complete at start-up, or outside a session). */
  sessionId: string | null;
  /** The session whose summary carried `coreComplete`; the moment is shown once. */
  announcedSession: string | null;
}

export class CoreStateRepo {
  constructor(private readonly db: Db) {}
  get(): CoreStateRow | null {
    const r = get<{ completed_at: string; session_id: string | null; announced_session: string | null }>(
      this.db,
      "SELECT completed_at, session_id, announced_session FROM core_state WHERE id = 1",
    );
    return r === null
      ? null
      : { completedAt: r.completed_at, sessionId: r.session_id, announcedSession: r.announced_session };
  }
  /** Records the completion once. Returns whether the row is new. */
  record(completedAt: string, sessionId: string | null): boolean {
    return (
      run(
        this.db,
        "INSERT OR IGNORE INTO core_state (id, completed_at, session_id) VALUES (1, ?, ?)",
        completedAt,
        sessionId,
      ).changes > 0
    );
  }
  announce(sessionId: string): void {
    run(
      this.db,
      "UPDATE core_state SET announced_session = ? WHERE id = 1 AND announced_session IS NULL",
      sessionId,
    );
  }
}

// --- album takes (d20) ------------------------------------------------------------------------------

export interface TakeRow {
  trackId: string;
  version: number;
  take: number;
  audioPath: string;
  audioMime: string;
  durationS: number | null;
  bytes: number;
  recordedAt: string;
}
interface TakeRowDb {
  track_id: string;
  version: number;
  take: number;
  audio_path: string;
  audio_mime: string;
  duration_s: number | null;
  bytes: number;
  recorded_at: string;
}
const toTake = (r: TakeRowDb): TakeRow => ({
  trackId: r.track_id,
  version: r.version,
  take: r.take,
  audioPath: r.audio_path,
  audioMime: r.audio_mime,
  durationS: r.duration_s,
  bytes: r.bytes,
  recordedAt: r.recorded_at,
});

export class TakesRepo {
  constructor(private readonly db: Db) {}
  of(trackId: string, version: number): TakeRow[] {
    return all<TakeRowDb>(
      this.db,
      "SELECT * FROM album_takes WHERE track_id = ? AND version = ? ORDER BY take",
      trackId,
      version,
    ).map(toTake);
  }
  ofTrack(trackId: string): TakeRow[] {
    return all<TakeRowDb>(
      this.db,
      "SELECT * FROM album_takes WHERE track_id = ? ORDER BY version, take",
      trackId,
    ).map(toTake);
  }
  everyPath(): { trackId: string; version: number; take: number; audioPath: string }[] {
    return all<TakeRowDb>(this.db, "SELECT * FROM album_takes ORDER BY track_id, version, take").map((r) => ({
      trackId: r.track_id,
      version: r.version,
      take: r.take,
      audioPath: r.audio_path,
    }));
  }
  get(trackId: string, version: number, take: number): TakeRow | null {
    const r = get<TakeRowDb>(
      this.db,
      "SELECT * FROM album_takes WHERE track_id = ? AND version = ? AND take = ?",
      trackId,
      version,
      take,
    );
    return r === null ? null : toTake(r);
  }
  insert(t: TakeRow): void {
    run(
      this.db,
      `INSERT INTO album_takes (track_id, version, take, audio_path, audio_mime, duration_s, bytes, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      t.trackId,
      t.version,
      t.take,
      t.audioPath,
      t.audioMime,
      t.durationS,
      t.bytes,
      t.recordedAt,
    );
  }
  currentTake(trackId: string, version: number): number | null {
    return (
      get<{ current_take: number | null }>(
        this.db,
        "SELECT current_take FROM album_track_versions WHERE track_id = ? AND version = ?",
        trackId,
        version,
      )?.current_take ?? null
    );
  }
  /** Makes a take the one the version plays: the version's audio columns describe it from now on. */
  setCurrent(t: TakeRow): void {
    run(
      this.db,
      "UPDATE album_track_versions SET current_take = ?, audio_path = ?, audio_mime = ?, duration_s = ? WHERE track_id = ? AND version = ?",
      t.take,
      t.audioPath,
      t.audioMime,
      t.durationS,
      t.trackId,
      t.version,
    );
  }
}
