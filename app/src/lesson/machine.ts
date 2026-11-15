// The lesson machine (XState 5): load → step → check → feedback → next … → Make → complete, with the hint
// ladder, "Try a new one", "Wrap up" (Quick sketch, contracts §9.4), the 15-minute split at `wrapAt`, revisits
// of earlier steps, tutor cards applied to the editor and a disputed grading. Every server call goes through
// `LessonDeps`, so the machine is tested with fakes and the player wires the real API (or a local preview).
import type {
  AttemptResponse,
  Exercise,
  GradeResult,
  HintRung,
  LessonCompleteResult,
  LessonDef,
  ParamValues,
  StepAttemptResult,
  StepDef,
  StepState,
  TargetMinutes,
} from "@oak/api";
import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import { idempotencyKey } from "../lib/idempotency.ts";
import { type GateState, gateMetBy, stepsForGate } from "./gate.ts";
import {
  canContinue,
  type EditorStart,
  editorStart,
  partRange,
  resultOnScreen,
  type SplitPart,
  type StepProgress,
  startIndex,
  visibleSteps,
} from "./model.ts";
import type { LessonEvent, LessonSnapshot, LessonStatus } from "./types.ts";

export interface AttemptInput {
  stepId: string;
  exercise: Exercise;
  seriesNo: number;
  params: ParamValues;
  response: AttemptResponse;
  result: GradeResult;
  extraReplays: number;
  tutorAssisted: boolean;
  /**
   * One key per Check (docs/design/wave3.md §5.2): a retry of the same answer after a failed save reuses it, so
   * the server counts the attempt once; a different answer gets a new key.
   */
  idempotencyKey: string;
}

export interface FinishInput {
  stepId: string;
  code: string;
  title: string;
  result: GradeResult | null;
  tutorAssisted: boolean;
}

export interface QuickSketchInput {
  stepId: string;
  code: string;
  title: string;
  /** "A" ends part A of a split lesson; `null` is a plain "Wrap up". */
  part: SplitPart | null;
  /** The step the next session resumes at. */
  resumeStep: string;
}

/** The server calls the machine makes. The player wires the API; tests and the local preview use fakes. */
export interface LessonDeps {
  postAttempt(input: AttemptInput): Promise<Pick<StepAttemptResult, "state" | "testedOut">>;
  hint(stepId: string, reveal: boolean): Promise<StepState>;
  newSeries(stepId: string): Promise<StepState>;
  /** Saves the Make's sketch and completes the lesson (`lessons.complete`). */
  finish(input: FinishInput): Promise<{ sketchId: string; result: LessonCompleteResult | null }>;
  /** Saves the Quick sketch; for part A also `lessons.complete` with `splitPart: 'A'`. */
  quickSketch(input: QuickSketchInput): Promise<{ sketchId: string }>;
  /** Fire and forget: `lessons.position`. */
  position(stepId: string, wrapped: boolean): void;
  /** Fire and forget: the step on screen changed (telemetry, session heartbeat, tutor subject). */
  stepLeft?(stepId: string, how: "continue" | "goto" | "wrap" | "finish"): void;
  /** A fresh idempotency key (tests inject a counter); default `idempotencyKey()`. */
  newKey?(): string;
}

export interface LessonInput {
  lessonId: string;
  target: TargetMinutes;
  sessionId: string | null;
  deps: LessonDeps;
}

export interface LessonContext extends LessonInput {
  lesson: LessonDef | null;
  steps: StepDef[];
  /** Steps of today's part, `[from, to]` inclusive. */
  range: [number, number];
  splitPart: SplitPart | null;
  index: number;
  /** The furthest step reached: anything up to it can be revisited. */
  furthest: number;
  states: Record<string, StepState | null>;
  results: Record<string, GradeResult | null>;
  done: Record<string, boolean>;
  disputed: Record<string, boolean>;
  /**
   * Wave 5: steps whose answer widget the app cannot draw yet (a kind the answers registry has no widget for): the
   * player says so and Continue opens, so a learner is never stuck on a step they cannot answer.
   */
  unavailable: Record<string, boolean>;
  code: Record<string, string>;
  /** Code applied from a tutor card and not edited by hand since (contracts §10.7). */
  tutorAssisted: Record<string, boolean>;
  /** Steps marked complete by a test-out pass (contracts §9.5). */
  testedOut: string[];
  /** The idempotency key of the Check being saved per step, with what it was for (kept until it is saved). */
  attemptKeys: Record<string, { sig: string; key: string }>;
  /** A calm, transient message ("That check could not be saved; try again"). */
  notice: string | null;
  error: string | null;
  wrapReason: "wrap-up" | "split" | null;
  sketchId: string | null;
  completion: LessonCompleteResult | null;
  /** Wave 4: the voicing gate, for U05.L07 and U05.L08 (`null` for every other lesson). */
  gate: GateState | null;
  /**
   * "Try again" presses per step in this visit (docs/design/retry.md §2.5): a retry clears the step's verdict and
   * re-opens the same question with the same series and params. Not kept over a reload: a reloaded step opens on
   * the server's state with no verdict on screen, which is where a retry leaves it too.
   */
  retried: Record<string, number>;
  /** Counts verdicts as they appear, so each one has its own identity (the result row's focus rule). */
  resultNo: number;
}

/** Events the player sends besides the public `LessonEvent`s. */
export type LessonInternalEvent =
  | {
      type: "SUBMIT";
      response: AttemptResponse;
      result: GradeResult;
      extraReplays: number;
      exercise: Exercise;
      seriesNo: number;
      params: ParamValues;
    }
  /** The browser grade threw (a programming or host error, not the learner's code). */
  | { type: "CHECK_FAILED"; message: string }
  /** A live check on a Make (never posted). */
  | { type: "LOCAL_RESULT"; stepId: string; result: GradeResult | null }
  | { type: "NEW_SERIES" }
  /** An ungraded step was completed (a loop played, a run, an answer given). */
  | { type: "DONE"; stepId: string }
  /** "Report a grading problem" was sent: Continue opens at once (contracts §11.8). */
  | { type: "DISPUTED"; stepId: string }
  /** The step's answer widget is not available in this app yet: Continue opens (it never counts as a pass). */
  | { type: "UNAVAILABLE"; stepId: string }
  | { type: "BACK" }
  | { type: "FORWARD" }
  /** "Know this already? Try the check." (contracts §9.5): jump to the test-out step. */
  | { type: "TEST_OUT"; stepId: string }
  | { type: "SAVE_MAKE"; code: string; title: string }
  | { type: "SAVE_QUICK"; code: string; title: string }
  | { type: "CANCEL_WRAP" }
  | { type: "DISMISS_NOTICE" }
  /** The lesson failed to load: load it again. */
  | { type: "RETRY" }
  /**
   * "Try again" after any result (docs/design/retry.md): the verdict goes, the widget re-opens on the same
   * question (same series, same params, same rung). Nothing is posted: the next Check is the next attempt, and
   * the server decides what it counts for (`StepState.practiceNext`).
   */
  | { type: "TRY_AGAIN" };

export type LessonMachineEvent = LessonEvent | LessonInternalEvent;

const current = (c: LessonContext): StepDef | null => c.steps[c.index] ?? null;

export function progressOf(c: LessonContext, stepId: string): StepProgress {
  return {
    state: c.states[stepId] ?? null,
    result: c.results[stepId] ?? null,
    done: c.done[stepId] === true || c.testedOut.includes(stepId),
    disputed: c.disputed[stepId] === true,
    unavailable: c.unavailable[stepId] === true,
  };
}

/** The code a step's editor starts from or holds now. */
export function codeOf(c: LessonContext, step: StepDef): string | null {
  const held = c.code[step.id];
  if (held !== undefined) return held;
  const start: EditorStart | null = editorStart(step.exercise, step.example);
  return start ? start.code : null;
}

/** The most recent code anywhere in the lesson (what a Quick sketch saves). */
export function latestCode(c: LessonContext): string {
  for (let i = c.index; i >= 0; i--) {
    const s = c.steps[i];
    if (!s) continue;
    const code = c.code[s.id];
    if (code !== undefined && code.trim() !== "") return code;
  }
  for (let i = c.index; i >= 0; i--) {
    const s = c.steps[i];
    const code = s ? codeOf(c, s) : null;
    if (code) return code;
  }
  return "";
}

const newKeyOf = (c: LessonContext) => (c.deps.newKey ?? idempotencyKey)();

/** What makes two Checks "the same action": the exercise, the series and the answer. */
function attemptSig(e: Extract<LessonInternalEvent, { type: "SUBMIT" }>): string {
  return JSON.stringify([e.exercise.id, e.exercise.version, e.seriesNo, e.params, e.response]);
}

/** A result with `status: 'error'` (the code did not run) is shown, never posted: it is not an attempt. */
function keepErrorResult({ context, event }: { context: LessonContext; event: LessonMachineEvent }) {
  const s = current(context);
  if (!s || event.type !== "SUBMIT") return {};
  return {
    results: { ...context.results, [s.id]: event.result },
    notice: null,
    resultNo: context.resultNo + 1,
  };
}

/** Whether the current step has a verdict (or a predict's outcome) on screen, so Try again is offered. */
export function resultShown(c: LessonContext): boolean {
  const s = current(c);
  return s !== null && resultOnScreen(s, progressOf(c, s.id), c.retried[s.id] ?? 0);
}

export const lessonMachine = setup({
  types: {
    context: {} as LessonContext,
    events: {} as LessonMachineEvent,
    input: {} as LessonInput,
  },
  actors: {
    postAttempt: fromPromise<
      Pick<StepAttemptResult, "state" | "testedOut">,
      { deps: LessonDeps; attempt: AttemptInput }
    >(({ input }) => input.deps.postAttempt(input.attempt)),
    hint: fromPromise<StepState, { deps: LessonDeps; stepId: string; reveal: boolean }>(({ input }) =>
      input.deps.hint(input.stepId, input.reveal),
    ),
    newSeries: fromPromise<StepState, { deps: LessonDeps; stepId: string }>(({ input }) =>
      input.deps.newSeries(input.stepId),
    ),
    finish: fromPromise<
      { sketchId: string; result: LessonCompleteResult | null },
      { deps: LessonDeps; finish: FinishInput }
    >(({ input }) => input.deps.finish(input.finish)),
    quickSketch: fromPromise<{ sketchId: string }, { deps: LessonDeps; quick: QuickSketchInput }>(
      ({ input }) => input.deps.quickSketch(input.quick),
    ),
  },
  guards: {
    canContinue: ({ context }) => {
      const s = current(context);
      return s !== null && canContinue(s, progressOf(context, s.id), context.gate);
    },
    endsPartA: ({ context }) => context.splitPart === "A" && context.index >= context.range[1],
    beforeMake: ({ context }) => {
      const s = current(context);
      return s !== null && s.kind !== "make";
    },
    canGoBack: ({ context }) => context.index > context.range[0],
    canGoForward: ({ context }) => context.index < context.furthest,
    isError: ({ event }) => event.type === "SUBMIT" && event.result.status === "error",
    resultShown: ({ context }) => resultShown(context),
    noResultShown: ({ context }) => !resultShown(context),
    hasHints: ({ context }) => {
      const ex = current(context)?.exercise;
      return !!ex && ex.hints !== null && ex.kind !== "predict" && ex.kind !== "listen";
    },
  },
  actions: {
    leave: ({ context }, how: "continue" | "goto" | "wrap" | "finish") => {
      const s = current(context);
      if (s) context.deps.stepLeft?.(s.id, how);
    },
    announcePosition: ({ context }) => {
      const s = current(context);
      if (s) context.deps.position(s.id, false);
    },
  },
}).createMachine({
  id: "lesson",
  context: ({ input }) => ({
    ...input,
    lesson: null,
    steps: [],
    range: [0, 0],
    splitPart: null,
    index: 0,
    furthest: 0,
    states: {},
    results: {},
    done: {},
    disputed: {},
    unavailable: {},
    code: {},
    tutorAssisted: {},
    testedOut: [],
    attemptKeys: {},
    notice: null,
    error: null,
    wrapReason: null,
    sketchId: null,
    completion: null,
    gate: null,
    retried: {},
    resultNo: 0,
  }),
  initial: "loading",
  on: {
    FAILED: { target: ".error", actions: assign({ error: ({ event }) => event.message }) },
    STATE: {
      actions: assign({
        states: ({ context, event }) => ({ ...context.states, [event.state.stepId]: event.state }),
      }),
    },
    DISMISS_NOTICE: { actions: assign({ notice: null }) },
    GATE: {
      actions: assign({
        gate: ({ context, event }) =>
          context.gate ? { ...context.gate, passed: context.gate.passed || event.passed } : null,
      }),
    },
  },
  states: {
    loading: {
      on: {
        LOADED: {
          target: "active",
          actions: assign(({ context, event }) => {
            const gate = event.gate ?? null;
            // A met gate drops U05.L08's second chance; an unknown or unmet one keeps it (the server decides).
            const steps = stepsForGate(visibleSteps(event.lesson, context.target), gate ? gate.passed : null);
            const range = partRange(steps, event.lesson.wrapAt, event.splitPart);
            const index = startIndex(steps, { currentStep: event.resumeStep, range });
            const reached = event.reachedStep ? steps.findIndex((s) => s.id === event.reachedStep) : -1;
            return {
              lesson: event.lesson,
              steps,
              range,
              splitPart: event.splitPart,
              index,
              furthest: Math.min(range[1], Math.max(index, reached)),
              error: null,
              gate,
            };
          }),
        },
      },
    },
    active: {
      initial: "idle",
      on: {
        CODE: {
          actions: assign(({ context, event }) => {
            const s = current(context);
            if (!s) return {};
            return {
              code: { ...context.code, [s.id]: event.code },
              tutorAssisted: { ...context.tutorAssisted, [s.id]: false },
            };
          }),
        },
        APPLY_CARD: {
          actions: assign(({ context, event }) => {
            const s = current(context);
            if (!s) return {};
            return {
              code: { ...context.code, [s.id]: event.code },
              tutorAssisted: { ...context.tutorAssisted, [s.id]: true },
            };
          }),
        },
        LOCAL_RESULT: {
          actions: assign({
            results: ({ context, event }) => ({ ...context.results, [event.stepId]: event.result }),
          }),
        },
        DONE: {
          actions: assign({ done: ({ context, event }) => ({ ...context.done, [event.stepId]: true }) }),
        },
        DISPUTED: {
          actions: assign({
            disputed: ({ context, event }) => ({ ...context.disputed, [event.stepId]: true }),
          }),
        },
        UNAVAILABLE: {
          guard: ({ context, event }) => context.unavailable[event.stepId] !== true,
          actions: assign({
            unavailable: ({ context, event }) => ({ ...context.unavailable, [event.stepId]: true }),
          }),
        },
        GRADED: {
          actions: assign(({ context, event }) => ({
            results: { ...context.results, [event.attempt.state.stepId]: event.result },
            states: { ...context.states, [event.attempt.state.stepId]: event.attempt.state },
            resultNo: context.resultNo + 1,
          })),
        },
      },
      states: {
        // Waiting for the learner. `answering`: the question is open; `result`: a verdict is on screen and the
        // answer is locked until "Try again" (docs/design/retry.md §2.5). Which one follows the step on screen,
        // so moving between steps, a reload, a hint or a new series lands in the right one by itself.
        idle: {
          initial: "answering",
          states: {
            answering: {
              always: { guard: "resultShown", target: "result" },
            },
            result: {
              always: { guard: "noResultShown", target: "answering" },
              on: {
                TRY_AGAIN: {
                  target: "answering",
                  actions: assign(({ context }) => {
                    const s = current(context);
                    if (!s) return {};
                    return {
                      results: { ...context.results, [s.id]: null },
                      retried: { ...context.retried, [s.id]: (context.retried[s.id] ?? 0) + 1 },
                      notice: null,
                    };
                  }),
                },
              },
            },
          },
          on: {
            CHECK: "grading",
            SUBMIT: [{ guard: "isError", actions: assign(keepErrorResult) }, { target: "posting" }],
            HINT: { guard: "hasHints", target: "hinting" },
            NEW_SERIES: "series",
            CONTINUE: [
              {
                guard: "endsPartA",
                target: "#lesson.wrapping",
                actions: [{ type: "leave", params: "wrap" }, assign({ wrapReason: "split" })],
              },
              {
                guard: "canContinue",
                actions: [
                  { type: "leave", params: "continue" },
                  assign(({ context }) => {
                    const index = Math.min(context.index + 1, context.range[1]);
                    return { index, furthest: Math.max(context.furthest, index), notice: null };
                  }),
                  "announcePosition",
                ],
              },
            ],
            GOTO: {
              actions: [
                { type: "leave", params: "goto" },
                assign(({ context, event }) => {
                  const i = context.steps.findIndex((s) => s.id === event.stepId);
                  if (i < context.range[0] || i > context.furthest) return {};
                  return { index: i, notice: null };
                }),
              ],
            },
            BACK: {
              guard: "canGoBack",
              actions: [
                { type: "leave", params: "goto" },
                assign({ index: ({ context }) => context.index - 1, notice: null }),
              ],
            },
            FORWARD: {
              guard: "canGoForward",
              actions: [
                { type: "leave", params: "goto" },
                assign({ index: ({ context }) => context.index + 1, notice: null }),
              ],
            },
            TEST_OUT: {
              actions: [
                { type: "leave", params: "goto" },
                assign(({ context, event }) => {
                  const i = context.steps.findIndex((s) => s.id === event.stepId);
                  const step = context.steps[i];
                  if (i < 0 || i > context.range[1] || !step?.testOut) return {};
                  return { index: i, furthest: Math.max(context.furthest, i), notice: null };
                }),
                "announcePosition",
              ],
            },
            WRAP_UP: {
              guard: "beforeMake",
              target: "#lesson.wrapping",
              actions: [
                { type: "leave", params: "wrap" },
                assign({ wrapReason: "wrap-up" }),
                ({ context }) => {
                  const s = current(context);
                  if (s) context.deps.position(s.id, true);
                },
              ],
            },
            SAVE_MAKE: "#lesson.finishing",
          },
        },
        grading: {
          on: {
            SUBMIT: [
              { guard: "isError", target: "idle", actions: assign(keepErrorResult) },
              { target: "posting" },
            ],
            CHECK_FAILED: {
              target: "idle",
              actions: assign({ notice: ({ event }) => `The check did not run: ${event.message}` }),
            },
          },
        },
        posting: {
          invoke: {
            src: "postAttempt",
            input: ({ context, event }) => {
              const s = current(context) as StepDef;
              const e = event as Extract<LessonInternalEvent, { type: "SUBMIT" }>;
              return {
                deps: context.deps,
                attempt: {
                  stepId: s.id,
                  exercise: e.exercise,
                  seriesNo: e.seriesNo,
                  params: e.params,
                  response: e.response,
                  result: e.result,
                  extraReplays: e.extraReplays,
                  tutorAssisted: context.tutorAssisted[s.id] === true,
                  idempotencyKey: context.attemptKeys[s.id]?.key ?? newKeyOf(context),
                },
              };
            },
            onDone: {
              target: "idle",
              actions: assign(({ context, event }) => {
                const st = event.output.state;
                const { [st.stepId]: _saved, ...attemptKeys } = context.attemptKeys;
                return {
                  states: { ...context.states, [st.stepId]: st },
                  testedOut: [...new Set([...context.testedOut, ...event.output.testedOut])],
                  attemptKeys,
                  notice: null,
                };
              }),
            },
            onError: {
              target: "idle",
              actions: assign({
                notice:
                  "Your answer was checked, but Oak could not save it. Press Try again, then Check, to save it.",
              }),
            },
          },
          entry: assign(({ context, event }) => {
            const s = current(context);
            if (!s || event.type !== "SUBMIT") return {};
            // The same answer again (a retry after a failed save) keeps its key; anything else is a new Check.
            const sig = attemptSig(event);
            const held = context.attemptKeys[s.id];
            const key = held && held.sig === sig ? held.key : newKeyOf(context);
            // A gate pass in U05.L08's second chance opens the gate for the rest of this visit at once.
            const opens =
              s.gateCheck === true &&
              context.gate !== null &&
              gateMetBy(event.result, context.gate.rule.minScore);
            return {
              results: { ...context.results, [s.id]: event.result },
              resultNo: context.resultNo + 1,
              attemptKeys: { ...context.attemptKeys, [s.id]: { sig, key } },
              ...(opens && context.gate ? { gate: { ...context.gate, passed: true } } : {}),
            };
          }),
        },
        hinting: {
          invoke: {
            src: "hint",
            input: ({ context, event }) => ({
              deps: context.deps,
              stepId: (current(context) as StepDef).id,
              reveal: event.type === "HINT" ? event.reveal : false,
            }),
            onDone: {
              target: "idle",
              actions: assign({
                states: ({ context, event }) => ({ ...context.states, [event.output.stepId]: event.output }),
              }),
            },
            onError: {
              target: "idle",
              actions: assign({ notice: "The hint could not be loaded. Try again in a moment." }),
            },
          },
        },
        series: {
          invoke: {
            src: "newSeries",
            input: ({ context }) => ({ deps: context.deps, stepId: (current(context) as StepDef).id }),
            onDone: {
              target: "idle",
              actions: assign(({ context, event }) => {
                const st = event.output;
                const { [st.stepId]: _drop, ...code } = context.code;
                return {
                  states: { ...context.states, [st.stepId]: st },
                  results: { ...context.results, [st.stepId]: null },
                  code,
                };
              }),
            },
            onError: {
              target: "idle",
              actions: assign({ notice: "A new one could not be drawn. Try again in a moment." }),
            },
          },
        },
      },
    },
    finishing: {
      invoke: {
        src: "finish",
        input: ({ context, event }) => {
          const s = current(context) as StepDef;
          const e = event as Extract<LessonInternalEvent, { type: "SAVE_MAKE" }>;
          return {
            deps: context.deps,
            finish: {
              stepId: s.id,
              code: e.code,
              title: e.title,
              result: context.results[s.id] ?? null,
              tutorAssisted: context.tutorAssisted[s.id] === true,
            },
          };
        },
        onDone: {
          target: "complete",
          actions: [
            { type: "leave", params: "finish" },
            assign({
              sketchId: ({ event }) => event.output.sketchId,
              completion: ({ event }) => event.output.result,
            }),
          ],
        },
        onError: {
          target: "active",
          actions: assign({
            notice: ({ event }) =>
              `The sketch was not saved: ${event.error instanceof Error ? event.error.message : String(event.error)}. Your code is still here; try Save again.`,
          }),
        },
      },
    },
    wrapping: {
      initial: "editing",
      states: {
        editing: {
          on: {
            SAVE_QUICK: "saving",
            CANCEL_WRAP: {
              guard: ({ context }) => context.wrapReason === "wrap-up",
              target: "#lesson.active",
              actions: [assign({ wrapReason: null }), "announcePosition"],
            },
          },
        },
        saving: {
          invoke: {
            src: "quickSketch",
            input: ({ context, event }) => {
              const s = current(context) as StepDef;
              const e = event as Extract<LessonInternalEvent, { type: "SAVE_QUICK" }>;
              const next =
                context.wrapReason === "split"
                  ? (context.steps[context.range[1] + 1]?.id ?? s.id)
                  : nextUnfinished(context);
              return {
                deps: context.deps,
                quick: {
                  stepId: s.id,
                  code: e.code,
                  title: e.title,
                  part: context.wrapReason === "split" ? "A" : null,
                  resumeStep: next,
                },
              };
            },
            onDone: {
              target: "#lesson.complete",
              actions: assign({ sketchId: ({ event }) => event.output.sketchId }),
            },
            onError: {
              target: "editing",
              actions: assign({ notice: "The sketch was not saved. Try again; your code is still here." }),
            },
          },
        },
      },
    },
    complete: {
      on: { COMPLETED: { actions: assign({ sketchId: ({ event }) => event.sketchId }) } },
    },
    error: {
      on: { RETRY: { target: "loading", actions: assign({ error: null }) } },
    },
  },
});

/** The first step at or after the current one that is not done (where a wrapped lesson resumes). */
export function nextUnfinished(c: LessonContext): string {
  for (let i = c.index; i <= c.range[1]; i++) {
    const s = c.steps[i];
    if (!s) continue;
    const p = progressOf(c, s.id);
    if (!(p.done || p.disputed || p.unavailable || p.state?.passed || p.result?.status === "pass"))
      return s.id;
  }
  return c.steps[c.index]?.id ?? c.steps[0]?.id ?? "S1";
}

type MachineSnapshot = SnapshotFrom<typeof lessonMachine>;

export function statusOf(snap: MachineSnapshot): LessonStatus {
  if (snap.matches("loading")) return "loading";
  if (snap.matches("error")) return "error";
  if (snap.matches("complete")) return "complete";
  if (snap.matches("wrapping")) return "wrapping";
  if (snap.matches({ active: "grading" }) || snap.matches({ active: "posting" })) return "checking";
  if (snap.matches("finishing")) return "checking";
  return current(snap.context)?.kind === "make" ? "make" : "step";
}

/** What the session and the tutor read (`publishLesson`). */
export function snapshotOf(snap: MachineSnapshot): LessonSnapshot | null {
  const c = snap.context;
  const s = current(c);
  if (!c.lesson || !s) return null;
  const st = c.states[s.id] ?? null;
  const result = c.results[s.id] ?? null;
  return {
    lessonId: c.lesson.id,
    lessonVersion: c.lesson.version,
    title: c.lesson.title,
    status: statusOf(snap),
    stepId: s.id,
    stepIndex: c.index,
    stepKind: s.kind,
    graded: s.graded === true,
    passed: st?.passed === true || result?.status === "pass",
    code: codeOf(c, s),
    lastResult: result,
    rung: (st?.rung ?? 0) as HintRung,
    attempts: st?.attempts ?? 0,
    splitPart: c.splitPart,
  };
}
