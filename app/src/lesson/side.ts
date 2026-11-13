// Side lessons in the lesson player (Wave 5, docs/design/wave5.md §5.1, contracts §2.6, §9.6): A1.L01–L04 open once
// U03.L02 is done, are offered from Today or the Toolbox, and play like any lesson. The player says plainly that the
// lesson is optional and what it will make better, returns the learner to where they came from, and never reports
// it as the day's New block unless the session itself is that side lesson (a side lesson opened from the Toolbox
// in the middle of a core session must not mark the core lesson done). Pure: `bun test`.
import type { LessonMeta } from "@oak/content-kit";

/** Where a lesson was opened from (`/learn/$lessonId?from=`): the place its end and "Leave for now" return to. */
export const LESSON_ORIGINS = ["today", "toolbox", "map", "progress"] as const;
export type LessonOrigin = (typeof LESSON_ORIGINS)[number];

export function isLessonOrigin(v: unknown): v is LessonOrigin {
  return typeof v === "string" && (LESSON_ORIGINS as readonly string[]).includes(v);
}

/** The route and label of "back to where you were". */
export interface OriginLink {
  to: "/" | "/toolbox" | "/oak" | "/progress";
  label: string;
}

export function originLink(from: LessonOrigin | undefined): OriginLink {
  switch (from) {
    case "toolbox":
      return { to: "/toolbox", label: "Back to the Toolbox" };
    case "map":
      return { to: "/oak", label: "Back to the map" };
    case "progress":
      return { to: "/progress", label: "Back to Progress" };
    default:
      return { to: "/", label: "Back to Today" };
  }
}

/**
 * What each side lesson makes better: the one-sentence offer of its spec (content/specs/A1.ts, each lesson's
 * notes; the session engineer's Today chip uses the same line). A lesson without one reads its course-map
 * objective instead.
 */
export const SIDE_OFFERS: Readonly<Record<string, string>> = {
  "A1.L01":
    "Hear why a sawtooth bass sounds bigger than a sine, and give your loop's bass and riff their colour.",
  "A1.L02": "Tame a raw synth bass with a filter and give your riff the pluck of a record.",
  "A1.L03": "Shape how each note starts and ends: a punchy bass, a riff that swells in, a tail that rings.",
  "A1.L04": "Put your loop in a room: reverb, echoes in time, and a space for each part.",
};

/** A side lesson's ID shape (track A's first four lessons; wave5.md §5.1 `SIDE_LESSON_IDS`). */
const SIDE_ID = /^A1\.L0[1-4]$/;

/** Whether the lesson is a side lesson: its course-map row says so (`side: true`), or it is one of A1.L01–L04. */
export function isSideLesson(id: string, meta: Pick<LessonMeta, "side"> | null | undefined): boolean {
  return meta?.side === true || SIDE_ID.test(id);
}

export interface SideInfo {
  /** "Optional side lesson, about 15 minutes". */
  heading: string;
  /** What it will make better (the offer line, else the course-map objective). */
  offer: string;
  /** The reassurance: nothing waits for it. */
  note: string;
}

/** Minutes as the offer says them: up to the next 5, at least 5 ("about 15 minutes"); never understated. */
export function aboutMinutes(minutes: number): number {
  return Math.max(5, Math.ceil(minutes / 5 - 1e-9) * 5);
}

/** A lesson's scaled minutes (contracts §9.1: authored × 1.4), its optional steps left out. */
export function sideMinutes(def: { steps: readonly { minutes: number; optional?: boolean }[] }): number {
  return def.steps.filter((s) => !s.optional).reduce((n, s) => n + s.minutes, 0) * 1.4;
}

/** The side-lesson framing a player shows on its first step. */
export function sideInfo(
  id: string,
  meta: Pick<LessonMeta, "objective"> | null | undefined,
  minutes: number,
): SideInfo {
  return {
    heading: `Optional side lesson, about ${aboutMinutes(minutes)} minutes`,
    offer: SIDE_OFFERS[id] ?? meta?.objective ?? "",
    note: "Nothing in the course waits for it: leave whenever you like and pick it up another day.",
  };
}

/** The next side lesson of the track after `id` (A1.L01 → A1.L02), or `null` after the last. */
export function nextSideLesson(id: string, sideIds: readonly string[]): string | null {
  const i = sideIds.indexOf(id);
  return i >= 0 && i + 1 < sideIds.length ? (sideIds[i + 1] as string) : null;
}

/**
 * Whether the lesson reports its blocks to the running session: only when the session's own New block is this
 * lesson. A lesson opened beside a session (a side lesson from the Toolbox, a replay from the map) leaves the
 * session's blocks alone and saves its attempts without the session's ID.
 */
export function reportsToSession(lessonId: string, plan: { mapItemId?: string | null } | null): boolean {
  return plan?.mapItemId === lessonId;
}
