// Wave 7 tables (0008_wave7.sql): the learner's focus between the core and the tracks, the end of the whole course,
// the versions of a two-version capstone (AC1).
import { all, type Db, get, run } from "../index.ts";

export type FocusId = "core" | "J" | "R" | "A";

export class TrackFocusRepo {
  constructor(private readonly db: Db) {}
  /** The learner's choice, or `null` while they never chose (the default `core`). */
  get(): { focus: FocusId; chosenAt: string } | null {
    const r = get<{ focus: FocusId; chosen_at: string }>(
      this.db,
      "SELECT focus, chosen_at FROM track_focus WHERE id = 1",
    );
    return r === null ? null : { focus: r.focus, chosenAt: r.chosen_at };
  }
  set(focus: FocusId, at: string): void {
    run(
      this.db,
      `INSERT INTO track_focus (id, focus, chosen_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET focus = excluded.focus, chosen_at = excluded.chosen_at`,
      focus,
      at,
    );
  }
}

export interface CourseStateRow {
  completedAt: string;
  sessionId: string | null;
  announcedSession: string | null;
}

/** The end of the whole course (session 259): recorded once, announced once. */
export class CourseStateRepo {
  constructor(private readonly db: Db) {}
  get(): CourseStateRow | null {
    const r = get<{ completed_at: string; session_id: string | null; announced_session: string | null }>(
      this.db,
      "SELECT completed_at, session_id, announced_session FROM course_state WHERE id = 1",
    );
    return r === null
      ? null
      : { completedAt: r.completed_at, sessionId: r.session_id, announcedSession: r.announced_session };
  }
  record(completedAt: string, sessionId: string | null): boolean {
    return (
      run(
        this.db,
        "INSERT OR IGNORE INTO course_state (id, completed_at, session_id) VALUES (1, ?, ?)",
        completedAt,
        sessionId,
      ).changes > 0
    );
  }
  announce(sessionId: string): void {
    run(
      this.db,
      "UPDATE course_state SET announced_session = ? WHERE id = 1 AND announced_session IS NULL",
      sessionId,
    );
  }
}

export interface CapstoneVersionRow {
  capstoneId: string;
  versionId: "a" | "b";
  sketchId: string;
  sketchVersion: number;
  savedAt: string;
}

/** The latest draft of each version of a two-version capstone. */
export class CapstoneVersionsRepo {
  constructor(private readonly db: Db) {}
  of(capstoneId: string): CapstoneVersionRow[] {
    return all<{
      capstone_id: string;
      version_id: "a" | "b";
      sketch_id: string;
      sketch_version: number;
      saved_at: string;
    }>(this.db, "SELECT * FROM capstone_versions WHERE capstone_id = ? ORDER BY version_id", capstoneId).map(
      (r) => ({
        capstoneId: r.capstone_id,
        versionId: r.version_id,
        sketchId: r.sketch_id,
        sketchVersion: r.sketch_version,
        savedAt: r.saved_at,
      }),
    );
  }
  save(row: CapstoneVersionRow): void {
    run(
      this.db,
      `INSERT INTO capstone_versions (capstone_id, version_id, sketch_id, sketch_version, saved_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (capstone_id, version_id) DO UPDATE SET sketch_id = excluded.sketch_id,
         sketch_version = excluded.sketch_version, saved_at = excluded.saved_at`,
      row.capstoneId,
      row.versionId,
      row.sketchId,
      row.sketchVersion,
      row.savedAt,
    );
  }
}
