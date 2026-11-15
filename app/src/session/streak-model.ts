// The weekly streak as Today, the Coda and Progress draw it (contracts §7.8, ux §5.4). Pure: the server keeps the
// numbers (StreakSummary), this file turns them into the 7/4 bar and calm copy. Banned here and everywhere:
// loss framing, countdowns, red states, "you missed".
import type { StreakDay, StreakSummary, StreakWeek } from "@oak/api";

export type SlotState =
  /** A full practice day: a filled notehead. */
  | "note"
  /** A Keep-alive day: a hollow half note. */
  | "half"
  /** A banked rest covered the day (𝄽). */
  | "rest"
  /** A day repaired inside the 48-hour window (⁀). */
  | "tie"
  /** A paused week. */
  | "paused"
  /** A past day with nothing: a free (planned) rest, drawn as an empty slot, never red. */
  | "open"
  /** Today, not yet practised. */
  | "today"
  /** Later this week. */
  | "future";

export interface RhythmSlot {
  day: string;
  weekday: string;
  state: SlotState;
  /** For the slot's accessible name. */
  label: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SLOT_LABEL: Record<SlotState, string> = {
  note: "practised",
  half: "keep-alive",
  rest: "a banked rest",
  tie: "tied over",
  paused: "paused",
  open: "rest day",
  today: "today",
  future: "ahead",
};

export function slotStateOf(d: StreakDay | undefined, day: string, today: string): SlotState {
  if (d?.source === "paused") return "paused";
  if (d?.source === "banked-rest") return "rest";
  if (d?.qualified) {
    if (d.source === "repair") return "tie";
    if (d.kinds.length > 0 && d.kinds.every((k) => k === "keepalive")) return "half";
    return "note";
  }
  if (day === today) return "today";
  return day < today ? "open" : "future";
}

/** The seven slots of this week, Monday first (contracts §7.8: weeks run Monday 04:00 to Monday 04:00). */
export function rhythmSlots(streak: StreakSummary, today: string): RhythmSlot[] {
  const byDay = new Map(streak.thisWeek.days.map((d) => [d.day, d]));
  return WEEKDAYS.map((weekday, i) => {
    const day = addDays(streak.thisWeek.weekStart, i);
    const state = slotStateOf(byDay.get(day), day, today);
    return { day, weekday, state, label: `${WEEKDAY_LONG[i]}: ${SLOT_LABEL[state]}` };
  });
}

/** "3 of 5 days this week" (the first week's goal is pro-rated by the server). */
export function goalLine(streak: StreakSummary): string {
  const { qualifyingDays: q, goal } = streak.thisWeek;
  const days = goal === 1 ? "day" : "days";
  if (q >= goal) return `This week's goal is met: ${q} of ${goal} ${days}`;
  return `${q} of ${goal} ${days} this week`;
}

/** Whether today is a free rest: this week's goal is already met and today has nothing yet. */
export function isRestDay(streak: StreakSummary): boolean {
  return streak.thisWeek.qualifyingDays >= streak.thisWeek.goal && !streak.todayQualified;
}

/** The primary streak in words. `lastWeek` is the most recent closed week (from `/streak`), when known. */
export function streakLine(streak: StreakSummary, lastWeek?: StreakWeek | null): string {
  if (streak.weeks > 0) return `${streak.weeks} ${streak.weeks === 1 ? "week" : "weeks"} in a row`;
  if (streak.longestWeeks > 0 && lastWeek?.status === "missed")
    return `A new phrase begins. Longest run: ${streak.longestWeeks} ${streak.longestWeeks === 1 ? "week" : "weeks"}.`;
  return "Your first streak week is this one";
}

export function restsLine(streak: StreakSummary): string | null {
  if (streak.bankedRests <= 0) return null;
  return `${streak.bankedRests} ${streak.bankedRests === 1 ? "rest" : "rests"} banked`;
}

/**
 * The open tie on last week, in calm words with the window's end as a day and time (never a countdown):
 * "Last week is 1 day short. Practise before Wednesday 04:00 and it's tied over."
 */
export function repairLine(repair: StreakSummary["repair"], timeZone?: string): string | null {
  if (!repair) return null;
  const until = new Date(repair.until);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (timeZone) opts.timeZone = timeZone;
  let when: string;
  try {
    when = new Intl.DateTimeFormat("en-GB", opts).format(until);
  } catch {
    when = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: undefined }).format(until);
  }
  const n = repair.missingDays;
  return `Last week is ${n} ${n === 1 ? "day" : "days"} short. Practise before ${when} and it's tied over.`;
}

/** Secondary numbers, shown small (no rules, no rewards): "Day 23 of practice · 4 in a row". */
export function daysLine(streak: StreakSummary): string {
  const day = `Day ${streak.totalDays + (streak.todayQualified ? 0 : 1)} of practice`;
  return streak.currentRunDays > 1 ? `${day} · ${streak.currentRunDays} in a row` : day;
}

/** A closed week in words, for the history strip on /progress. */
export function weekStatusLabel(w: StreakWeek): string {
  switch (w.status) {
    case "met":
      return "goal met";
    case "met-banked":
      return `goal met with ${w.bankedUsed} banked ${w.bankedUsed === 1 ? "rest" : "rests"}`;
    case "met-repaired":
      return "goal met, tied over";
    case "tie-open":
      return "tie open";
    case "missed":
      return "a quieter week";
    case "paused":
      return "paused";
    default:
      return "in progress";
  }
}
