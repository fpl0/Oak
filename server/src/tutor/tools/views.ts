// Tool result shapes that need no redaction (contracts §10.3): the evaluation of code the model or
// the learner wrote, and the learner's progress. Built field by field, in snake_case, capped in size.
import type { EvalResult, ProgressSnapshot } from "../domain.ts";
import type { LintIssue } from "../lint/strict.ts";
import { formatLintIssues } from "../lint/strict.ts";
import { MAX_EVENTS_PER_TRACK } from "./schemas.ts";

export interface EvalView {
  ok: boolean;
  error: { kind: string; message: string; line: number | null } | null;
  tempo: { cps: number; bpm: number; meter: string } | null;
  tracks: {
    label: string;
    role: string;
    total_events: number;
    events: {
      bar: number;
      beat: number;
      dur_beats: number;
      pitch: string | null;
      degree: string | null;
      sound: string | null;
      chord: string | null;
    }[];
  }[];
  warnings: string[];
  locked_tools: string[];
}

export function evalView(r: EvalResult): EvalView {
  return {
    ok: r.ok,
    error: r.error ? { kind: r.error.kind, message: r.error.message, line: r.error.line } : null,
    tempo: r.tempo ? { cps: r.tempo.cps, bpm: r.tempo.bpm, meter: r.tempo.meter } : null,
    tracks: r.tracks.map((t) => ({
      label: t.label,
      role: t.role,
      total_events: t.totalEvents,
      events: t.events.slice(0, MAX_EVENTS_PER_TRACK).map((e) => ({
        bar: e.bar,
        beat: e.beat,
        dur_beats: e.durBeats,
        pitch: e.pitch,
        degree: e.degree,
        sound: e.sound,
        chord: e.chord,
      })),
    })),
    warnings: [...r.warnings],
    locked_tools: [...r.lockedTools],
  };
}

/** A strict-lint rejection, in the same shape as an evaluation failure: data, not a tool error. */
export function lintFailure(issues: readonly LintIssue[]): EvalView {
  return {
    ok: false,
    error: { kind: "lint", message: formatLintIssues(issues).join("; "), line: issues[0]?.line ?? null },
    tempo: null,
    tracks: [],
    warnings: [...new Set(issues.map((i) => i.rule))],
    locked_tools: [],
  };
}

export function totalEvents(r: EvalResult): number {
  return r.tracks.reduce((n, t) => n + t.totalEvents, 0);
}

export interface ProgressView {
  current: { unit: string | null; lesson: string | null; step: string | null };
  unlocked: { recent: string[]; count: number };
  weak_skills: { id: string; name: string; strength: number }[];
  debts: string[];
  recent_feedback: { code: string; count: number }[];
  families: { id: string; level: number; confusions: string[] }[];
  streak_weeks: number;
  sing_tolerance: number;
  quiet: boolean;
}

export function progressView(p: ProgressSnapshot): ProgressView {
  return {
    current: { unit: p.current.unit, lesson: p.current.lesson, step: p.current.step },
    unlocked: { recent: p.unlocked.recent.slice(0, 20), count: p.unlocked.count },
    weak_skills: p.weakSkills.slice(0, 5).map((s) => ({ id: s.id, name: s.name, strength: s.strength })),
    debts: [...p.debts],
    recent_feedback: p.recentFeedback.slice(0, 10).map((f) => ({ code: f.code, count: f.count })),
    families: p.families
      .slice(0, 5)
      .map((f) => ({ id: f.id, level: f.level, confusions: [...f.confusions] })),
    streak_weeks: p.streakWeeks,
    sing_tolerance: p.singTolerance,
    quiet: p.quiet,
  };
}
