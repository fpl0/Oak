// The analysed facts a tutor review is anchored to (wave4.md §5.6; contracts §10.6): the reviewed code evaluated on
// the learner host (it is the learner's code), then Oak's own analysis — `harmonyView` and `analyzePiece` of
// @oak/grader — reshaped by the tutor's `reviewFactsFrom`. Never a judgement; a piece that does not evaluate gives
// no facts (the review still gets the text analysis). Wave 5: the grader's form, bass, blues and swing views (the
// same functions the rubric grades with) and a transcription's checks, so a review of C3–C5, X2 or a ladder song
// can name sections, the bass's roles, the 12-bar form, the swing and where each check stands.
import type { KeySpec, MeterId, SongDef, UnlockableId } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  analyzePiece,
  bassView,
  bluesView,
  capstoneLength,
  chromaticHarmonyView,
  contrastAxes,
  detectDevices,
  type EvalResult,
  formView,
  harmonyView,
  keyPlanView,
  modeView,
  type Normalized,
  normalize,
  rhythmView,
  type SongMelodyNote,
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
import { compareVersions, songMelodyOf, type W7ViewPlan, w7Inputs } from "./review-facts-w7.ts";

export type ReviewFactsPort = (
  code: string,
  opts: {
    key: KeySpec | null;
    meter: MeterId | null;
    /** Wave 5: a transcription's checks (X2's bass → changes → melody, a ladder song's phrases or stages). */
    checks?: readonly CheckLike[] | null;
    /** Wave 5: the piece declares a pickup (bar numbers count from the first full bar, c4). */
    pickup?: boolean;
    /** Wave 7: which of the track capstones' views to read (`w7PlanFor`); absent or empty: none of them. */
    w7?: W7ViewPlan | null;
  },
) => Promise<ReviewFacts | null>;

/**
 * Wave 7 (AC1): two versions of one tune compared (`compareIdioms`), each evaluated as the review evaluates a piece;
 * and a song's melody from its answer key (JC3's model head, JC4's standard), evaluated on the learner host.
 */
export interface ReviewW7Port {
  compare(
    a: string,
    b: string,
    opts: { key: KeySpec | null; meter: MeterId | null },
  ): Promise<{
    sameTune: boolean;
    axes: string[];
  } | null>;
  songMelody(song: SongDef): Promise<SongMelodyNote[]>;
}

/** Bars a review analyses at most (the capstone mode's cap, contracts §6.4). */
const MAX_BARS = 128;

/** One pass of a reviewed piece, evaluated on the learner host (it is the learner's code); null when it fails. */
async function evaluateOnePass(
  graders: GraderHosts,
  repos: Repos,
  code: string,
  key: KeySpec | null,
  meter: MeterId,
): Promise<{ r: EvalResult & { ok: true }; n: Normalized; ctx: { meter: MeterId; key?: KeySpec } } | null> {
  const lint = {
    profile: "studio" as const,
    unlocked: repos.unlocks.ids() as Set<UnlockableId>,
    allowPreview: true,
    meter,
    key,
  };
  const ctx = { meter, ...(key === null ? {} : { key }) };
  let r = await graders.learner().analyze(code, { mode: "capstone", bars: MAX_BARS, lint });
  if (!r.ok) return null;
  // One pass of the piece (the capstone mode's length rule, contracts §6.4): a looping 8-bar song is 8 bars.
  const len = capstoneLength(code, normalize(r, ctx).all, r.cps);
  if (len.queriedBars < MAX_BARS) {
    r = await graders.learner().analyze(code, { mode: "capstone", bars: len.queriedBars, lint });
    if (!r.ok) return null;
  }
  return { r, n: normalize(r, ctx), ctx };
}

export function reviewW7Port(graders: GraderHosts, repos: Repos): ReviewW7Port {
  const melodies = new Map<string, Promise<SongMelodyNote[]>>();
  return {
    async compare(a, b, opts) {
      const meter: MeterId = opts.meter ?? "4/4";
      try {
        const [ea, eb] = await Promise.all([
          evaluateOnePass(graders, repos, a, opts.key, meter),
          evaluateOnePass(graders, repos, b, opts.key, meter),
        ]);
        return ea && eb ? compareVersions(ea.n, eb.n, meter) : null;
      } catch {
        return null;
      }
    },
    songMelody(song) {
      // One evaluation per song for the server's life: an answer key never changes while it runs.
      let p = melodies.get(song.id);
      if (p === undefined) {
        p = songMelodyOf(song, (code, o) => graders.learner().analyze(code, o)).catch(() => []);
        melodies.set(song.id, p);
      }
      return p;
    },
  };
}

export function reviewFactsPort(graders: GraderHosts, repos: Repos): ReviewFactsPort {
  return async (code, opts) => {
    const meter: MeterId = opts.meter ?? "4/4";
    try {
      const ev = await evaluateOnePass(graders, repos, code, opts.key, meter);
      if (ev === null) return null;
      const { r, n, ctx } = ev;
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
        // Wave 7: the track capstones' views, as the plan names them (empty for every core capstone).
        ...(opts.w7 ? w7Inputs(n, { ...ctx, bars, code }, opts.w7, changesByBar(view, bars)) : {}),
      });
    } catch {
      return null;
    }
  };
}

/** One chord symbol a bar (the chord sounding at each bar's start), `""` where none: what a hand voicing is read
 * against (the tutor's `factsOf7`). */
function changesByBar(view: ReturnType<typeof harmonyView>, bars: number): string[] {
  const out: string[] = [];
  for (let b = 1; b <= bars; b++) {
    const beat = view.beats.find((x) => x.bar === b && x.chord !== null);
    const slot = beat ? view.slots[beat.chord as number] : undefined;
    out.push(slot?.symbol ?? "");
  }
  return out;
}
