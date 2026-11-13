// The analysed facts a tutor review is anchored to (wave4.md §5.6; contracts §10.6): the reviewed code evaluated on
// the learner host (it is the learner's code), then Oak's own analysis — `harmonyView` and `analyzePiece` of
// @oak/grader — reshaped by the tutor's `reviewFactsFrom`. Never a judgement; a piece that does not evaluate gives
// no facts (the review still gets the text analysis).
import type { KeySpec, MeterId, UnlockableId } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { analyzePiece, capstoneLength, harmonyView, normalize } from "@oak/grader";
import type { Repos } from "../db/repos/index.ts";
import type { GraderHosts } from "../deps.ts";
import type { ReviewFacts } from "../tutor/domain.ts";
import { type AnalysisLike, type HarmonyViewLike, reviewFactsFrom } from "../tutor/review-facts.ts";

export type ReviewFactsPort = (
  code: string,
  opts: { key: KeySpec | null; meter: MeterId | null },
) => Promise<ReviewFacts | null>;

/** Bars a review analyses at most (the capstone mode's cap, contracts §6.4). */
const MAX_BARS = 128;

export function reviewFactsPort(graders: GraderHosts, repos: Repos): ReviewFactsPort {
  return async (code, opts) => {
    const meter: MeterId = opts.meter ?? "4/4";
    try {
      const lint = {
        profile: "studio" as const,
        unlocked: repos.unlocks.ids() as Set<UnlockableId>,
        allowPreview: true,
        meter,
        key: opts.key,
      };
      const ctx = { meter, ...(opts.key === null ? {} : { key: opts.key }) };
      let r = await graders.learner().analyze(code, { mode: "capstone", bars: MAX_BARS, lint });
      if (!r.ok) return null;
      // One pass of the piece (the capstone mode's length rule, contracts §6.4): a looping 8-bar song is 8 bars.
      const len = capstoneLength(code, normalize(r, ctx).all, r.cps);
      if (len.queriedBars < MAX_BARS) {
        r = await graders.learner().analyze(code, { mode: "capstone", bars: len.queriedBars, lint });
        if (!r.ok) return null;
      }
      const n = normalize(r, ctx);
      const view = harmonyView(n, ctx);
      const analysis = analyzePiece(n, { ...ctx, code });
      const unitsPerBar = Number(meter.split("/")[0]) || 4;
      const notes = n.all
        .filter((e) => e.midi !== null && e.drum === undefined)
        .map((e) => {
          const at = R.toNum(e.onset);
          const bar = Math.floor(at);
          return {
            track: e.track,
            midi: e.midi as number,
            bar: bar + 1,
            beat: Math.round(((at - bar) * unitsPerBar + 1) * 100) / 100,
          };
        });
      return reviewFactsFrom({
        view: view as unknown as HarmonyViewLike,
        analysis: analysis as unknown as AnalysisLike,
        notes,
        meter,
        key: opts.key === null ? null : `${opts.key.tonic} ${opts.key.mode}`,
      });
    } catch {
      return null;
    }
  };
}
