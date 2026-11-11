-- Oak schema v1: architecture §4.2 with every amendment of contracts §11.11 and the four tables
-- added by docs/design/interfaces.md §7 (step_state, repair_queue, capstone_state, tutor_backend_records).
-- Timestamps are ISO-8601 UTC TEXT. `day` columns hold the learner-local date after the 04:00 rollover.
-- `*_json` columns hold JSON text. Booleans are INTEGER 0/1.

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE learner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT,
  timezone TEXT NOT NULL,
  rollover_hour INTEGER NOT NULL DEFAULT 4 CHECK (rollover_hour BETWEEN 0 AND 23),
  daily_minutes INTEGER NOT NULL DEFAULT 20 CHECK (daily_minutes IN (15, 20, 25)),
  weekly_goal INTEGER NOT NULL DEFAULT 5 CHECK (weekly_goal BETWEEN 3 AND 7),
  flavour TEXT NOT NULL,
  vocal_low_midi REAL,
  vocal_high_midi REAL,
  comfort_low_midi REAL,
  comfort_high_midi REAL,
  sing_tolerance_cents INTEGER NOT NULL DEFAULT 70 CHECK (sing_tolerance_cents IN (70, 50, 35, 25)),
  sing_tol_mode TEXT NOT NULL DEFAULT 'auto' CHECK (sing_tol_mode IN ('auto', 'fixed')),
  output_latency_ms REAL,
  input_latency_ms REAL,
  sing_latency_ms REAL,
  tap_latency_ms REAL,
  tap_jitter_ms REAL,
  visual_offset_ms REAL NOT NULL DEFAULT 0,
  output_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (output_kind IN ('wired', 'bluetooth', 'speakers', 'unknown')),
  input_kind TEXT NOT NULL DEFAULT 'none' CHECK (input_kind IN ('builtin', 'external', 'bluetooth', 'none')),
  input_device_id TEXT,
  noise_floor_db REAL,
  quiet INTEGER NOT NULL DEFAULT 0,
  solfege TEXT NOT NULL DEFAULT 'numbers' CHECK (solfege IN ('numbers', 'syllables')),
  onboarded_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE calibration_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  result_json TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'checkpoint', 'capstone', 'gym', 'keepalive', 'light', 'studio', 'review')),
  target_minutes INTEGER NOT NULL CHECK (target_minutes IN (15, 20, 25)),
  content_version TEXT,
  map_item_id TEXT,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle', 'warmup', 'main', 'make', 'coda', 'done')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  active_minutes REAL NOT NULL DEFAULT 0,
  plan_json TEXT,
  summary_json TEXT
) STRICT;
CREATE INDEX sessions_day ON sessions (day);

CREATE TABLE lesson_progress (
  lesson_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  current_step TEXT,
  split_part TEXT CHECK (split_part IN ('A', 'B')),
  started_at TEXT,
  completed_at TEXT,
  best_score REAL,
  completed_version INTEGER,
  content_hash TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE step_state (
  lesson_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  series_no INTEGER NOT NULL DEFAULT 0,
  rung INTEGER NOT NULL DEFAULT 0 CHECK (rung BETWEEN 0 AND 4),
  tutor_hints INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (lesson_id, step_id)
) STRICT;

CREATE TABLE step_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  lesson_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  exercise_version INTEGER NOT NULL,
  series_no INTEGER NOT NULL DEFAULT 0,
  attempt_no INTEGER NOT NULL,
  params_json TEXT,
  code TEXT,
  response_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  passed INTEGER NOT NULL,
  score REAL NOT NULL,
  adjusted REAL NOT NULL,
  feedback_codes TEXT NOT NULL DEFAULT '[]',
  hint_rung INTEGER NOT NULL DEFAULT 0 CHECK (hint_rung BETWEEN 0 AND 4),
  assisted INTEGER NOT NULL DEFAULT 0,
  modality TEXT NOT NULL DEFAULT 'normal' CHECK (modality IN ('normal', 'fallback')),
  disputed INTEGER NOT NULL DEFAULT 0,
  tutor_assisted INTEGER NOT NULL DEFAULT 0,
  tutor_conversation_id TEXT,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX step_attempts_step ON step_attempts (lesson_id, step_id, series_no);
CREATE INDEX step_attempts_exercise ON step_attempts (exercise_id, exercise_version);

CREATE TABLE exercise_results (
  exercise_id TEXT NOT NULL,
  exercise_version INTEGER NOT NULL,
  lesson_id TEXT NOT NULL,
  first_pass_at TEXT,
  attempts_to_pass INTEGER,
  best_score REAL,
  last_score REAL,
  assisted INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  PRIMARY KEY (exercise_id, exercise_version)
) STRICT;

CREATE TABLE checkpoint_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cp_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  score REAL,
  passed INTEGER NOT NULL DEFAULT 0,
  soft_pass INTEGER NOT NULL DEFAULT 0,
  per_skill_json TEXT,
  items_json TEXT NOT NULL,
  detail_json TEXT,
  UNIQUE (cp_id, attempt_no)
) STRICT;

CREATE TABLE repair_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cp_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  family_id TEXT,
  sets_remaining INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE capstone_state (
  capstone_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'released')),
  sessions_json TEXT NOT NULL DEFAULT '[]',
  sketch_id TEXT,
  track_id TEXT,
  flavour TEXT,
  last_result_json TEXT,
  started_at TEXT,
  released_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL,
  category TEXT,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  weight REAL NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL
) STRICT;
CREATE INDEX evidence_skill ON evidence (skill_id, at);

CREATE TABLE skill_state (
  skill_id TEXT PRIMARY KEY,
  P REAL NOT NULL,
  R REAL,
  D INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL CHECK (level IN ('new', 'available', 'learning', 'practiced', 'mastered')),
  debt INTEGER NOT NULL DEFAULT 0,
  debt_reason TEXT CHECK (debt_reason IN ('soft-pass', 'production-lag', 'checkpoint-level')),
  provisional INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE srs_cards (
  card_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'concept', 'family', 'composite')),
  status TEXT NOT NULL CHECK (status IN ('active', 'deferred', 'graduated', 'paused', 'retired')),
  payload_json TEXT,
  fsrs_json TEXT NOT NULL,
  model TEXT NOT NULL,
  desired_retention REAL NOT NULL,
  due_at TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  introduced_by TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX srs_cards_due ON srs_cards (status, due_at);

CREATE TABLE srs_revlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES srs_cards (card_id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  revlog_json TEXT NOT NULL,
  drill_session_id TEXT,
  mean_credit REAL,
  trials_total INTEGER,
  median_rt_ms REAL
) STRICT;
CREATE INDEX srs_revlog_card ON srs_revlog (card_id, reviewed_at);

CREATE TABLE family_state (
  family_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  promo_day TEXT,
  category_stats_json TEXT NOT NULL DEFAULT '{}',
  confusion_json TEXT NOT NULL DEFAULT '{}',
  blocked_remaining INTEGER NOT NULL DEFAULT 0,
  composite_id TEXT,
  graduated_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE drill_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('srs', 'practice', 'lesson', 'checkpoint', 'gym', 'anchor', 'repair', 'keepalive')),
  family_ids TEXT NOT NULL,
  set_id TEXT NOT NULL,
  warmup_item_id TEXT,
  plan_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trials_total INTEGER NOT NULL DEFAULT 0,
  mean_credit REAL
) STRICT;

CREATE TABLE drill_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_session_id TEXT NOT NULL REFERENCES drill_sessions (id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  family_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  level INTEGER NOT NULL,
  category TEXT NOT NULL,
  trial_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  credit REAL NOT NULL,
  correct INTEGER NOT NULL,
  cents_error REAL,
  rt_ms REAL NOT NULL,
  replays INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,
  UNIQUE (drill_session_id, idx)
) STRICT;

CREATE TABLE streak_days (
  day TEXT PRIMARY KEY,
  qualified INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('review', 'sketch', 'keepalive', 'session', 'repair', 'rest', 'banked-rest', 'paused')),
  kinds_json TEXT NOT NULL DEFAULT '[]',
  minutes REAL NOT NULL DEFAULT 0,
  review_sets INTEGER NOT NULL DEFAULT 0,
  sketch_saved INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE streak_weeks (
  week_start TEXT PRIMARY KEY,
  goal INTEGER NOT NULL,
  qualifying_days INTEGER NOT NULL DEFAULT 0,
  banked_used INTEGER NOT NULL DEFAULT 0,
  repaired_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('open', 'met', 'met-banked', 'met-repaired', 'tie-open', 'missed', 'paused'))
) STRICT;

CREATE TABLE rests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  earned_week TEXT NOT NULL,
  spent_week TEXT
) STRICT;
-- At most 2 unspent rests (contracts §7.8).
CREATE TRIGGER rests_bank_max BEFORE INSERT ON rests
WHEN NEW.spent_week IS NULL AND (SELECT COUNT(*) FROM rests WHERE spent_week IS NULL) >= 2
BEGIN SELECT RAISE(ABORT, 'rests: the bank holds at most 2'); END;

CREATE TABLE unlocks (
  item_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('tool', 'sound', 'scale', 'chord', 'feature', 'template', 'lens')),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
) STRICT;
-- Unlocks are never revoked (contracts §11.7 rule 5). Dropped and recreated only by a backup import or a data reset.
CREATE TRIGGER unlocks_no_delete BEFORE DELETE ON unlocks
BEGIN SELECT RAISE(ABORT, 'unlocks are never deleted'); END;

CREATE TABLE cando_ledger (
  cando_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('emerging', 'solid', 'strong', 'fading')),
  evidence_kind TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (cando_id, at)
) STRICT;

CREATE TABLE terms_introduced (
  term_id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;

CREATE TABLE sketches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('lesson-make', 'free', 'capstone', 'transcription', 'tutor', 'keepalive', 'checkpoint')),
  origin_id TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  tags_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  listening_comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sketch_versions (
  sketch_id TEXT NOT NULL REFERENCES sketches (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  code TEXT NOT NULL,
  bpm REAL,
  meter TEXT,
  key TEXT,
  analysis_json TEXT,
  note TEXT,
  tutor_assisted INTEGER NOT NULL DEFAULT 0,
  band_json TEXT,
  flags_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (sketch_id, version)
) STRICT;

CREATE TABLE album_tracks (
  id TEXT PRIMARY KEY,
  capstone_id TEXT,
  sketch_id TEXT,
  side TEXT NOT NULL CHECK (side IN ('A', 'B', 'Bside')),
  track_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  flavour TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  cover_seed TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE album_track_versions (
  track_id TEXT NOT NULL REFERENCES album_tracks (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  sketch_id TEXT NOT NULL,
  sketch_version INTEGER NOT NULL,
  audio_path TEXT,
  audio_mime TEXT,
  duration_s REAL,
  liner_notes_md TEXT NOT NULL DEFAULT '',
  theory_tags_json TEXT NOT NULL DEFAULT '[]',
  review_json TEXT,
  tutor_assisted INTEGER NOT NULL DEFAULT 0,
  attribution TEXT,
  band_json TEXT,
  flags_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (track_id, version)
) STRICT;

CREATE TABLE audio_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  duration_s REAL,
  sample_rate REAL,
  channels INTEGER,
  stored_path TEXT NOT NULL,
  peaks_path TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE transcriptions (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('own-audio', 'pd-song', 'generated')),
  player TEXT NOT NULL CHECK (player IN ('audio', 'pattern')),
  audio_id TEXT REFERENCES audio_files (id) ON DELETE SET NULL,
  song_id TEXT,
  title TEXT NOT NULL,
  artist TEXT,
  key TEXT,
  bpm REAL,
  meter TEXT,
  downbeat_s REAL,
  fine_tune_cents REAL NOT NULL DEFAULT 0,
  ladder_level INTEGER,
  realism INTEGER,
  hidden_code TEXT,
  regions_json TEXT NOT NULL DEFAULT '[]',
  checklist_json TEXT NOT NULL DEFAULT '{}',
  self_score REAL,
  current_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done')),
  review_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE transcription_versions (
  transcription_id TEXT NOT NULL REFERENCES transcriptions (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  code TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (transcription_id, version)
) STRICT;

CREATE TABLE gym_sessions (
  gym_id TEXT PRIMARY KEY,
  session_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('ladder', 'own-audio')),
  ladder_level INTEGER,
  realism INTEGER,
  transcription_id TEXT,
  at TEXT NOT NULL
) STRICT;

CREATE TABLE tutor_conversations (
  id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  day TEXT NOT NULL,
  thread_kind TEXT NOT NULL CHECK (thread_kind IN ('hint', 'note', 'chat', 'review')),
  effort TEXT NOT NULL,
  session_id TEXT,
  model TEXT,
  prefix_version TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (subject_kind, subject_id, day, thread_kind)
) STRICT;

CREATE TABLE tutor_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES tutor_conversations (id),
  seq INTEGER NOT NULL,
  at TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  learner_code TEXT,
  card_ids_json TEXT NOT NULL DEFAULT '[]',
  review_json TEXT,
  step_id TEXT,
  rung INTEGER,
  summary TEXT,
  backend TEXT,
  excluded INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  UNIQUE (conversation_id, seq)
) STRICT;
CREATE TRIGGER tutor_messages_no_update BEFORE UPDATE ON tutor_messages
BEGIN SELECT RAISE(ABORT, 'tutor_messages is append-only'); END;
CREATE TRIGGER tutor_messages_no_delete BEFORE DELETE ON tutor_messages
BEGIN SELECT RAISE(ABORT, 'tutor_messages is append-only'); END;

CREATE TABLE tutor_backend_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES tutor_conversations (id),
  backend TEXT NOT NULL CHECK (backend IN ('anthropic-api', 'claude-cli')),
  seq INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  excluded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX tutor_backend_records_conv ON tutor_backend_records (conversation_id, backend, seq);
CREATE TRIGGER tutor_backend_records_no_update BEFORE UPDATE ON tutor_backend_records
BEGIN SELECT RAISE(ABORT, 'tutor_backend_records is append-only'); END;
CREATE TRIGGER tutor_backend_records_no_delete BEFORE DELETE ON tutor_backend_records
BEGIN SELECT RAISE(ABORT, 'tutor_backend_records is append-only'); END;

CREATE TABLE tutor_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  lane TEXT NOT NULL,
  backend TEXT NOT NULL,
  served_by_json TEXT NOT NULL DEFAULT '[]',
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_5m INTEGER NOT NULL DEFAULT 0,
  cache_write_1h INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_creation INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  included_in_plan INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX tutor_usage_day ON tutor_usage (day);

CREATE TABLE tutor_cards (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  explanation TEXT NOT NULL,
  bars REAL NOT NULL,
  apply_state TEXT NOT NULL CHECK (apply_state IN ('preview_only', 'applicable', 'applied')),
  locked_tools_json TEXT NOT NULL DEFAULT '[]',
  applied_at TEXT,
  saved_sketch_id TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE tutor_notes (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('listening', 'review', 'observation')),
  text TEXT NOT NULL,
  skill_id TEXT,
  conversation_id TEXT,
  retracted_at TEXT,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX tutor_notes_subject ON tutor_notes (subject_kind, subject_id, at);

CREATE TABLE qa_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  lesson_id TEXT,
  step_id TEXT,
  exercise_id TEXT,
  exercise_version INTEGER,
  family_id TEXT,
  trial_seed INTEGER,
  params_json TEXT,
  response_json TEXT,
  grade_result_json TEXT,
  hint_rung INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  content_version TEXT,
  app_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'fixed', 'wontfix'))
) STRICT;

CREATE TABLE step_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  lesson_version INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  step_kind TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  authored_minutes REAL NOT NULL,
  scaled_minutes REAL NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  active_ms REAL NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_hint_rung INTEGER NOT NULL DEFAULT 0,
  tutor_messages INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  tested_out INTEGER NOT NULL DEFAULT 0,
  split_part TEXT CHECK (split_part IN ('A', 'B'))
) STRICT;
CREATE INDEX step_telemetry_lesson ON step_telemetry (lesson_id);

CREATE TABLE session_telemetry (
  session_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  kind TEXT NOT NULL,
  warmup_ms REAL NOT NULL DEFAULT 0,
  new_ms REAL NOT NULL DEFAULT 0,
  make_ms REAL NOT NULL DEFAULT 0,
  coda_ms REAL NOT NULL DEFAULT 0,
  total_active_ms REAL NOT NULL DEFAULT 0,
  warmup_sets INTEGER NOT NULL DEFAULT 0,
  warmup_planned_sec REAL NOT NULL DEFAULT 0,
  due_sec_before REAL NOT NULL DEFAULT 0,
  due_sec_after REAL NOT NULL DEFAULT 0,
  deferred_cards INTEGER NOT NULL DEFAULT 0,
  overflow_sec REAL NOT NULL DEFAULT 0,
  wrapped_early INTEGER NOT NULL DEFAULT 0,
  split INTEGER NOT NULL DEFAULT 0
) STRICT;
