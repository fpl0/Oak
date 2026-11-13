// Tool executors. One session per turn, shared by both backends: the API backend calls `execute`
// for each tool_use block, the CLI backend calls it from its MCP endpoint.
//
// What makes the results safe for any backend:
//  - the redaction level comes from `ProgressPort.stepState` (server state) at the moment of the
//    call. The tool inputs have no rung field, and nothing the model sends can raise the level;
//  - code that arrives through the model is held to the strict lint before it is evaluated;
//  - a lint or evaluation failure is data (`ok: false`); `isError` is for calls that could not be
//    understood at all (unknown tool, invalid input) or that broke.

import { answerForms } from "../answer-guard.ts";
import type { StepSource } from "../domain.ts";
import { lintStrict } from "../lint/strict.ts";
import type { TutorPorts } from "../ports.ts";
import { compareView, disclosureLevel, findLeaks, leakMarkers, lessonContextView } from "../redaction.ts";
import type { ReviewValue } from "../reviews.ts";
import type { Emit, ExecuteTool, ToolCall, ToolResult, TurnContext } from "../types.ts";
import { reviewKindOf } from "../types.ts";
import { isToolName, type ToolName } from "./defs.ts";
import { proposeCode } from "./propose.ts";
import { acceptReview } from "./review-submit.ts";
import { clampBars, clampFromBar, inputProblems, type ToolInput, ToolSchemas } from "./schemas.ts";
import { evalView, lintFailure, progressView } from "./views.ts";

/** One submission and one resubmission (contracts §10.6). */
export const MAX_REVIEW_SUBMITS = 2;
/**
 * Tool calls one turn may make, on either backend. A model message may hold any number of calls,
 * and every `compare_haps` against an exercise is one more look at what the checker knows.
 */
export const MAX_TOOL_CALLS_PER_TURN = 24;
const WITHHELD = "the comparison could not be run";

export interface ToolSessionDeps {
  ctx: TurnContext;
  ports: Pick<TutorPorts, "grader" | "lessons" | "progress" | "conversations">;
  emit: Emit;
}

export interface ToolSession {
  execute: ExecuteTool;
  /** A backend that announces a tool call early (API: on content_block_start) reports it here, so `tool_start` is emitted once. */
  markStarted(toolUseId: string): void;
  readonly cardIds: readonly string[];
  /** The review accepted in this turn, if any. */
  readonly review: ReviewValue | undefined;
  readonly reviewSubmits: number;
}

interface Outcome {
  payload: unknown;
  /** False marks the tool result `is_error`. */
  ok: boolean;
  /** For the `tool_result` event shown in the panel. Never carries content. */
  summary: string;
}

const data = (payload: unknown, summary: string): Outcome => ({ payload, ok: true, summary });
const fail = (code: string, summary: string, extra: Record<string, unknown> = {}): Outcome => ({
  payload: { error: code, ...extra },
  ok: false,
  summary,
});

export function createToolSession(deps: ToolSessionDeps): ToolSession {
  const { ctx, ports, emit } = deps;
  const started = new Set<string>();
  let calls = 0;
  const cardIds: string[] = [];
  let review: ReviewValue | undefined;
  let reviewSubmits = 0;

  async function evaluateStrudel(
    input: ToolInput<"evaluate_strudel">,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const lint = lintStrict(input.code);
    if (lint.length > 0) return data(lintFailure(lint), "rejected by the strict lint");
    const run = await ports.grader.evaluate(
      {
        code: input.code,
        fromBar: clampFromBar(input.from_bar),
        bars: clampBars(input.bars),
        key: input.key,
        origin: "tutor",
      },
      signal,
    );
    const view = evalView(run);
    const events = view.tracks.reduce((n, t) => n + t.total_events, 0);
    return data(view, run.ok ? `${events} events` : "did not run");
  }

  async function compareHaps(input: ToolInput<"compare_haps">, signal: AbortSignal): Promise<Outcome> {
    const noResult = (kind: string, message: string) =>
      data({ ok: false, error: { kind, message, line: null } }, message);

    // `null`, or the editor's code passed back verbatim, is the learner's own typing. Anything
    // else came from the model and gets the strict profile.
    const fromEditor = input.learner_code === null || input.learner_code === ctx.learnerCode;
    const learnerCode = input.learner_code ?? ctx.learnerCode;
    if (learnerCode === null) return noResult("no-code", "there is no code in the learner's editor");
    if (!fromEditor) {
      const lint = lintStrict(learnerCode);
      if (lint.length > 0) return data(lintFailure(lint), "rejected by the strict lint");
    }

    let level = ctx.disclosure;
    let targetStep: StepSource | null = null;
    let target: { kind: "exercise"; ref: string } | { kind: "code"; code: string };
    if (input.target.kind === "code") {
      if (input.target.ref !== ctx.learnerCode) {
        const lint = lintStrict(input.target.ref);
        if (lint.length > 0) return data(lintFailure(lint), "rejected by the strict lint");
      }
      target = { kind: "code", code: input.target.ref };
    } else {
      const unknown = () => noResult("unknown-exercise", "no such exercise");
      const at = await ports.lessons.resolveExercise(input.target.ref);
      if (at === null) return unknown();
      // An exercise whose step the content port withholds (a checkpoint item, the current drill
      // trial) has no ladder the tutor may read: it is not comparable at all (contracts §10.4).
      targetStep = await ports.lessons.step(at.lessonId, at.stepId);
      if (targetStep === null) return unknown();
      // The level of THAT exercise's step, read now from server state.
      level = disclosureLevel(await ports.progress.stepState(at.lessonId, at.stepId));
      target = { kind: "exercise", ref: input.target.ref };
    }

    const res = await ports.grader.compare(
      {
        learnerCode,
        learnerOrigin: fromEditor ? "learner" : "tutor",
        target,
        fromBar: clampFromBar(input.from_bar),
        bars: clampBars(input.bars),
        mode: input.mode,
      },
      signal,
    );
    if (!res.ok) {
      // A failure is about the learner's code, but the grader ran the reference too: if its
      // message quotes the reference below the level that allows it, the message is withheld.
      const quoted = targetStep !== null && findLeaks(res.error.message, leakMarkers(targetStep), level);
      const error = quoted && quoted.length > 0 ? { ...res.error, message: WITHHELD } : res.error;
      return data({ ok: false, error }, "did not run");
    }
    const view = compareView(res.grade, level, input.target.kind, targetStep ? answerForms(targetStep) : []);
    return data({ ok: true, error: null, ...view }, `${view.status}, score ${view.score.toFixed(2)}`);
  }

  async function getLessonContext(input: ToolInput<"get_lesson_context">): Promise<Outcome> {
    const lesson = await ports.lessons.lesson(input.lesson_id);
    if (lesson === null) return fail("UNKNOWN_LESSON", "unknown lesson");
    if (input.step_id === null) return data(lessonContextView(lesson, null, null, 0), `lesson ${lesson.id}`);
    const step = await ports.lessons.step(input.lesson_id, input.step_id);
    if (step === null) return fail("UNKNOWN_STEP", "unknown step");
    const state = await ports.progress.stepState(step.lessonId, step.id);
    const level = disclosureLevel(state);
    return data(lessonContextView(lesson, step, state, level), `step ${step.id} at rung ${state.rung}`);
  }

  async function submitReview(name: ToolName, input: unknown, signal: AbortSignal): Promise<Outcome> {
    const refused = (problem: string) =>
      data({ accepted: false, problems: [problem] }, "review not accepted");
    const wanted = reviewKindOf(ctx.kind);
    if (ctx.lane !== "review" || wanted === null)
      return refused("reviews can only be submitted in a review conversation");
    if (name !== `submit_${wanted}_review`)
      return refused(`this is a ${wanted} review: use submit_${wanted}_review`);
    if (ctx.review === null) return refused("there is nothing to review");
    if (review !== undefined) return refused("a review has already been accepted");
    if (reviewSubmits >= MAX_REVIEW_SUBMITS) return refused("no resubmissions left");
    reviewSubmits++;
    const rules = { revisions: ctx.review.revisions, totalBars: ctx.review.totalBars };
    const check = await acceptReview(wanted, input, rules, ports.grader, signal);
    if (!check.ok) return data({ accepted: false, problems: check.problems }, "review not accepted");
    review = check.value;
    emit({ type: "review", data: { reviewKind: wanted, review: check.value } });
    return data({ accepted: true, problems: [] }, "review accepted");
  }

  async function run(call: ToolCall, signal: AbortSignal): Promise<Outcome> {
    if (!isToolName(call.name)) return fail("UNKNOWN_TOOL", "unknown tool");
    const parsed = ToolSchemas[call.name].safeParse(call.input);
    if (!parsed.success)
      return fail("INVALID_JSON", "invalid input", { issues: inputProblems(parsed.error) });
    switch (call.name) {
      case "evaluate_strudel":
        return evaluateStrudel(parsed.data as ToolInput<"evaluate_strudel">, signal);
      case "compare_haps":
        return compareHaps(parsed.data as ToolInput<"compare_haps">, signal);
      case "get_learner_progress":
        return data(progressView(await ports.progress.snapshot()), "progress");
      case "get_lesson_context":
        return getLessonContext(parsed.data as ToolInput<"get_lesson_context">);
      case "propose_code": {
        const out = await proposeCode(
          call.id,
          parsed.data as ToolInput<"propose_code">,
          { ctx, grader: ports.grader, conversations: ports.conversations, cardsShown: cardIds.length },
          signal,
        );
        if (out.card !== null) {
          cardIds.push(out.card.cardId);
          emit({ type: "card", data: out.card });
        }
        return data(out.result, out.card ? "card shown" : "card rejected");
      }
      case "submit_capstone_review":
      case "submit_transcription_review":
        return submitReview(call.name, parsed.data, signal);
    }
  }

  const execute: ExecuteTool = async (call, signal): Promise<ToolResult> => {
    if (!started.has(call.id)) {
      started.add(call.id);
      emit({ type: "tool_start", data: { toolUseId: call.id, name: call.name } });
    }
    let outcome: Outcome;
    try {
      if (signal.aborted) outcome = fail("ABORTED", "stopped");
      else if (++calls > MAX_TOOL_CALLS_PER_TURN) outcome = fail("TOOL_LIMIT", "too many tool calls");
      else outcome = await run(call, signal);
    } catch {
      // The cause stays on the server: an adapter's error text is not written for a model to read.
      outcome = fail("TOOL_FAILED", "tool failed");
    }
    emit({
      type: "tool_result",
      data: { toolUseId: call.id, name: call.name, ok: outcome.ok, summary: outcome.summary },
    });
    return { content: JSON.stringify(outcome.payload), isError: !outcome.ok };
  };

  return {
    execute,
    markStarted: (id) => void started.add(id),
    get cardIds() {
      return cardIds;
    },
    get review() {
      return review;
    },
    get reviewSubmits() {
      return reviewSubmits;
    },
  };
}
