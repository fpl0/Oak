// qa_reports, step_telemetry, session_telemetry: local-only operational data (contracts §9.7, §11.8).
import type { QaReport, SessionTelemetry, StepTelemetry } from "@oak/api";
import type { GradeResult, HintRung } from "@oak/content-kit";
import { all, bool, type Db, fromJson, get, int, run, toJson, toJsonOrNull } from "../index.ts";

interface QaRow {
  id: number;
  at: string;
  kind: string;
  lesson_id: string | null;
  step_id: string | null;
  exercise_id: string | null;
  exercise_version: number | null;
  family_id: string | null;
  trial_seed: number | null;
  params_json: string | null;
  response_json: string | null;
  grade_result_json: string | null;
  hint_rung: number;
  note: string | null;
  content_version: string | null;
  app_version: string;
  status: string;
}
const toQa = (r: QaRow): QaReport => ({
  id: r.id,
  at: r.at,
  kind: r.kind as QaReport["kind"],
  lessonId: r.lesson_id,
  stepId: r.step_id,
  exerciseId: r.exercise_id,
  exerciseVersion: r.exercise_version,
  familyId: r.family_id,
  trialSeed: r.trial_seed,
  params: fromJson<Record<string, unknown> | null>(r.params_json, null),
  response: fromJson<unknown>(r.response_json, null),
  gradeResult: fromJson<GradeResult | null>(r.grade_result_json, null),
  hintRung: r.hint_rung as HintRung,
  note: r.note,
  contentVersion: r.content_version,
  appVersion: r.app_version,
  status: r.status as QaReport["status"],
});

interface StepTelRow {
  session_id: string;
  lesson_id: string;
  lesson_version: number;
  step_id: string;
  step_kind: string;
  target_minutes: number;
  authored_minutes: number;
  scaled_minutes: number;
  started_at: string;
  ended_at: string;
  active_ms: number;
  attempts: number;
  max_hint_rung: number;
  tutor_messages: number;
  passed: number;
  skipped: number;
  tested_out: number;
  split_part: string | null;
}
const toStepTel = (r: StepTelRow): StepTelemetry => ({
  sessionId: r.session_id,
  lessonId: r.lesson_id,
  lessonVersion: r.lesson_version,
  stepId: r.step_id,
  stepKind: r.step_kind,
  targetMinutes: r.target_minutes as StepTelemetry["targetMinutes"],
  authoredMinutes: r.authored_minutes,
  scaledMinutes: r.scaled_minutes,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  activeMs: r.active_ms,
  attempts: r.attempts,
  maxHintRung: r.max_hint_rung as HintRung,
  tutorMessages: r.tutor_messages,
  passed: bool(r.passed),
  skipped: bool(r.skipped),
  testedOut: bool(r.tested_out),
  splitPart: r.split_part as StepTelemetry["splitPart"],
});

interface SessTelRow {
  session_id: string;
  day: string;
  target_minutes: number;
  kind: string;
  warmup_ms: number;
  new_ms: number;
  make_ms: number;
  coda_ms: number;
  total_active_ms: number;
  warmup_sets: number;
  warmup_planned_sec: number;
  due_sec_before: number;
  due_sec_after: number;
  deferred_cards: number;
  overflow_sec: number;
  wrapped_early: number;
  split: number;
}
const toSessTel = (r: SessTelRow): SessionTelemetry => ({
  sessionId: r.session_id,
  day: r.day,
  targetMinutes: r.target_minutes as SessionTelemetry["targetMinutes"],
  kind: r.kind as SessionTelemetry["kind"],
  warmupMs: r.warmup_ms,
  newMs: r.new_ms,
  makeMs: r.make_ms,
  codaMs: r.coda_ms,
  totalActiveMs: r.total_active_ms,
  warmupSets: r.warmup_sets,
  warmupPlannedSec: r.warmup_planned_sec,
  dueSecBefore: r.due_sec_before,
  dueSecAfter: r.due_sec_after,
  deferredCards: r.deferred_cards,
  overflowSec: r.overflow_sec,
  wrappedEarly: bool(r.wrapped_early),
  split: bool(r.split),
});

export type NewQaReport = Omit<QaReport, "id">;

export class OpsRepo {
  constructor(private readonly db: Db) {}

  // --- QA queue ---
  addQa(r: NewQaReport): QaReport {
    const { lastInsertRowid } = run(
      this.db,
      `INSERT INTO qa_reports (at, kind, lesson_id, step_id, exercise_id, exercise_version, family_id, trial_seed, params_json,
         response_json, grade_result_json, hint_rung, note, content_version, app_version, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.at,
      r.kind,
      r.lessonId,
      r.stepId,
      r.exerciseId,
      r.exerciseVersion,
      r.familyId,
      r.trialSeed,
      toJsonOrNull(r.params),
      toJson(r.response ?? null),
      toJsonOrNull(r.gradeResult),
      r.hintRung,
      r.note,
      r.contentVersion,
      r.appVersion,
      r.status,
    );
    return this.qa(lastInsertRowid) as QaReport;
  }
  qa(id: number): QaReport | null {
    const row = get<QaRow>(this.db, "SELECT * FROM qa_reports WHERE id = ?", id);
    return row === null ? null : toQa(row);
  }
  qaList(): QaReport[] {
    return all<QaRow>(this.db, "SELECT * FROM qa_reports ORDER BY id DESC").map(toQa);
  }
  setQaStatus(id: number, status: QaReport["status"]): QaReport | null {
    run(this.db, "UPDATE qa_reports SET status = ? WHERE id = ?", status, id);
    return this.qa(id);
  }

  // --- telemetry ---
  addStepTelemetry(rows: readonly StepTelemetry[]): void {
    for (const t of rows)
      run(
        this.db,
        `INSERT INTO step_telemetry (session_id, lesson_id, lesson_version, step_id, step_kind, target_minutes, authored_minutes,
           scaled_minutes, started_at, ended_at, active_ms, attempts, max_hint_rung, tutor_messages, passed, skipped, tested_out, split_part)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.sessionId,
        t.lessonId,
        t.lessonVersion,
        t.stepId,
        t.stepKind,
        t.targetMinutes,
        t.authoredMinutes,
        t.scaledMinutes,
        t.startedAt,
        t.endedAt,
        t.activeMs,
        t.attempts,
        t.maxHintRung,
        t.tutorMessages,
        int(t.passed),
        int(t.skipped),
        int(t.testedOut),
        t.splitPart,
      );
  }
  stepTelemetry(limit = 2000): StepTelemetry[] {
    return all<StepTelRow>(
      this.db,
      "SELECT * FROM step_telemetry ORDER BY started_at DESC, id DESC LIMIT ?",
      limit,
    ).map(toStepTel);
  }
  stepTelemetryOfSession(sessionId: string): StepTelemetry[] {
    return all<StepTelRow>(
      this.db,
      "SELECT * FROM step_telemetry WHERE session_id = ? ORDER BY started_at",
      sessionId,
    ).map(toStepTel);
  }
  saveSessionTelemetry(t: SessionTelemetry): void {
    run(
      this.db,
      `INSERT INTO session_telemetry (session_id, day, target_minutes, kind, warmup_ms, new_ms, make_ms, coda_ms, total_active_ms,
         warmup_sets, warmup_planned_sec, due_sec_before, due_sec_after, deferred_cards, overflow_sec, wrapped_early, split)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id) DO UPDATE SET warmup_ms = excluded.warmup_ms, new_ms = excluded.new_ms,
         make_ms = excluded.make_ms, coda_ms = excluded.coda_ms, total_active_ms = excluded.total_active_ms,
         warmup_sets = excluded.warmup_sets, warmup_planned_sec = excluded.warmup_planned_sec,
         due_sec_before = excluded.due_sec_before, due_sec_after = excluded.due_sec_after,
         deferred_cards = excluded.deferred_cards, overflow_sec = excluded.overflow_sec,
         wrapped_early = excluded.wrapped_early, split = excluded.split`,
      t.sessionId,
      t.day,
      t.targetMinutes,
      t.kind,
      t.warmupMs,
      t.newMs,
      t.makeMs,
      t.codaMs,
      t.totalActiveMs,
      t.warmupSets,
      t.warmupPlannedSec,
      t.dueSecBefore,
      t.dueSecAfter,
      t.deferredCards,
      t.overflowSec,
      int(t.wrappedEarly),
      int(t.split),
    );
  }
  sessionTelemetry(limit = 500): SessionTelemetry[] {
    return all<SessTelRow>(
      this.db,
      "SELECT * FROM session_telemetry ORDER BY day DESC, session_id DESC LIMIT ?",
      limit,
    ).map(toSessTel);
  }
}
