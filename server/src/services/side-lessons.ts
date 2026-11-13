// Optional side lessons (contracts §2.6, §9.6; docs/design/wave5.md §5.1): A1.L01–L04 open once U03.L02 is done.
// They are a track in order (A1.L02 after A1.L01), offered beside today's core session or after it, never in the
// New block, at most one offer a day, none on a checkpoint or capstone day and none during a return warm-up. A side
// lesson counts 1 in track A (never the core map), a streak day and 1 in the pace estimate; its unlocks are granted
// on completion like any lesson's.
import { type SessionPlan, SIDE_LESSON_GATE, SIDE_LESSON_IDS, type SideLessons } from "@oak/api";
import { lessonBudget } from "@oak/content-kit";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { GatesService } from "./gates.ts";

/**
 * The one line Today offers each side lesson with (content/specs/A1.ts, each lesson's notes: "Today offer"). The
 * session engineer's chip and the Coda's "one more" print `note` as it is.
 */
export const SIDE_LESSON_OFFERS: Readonly<Record<string, string>> = {
  "A1.L01":
    "Hear why a sawtooth bass sounds bigger than a sine, and give your loop's bass and riff their colour.",
  "A1.L02": "Tame a raw synth bass with a filter and give your riff the pluck of a record.",
  "A1.L03": "Shape how each note starts and ends: a punchy bass, a riff that swells in, a tail that rings.",
  "A1.L04": "Put your loop in a room: reverb, echoes in time, and a space for each part.",
};

/** Whether a lesson ID is one of the optional side lessons (the syllabus marks them `side`). */
export function isSideLesson(content: ServiceContext["content"], id: string): boolean {
  const meta = content.lessonSite(id)?.meta;
  if (meta !== undefined) return meta.side === true;
  return (SIDE_LESSON_IDS as readonly string[]).includes(id);
}

/** Plan kinds a side lesson may be offered beside (never a checkpoint, capstone or Light day). */
const OFFER_KINDS: readonly SessionPlan["kind"][] = ["lesson", "gym", "review"];

export class SideLessonsService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly gates: GatesService,
  ) {
    this.time = new LearnerTime(ctx);
  }

  /** The side lessons in track order (the syllabus rows marked `side`, else the constant list). */
  ids(): string[] {
    const fromSyllabus = this.ctx.content
      .allLessons()
      .filter((s) => s.meta.side === true)
      .map((s) => s.meta.id as string);
    return fromSyllabus.length > 0 ? fromSyllabus : [...SIDE_LESSON_IDS];
  }

  /** The gate (U03.L02 completed). */
  open(): boolean {
    return this.gates.lessonCompleted(SIDE_LESSON_GATE);
  }

  /** Minutes of the whole session at the learner's target: warm-up, the lesson's scaled content, the Coda. */
  estMinutes(id: string, target: 15 | 20 | 25): number {
    const def = this.ctx.content.lessonDef(id);
    let content = def === null ? 11 : lessonBudget(def).scaledMinutes;
    // A side lesson picked up part-way counts only the steps still ahead (review:journey: "about 15 minutes" at S3).
    const p = this.ctx.repos.lessons.progress(id);
    if (def !== null && p?.status === "in_progress" && p.currentStep) {
      const required = def.steps.filter((x) => !x.optional);
      const at = required.findIndex((x) => x.id === p.currentStep);
      const all = required.reduce((sum, x) => sum + x.minutes, 0);
      if (at > 0 && all > 0) content *= required.slice(at).reduce((sum, x) => sum + x.minutes, 0) / all;
    }
    const warmup = target === 15 ? 2 : 3;
    return Math.max(10, Math.round((content + warmup + 1) / 5) * 5);
  }

  #title(id: string): string {
    return this.ctx.content.lessonDef(id)?.title ?? this.ctx.content.lessonTitle(id);
  }

  /** The one-line offer Today, the Coda and the player show for a side lesson (the A1 spec's lines). */
  offerOf(id: string): string {
    return SIDE_LESSON_OFFERS[id] ?? this.ctx.content.lessonSite(id)?.meta.objective ?? "";
  }

  /** `GET /side-lessons`. */
  list(): SideLessons {
    const open = this.open();
    const target = this.ctx.repos.profile.get().targetMinutes;
    const items = this.ids().map((id) => {
      const p = this.ctx.repos.lessons.progress(id);
      const status: SideLessons["items"][number]["status"] =
        p?.status === "completed"
          ? "done"
          : p?.status === "in_progress"
            ? "in_progress"
            : // A side lesson whose lesson file is not written yet is never offered (it stays locked).
              open && this.gates.lessonOpen(id) && this.ctx.content.lessonDef(id) !== null
              ? "open"
              : "locked";
      return {
        lessonId: id as SideLessons["items"][number]["lessonId"],
        title: this.#title(id),
        status,
        estMinutes: this.estMinutes(id, target),
        completedAt: p?.status === "completed" ? (p.completedAt ?? null) : null,
        offer: this.offerOf(id),
      };
    });
    const next = items.find((i) => i.status === "open" || i.status === "in_progress")?.lessonId ?? null;
    return { open, items, next };
  }

  /** Track A's side lessons done and in all (`CourseProgress.sideLessons`). */
  progress(): { done: number; total: number } {
    const ids = this.ids();
    return { done: ids.filter((id) => this.gates.lessonCompleted(id)).length, total: ids.length };
  }

  /**
   * What Today offers (`SessionPlan.sideLesson`): the next unfinished side lesson, as an alternative while today's
   * planned session has not ended, or "after-core" once it has. `null` before the gate, when all are done, on a
   * checkpoint, capstone or Light day, during a return warm-up, and once a side lesson was worked today (one a day).
   */
  offer(plan: Pick<SessionPlan, "kind" | "returning" | "day" | "targetMinutes">): SessionPlan["sideLesson"] {
    if (!this.open() || plan.returning !== null || !OFFER_KINDS.includes(plan.kind)) return null;
    const ids = this.ids();
    const next = this.list().next;
    if (next === null) return null;
    const today = this.ctx.repos.sessions.onDay(plan.day);
    // At most one side lesson a day: one started or completed today closes today's offer.
    if (today.some((s) => s.mapItemId !== null && ids.includes(s.mapItemId))) return null;
    const completedToday = ids.some((id) => {
      const at = this.ctx.repos.lessons.progress(id)?.completedAt ?? null;
      return at !== null && this.time.day(new Date(at)) === plan.day;
    });
    if (completedToday) return null;
    const coreEnded = today.some(
      (s) =>
        s.endedAt !== null &&
        s.kind !== "studio" &&
        s.kind !== "keepalive" &&
        !(s.mapItemId !== null && ids.includes(s.mapItemId)),
    );
    const title = this.#title(next);
    const estMinutes = this.estMinutes(next, plan.targetMinutes);
    const offer = this.offerOf(next);
    return {
      lessonId: next,
      title,
      estMinutes,
      placement: coreEnded ? "after-core" : "alternative",
      note: `Optional side lesson, about ${estMinutes} minutes: ${title}.${offer === "" ? "" : ` ${offer}`}`,
    };
  }
}
