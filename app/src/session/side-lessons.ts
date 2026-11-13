// The optional side lessons A1.L01–L04 on Today and in the Coda (contracts §2.6, §9.6; wave5.md §5.1). Once
// U03.L02 is done they open, in order, and Today may offer the next one in one calm line beside the core session —
// never in its place, never as a debt, never on a checkpoint or capstone day or during a return warm-up. The
// server's planner decides (`SessionPlan.sideLesson`); a server older than Wave 5 (the field absent) leaves the
// decision to the same rules over `GET /side-lessons`. A side lesson counts 1 in track A, a streak day and 1 in the
// pace estimate, never in the core map. Pure: Today, the Coda and Progress read it from here.
import type { SessionPlan, SideLessons } from "@oak/api";

export type SideLessonId = "A1.L01" | "A1.L02" | "A1.L03" | "A1.L04";

/**
 * What each side lesson does for the learner's own loop, in a few plain words, and its short name. `offer` is the
 * fallback of the server's `SideLessonState.offer` (the same A1 spec lines), used only when the list lacks it.
 */
export const SIDE_LESSON_COPY: Readonly<Record<SideLessonId, { name: string; why: string; offer: string }>> =
  {
    "A1.L01": {
      name: "Waves & Harmonics",
      why: "hear why one bass sounds bigger than another",
      offer:
        "Hear why a sawtooth bass sounds bigger than a sine, and give your loop's bass and riff their colour.",
    },
    "A1.L02": {
      name: "Filters",
      why: "make your loop sound better",
      offer: "Tame a raw synth bass with a filter and give your riff the pluck of a record.",
    },
    "A1.L03": {
      name: "Envelopes",
      why: "shape how each note starts and ends",
      offer: "Shape how each note starts and ends: a punchy bass, a riff that swells in, a tail that rings.",
    },
    "A1.L04": {
      name: "Space",
      why: "put your loop in a room",
      offer: "Put your loop in a room: reverb, echoes in time, and a space for each part.",
    },
  };

const isSide = (id: string | null | undefined): id is SideLessonId =>
  !!id && Object.hasOwn(SIDE_LESSON_COPY, id);

/** A1.L02 → true. Side lessons are track A: they never count in the core map. */
export function isSideLesson(id: string | null | undefined): boolean {
  return isSide(id);
}

export interface SideOffer {
  lessonId: string;
  /** "Filters" */
  name: string;
  minutes: number;
  /** "Optional: make your loop sound better — Filters, about 12 minutes" */
  line: string;
  /** What the lesson does for the learner's loop, one sentence (the A1 spec's offer line). */
  detail: string | null;
  /** `alternative`: beside today's session; `after-core`: once today's session ended ("One more, if you like"). */
  placement: "alternative" | "after-core";
  /** The side lesson was started and left: it resumes like any lesson. */
  resume: boolean;
}

const minutesOf = (n: number) => Math.max(5, Math.round(n));

/** The one line Today and the Coda show for an offer. */
export function offerLine(
  lessonId: string,
  title: string,
  minutes: number,
  opts: { resume?: boolean; serverNote?: string | null } = {},
): string {
  const m = minutesOf(minutes);
  if (!isSide(lessonId)) return opts.serverNote?.trim() || `Optional: ${title}, about ${m} minutes`;
  const c = SIDE_LESSON_COPY[lessonId];
  if (opts.resume) return `Optional: pick ${c.name} up where you left it, about ${m} minutes`;
  return `Optional: ${c.why} — ${c.name}, about ${m} minutes`;
}

/** Plan kinds whose day never carries an offer (wave5.md §5.1). */
const NO_OFFER_KINDS: ReadonlySet<SessionPlan["kind"]> = new Set([
  "checkpoint",
  "capstone",
  "light",
  "keepalive",
]);

/**
 * The side lesson Today offers, or null. `plan.sideLesson` decides when the server sent the field (`null`: none
 * today). Without it (an older server) the same rules run over `GET /side-lessons`: the gate is met, a next lesson
 * exists, today is not a checkpoint, capstone, light or return day, and today's main item is not itself a side
 * lesson. `done`: today's planned session has ended, so the offer reads as "one more" (after-core).
 */
export function sideOffer(
  plan: Pick<SessionPlan, "kind" | "mapItemId" | "returning" | "sideLesson">,
  list: Pick<SideLessons, "open" | "items" | "next"> | null | undefined,
  opts: { done?: boolean; titleOf?: (id: string) => string } = {},
): SideOffer | null {
  if (isSide(plan.mapItemId)) return null;
  const status = (id: string) => list?.items.find((i) => i.lessonId === id)?.status ?? null;
  // The server's offer line (`SideLessonState.offer`, the A1 spec's text) wins; the copy here is its fallback.
  const detailOf = (id: string): string | null =>
    list?.items.find((i) => i.lessonId === id)?.offer?.trim() ||
    (isSide(id) ? SIDE_LESSON_COPY[id].offer : null);
  if (plan.sideLesson !== undefined) {
    const s = plan.sideLesson;
    if (!s) return null;
    const resume = status(s.lessonId) === "in_progress";
    return {
      lessonId: s.lessonId,
      name: isSide(s.lessonId) ? SIDE_LESSON_COPY[s.lessonId].name : s.title,
      minutes: minutesOf(s.estMinutes),
      line: offerLine(s.lessonId, s.title, s.estMinutes, { resume, serverNote: s.note }),
      detail: detailOf(s.lessonId),
      placement: opts.done ? "after-core" : s.placement,
      resume,
    };
  }
  if (!list?.open || !list.next) return null;
  if (NO_OFFER_KINDS.has(plan.kind) || plan.returning) return null;
  const item = list.items.find((i) => i.lessonId === list.next);
  if (!item || item.status === "done" || item.status === "locked") return null;
  const resume = item.status === "in_progress";
  const title = opts.titleOf?.(item.lessonId) ?? item.title;
  return {
    lessonId: item.lessonId,
    name: isSide(item.lessonId) ? SIDE_LESSON_COPY[item.lessonId].name : title,
    minutes: minutesOf(item.estMinutes),
    line: offerLine(item.lessonId, title, item.estMinutes, { resume }),
    detail: detailOf(item.lessonId),
    placement: opts.done ? "after-core" : "alternative",
    resume,
  };
}

/**
 * The plan a side lesson starts with: a normal lesson session, its item the A1 lesson. Beside today's session it
 * keeps today's warm-up (§7.4); as "one more" after today's session the warm-up is already done, so it has none.
 */
export function sideLessonPlan(
  plan: SessionPlan,
  offer: Pick<SideOffer, "lessonId" | "minutes" | "name" | "placement">,
): SessionPlan {
  const warmup =
    offer.placement === "after-core"
      ? { ...plan.warmup, items: [], plannedSec: 0, moreAvailable: false }
      : plan.warmup;
  return {
    ...plan,
    warmup,
    kind: "lesson",
    mapItemId: offer.lessonId as SessionPlan["mapItemId"],
    title: offer.name,
    note: null,
    returning: null,
    main: { resumeStep: null, splitPart: null, light: null, estMinutes: offer.minutes },
    sideLesson: null,
    alternatives: plan.alternatives.filter((a) => a.mapItemId !== offer.lessonId),
  };
}

/**
 * Progress's line for track A, or null before the gate or on a server without the count. Never a count of side
 * lessons left (the A1 spec): what was taken, and that the rest are optional.
 */
export function sideLessonsLine(
  count: { done: number; total: number } | null | undefined,
  open: boolean | null,
): string | null {
  if (!count || count.total === 0) return null;
  if (count.done === 0)
    return open === false ? null : "Sound side lessons are open: optional, whenever you like.";
  if (count.done >= count.total) return `Sound side lessons: all ${count.total} taken.`;
  return `Sound side lessons: ${count.done} taken. The others stay optional.`;
}
