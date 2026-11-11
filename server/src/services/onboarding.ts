// Onboarding = U00.L01 "Hello, loop" (ux §8, wave2 §4): where the learner is, so a reload resumes there.
// `finished: true` sets `profile.onboardedAt` and completes U00.L01 on the course map (its unlocks, terms,
// can-dos and SRS seeds, as any completed lesson), with Sketch 001 as the lesson's Make.
import { ONBOARDING_STEPS, type OnboardingPatch, type OnboardingState, type OnboardingStep } from "@oak/api";
import { tx } from "../db/index.ts";
import { notFound } from "../errors.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { CourseService } from "./course.ts";

/** The course item onboarding is (contracts §2.3, default order session 1). */
export const ONBOARDING_LESSON = "U00.L01";

export class OnboardingService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly course: CourseService,
  ) {
    this.time = new LearnerTime(ctx);
  }

  get(): OnboardingState {
    return this.ctx.repos.onboarding.get();
  }

  async put(patch: OnboardingPatch): Promise<OnboardingState> {
    const repos = this.ctx.repos;
    const state = tx(repos.db, () => {
      const cur = repos.onboarding.get();
      const now = this.time.iso();
      if (
        patch.sketchId !== undefined &&
        patch.sketchId !== null &&
        repos.sketches.get(patch.sketchId) === null
      )
        throw notFound(`sketch ${patch.sketchId}`);
      // A step once completed stays completed; a completed step is no longer "skipped".
      const completed = uniq([...cur.completed, ...(patch.completed ?? [])]);
      const skipped = uniq([...cur.skipped, ...(patch.skipped ?? [])]).filter((s) => !completed.includes(s));
      const finished = patch.finished === true;
      const next: OnboardingState = {
        step: patch.step ?? cur.step,
        completed,
        skipped,
        firstEdit: patch.firstEdit === undefined ? cur.firstEdit : patch.firstEdit,
        sketchId: patch.sketchId === undefined ? cur.sketchId : patch.sketchId,
        startedAt: cur.startedAt ?? now,
        finishedAt: finished ? (cur.finishedAt ?? now) : cur.finishedAt,
      };
      const saved = repos.onboarding.save(next, now);
      if (finished && repos.profile.get().onboardedAt === null) repos.profile.patch({ onboardedAt: now });
      return saved;
    });
    if (patch.finished === true) await this.#completeLesson(state.sketchId);
    return state;
  }

  /** U00.L01 on the map: completed once, with the learner's Sketch 001 when there is one. */
  async #completeLesson(sketchId: string | null): Promise<void> {
    if (this.ctx.content.lessonSite(ONBOARDING_LESSON) === null) return;
    if (this.ctx.repos.lessons.progress(ONBOARDING_LESSON)?.status === "completed") return;
    const def = this.ctx.content.lessonDef(ONBOARDING_LESSON);
    await this.course.complete(
      ONBOARDING_LESSON,
      {
        sessionId: null,
        sketchId: sketchId ?? "",
        lessonVersion: def?.version ?? 1,
        contentHash: this.ctx.content.contentVersion ?? "unbuilt",
        splitPart: null,
      },
      { allowUnauthored: true, sketchOptional: true },
    );
  }
}

function uniq(steps: readonly OnboardingStep[]): OnboardingStep[] {
  const set = new Set(steps);
  return ONBOARDING_STEPS.filter((s) => set.has(s));
}
