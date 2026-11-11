-- Wave 2 (docs/design/wave2.md §4): onboarding resume state and /dev/listen verdicts.

-- One row: where the learner is in onboarding (U00.L01, ux §8). `profile.onboarded_at` marks the end.
CREATE TABLE onboarding_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  step TEXT NOT NULL,
  completed_json TEXT NOT NULL DEFAULT '[]',
  skipped_json TEXT NOT NULL DEFAULT '[]',
  first_edit INTEGER CHECK (first_edit IS NULL OR (first_edit BETWEEN 0 AND 7)),
  sketch_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

-- /dev/listen verdicts (architecture §3.8), one per example reference; a newer verdict replaces the older.
CREATE TABLE listen_marks (
  ref TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'wrong-sound', 'wrong-notation', 'weak', 'wrong-theory')),
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
) STRICT;

-- exercise_results is keyed by the global exercise ID: local slugs repeat across lessons, and two lessons
-- with an exercise `predict` would otherwise share (and overwrite) one row.
UPDATE exercise_results SET exercise_id = lesson_id || '/' || exercise_id WHERE instr(exercise_id, '/') = 0;
