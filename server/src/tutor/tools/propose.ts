// propose_code: the only way model-written code reaches the learner as something playable.
//
// Order matters and is the security invariant: strict lint, THEN evaluation, THEN the card event.
// Code that fails the lint is never evaluated; a card that fails either is never shown, and the
// model gets the errors back and may try again.
//
// Whether a card can be applied is decided here from server state (contracts §10.7). The tool
// input has no field for it, so the model cannot ask.
import { answerForms, answerLeaks } from "../answer-guard.ts";
import type { StepSource, SubjectFacts } from "../domain.ts";
import type { CardData } from "../events.ts";
import { formatLintIssues, lintStrict } from "../lint/strict.ts";
import { sanitizeMarkdown } from "../markup.ts";
import { escapeTags } from "../markup-guard.ts";
import type { ConversationStore, GraderPort } from "../ports.ts";
import type { ApplyState, Rung, SubjectKind, TurnContext } from "../types.ts";
import { CARD_EVAL_BARS, clampBars, type ToolInput } from "./schemas.ts";
import { totalEvents } from "./views.ts";

export interface ApplyPolicy {
  apply: ApplyState;
  /** In a graded context a card that uses a locked tool never gets Apply. */
  gradedContext: boolean;
}

/**
 * The table of contracts §10.7, "Where the card appears". Conservative where the table is silent:
 * a checkpoint debrief and a drill are preview-only.
 */
export function applyPolicyFor(input: {
  subjectKind: SubjectKind;
  facts: Pick<SubjectFacts, "released" | "transcriptionSource">;
  step: Pick<StepSource, "grading"> | null;
  /** The redaction level of the step: its rung, or 4 once passed. */
  disclosure: Rung;
}): ApplyPolicy {
  const { subjectKind, facts, step, disclosure } = input;
  const preview = (gradedContext: boolean): ApplyPolicy => ({ apply: "preview_only", gradedContext });
  const applicable = (gradedContext: boolean): ApplyPolicy => ({ apply: "applicable", gradedContext });
  // "You type your own code": a Make step is preview-only at every rung, a graded step until
  // hint 4 or a pass. An ungraded step of a lesson carries no evidence, so it may be applied.
  const byStep = (): ApplyPolicy => {
    if (step === null) return preview(true);
    if (step.grading === "make") return preview(true);
    if (step.grading === "graded") return disclosure >= 4 ? applicable(true) : preview(true);
    return applicable(true);
  };
  switch (subjectKind) {
    case "general":
    case "sketch":
      return applicable(false);
    case "lesson":
      return byStep();
    case "capstone":
    case "track":
      // Before the first release the track must be the learner's own typing.
      return facts.released === true ? applicable(true) : preview(true);
    case "transcription":
      return facts.transcriptionSource === "own-audio" ? applicable(false) : byStep();
    case "checkpoint":
    case "drill":
      return preview(true);
  }
}

export function applyStateFor(policy: ApplyPolicy, lockedTools: readonly string[]): ApplyState {
  return policy.gradedContext && lockedTools.length > 0 ? "preview_only" : policy.apply;
}

export interface ProposeResult {
  card_id: string | null;
  shown: boolean;
  apply: ApplyState;
  errors: string[];
  locked_tools: string[];
}

export interface ProposeDeps {
  ctx: Pick<TurnContext, "conversationId" | "apply" | "gradedContext" | "limits" | "lesson"> &
    Partial<Pick<TurnContext, "step" | "answerPolicy" | "disclosure" | "learnerCode">>;
  grader: GraderPort;
  conversations: ConversationStore;
  /** Cards already shown in this turn. */
  cardsShown: number;
}

export async function proposeCode(
  toolUseId: string,
  input: ToolInput<"propose_code">,
  deps: ProposeDeps,
  signal: AbortSignal,
): Promise<{ result: ProposeResult; card: CardData | null }> {
  const { ctx } = deps;
  const rejected = (errors: string[], lockedTools: string[] = []) => ({
    result: {
      card_id: null,
      shown: false,
      apply: "preview_only" as const,
      errors,
      locked_tools: lockedTools,
    },
    card: null,
  });

  if (deps.cardsShown >= ctx.limits.maxCards) {
    const n = ctx.limits.maxCards;
    return rejected([
      n === 0 ? "this thread shows no cards" : `this thread shows at most ${n} card(s) per reply`,
    ]);
  }

  const lint = lintStrict(input.code);
  if (lint.length > 0) return rejected(formatLintIssues(lint));

  // Below the reveal rung a card may model the idea, never spell out the step's own answer (wave4.md §5.6).
  if (ctx.answerPolicy === "socratic" && ctx.step) {
    const leaks = answerLeaks(
      [input.title, input.code, input.explanation].join("\n"),
      answerForms(ctx.step, ctx.learnerCode ?? null),
      ctx.disclosure ?? 0,
    );
    if (leaks.length > 0)
      return rejected([
        "the card spells out this step's answer: model the idea in another key or on other bars, or offer [[reveal]] when the learner asks for the answer",
      ]);
  }

  const key = ctx.step?.key ?? ctx.lesson?.key ?? null;
  const run = await deps.grader.evaluate(
    { code: input.code, fromBar: 1, bars: CARD_EVAL_BARS, key, origin: "tutor" },
    signal,
  );
  if (!run.ok) return rejected([run.error?.message ?? "the code did not run"], run.lockedTools);
  if (totalEvents(run) === 0) return rejected([`the card is silent in its first ${CARD_EVAL_BARS} bars`]);

  const apply = applyStateFor({ apply: ctx.apply, gradedContext: ctx.gradedContext }, run.lockedTools);
  const saved = await deps.conversations.saveCard({
    conversationId: ctx.conversationId,
    toolUseId,
    kind: input.kind,
    // The title is shown as plain text, the explanation as tutor markdown: neither may carry HTML.
    title: escapeTags(input.title.replace(/\s+/g, " ").trim()),
    code: input.code,
    explanation: sanitizeMarkdown(input.explanation),
    bars: clampBars(input.bars),
    apply,
    applyAllowed: apply === "applicable",
    lockedTools: [...run.lockedTools],
  });
  const card: CardData = {
    cardId: saved.cardId,
    toolUseId: saved.toolUseId,
    kind: saved.kind,
    title: saved.title,
    code: saved.code,
    explanation: saved.explanation,
    bars: saved.bars,
    apply: saved.apply,
    applyAllowed: saved.applyAllowed,
    lockedTools: [...saved.lockedTools],
  };
  return {
    result: { card_id: card.cardId, shown: true, apply, errors: [], locked_tools: [...run.lockedTools] },
    card,
  };
}

/**
 * Applying a card (the `POST .../cards/:id/applied` route). The preview-only rule is enforced on
 * the server too, not only by a missing button.
 */
export async function applyCard(
  conversations: ConversationStore,
  cardId: string,
): Promise<"applied" | "refused" | "unknown"> {
  const card = await conversations.card(cardId);
  if (card === null) return "unknown";
  if (card.apply !== "applicable") return "refused";
  if (!card.applied) await conversations.markCardApplied(cardId);
  return "applied";
}
