// Running a prepared turn on a backend. Everything that must be the same for both backends
// happens here, around the backend call: the meta/done/error events, the HTML guard on streamed
// text, the tool session, the append-only transcript, usage rows and tutor notes.
import type { TutorErrorInfo } from "./errors.ts";
import { classifyThrown } from "./errors.ts";
import type { TutorEvent, UsageSummary } from "./events.ts";
import { escapeTags, HtmlGuard, sanitizeMarkdown } from "./markup.ts";
import type { TutorPorts } from "./ports.ts";
import type { PreparedTurn } from "./prepare.ts";
import type { ReviewValue } from "./reviews.ts";
import { checkBudget, hintSummary } from "./threads.ts";
import { TOOLS } from "./tools/defs.ts";
import { createToolSession, type ToolSession } from "./tools/execute.ts";
import {
  type BackendContinuity,
  type BackendTurn,
  type Emit,
  MODEL,
  type TurnOutcome,
  type TutorBackend,
} from "./types.ts";
import { emptyUsage } from "./usage.ts";

export interface RunOptions {
  /**
   * Forward `tool_input` deltas, so the panel can draw a card while its code streams. Off by
   * default: a draft is code that has not passed the strict lint yet, and unlinted code is not shown.
   */
  cardDrafts?: boolean;
}

export interface RunResult {
  ok: boolean;
  error: TutorErrorInfo | null;
  usage: UsageSummary;
  /** The assistant's text as stored: sanitized markdown. */
  text: string;
  cardIds: string[];
  review: ReviewValue | null;
  /** True when this turn took the month past the soft marker for the first time: show the one toast. */
  softMarkerPassed: boolean;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function frozenCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export interface Shared {
  session: ToolSession;
  input: BackendTurn;
}

export async function setUp(
  prep: PreparedTurn,
  backend: TutorBackend,
  emit: Emit,
  ports: TutorPorts,
): Promise<Shared> {
  const { ctx } = prep;
  emit({
    type: "meta",
    data: {
      conversationId: ctx.conversationId,
      kind: ctx.kind,
      lane: ctx.lane,
      backend: backend.id,
      model: MODEL,
      rung: ctx.step?.grading === "graded" ? ctx.rung : null,
      revealAllowed: ctx.revealAllowed,
    },
  });
  const session = createToolSession({ ctx, ports, emit });
  // A backend reads history, it never edits it: what it is handed is a frozen copy, so the rule
  // holds whatever the store adapter returns (its own live objects included).
  const continuity: BackendContinuity = {
    records: frozenCopy(await ports.conversations.backendRecords(ctx.conversationId, backend.id)),
    commit: (records, opts) =>
      ports.conversations.appendBackendRecords(ctx.conversationId, backend.id, records, {
        excluded: opts?.excluded === true,
      }),
  };
  const input: BackendTurn = {
    conversationId: ctx.conversationId,
    kind: ctx.kind,
    lane: ctx.lane,
    model: MODEL,
    effort: ctx.effort,
    limits: { maxTokens: ctx.limits.maxTokens, maxIterations: ctx.limits.maxIterations },
    prefix: prep.prefix,
    prefixVersion: prep.prefixVersion,
    tools: TOOLS,
    executeTool: session.execute,
    transcript: frozenCopy(prep.transcript),
    continuity,
    user: prep.user,
    isFirstTurn: ctx.isFirstTurn,
  };
  return { session, input };
}

export interface Finished {
  error: TutorErrorInfo | null;
  usage: UsageSummary;
  calls: readonly UsageSummary[];
  text: string;
  summary: string | null;
  cardIds: readonly string[];
  review: ReviewValue | null;
}

/** Append the turn to the transcript and the usage log. A failed turn is stored as an excluded tail. */
export async function persist(prep: PreparedTurn, backend: TutorBackend, ports: TutorPorts, fin: Finished) {
  const { ctx, request } = prep;
  const failed = fin.error !== null;
  const common = {
    kind: ctx.kind,
    stepId: ctx.step?.id ?? null,
    rung: ctx.step ? ctx.rung : null,
    excluded: failed,
  };
  await ports.conversations.append(ctx.conversationId, {
    ...common,
    role: "user",
    text: request.userText,
    learnerCode: ctx.learnerCode,
    cardIds: [],
    review: null,
    summary: null,
    backend: null,
    errorKind: null,
  });
  await ports.conversations.append(ctx.conversationId, {
    ...common,
    role: "assistant",
    text: fin.text,
    learnerCode: null,
    cardIds: [...fin.cardIds],
    review: fin.review,
    summary: failed ? null : fin.summary,
    backend: backend.id,
    errorKind: fin.error?.kind ?? null,
  });
  const at = ports.clock.now().toISOString();
  for (const usage of fin.calls) {
    await ports.usage.record({
      at,
      day: ctx.conversation.day,
      conversationId: ctx.conversationId,
      kind: ctx.kind,
      lane: ctx.lane,
      usage,
    });
  }
}

export async function softMarker(prep: PreparedTurn, ports: TutorPorts): Promise<boolean> {
  if (prep.budget.softPassed) return false; // already past it before this turn
  const after = await checkBudget(ports);
  if (!after.firstSoftCrossing) return false;
  await ports.settings.markSoftWarned(after.month);
  return true;
}

export async function runTurn(
  prep: PreparedTurn,
  backend: TutorBackend,
  emit: Emit,
  signal: AbortSignal,
  ports: TutorPorts,
  opts: RunOptions = {},
): Promise<RunResult> {
  const { ctx } = prep;
  const guard = new HtmlGuard();
  let text = "";
  let breakBeforeText = false;

  const pushText = (safe: string) => {
    if (safe === "") return;
    // Text written after a tool round is a new paragraph, whichever backend produced it.
    const sep = breakBeforeText && text !== "" && !text.endsWith("\n") ? "\n\n" : "";
    breakBeforeText = false;
    text += sep + safe;
    emit({ type: "text", data: { delta: sep + safe } });
  };

  // Tool events come from the session and are trusted as they are.
  const fromSession: Emit = (e) => {
    if (e.type === "tool_result") breakBeforeText = true;
    emit(e);
  };
  const { session, input } = await setUp(prep, backend, fromSession, ports);

  // What a backend may emit. Anything else it sends is dropped: `meta`, `done`, `error` and the
  // tool events have exactly one author.
  const fromBackend: Emit = (e: TutorEvent) => {
    switch (e.type) {
      case "text":
        pushText(guard.push(e.data.delta));
        break;
      case "thinking":
        emit({ type: "thinking", data: { delta: escapeTags(e.data.delta) } });
        break;
      case "tool_start":
        session.markStarted(e.data.toolUseId);
        emit(e);
        break;
      case "tool_input":
        if (opts.cardDrafts === true) emit(e);
        break;
      case "status":
      case "usage":
        emit(e);
        break;
    }
  };

  let outcome: TurnOutcome;
  try {
    outcome = await backend.runTurn(input, fromBackend, signal);
  } catch (e) {
    const usage = emptyUsage(backend.id);
    outcome = {
      status: "failed",
      error: classifyThrown(e, { aborted: signal.aborted }),
      iterations: 0,
      usage,
      calls: [],
    };
  }
  pushText(guard.flush());

  const error = outcome.status === "failed" ? outcome.error : null;
  const stored = sanitizeMarkdown(text);
  let summary: string | null = null;
  if (ctx.lane === "hint" && ctx.step) summary = hintSummary(ctx.rung, ctx.step.id);
  await persist(prep, backend, ports, {
    error,
    usage: outcome.usage,
    calls: outcome.calls,
    text: stored,
    summary,
    cardIds: session.cardIds,
    review: session.review ?? null,
  });

  if (error === null && ctx.kind === "listening" && stored.trim() !== "") {
    // Each listening note becomes a tutor note, written by the server (contracts §10.2).
    await ports.notes.add({
      day: ctx.conversation.day,
      subjectKind: ctx.conversation.subjectKind,
      subjectId: ctx.conversation.subjectId,
      source: "listening",
      text: stored.trim(),
      skillId: null,
    });
  }
  const softMarkerPassed = await softMarker(prep, ports);

  if (outcome.status === "completed") {
    emit({
      type: "done",
      data: {
        stopReason: outcome.stopReason,
        backend: backend.id,
        iterations: outcome.iterations,
        usage: outcome.usage,
      },
    });
  } else {
    emit({ type: "error", data: { ...outcome.error, usage: outcome.usage } });
  }
  return {
    ok: error === null,
    error,
    usage: outcome.usage,
    text: stored,
    cardIds: [...session.cardIds],
    review: session.review ?? null,
    softMarkerPassed,
  };
}
