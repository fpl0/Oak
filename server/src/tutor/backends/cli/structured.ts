// Reviews on the CLI: one validated object through `--json-schema`. The run has no tools and no
// MCP server; the object arrives in `result.structured_output`, with `stop_reason: "tool_use"`
// and no text, which is the normal shape (spike S8, scenario E).
//
// The JSON Schema cannot hold Oak's counts and word limits, so the object is checked by the
// core's validator (`input.validate`). A rejected object goes back once per allowed resubmission,
// as a turn on the same session whose only content is an <oak_context> block with the problems.
import { CONTEXT_VERSION, escapeReserved } from "../../context.ts";
import { errorInfo, StructuredTurnError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import type { StructuredTurn } from "../../types.ts";
import { addUsage, emptyUsage } from "../../usage.ts";
import { planSession, renderPrompt, type SessionPlan, sessionRecord } from "./session.ts";
import { type CliRuntime, detailOf, runOnSession } from "./turn.ts";

const MAX_PROBLEM_CHARS = 400;

/**
 * What Oak says when it did not accept a delivery. It is app-authored, so it travels as
 * <oak_context>; the problems can quote model-written text and are flattened and neutralized.
 */
export function rejectionBlock(problems: readonly string[], reminder: string): string {
  const lines = problems.map((p) => {
    const flat = escapeReserved(p).replace(/\s+/g, " ").trim();
    return `problem: ${flat.length > MAX_PROBLEM_CHARS ? `${flat.slice(0, MAX_PROBLEM_CHARS - 1)}…` : flat}`;
  });
  return [
    `<oak_context v="${CONTEXT_VERSION}">`,
    "review_accepted: no",
    ...lines,
    `next: ${problems.length > 0 ? "Fix the listed problems and deliver the review once more." : reminder}`,
    "</oak_context>",
  ].join("\n");
}

/** `structured_output`, or the same object from the result text if only that is there. */
function deliveredObject(structuredOutput: unknown, resultText: string | null): unknown {
  if (structuredOutput !== undefined && structuredOutput !== null) return structuredOutput;
  if (resultText === null || resultText.trim() === "") return undefined;
  try {
    return JSON.parse(resultText);
  } catch {
    return undefined;
  }
}

export async function runStructuredCli<T>(
  rt: CliRuntime,
  timeoutMs: number,
  input: StructuredTurn<T>,
  signal: AbortSignal,
): Promise<{ value: T; usage: UsageSummary; calls: UsageSummary[] }> {
  let plan: SessionPlan = planSession(input.continuity, input.transcript, rt.makeSessionId);
  let usage = emptyUsage("claude-cli");
  const calls: UsageSummary[] = [];
  let feedback: string | null = null;

  // Record where the conversation stands exactly once, whatever way this function is left.
  const settle = (resumable: boolean) => input.continuity.commit([sessionRecord(plan, resumable)]);

  for (let attempt = 0; attempt <= input.maxResubmits; attempt++) {
    const rejection = feedback;
    const report = await runOnSession(rt, {
      input,
      plan,
      // A resumed session already holds the request, so a rejection is the whole prompt. A session
      // that had to be started again gets the request first and the rejection after it.
      prompt: (p) => {
        if (rejection === null) return renderPrompt(input.user, p);
        return p.mode === "resume" ? rejection : `${renderPrompt(input.user, p)}\n\n${rejection}`;
      },
      jsonSchema: input.jsonSchema,
      emit: () => {}, // A review has no stream: the panel gets the one `review` event from validate.
      signal,
      timeoutMs,
    });
    plan = report.plan;
    usage = addUsage(usage, report.usage);
    calls.push(report.usage);

    if (!report.verdict.ok) {
      rt.log(`claude-cli: structured turn failed (${detailOf(report.verdict)})`);
      await settle(false);
      throw new StructuredTurnError(report.verdict.error, usage, calls);
    }

    const raw = deliveredObject(report.verdict.structuredOutput, report.verdict.resultText);
    const check =
      raw === undefined ? ({ ok: false, problems: [] } as const) : await input.validate(raw, signal);
    if (check.ok) {
      await settle(true);
      return { value: check.value, usage, calls };
    }
    feedback = rejectionBlock(check.problems, input.reminder);
    // Later attempts continue the session the first one opened.
    plan = { mode: "resume", sessionId: plan.sessionId };
  }

  // Retired: a retry should not inherit a session that ends in rejected deliveries.
  await settle(false);
  const detail = `no valid ${input.schemaName} was delivered`;
  throw new StructuredTurnError(errorInfo("iteration_limit"), usage, calls, detail);
}
