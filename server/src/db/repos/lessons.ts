// lesson_progress, step_state, step_attempts, exercise_results.
import type { ExerciseResult, LessonProgress, StepAttempt } from "@oak/api";
import type { GradeResult, HintRung } from "@oak/content-kit";
import { all, bool, type Db, fromJson, get, int, run, toJson, toJsonOrNull } from "../index.ts";

interface ProgressRow {
  lesson_id: string;
  status: string;
  current_step: string | null;
  split_part: string | null;
  started_at: string | null;
  completed_at: string | null;
  best_score: number | null;
  completed_version: number | null;
  content_hash: string | null;
  updated_at: string;
}
const toProgress = (r: ProgressRow): LessonProgress => ({
  lessonId: r.lesson_id as LessonProgress["lessonId"],
  status: r.status as LessonProgress["status"],
  currentStep: r.current_step,
  splitPart: r.split_part as LessonProgress["splitPart"],
  startedAt: r.started_at,
  completedAt: r.completed_at,
  bestScore: r.best_score,
  completedVersion: r.completed_version,
  contentHash: r.content_hash,
  updatedAt: r.updated_at,
});

export interface StepStateRow {
  lessonId: string;
  stepId: string;
  seriesNo: number;
  rung: HintRung;
  tutorHints: number;
  attempts: number;
  passed: boolean;
  updatedAt: string;
}

export interface NewAttempt {
  sessionId: string | null;
  lessonId: string;
  stepId: string;
  exerciseId: string;
  exerciseVersion: number;
  seriesNo: number;
  attemptNo: number;
  params: unknown;
  code: string | null;
  response: unknown;
  result: GradeResult;
  passed: boolean;
  score: number;
  adjusted: number;
  feedbackCodes: string[];
  hintRung: HintRung;
  assisted: boolean;
  modality: "normal" | "fallback";
  disputed: boolean;
  tutorAssisted: boolean;
  at: string;
}

interface AttemptRow {
  id: number;
  session_id: string | null;
  lesson_id: string;
  step_id: string;
  exercise_id: string;
  exercise_version: number;
  series_no: number;
  attempt_no: number;
  params_json: string | null;
  code: string | null;
  response_json: string;
  result_json: string;
  passed: number;
  score: number;
  adjusted: number;
  feedback_codes: string;
  hint_rung: number;
  assisted: number;
  modality: string;
  disputed: number;
  tutor_assisted: number;
  at: string;
}
const toAttempt = (r: AttemptRow): StepAttempt => ({
  id: r.id,
  sessionId: r.session_id,
  lessonId: r.lesson_id,
  stepId: r.step_id,
  exerciseId: r.exercise_id,
  exerciseVersion: r.exercise_version,
  seriesNo: r.series_no,
  attemptNo: r.attempt_no,
  passed: bool(r.passed),
  score: r.score,
  adjusted: r.adjusted,
  hintRung: r.hint_rung as HintRung,
  feedbackCodes: fromJson<string[]>(r.feedback_codes, []),
  modality: r.modality as StepAttempt["modality"],
  disputed: bool(r.disputed),
  at: r.at,
});

/** An attempt with the stored grade, for services that need more than the DTO. */
export interface StoredAttempt extends StepAttempt {
  result: GradeResult | null;
  code: string | null;
  assisted: boolean;
  tutorAssisted: boolean;
}
const toStored = (r: AttemptRow): StoredAttempt => ({
  ...toAttempt(r),
  result: fromJson<GradeResult | null>(r.result_json, null),
  code: r.code,
  assisted: bool(r.assisted),
  tutorAssisted: bool(r.tutor_assisted),
});

interface ExResultRow {
  exercise_id: string;
  exercise_version: number;
  lesson_id: string;
  first_pass_at: string | null;
  attempts_to_pass: number | null;
  best_score: number | null;
  last_score: number | null;
  assisted: number;
  last_at: string;
}
// The column holds the global ID (`U01.L01/slug`, migration 0002): local slugs repeat across lessons.
// The DTO keeps the local slug, as `step_attempts.exercise_id` and the client do.
const globalExId = (lessonId: string, slug: string) => (slug.includes("/") ? slug : `${lessonId}/${slug}`);
const toExResult = (r: ExResultRow): ExerciseResult => ({
  exerciseId: r.exercise_id.startsWith(`${r.lesson_id}/`)
    ? r.exercise_id.slice(r.lesson_id.length + 1)
    : r.exercise_id,
  exerciseVersion: r.exercise_version,
  lessonId: r.lesson_id,
  firstPassAt: r.first_pass_at,
  attemptsToPass: r.attempts_to_pass,
  bestScore: r.best_score,
  lastScore: r.last_score,
  assisted: bool(r.assisted),
  lastAt: r.last_at,
});

export class LessonsRepo {
  constructor(private readonly db: Db) {}

  // --- lesson_progress ---
  progress(lessonId: string): LessonProgress | null {
    const row = get<ProgressRow>(this.db, "SELECT * FROM lesson_progress WHERE lesson_id = ?", lessonId);
    return row === null ? null : toProgress(row);
  }
  allProgress(): LessonProgress[] {
    return all<ProgressRow>(this.db, "SELECT * FROM lesson_progress ORDER BY lesson_id").map(toProgress);
  }
  completedIds(): Set<string> {
    return new Set(
      all<{ lesson_id: string }>(
        this.db,
        "SELECT lesson_id FROM lesson_progress WHERE status = 'completed'",
      ).map((r) => r.lesson_id),
    );
  }
  saveProgress(p: LessonProgress): LessonProgress {
    run(
      this.db,
      `INSERT INTO lesson_progress (lesson_id, status, current_step, split_part, started_at, completed_at, best_score, completed_version, content_hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (lesson_id) DO UPDATE SET status = excluded.status, current_step = excluded.current_step,
         split_part = excluded.split_part, started_at = excluded.started_at, completed_at = excluded.completed_at,
         best_score = excluded.best_score, completed_version = excluded.completed_version,
         content_hash = excluded.content_hash, updated_at = excluded.updated_at`,
      p.lessonId,
      p.status,
      p.currentStep,
      p.splitPart,
      p.startedAt,
      p.completedAt,
      p.bestScore,
      p.completedVersion,
      p.contentHash,
      p.updatedAt,
    );
    return p;
  }

  // --- step_state ---
  stepState(lessonId: string, stepId: string): StepStateRow | null {
    const r = get<{
      lesson_id: string;
      step_id: string;
      series_no: number;
      rung: number;
      tutor_hints: number;
      attempts: number;
      passed: number;
      updated_at: string;
    }>(this.db, "SELECT * FROM step_state WHERE lesson_id = ? AND step_id = ?", lessonId, stepId);
    if (r === null) return null;
    return {
      lessonId: r.lesson_id,
      stepId: r.step_id,
      seriesNo: r.series_no,
      rung: r.rung as HintRung,
      tutorHints: r.tutor_hints,
      attempts: r.attempts,
      passed: bool(r.passed),
      updatedAt: r.updated_at,
    };
  }
  saveStepState(s: StepStateRow): StepStateRow {
    run(
      this.db,
      `INSERT INTO step_state (lesson_id, step_id, series_no, rung, tutor_hints, attempts, passed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (lesson_id, step_id) DO UPDATE SET series_no = excluded.series_no, rung = excluded.rung,
         tutor_hints = excluded.tutor_hints, attempts = excluded.attempts, passed = excluded.passed,
         updated_at = excluded.updated_at`,
      s.lessonId,
      s.stepId,
      s.seriesNo,
      s.rung,
      s.tutorHints,
      s.attempts,
      int(s.passed),
      s.updatedAt,
    );
    return s;
  }
  stepStates(lessonId: string): StepStateRow[] {
    return all<{ step_id: string }>(this.db, "SELECT step_id FROM step_state WHERE lesson_id = ?", lessonId)
      .map((r) => this.stepState(lessonId, r.step_id))
      .filter((s): s is StepStateRow => s !== null);
  }

  // --- step_attempts ---
  insertAttempt(a: NewAttempt): StepAttempt {
    const { lastInsertRowid } = run(
      this.db,
      `INSERT INTO step_attempts (session_id, lesson_id, step_id, exercise_id, exercise_version, series_no, attempt_no,
         params_json, code, response_json, result_json, passed, score, adjusted, feedback_codes, hint_rung, assisted,
         modality, disputed, tutor_assisted, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.sessionId,
      a.lessonId,
      a.stepId,
      a.exerciseId,
      a.exerciseVersion,
      a.seriesNo,
      a.attemptNo,
      toJsonOrNull(a.params),
      a.code,
      toJson(a.response),
      toJson(a.result),
      int(a.passed),
      a.score,
      a.adjusted,
      toJson(a.feedbackCodes),
      a.hintRung,
      int(a.assisted),
      a.modality,
      int(a.disputed),
      int(a.tutorAssisted),
      a.at,
    );
    return this.attempt(lastInsertRowid) as StepAttempt;
  }
  attempt(id: number): StoredAttempt | null {
    const row = get<AttemptRow>(this.db, "SELECT * FROM step_attempts WHERE id = ?", id);
    return row === null ? null : toStored(row);
  }
  attemptsOfStep(lessonId: string, stepId: string): StoredAttempt[] {
    return all<AttemptRow>(
      this.db,
      "SELECT * FROM step_attempts WHERE lesson_id = ? AND step_id = ? ORDER BY id",
      lessonId,
      stepId,
    ).map(toStored);
  }
  attemptsOfExercise(exerciseId: string): StoredAttempt[] {
    return all<AttemptRow>(
      this.db,
      "SELECT * FROM step_attempts WHERE exercise_id = ? ORDER BY id",
      exerciseId,
    ).map(toStored);
  }
  attemptsOfLesson(lessonId: string): StoredAttempt[] {
    return all<AttemptRow>(
      this.db,
      "SELECT * FROM step_attempts WHERE lesson_id = ? ORDER BY id",
      lessonId,
    ).map(toStored);
  }
  markDisputed(id: number): void {
    const row = get<AttemptRow>(this.db, "SELECT * FROM step_attempts WHERE id = ?", id);
    if (row === null) return;
    const result = fromJson<GradeResult | null>(row.result_json, null);
    run(
      this.db,
      "UPDATE step_attempts SET disputed = 1, result_json = ? WHERE id = ?",
      toJson(result === null ? null : { ...result, disputed: true }),
      id,
    );
  }
  /** Feedback codes of recent failed attempts, most frequent first. */
  recentFeedback(limit: number): { code: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of all<{ feedback_codes: string }>(
      this.db,
      "SELECT feedback_codes FROM step_attempts WHERE passed = 0 ORDER BY id DESC LIMIT 60",
    ))
      for (const code of fromJson<string[]>(r.feedback_codes, []))
        counts.set(code, (counts.get(code) ?? 0) + 1);
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, limit);
  }

  // --- exercise_results ---
  exerciseResult(lessonId: string, exerciseId: string, version: number): ExerciseResult | null {
    const row = get<ExResultRow>(
      this.db,
      "SELECT * FROM exercise_results WHERE exercise_id = ? AND exercise_version = ?",
      globalExId(lessonId, exerciseId),
      version,
    );
    return row === null ? null : toExResult(row);
  }
  /** The latest version's row of one lesson's exercise. */
  latestExerciseResult(lessonId: string, exerciseId: string): ExerciseResult | null {
    const row = get<ExResultRow>(
      this.db,
      "SELECT * FROM exercise_results WHERE exercise_id = ? ORDER BY exercise_version DESC LIMIT 1",
      globalExId(lessonId, exerciseId),
    );
    return row === null ? null : toExResult(row);
  }
  saveExerciseResult(r: ExerciseResult): ExerciseResult {
    run(
      this.db,
      `INSERT INTO exercise_results (exercise_id, exercise_version, lesson_id, first_pass_at, attempts_to_pass, best_score, last_score, assisted, last_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (exercise_id, exercise_version) DO UPDATE SET first_pass_at = excluded.first_pass_at,
         attempts_to_pass = excluded.attempts_to_pass, best_score = excluded.best_score, last_score = excluded.last_score,
         assisted = excluded.assisted, last_at = excluded.last_at`,
      globalExId(r.lessonId, r.exerciseId),
      r.exerciseVersion,
      r.lessonId,
      r.firstPassAt,
      r.attemptsToPass,
      r.bestScore,
      r.lastScore,
      int(r.assisted),
      r.lastAt,
    );
    return r;
  }
}
