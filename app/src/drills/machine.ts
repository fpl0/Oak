// The drill machine (XState 5): one set of freshly generated trials from start to summary.
//
//   loading → trial.presenting → trial.answering ⇄ trial.replaying → feedback (⇄ auditioning)
//           → [sung resolution] → next trial … → finishing → summary
//
// Wave 4 (stage D): a staged trial (chord dictation) is answered step by step inside `answering` — the bass,
// then the quality, then the numerals (`STEP_CHECK` checks the open step, which opens the next one when it
// passes; `STEP_REVEAL` shows it, counted as help); the numerals are the trial's own answer (`SUBMIT`). A
// trial with a sung part (the bass line of a bass-degree trial) may be sung before it is picked
// (`SING_PART` → `trial.singingPart`, never in Quiet mode): the sung notes prefill the pad and are recorded
// note by note; the pick is what is graded.
//
// Side effects are actors the runtime provides (`drillActors` in runtime.ts); the machine itself only decides.
// `start` resolves the server's drill session and the trial source (a resumed set keeps its session and its
// recorded trials); `present` plays a trial and, for tap and sing trials, captures the response; `audition`
// plays "hear it again / hear the answer / compare"; `resolve` runs an FET trial's sung resolution; `finish`
// posts every trial record (idempotent upserts) and finishes the set. Grading is synchronous and pure
// (`@oak/drills` through `deps.grade`), so the unit tests drive the whole flow with fakes.
import type {
  Answer,
  Degree,
  DrillFinish,
  DrillSession,
  DrillTrialRecord,
  FamilyId,
  SungResolution,
  Trial,
} from "@oak/api";
import type { DrillTrialResult, TrialResponse } from "@oak/drills";
import type { PitchFrame } from "@oak/pitch";
import { assign, fromCallback, fromPromise, setup } from "xstate";
import type { SungSummary } from "../answers/types.ts";
import { bassAloneWhileAnswering } from "./harmony.ts";
import {
  type Modality,
  type PlannedTrial,
  revealedResult,
  skippedResult,
  sungResolutionOf,
  type TrialOutcome,
  trialRecord,
} from "./model.ts";
import { isFetTrial, resolutionOf, resolutionPath } from "./plans.ts";

/** Where the trials of a set come from. A free-practice source adapts the level after every answer. */
export interface TrialSource {
  /** Trials in this set. */
  total: number;
  /** The trial at `index`, given the outcomes so far. Deterministic for a given (session, index, outcomes). */
  at(index: number, outcomes: readonly TrialOutcome[]): PlannedTrial;
}

export interface ResumeState {
  session: DrillSession;
  outcomes: TrialOutcome[];
  records: DrillTrialRecord[];
}

/**
 * One step of a staged trial (chord dictation: the bass, the quality, then the numerals; a bass-line dictation:
 * the roots, then the line).
 */
export type TrialStep = "bass" | "quality" | "rn" | "line";
export interface StepRecord {
  answer: Answer | null;
  credit: number;
  passed: boolean;
  marks: boolean[];
  /** Shown instead of found ("Show the bass"): help, like a replay beyond the limit. */
  revealed: boolean;
  tries: number;
}
export interface StepsState {
  order: TrialStep[];
  /** Index of the open step. */
  at: number;
  results: Partial<Record<TrialStep, StepRecord>>;
}
/** A sung part taken before the pick: the notes, one per target, and the degrees they were heard as. */
export interface SungPart {
  notes: SungSummary[];
  degrees: (Degree | null)[];
  skipped: boolean;
}

export interface DrillDeps {
  grade(trial: Trial, response: TrialResponse): DrillTrialResult;
  /** The steps of a staged trial in order, or null for a trial with one answer (default: none). */
  stepsOf?(trial: Trial): TrialStep[] | null;
  /** One step checked on its own (pass mark 0.8). */
  gradeStep?(
    trial: Trial,
    step: TrialStep,
    answer: Answer,
  ): { credit: number; passed: boolean; marks: boolean[] };
  /** Whether a trial has a part that may be sung before it is picked (default: none). */
  hasSungPart?(trial: Trial): boolean;
  /** The sung part graded note by note (contracts §8.1) and read as degrees. */
  gradeSungPart?(trial: Trial, frames: PitchFrame[]): { notes: SungSummary[]; degrees: (Degree | null)[] };
  /** An FET trial's sung resolution (feeds `fam.deg.resolve`; never the identification credit). */
  gradeResolution(
    trial: Trial,
    frames: PitchFrame[],
  ): { credit: number; passed: boolean; sung: SungSummary[] };
  /** A sing trial's per-note summary for the record (never audio). */
  sungOf(trial: Trial, frames: PitchFrame[]): SungSummary[];
  now(): number;
  iso(): string;
}

export type DrillPurpose = DrillSession["purpose"];

export interface DrillInput {
  purpose: DrillPurpose;
  familyIds: FamilyId[];
  warmupItemId: string | null;
  sessionId: string | null;
  /** Quiet mode as `voice.get` reports it (the runner never decides it itself, wave3.md §5.3). */
  quiet: boolean;
  /** The sing tolerance of the ladder (contracts §8.2), recorded with each sung resolution. */
  tolCents: number;
  resume: ResumeState | null;
  deps: DrillDeps;
}

export type Stage = "cue" | "count-in" | "listen" | "respond" | "sing" | "resolution" | null;
/** After the answer: again, the answer, yours then it, the key, the way home; and for chords the bass alone,
 * the chords broken (arpeggiated), and the passage in its key. Wave 5: the thing alone (the note, the hats, the
 * bass with the kick, the tune), the other version (the other feel, the chord without its seventh), the scale, and
 * one part of the passage (`part`: a section, a bar). */
export type Audition =
  | "again"
  | "answer"
  | "compare"
  | "cue"
  | "resolve"
  | "bass"
  | "arpeggio"
  | "context"
  | "alone"
  | "other"
  | "scale"
  | "part";

export type DrillEvent =
  | { type: "PRESENTED" }
  | { type: "STAGE"; stage: Stage; startedAt?: number }
  | { type: "CAPTURED"; taps?: number[]; frames?: PitchFrame[] }
  | { type: "MIC_ERROR"; message: string }
  | { type: "CHANGE" }
  | { type: "SUBMIT"; answer: Answer | null }
  | { type: "REVEAL" }
  | { type: "REPLAY" }
  | { type: "CUE" }
  | { type: "SKIP_SUNG" }
  /** Quiet mode: the learner heard the way home in their head (Space). */
  | { type: "HEARD" }
  /**
   * Quiet mode changed while the set runs (the mic chip, Settings): later trials follow it; a way home being
   * sung right now stops listening at once (it counts as skipped in Quiet mode — the mic never stays open).
   */
  | { type: "QUIET"; quiet: boolean }
  /** A dictation A/B or bar replay while answering: counts as a replay, no state change. */
  | { type: "LISTENED" }
  /** A staged trial: check the open step (not the last one, which is `SUBMIT`). */
  | { type: "STEP_CHECK"; answer: Answer }
  /** A staged trial: show the open step's answer and go on (counted as help). */
  | { type: "STEP_REVEAL" }
  /** Sing the part before picking it (the bass line); never in Quiet mode. */
  | { type: "SING_PART" }
  | { type: "AUDITION"; what: Audition; part?: number }
  /** While answering a bass trial or a staged bass step: the bass line by itself (counts as a replay). */
  | { type: "BASS_ALONE" }
  | { type: "AUDITION_DONE" }
  | { type: "NEXT" }
  | { type: "RETRY" };

export interface DrillContext {
  input: Omit<DrillInput, "resume" | "deps">;
  deps: DrillDeps;
  resume: ResumeState | null;
  session: DrillSession | null;
  source: TrialSource | null;
  index: number;
  current: PlannedTrial | null;
  /** Every generated trial so far, by index (summaries need them). */
  trials: Trial[];
  outcomes: TrialOutcome[];
  records: DrillTrialRecord[];
  replays: number;
  answerAt: number | null;
  stage: Stage;
  stageAt: number | null;
  /** Taps or frames of the current trial (compare plays them back). */
  captured: { taps: number[] | null; frames: PitchFrame[] | null; answer: Answer | null };
  /** A staged trial's steps (null: one answer). */
  steps: StepsState | null;
  /** The part sung before the pick (null: none sung). */
  sungPart: SungPart | null;
  micError: string | null;
  audition: Audition | null;
  /** The section or bar an `audition: "part"` plays (0-based section, 1-based bar). */
  auditionPart: number | null;
  finish: DrillFinish | null;
  error: string | null;
}

export interface PresentInput {
  trial: Trial;
  mode: "first" | "replay" | "cue";
  quiet: boolean;
}
export interface AuditionInput {
  trial: Trial;
  what: Audition;
  captured: DrillContext["captured"];
  part?: number | null;
}
export interface ResolveInput {
  trial: Trial;
  quiet: boolean;
}
export interface SingPartInput {
  trial: Trial;
  quiet: boolean;
}
export interface FinishInput {
  session: DrillSession;
  records: DrillTrialRecord[];
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isTap = (t: Trial | undefined): boolean => t?.params.mode === "tap";
const isSing = (t: Trial | undefined): boolean => t?.params.mode === "sing";
const capturesResponse = (t: Trial | undefined): boolean => isTap(t) || isSing(t);

function outcomeFrom(
  ctx: DrillContext,
  result: DrillTrialResult,
  revealed: boolean,
  sung: SungSummary[] | null,
): Pick<DrillContext, "outcomes" | "records"> {
  const cur = ctx.current as PlannedTrial;
  const outcome: TrialOutcome = {
    index: ctx.index,
    familyId: cur.trial.family,
    result,
    revealed,
    sung,
    resolutionCredit: null,
    sungResolution: null,
  };
  const record = trialRecord(
    cur.trial,
    ctx.index,
    { result, answer: ctx.captured.answer },
    { taps: ctx.captured.taps, sung, at: ctx.deps.iso(), revealed },
  );
  const outcomes = [...ctx.outcomes];
  outcomes[ctx.index] = outcome;
  const records = [...ctx.records];
  records[ctx.index] = record;
  return { outcomes, records };
}

function rtOf(ctx: DrillContext): number {
  return ctx.answerAt === null ? 0 : Math.max(0, ctx.deps.now() - ctx.answerAt);
}

/** The steps of a trial as the machine starts it (null: a trial with one answer). */
export function initialSteps(deps: DrillDeps, trial: Trial): StepsState | null {
  const order = deps.stepsOf?.(trial) ?? null;
  return order && order.length > 1 ? { order, at: 0, results: {} } : null;
}

/** Whether the open step of a staged trial is one checked on its own (every step but the last). */
export const onInnerStep = (steps: StepsState | null): boolean =>
  steps !== null && steps.at < steps.order.length - 1;

/** A step shown instead of found counts as help, like a replay past the limit (exercises §4.2 item 5). */
export function replaysWithHelp(replays: number, limit: number, shownSteps: number): number {
  return shownSteps <= 0 ? replays : Math.max(replays, Math.max(0, limit) + shownSteps);
}

/** The staged answers so far, as `Answer.stages` (one list per step, one entry per chord). */
export function stagesAnswer(steps: StepsState, last: Answer | null): NonNullable<Answer["stages"]> {
  const out: NonNullable<Answer["stages"]> = {};
  const listOf = (step: TrialStep, a: Answer | null | undefined): string[] =>
    ((step === "bass" ? a?.degrees : step === "quality" ? a?.qualities : a?.rn) ?? []).map(String);
  for (const step of steps.order) {
    // The written line is the answer itself (`answer.text`), not a dictation stage.
    if (step === "line") continue;
    const a = step === steps.order[steps.order.length - 1] ? last : steps.results[step]?.answer;
    out[step] = listOf(step, a);
  }
  return out;
}

/** Folds the taken resolution into the current outcome and record (identification credit unchanged). */
function withResolution(
  ctx: DrillContext,
  taken: Parameters<typeof sungResolutionOf>[2],
  modality: Modality,
): Pick<DrillContext, "outcomes" | "records"> {
  const trial = (ctx.current as PlannedTrial).trial;
  const sr: SungResolution | null = sungResolutionOf(
    resolutionPath(trial),
    resolutionOf(trial).playFirst,
    taken,
    ctx.input.tolCents,
  );
  const outcomes = [...ctx.outcomes];
  const prev = outcomes[ctx.index] as TrialOutcome;
  const sung = taken.kind === "sung" ? taken.notes : prev.sung;
  outcomes[ctx.index] = {
    ...prev,
    sung,
    resolutionCredit: taken.kind === "sung" ? taken.credit : null,
    sungResolution: sr,
  };
  const records = [...ctx.records];
  const rec = records[ctx.index] as DrillTrialRecord;
  records[ctx.index] = { ...rec, modality, sungResolution: sr };
  return { outcomes, records };
}

/** The feedback's automatic listen-back on an FET trial (ux §4.2): right → it walks home; wrong → yours vs it. */
function autoAudition(ctx: DrillContext): Audition | null {
  const trial = ctx.current?.trial;
  const outcome = ctx.outcomes[ctx.index];
  if (!trial || !outcome || !isFetTrial(trial) || outcome.result.skipped) return null;
  // A sung resolution comes next: from level 3 the learner sings before hearing the path (audiation).
  if (trial.params.sungResolution === true && !outcome.revealed) return null;
  const got = ctx.captured.answer?.degrees;
  if (!outcome.result.correct && !outcome.revealed && got && got.length === 1) return "compare";
  return "resolve";
}

export const drillMachine = setup({
  types: {
    context: {} as DrillContext,
    events: {} as DrillEvent,
    input: {} as DrillInput,
  },
  actors: {
    start: fromPromise<
      { session: DrillSession; source: TrialSource; resumed?: Omit<ResumeState, "session"> },
      { input: DrillContext["input"]; resume: ResumeState | null }
    >(async () => {
      throw new Error("drill actors not provided");
    }),
    present: fromCallback<DrillEvent, PresentInput>(() => () => {}),
    audition: fromCallback<DrillEvent, AuditionInput>(() => () => {}),
    resolve: fromCallback<DrillEvent, ResolveInput>(() => () => {}),
    singPart: fromCallback<DrillEvent, SingPartInput>(() => () => {}),
    finish: fromPromise<DrillFinish | null, FinishInput>(async () => null),
  },
  actions: {
    /** Saves the set in flight (resume after reload). Provided by the runtime. */
    persist: (_: unknown, _params: { ctx: DrillContext }) => {},
    /** Best-effort send of one trial record; `finish` re-sends everything (upserts). Provided by the runtime. */
    send: (_: unknown, _params: { session: DrillSession; record: DrillTrialRecord }) => {},
    /** The set ended (summary shown): clears the saved state. Provided by the runtime. */
    done: (_: unknown, _params: { ctx: DrillContext }) => {},
    gradeAnswer: assign(({ context, event }) => {
      if (event.type !== "SUBMIT") return {};
      const trial = (context.current as PlannedTrial).trial;
      const steps = context.steps;
      // A staged trial is graded on its last step (the numerals); the earlier steps travel with it in
      // `answer.stages`, and a step that was shown counts as help.
      const answer =
        steps && event.answer ? { ...event.answer, stages: stagesAnswer(steps, event.answer) } : event.answer;
      const shown = steps ? steps.order.filter((s) => steps.results[s]?.revealed === true).length : 0;
      const response: TrialResponse = {
        ...(answer ? { answer } : {}),
        rtMs: rtOf(context),
        replays: replaysWithHelp(context.replays, trial.cue.replays, shown),
      };
      const result = context.deps.grade(trial, response);
      const captured = { ...context.captured, answer };
      const sung = context.sungPart && !context.sungPart.skipped ? context.sungPart.notes : null;
      return { captured, ...outcomeFrom({ ...context, captured }, result, false, sung) };
    }),
    checkStep: assign(({ context, event }) => {
      if (event.type !== "STEP_CHECK" || !context.steps) return {};
      const trial = (context.current as PlannedTrial).trial;
      const steps = context.steps;
      const step = steps.order[steps.at] as TrialStep;
      const graded = context.deps.gradeStep?.(trial, step, event.answer) ?? {
        credit: 0,
        passed: false,
        marks: [],
      };
      const prev = steps.results[step];
      const record: StepRecord = {
        answer: event.answer,
        ...graded,
        revealed: false,
        tries: (prev?.tries ?? 0) + 1,
      };
      return {
        steps: {
          ...steps,
          at: graded.passed ? steps.at + 1 : steps.at,
          results: { ...steps.results, [step]: record },
        },
      };
    }),
    revealStep: assign(({ context }) => {
      if (!context.steps) return {};
      const steps = context.steps;
      const step = steps.order[steps.at] as TrialStep;
      const prev = steps.results[step];
      const record: StepRecord = {
        answer: prev?.answer ?? null,
        credit: 0,
        passed: false,
        marks: prev?.marks ?? [],
        revealed: true,
        tries: prev?.tries ?? 0,
      };
      return { steps: { ...steps, at: steps.at + 1, results: { ...steps.results, [step]: record } } };
    }),
    gradeCaptured: assign(({ context, event }) => {
      if (event.type !== "CAPTURED") return {};
      const trial = (context.current as PlannedTrial).trial;
      const response: TrialResponse = {
        ...(event.taps ? { taps: event.taps } : {}),
        ...(event.frames ? { frames: event.frames } : {}),
        rtMs: rtOf(context),
        replays: context.replays,
      };
      const result = context.deps.grade(trial, response);
      const sung = event.frames ? context.deps.sungOf(trial, event.frames) : null;
      const captured = { taps: event.taps ?? null, frames: event.frames ?? null, answer: null };
      return { captured, ...outcomeFrom({ ...context, captured }, result, false, sung) };
    }),
    gradeRevealed: assign(({ context }) =>
      outcomeFrom(context, revealedResult(rtOf(context), context.replays), true, null),
    ),
    gradeSkipped: assign(({ context }) =>
      outcomeFrom(context, skippedResult(rtOf(context), context.replays), false, null),
    ),
  },
  guards: {
    bassAlone: ({ context }) =>
      context.current !== null &&
      bassAloneWhileAnswering(
        context.current.trial,
        context.steps ? (context.steps.order[context.steps.at] ?? null) : null,
      ),
    capturesResponse: ({ context }) => capturesResponse(context.current?.trial),
    sing: ({ context }) => isSing(context.current?.trial),
    needsResolution: ({ context }) =>
      context.current?.trial.params.sungResolution === true &&
      context.outcomes[context.index]?.revealed !== true &&
      context.outcomes[context.index]?.result.skipped !== true,
    hasMore: ({ context }) => context.source !== null && context.index + 1 < context.source.total,
    innerStep: ({ context }) => onInnerStep(context.steps),
    canSingPart: ({ context }) =>
      !context.input.quiet &&
      context.current !== null &&
      context.deps.hasSungPart?.(context.current.trial) === true,
    resumedComplete: ({ context }) => context.source !== null && context.index >= context.source.total,
  },
}).createMachine({
  id: "drill",
  context: ({ input }) => {
    const { resume, deps, ...rest } = input;
    return {
      input: rest,
      deps,
      resume,
      session: null,
      source: null,
      index: resume?.outcomes.length ?? 0,
      current: null,
      trials: [],
      outcomes: resume?.outcomes ?? [],
      records: resume?.records ?? [],
      replays: 0,
      answerAt: null,
      stage: null,
      stageAt: null,
      captured: { taps: null, frames: null, answer: null },
      steps: null,
      sungPart: null,
      micError: null,
      audition: null,
      auditionPart: null,
      finish: null,
      error: null,
    };
  },
  initial: "loading",
  on: {
    QUIET: {
      actions: assign({ input: ({ context, event }) => ({ ...context.input, quiet: event.quiet }) }),
    },
  },
  states: {
    loading: {
      invoke: {
        src: "start",
        input: ({ context }) => ({ input: context.input, resume: context.resume }),
        onDone: {
          target: "routing",
          actions: assign(({ context, event }) => {
            // The server handed back a set already open for this warm-up item (another browser started it):
            // continue from its trials.
            const resumed = event.output.resumed;
            const outcomes = resumed ? resumed.outcomes : context.outcomes;
            const index = resumed ? resumed.outcomes.length : context.index;
            // Regenerate the trials already answered so the summary can fold them.
            const trials: Trial[] = [];
            for (let i = 0; i < Math.min(index, event.output.source.total); i++)
              trials[i] = event.output.source.at(i, outcomes.slice(0, i)).trial;
            return {
              session: event.output.session,
              source: event.output.source,
              trials,
              error: null,
              ...(resumed ? { index, outcomes, records: resumed.records } : {}),
            };
          }),
        },
        onError: {
          target: "failed",
          actions: assign({ error: ({ event }) => message(event.error) }),
        },
      },
    },
    failed: {
      on: { RETRY: { target: "loading" } },
    },
    routing: {
      always: [{ guard: "resumedComplete", target: "finishing" }, { target: "trial" }],
    },
    trial: {
      entry: [
        assign(({ context }) => {
          const current = (context.source as TrialSource).at(context.index, context.outcomes);
          const trials = [...context.trials];
          trials[context.index] = current.trial;
          return {
            current,
            trials,
            replays: 0,
            answerAt: null,
            stage: null,
            stageAt: null,
            captured: { taps: null, frames: null, answer: null },
            steps: initialSteps(context.deps, current.trial),
            sungPart: null,
            micError: null,
            audition: null,
            auditionPart: null,
          };
        }),
        { type: "persist", params: ({ context }) => ({ ctx: context }) },
      ],
      initial: "presenting",
      on: {
        STAGE: {
          actions: assign({
            stage: ({ event }) => event.stage,
            stageAt: ({ event }) => event.startedAt ?? null,
          }),
        },
      },
      states: {
        presenting: {
          invoke: {
            src: "present",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              mode: context.replays > 0 ? ("replay" as const) : ("first" as const),
              quiet: context.input.quiet,
            }),
          },
          on: {
            PRESENTED: { target: "answering" },
            CAPTURED: { target: "#drill.feedback", actions: "gradeCaptured" },
            MIC_ERROR: {
              target: "answering",
              actions: assign({ micError: ({ event }) => event.message }),
            },
            SUBMIT: {
              guard: ({ context }) =>
                !capturesResponse(context.current?.trial) && !onInnerStep(context.steps),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
            STEP_CHECK: { guard: "innerStep", actions: "checkStep" },
            STEP_REVEAL: { guard: "innerStep", actions: "revealStep" },
            SKIP_SUNG: { guard: "capturesResponse", target: "#drill.feedback", actions: "gradeSkipped" },
          },
        },
        answering: {
          entry: assign(({ context }) => ({
            answerAt: context.answerAt ?? context.deps.now(),
            stage: null,
          })),
          on: {
            SUBMIT: {
              guard: ({ context }) =>
                !capturesResponse(context.current?.trial) && !onInnerStep(context.steps),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
            STEP_CHECK: { guard: "innerStep", actions: "checkStep" },
            STEP_REVEAL: { guard: "innerStep", actions: "revealStep" },
            SING_PART: { guard: "canSingPart", target: "singingPart" },
            REVEAL: { target: "#drill.feedback", actions: "gradeRevealed" },
            REPLAY: {
              target: "presenting",
              reenter: true,
              actions: assign({ replays: ({ context }) => context.replays + 1, micError: null }),
            },
            CUE: { guard: ({ context }) => !capturesResponse(context.current?.trial), target: "cueing" },
            BASS_ALONE: {
              guard: "bassAlone",
              target: "bassAlone",
              actions: assign({ replays: ({ context }) => context.replays + 1 }),
            },
            LISTENED: { actions: assign({ replays: ({ context }) => context.replays + 1 }) },
            SKIP_SUNG: { guard: "capturesResponse", target: "#drill.feedback", actions: "gradeSkipped" },
          },
        },
        cueing: {
          invoke: {
            src: "present",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              mode: "cue" as const,
              quiet: context.input.quiet,
            }),
          },
          on: {
            PRESENTED: { target: "answering" },
            SUBMIT: {
              guard: ({ context }) => !onInnerStep(context.steps),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
            STEP_CHECK: { guard: "innerStep", target: "answering", actions: "checkStep" },
            STEP_REVEAL: { guard: "innerStep", target: "answering", actions: "revealStep" },
            REVEAL: { target: "#drill.feedback", actions: "gradeRevealed" },
          },
        },
        // The bass line by itself, while the pad stays answerable (as during the cadence).
        bassAlone: {
          invoke: {
            src: "audition",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              what: "bass" as const,
              captured: context.captured,
            }),
          },
          on: {
            AUDITION_DONE: { target: "answering" },
            SUBMIT: {
              guard: ({ context }) => !onInnerStep(context.steps),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
            STEP_CHECK: { guard: "innerStep", target: "answering", actions: "checkStep" },
            STEP_REVEAL: { guard: "innerStep", target: "answering", actions: "revealStep" },
            REVEAL: { target: "#drill.feedback", actions: "gradeRevealed" },
          },
        },
        // The part sung before it is picked (the bass line): the chords play without it while the learner sings.
        // The notes prefill the pad; the pick is still the learner's, and nothing here is graded as the answer.
        singingPart: {
          invoke: {
            src: "singPart",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              quiet: context.input.quiet,
            }),
          },
          on: {
            CAPTURED: {
              target: "answering",
              actions: assign(({ context, event }) => {
                const trial = (context.current as PlannedTrial).trial;
                const graded = context.deps.gradeSungPart?.(trial, event.frames ?? []) ?? {
                  notes: [],
                  degrees: [],
                };
                return { sungPart: { ...graded, skipped: false }, stage: null };
              }),
            },
            // Nothing to sing (no targets): straight back to the pad.
            PRESENTED: { target: "answering", actions: assign({ stage: null }) },
            SKIP_SUNG: {
              target: "answering",
              actions: assign({ sungPart: { notes: [], degrees: [], skipped: true }, stage: null }),
            },
            MIC_ERROR: {
              target: "answering",
              actions: assign({ micError: ({ event }) => event.message, stage: null }),
            },
            // Quiet mode switched on while singing: the mic closes at once (the actor stops), nothing counts.
            QUIET: {
              guard: ({ event }) => event.quiet,
              target: "answering",
              actions: assign({
                input: ({ context }) => ({ ...context.input, quiet: true }),
                sungPart: { notes: [], degrees: [], skipped: true },
                stage: null,
              }),
            },
          },
        },
      },
    },
    feedback: {
      entry: [
        assign({ stage: null }),
        {
          type: "send",
          params: ({ context }) => ({
            session: context.session as DrillSession,
            record: context.records[context.index] as DrillTrialRecord,
          }),
        },
        { type: "persist", params: ({ context }) => ({ ctx: { ...context, index: context.index + 1 } }) },
      ],
      initial: "auto",
      states: {
        auto: {
          always: [
            {
              guard: ({ context }) => autoAudition(context) !== null,
              target: "auditioning",
              actions: assign({ audition: ({ context }) => autoAudition(context) }),
            },
            { target: "idle" },
          ],
        },
        idle: {
          on: {
            AUDITION: {
              target: "auditioning",
              actions: assign({
                audition: ({ event }) => event.what,
                auditionPart: ({ event }) => event.part ?? null,
              }),
            },
          },
        },
        auditioning: {
          invoke: {
            src: "audition",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              what: context.audition ?? "again",
              captured: context.captured,
              part: context.auditionPart,
            }),
          },
          on: {
            AUDITION_DONE: { target: "idle", actions: assign({ audition: null, auditionPart: null }) },
            AUDITION: {
              target: "auditioning",
              reenter: true,
              actions: assign({
                audition: ({ event }) => event.what,
                auditionPart: ({ event }) => event.part ?? null,
              }),
            },
          },
        },
      },
      on: {
        NEXT: [
          { guard: "needsResolution", target: "resolution" },
          {
            guard: "hasMore",
            target: "trial",
            actions: assign({ index: ({ context }) => context.index + 1 }),
          },
          { target: "finishing", actions: assign({ index: ({ context }) => context.index + 1 }) },
        ],
      },
    },
    resolution: {
      initial: "running",
      states: {
        running: {
          invoke: {
            src: "resolve",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              quiet: context.input.quiet,
            }),
          },
          on: {
            STAGE: {
              actions: assign({
                stage: ({ event }) => event.stage,
                stageAt: ({ event }) => event.startedAt ?? null,
              }),
            },
            CAPTURED: {
              target: "done",
              actions: assign(({ context, event }) => {
                const trial = (context.current as PlannedTrial).trial;
                const graded = context.deps.gradeResolution(trial, event.frames ?? []);
                const folded = withResolution(
                  context,
                  { kind: "sung", notes: graded.sung, credit: graded.credit, passed: graded.passed },
                  "normal",
                );
                const records = [...folded.records];
                const rec = records[context.index] as DrillTrialRecord;
                records[context.index] = { ...rec, response: { ...rec.response, sung: graded.sung } };
                return { outcomes: folded.outcomes, records, stage: null };
              }),
            },
            // Quiet mode: the way home has played; now it is heard in the head, then Space.
            PRESENTED: [
              {
                guard: ({ context }) => context.input.quiet,
                target: "imagining",
                actions: assign({ stage: null }),
              },
              { target: "done", actions: assign({ stage: null }) },
            ],
            HEARD: {
              guard: ({ context }) => context.input.quiet,
              target: "done",
              actions: assign(({ context }) => ({
                ...withResolution(context, { kind: "quiet" }, "quiet"),
                stage: null,
              })),
            },
            QUIET: [
              {
                guard: ({ context, event }) => event.quiet && !context.input.quiet,
                target: "done",
                actions: assign(({ context }) => ({
                  ...withResolution(context, { kind: "skipped" }, "quiet"),
                  input: { ...context.input, quiet: true },
                  stage: null,
                })),
              },
              {
                actions: assign({
                  input: ({ context, event }) => ({ ...context.input, quiet: event.quiet }),
                }),
              },
            ],
            MIC_ERROR: {
              target: "done",
              actions: assign(({ context, event }) => ({
                ...withResolution(context, { kind: "skipped" }, "fallback"),
                micError: event.message,
                stage: null,
              })),
            },
            SKIP_SUNG: {
              target: "done",
              actions: assign(({ context }) => ({
                ...withResolution(context, { kind: "skipped" }, context.input.quiet ? "quiet" : "normal"),
                stage: null,
              })),
            },
          },
        },
        imagining: {
          on: {
            HEARD: {
              target: "done",
              actions: assign(({ context }) => withResolution(context, { kind: "quiet" }, "quiet")),
            },
            SKIP_SUNG: {
              target: "done",
              actions: assign(({ context }) => withResolution(context, { kind: "skipped" }, "quiet")),
            },
          },
        },
        done: {
          entry: [
            {
              type: "send",
              params: ({ context }) => ({
                session: context.session as DrillSession,
                record: context.records[context.index] as DrillTrialRecord,
              }),
            },
            { type: "persist", params: ({ context }) => ({ ctx: { ...context, index: context.index + 1 } }) },
          ],
          on: {
            NEXT: [
              {
                guard: "hasMore",
                target: "#drill.trial",
                actions: assign({ index: ({ context }) => context.index + 1 }),
              },
              { target: "#drill.finishing", actions: assign({ index: ({ context }) => context.index + 1 }) },
            ],
          },
        },
      },
    },
    finishing: {
      invoke: {
        src: "finish",
        input: ({ context }) => ({
          session: context.session as DrillSession,
          records: context.records.filter((r): r is DrillTrialRecord => r !== undefined),
        }),
        onDone: {
          target: "summary",
          actions: assign({ finish: ({ event }) => event.output, error: null }),
        },
        onError: {
          target: "finishFailed",
          actions: assign({ error: ({ event }) => message(event.error) }),
        },
      },
    },
    finishFailed: {
      on: { RETRY: { target: "finishing" } },
    },
    summary: {
      entry: { type: "done", params: ({ context }) => ({ ctx: context }) },
      type: "final",
    },
  },
});

export type DrillMachine = typeof drillMachine;
