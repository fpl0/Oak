// The whole course complete (wave7.md §5.8; milestone ms.28): the Coda of the session that finished the last of the
// 259, Today on the days after it, and the line that stays on /progress. The same rules as the end of the core
// (content/specs/END.md): one page, the learner's own music and numbers, evidence instead of praise, a real next
// step; nothing celebrates on their behalf, nothing says they are finished with Oak. Everything said about the
// learner comes from the server (`SessionSummary.courseComplete`, `course.whole`); this module only counts and
// words what it is given. Pure; the Coda, Today and Progress render it.
import type { SessionPlan, WholeCourse } from "@oak/api";
import { learnerDay } from "@oak/srs";
import { longDate, type OpenRow, openList, roadLine } from "./finale-model.ts";

/** The copy of the whole course's ending, word for word. Sentences end with a full stop, never an exclamation mark. */
export const COURSE_END_COPY = {
  heading: "You have completed Oak.",
  under:
    "Every unit, every track and every capstone: twenty album tracks, and two songs and a standard taken down by ear. What you write next is up to you; Studio and the sketchbook stay open for it.",
  recordHeading: "The record",
  tracksHeading: "The three tracks",
  canDoHeading: "What you can now do",
  openHeading: "What stays open",
  keepPlaying:
    "The Oak keeps its leaves green with a few reviews a week, the gym has standards you have not heard, and the sketchbook is yours.",
  firstDay: "Both sides of the record are complete.",
  firstDayAction: "Play Side B.",
  openToYou: "Open to you",
  progressLinks: ["Open the ending", "Play the record", "Open the Oak"],
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Whether a summary is the whole course's ending: it carries `courseComplete` at stage `complete` (once). */
export function isCourseEnding(
  summary: { courseComplete?: Pick<WholeCourse, "stage"> | null | undefined } | null | undefined,
): boolean {
  return summary?.courseComplete?.stage === "complete";
}

/**
 * The record in one line, from the album count: "Twenty tracks on two sides: twelve on Side A, eight on Side B."
 * Only what the server counted; a side with nothing on it is not named.
 */
export function recordLine(album: WholeCourse["album"], sides?: { A: number; B: number } | null): string {
  const n = album.released;
  const head = n === 20 ? "Twenty tracks" : plural(n, "track");
  // The breakdown only when the sides add up to the count (a side list from an older album would not).
  if (!sides || sides.A + sides.B !== n) return `${head} on your record.`;
  const parts = [
    ...(sides.A > 0 ? [`${sides.A} on Side A`] : []),
    ...(sides.B > 0 ? [`${sides.B} on Side B`] : []),
  ];
  return parts.length > 0 ? `${head}: ${parts.join(", ")}.` : `${head} on your record.`;
}

export interface TrackDoneLine {
  trackId: string;
  title: string;
  /** "34 sessions: J1–J5, two checkpoints, four capstones." from the track's own counts. */
  line: string;
}

/** One line per track for the ending's "The three tracks": sessions done of the track, said as what they were. */
export function trackDoneLines(tracks: WholeCourse["tracks"]): TrackDoneLine[] {
  return tracks.map((t) => {
    const caps = t.capstones?.filter((c) => c.status === "released").length ?? 0;
    const cps = t.checkpoints?.filter((c) => c.status === "passed" || c.status === "soft-passed").length ?? 0;
    const parts = [
      plural(t.sessionsDone, "session"),
      ...(cps > 0 ? [plural(cps, "checkpoint")] : []),
      ...(caps > 0 ? [`${plural(caps, "track")} released`] : []),
    ];
    return { trackId: t.trackId, title: t.title, line: `${parts.join(", ")}.` };
  });
}

/** The road in the learner's own numbers (finale-model `roadLine`): the same line, the whole course's totals. */
export function courseRoad(whole: Pick<WholeCourse, "stats">, locale?: string): string {
  return roadLine(whole.stats, locale);
}

export interface AfterCourse {
  /** The first learner day after the moment: one line back to the record. */
  firstDay: boolean;
  /** What can be started besides today's own session (the gym, Studio, reviews, replays). */
  open: OpenRow[];
  /** "Tomorrow: reviews. 14 due. They keep the Oak green." for the line under the list. */
  tomorrow: string | null;
}

/**
 * Today from the day after the whole course: an ordinary Today (reviews with the gym slot kept, else a keep-alive
 * or Studio), with what stays open under it. Null while the course is in progress or `course.whole` has not loaded.
 */
export function afterCourse(
  plan: Pick<SessionPlan, "kind" | "mapItemId"> & Partial<Pick<SessionPlan, "course">>,
  whole: WholeCourse | null | undefined,
  today: { day: string; timezone: string; rolloverHour: number },
): AfterCourse | null {
  if (whole?.stage !== "complete") return null;
  const list = openList(whole.open);
  const own = plan.kind;
  const open = list.startable.filter((r) => r.kind !== own || r.kind === "capstone");
  let firstDay = false;
  if (whole.completedAt) {
    try {
      const ended = learnerDay(new Date(whole.completedAt), today.timezone, today.rolloverHour);
      const gap = Math.round(
        (Date.parse(`${today.day}T12:00:00Z`) - Date.parse(`${ended}T12:00:00Z`)) / 86_400_000,
      );
      firstDay = gap === 1;
    } catch {
      firstDay = false;
    }
  }
  return { firstDay, open, tomorrow: list.tomorrow };
}

export interface CourseEndEntry {
  title: string;
  dateLine: string;
  road: string;
}

/** The line that stays on /progress from the day the whole course is complete; null before. */
export function courseEndEntry(
  whole: Pick<WholeCourse, "stage" | "completedAt" | "stats"> | null | undefined,
  locale?: string,
): CourseEndEntry | null {
  if (whole?.stage !== "complete" || !whole.completedAt) return null;
  return {
    title: COURSE_END_COPY.heading,
    dateLine: longDate(whole.completedAt, locale),
    road: roadLine(whole.stats, locale),
  };
}

/**
 * The whole-course pace on /progress once the core is done and the tracks are not: "At 4 sessions a week you'd
 * finish the tracks around June 2027." Null without a measured pace or with nothing left. Compared with nothing.
 */
export function coursePaceLine(
  whole: Pick<WholeCourse, "stage" | "sessionsDone" | "sessionsTotal"> | null | undefined,
  perWeek: number | null | undefined,
  today: string | null | undefined,
  formatMonth: (yyyyMm: string) => string,
): string | null {
  if (!whole || whole.stage === "complete" || !perWeek || perWeek <= 0 || !today) return null;
  const left = whole.sessionsTotal - whole.sessionsDone;
  if (left <= 0) return null;
  const d = new Date(`${today.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.ceil((left / perWeek) * 7));
  return `At ${perWeek} sessions a week you'd finish the three tracks around ${formatMonth(d.toISOString().slice(0, 7))}.`;
}
