// Today (contracts §2.5, §7.4, §7.9, §9.1, §9.4): the warm-up plan and the main item of the session — the
// next lesson (or its split half at the 15-minute target), a checkpoint, a capstone session, a gym slot
// (the "every 5th session" rule from U07.L01), a Light lesson after a 10+ day break, or a reviews-only day
// when nothing is left. Storage and the course order are behind the ports below; the server implements
// them over SQLite and the content index (gates are applied by `services/gates.ts` before `next()`).
import type { DueBatch, SessionPlan, WarmupItem } from "@oak/api";
import type { CanDoId, LessonId, SessionId } from "@oak/content-kit";
import {
  dayIndex,
  GYM,
  hash01,
  RETURN,
  type ReturnMode,
  returnMode,
  WARMUP_BUDGET_SEC,
  WARMUP_GYM_SEC,
  WARMUP_SHORT_SEC,
  type WarmupPlan,
} from "@oak/srs";

// --- ports ----------------------------------------------------------------------------------------

export type MapItemKind = "lesson" | "checkpoint" | "capstone" | "gym";
export interface CourseItem {
  id: SessionId;
  kind: Exclude<MapItemKind, "gym">;
  title: string;
}
export interface LessonProgressView {
  status: "locked" | "available" | "in_progress" | "completed";
  currentStep: string | null;
  /** The half of a split lesson already done (contracts §9.4), or `null`. */
  splitPart: "A" | "B" | null;
}
export interface SessionPlanCoursePort {
  /**
   * The next item of the learner's order with gates applied, never a gym or CF-T session (those fill
   * transcription slots, decided here). `null` when nothing is left.
   */
  next(): CourseItem | null;
  /** Completed map sessions in order, oldest first, gym and CF-T sessions included. */
  history(): SessionId[];
  /** CF-T is open (U15.L01 completed) and its next unfinished session, or `null`. */
  nextCftSession(): SessionId | null;
  /** How many gym sessions the learner has started (the next is `GYM.(n+1)`). */
  gymCount(): number;
  hasAudioProject(): boolean;
  lessonProgress(id: LessonId): LessonProgressView | null;
  /** Scaled minutes of the lesson's New + Make content (contracts §9.2). */
  lessonScaledMinutes(id: LessonId): number;
  lastCompletedLesson(): LessonId | null;
  /** Other things Today may offer (an extra gym session, a capstone left open, a side lesson). */
  alternatives(): SessionPlan["alternatives"];
}
export interface SessionPlanLearnerPort {
  profile(): { targetMinutes: 15 | 20 | 25; timeZone: string; rolloverHour: number };
  /** The last qualifying day strictly before `day` (contracts §7.8), or `null`. */
  lastQualifyingDayBefore(day: string): string | null;
  lastCanDo(): CanDoId | null;
  lastSketchId(): string | null;
  /** Rendered from the latest non-retracted tutor note; no API call. */
  tutorNote(): string | null;
}
/** The part of `SrsService` the planner uses. */
export interface SessionPlanSrsPort {
  day(now: Date): string;
  prepareDay(now: Date, gapDays: number): void;
  planWarmup(
    now: Date,
    opts: { budgetSec?: number; gapDays: number },
  ): { plan: WarmupPlan; items: WarmupItem[] };
  planReviewDay(now: Date, gapDays: number): { blocks: WarmupPlan[]; overflow: unknown[] };
}
export interface SessionPlanDeps {
  srs: SessionPlanSrsPort;
  course: SessionPlanCoursePort;
  learner: SessionPlanLearnerPort;
}

// --- pure rules -----------------------------------------------------------------------------------

/** Contracts §9.1: minutes of the main block per target. */
export const MAIN_MINUTES = {
  lesson: { 15: 10, 20: 13, 25: 18 },
  splitA: 8.5,
  splitB: 9.5,
  checkpoint: 16,
  capstone: { 15: 11, 20: 15, 25: 20 },
  gym: { 15: 10, 20: 14, 25: 19 },
  make: { 15: 3, 20: 4, 25: 5 },
} as const;
/** At the 15-minute target a lesson whose scaled content exceeds this is split at `wrapAt`. */
export const SPLIT_ABOVE_MIN = 10;

const isTranscription = (id: string) =>
  id.startsWith("GYM.") || id.startsWith("CF-T.") || /^X\d+\.S\d+$/.test(id);
const isCoreItem = (id: string) => /^U\d+\./.test(id) || /^(C\d+|X\d+|CF-A|CF-T)\.S\d+$/.test(id);
const capstoneSessionNo = (id: string): number | null => {
  const m = /\.S(\d+)$/.exec(id);
  return m && !id.startsWith("GYM.") ? Number(m[1]) : null;
};

/**
 * The transcription slot rule of contracts §2.5. From U07.L01 on, count completed core sessions since the
 * last transcription session (gym, `X#.S#`, `CF-T.S#`); at 4 the next session is a transcription slot,
 * except that a capstone in progress is never interrupted and an `X#` session that is next anyway takes
 * the slot. The rule does not run in the advanced tracks.
 */
export function transcriptionSlotDue(history: readonly string[], next: string | null): boolean {
  if (next === null || !isCoreItem(next)) return false;
  const start = history.indexOf("U07.L01");
  if (start < 0) return false;
  if (/^X\d+\.S\d+$/.test(next)) return false;
  const n = capstoneSessionNo(next);
  if (n !== null && n > 1) return false;
  let count = 0;
  for (let i = history.length - 1; i >= start; i--) {
    const id = history[i] as string;
    if (isTranscription(id)) break;
    count++;
  }
  return count >= GYM.slotEvery;
}

/** Days missed since the last qualifying day: a weekend off after Friday is 2, practising yesterday is 0. */
export function gapDays(lastQualifyingDay: string | null, today: string): number {
  if (lastQualifyingDay === null) return 0;
  return Math.max(0, dayIndex(today) - dayIndex(lastQualifyingDay) - 1);
}

const LIGHT_CONSTRAINTS = [
  "Keep the groove, but change the key.",
  "Use only three different notes in the melody.",
  "Halve the tempo and fill the space.",
  "Swap the drum pattern for one you have not used here.",
  "Make the bass line move only by step.",
  "End on a note other than the tonic.",
];
/** The one new constraint of a Light lesson: deterministic for a lesson and day. */
export function lightConstraint(lessonId: string, day: string): string {
  const i = Math.floor(hash01(`${lessonId}:${day}`) * LIGHT_CONSTRAINTS.length);
  return LIGHT_CONSTRAINTS[i] as string;
}

export function warmupLabel(plannedSec: number): string {
  if (plannedSec <= 0) return "No review today";
  return `Today's review ≈ ${Math.max(1, Math.round(plannedSec / 60))} min`;
}

// --- the planner ----------------------------------------------------------------------------------

export class SessionPlanService {
  constructor(private readonly deps: SessionPlanDeps) {}

  /** `GET /api/session/today`. Idempotent within a day (the SRS day preparation runs once per day). */
  today(now: Date, targetMinutes?: 15 | 20 | 25): SessionPlan {
    const { srs, course, learner } = this.deps;
    const target = targetMinutes ?? learner.profile().targetMinutes;
    const day = srs.day(now);
    const gap = gapDays(learner.lastQualifyingDayBefore(day), day);
    const mode: ReturnMode = returnMode(gap);
    srs.prepareDay(now, gap);

    const returning: SessionPlan["returning"] =
      gap >= RETURN.warmupGap
        ? {
            recap: { canDoId: learner.lastCanDo(), sketchId: learner.lastSketchId() },
            offerLoosen: mode === "light+loosen",
          }
        : null;
    const base = {
      day,
      targetMinutes: target,
      returning,
      alternatives: course.alternatives(),
      tutorNote: learner.tutorNote(),
    };

    // A Light lesson after a break of 10 days or more: the last lesson's Make with one new constraint.
    const lastLesson = course.lastCompletedLesson();
    if ((mode === "light" || mode === "light+loosen") && lastLesson !== null) {
      return {
        ...base,
        kind: "light",
        mapItemId: null,
        title: "A light session",
        note: null,
        warmup: this.warmup(now, WARMUP_BUDGET_SEC[target], gap),
        main: {
          resumeStep: null,
          splitPart: null,
          light: { lessonId: lastLesson, constraint: lightConstraint(lastLesson, day) },
          estMinutes: MAIN_MINUTES.make[target],
        },
      };
    }

    const next = course.next();
    if (next === null) {
      // Nothing left on the map: a reviews-only day (`/practice/review` offers "a little more").
      const review = srs.planReviewDay(now, gap);
      const first = srs.planWarmup(now, { budgetSec: WARMUP_BUDGET_SEC[target], gapDays: gap });
      return {
        ...base,
        kind: "review",
        mapItemId: null,
        title: "Review",
        note: null,
        warmup: {
          ...this.batch(first, WARMUP_BUDGET_SEC[target]),
          moreAvailable: review.blocks.length > 1 || review.overflow.length > 0,
        },
        main: null,
      };
    }

    // A transcription slot (contracts §2.5).
    if (transcriptionSlotDue(course.history(), next.id)) {
      const cft = course.nextCftSession();
      if (cft !== null) {
        return {
          ...base,
          kind: "gym",
          mapItemId: cft,
          title: "Transcription: CF-T",
          note: null,
          warmup: this.warmup(now, WARMUP_GYM_SEC, gap),
          main: { resumeStep: null, splitPart: null, light: null, estMinutes: MAIN_MINUTES.gym[target] },
        };
      }
      const n = course.gymCount() + 1;
      const ladder = n % 2 === 1 || !course.hasAudioProject();
      return {
        ...base,
        kind: "gym",
        mapItemId: `GYM.${String(n).padStart(2, "0")}` as SessionId,
        title: ladder ? "Transcription Gym: ladder" : "Transcription Gym: your own audio",
        note: n % 2 === 0 && ladder ? "No audio project yet: a ladder session one realism level up." : null,
        warmup: this.warmup(now, WARMUP_GYM_SEC, gap),
        main: { resumeStep: null, splitPart: null, light: null, estMinutes: MAIN_MINUTES.gym[target] },
      };
    }

    if (next.kind === "checkpoint") {
      return {
        ...base,
        kind: "checkpoint",
        mapItemId: next.id,
        title: next.title,
        note: target === 15 ? "Checkpoint day: about 20 minutes" : null,
        warmup: this.warmup(now, WARMUP_SHORT_SEC, gap),
        main: { resumeStep: null, splitPart: null, light: null, estMinutes: MAIN_MINUTES.checkpoint },
      };
    }
    if (next.kind === "capstone") {
      return {
        ...base,
        kind: "capstone",
        mapItemId: next.id,
        title: next.title,
        note: null,
        warmup: this.warmup(now, WARMUP_SHORT_SEC, gap),
        main: { resumeStep: null, splitPart: null, light: null, estMinutes: MAIN_MINUTES.capstone[target] },
      };
    }

    // A lesson: resume where it stopped; at the 15-minute target a long lesson is split at `wrapAt`.
    const lessonId = next.id as LessonId;
    const progress = course.lessonProgress(lessonId);
    const split = target === 15 && course.lessonScaledMinutes(lessonId) > SPLIT_ABOVE_MIN;
    const splitPart: "A" | "B" | null = split ? (progress?.splitPart === "A" ? "B" : "A") : null;
    const resumeStep = progress?.status === "in_progress" ? progress.currentStep : null;
    return {
      ...base,
      kind: "lesson",
      mapItemId: next.id,
      title: next.title,
      note: null,
      warmup: this.warmup(now, WARMUP_BUDGET_SEC[target], gap),
      main: {
        resumeStep,
        splitPart,
        light: null,
        estMinutes:
          splitPart === "A"
            ? MAIN_MINUTES.splitA
            : splitPart === "B"
              ? MAIN_MINUTES.splitB
              : MAIN_MINUTES.lesson[target],
      },
    };
  }

  private warmup(now: Date, budgetSec: number, gap: number): DueBatch {
    return this.batch(this.deps.srs.planWarmup(now, { budgetSec, gapDays: gap }), budgetSec);
  }
  private batch(p: { plan: WarmupPlan; items: WarmupItem[] }, budgetSec: number): DueBatch {
    return {
      budgetSec,
      plannedSec: p.plan.plannedSec,
      items: p.items,
      label: warmupLabel(p.plan.plannedSec),
      moreAvailable: false,
    };
  }
}
