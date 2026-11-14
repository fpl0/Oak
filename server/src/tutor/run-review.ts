// Running a review turn (capstone or transcription): one validated object instead of streamed
// text. Shares set-up, persistence and the budget marker with run.ts.
import type { TutorErrorInfo } from "./errors.ts";
import { classifyThrown, errorInfo, StructuredTurnError, TutorError } from "./errors.ts";
import type { UsageSummary } from "./events.ts";
import type { TutorPorts } from "./ports.ts";
import type { PreparedTurn } from "./prepare.ts";
import {
  type ReviewValue,
  reviewJsonSchema,
  reviewNoteText,
  reviewRulesOf,
  reviewSummaryLine,
} from "./reviews.ts";
import { persist, type RunResult, setUp, softMarker } from "./run.ts";
import { MAX_REVIEW_SUBMITS } from "./tools/execute.ts";
import { acceptReview } from "./tools/review-submit.ts";
import { type Emit, reviewKindOf, type StructuredTurn, type TutorBackend } from "./types.ts";
import { emptyUsage } from "./usage.ts";

/**
 * A capstone or transcription review. On failure the caller falls back to the deterministic liner
 * notes (contracts §10.3); nothing here invents a review.
 */
export async function runReview(
  prep: PreparedTurn,
  backend: TutorBackend,
  emit: Emit,
  signal: AbortSignal,
  ports: TutorPorts,
): Promise<RunResult> {
  const { ctx } = prep;
  const kind = reviewKindOf(ctx.kind);
  if (kind === null || ctx.review === null)
    throw new TutorError("bad_request", { detail: "not a review turn" });
  const rules = reviewRulesOf(ctx.review, ctx.terms, ctx.conversation.subjectId);
  const { session, input } = await setUp(prep, backend, emit, ports);

  // The CLI channel validates here; the API channel validates inside the submit tool. Both end in
  // acceptReview, and whichever accepts emits the one `review` event.
  let direct: ReviewValue | undefined;
  const structured: StructuredTurn<ReviewValue> = {
    ...input,
    schemaName: kind === "capstone" ? "CapstoneReview" : "TranscriptionReview",
    jsonSchema: reviewJsonSchema(kind),
    submitTool: kind === "capstone" ? "submit_capstone_review" : "submit_transcription_review",
    validate: async (raw, sig) => {
      const check = await acceptReview(kind, raw, rules, ports.grader, sig);
      if (check.ok && direct === undefined && session.review === undefined) {
        direct = check.value;
        emit({ type: "review", data: { reviewKind: kind, review: check.value } });
      }
      return check;
    },
    accepted: () => session.review ?? direct,
    maxResubmits: MAX_REVIEW_SUBMITS - 1,
    reminder: `Deliver the review now as one ${kind === "capstone" ? "CapstoneReview" : "TranscriptionReview"} object.`,
  };

  let usage = emptyUsage(backend.id);
  let calls: readonly UsageSummary[] = [];
  let error: TutorErrorInfo | null = null;
  let review: ReviewValue | null = null;
  try {
    const res = await backend.runStructured(structured, signal);
    usage = res.usage;
    calls = res.calls ?? [res.usage];
    // Take the value from the validated channel, never the backend's return value unchecked.
    review = structured.accepted() ?? null;
    if (review === null) error = errorInfo("internal");
  } catch (e) {
    error = classifyThrown(e, { aborted: signal.aborted });
    // A review that failed after model calls still cost tokens: log them.
    if (e instanceof StructuredTurnError) {
      usage = e.usage as UsageSummary;
      calls = e.calls as UsageSummary[];
    }
  }

  const summary = review ? reviewSummaryLine(ctx.conversation.subjectId, review) : null;
  // The transcript entry carries the accepted review whichever channel delivered it.
  await persist(prep, backend, ports, {
    error,
    usage,
    calls,
    text: "",
    summary,
    cardIds: session.cardIds,
    review,
  });
  if (review !== null) {
    await ports.notes.add({
      day: ctx.conversation.day,
      subjectKind: ctx.conversation.subjectKind,
      subjectId: ctx.conversation.subjectId,
      source: "review",
      text: reviewNoteText(review),
      skillId: null,
    });
  }
  const softMarkerPassed = await softMarker(prep, ports);

  if (error === null)
    emit({
      type: "done",
      data: { stopReason: "end_turn", backend: backend.id, iterations: usage.requests, usage },
    });
  else emit({ type: "error", data: { ...error, usage } });
  return {
    ok: error === null,
    error,
    usage,
    text: "",
    cardIds: [...session.cardIds],
    review,
    softMarkerPassed,
  };
}
