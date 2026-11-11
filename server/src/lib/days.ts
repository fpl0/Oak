// Learner days (contracts §7.8): a local calendar day with a rollover hour (04:00), weeks from Monday.
// Pure arithmetic on `YYYY-MM-DD` strings; the same definitions as `@oak/srs` (`learnerDay`, `weekStart`,
// `daysBetween`), kept here so the server's streak and session code has no start-up dependency on the
// scheduler package. `days.test.ts` checks the two agree.

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The learner-local day of an instant: the local date, or the day before while the local hour is before the rollover. */
export function learnerDay(now: Date, timeZone: string, rolloverHour = 4): string {
  const parts = formatter(timeZone).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return Number(get("hour")) < rolloverHour ? addDays(day, -1) : day;
}

/** Days since 1970-01-01 of a `YYYY-MM-DD` day. */
export function dayIndex(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

export function dayFromIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return dayFromIndex(dayIndex(day) + n);
}

/** Whole days from `a` to `b` (`b − a`). */
export function daysBetween(a: string, b: string): number {
  return dayIndex(b) - dayIndex(a);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  // 1970-01-01 was a Thursday (index 3 from Monday).
  return (((dayIndex(day) + 3) % 7) + 7) % 7;
}

/** The Monday of the learner week containing `day`. */
export function weekStart(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

/** The seven days of the week that starts on `weekStartDay`. */
export function daysOfWeek(weekStartDay: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartDay, i));
}

/**
 * The UTC instant at which learner day `day` begins (its rollover hour, local time). Found by
 * searching: time-zone offsets are not known without the zone database, and DST makes them vary.
 */
export function dayStartInstant(day: string, timeZone: string, rolloverHour = 4): Date {
  // Start from the naive UTC reading and correct by the observed offset; two passes settle DST edges.
  let guess = Date.parse(`${day}T${String(rolloverHour).padStart(2, "0")}:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const parts = formatter(timeZone).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"));
    const minutes = new Date(guess).getUTCMinutes() * 60_000;
    const offset = asUtc + minutes - guess;
    const next = Date.parse(`${day}T${String(rolloverHour).padStart(2, "0")}:00:00Z`) - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** `YYYY-MM` of a learner day. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}
