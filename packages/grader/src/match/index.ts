// `runMatcher`: dispatches a content `Matcher` to its implementation. `all` requires every member and
// scores their weighted mean; `rubric` runs rubric rules on the answer (the reference is not used).
import type { Matcher } from "@oak/content-kit";
import type { RubricContext } from "../rubric/context.ts";
import { rubricMatch } from "../rubric/index.ts";
import type { MatcherFn, MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { clampScore } from "./common.ts";
import { eventsMatch } from "./events.ts";
import { harmonyMatch, pcsetMatch } from "./harmony.ts";
import { melodyMatch } from "./melody.ts";
import { rhythmMatch } from "./rhythm.ts";

/** Runs a content `Matcher` on reference and answer events. `ctx` may carry the rubric context. */
export function runMatcher(
  matcher: Matcher,
  reference: Normalized,
  answer: Normalized,
  ctx: NormalizeContext & Partial<RubricContext>,
): MatchResult {
  switch (matcher.m) {
    case "events":
      return eventsMatch(reference, answer, matcher, ctx);
    case "rhythm":
      return rhythmMatch(reference, answer, matcher, ctx);
    case "melody":
      return melodyMatch(reference, answer, matcher, ctx);
    case "harmony":
      return harmonyMatch(reference, answer, matcher, ctx);
    case "pcset":
      return pcsetMatch(reference, answer, matcher, ctx);
    case "rubric": {
      const { rows: _rows, ...res } = rubricMatch(matcher.rules, answer, { code: "", params: {}, ...ctx });
      return res;
    }
    case "all": {
      const parts = matcher.of.map((m) => runMatcher(m, reference, answer, ctx));
      const weights = matcher.of.map((_, i) => matcher.weights?.[i] ?? 1);
      const wSum = weights.reduce((a, b) => a + b, 0) || 1;
      let score = parts.reduce((a, p, i) => a + p.score * (weights[i] as number), 0) / wSum;
      // Every member must pass: a failing member keeps the whole below a perfect score.
      if (parts.some((p) => p.score < 1 - 1e-9)) score = Math.min(score, 0.999);
      const dims: MatchResult["dims"] = {};
      for (const p of parts)
        for (const [k, d] of Object.entries(p.dims) as [
          keyof MatchResult["dims"],
          NonNullable<MatchResult["dims"][keyof MatchResult["dims"]]>,
        ][]) {
          const prev = dims[k];
          dims[k] = prev
            ? {
                score: Math.min(prev.score, d.score),
                weight: Math.max(prev.weight, d.weight),
                ...(d.n !== undefined ? { n: d.n } : {}),
              }
            : d;
        }
      const overlays = parts.map((p) => p.overlay).filter((o) => o !== undefined);
      return {
        score: clampScore(score),
        dims,
        diagnostics: parts.flatMap((p) => p.diagnostics),
        ...(overlays[0] ? { overlay: overlays[0] } : {}),
      };
    }
  }
}

/** The registry by matcher name, for callers that hold a name. */
export const MATCHERS: { [K in Matcher["m"]]: MatcherFn<Extract<Matcher, { m: K }>> } = {
  events: eventsMatch,
  rhythm: rhythmMatch,
  melody: melodyMatch,
  harmony: harmonyMatch,
  pcset: pcsetMatch,
  rubric: (r, a, cfg, ctx) => runMatcher(cfg, r, a, ctx),
  all: (r, a, cfg, ctx) => runMatcher(cfg, r, a, ctx),
};

export { compareSlots, qualityCredit } from "./harmony.ts";
export { bestTransposition, needlemanWunsch } from "./melody.ts";
export { bestDisplacement, matchOnsets } from "./rhythm.ts";
