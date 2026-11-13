-- Wave 4 gate: the sketch version the capstone's latest rubric check ran on. A release must be of that version's
-- code, so a learner cannot check a passing draft, edit it into a failing one and release the edit
-- (review:robustness). NULL for rows written before this column existed: their release is judged as before.
ALTER TABLE capstone_state ADD COLUMN checked_sketch_id TEXT;
ALTER TABLE capstone_state ADD COLUMN checked_sketch_version INTEGER;
