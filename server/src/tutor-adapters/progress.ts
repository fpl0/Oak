// ProgressPort: the learner's state as the tutor sees it. `advanceHintRung` is the same operation as
// `POST /api/lessons/:id/steps/:stepId/hints` without `reveal`, and counts a tutor hint.
import type { ContentIndex } from "../content/index.ts";
import type { Repos } from "../db/repos/index.ts";
import { ApiError } from "../errors.ts";
import type { CourseService } from "../services/course.ts";
import type { GatesService } from "../services/gates.ts";
import type { StreakService } from "../services/streak.ts";
import type { VoiceService } from "../services/voice.ts";
import { MAX_RECENT_TERMS } from "../tutor/context.ts";
import type { IntroducedTerms, ProgressSnapshot, Rung, StepState } from "../tutor/domain.ts";
import type { ProgressPort } from "../tutor/ports.ts";
import { localStepId } from "./lessons.ts";

export class ProgressAdapter implements ProgressPort {
  constructor(
    private readonly repos: Repos,
    private readonly content: ContentIndex,
    private readonly d: {
      course: CourseService;
      gates: GatesService;
      streak: StreakService;
      /** Quiet mode as the server decides it today (for today, always, or no usable mic). */
      voice?: VoiceService;
    },
  ) {}

  async stepState(lessonId: string, qualified: string): Promise<StepState> {
    const stepId = localStepId(lessonId, qualified);
    const row = this.repos.lessons.stepState(lessonId, stepId);
    const step = this.content.stepDef(lessonId, stepId);
    const attempts = this.repos.lessons.attemptsOfStep(lessonId, stepId).filter((a) => !a.disputed);
    const latest = attempts.at(-1);
    const ex = step?.exercise;
    const rubricDef =
      ex !== undefined && "rubric" in ex && Array.isArray(ex.rubric) ? (ex.rubric as { id: string }[]) : null;
    const rubricMet =
      rubricDef === null || latest?.result?.rubric === undefined
        ? null
        : rubricDef.map((r) => latest.result?.rubric?.find((x) => x.ruleId === r.id)?.ok ?? false);
    const mistakes = new Set(
      (ex?.tests ?? []).filter((t) => t.expect === "fail").flatMap((t) => (t.feedback ?? []) as string[]),
    );
    return {
      rung: (row?.rung ?? 0) as Rung,
      passed: row?.passed ?? false,
      attempts: row?.attempts ?? 0,
      rubricMet,
      matchedMistakes: (latest?.feedbackCodes ?? []).filter((c) => mistakes.has(c)),
    };
  }

  async advanceHintRung(lessonId: string, qualified: string, max: Rung): Promise<Rung> {
    const stepId = localStepId(lessonId, qualified);
    try {
      return this.d.course.hint(lessonId, stepId, { reveal: false, max, fromTutor: true }).rung;
    } catch (e) {
      // A step without hints (or an unknown one) keeps its rung: the tutor answers without advancing.
      if (e instanceof ApiError) return (this.repos.lessons.stepState(lessonId, stepId)?.rung ?? 0) as Rung;
      throw e;
    }
  }

  async snapshot(): Promise<ProgressSnapshot> {
    const progress = this.repos.lessons.allProgress();
    const current =
      progress
        .filter((p) => p.status === "in_progress")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const lessonId = current?.lessonId ?? this.d.gates.nextMapItem();
    const unit = lessonId === null ? null : (this.content.lessonSite(lessonId)?.unit.id ?? null);
    const unlocks = this.repos.unlocks.list();
    const states = this.repos.mastery.allStates();
    const weak = states
      .filter((s) => s.level === "learning" || s.level === "practiced")
      .map((s) => ({
        id: s.skillId,
        name: this.content.skill(s.skillId)?.name ?? s.skillId,
        strength: s.P * (s.R ?? 1),
      }))
      .filter((s) => s.strength < 0.6)
      .sort((a, b) => a.strength - b.strength)
      .slice(0, 5);
    const profile = this.repos.profile.get();
    return {
      current: { unit, lesson: lessonId, step: current?.currentStep ?? null },
      unlocked: {
        recent: unlocks
          .slice(-8)
          .map((u) => u.itemId)
          .reverse(),
        count: unlocks.length,
      },
      weakSkills: weak,
      debts: states.filter((s) => s.debt).map((s) => s.skillId),
      recentFeedback: this.repos.lessons.recentFeedback(5),
      families: this.repos.srs.families().map((f) => ({
        id: f.familyId,
        level: f.level,
        confusions: Object.entries(f.confusion)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([pair]) => pair),
      })),
      streakWeeks: this.d.streak.summary().weeks,
      singTolerance: profile.singToleranceCents,
      quiet: this.d.voice?.quiet() ?? profile.quiet,
    };
  }

  /**
   * Contracts §10.8: the IDs (`term.pulse`) of the terms of completed lessons, as a count plus the 30 most
   * recent. IDs, not display names: the markup guard badges `[[term:<id>]]` as a preview unless the ID is
   * in this list, so names made every introduced term look unintroduced.
   */
  async termsIntroduced(): Promise<IntroducedTerms> {
    const rows = this.repos.terms.list();
    return {
      count: rows.length,
      recent: [...rows]
        .reverse()
        .slice(0, MAX_RECENT_TERMS)
        .map((r) => r.termId as string),
    };
  }
}
