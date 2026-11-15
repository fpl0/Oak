-- The retry policy (docs/design/retry.md §4): a lesson-step attempt taken after the step already counts (the step
-- passed, the lesson is complete, a predict already answered) is stored as practice. A practice attempt keeps its
-- grade and its telemetry (and counts in step_state.attempts) but gives no mastery evidence, no SRS rating, no
-- test-out, and changes neither step_state.passed nor exercise_results nor lesson_progress.best_score. 0 for every attempt before this column.
ALTER TABLE step_attempts ADD COLUMN practice INTEGER NOT NULL DEFAULT 0 CHECK (practice IN (0, 1));
