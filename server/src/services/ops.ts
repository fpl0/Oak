// Telemetry (contracts §9.7) and the "Report a grading problem" queue (§11.8). Local only.
import type { QaReport, QaReportCreate, StepTelemetry, TelemetryReport } from "@oak/api";
import { tx } from "../db/index.ts";
import { notFound } from "../errors.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { MasteryService } from "./mastery.ts";

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** median(active content time / authored minutes) over the last 10 lessons with telemetry. */
export function rollingMultiplier(steps: readonly StepTelemetry[]): number | null {
  const byLesson = new Map<string, { active: number; authored: number; last: string }>();
  for (const s of steps) {
    if (s.skipped || s.testedOut) continue;
    const a = byLesson.get(s.lessonId) ?? { active: 0, authored: 0, last: s.endedAt };
    a.active += s.activeMs / 60_000;
    a.authored += s.authoredMinutes;
    if (s.endedAt > a.last) a.last = s.endedAt;
    byLesson.set(s.lessonId, a);
  }
  const recent = [...byLesson.values()]
    .filter((a) => a.authored > 0)
    .sort((x, y) => y.last.localeCompare(x.last))
    .slice(0, 10);
  return median(recent.map((a) => a.active / a.authored));
}

export class OpsService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly mastery: MasteryService,
  ) {
    this.time = new LearnerTime(ctx);
  }

  addSteps(steps: readonly StepTelemetry[]): void {
    this.ctx.repos.ops.addStepTelemetry(steps);
  }

  report(forecastSec: number[], tutor: { cacheHitRatio: number; costUsd: number }): TelemetryReport {
    const steps = this.ctx.repos.ops.stepTelemetry();
    return {
      steps,
      sessions: this.ctx.repos.ops.sessionTelemetry(),
      rollingMultiplier: rollingMultiplier(steps),
      forecastSec,
      tutor,
    };
  }

  /**
   * One row in `qa_reports`. With `attemptId`, the attempt is marked disputed: its evidence is removed and
   * the skills it touched are recomputed (no mastery evidence, no SRS rating, contracts §11.8).
   */
  addQa(body: QaReportCreate): QaReport {
    return tx(this.ctx.repos.db, () => {
      if (body.attemptId !== null) {
        const a = this.ctx.repos.lessons.attempt(body.attemptId);
        if (a === null) throw notFound(`attempt ${body.attemptId}`);
        this.ctx.repos.lessons.markDisputed(a.id);
        const sourceId = `${a.lessonId}/${a.exerciseId}#${a.id}`;
        const skills = this.ctx.repos.mastery.removeEvidenceOf(
          ["step", "retry", "predict", "rubric-rule"],
          sourceId,
        );
        for (const s of skills) this.mastery.recompute(s);
      }
      const { attemptId: _a, ...rest } = body;
      return this.ctx.repos.ops.addQa({
        ...rest,
        params: rest.params,
        at: this.time.iso(),
        contentVersion: this.ctx.content.contentVersion,
        appVersion: this.ctx.appVersion,
        status: "open",
      });
    });
  }

  qaList(): QaReport[] {
    return this.ctx.repos.ops.qaList();
  }

  setQaStatus(id: number, status: QaReport["status"]): QaReport {
    const r = this.ctx.repos.ops.setQaStatus(id, status);
    if (r === null) throw notFound(`report ${id}`);
    return r;
  }
}
