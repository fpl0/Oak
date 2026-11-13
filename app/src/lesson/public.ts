// The lesson on screen, as others see it (docs/design/wave2.md §3.2). The lesson machine publishes a
// `LessonSnapshot` on every change; the session runner reads the step for its heartbeat and the tutor bridge
// turns it into the tutor subject. Read-only for everyone but the lesson player.
import type { AttemptResponse } from "@oak/api";
import type { Exercise, KeySpec, StepDef } from "@oak/content-kit";
import { create } from "zustand";
import { noteName } from "../answers/harmony.ts";
import { qualityLabel } from "../answers/keys.ts";
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
  const w4 = "answer" in response ? wave4Answer(ex, response.answer as Wave4Answer, o.key ?? null) : null;
  if (w4) return w4;
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

interface Wave4Answer {
  text?: string[];
  choice?: string[];
  rn?: string[];
  qualities?: string[];
  midi?: number[];
  stages?: Partial<Record<"bass" | "quality" | "rn", string[]>>;
}

const STAGES = ["bass", "quality", "rn"] as const;

/**
 * The Wave 4 answers in the tutor's own shapes (wave4.md §5.6, app/src/tutor/context.ts): numerals placed, chords
 * named, built or given a quality, a strip of per-slot choices, a staged chord dictation so far. Only what the
 * learner entered, bar by bar; never the step's `correct`.
 */
function wave4Answer(ex: Exercise, a: Wave4Answer, key: KeySpec | null): TutorAnswer | null {
  const spec = "answer" in ex && ex.answer && typeof ex.answer === "object" ? ex.answer : null;
  const ui = spec && "ui" in spec ? spec.ui : null;
  const exKey = ("key" in ex && ex.key) || key;
  if (a.stages && Object.keys(a.stages).length > 0) {
    const answers = STAGES.filter((st) => (a.stages?.[st]?.length ?? 0) > 0).map((st) => ({
      stage: st,
      values: [...(a.stages?.[st] ?? [])],
    }));
    const stage = answers[answers.length - 1]?.stage ?? "bass";
    return { kind: "stages", stage, answers };
  }
  if (a.rn && a.rn.length > 0)
    return {
      kind: "numerals",
      prompt: ex.prompt,
      key: exKey || null,
      numerals: a.rn.map((rn, i) => ({ bar: i + 1, rn })),
    };
  if (a.qualities && a.qualities.length > 0)
    return {
      kind: "chords",
      prompt: ex.prompt,
      chords: a.qualities.map((q, i) => ({
        ...(a.qualities && a.qualities.length > 1 ? { bar: i + 1 } : {}),
        symbol: qualityLabel(q as never).long,
      })),
    };
  if (ui === "keyboard" && a.midi && a.midi.length > 0)
    return {
      kind: "text",
      prompt: ex.prompt,
      value: `notes ${a.midi.map((m) => noteName(m, exKey || null)).join(" ")}`,
    };
  if (
    ui === "text" &&
    spec &&
    "normalize" in spec &&
    spec.normalize === "chord" &&
    a.text &&
    a.text.length > 0
  )
    return {
      kind: "chords",
      prompt: ex.prompt,
      key: exKey || null,
      chords: a.text.map((symbol) => ({ symbol })),
    };
  if (ui === "slot-choice" && spec && "slots" in spec && a.choice) {
    const options = "options" in spec ? spec.options : [];
    const labels = "labels" in spec && spec.labels ? spec.labels : [];
    return {
      kind: "slots",
      prompt: ex.prompt,
      slots: Array.from({ length: spec.slots }, (_, i) => {
        const id = a.choice?.[i] ?? "";
        return {
          label: labels[i] ?? `Slot ${i + 1}`,
          value: id === "" ? null : (options.find((o) => o.id === id)?.label ?? id),
        };
      }),
    };
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
