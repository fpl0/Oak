-- Wave 3 (docs/design/wave3.md §5): idempotent writes, the voice state (Quiet mode for a day, the tolerance
-- ladder's last change) and the graded sung notes the ladder reads.

-- §5.2: the first response of `steps.attempt` and `srs.review` under the client's key. A repeat with the same
-- body gets this response back and counts nothing again; the same key with another body is a 409. Rows are kept
-- at least 24 hours (pruned after 48).
CREATE TABLE idempotency_keys (
  endpoint TEXT NOT NULL,
  key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (endpoint, key)
) STRICT;
CREATE INDEX idempotency_keys_at ON idempotency_keys (at);

-- §5.3, contracts §8.2 and §8.5. One row. `quiet_day`/`quiet_today`: the learner's choice for one learner day
-- (the mic chip, Settings → Voice), lapsing at the next day; Quiet mode "always" is `learner_profile.quiet`.
-- `last_change_json`: the ladder's last change `{ from, to, at, reason }`; `announced_at`: when the Coda said it.
CREATE TABLE voice_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  quiet_day TEXT,
  quiet_today INTEGER NOT NULL DEFAULT 0,
  last_change_json TEXT,
  announced_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

-- Contracts §8.2: every graded sung note the tolerance ladder reads, one row per voiced note (never audio).
-- `source_kind`: a sung lesson step (`step`, source = the attempt), a sung drill trial (`trial`, source =
-- `<drillSessionId>#<idx>`) or the sung resolution of a functional-ear trial (`resolution`, same source).
-- Quiet-mode, skipped and calibration notes are never written. A re-posted trial replaces its rows.
CREATE TABLE sung_notes (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('step', 'trial', 'resolution')),
  source_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  day TEXT NOT NULL,
  abs_cents REAL NOT NULL,
  credit REAL NOT NULL,
  tol_cents INTEGER,
  at TEXT NOT NULL,
  PRIMARY KEY (source_kind, source_id, idx)
) STRICT;
CREATE INDEX sung_notes_day ON sung_notes (day);
