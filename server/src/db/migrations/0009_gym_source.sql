-- Wave 7 (the transcribe engineer's request): what a gym session after the core served — `own:<id>`, `song:<id>`,
-- `analysis:<id>`, `jazz:<form>:<tonic>`, `rhythm:<item>` — so the "not the same source twice in two weeks" rule
-- survives other devices and backup → import. NULL for every session before it (and for one that names none).
ALTER TABLE gym_sessions ADD COLUMN source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 120);
