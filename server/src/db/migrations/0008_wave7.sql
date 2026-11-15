-- Wave 7 (docs/design/wave7.md §5): the learner's choice between the core and the advanced tracks, the end of the
-- whole course (session 259), and the two versions of a two-version capstone (AC1 "One Tune, Two Genres").

-- One row once the learner chose (`tracks.setFocus`); no row means the default, the core.
CREATE TABLE track_focus (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  focus TEXT NOT NULL CHECK (focus IN ('core', 'J', 'R', 'A')),
  chosen_at TEXT NOT NULL
) STRICT;

-- The end of the whole course (one row): when the last piece landed, the session it landed in, and the session
-- whose Coda carried the moment (`SessionSummary.courseComplete`, shown once; '-' when found complete at start-up).
CREATE TABLE course_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL,
  session_id TEXT,
  announced_session TEXT
) STRICT;

-- The latest draft of each version of a two-version capstone (content-kit `CapstoneDef.versions`).
CREATE TABLE capstone_versions (
  capstone_id TEXT NOT NULL,
  version_id TEXT NOT NULL CHECK (version_id IN ('a', 'b')),
  sketch_id TEXT NOT NULL,
  sketch_version INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (capstone_id, version_id)
) STRICT;
