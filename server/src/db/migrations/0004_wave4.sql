-- Wave 4 (docs/design/wave4.md §5): multi-session capstones and their checks, album versions that know whether
-- the review's liner note shows, transcription settings / graded passes / gym linkage, the generated ladder.

-- One row per capstone session the learner touched (C2.S1, X1.S2): where it was worked and its latest draft.
-- "Done" stays `capstone_state.sessions_json` (Wave 2); this table adds the draft and the times.
CREATE TABLE capstone_sessions (
  capstone_session_id TEXT PRIMARY KEY,
  capstone_id TEXT NOT NULL,
  session_id TEXT,
  draft_sketch_id TEXT,
  draft_sketch_version INTEGER,
  draft_saved_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX capstone_sessions_capstone ON capstone_sessions (capstone_id);

-- One row per graded check of a transcribe capstone (an X1 phrase), and per stage of a staged one ('' when the
-- check has no stages). Graded in the browser; the server keeps the best score, the pass and the reveal.
CREATE TABLE capstone_checks (
  capstone_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '' CHECK (stage IN ('', 'bass', 'quality', 'rn')),
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

ALTER TABLE album_track_versions ADD COLUMN include_review_note INTEGER;
ALTER TABLE album_track_versions ADD COLUMN review_conversation_id TEXT;

ALTER TABLE transcriptions ADD COLUMN settings_json TEXT;
ALTER TABLE transcriptions ADD COLUMN graded_pass INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transcriptions ADD COLUMN gym_id TEXT;
-- A generated ladder item: its seed and what the grader needs besides the hidden code (given, stages, swing, the
-- stimulus events so a restart needs no grader to play it).
ALTER TABLE transcriptions ADD COLUMN ladder_seed INTEGER;
ALTER TABLE transcriptions ADD COLUMN ladder_json TEXT;

ALTER TABLE transcription_versions ADD COLUMN machine_draft INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transcription_versions ADD COLUMN stage TEXT;

-- The learner's place on the generated ladder (one row).
CREATE TABLE ladder_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  realism INTEGER NOT NULL CHECK (realism BETWEEN 0 AND 4),
  updated_at TEXT NOT NULL
) STRICT;

-- One row per ladder session (an Oak session, else a learner day): its best graded score feeds the realism rule
-- (contracts §6.12). `start_realism` is the realism the session began at; a change is decided by the session's
-- best score, so a later better item in the same session can undo a drop the first item caused.
CREATE TABLE ladder_sessions (
  session_key TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  start_realism INTEGER NOT NULL,
  best_score REAL NOT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  graded_pass INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  gym_id TEXT,
  first_at TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX ladder_sessions_at ON ladder_sessions (first_at);
