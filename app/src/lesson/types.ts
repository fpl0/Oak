// The lesson player's seams (docs/design/wave2.md §3.2): the StepHost props, the per-exercise-kind renderer
// registry, and the lesson machine's public events and snapshot that the session and the tutor read. The lesson
// engineer implements the player, the machine (XState 5) and the renderers; this file is what others import.
import type {
  AttemptResponse,
  ExerciseKind,
  ExerciseOf,
  GradeResult,
  HintRung,
  LessonDef,
  StepAttemptResult,
  StepDef,
  StepKind,
  StepState,
  TargetMinutes,
} from "@oak/api";
import type { ComponentType } from "react";
import type { AnswerWidgetFor } from "../answers/types.ts";
import type { GateState } from "./gate.ts";

/** What every step renderer is given by the StepHost. */
export interface StepHostProps {
  lesson: LessonDef;
  step: StepDef;
  /** 0-based position among the steps shown at this target (optional steps only at 25). */
  index: number;
  total: number;
  /** Server state of this step (rung, attempts, passed, reveal). `null` while loading or for ungraded steps. */
  state: StepState | null;
  /** Params drawn for the current attempt series (`drawExerciseParams`), `{}` when the exercise has none. */
  params: Record<string, number | string>;
  target: TargetMinutes;
  /** The session this step runs in, `null` for a replay outside a session. */
  sessionId: string | null;
  /** True when the step was passed earlier (replay): show the result, allow "Try a new one". */
  review: boolean;
}

/** What a renderer reports back to the StepHost. The host talks to the server; renderers never do. */
export interface StepCallbacks {
  /** The learner pressed Check: grade in the browser (`gradeInBrowser`) and post `steps.attempt`. */
  onCheck(input: { response: AttemptResponse; result: GradeResult; extraReplays: number }): void;
  /** Hint button (`steps.hint`, `reveal: false`) or Reveal (`reveal: true`, only when `state.revealAvailable`). */
  onHint(reveal: boolean): void;
  /** "Try a new one" (`steps.newSeries`). */
  onNewSeries(): void;
  /** Continue to the next step (enabled once the step is passed or is ungraded). */
  onContinue(): void;
  /** The editor's code changed (the tutor's context chip and `patchSubject`). */
  onCode(code: string): void;
}

export interface ExerciseRendererProps<K extends ExerciseKind = ExerciseKind>
  extends StepHostProps,
    StepCallbacks {
  exercise: ExerciseOf<K>;
  /** The latest graded result of this step in this visit, already in `state`'s series. */
  lastResult: GradeResult | null;
  /** True while a check runs (disable inputs, keep values). */
  checking: boolean;
  /** The answer widgets (app/src/answers), for kinds that render an `AnswerUi`. */
  answerWidgetFor: AnswerWidgetFor;
}
export type ExerciseRenderer<K extends ExerciseKind = ExerciseKind> = ComponentType<ExerciseRendererProps<K>>;

/** Steps without an exercise (`see`, `concept`, `reflect`) render prose and a Continue. */
export interface ProseStepProps extends StepHostProps {
  onContinue(): void;
}

/**
 * The renderer registry the lesson engineer implements in `app/src/lesson/renderers.tsx`:
 * `export const rendererFor: RendererFor = (kind) => …`. `null` means "not implemented in this wave", and the
 * StepHost shows the step's prose with a calm "This step type arrives later" and a Continue (never a dead end).
 */
export type RendererFor = <K extends ExerciseKind>(kind: K) => ExerciseRenderer<K> | null;

// --- the lesson machine's public face --------------------------------------------------------------

export type LessonStatus =
  | "loading"
  /** A step is on screen and waiting for the learner. */
  | "step"
  /** A check is running (browser grade + `steps.attempt`). */
  | "checking"
  /** The Make step (the last one). */
  | "make"
  /** "Wrap up": the Quick sketch is open. */
  | "wrapping"
  /** `lessons.complete` answered. */
  | "complete"
  | "error";

/** What the session store and the tutor read about the lesson on screen (`useLessonPublic`). */
export interface LessonSnapshot {
  lessonId: string;
  lessonVersion: number;
  title: string;
  status: LessonStatus;
  stepId: string;
  stepIndex: number;
  stepKind: StepKind;
  /** Whether the step is one of the lesson's graded checks. */
  graded: boolean;
  passed: boolean;
  /** The editor's clean code, when the step has one. */
  code: string | null;
  lastResult: GradeResult | null;
  /** Server-side rung as last read. */
  rung: HintRung;
  attempts: number;
  splitPart: "A" | "B" | null;
}

/** Events the lesson machine accepts. Others may send the ones marked "external". */
export type LessonEvent =
  | {
      type: "LOADED";
      lesson: LessonDef;
      resumeStep: string | null;
      splitPart: "A" | "B" | null;
      /** The furthest step reached before (a revisit keeps forward access up to it); a completed lesson: its last. */
      reachedStep?: string | null;
      /**
       * Wave 4. The voicing gate, for a lesson that holds its check or its second chance (U05.L07, U05.L08):
       * a met gate drops the `gateCheck` step; an unmet one makes it the hard gate (contracts §3.1 rule 6).
       */
      gate?: GateState | null;
    }
  /** Wave 4: the server (or this visit) reports the voicing gate met. */
  | { type: "GATE"; passed: boolean }
  | { type: "GOTO"; stepId: string }
  | { type: "CODE"; code: string }
  | { type: "CHECK" }
  | { type: "GRADED"; result: GradeResult; attempt: StepAttemptResult }
  | { type: "HINT"; reveal: boolean }
  | { type: "STATE"; state: StepState }
  | { type: "CONTINUE" }
  /** external: the session's "Wrap up" (the Quick sketch follows; `lessons.position` with `wrapped: true`). */
  | { type: "WRAP_UP" }
  /** external: the tutor applied a card to the editor (`tutorAssisted` until the next hand edit). */
  | { type: "APPLY_CARD"; code: string; cardId: string }
  | { type: "COMPLETED"; sketchId: string }
  | { type: "FAILED"; message: string };
