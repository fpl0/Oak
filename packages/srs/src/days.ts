// Learner days (contracts §7.8): a day is the local calendar day with a 04:00 rollover; a week runs
// Monday 04:00 to the next Monday 04:00. Days travel as `YYYY-MM-DD` strings and, for arithmetic, as
// integer indices (whole days since 1970-01-01). Isomorphic: only `Intl` and `Date`.
import { STREAK } from "./constants.ts";

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const isUtc = (timeZone: string) => timeZone === "UTC" || timeZone === "Etc/UTC" || timeZone === "GMT";

/** The wall-clock reading of an instant in a time zone. */
function localParts(at: Date, timeZone: string): LocalParts {
  if (isUtc(timeZone)) {
    return {
      year: at.getUTCFullYear(),
      month: at.getUTCMonth() + 1,
      day: at.getUTCDate(),
      hour: at.getUTCHours(),
      minute: at.getUTCMinutes(),
      second: at.getUTCSeconds(),
    };
  }
  const out: LocalParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatterFor(timeZone).formatToParts(at)) {
    if (part.type in out) out[part.type as keyof LocalParts] = Number(part.value);
  }
  return out;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A learner day as an integer index (whole days since 1970-01-01), for the planner's arithmetic. */
export function dayIndex(day: string): number {
  const m = DAY_PATTERN.exec(day);
  if (!m) throw new Error(`@oak/srs: "${day}" is not a YYYY-MM-DD day`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const index = Math.round(ms / DAY_MS);
  if (dayFromIndex(index) !== day) throw new Error(`@oak/srs: "${day}" is not a calendar day`);
  return index;
}
/** The inverse of `dayIndex`. */
export function dayFromIndex(index: number): string {
  const d = new Date(index * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** The learner-local calendar day (`YYYY-MM-DD`) of an instant, with the 04:00 rollover in `timeZone`. */
export function learnerDay(now: Date, timeZone: string, rolloverHour: number = STREAK.rolloverHour): string {
  const p = localParts(now, timeZone);
  const calendar = Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
  return dayFromIndex(p.hour < rolloverHour ? calendar - 1 : calendar);
}
/** Whole days between two learner days (`b − a`). */
export function daysBetween(a: string, b: string): number {
  return dayIndex(b) - dayIndex(a);
}
/** `day` moved by `n` days. */
export function addDays(day: string, n: number): string {
  return dayFromIndex(dayIndex(day) + n);
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(day: string | number): number {
  const index = typeof day === "number" ? day : dayIndex(day);
  // 1970-01-01 was a Thursday.
  return (((index + 3) % 7) + 7) % 7;
}
/** The Monday that starts the learner week containing `day` (weeks run Monday 04:00 to Monday 04:00). */
export function weekStart(day: string): string {
  const index = dayIndex(day);
  return dayFromIndex(index - weekdayOf(index));
}
/**
 * The instant a learner day begins: `rolloverHour`:00 local time on that calendar day. On a day whose
 * rollover hour does not exist (a spring-forward gap) it is the first instant after the gap.
 */
export function dayStartInstant(
  day: string | number,
  timeZone: string,
  rolloverHour: number = STREAK.rolloverHour,
): Date {
  const index = typeof day === "number" ? day : dayIndex(day);
  const wall = index * DAY_MS + rolloverHour * HOUR_MS;
  if (isUtc(timeZone)) return new Date(wall);
  // Find the UTC instant whose wall-clock reading in the zone is `wall`: two rounds settle every real zone.
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = wall - seen;
    if (diff === 0) break;
    guess += diff;
  }
  const at = (t: number) => dayIndex(learnerDay(new Date(t), timeZone, rolloverHour));
  if (at(guess) === index && at(guess - 1) === index - 1) return new Date(guess);
  // A rollover hour inside a DST gap or overlap (rollover 02:00 in Berlin, 04:00 in Helsinki, 00:00 on
  // Lord Howe): the learner day is monotonic in time, so bisect for its first instant.
  let lo = wall - 15 * HOUR_MS; // before the day starts in every zone (offsets are within −12 h … +14 h)
  let hi = wall + 13 * HOUR_MS; // after it has started
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid) >= index) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}
/** The learner-day index of an instant. */
export function dayIndexOf(at: Date, timeZone: string, rolloverHour: number = STREAK.rolloverHour): number {
  return dayIndex(learnerDay(at, timeZone, rolloverHour));
}
