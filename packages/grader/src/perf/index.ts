// Performance steps (tap and sing, contracts §8). The ONE rule for a sung note (`gradeSung`) and for
// taps (`gradeTaps`) lives in @oak/pitch and runs on the main thread against live audio; @oak/grader may
// not import @oak/pitch (interfaces §2). This module does the grader's half: the targets a step is
// graded against (from evaluated events), the auto tap window, and folding a pitch result into a
// GradeResult with the pass rules of §8.1 and §8.4.
import type {
  Degree,
  Diagnostic,
  KeySpec,
  LearnerProfile,
  MeterId,
  SingEx,
  SingTolerance,
  TapEx,
  TapTolerance,
} from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { degreeSemitones, METERS, pcOf } from "@oak/theory";
import { median, num } from "../analyze/events.ts";
import { melodyLine } from "../analyze/melody.ts";
import { selectTrack } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, Normalized } from "../types.ts";

/** Tap target times in seconds from the stimulus start: every tempo unit (`'beat'`) or the onsets of a track or drum. */
export function tapTargets(target: TapEx["target"], n: Normalized, bars: number, meter: MeterId): number[] {
  const cps = n.cps;
  if (target === "beat") {
    const units = METERS[meter].unitsPerBar;
    return Array.from({ length: bars * units }, (_, i) => i / units / cps);
  }
  let ev = selectTrack(n, target.track ?? "*");
  if (target.drum && target.drum.length > 0)
    ev = ev.filter((e) => e.drum !== undefined && (target.drum as string[]).includes(e.drum));
  const seen = new Set<string>();
  const out: number[] = [];
  for (const e of ev) {
    if (R.floor(e.onset) >= bars) continue;
    const k = `${e.onset[0]}/${e.onset[1]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(num(e.onset) / cps);
  }
  return out.sort((a, b) => a - b);
}

/** Smallest gap between successive targets, in ms. */
export const minIoiMs = (targets: readonly number[]): number => {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < targets.length; i++)
    min = Math.min(min, ((targets[i] as number) - (targets[i - 1] as number)) * 1000);
  return Number.isFinite(min) ? min : 500;
};

/**
 * The tap window of contracts §8.4: `w = max(floor, clamp(0.25 × minIOI, 50, 120) × levelFactor)` with
 * `levelFactor` from 1.0 (first level) to 0.6 (top level), and `floor` = 50 ms, 70 ms on Bluetooth output,
 * 80 ms when the calibration jitter exceeds 25 ms. A numeric `windowMs` (calibration steps) wins.
 */
export function tapWindow(
  tol: Pick<TapTolerance, "windowMs">,
  minIoi: number,
  profile: Pick<LearnerProfile, "outputKind" | "tapJitterMs">,
  level = 1,
  levels = 1,
): number {
  if (typeof tol.windowMs === "number") return tol.windowMs;
  const floor = profile.tapJitterMs > 25 ? 80 : profile.outputKind === "bluetooth" ? 70 : 50;
  const factor = levels <= 1 ? 1 : 1 - (0.4 * (Math.min(levels, Math.max(1, level)) - 1)) / (levels - 1);
  return Math.max(floor, Math.min(120, Math.max(50, 0.25 * minIoi)) * factor);
}

export interface SingTargetNote {
  midi: number;
  /** Seconds from the stimulus start. */
  on: number;
  off: number;
}
/**
 * The notes a sing step is graded against: the stimulus melody (`from: 'stimulus'` / `'reference'`) or
 * degrees in the key laid out one per tempo unit (or per the given rhythm onsets). Octave placement into
 * the learner's range is @oak/pitch's `fitToRange`.
 */
export function singTargets(
  target: SingEx["target"],
  n: Normalized | null,
  key: KeySpec | null,
  meter: MeterId,
  cps: number,
): SingTargetNote[] {
  if (target.from === "degrees") {
    if (!key) return [];
    const tonic = 60 + pcOf(key.tonic);
    const unit = 1 / METERS[meter].unitsPerBar / cps;
    return target.degrees.map((d: Degree, i) => ({
      midi: tonic + degreeSemitones(d),
      on: i * unit,
      off: (i + 1) * unit,
    }));
  }
  if (!n) return [];
  const line = melodyLine(
    selectTrack(n, target.track ?? "@melody").length
      ? selectTrack(n, target.track ?? "@melody")
      : selectTrack(n, "*"),
  );
  return line.map((x) => ({
    midi: x.midi,
    on: num(x.onset) / n.cps,
    off: num(R.add(x.onset, x.dur)) / n.cps,
  }));
}

/** What a performance result from @oak/pitch looks like to the grader (`SungResult`, `TapResult` fit it). */
export interface PerformanceResult extends MatchResult {
  pass?: boolean;
  f1?: number;
  timing?: number;
  notes?: { credit: number; feedback: string | null }[];
}

/**
 * Pass for a performance (contracts §8): the result's own `pass` when @oak/pitch computed it; otherwise
 * taps pass with F1 ≥ `passF1` and timing ≥ `passTiming`, and singing with mean pitch credit ≥
 * `passHitRate` and at most one missed note.
 */
export function performancePasses(
  kind: "tap" | "sing",
  perf: PerformanceResult,
  tol: TapTolerance | SingTolerance,
): boolean {
  if (typeof perf.pass === "boolean") return perf.pass;
  if (kind === "tap") {
    const t = tol as TapTolerance;
    const f1 = perf.f1 ?? perf.dims.coverage?.score ?? perf.score;
    const timing = perf.timing ?? perf.dims.timing?.score ?? perf.score;
    return f1 >= t.passF1 - 1e-9 && timing >= t.passTiming - 1e-9;
  }
  const s = tol as SingTolerance;
  const credits = perf.notes?.map((x) => x.credit);
  const meanPitch = credits?.length
    ? credits.reduce((a, b) => a + b, 0) / credits.length
    : (perf.dims.pitch?.score ?? perf.score);
  const missed = perf.notes
    ? perf.notes.filter((x) => x.feedback === "sing.missed").length
    : perf.diagnostics.filter((d) => d.id === "sing.missed").length;
  return meanPitch >= s.passHitRate - 1e-9 && missed <= 1;
}

/** `sing.no-voice` when nothing voiced was heard: a result with status `error`, not an attempt. */
export function noVoice(db: number): Diagnostic {
  return diag("sing.no-voice", { db: Math.round(db) });
}

/** Timing of each tap against its nearest target, for diagnostics placed at a bar and beat. */
export function tapPlace(tSec: number, cps: number, meter: MeterId): { bar: number; beat: number } {
  const cycles = tSec * cps;
  const bar = Math.floor(cycles) + 1;
  return { bar, beat: 1 + (cycles - Math.floor(cycles)) * METERS[meter].unitsPerBar };
}

/** Median of the (tap − target) offsets in ms: the constant offset `tap.offset` reports. */
export const tapOffsetMs = (pairs: readonly [number, number][]): number =>
  median(pairs.map(([t, a]) => (a - t) * 1000));
