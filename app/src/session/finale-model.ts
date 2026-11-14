// The end of the core (content/specs/END.md; wave6.md §5.5; contracts §2.5; ux §5.5 M7). The session that
// releases the last core track ends in the finale Coda: the record, what the learner can now do, the Oak, what is
// open now. From the next day Today is an ordinary Today with a session in it and a short list of what is open.
// Everything said about the learner comes from the server (`SessionSummary.coreComplete`, `course.completion`,
// `cando.list`, the skill map): this module only counts and words what it is given. It invents no praise, compares
// with nothing, counts nothing down. Pure; the Coda, Today and Progress render it.
import type { CanDoEntry, CoreCompletion, SessionPlan } from "@oak/api";
import { learnerDay } from "@oak/srs";

/** The copy of the ending, word for word (END.md). Sentences end with a full stop, never an exclamation mark. */
export const FINALE_COPY = {
  heading: "You finished the core. Side A is complete.",
  under:
    "Both parts of the core finale are released: your own single, and a standard taken down by ear. You can compose a song and transcribe one.",
  canDoHeading: "What you can now do",
  newToday: "new today",
  canDoLink: "See all of them",
  oakHeading: "Your Oak",
  oakCrown:
    "The crown and the deep roots are still to grow: they are the jazz, rhythm and arrangement tracks.",
  oakLink: "Open the Oak",
  oakUnavailable: "The map is not available right now.",
  openHeading: "What is open now",
  openToYou: "Open to you",
  firstDay: "Side A is complete.",
  firstDayAction: "Play it.",
  done: "Done for today",
  studio: "Keep playing in Studio",
  back: "Back to Progress",
  progressLinks: ["Open the ending", "Play Side A", "Open the Oak"],
} as const;

type Stats = CoreCompletion["stats"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 March": the first day, in the learner's locale (tests pass one). */
export function dayMonth(day: string, locale?: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(d);
}

/** "14 November 2026". */
export function longDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/**
 * The road in one line of the learner's own numbers: "Since 3 March: 185 sessions on 172 days, about 58 hours of
 * practice. 125 lessons, 12 tracks, 3 transcriptions, 140 sketches." A value of zero drops its clause; nothing is
 * compared with a plan, with other people or with days missed.
 */
export function roadLine(stats: Stats, locale?: string): string {
  const since = stats.firstDay ? `Since ${dayMonth(stats.firstDay, locale)}: ` : "";
  const first: string[] = [];
  if (stats.sessions > 0)
    first.push(
      stats.days > 0
        ? `${plural(stats.sessions, "session")} on ${plural(stats.days, "day")}`
        : plural(stats.sessions, "session"),
    );
  const hours = Math.round(stats.activeMinutes / 60);
  if (stats.activeMinutes >= 60) first.push(`about ${plural(hours, "hour")} of practice`);
  else if (stats.activeMinutes >= 1)
    first.push(`about ${plural(Math.round(stats.activeMinutes), "minute")} of practice`);
  const second: string[] = [];
  if (stats.lessons > 0) second.push(plural(stats.lessons, "lesson"));
  if (stats.tracksReleased > 0) second.push(plural(stats.tracksReleased, "track"));
  if (stats.transcriptions > 0) second.push(plural(stats.transcriptions, "transcription"));
  if (stats.sketches > 0) second.push(plural(stats.sketches, "sketch", "sketches"));
  const a = first.length > 0 ? `${since}${first.join(", ")}.` : "";
  const b = second.length > 0 ? `${second[0]?.[0]?.toUpperCase()}${second.join(", ").slice(1)}.` : "";
  return [a, b].filter((x) => x.length > 0).join(" ");
}

/** The order of the seven lines (END.md): one for each kind of thing the learner can do. */
export const FINALE_AREAS = ["compose", "transcribe", "hear", "write", "read", "code", "sing"] as const;

export interface EvidenceNames {
  /** An album track's title by its id (`evidenceKind: "track"`); null when unknown. */
  trackTitle: (id: string) => string | null;
  /** A transcribed song's title by the evidence id; null when unknown. */
  songTitle: (id: string) => string | null;
  /** A lesson's or checkpoint's title by its id; the id itself when unknown. */
  itemTitle: (id: string) => string;
  locale?: string;
}

/**
 * The evidence beside a can-do line, worded by kind (END.md): "from Album Single, released 14 November", "from Five
 * Foot Two, by ear", "the U17 checkpoint", the lesson's title, "review sets, last on 12 November".
 */
export function evidenceWording(
  e: Pick<CanDoEntry, "evidenceKind" | "evidenceId" | "at">,
  names: EvidenceNames,
): string {
  const date = dayMonth(e.at, names.locale);
  switch (e.evidenceKind) {
    case "track": {
      const t = names.trackTitle(e.evidenceId);
      return t ? `from ${t}, released ${date}` : `from an album track, released ${date}`;
    }
    case "transcription": {
      const t = names.songTitle(e.evidenceId);
      return t ? `from ${t}, by ear` : "from a transcription, by ear";
    }
    case "checkpoint": {
      const unit = /^([A-Z]+\d+)\./.exec(e.evidenceId)?.[1];
      return unit ? `the ${unit} checkpoint` : "a checkpoint";
    }
    case "lesson": {
      const t = names.itemTitle(e.evidenceId);
      return t && t !== e.evidenceId ? t : "a lesson";
    }
    case "set":
      return `review sets, last on ${date}`;
    default:
      return `a sketch, ${date}`;
  }
}

export interface FinaleCanDoLine {
  candoId: string;
  /** "I can finish a two-minute song with a bridge." */
  text: string;
  status: "solid" | "strong";
  /** The graded work behind it, in quieter type; null when the ledger has no entry to name. */
  evidence: string | null;
  /** Its status changed in the session that ended the core. */
  newToday: boolean;
}

/**
 * The lines of "What you can now do": the server's choice (`coreComplete.canDo`: one per area, at most seven, only
 * solid or strong), kept in the order of the areas, each with the latest evidence the ledger holds for it. A
 * statement that is not solid or strong is never shown here, whatever the list carries.
 */
export function finaleCanDo(
  chosen: CoreCompletion["canDo"],
  ledger: readonly CanDoEntry[],
  areaOf: (candoId: string) => string | null,
  names: EvidenceNames,
  /** The session's start: an entry at or after it is "new today". Null for the ending reopened later. */
  since: string | null,
): FinaleCanDoLine[] {
  const latest = new Map<string, CanDoEntry>();
  const before = new Map<string, CanDoEntry>();
  for (const e of ledger) {
    const cur = latest.get(e.candoId);
    if (!cur || cur.at <= e.at) latest.set(e.candoId, e);
    if (since !== null && e.at < since) {
      const b = before.get(e.candoId);
      if (!b || b.at <= e.at) before.set(e.candoId, e);
    }
  }
  const rank = (id: string) => {
    const i = (FINALE_AREAS as readonly string[]).indexOf(areaOf(id) ?? "");
    return i < 0 ? FINALE_AREAS.length : i;
  };
  return chosen
    .filter(
      (c): c is typeof c & { status: "solid" | "strong" } => c.status === "solid" || c.status === "strong",
    )
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c.candoId) - rank(y.c.candoId) || x.i - y.i)
    .slice(0, 7)
    .map(({ c }) => {
      const e = latest.get(c.candoId) ?? null;
      const was = before.get(c.candoId)?.status ?? null;
      return {
        candoId: c.candoId,
        text: c.text,
        status: c.status,
        evidence: e ? evidenceWording(e, names) : null,
        newToday: since !== null && e !== null && e.at >= since && was !== c.status,
      };
    });
}

/**
 * The closing line: "{n} of {total} statements are solid or strong. {m} are still settling; reviews firm them up."
 * Counted among the can-dos whose source is in the core; the second sentence is dropped when nothing is settling.
 */
export function canDoClosing(
  coreIds: readonly string[],
  ledger: readonly CanDoEntry[],
): { solid: number; settling: number; total: number; line: string } {
  const latest = new Map<string, CanDoEntry>();
  for (const e of ledger) {
    const cur = latest.get(e.candoId);
    if (!cur || cur.at <= e.at) latest.set(e.candoId, e);
  }
  let solid = 0;
  let settling = 0;
  for (const id of coreIds) {
    const s = latest.get(id)?.status;
    if (s === "solid" || s === "strong") solid++;
    else if (s === "emerging" || s === "fading") settling++;
  }
  const total = coreIds.length;
  const first = `${solid} of ${plural(total, "statement")} ${solid === 1 ? "is" : "are"} solid or strong.`;
  const second =
    settling > 0 ? ` ${settling} ${settling === 1 ? "is" : "are"} still settling; reviews firm them up.` : "";
  return { solid, settling, total, line: `${first}${second}` };
}

/**
 * The lines under the Oak, from the leaf counts of the core: every limb at full length, with the pale leaves counted
 * as what they are; the crown still to grow; and the leaves in the next warm-up, only when there are some.
 */
export function oakLines(counts: {
  mastered: number;
  practising: number;
  introduced: number;
  drying: number;
}): string[] {
  const parts = [
    `${plural(counts.mastered, "leaf", "leaves")} mastered`,
    `${counts.practising} practising`,
    ...(counts.introduced > 0 ? [`${counts.introduced} still settling`] : []),
  ];
  const lines = [
    `Every limb of the core is at full length: ${parts.join(", ")}.`,
    FINALE_COPY.oakCrown as string,
  ];
  if (counts.drying > 0)
    lines.push(
      `${plural(counts.drying, "leaf", "leaves")} ${counts.drying === 1 ? "is" : "are"} in your next warm-up.`,
    );
  return lines;
}

type OpenEntry = CoreCompletion["open"][number];

export type OpenTarget =
  | { to: "/" }
  | { to: "/studio" }
  | { to: "/learn/$lessonId"; params: { lessonId: string } }
  | { to: "/capstone/$id"; params: { id: string } };

export interface OpenRow {
  kind: OpenEntry["kind"];
  id: string | null;
  title: string;
  note: string;
  /** Where it starts; null for a row that cannot be started (no link, no arrow). */
  to: OpenTarget | null;
}

function targetOf(e: OpenEntry): OpenTarget | null {
  if (!e.available) return null;
  switch (e.kind) {
    case "studio":
      return { to: "/studio" };
    case "side-lesson":
      return e.id ? { to: "/learn/$lessonId", params: { lessonId: e.id } } : { to: "/" };
    case "capstone":
      return e.id ? { to: "/capstone/$id", params: { id: e.id } } : { to: "/" };
    case "track":
      // A track with a next lesson (a later wave): the entry's id is then the lesson, not the track letter.
      return e.id && /\.L\d+$/.test(e.id)
        ? { to: "/learn/$lessonId", params: { lessonId: e.id } }
        : { to: "/" };
    default:
      // Reviews and the gym start from Today.
      return { to: "/" };
  }
}

/** How tomorrow's line names an entry: its title in lower case where it is a common noun. */
function tomorrowName(e: OpenEntry): string {
  if (e.kind === "review") return "reviews";
  if (e.kind === "gym") return "the Transcription Gym";
  return e.title;
}

export interface OpenList {
  /** "Tomorrow: reviews. 14 due. They keep the Oak green." Null when nothing can be started. */
  tomorrow: string | null;
  /** Rows that can be started, in the server's order. */
  startable: OpenRow[];
  /** Rows that cannot be started yet (a track with no lesson): quieter, no link. */
  waiting: OpenRow[];
}

const row = (e: OpenEntry): OpenRow => ({
  kind: e.kind,
  id: e.id,
  title: e.title,
  note: e.note,
  to: targetOf(e),
});

/** "What is open now": the line for tomorrow, the rows that can be started, then the rows that cannot. */
export function openList(open: CoreCompletion["open"]): OpenList {
  const startable = open.filter((e) => e.available);
  const first = startable[0];
  return {
    tomorrow: first ? `Tomorrow: ${tomorrowName(first)}. ${first.note}` : null,
    startable: startable.map(row),
    waiting: open.filter((e) => !e.available).map(row),
  };
}

/** Whether a summary is the ending: it carries `coreComplete` at stage `complete` (set once, on one summary). */
export function isEnding(
  summary: { coreComplete?: Pick<CoreCompletion, "stage"> | null | undefined } | null | undefined,
): boolean {
  return summary?.coreComplete?.stage === "complete";
}

/** "The lessons of the core are done. Left to release: Chromatic Colour and Album Single." Null otherwise. */
export function leftToRelease(
  c: Pick<CoreCompletion, "stage" | "remaining" | "open"> | null | undefined,
): string | null {
  if (c?.stage !== "lessons-done") return null;
  const fromRemaining = c.remaining.filter((r) => r.kind === "capstone").map((r) => r.title);
  const titles =
    fromRemaining.length > 0
      ? fromRemaining
      : c.open.filter((o) => o.kind === "capstone").map((o) => o.title);
  if (titles.length === 0) return "The lessons of the core are done.";
  const list = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
  return `The lessons of the core are done. Left to release: ${list}.`;
}

export interface AfterCore {
  stage: "lessons-done" | "complete";
  /** The first learner day after the ending: "Side A is complete. Play it." */
  firstDay: boolean;
  /** `lessons-done`: what is left, in one line. */
  left: string | null;
  /** "Open to you": what can be started besides today's own session. */
  open: OpenRow[];
  /** The tracks that cannot be started yet, each with its honest note. */
  waiting: OpenRow[];
}

const KIND_OF_PLAN: Partial<Record<SessionPlan["kind"], OpenEntry["kind"]>> = {
  review: "review",
  gym: "gym",
  studio: "studio",
  capstone: "capstone",
};

/**
 * Today from the day the lessons of the core are done (`plan.core`): an ordinary Today, with the list of what is
 * open under the planned session. The planned session itself is not listed again; a track with no lesson is named
 * and is not a button. Null while the core is in progress or the completion has not loaded.
 */
export function afterCore(
  plan: Pick<SessionPlan, "core" | "kind" | "mapItemId">,
  completion: CoreCompletion | null | undefined,
  today: { day: string; timezone: string; rolloverHour: number },
): AfterCore | null {
  const stage = plan.core ?? completion?.stage ?? "in-progress";
  if (stage === "in-progress" || !completion) return null;
  const list = openList(completion.open);
  const own = KIND_OF_PLAN[plan.kind] ?? null;
  const planCapstone =
    plan.kind === "capstone" ? (/^(.+)\.S\d+$/.exec(plan.mapItemId ?? "")?.[1] ?? null) : null;
  const open = list.startable.filter(
    (r) => !(r.kind === own && (r.kind !== "capstone" || r.id === planCapstone)),
  );
  let firstDay = false;
  if (stage === "complete" && completion.completedAt) {
    try {
      const ended = learnerDay(new Date(completion.completedAt), today.timezone, today.rolloverHour);
      const gap = Math.round(
        (Date.parse(`${today.day}T12:00:00Z`) - Date.parse(`${ended}T12:00:00Z`)) / 86_400_000,
      );
      firstDay = gap === 1;
    } catch {
      firstDay = false;
    }
  }
  return {
    stage,
    firstDay,
    left: stage === "lessons-done" ? leftToRelease({ ...completion, stage }) : null,
    open,
    waiting: list.waiting,
  };
}

export interface ProgressEnding {
  title: string;
  /** "14 November 2026" */
  dateLine: string;
  road: string;
}

/** The line that stays on /progress from the day the core is complete; null before. */
export function progressEnding(c: CoreCompletion | null | undefined, locale?: string): ProgressEnding | null {
  if (c?.stage !== "complete" || !c.completedAt) return null;
  return {
    title: c.milestone?.title ?? FINALE_COPY.heading,
    dateLine: longDate(c.completedAt, locale),
    road: roadLine(c.stats, locale),
  };
}
