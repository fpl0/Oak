// Cost model for claude-opus-5-5 (USD per million tokens), from the research digest
// (docs/design/research/followups.md, "claude-tutor-server"): $4 in / $20 out,
// cache read 0.05x, 5-minute cache write 1.25x, 1-hour cache write 2x.
// NOT verified against a live bill in this spike (no API access).
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { UsageSummary } from './events.ts';

export const OPUS_5_5 = {
  inputPerMTok: 4,
  outputPerMTok: 20,
  cacheReadMult: 0.05,
  cacheWrite5mMult: 1.25,
  cacheWrite1hMult: 2,
} as const;

export function costUsd(u: Pick<UsageSummary, 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreation1hInputTokens' | 'cacheCreation5mInputTokens'>, p = OPUS_5_5): number {
  const inRate = p.inputPerMTok / 1e6;
  return (
    u.inputTokens * inRate +
    u.cacheReadInputTokens * inRate * p.cacheReadMult +
    u.cacheCreation5mInputTokens * inRate * p.cacheWrite5mMult +
    u.cacheCreation1hInputTokens * inRate * p.cacheWrite1hMult +
    (u.outputTokens * p.outputPerMTok) / 1e6
  );
}

export function emptyUsage(): UsageSummary {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    costUsd: 0,
    servedBy: [],
  };
}

/** Fold one response's `usage` into the running per-turn summary. */
export function addUsage(acc: UsageSummary, usage: BetaUsage, model: string): UsageSummary {
  const creation = usage.cache_creation_input_tokens ?? 0;
  // `cache_creation` (the 1h/5m split) is nullable; if absent, price all writes at the 1h rate
  // (the only explicit breakpoint Oak sets is the 1h one), which is the conservative choice.
  const c1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? creation;
  const c5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const next: UsageSummary = {
    requests: acc.requests + 1,
    inputTokens: acc.inputTokens + usage.input_tokens,
    outputTokens: acc.outputTokens + usage.output_tokens,
    cacheReadInputTokens: acc.cacheReadInputTokens + (usage.cache_read_input_tokens ?? 0),
    cacheCreationInputTokens: acc.cacheCreationInputTokens + creation,
    cacheCreation1hInputTokens: acc.cacheCreation1hInputTokens + c1h,
    cacheCreation5mInputTokens: acc.cacheCreation5mInputTokens + c5m,
    costUsd: 0,
    servedBy: acc.servedBy.includes(model) ? acc.servedBy : [...acc.servedBy, model],
  };
  next.costUsd = costUsd(next);
  return next;
}
