// The lesson on screen, as others see it (docs/design/wave2.md §3.2). The lesson machine publishes a
// `LessonSnapshot` on every change; the session runner reads the step for its heartbeat and the tutor bridge
// turns it into the tutor subject. Read-only for everyone but the lesson player.
import { create } from "zustand";
import type { TutorSubject } from "../tutor/context.ts";
import type { LessonEvent, LessonSnapshot } from "./types.ts";

export const useLessonPublic = create<{ lesson: LessonSnapshot | null }>(() => ({ lesson: null }));

export function publishLesson(lesson: LessonSnapshot): void {
  useLessonPublic.setState({ lesson });
}

/** On unmount; with `lessonId`, only if that lesson is still the one published. */
export function clearLesson(lessonId?: string): void {
  const cur = useLessonPublic.getState().lesson;
  if (lessonId !== undefined && cur?.lessonId !== lessonId) return;
  useLessonPublic.setState({ lesson: null });
}

/** The tutor subject of a lesson snapshot (contracts §10.2: subject `lesson`, the context names the step). */
export function lessonSubject(l: LessonSnapshot): TutorSubject {
  return {
    thread: { subjectKind: "lesson", subjectId: l.lessonId },
    title: `${l.lessonId} · ${l.title}`,
    tutorOpen: true,
    lessonId: l.lessonId,
    stepId: l.stepId,
    graded: l.graded,
    passed: l.passed,
    code: l.code,
    lastResult: l.lastResult,
    rung: l.rung,
  };
}

// --- sending to the lesson on screen ---------------------------------------------------------------

let sink: ((ev: LessonEvent) => void) | null = null;

/** The mounted player registers itself here (one at a time). */
export function setLessonSink(next: ((ev: LessonEvent) => void) | null): void {
  sink = next;
}

/**
 * Sends one of the external `LessonEvent`s to the lesson on screen: the tutor panel applies a card
 * (`APPLY_CARD`), the session takes "Wrap up" (`WRAP_UP`), the panel's "Reveal (hint 4)" (`HINT` with
 * `reveal: true`). Returns false when no lesson is mounted.
 */
export function sendLessonEvent(ev: LessonEvent): boolean {
  if (!sink) return false;
  sink(ev);
  return true;
}
