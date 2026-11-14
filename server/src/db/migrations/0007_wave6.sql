-- Wave 6 (docs/design/wave6.md §5): ladder levels 7 and 8, a session per tab (d21), the recorded advanced-track
-- gates (contracts §4.3), the end of the core, and album takes (d20: re-recording keeps every recording).

-- The ladder reaches L8 (a full arrangement of a standard); L7 is own audio and is never stored as the level.
CREATE TABLE ladder_state_w6 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 8),
  realism INTEGER NOT NULL CHECK (realism BETWEEN 0 AND 4),
  updated_at TEXT NOT NULL
) STRICT;
INSERT INTO ladder_state_w6 (id, level, realism, updated_at) SELECT id, level, realism, updated_at FROM ladder_state;
DROP TABLE ladder_state;
ALTER TABLE ladder_state_w6 RENAME TO ladder_state;

-- d21: the browser tab a session was started from (`SessionStart.tabId`); NULL for an older client or a request
-- made by hand, which together are one anonymous tab.
ALTER TABLE sessions ADD COLUMN tab_id TEXT;

-- One row per advanced-track lesson gate (`TRACK_GATES` of @oak/api) from the moment it is met. `announced_session`
-- is the Oak session whose Coda carried it (`SessionSummary.gatesOpened`); a gate is announced once.
CREATE TABLE track_gates (
  gate_id TEXT PRIMARY KEY,
  opened_at TEXT NOT NULL,
  source_id TEXT,
  announced_session TEXT
) STRICT;

-- The end of the core (one row): when the last piece landed, and the session whose Coda carried the moment.
CREATE TABLE core_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL,
  session_id TEXT,
  announced_session TEXT
) STRICT;

-- d20: every recording of an album track version is kept. `album_track_versions.audio_path / audio_mime /
-- duration_s` go on describing the take that plays by default (`current_take`).
CREATE TABLE album_takes (
  track_id TEXT NOT NULL REFERENCES album_tracks (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  take INTEGER NOT NULL CHECK (take >= 1),
  audio_path TEXT NOT NULL,
  audio_mime TEXT NOT NULL,
  duration_s REAL,
  bytes INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (track_id, version, take)
) STRICT;
ALTER TABLE album_track_versions ADD COLUMN current_take INTEGER;
INSERT INTO album_takes (track_id, version, take, audio_path, audio_mime, duration_s, bytes, recorded_at)
  SELECT track_id, version, 1, audio_path, COALESCE(audio_mime, 'audio/wav'), duration_s, 0, created_at
  FROM album_track_versions WHERE audio_path IS NOT NULL;
UPDATE album_track_versions SET current_take = 1 WHERE audio_path IS NOT NULL;

-- The form map of a transcribe capstone (CF-T.S1) and of a ladder L8 item is one more check stage name.
CREATE TABLE capstone_checks_w6 (
  capstone_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '' CHECK (stage IN ('', 'bass', 'quality', 'rn', 'form', 'changes', 'melody')),
  capstone_session_id TEXT NOT NULL,
  best_score REAL,
  passed INTEGER NOT NULL DEFAULT 0,
  revealed INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  sketch_id TEXT,
  sketch_version INTEGER,
  last_result_json TEXT,
  last_at TEXT,
  PRIMARY KEY (capstone_id, check_id, stage)
) STRICT;
INSERT INTO capstone_checks_w6 SELECT * FROM capstone_checks;
DROP TABLE capstone_checks;
ALTER TABLE capstone_checks_w6 RENAME TO capstone_checks;

-- d17 (contracts 1.6): "Chord Names" (U05.L09) was split out of U05.L04. A learner who completed U05.L04 before
-- this schema existed has had that lesson's material: it is recorded as completed for them here, once, at the
-- upgrade (no evidence, no new cards, no ceremony; the unlock backfill grants its rows silently at start-up), so the
-- planner never sends them back. A learner who completes U05.L04 from now on takes U05.L09 as the next lesson.
INSERT INTO lesson_progress (lesson_id, status, current_step, split_part, started_at, completed_at, best_score,
    completed_version, content_hash, updated_at)
  SELECT 'U05.L09', 'completed', NULL, NULL, started_at, completed_at, NULL, 1, content_hash, updated_at
  FROM lesson_progress
  WHERE lesson_id = 'U05.L04' AND status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM lesson_progress WHERE lesson_id = 'U05.L09');
