// The lesson on screen, as others see it (docs/design/wave2.md §3.2). The lesson machine publishes a
// `LessonSnapshot` on every change; the session runner reads the step for its heartbeat and the tutor bridge
// turns it into the tutor subject. Read-only for everyone but the lesson player.
import type { AttemptResponse } from "@oak/api";
import type { Exercise, KeySpec, StepDef } from "@oak/content-kit";
import { create } from "zustand";
import type { LabelState, TutorAnswer, TutorSubject } from "../tutor/context.ts";
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

/** What the tutor reads besides the snapshot (Wave 3): the key, the step's own labels, the last non-code answer. */
export interface LessonSubjectExtra {
  key?: KeySpec | null;
  labels?: LabelState | null;
  answer?: TutorAnswer | null;
}

/** The tutor subject of a lesson snapshot (contracts §10.2: subject `lesson`, the context names the step). */
export function lessonSubject(l: LessonSnapshot, extra: LessonSubjectExtra = {}): TutorSubject {
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
    ...(extra.key !== undefined ? { key: extra.key } : {}),
    ...(extra.labels ? { labels: extra.labels } : {}),
    ...(extra.answer ? { answer: extra.answer } : {}),
  };
}

/**
 * The labels a step shows itself (content's `ui.rollLabels` / `ui.staffLabels` win inside a step, wave3.md §4.3);
 * null when the step sets neither (the learner's lenses then speak for the screen).
 */
export function stepLabels(step: Pick<StepDef, "ui">): LabelState | null {
  const set: string[] = [];
  for (const l of [step.ui.rollLabels, step.ui.staffLabels]) if (typeof l === "string") set.push(l);
  if (set.length === 0) return null;
  return {
    degrees: set.some((l) => l.includes("degree")),
    solfege: set.some((l) => l.includes("solfege")),
    noteNames: set.includes("note"),
  };
}

/**
 * The learner's last answer on a step that is not written in code, in the form the tutor reads (`TutorAnswer`):
 * staff notes or a key signature, a sung take, a by-ear transcription, a typed answer. Never the expected
 * answer. Null for code steps (their code is the subject's `code`) and for answers the tutor has no words for.
 */
export function tutorAnswerOf(
  ex: Exercise,
  response: AttemptResponse,
  o: { key?: KeySpec | null; tolCents?: number } = {},
): TutorAnswer | null {
  if (ex.kind === "all") return null;
  if (ex.kind === "sing") {
    const degrees = ex.target.from === "degrees" ? ex.target.degrees.map(String) : [];
    if ("skipped" in response) return { kind: "sung", notes: [], quiet: true };
    if (!("sung" in response)) return null;
    return {
      kind: "sung",
      notes: response.sung.map((n, i) => ({
        ...(degrees[i] !== undefined ? { target: degrees[i] } : {}),
        cents: n.midi === null ? null : n.cents,
      })),
      ...(o.tolCents !== undefined ? { tolCents: o.tolCents } : {}),
    };
  }
  if (ex.kind === "dictation" && ex.byEar && "code" in response)
    return { kind: "by-ear", code: response.code };
  const staff =
    (ex.kind === "staff-write" || ex.kind === "staff-read" || ex.kind === "dictation") && ex.answer;
  if (staff && staff.ui === "staff-input") {
    const key = staff.key ?? o.key ?? null;
    if ("staff" in response)
      return { kind: "staff", notes: response.staff, clef: staff.clef, key, mode: "notes" };
    if (staff.mode === "key-signature" && "answer" in response)
      return {
        kind: "staff",
        notes: (response.answer.text ?? []).join(" "),
        clef: staff.clef,
        key,
        mode: "key-signature",
      };
  }
  if ("answer" in response && response.answer.text && response.answer.text.length > 0)
    return { kind: "text", prompt: ex.prompt, value: response.answer.text.join(" ") };
  // An ear step's degrees, a picked option (by its label, never its ID: an ID can be code or the answer key's
  // own spelling), or a number: what the learner chose, in words.
  if ("answer" in response) {
    const a = response.answer;
    if (a.degrees && a.degrees.length > 0)
      return {
        kind: "text",
        prompt: ex.prompt,
        value: `${a.degrees.length === 1 ? "degree" : "degrees"} ${a.degrees.join(" ")}`,
      };
    if (a.choice && a.choice.length > 0) {
      const options = "answer" in ex && ex.answer && "options" in ex.answer ? ex.answer.options : [];
      const labels = a.choice.map((id) => options.find((o) => o.id === id)?.label ?? id);
      return { kind: "text", prompt: ex.prompt, value: labels.join(", ") };
    }
    if (typeof a.number === "number") return { kind: "text", prompt: ex.prompt, value: String(a.number) };
  }
  return null;
}

/** The last non-code answer per step of the lesson on screen (set by the player's grade; read for the tutor). */
export const useStepAnswer = create<{ stepId: string | null; answer: TutorAnswer | null }>(() => ({
  stepId: null,
  answer: null,
}));

export function publishStepAnswer(stepId: string, answer: TutorAnswer | null): void {
  useStepAnswer.setState({ stepId, answer });
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
