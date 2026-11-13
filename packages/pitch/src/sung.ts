// The one rule for a sung note (contracts §8.1). `gradeSung` and `gradeSungLive` share one core, so the
// PitchLane fill, the per-note tick and the grade can never disagree.
import type { Diagnostic, LearnerProfile, SingMode, SingTolCents, SingTolerance } from "@oak/content-kit";
import { bleedReport } from "./bleed.ts";
import { centsFrom, mean, median, midiName, quantile, rmsDb } from "./math.ts";
import { type TakeQuality, takeQuality } from "./take.ts";
import { hopSecOf, PitchTracker, trackerOptionsFor } from "./tracker.ts";
import type {
  PitchFrame,
  RangeEstimate,
  SungNote,
  SungNoteResult,
  SungResult,
  SungTarget,
  TrackedFrame,
} from "./types.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

const TIMED_MODES: readonly SingMode[] = ["pitch", "degree", "sight"];
/** Notes fewer than this never get drift compensation: the median of one or two errors is the error itself. */
export const DRIFT_MIN_NOTES = 3;
const EPS = 1e-9;

/** Tolerance actually applied: the step's own value, or the learner's rung of the ladder. */
export function resolveSingTolerance(
  tol: Pick<SingTolerance, "cents">,
  profile: Pick<LearnerProfile, "singTolCents">,
): SingTolCents {
  return tol.cents === "learner" ? profile.singTolCents : tol.cents;
}

/** Per-note credit (contracts §8.1 rule 5) for an error of `absCents` at tolerance `tolCents`. */
export function sungCredit(absCents: number, tolCents: number): 0 | 0.5 | 1 {
  if (absCents <= tolCents + EPS) return 1;
  if (absCents <= Math.min(2 * tolCents, 100) + EPS) return 0.5;
  return 0;
}

interface Estimate {
  sungMidi: number | null;
  coverage: number;
  spread: number;
  onsetErrorMs: number | null;
  /** Live only: the note's window has not finished, so it cannot be "missed" yet. */
  pending: boolean;
  /** Live only: the note's window has not begun. */
  future: boolean;
}

export interface Timeline {
  tracked: TrackedFrame[];
  /** Window-centre times on the clock of the targets (latency removed). */
  times: number[];
  hop: number;
}

function timeline(frames: readonly PitchFrame[], profile: LearnerProfile): Timeline {
  const hop = hopSecOf(frames);
  const windowSec = (WINDOW_SIZE / HOP_SIZE) * hop;
  const tracker = new PitchTracker({ ...trackerOptionsFor(profile), windowSec });
  const latency = (Number.isFinite(profile.singLatencyMs) ? profile.singLatencyMs : 0) / 1000;
  const tracked: TrackedFrame[] = [];
  const times: number[] = [];
  for (const frame of frames) {
    tracked.push(tracker.push(frame));
    times.push(frame.t - windowSec / 2 - latency);
  }
  return { tracked, times, hop };
}

/** First index whose time is ≥ `t` (times are ascending). */
function lowerBound(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A learner who starts late is graded on the pitch they sang, not on the tail of the note before. */
export const MAX_LATE_START_SEC = 0.6;
const MAX_EARLY_START_SEC = 0.1;

function pitchHits(
  tl: Timeline,
  targets: readonly SungTarget[],
  tol: SingTolerance,
  shift: number,
  now: number | null,
): number {
  const { tracked, times } = tl;
  let hits = 0;
  for (const target of targets) {
    const dur = Math.max(0, target.off - target.on);
    const a = target.on + shift + Math.min(0.08, 0.25 * dur);
    let b = target.off + shift - 0.1 * dur;
    if (now !== null) b = Math.min(b, now);
    if (b <= a) continue;
    const to = lowerBound(times, b + EPS);
    for (let i = lowerBound(times, a); i < to; i++) {
      const m = (tracked[i] as TrackedFrame).midi;
      if (m !== null && Math.abs(centsFrom(m, target.midi, tol.octave !== "exact")) <= 100) hits++;
    }
  }
  return hits;
}

/**
 * Timed modes: the one shift of the whole take (−0.1 s to +min(0.6 s, the shortest note)) that best lines the
 * sung pitches up with the targets, in hops. A learner who comes in late on a sung pattern then keeps credit
 * for every note they sang in tune; timing is still judged against the beat (`onsetErrorMs`). The shift is
 * adopted only when it explains clearly more frames than no shift (≥ 3 frames and ≥ 15 % more).
 */
export function startShiftOf(
  tl: Timeline,
  targets: readonly SungTarget[],
  tol: SingTolerance,
  now: number | null,
): number {
  if (targets.length === 0 || tl.times.length === 0) return 0;
  const shortest = Math.min(...targets.map((t) => Math.max(0, t.off - t.on)));
  const late = Math.min(MAX_LATE_START_SEC, shortest);
  const base = pitchHits(tl, targets, tol, 0, now);
  const step = tl.hop;
  const scored: [number, number][] = [];
  for (let k = Math.ceil(-MAX_EARLY_START_SEC / step); k * step <= late + EPS; k++) {
    const shift = k * step;
    scored.push([shift, k === 0 ? base : pitchHits(tl, targets, tol, shift, now)]);
  }
  const bestHits = Math.max(...scored.map(([, h]) => h));
  if (bestHits < base + Math.max(3, 0.15 * base)) return 0;
  // The windows are shorter than the notes, so a range of shifts fits equally well: take its middle.
  const plateau = scored.filter(([, h]) => h === bestHits).map(([shift]) => shift);
  return median(plateau);
}

function timedEstimates(
  tl: Timeline,
  targets: readonly SungTarget[],
  tol: SingTolerance,
  now: number | null,
  shift = 0,
): Estimate[] {
  const { tracked, times, hop } = tl;
  return targets.map((target) => {
    const dur = Math.max(0, target.off - target.on);
    const a = target.on + shift + Math.min(0.08, 0.25 * dur);
    const b = target.off + shift - 0.1 * dur;
    const future = now !== null && now < a;
    const pending = now !== null && now < b;
    const end = pending ? Math.min(b, now as number) : b;
    const from = lowerBound(times, a);
    const to = lowerBound(times, end + EPS);
    const voiced: number[] = [];
    for (let i = from; i < to; i++) {
      const m = (tracked[i] as TrackedFrame).midi;
      if (m !== null) voiced.push(m);
    }
    const expected = Math.max(to - from, Math.round((end - a) / hop), 1);
    const sungMidi = voiced.length > 0 ? median(voiced) : null;
    const spread =
      sungMidi === null
        ? 0
        : quantile(
            voiced.map((m) => Math.abs(m - sungMidi) * 100),
            0.9,
          );
    // Onset: the first voiced frame within a semitone of the target (any octave unless `exact`), ±250 ms
    // around where the learner's shifted take puts it; the error is measured from the beat itself.
    let onsetErrorMs: number | null = null;
    if (tol.onsetMs !== undefined) {
      const lo = lowerBound(times, target.on + shift - 0.25);
      const hi = lowerBound(times, target.on + shift + 0.25 + EPS);
      for (let i = lo; i < hi; i++) {
        const m = (tracked[i] as TrackedFrame).midi;
        if (m !== null && Math.abs(centsFrom(m, target.midi, tol.octave !== "exact")) <= 100) {
          onsetErrorMs = ((times[i] as number) - target.on) * 1000;
          break;
        }
      }
    }
    return {
      sungMidi,
      coverage: future ? 0 : Math.min(1, voiced.length / expected),
      spread,
      onsetErrorMs,
      pending,
      future,
    };
  });
}

/** Needleman–Wunsch on folded pitch: match cost min(1, |cents| / 100), a skipped target or sung note costs 1. */
export function alignSung(
  targets: readonly number[],
  sung: readonly number[],
  opts: { fold?: boolean; freeTail?: boolean } = {},
): (number | null)[] {
  const n = targets.length;
  const m = sung.length;
  const fold = opts.fold ?? true;
  const cost = (i: number, j: number): number =>
    Math.min(1, Math.abs(centsFrom(sung[j] as number, targets[i] as number, fold)) / 100);
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) (d[i] as number[])[0] = i;
  for (let j = 1; j <= m; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      (d[i] as number[])[j] = Math.min(
        ((d[i - 1] as number[])[j - 1] as number) + cost(i - 1, j - 1),
        ((d[i - 1] as number[])[j] as number) + 1,
        ((d[i] as number[])[j - 1] as number) + 1,
      );
    }
  }
  // Live: targets after the last sung note are still to come, so the tail of the target row is free.
  let i = n;
  if (opts.freeTail) {
    let best = n;
    for (let k = n; k >= 0; k--)
      if (((d[k] as number[])[m] as number) < ((d[best] as number[])[m] as number)) best = k;
    i = best;
  }
  const match: (number | null)[] = new Array<number | null>(n).fill(null);
  let j = m;
  while (i > 0 && j > 0) {
    const here = (d[i] as number[])[j] as number;
    if (Math.abs(here - (((d[i - 1] as number[])[j - 1] as number) + cost(i - 1, j - 1))) < EPS) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (Math.abs(here - (((d[i - 1] as number[])[j] as number) + 1)) < EPS) {
      i--;
    } else {
      j--;
    }
  }
  return match;
}

function freeEstimates(
  notes: readonly SungNote[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  live: boolean,
): { estimates: Estimate[]; match: (number | null)[] } {
  const match = alignSung(
    targets.map((t) => t.midi),
    notes.map((n) => n.midi),
    { fold: tol.octave !== "exact", freeTail: live },
  );
  let lastMatched = -1;
  match.forEach((j, i) => {
    if (j !== null) lastMatched = i;
  });
  const estimates = match.map((j, i): Estimate => {
    const note = j === null ? undefined : notes[j];
    if (!note) {
      const future = live && i > lastMatched;
      return { sungMidi: null, coverage: 0, spread: 0, onsetErrorMs: null, pending: future, future };
    }
    return {
      sungMidi: note.midi,
      coverage: 1,
      spread: note.centsSpread,
      onsetErrorMs: null,
      pending: false,
      future: false,
    };
  });
  return { estimates, match };
}

/** How well the sung inter-onset intervals keep the proportions of the target's (1 = the same rhythm at any tempo). */
function rhythmScore(
  notes: readonly SungNote[],
  targets: readonly SungTarget[],
  match: readonly (number | null)[],
): number | null {
  const pairs: [SungTarget, SungNote][] = [];
  match.forEach((j, i) => {
    const note = j === null ? undefined : notes[j];
    const target = targets[i];
    if (note && target) pairs.push([target, note]);
  });
  const ratios: number[] = [];
  for (let k = 1; k < pairs.length; k++) {
    const [t1, n1] = pairs[k] as [SungTarget, SungNote];
    const [t0, n0] = pairs[k - 1] as [SungTarget, SungNote];
    const want = t1.on - t0.on;
    const got = n1.start - n0.start;
    if (want > 0 && got > 0) ratios.push(Math.log2(got / want));
  }
  if (ratios.length < 2) return null;
  const tempo = median(ratios);
  return mean(ratios.map((r) => Math.max(0, 1 - Math.abs(r - tempo))));
}

function modeOf(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (
      c > bestCount ||
      (c === bestCount && (Math.abs(v) < Math.abs(best) || (Math.abs(v) === Math.abs(best) && v > best)))
    ) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function grade(
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
  now: number | null,
): SungResult {
  const tolCents = resolveSingTolerance(tol, profile);
  const timed = TIMED_MODES.includes(mode);
  const live = now !== null;
  const tl = timeline(frames, profile);

  if (tol.lenient) return gradeLenient(tl, frames, targets, tol, mode, tolCents, now, profile);

  let estimates: Estimate[];
  let rhythm: number | null = null;
  let startShiftSec = 0;
  if (timed) {
    startShiftSec = startShiftOf(tl, targets, tol, now);
    estimates = timedEstimates(tl, targets, tol, now, startShiftSec);
  } else {
    const windowSec = (WINDOW_SIZE / HOP_SIZE) * tl.hop;
    const tracker = new PitchTracker({ ...trackerOptionsFor(profile), windowSec });
    for (const frame of frames) tracker.push(frame);
    const notes = tracker.flush();
    const free = freeEstimates(notes, targets, tol, live);
    estimates = free.estimates;
    if (mode === "echo") rhythm = rhythmScore(notes, targets, free.match);
  }

  // Octave policy.
  const sung = estimates.map((e, i) => {
    const target = targets[i] as SungTarget;
    const usable = e.sungMidi !== null && !e.future && (e.pending || e.coverage >= tol.minCoverage - EPS);
    return usable ? { midi: e.sungMidi as number, raw: ((e.sungMidi as number) - target.midi) * 100 } : null;
  });
  const globalShift =
    tol.octave === "global"
      ? modeOf(sung.filter((s) => s !== null).map((s) => Math.round((s as { raw: number }).raw / 1200)))
      : 0;
  const errors: (number | null)[] = [];
  const octaveShifts: number[] = [];
  const jumped: boolean[] = [];
  const beyond: boolean[] = [];
  sung.forEach((s, i) => {
    if (!s) {
      errors[i] = null;
      octaveShifts[i] = 0;
      jumped[i] = false;
      beyond[i] = false;
      return;
    }
    if (tol.octave === "exact") {
      errors[i] = s.raw;
      octaveShifts[i] = 0;
      jumped[i] = false;
      beyond[i] = false;
    } else if (tol.octave === "per-note") {
      const folded = centsFrom(s.midi, (targets[i] as SungTarget).midi, true);
      errors[i] = folded;
      octaveShifts[i] = Math.round((s.raw - folded) / 1200);
      jumped[i] = false;
      beyond[i] = false;
    } else {
      const rel = s.raw - 1200 * globalShift;
      const extra = Math.round(rel / 1200);
      errors[i] = rel - 1200 * extra;
      octaveShifts[i] = globalShift + extra;
      jumped[i] = Math.abs(extra) === 1;
      beyond[i] = Math.abs(extra) > 1;
    }
  });

  // Drift compensation.
  // Blue targets (bent toward a neighbour on purpose) say nothing about drift.
  const near = errors.filter(
    (e, i): e is number => e !== null && Math.abs(e) < 100 && !(targets[i] as SungTarget).blue,
  );
  const drift = near.length > 0 ? median(near) : 0;
  const compensate = near.length >= DRIFT_MIN_NOTES && Math.abs(drift) <= tol.driftCompCents + EPS;
  const diagnostics: Diagnostic[] = [];
  const notes: SungNoteResult[] = estimates.map((e, i) => {
    const target = targets[i] as SungTarget;
    const where = { slot: i, tSec: target.on };
    const raw = errors[i] ?? null;
    const cents = raw === null ? null : compensate ? raw - drift : raw;
    const base = {
      index: i,
      targetMidi: target.midi,
      coverage: e.coverage,
      octaveShift: octaveShifts[i] ?? 0,
    };
    if (cents === null) {
      // Not sung (or not yet: a live note whose window is still open is never "missed").
      const missed = !e.pending && !e.future;
      if (missed) {
        diagnostics.push({
          id: "sing.missed",
          severity: "error",
          dim: "coverage",
          where,
          params: { i: i + 1, exp: midiName(target.midi), expMidi: target.midi },
        });
      }
      return {
        ...base,
        sungMidi: null,
        cents: null,
        credit: 0,
        timingCredit: timed && tol.onsetMs !== undefined && missed ? 0 : null,
        onsetErrorMs: null,
        feedback: missed ? "sing.missed" : null,
      };
    }
    const sungMidi = target.midi + cents / 100;
    // A blue note sung toward its neighbour is judged against the nearer of the two (Wave 5, U11).
    const bend = blueBend(target, cents);
    const judged = bend === null ? cents : cents - 100 * bend;
    let credit: number = beyond[i] ? 0 : sungCredit(Math.abs(judged), tolCents);
    let feedback: SungNoteResult["feedback"] = null;
    const dir = judged > 0 ? "sharp" : "flat";
    const params = {
      i: i + 1,
      exp: midiName(target.midi),
      expMidi: target.midi,
      got: midiName((e.sungMidi as number) - (compensate ? drift / 100 : 0)),
      gotMidi: Math.round(((e.sungMidi as number) - (compensate ? drift / 100 : 0)) * 100) / 100,
      cents: Math.round(Math.abs(judged)),
      dir,
    };
    if (bend !== null && credit === 1 && !jumped[i]) {
      diagnostics.push({
        id: "sing.blue-note",
        severity: "info",
        dim: "pitch",
        where,
        params: {
          ...params,
          toward: midiName(target.midi + bend),
          towardMidi: target.midi + bend,
          cents: Math.round(Math.abs(cents)),
          dir: bend > 0 ? "above" : "below",
        },
      });
    }
    if (credit === 0) {
      feedback = "sing.wrong-note";
      diagnostics.push({ id: "sing.wrong-note", severity: "error", dim: "pitch", where, params });
    } else if (jumped[i]) {
      credit = 0.5;
      feedback = "sing.octave-jump";
      diagnostics.push({ id: "sing.octave-jump", severity: "info", dim: "pitch", where, params });
    } else if (credit === 0.5) {
      feedback = judged > 0 ? "sing.sharp" : "sing.flat";
      diagnostics.push({ id: feedback, severity: "warn", dim: "cents", where, params });
    }
    if (e.spread > 60) {
      diagnostics.push({
        id: "sing.unstable",
        severity: "info",
        dim: "cents",
        where,
        params: { i: i + 1, cents: Math.round(e.spread) },
      });
    }
    let timingCredit: number | null = null;
    let onsetErrorMs: number | null = null;
    if (timed && tol.onsetMs !== undefined) {
      onsetErrorMs = e.onsetErrorMs;
      if (onsetErrorMs === null) timingCredit = e.pending ? null : 0;
      else if (Math.abs(onsetErrorMs) <= tol.onsetMs + EPS) timingCredit = 1;
      else if (Math.abs(onsetErrorMs) <= 2 * tol.onsetMs + EPS) timingCredit = 0.5;
      else timingCredit = 0;
      if (onsetErrorMs !== null && timingCredit !== null && timingCredit < 1) {
        diagnostics.push({
          id: onsetErrorMs < 0 ? "sing.early" : "sing.late",
          severity: "warn",
          dim: "timing",
          where,
          params: {
            i: i + 1,
            ms: Math.round(Math.abs(onsetErrorMs)),
            dir: onsetErrorMs < 0 ? "early" : "late",
          },
        });
      }
    }
    const result: SungNoteResult = { ...base, sungMidi, cents, credit, timingCredit, onsetErrorMs, feedback };
    if (bend !== null) result.blue = { neighbourMidi: target.midi + bend, judgedCents: judged };
    return result;
  });

  if (Math.abs(drift) > 15 && near.length >= DRIFT_MIN_NOTES) {
    diagnostics.push({
      id: "sing.drift",
      severity: "info",
      dim: "cents",
      params: { cents: Math.round(Math.abs(drift)), dir: drift > 0 ? "sharp" : "flat" },
    });
  }

  const voicedCount = tl.tracked.reduce((n, f) => n + (f.voiced ? 1 : 0), 0);
  const take = live ? undefined : takeQuality(frames, profile);
  if (take && targets.length > 0) {
    // Nothing voiced, or only blips while every note was missed: not an attempt, and the reason says why.
    const blipsOnly = take.heard === "too-short" && notes.every((n) => n.feedback === "sing.missed");
    if (voicedCount === 0 || blipsOnly) diagnostics.unshift(noVoiceDiagnostic(frames, take));
  }
  if (take?.clipped) diagnostics.push(clippedDiagnostic(take));

  // Score and pass. Live: only the notes whose window has closed count.
  const settled = notes.filter(
    (_, i) => !(estimates[i] as Estimate).pending && !(estimates[i] as Estimate).future,
  );
  const pitch = settled.length > 0 ? mean(settled.map((n) => n.credit)) : 0;
  const missed = settled.filter((n) => n.feedback === "sing.missed").length;
  const timings = settled.map((n) => n.timingCredit).filter((t): t is number => t !== null);
  const timing = timings.length > 0 ? mean(timings) : null;
  let score = pitch;
  const dims: SungResult["dims"] = { pitch: { score: pitch, weight: 1, n: settled.length } };
  if (mode === "sight" && timing !== null) {
    score = 0.75 * pitch + 0.25 * timing;
    dims.pitch = { score: pitch, weight: 0.75, n: settled.length };
    dims.timing = { score: timing, weight: 0.25, n: timings.length };
  } else if (mode === "echo" && rhythm !== null) {
    score = 0.85 * pitch + 0.15 * rhythm;
    dims.pitch = { score: pitch, weight: 0.85, n: settled.length };
    dims.rhythm = { score: rhythm, weight: 0.15 };
  } else if (timing !== null) {
    dims.timing = { score: timing, weight: 0, n: timings.length };
  }
  if (settled.length > 0) {
    dims.coverage = { score: mean(settled.map((n) => n.coverage)), weight: 0, n: settled.length };
  }
  const abs = settled
    .map((n) => n.blue?.judgedCents ?? n.cents)
    .filter((c): c is number => c !== null)
    .map(Math.abs);
  const complete = settled.length === targets.length;
  return {
    score,
    pass: targets.length > 0 && complete && pitch >= tol.passHitRate - EPS && missed <= 1,
    dims,
    diagnostics,
    notes,
    driftCents: drift,
    medianAbsCents: abs.length > 0 ? median(abs) : null,
    mode,
    tolCents,
    startShiftSec,
    ...(take ? { take } : {}),
  };
}

/**
 * Wave 5 (U11 blue notes): the neighbouring semitone (+1 or −1) a blue target was sung toward, when the pitch lies
 * nearer to it than to the target and on a side the target allows (`SungTarget.blue.toward`); otherwise `null`
 * and the note is judged against the target alone.
 */
export function blueBend(target: Pick<SungTarget, "blue">, cents: number): 1 | -1 | null {
  if (!target.blue || cents === 0) return null;
  const side: 1 | -1 = cents > 0 ? 1 : -1;
  if (target.blue.toward !== 0 && target.blue.toward !== side) return null;
  return Math.abs(cents - 100 * side) < Math.abs(cents) ? side : null;
}

/**
 * `sing.no-voice`, with why: `reason` is `none` (nothing heard), `noisy` (a voice the room drowned, or a room
 * loud enough to pass the level gate) or `short` (only blips, none held). `more` carries the advice; the
 * catalog appends it, and callers that only test the code keep treating the take as no attempt.
 */
function noVoiceDiagnostic(frames: readonly PitchFrame[], take: TakeQuality): Diagnostic {
  const level = median(frames.map((f) => f.rms));
  const db = Number.isFinite(level) && level > 0 ? Math.round(rmsDb(level)) : -120;
  if (take.heard === "too-noisy")
    return {
      id: "sing.no-voice",
      severity: "error",
      params: {
        db,
        reason: "noisy",
        more: " There was sound, but too much noise around it to follow a pitch: a quieter spot, or singing closer to the mic, helps.",
      },
    };
  if (take.heard === "too-short")
    return {
      id: "sing.no-voice",
      severity: "error",
      params: {
        db,
        reason: "short",
        ms: Math.round(take.longestVoicedSec * 1000),
        more: ` I heard only short sounds, the longest ${Math.round(take.longestVoicedSec * 1000)} ms: hold each note for about half a second.`,
      },
    };
  return { id: "sing.no-voice", severity: "error", params: { db, reason: "none" } };
}

/** `sing.clipped`: the input hit full scale, so pitch and level readings are distorted. */
function clippedDiagnostic(take: TakeQuality): Diagnostic {
  return { id: "sing.clipped", severity: "warn", dim: "pitch", params: { n: take.clippedFrames } };
}

/** Voiced share and median folded error of the best 600 ms span of `[from, to)` for `targetMidi`. */
function bestSpan(
  tl: Timeline,
  from: number,
  to: number,
  targetMidi: number,
  minCoverage: number,
): { coverage: number; cents: number | null; sungMidi: number | null } {
  const { tracked, times, hop } = tl;
  const span = LENIENT_SPAN_SEC;
  let best: { coverage: number; cents: number | null; sungMidi: number | null } = {
    coverage: 0,
    cents: null,
    sungMidi: null,
  };
  const i0 = lowerBound(times, from);
  const i1 = lowerBound(times, to);
  const need = Math.max(1, Math.round(span / hop));
  for (let start = i0; start + need <= i1 || (start === i0 && i1 > i0); start++) {
    const end = Math.min(i1, start + need);
    const voiced: number[] = [];
    for (let i = start; i < end; i++) {
      const m = (tracked[i] as TrackedFrame).midi;
      if (m !== null) voiced.push(m);
    }
    const coverage = voiced.length / need;
    if (voiced.length === 0) continue;
    const sung = median(voiced);
    const cents = centsFrom(sung, targetMidi, true);
    const ok = coverage >= minCoverage - EPS;
    const bestOk = best.coverage >= minCoverage - EPS;
    // Prefer a sustained span; among those, the one nearest the target.
    if (
      (ok && !bestOk) ||
      (ok && bestOk && Math.abs(cents) < Math.abs(best.cents ?? Number.POSITIVE_INFINITY)) ||
      (!ok && !bestOk && coverage > best.coverage)
    ) {
      best = { coverage, cents, sungMidi: sung };
    }
    if (end === i1) break;
  }
  return best;
}

export const LENIENT_SPAN_SEC = 0.6;
export const LENIENT_CENTS = 100;

/**
 * `tol.lenient` (contracts §8.1 item 8, U00.L02's first sung note): any sustained pitch, coverage ≥ `minCoverage`
 * over 600 ms, within ±100¢ of the target after per-note octave folding, passes; the ladder's `cents` is
 * ignored. A target is searched from its onset to the next target's (the last one: to the end of the take), so
 * a learner who comes in late still passes.
 */
function gradeLenient(
  tl: Timeline,
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  tolCents: SingTolCents,
  now: number | null,
  profile: LearnerProfile,
): SungResult {
  const lastT = tl.times.length > 0 ? (tl.times[tl.times.length - 1] as number) : 0;
  const diagnostics: Diagnostic[] = [];
  const notes: SungNoteResult[] = targets.map((target, i) => {
    const next = targets[i + 1];
    const to = next ? next.on : Math.max(target.off, lastT + EPS);
    const until = now === null ? to : Math.min(to, now);
    const b = bestSpan(tl, target.on, until + EPS, target.midi, tol.minCoverage);
    const sustained = b.coverage >= tol.minCoverage - EPS && b.cents !== null;
    const inTune = sustained && Math.abs(b.cents as number) <= LENIENT_CENTS + EPS;
    const open = now !== null && now < to;
    const where = { slot: i, tSec: target.on };
    let feedback: SungNoteResult["feedback"] = null;
    if (!inTune && !open) {
      if (!sustained) {
        feedback = "sing.missed";
        diagnostics.push({
          id: "sing.missed",
          severity: "error",
          dim: "coverage",
          where,
          params: { i: i + 1, exp: midiName(target.midi), expMidi: target.midi },
        });
      } else {
        feedback = "sing.wrong-note";
        const c = b.cents as number;
        diagnostics.push({
          id: "sing.wrong-note",
          severity: "error",
          dim: "pitch",
          where,
          params: {
            i: i + 1,
            exp: midiName(target.midi),
            expMidi: target.midi,
            got: midiName(b.sungMidi as number),
            gotMidi: Math.round((b.sungMidi as number) * 100) / 100,
            cents: Math.round(Math.abs(c)),
            dir: c > 0 ? "sharp" : "flat",
          },
        });
      }
    }
    return {
      index: i,
      targetMidi: target.midi,
      sungMidi: b.cents === null ? null : target.midi + b.cents / 100,
      cents: b.cents,
      coverage: b.coverage,
      credit: inTune ? 1 : 0,
      timingCredit: null,
      onsetErrorMs: null,
      octaveShift:
        b.sungMidi === null || b.cents === null
          ? 0
          : Math.round(((b.sungMidi - target.midi) * 100 - b.cents) / 1200),
      feedback,
    };
  });
  const take = now === null ? takeQuality(frames, profile) : undefined;
  if (take && targets.length > 0 && !tl.tracked.some((f) => f.voiced))
    diagnostics.unshift(noVoiceDiagnostic(frames, take));
  if (take?.clipped) diagnostics.push(clippedDiagnostic(take));
  const settled = notes.filter((n) => n.credit === 1 || n.feedback !== null);
  const pitch = settled.length > 0 ? mean(settled.map((n) => n.credit)) : 0;
  return {
    score: pitch,
    pass: targets.length > 0 && notes.every((n) => n.credit === 1),
    dims: { pitch: { score: pitch, weight: 1, n: settled.length } },
    diagnostics,
    notes,
    driftCents: 0,
    // The lenient first sing never feeds the ladder (it is a calibration of sorts).
    medianAbsCents: null,
    mode,
    tolCents,
    startShiftSec: 0,
    ...(take ? { take } : {}),
  };
}
/**
 * Timed modes (`pitch`, `degree`, `sight`): each target window is `[on + min(80 ms, 0.25·dur), off − 0.1·dur]`
 * after latency compensation (frame centre minus `profile.singLatencyMs`); the estimate is the median of
 * the voiced frames in it. Free modes (`echo`, `resolution`, `bassline`): segment, then Needleman–Wunsch on
 * folded pitch. Per-note credit: coverage below `minCoverage` → 0; |e| ≤ T → 1; ≤ min(2T, 100) → 0.5; else 0.
 * Pass: mean pitch credit ≥ `passHitRate` (0.8) and at most 1 missed note. Targets must already be
 * transposed into the learner's comfort range (`fitToRange`).
 */
export function gradeSung(
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
  opts: GradeSungOptions = {},
): SungResult {
  const result = grade(frames, targets, tol, mode, profile, null);
  return withBleed(result, frames, targets, profile, opts);
}

/** What a host knows about the take beyond its frames. */
export interface GradeSungOptions {
  /** Notes the host played around the take (AudioContext seconds): the bleed check reads them. */
  playing?: readonly SungTarget[];
}

/**
 * Contracts §8.6: a take whose playback-only spans the mic heard as the playback (`bleedReport`) is not the
 * learner's voice. It fails with `sing.bleed` (an error: not an attempt), scores 0 and feeds no ladder; the host
 * shows the line and offers the fallback. Without annotated frames or listed notes nothing changes.
 */
function withBleed(
  result: SungResult,
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  profile: LearnerProfile,
  opts: GradeSungOptions,
): SungResult {
  const listened = (opts.playing?.length ?? 0) > 0 || frames.some((f) => f.playing !== undefined);
  if (!listened) return result;
  const latencySec = Number.isFinite(profile.singLatencyMs) ? profile.singLatencyMs / 1000 : 0;
  const report = bleedReport(frames, {
    ...(opts.playing ? { playing: opts.playing } : {}),
    singing: targets,
    latencySec,
  });
  if (!report.bleed) return result;
  return {
    ...result,
    score: 0,
    pass: false,
    medianAbsCents: null,
    diagnostics: [
      {
        id: "sing.bleed",
        severity: "error",
        params: {
          ms: Math.round(report.heardSec * 1000),
          playbackMs: Math.round(report.playbackOnlySec * 1000),
        },
      },
      ...result.diagnostics.filter((d) => d.id !== "sing.no-voice"),
    ],
  };
}

/**
 * The incremental form: the same per-note credit for the frames received so far. `now` is the
 * AudioContext time. A note whose window has not closed is never "missed"; `pass` stays false until every
 * note is settled. Drives the live PitchLane.
 */
export function gradeSungLive(
  frames: readonly PitchFrame[],
  targets: readonly SungTarget[],
  tol: SingTolerance,
  mode: SingMode,
  profile: LearnerProfile,
  now: number,
): SungResult {
  const last = frames[frames.length - 1];
  const hop = hopSecOf(frames);
  // "Now" on the clock of the targets: the newest analysed moment, never later than the newest frame.
  const lag =
    ((WINDOW_SIZE / HOP_SIZE) * hop) / 2 +
    (Number.isFinite(profile.singLatencyMs) ? profile.singLatencyMs : 0) / 1000;
  const heard = Math.min(now, last ? last.t : now) - lag;
  return grade(frames, targets, tol, mode, profile, heard);
}

/** The first sing of U00.L02: any sustained pitch (coverage ≥ 0.4 for 600 ms) within ±100¢ after per-note folding. */
export function firstSingPasses(
  frames: readonly PitchFrame[],
  tonicMidi: number,
  profile: LearnerProfile,
): boolean {
  const { tracked, times } = timeline(frames, profile);
  const span = 0.6;
  let from = 0;
  for (let to = 0; to < times.length; to++) {
    while ((times[to] as number) - (times[from] as number) > span + EPS) from++;
    if ((times[to] as number) - (times[from] as number) < span - hopSecOf(frames) - EPS) continue;
    const voiced: number[] = [];
    for (let i = from; i <= to; i++) {
      const m = (tracked[i] as TrackedFrame).midi;
      if (m !== null) voiced.push(m);
    }
    if (voiced.length / (to - from + 1) < 0.4) continue;
    if (Math.abs(centsFrom(median(voiced), tonicMidi, true)) <= 100 + EPS) return true;
  }
  return false;
}

/** Octave shift (multiple of 12) that puts `midis` inside the learner's comfort range. */
export function fitToRange(
  midis: readonly number[],
  profile: Pick<LearnerProfile, "comfLow" | "comfHigh" | "rangeLow" | "rangeHigh">,
): number {
  if (midis.length === 0) return 0;
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  const overflow = (shift: number, low: number, high: number): number =>
    Math.max(0, low - (lo + shift)) + Math.max(0, hi + shift - high);
  const centre = (profile.comfLow + profile.comfHigh) / 2;
  let best = 0;
  let bestKey: [number, number, number, number] | null = null;
  for (let k = -6; k <= 6; k++) {
    const shift = 12 * k;
    // Inside the comfort range first; then inside the full range; then nearest the comfort centre; then the smallest move.
    const key: [number, number, number, number] = [
      overflow(shift, profile.comfLow, profile.comfHigh),
      overflow(shift, profile.rangeLow, profile.rangeHigh),
      Math.abs((lo + hi) / 2 + shift - centre),
      Math.abs(k),
    ];
    if (bestKey === null || lexLess(key, bestKey)) {
      best = shift;
      bestKey = key;
    }
  }
  return best;
}
function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (Math.abs(d) > EPS) return d < 0;
  }
  return false;
}

/**
 * Voiced frames within 30¢ of the playing note for more than 300 ms in playback-only spans: the mic hears the
 * speakers. `playing` lists what the host played; frames the mic session annotated (`PitchFrame.playing`) count
 * too. The rule lives in `bleed.ts` (`bleedReport`).
 */
export function detectBleed(frames: readonly PitchFrame[], playing: readonly SungTarget[]): boolean {
  return bleedReport(frames, { playing }).bleed;
}

/**
 * Vocal range from a sweep (the learner holds their lowest and highest comfortable notes, or slides between
 * them). A pitch counts once the voice has spent 150 ms at or beyond it, so a crack or an octave error
 * cannot set the range. The comfort range is the range minus a fifth of its width at each end (at least
 * 2 semitones, at most 4), and never narrower than an octave when the range allows one.
 */
export function estimateRange(frames: readonly PitchFrame[]): RangeEstimate | null {
  const hop = hopSecOf(frames);
  const tracker = new PitchTracker({ windowSec: (WINDOW_SIZE / HOP_SIZE) * hop });
  const voiced: number[] = [];
  for (const frame of frames) {
    const m = tracker.push(frame).midi;
    if (m !== null) voiced.push(m);
  }
  const need = Math.max(3, Math.round(0.15 / hop));
  if (voiced.length < 2 * need) return null;
  voiced.sort((a, b) => a - b);
  const low = Math.round(voiced[need - 1] as number);
  const high = Math.round(voiced[voiced.length - need] as number);
  const width = high - low;
  const trim = Math.min(4, Math.max(2, Math.round(width / 5)));
  let comfLow = low + trim;
  let comfHigh = high - trim;
  if (comfHigh - comfLow < 12) {
    if (width >= 12) {
      const mid = (low + high) / 2;
      comfLow = Math.ceil(mid - 6);
      comfHigh = comfLow + 12;
    } else {
      comfLow = low;
      comfHigh = high;
    }
  }
  return { low, high, comfLow, comfHigh, voicedSec: voiced.length * hop };
}
/** As `estimateRange`; throws a `RangeError` when the take holds no sustained voice (fewer than 300 ms voiced). */
export function calibrateRange(frames: readonly PitchFrame[]): {
  low: number;
  high: number;
  comfLow: number;
  comfHigh: number;
} {
  const range = estimateRange(frames);
  if (!range) throw new RangeError("@oak/pitch: calibrateRange needs at least 300 ms of sustained voice");
  return { low: range.low, high: range.high, comfLow: range.comfLow, comfHigh: range.comfHigh };
}
