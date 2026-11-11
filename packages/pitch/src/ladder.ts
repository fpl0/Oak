// The sung-tolerance ladder 70 → 50 → 35 → 25 (contracts §8.2). Performance-based only: never by unit,
// never by date. It tightens one rung when, on 3 distinct days within 21, each with at least 8 graded
// sung notes, the day's median |error| is at or under the rung's threshold. It never tightens while a
// checkpoint is pending, never moves in `fixed` mode and never loosens by itself.
import type { SingTolCents } from "@oak/content-kit";
import type { LadderProgress, SingDayStat } from "./types.ts";

export const SING_TOL_LADDER: readonly SingTolCents[] = [70, 50, 35, 25];
/** Median |e| a day must reach to count towards leaving a rung. */
export const LADDER_THRESHOLDS: Readonly<Record<SingTolCents, number | null>> = {
  70: 35,
  50: 25,
  35: 20,
  25: null,
};
export const LADDER_DAYS_NEEDED = 3;
export const LADDER_WINDOW_DAYS = 21;
export const LADDER_MIN_NOTES = 8;
/** After a gap this long (days without singing) Settings offers a one-tap loosen. */
export const LADDER_LOOSEN_GAP_DAYS = 21;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Days since 1970-01-01 of a `yyyy-mm-dd` string (calendar maths, no time zone), or `null` when malformed. */
export function dayNumber(day: string): number | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(ms);
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null;
  return Math.round(ms / 86_400_000);
}

export function finerTolerance(current: SingTolCents): SingTolCents | null {
  const i = SING_TOL_LADDER.indexOf(current);
  return i >= 0 && i < SING_TOL_LADDER.length - 1 ? (SING_TOL_LADDER[i + 1] as SingTolCents) : null;
}
export function looserTolerance(current: SingTolCents): SingTolCents | null {
  const i = SING_TOL_LADDER.indexOf(current);
  return i > 0 ? (SING_TOL_LADDER[i - 1] as SingTolCents) : null;
}

export interface LadderOptions {
  /** `yyyy-mm-dd`, the learner's local day. */
  today: string;
  checkpointPending: boolean;
  mode: "auto" | "fixed";
  /**
   * Day of the last change of rung. Days on or before it do not count for the next rung, so the days
   * that earned one step never earn the next one too.
   */
  since?: string;
}

/**
 * Merges the stats of one day: the notes add up and the day's median is approximated by the
 * notes-weighted mean of the medians (callers normally send one row per day).
 */
function byDay(days: readonly SingDayStat[]): Map<string, SingDayStat> {
  const out = new Map<string, SingDayStat>();
  for (const d of days) {
    if (!(d.gradedNotes > 0) || !Number.isFinite(d.medianAbsCents)) continue;
    const prev = out.get(d.day);
    if (!prev) {
      out.set(d.day, { ...d });
      continue;
    }
    const n = prev.gradedNotes + d.gradedNotes;
    out.set(d.day, {
      day: d.day,
      gradedNotes: n,
      medianAbsCents: (prev.medianAbsCents * prev.gradedNotes + d.medianAbsCents * d.gradedNotes) / n,
    });
  }
  return out;
}

/** Where the learner stands on the ladder: what `nextSingTolerance` returns and why. */
export function ladderProgress(
  current: SingTolCents,
  days: readonly SingDayStat[],
  opts: LadderOptions,
): LadderProgress {
  const target = finerTolerance(current);
  const thresholdCents = LADDER_THRESHOLDS[current] ?? null;
  const today = dayNumber(opts.today);
  if (today === null) throw new RangeError(`@oak/pitch: bad day "${opts.today}" (want yyyy-mm-dd)`);
  const since = opts.since === undefined ? null : dayNumber(opts.since);
  const qualifyingDays: string[] = [];
  if (thresholdCents !== null) {
    for (const d of byDay(days).values()) {
      const n = dayNumber(d.day);
      if (n === null || n > today || today - n >= LADDER_WINDOW_DAYS) continue;
      if (since !== null && n <= since) continue;
      if (d.gradedNotes >= LADDER_MIN_NOTES && d.medianAbsCents <= thresholdCents) qualifyingDays.push(d.day);
    }
    qualifyingDays.sort();
  }
  let blockedBy: LadderProgress["blockedBy"] = null;
  if (opts.mode === "fixed") blockedBy = "fixed-mode";
  else if (target === null) blockedBy = "at-finest";
  else if (opts.checkpointPending) blockedBy = "checkpoint-pending";
  else if (qualifyingDays.length < LADDER_DAYS_NEEDED) blockedBy = "not-enough-days";
  return {
    current,
    next: blockedBy === null && target !== null ? target : current,
    target,
    thresholdCents,
    qualifyingDays,
    daysNeeded: LADDER_DAYS_NEEDED,
    blockedBy,
  };
}

/**
 * The tolerance ladder 70 → 50 → 35 → 25 (contracts §8.2): tightens one rung after 3 distinct days within
 * 21 (today included), each with ≥ 8 graded sung notes, whose median |e| is ≤ 35¢ / 25¢ / 20¢. Never while
 * a checkpoint is pending, never in `fixed` mode, never loosens. Moves at most one rung per call.
 */
export function nextSingTolerance(
  current: SingTolCents,
  days: readonly SingDayStat[],
  opts: LadderOptions,
): SingTolCents {
  return ladderProgress(current, days, opts).next;
}

/**
 * The one-tap loosen Settings → Voice offers after a gap of 21 days or more without singing: the next
 * looser rung, or `null` when there is nothing to offer. The ladder itself never loosens.
 */
export function loosenOffer(
  current: SingTolCents,
  lastSingDay: string | null,
  today: string,
): SingTolCents | null {
  const looser = looserTolerance(current);
  if (looser === null || lastSingDay === null) return null;
  const a = dayNumber(lastSingDay);
  const b = dayNumber(today);
  if (a === null || b === null) return null;
  return b - a >= LADDER_LOOSEN_GAP_DAYS ? looser : null;
}
