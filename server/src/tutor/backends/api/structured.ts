// Review turns: one validated object instead of streamed text.
//
// The object arrives through the review's `submit_*` tool, on the normal tool loop (contracts
// §10.3): forced tool choice is not available, and `output_config.format` is not among the API
// features the contracts allow before a live check. The executor validates the submission and
// answers `accepted: false` with the problems, so the model can resubmit once.
import type Anthropic from "@anthropic-ai/sdk";
import { errorInfo, StructuredTurnError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import type { StructuredTurn } from "../../types.ts";
import { runLoop } from "./loop.ts";
import type { RequestOptions } from "./request.ts";

export async function runStructuredTurn<T>(
  client: Anthropic,
  input: StructuredTurn<T>,
  signal: AbortSignal,
  options?: RequestOptions,
): Promise<{ value: T; usage: UsageSummary; calls: UsageSummary[] }> {
  const outcome = await runLoop({
    client,
    input,
    // A review has no streamed text; the executor emits the tool events and the `review` itself.
    emit: () => {},
    signal,
    options,
    delivery: {
      done: () => input.accepted() !== undefined,
      submitTool: input.submitTool,
      maxSubmits: input.maxResubmits + 1,
      reminder: input.reminder,
    },
  });
  if (outcome.status === "failed") throw new StructuredTurnError(outcome.error, outcome.usage, outcome.calls);
  const value = input.accepted();
  if (value === undefined) throw new StructuredTurnError(errorInfo("internal"), outcome.usage, outcome.calls);
  return { value, usage: outcome.usage, calls: outcome.calls };
}

export { StructuredTurnError };
