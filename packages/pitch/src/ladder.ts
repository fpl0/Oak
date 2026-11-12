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

/** One graded sung note as the ladder counts it (Quiet, skipped and calibration notes never reach here). */
export interface LadderNote {
  /** The learner's local day, `yyyy-mm-dd`. */
  day: string;
  /** Signed or absolute cents error after octave folding and drift compensation. */
  cents: number;
}

/** Per-day statistics from single notes: the count and the true median |e| of each day, oldest first. */
export function singDayStats(notes: readonly LadderNote[]): SingDayStat[] {
  const byDay = new Map<string, number[]>();
  for (const n of notes) {
    if (!Number.isFinite(n.cents) || dayNumber(n.day) === null) continue;
    const list = byDay.get(n.day) ?? [];
    list.push(Math.abs(n.cents));
    byDay.set(n.day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => {
      const s = [...list].sort((a, b) => a - b);
      const mid = s.length >> 1;
      const med = s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
      return { day, gradedNotes: s.length, medianAbsCents: med };
    });
}

export interface LadderSnapshotInput {
  cents: SingTolCents;
  mode: "auto" | "fixed";
  days: readonly SingDayStat[];
  today: string;
  /** The checkpoint that holds tightening (contracts §8.2), or null. */
  pendingCheckpoint: string | null;
  /** Day of the last change of rung (the days before it do not count again). */
  since?: string;
  /** The last day with graded sung notes, for the one-tap loosen after a gap. */
  lastSingDay: string | null;
  lastChange: {
    from: SingTolCents;
    to: SingTolCents;
    at: string;
    reason: "evidence" | "learner" | "loosen";
  } | null;
}

/**
 * The ladder as `GET /voice` reports it (`VoiceLadderSchema` of @oak/api, field for field): where the learner
 * stands, the days inside the 21-day window, what holds it and whether a loosen is offered. Computed from the
 * same rules as `nextSingTolerance`, so the Settings card can never disagree with what the server does. A bad
 * day is just a day that does not count: it never undoes the days that did, and the ladder never steps back
 * on its own.
 */
export function ladderSnapshot(input: LadderSnapshotInput) {
  const progress = ladderProgress(input.cents, input.days, {
    today: input.today,
    checkpointPending: input.pendingCheckpoint !== null,
    mode: input.mode,
    ...(input.since !== undefined ? { since: input.since } : {}),
  });
  const today = dayNumber(input.today) as number;
  const qualifying = new Set(progress.qualifyingDays);
  const merged = new Map<string, SingDayStat>();
  for (const d of input.days) {
    const n = dayNumber(d.day);
    if (n === null || n > today || today - n >= LADDER_WINDOW_DAYS || !(d.gradedNotes > 0)) continue;
    const prev = merged.get(d.day);
    merged.set(
      d.day,
      prev
        ? {
            day: d.day,
            gradedNotes: prev.gradedNotes + d.gradedNotes,
            medianAbsCents:
              (prev.medianAbsCents * prev.gradedNotes + d.medianAbsCents * d.gradedNotes) /
              (prev.gradedNotes + d.gradedNotes),
          }
        : { ...d },
    );
  }
  const days = [...merged.values()]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map((d) => ({
      day: d.day,
      notes: d.gradedNotes,
      medianAbsCents: Number.isFinite(d.medianAbsCents) ? d.medianAbsCents : null,
      qualifies: qualifying.has(d.day),
    }));
  return {
    cents: input.cents,
    mode: input.mode,
    next:
      input.mode === "fixed" || progress.target === null || progress.thresholdCents === null
        ? null
        : { cents: progress.target, medianAtMost: progress.thresholdCents },
    days,
    qualifyingDays: progress.qualifyingDays.length,
    daysNeeded: progress.daysNeeded,
    held:
      input.pendingCheckpoint !== null && input.mode === "auto" && progress.target !== null
        ? { reason: "checkpoint-pending" as const, checkpointId: input.pendingCheckpoint }
        : null,
    offerLoosen: loosenOffer(input.cents, input.lastSingDay, input.today) !== null,
    lastChange: input.lastChange,
  };
}
export type LadderSnapshot = ReturnType<typeof ladderSnapshot>;
