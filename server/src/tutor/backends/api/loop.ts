// Manual streaming tool loop: one call is one learner turn, possibly several API requests.
//
// Invariants:
//  - History is append-only. Everything a turn adds (its user message, each assistant message
//    VERBATIM with thinking blocks and signatures, each tool_result message) is committed once, at
//    the end, and only as replayable history when the turn completed. A refused, truncated,
//    aborted or failed turn is committed as `excluded`: logged, never sent again. So a retry is a
//    clean re-send and nothing earlier in the history ever changes.
//  - `stop_reason` is checked BEFORE content is used or a tool is run: the SDK's tolerant JSON
//    parser hands back a silently shortened tool input when a response is cut off.
//  - All tool_result blocks of one assistant message go back in ONE user message, in order.
//  - The loop sends only what it was handed: the prefix, the user turn, its own records (or the
//    transcript when it has none) and tool results, unchanged.
import type Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaStopReason,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { classifyStopReason, classifyThrown, errorInfo, type TutorErrorInfo } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import type { BackendTurn, Emit, StopReason, TurnOutcome } from "../../types.ts";
import { addUsage, callUsage, emptyUsage } from "../../usage.ts";
import { hasVisibleText, normalizeFallbackBoundary, plain, servedModels, toolUses } from "./content.ts";
import { createRelay } from "./relay.ts";
import {
  appNote,
  buildRequest,
  isMessageParam,
  type RequestOptions,
  seedMessages,
  userMessages,
} from "./request.ts";

export const BACKEND_ID = "anthropic-api";

/** A turn whose product is one object delivered through a tool (the reviews, contracts §10.3). */
export interface Delivery {
  /** True once the object has been accepted. */
  done(): boolean;
  submitTool: string;
  /** Submissions the executor will look at; after that the turn has failed. */
  maxSubmits: number;
  /** Sent once if the model ends its turn without delivering. */
  reminder: string;
}

export interface LoopArgs {
  client: Anthropic;
  input: BackendTurn;
  emit: Emit;
  signal: AbortSignal;
  options?: RequestOptions | undefined;
  delivery?: Delivery | undefined;
}

async function streamOnce(
  client: Anthropic,
  params: BetaMessageStreamParams,
  onEvent: (event: BetaRawMessageStreamEvent) => void,
  signal: AbortSignal,
): Promise<BetaMessage> {
  const stream = client.beta.messages.stream(params, { signal });
  try {
    // Iteration and finalMessage() share one try: unparseable tool input throws from either.
    for await (const event of stream) onEvent(event);
    return await stream.finalMessage();
  } catch (e) {
    stream.abort();
    throw e;
  }
}

function toStopReason(reason: BetaStopReason | null): StopReason {
  if (reason === "end_turn" || reason === "stop_sequence") return reason;
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "max_tokens";
  return "other";
}

export async function runLoop(args: LoopArgs): Promise<TurnOutcome> {
  const { client, input, emit, signal, delivery } = args;
  const prior = input.continuity.records.filter(isMessageParam);
  // Everything this turn adds to the conversation, in order. A conversation this backend has no
  // records of starts from the app-level transcript, which then becomes part of its records.
  const added: BetaMessageParam[] = [
    ...(prior.length === 0 ? seedMessages(input.transcript) : []),
    ...userMessages(input.user, args.options?.contextPlacement),
  ];
  const shape = {
    model: input.model,
    effort: input.effort,
    maxTokens: input.limits.maxTokens,
    prefix: input.prefix,
    tools: input.tools,
  };
  const relay = createRelay(emit);
  const calls: UsageSummary[] = [];
  let usage = emptyUsage(BACKEND_ID);
  let iterations = 0;
  let reminded = false;
  let submits = 0;

  const fail = async (error: TutorErrorInfo): Promise<TurnOutcome> => {
    await input.continuity.commit(added, { excluded: true });
    return { status: "failed", error, iterations, usage, calls };
  };
  const complete = async (stopReason: StopReason): Promise<TurnOutcome> => {
    await input.continuity.commit(added);
    return { status: "completed", stopReason, iterations, usage, calls };
  };

  while (iterations < input.limits.maxIterations) {
    if (signal.aborted) return fail(errorInfo("aborted"));
    iterations++;
    let msg: BetaMessage;
    try {
      const params = buildRequest(shape, [...prior, ...added], args.options);
      msg = await streamOnce(client, params, relay, signal);
    } catch (e) {
      return fail(classifyThrown(e, { aborted: signal.aborted }));
    }

    const call = { ...callUsage(BACKEND_ID, msg.usage, msg.model), servedBy: servedModels(msg) };
    calls.push(call);
    usage = addUsage(usage, call);
    emit({ type: "usage", data: usage });

    const content = plain(normalizeFallbackBoundary(msg.content));
    const uses = toolUses(content);
    const cutOff = msg.stop_reason === "max_tokens" || msg.stop_reason === "model_context_window_exceeded";
    // A reply cut off before any visible text is not a reply; one cut off inside a tool call
    // has incomplete input. Neither is run or replayed.
    const stopError =
      classifyStopReason(msg.stop_reason, uses.length > 0) ??
      (cutOff && !hasVisibleText(content) ? "max_tokens" : null);
    // An empty assistant message cannot be sent back, so an empty response adds nothing.
    if (content.length > 0) added.push({ role: "assistant", content });
    if (stopError !== null) return fail(errorInfo(stopError));

    // The server paused its own loop: send the conversation back as it is, with no new user turn.
    if (msg.stop_reason === "pause_turn") continue;

    if (msg.stop_reason !== "tool_use" || uses.length === 0) {
      if (delivery === undefined || delivery.done()) return complete(toStopReason(msg.stop_reason));
      if (reminded) return fail(errorInfo("iteration_limit"));
      reminded = true;
      added.push(appNote(delivery.reminder));
      continue;
    }

    const results: BetaToolResultBlockParam[] = [];
    try {
      // In order, one at a time: the executors count cards and review submissions per turn.
      for (const use of uses) {
        if (use.name === delivery?.submitTool) submits++;
        const res = await input.executeTool({ id: use.id, name: use.name, input: use.input }, signal);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: res.content,
          is_error: res.isError,
        });
      }
    } catch (e) {
      return fail(classifyThrown(e, { aborted: signal.aborted }));
    }
    added.push({ role: "user", content: results });
    if (signal.aborted) return fail(errorInfo("aborted"));

    if (delivery !== undefined) {
      // Accepted: the object is the turn's product, so no further model call is paid for.
      if (delivery.done()) return complete("end_turn");
      if (submits >= delivery.maxSubmits) return fail(errorInfo("iteration_limit"));
    }
  }
  return fail(errorInfo("iteration_limit"));
}
