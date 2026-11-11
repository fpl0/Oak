// Hint-rung redaction: the single gate between solution-bearing lesson data and anything that
// leaves the server (tool_result blocks, injected <oak_context>, SSE frames).
//
// Ladder (docs/design/ux.md §3.7): 0 where -> 1 what -> 2 pointer (+audio) -> 3 partial (fix +
// expected for ONE issue) -> 4 reveal (solution + full target).
//
// Rule: redaction is ALLOW-LIST shaped. Views are built field by field from the fixture; nothing is
// ever "copied then deleted", so a new solution-bearing field cannot leak by default.
import type { Issue, LessonFixture, NoteSummary, TargetHap } from './lesson-fixture.ts';

export type Rung = 0 | 1 | 2 | 3 | 4;

export const MIN_RUNG = { what: 1, fix: 3, expected: 3, solution: 4, targetHaps: 4 } as const;

export function clampRung(n: unknown): Rung {
  const v = typeof n === 'number' && Number.isInteger(n) ? n : 0;
  return Math.min(4, Math.max(0, v)) as Rung;
}

export interface IssueView {
  id: string;
  bar: number;
  beat: string;
  kind: Issue['kind'];
  where: string;
  got: NoteSummary;
  what?: string;
  fix?: string;
  expected?: NoteSummary;
}

export function redactIssue(issue: Issue, rung: Rung, index: number): IssueView {
  const view: IssueView = {
    id: issue.id,
    bar: issue.bar,
    beat: issue.beat,
    kind: issue.kind,
    where: issue.where,
    got: issue.got,
  };
  if (rung >= MIN_RUNG.what) view.what = issue.what;
  // Rung 3 reveals fix/expected for ONE issue only (the first); rung 4 for all.
  if (rung >= 4 || (rung >= MIN_RUNG.fix && index === 0)) {
    view.fix = issue.fix;
    view.expected = issue.expected;
  }
  return view;
}

export interface LessonContextView {
  lesson_id: string;
  title: string;
  objectives: string[];
  rubric: string[];
  target_id: string;
  hint_rung: Rung;
  answer_policy: 'socratic' | 'may_reveal';
  issues: IssueView[];
  solution?: { code: string; explanation: string };
  target_haps?: TargetHap[];
}

export function lessonContextView(lesson: LessonFixture, rung: Rung): LessonContextView {
  const view: LessonContextView = {
    lesson_id: lesson.lessonId,
    title: lesson.title,
    objectives: lesson.objectives,
    rubric: lesson.rubric,
    target_id: lesson.targetId,
    hint_rung: rung,
    answer_policy: rung >= MIN_RUNG.solution ? 'may_reveal' : 'socratic',
    issues: lesson.issues.map((i, idx) => redactIssue(i, rung, idx)),
  };
  if (rung >= MIN_RUNG.solution) {
    view.solution = lesson.solution;
    view.target_haps = lesson.targetHaps;
  }
  return view;
}

export interface CompareView {
  target_id: string;
  score: number;
  event_count: { learner: number; target: number };
  issues: IssueView[];
  target_haps?: TargetHap[];
}

/** The Oak-authored context injected as a mid-conversation system message, redacted the same way. */
export function oakContext(lesson: LessonFixture, rung: Rung, extra: { attempt: number; streak: number; now: string }): string {
  const v = lessonContextView(lesson, rung);
  const lines = [
    `screen: lesson ${v.lesson_id} "${v.title}" · attempt ${extra.attempt}`,
    `hint_rung: ${v.hint_rung} · answer_policy: ${v.answer_policy}`,
    ...v.issues.map((i) => {
      let s = `checker: ${i.kind} @ ${i.where}`;
      if (i.what) s += ` · ${i.what}`;
      if (i.fix) s += ` · fix: ${i.fix}`;
      return s;
    }),
    `progress: streak ${extra.streak} · local time ${extra.now}`,
  ];
  if (v.solution) lines.push(`solution: ${v.solution.code}`);
  return lines.join('\n');
}
