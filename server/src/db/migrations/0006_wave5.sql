-- Wave 5 (docs/design/wave5.md §5): ladder levels 5 and 6, code that arrived through an import marked for review
-- (carry-over c2), the transcription version a tutor review was asked about (c11), and the L5 phrase a ladder
-- version answers.

-- The ladder now has the song levels L5 (PD folk, per phrase) and L6 (blues, staged): the level check widens.
CREATE TABLE ladder_state_w5 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  realism INTEGER NOT NULL CHECK (realism BETWEEN 0 AND 4),
  updated_at TEXT NOT NULL
) STRICT;
INSERT INTO ladder_state_w5 (id, level, realism, updated_at) SELECT id, level, realism, updated_at FROM ladder_state;
DROP TABLE ladder_state;
ALTER TABLE ladder_state_w5 RENAME TO ladder_state;

-- c2 (contracts §11.3): a transcription version that arrived through a backup import is shown and linted with the
-- strict profile until the learner confirms it (`transcriptions.confirmVersion`); a lesson attempt that arrived
-- the same way never supplies the voicing gate's `passedCode` as if the learner had typed it.
ALTER TABLE transcription_versions ADD COLUMN review_before_run INTEGER NOT NULL DEFAULT 0;
ALTER TABLE step_attempts ADD COLUMN imported INTEGER NOT NULL DEFAULT 0;

-- L5: the 1-based phrase of the song a ladder version answers (NULL for every other version).
ALTER TABLE transcription_versions ADD COLUMN phrase INTEGER;

-- c11: the transcription version each review conversation was asked about (`ReviewRecord.version`), recorded when
-- the review is accepted. Several reviews of one conversation are told apart by time.
CREATE TABLE transcription_review_versions (
  conversation_id TEXT NOT NULL,
  transcription_id TEXT NOT NULL,
  version INTEGER,
  at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, at)
) STRICT;
CREATE INDEX transcription_review_versions_tr ON transcription_review_versions (transcription_id);
