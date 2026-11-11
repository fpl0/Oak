// The drill machine (XState 5): one set of freshly generated trials from start to summary.
//
//   loading → trial.presenting → trial.answering ⇄ trial.replaying → feedback (⇄ auditioning)
//           → [sung resolution] → next trial … → finishing → summary
//
// Side effects are actors the runtime provides (`drillActors` in runtime.ts); the machine itself only decides.
// `start` resolves the server's drill session and the trial source (a resumed set keeps its session and its
// recorded trials); `present` plays a trial and, for tap and sing trials, captures the response; `audition`
// plays "hear it again / hear the answer / compare"; `resolve` runs an FET trial's sung resolution; `finish`
// posts every trial record (idempotent upserts) and finishes the set. Grading is synchronous and pure
// (`@oak/drills` through `deps.grade`), so the unit tests drive the whole flow with fakes.
import type { Answer, DrillFinish, DrillSession, DrillTrialRecord, FamilyId, Trial } from "@oak/api";
import type { DrillTrialResult, TrialResponse } from "@oak/drills";
import type { PitchFrame } from "@oak/pitch";
import { assign, fromCallback, fromPromise, setup } from "xstate";
import type { SungSummary } from "../answers/types.ts";
import { type PlannedTrial, revealedResult, skippedResult, type TrialOutcome, trialRecord } from "./model.ts";

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

export interface DrillDeps {
  grade(trial: Trial, response: TrialResponse): DrillTrialResult;
  /** An FET trial's sung resolution (feeds `fam.deg.resolve`; never the identification credit). */
  gradeResolution(trial: Trial, frames: PitchFrame[]): { credit: number; sung: SungSummary[] };
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
  quiet: boolean;
  resume: ResumeState | null;
  deps: DrillDeps;
}

export type Stage = "cue" | "count-in" | "listen" | "respond" | "sing" | "resolution" | null;
export type Audition = "again" | "answer" | "compare" | "cue";

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
  | { type: "AUDITION"; what: Audition }
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
  micError: string | null;
  audition: Audition | null;
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
}
export interface ResolveInput {
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
  };
  const record = trialRecord(
    cur.trial,
    ctx.index,
    { result, answer: ctx.captured.answer },
    { taps: ctx.captured.taps, sung, at: ctx.deps.iso() },
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

export const drillMachine = setup({
  types: {
    context: {} as DrillContext,
    events: {} as DrillEvent,
    input: {} as DrillInput,
  },
  actors: {
    start: fromPromise<
      { session: DrillSession; source: TrialSource },
      { input: DrillContext["input"]; resume: ResumeState | null }
    >(async () => {
      throw new Error("drill actors not provided");
    }),
    present: fromCallback<DrillEvent, PresentInput>(() => () => {}),
    audition: fromCallback<DrillEvent, AuditionInput>(() => () => {}),
    resolve: fromCallback<DrillEvent, ResolveInput>(() => () => {}),
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
      const response: TrialResponse = {
        ...(event.answer ? { answer: event.answer } : {}),
        rtMs: rtOf(context),
        replays: context.replays,
      };
      const result = context.deps.grade(trial, response);
      const captured = { ...context.captured, answer: event.answer };
      return { captured, ...outcomeFrom({ ...context, captured }, result, false, null) };
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
    capturesResponse: ({ context }) => capturesResponse(context.current?.trial),
    sing: ({ context }) => isSing(context.current?.trial),
    needsResolution: ({ context }) =>
      context.current?.trial.params.sungResolution === true &&
      context.outcomes[context.index]?.revealed !== true &&
      context.outcomes[context.index]?.result.skipped !== true,
    hasMore: ({ context }) => context.source !== null && context.index + 1 < context.source.total,
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
      micError: null,
      audition: null,
      finish: null,
      error: null,
    };
  },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        src: "start",
        input: ({ context }) => ({ input: context.input, resume: context.resume }),
        onDone: {
          target: "routing",
          actions: assign(({ context, event }) => {
            // Regenerate the trials already answered so the summary can fold them.
            const trials: Trial[] = [];
            for (let i = 0; i < Math.min(context.index, event.output.source.total); i++)
              trials[i] = event.output.source.at(i, context.outcomes.slice(0, i)).trial;
            return { session: event.output.session, source: event.output.source, trials, error: null };
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
            micError: null,
            audition: null,
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
              guard: ({ context }) => !capturesResponse(context.current?.trial),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
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
              guard: ({ context }) => !capturesResponse(context.current?.trial),
              target: "#drill.feedback",
              actions: "gradeAnswer",
            },
            REVEAL: { target: "#drill.feedback", actions: "gradeRevealed" },
            REPLAY: {
              target: "presenting",
              reenter: true,
              actions: assign({ replays: ({ context }) => context.replays + 1, micError: null }),
            },
            CUE: { guard: ({ context }) => !capturesResponse(context.current?.trial), target: "cueing" },
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
            SUBMIT: { target: "#drill.feedback", actions: "gradeAnswer" },
            REVEAL: { target: "#drill.feedback", actions: "gradeRevealed" },
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
      initial: "idle",
      states: {
        idle: {
          on: {
            AUDITION: { target: "auditioning", actions: assign({ audition: ({ event }) => event.what }) },
          },
        },
        auditioning: {
          invoke: {
            src: "audition",
            input: ({ context }) => ({
              trial: (context.current as PlannedTrial).trial,
              what: context.audition ?? "again",
              captured: context.captured,
            }),
          },
          on: {
            AUDITION_DONE: { target: "idle", actions: assign({ audition: null }) },
            AUDITION: {
              target: "auditioning",
              reenter: true,
              actions: assign({ audition: ({ event }) => event.what }),
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
                const outcomes = [...context.outcomes];
                const prev = outcomes[context.index] as TrialOutcome;
                outcomes[context.index] = { ...prev, sung: graded.sung, resolutionCredit: graded.credit };
                const records = [...context.records];
                const rec = records[context.index] as DrillTrialRecord;
                records[context.index] = { ...rec, response: { ...rec.response, sung: graded.sung } };
                return { outcomes, records, stage: null };
              }),
            },
            PRESENTED: { target: "done", actions: assign({ stage: null }) },
            MIC_ERROR: {
              target: "done",
              actions: assign({ micError: ({ event }) => event.message, stage: null }),
            },
            SKIP_SUNG: { target: "done", actions: assign({ stage: null }) },
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
