// The analysed facts a tutor review is anchored to (wave4.md §5.6; contracts §10.6): the reviewed code evaluated on
// the learner host (it is the learner's code), then Oak's own analysis — `harmonyView` and `analyzePiece` of
// @oak/grader — reshaped by the tutor's `reviewFactsFrom`. Never a judgement; a piece that does not evaluate gives
// no facts (the review still gets the text analysis). Wave 5: the grader's form, bass, blues and swing views (the
// same functions the rubric grades with) and a transcription's checks, so a review of C3–C5, X2 or a ladder song
// can name sections, the bass's roles, the 12-bar form, the swing and where each check stands.
import type { KeySpec, MeterId, UnlockableId } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  analyzePiece,
  bassView,
  bluesView,
  capstoneLength,
  chromaticHarmonyView,
  contrastAxes,
  detectDevices,
  formView,
  harmonyView,
  keyPlanView,
  modeView,
  normalize,
  rhythmView,
  swingView,
} from "@oak/grader";
import type { Repos } from "../db/repos/index.ts";
import type { GraderHosts } from "../deps.ts";
import type { ReviewFacts } from "../tutor/domain.ts";
import {
  type AnalysisLike,
  type BassViewLike,
  type BluesViewLike,
  type CheckLike,
  type ChromaticViewLike,
  type DeviceLike,
  type FormViewLike,
  type HarmonyViewLike,
  type KeyPlanViewLike,
  type ModeViewLike,
  type RhythmViewLike,
  reviewFactsFrom,
  type SectionFeaturesLike,
  type TrackSwingLike,
} from "../tutor/review-facts.ts";

export type ReviewFactsPort = (
  code: string,
  opts: {
    key: KeySpec | null;
    meter: MeterId | null;
    /** Wave 5: a transcription's checks (X2's bass → changes → melody, a ladder song's phrases or stages). */
    checks?: readonly CheckLike[] | null;
    /** Wave 5: the piece declares a pickup (bar numbers count from the first full bar, c4). */
    pickup?: boolean;
  },
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
      // Wave 5 views, each on its own: one that throws on an odd piece leaves the others standing.
      const safe = <T>(f: () => T): T | null => {
        try {
          return f();
        } catch {
          return null;
        }
      };
      const bars = r.bars;
      const form = safe(() => formView(n, { code, bars }));
      const bass = safe(() => bassView(n, { ...ctx, bars }));
      const blues = safe(() => bluesView(n, { ...ctx, bars }));
      const swing = safe(() => swingView(n, meter));
      // Wave 6 (wave6.md §3.2): the U12–U17 views, the same functions the lenses, the checklists and the rubric
      // read: sevenths and outside chords in the key in force, the mode (of the piece and of each section, C6), the
      // key plan (C7, CF-A), the devices CF-A counts, one pass in seconds, and the rhythm of U13.
      const chromatic = safe(() => chromaticHarmonyView(n, { ...ctx, code, bars }));
      const keyPlan = safe(() => keyPlanView(n, { ...ctx, code }));
      const devices =
        (analysis as { deviceList?: DeviceLike[] }).deviceList ??
        safe(() => detectDevices(n, { ...ctx, bars, code }) as unknown as DeviceLike[]);
      const rhythm = safe(() => rhythmView(n, { ...ctx, bars, code }));
      const durationSec = (analysis as { durationSec?: number }).durationSec ?? null;
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
        form: form as unknown as FormViewLike | null,
        contrast: (a: SectionFeaturesLike, b: SectionFeaturesLike) =>
          contrastAxes(a as never, b as never) as readonly string[],
        bass: bass as unknown as BassViewLike | null,
        blues: blues as unknown as BluesViewLike | null,
        swing: swing as unknown as readonly TrackSwingLike[] | null,
        checks: opts.checks ?? null,
        chromatic: chromatic as unknown as ChromaticViewLike | null,
        mode: (span: readonly [number, number] | null) =>
          modeView(n, { ...ctx, bars, ...(span === null ? {} : { span }) }) as unknown as ModeViewLike,
        keyPlan: keyPlan as unknown as KeyPlanViewLike | null,
        devices,
        durationSec,
        rhythm: rhythm as unknown as RhythmViewLike | null,
        ...(opts.pickup === true ? { pickupBars: true } : {}),
      });
    } catch {
      return null;
    }
  };
}
