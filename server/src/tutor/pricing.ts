// List prices for the API backend, in USD per million tokens. ESTIMATES: the numbers come from the
// research digest and spike S6 and have not been checked against a bill. They feed the figure in
// Settings -> Tutor and the optional monthly cap; nothing else depends on them.

export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Multipliers on the input rate. */
  cacheReadMult: number;
  cacheWrite5mMult: number;
  cacheWrite1hMult: number;
}

/** $4 in, $20 out; cache read 0.05x ($0.20), 5-minute write 1.25x ($5), 1-hour write 2x ($8). */
export const OPUS_5_5: Price = {
  inputPerMTok: 4,
  outputPerMTok: 20,
  cacheReadMult: 0.05,
  cacheWrite5mMult: 1.25,
  cacheWrite1hMult: 2,
};

const PRICES: Record<string, Price> = { "claude-opus-5-5": OPUS_5_5 };

/**
 * A fallback model has its own rates, which Oak does not know. It is priced at the Opus rate so
 * the estimate errs high rather than hiding spend.
 */
export function priceFor(model: string): Price {
  return PRICES[model] ?? OPUS_5_5;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheCreation5mInputTokens: number;
}

export function estimateCostUsd(t: TokenCounts, price: Price = OPUS_5_5): number {
  const inRate = price.inputPerMTok / 1e6;
  return (
    t.inputTokens * inRate +
    t.cacheReadInputTokens * inRate * price.cacheReadMult +
    t.cacheCreation5mInputTokens * inRate * price.cacheWrite5mMult +
    t.cacheCreation1hInputTokens * inRate * price.cacheWrite1hMult +
    (t.outputTokens * price.outputPerMTok) / 1e6
  );
}
