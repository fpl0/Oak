// Token accounting shared by both backends. The API and the CLI report usage in the same
// snake_case shape, so one structural type covers both and this file needs no SDK import.
import type { UsageSummary } from "./events.ts";
import { estimateCostUsd, priceFor } from "./pricing.ts";
import type { BackendId } from "./types.ts";

/** `BetaUsage` of the SDK and `result.usage` of the CLI, reduced to what is counted. */
export interface WireUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number | null;
    ephemeral_5m_input_tokens?: number | null;
  } | null;
}

export function emptyUsage(backend: BackendId): UsageSummary {
  const included = backend === "claude-cli";
  return {
    backend,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    costUsd: included ? null : 0,
    includedInPlan: included,
    servedBy: [],
  };
}

/**
 * One model call as a summary. The CLI's `total_cost_usd` is deliberately not an input: it is a
 * list-price figure, cumulative per session, and on a subscription it is not a bill (spike S8).
 */
export function callUsage(backend: BackendId, wire: WireUsage, model: string, requests = 1): UsageSummary {
  const creation = wire.cache_creation_input_tokens ?? 0;
  // The 1h/5m split is nullable. Without it, price every write at the 1h rate: the only explicit
  // breakpoint Oak sets is the 1h one, and it is the more expensive of the two.
  const c1h = wire.cache_creation?.ephemeral_1h_input_tokens ?? creation;
  const c5m = wire.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const u: UsageSummary = {
    ...emptyUsage(backend),
    requests,
    inputTokens: wire.input_tokens ?? 0,
    outputTokens: wire.output_tokens ?? 0,
    cacheReadInputTokens: wire.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: creation,
    cacheCreation1hInputTokens: c1h,
    cacheCreation5mInputTokens: c5m,
    servedBy: [model],
  };
  if (!u.includedInPlan) u.costUsd = estimateCostUsd(u, priceFor(model));
  return u;
}

export function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    backend: a.backend,
    requests: a.requests + b.requests,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheCreation1hInputTokens: a.cacheCreation1hInputTokens + b.cacheCreation1hInputTokens,
    cacheCreation5mInputTokens: a.cacheCreation5mInputTokens + b.cacheCreation5mInputTokens,
    // Costs add per call because each call may have been served by a model with its own rates.
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
    includedInPlan: a.includedInPlan,
    servedBy: [...a.servedBy, ...b.servedBy.filter((m) => !a.servedBy.includes(m))],
  };
}

export function sumUsage(backend: BackendId, calls: readonly UsageSummary[]): UsageSummary {
  return calls.reduce(addUsage, emptyUsage(backend));
}

/** Share of prompt tokens served from cache, 0 to 1. Shown in Settings -> Tutor. */
export function cacheHitRatio(
  u: Pick<UsageSummary, "inputTokens" | "cacheReadInputTokens" | "cacheCreationInputTokens">,
): number {
  const total = u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
  return total === 0 ? 0 : u.cacheReadInputTokens / total;
}
