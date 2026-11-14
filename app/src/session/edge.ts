// The edge of what is written: the course is longer than the content authored so far (Wave 3 ends at U04.CP).
// Once every written item is done, the server plans review days ("The next lessons are still being written.
// Today: a review, then Studio."); Today, the Oak, Progress and the next-unlock card say so plainly instead of
// pointing at a lesson that cannot open. Pure: every surface reads it from here.
import type { CourseProgress, SyllabusDef } from "@oak/api";

export interface CourseEdge {
  /** The next item of the default order (`U05.L01`), or null when the whole course is done. */
  nextId: string | null;
  /** The unit that is being written ("Triads"), or null at the very end of the course. */
  nextUnit: { id: string; title: string } | null;
  /** The last unit before it ("Intervals"), when there is one. */
  doneUnit: { id: string; title: string } | null;
  /** The unwritten lesson is not its unit's first: part of the unit is written (and done), the rest is not. */
  partial?: boolean;
}

const isLessonId = (id: string): boolean => /\.L\d+$/.test(id);

/**
 * A lesson with a lesson file (`content.lessons`): the only kind Today and the Oak may open. An empty set means
 * the bundle carries no lesson files at all (built from the registries): nothing is judged unwritten then.
 */
export function isWritten(id: string, authored: ReadonlySet<string>): boolean {
  return !isLessonId(id) || authored.size === 0 || authored.has(id);
}

function unitOfLesson(
  syllabus: SyllabusDef | null,
  id: string,
): { index: number; id: string; title: string } | null {
  const units = syllabus?.units ?? [];
  for (const [index, u] of units.entries())
    if (u.lessons.some((l) => l.id === id)) return { index, id: u.id, title: u.title };
  return null;
}

/**
 * Where the written course ends for this learner, or null while there is still written work ahead. The edge is
 * reached when the next item of the default order is a lesson nobody has written yet (or nothing is next).
 */
const isSlot = (id: string): boolean => /^(GYM\.|CF-T\.)/.test(id);

/**
 * A gym or CF-T slot is scheduling, not a map item: the course's next item after one is the first item of the
 * default order past it that is not a slot. Any other ID (and null) is returned as it is.
 */
export function pastSlots(id: string | null, order: readonly string[] | null | undefined): string | null {
  if (id === null || !isSlot(id)) return id;
  const list = order ?? [];
  const at = list.indexOf(id);
  if (at < 0) return null;
  for (let i = at + 1; i < list.length; i++) if (!isSlot(list[i] as string)) return list[i] as string;
  return null;
}

export function courseEdge(
  progress: (Pick<CourseProgress, "next"> & Pick<Partial<CourseProgress>, "core">) | null | undefined,
  syllabus: SyllabusDef | null,
  authored: ReadonlySet<string>,
  /**
   * Today's plan, when known: a day whose New block is a written item (U04.CP is planned while U05.L01, before
   * it in the default order, is not written) is not the edge yet.
   */
  plan?: { mapItemId: string | null; core?: string | undefined } | null,
): CourseEdge | null {
  if (!progress || !syllabus) return null;
  // The core is complete (wave6.md §5.5): nothing "is still being written" on the path the learner walked. What is
  // open next (reviews, the gym, Studio, the tracks with their honest note) is said by finale-model.ts.
  if (progress.core === "complete" || plan?.core === "complete") return null;
  if (plan && plan.mapItemId !== null && isWritten(plan.mapItemId, authored)) return null;
  const next = pastSlots(progress.next, syllabus.defaultOrder as readonly string[]);
  if (next !== null && isWritten(next, authored)) return null;
  const units = syllabus.units.filter((u) => u.track === "core");
  if (next === null) {
    const last = units.at(-1);
    return { nextId: null, nextUnit: null, doneUnit: last ? { id: last.id, title: last.title } : null };
  }
  const at = unitOfLesson(syllabus, next);
  const coreAt = at ? units.findIndex((u) => u.id === at.id) : -1;
  const before = coreAt > 0 ? units[coreAt - 1] : null;
  const first = at ? syllabus.units.find((u) => u.id === at.id)?.lessons[0]?.id : undefined;
  return {
    nextId: next,
    nextUnit: at ? { id: at.id, title: at.title } : null,
    doneUnit: before ? { id: before.id, title: before.title } : null,
    ...(first !== undefined && first !== next ? { partial: true } : {}),
  };
}

/** The unit a lesson belongs to ("U05.L04" → "Triads"), or the ID itself. */
export function unitTitleOf(syllabus: SyllabusDef | null, lessonId: string): string {
  return unitOfLesson(syllabus, lessonId)?.title ?? lessonId;
}

/**
 * "Intervals" → "You have finished every lesson written so far, through Intervals." With `gym` (the gym is open,
 * from U07.L01), the Transcription Gym is named among the ways on, so the edge is never a dead end.
 */
export function edgeLead(edge: CourseEdge, opts: { gym?: boolean } = {}): string {
  const through = edge.partial ? "" : edge.doneUnit ? `, through ${edge.doneUnit.title}` : "";
  const next = edge.nextUnit
    ? edge.partial
      ? `The rest of ${edge.nextUnit.title} is still being written.`
      : `${edge.nextUnit.title}, the next unit, is still being written.`
    : "The rest of the course is still being written.";
  const yours = opts.gym ? "Studio and the Transcription Gym are yours" : "Studio is yours";
  return `You have finished every lesson written so far${through}. ${next} Until it arrives, a short review keeps what you know fresh, and ${yours}.`;
}

/**
 * The map item the Oak and Today point at as "next": the default order's next item, unless that is a lesson nobody
 * has written yet and today's plan offers a written item instead (U07.CP is planned while U08.L01, before it in the
 * default order, is not written; U04.CP waited for U05.L01 the same way). A gym or CF-T slot is scheduling, not a
 * map item: the order's next item stays the next one then.
 */
export function mapNextId(
  orderNext: string | null,
  planned: string | null,
  authored: ReadonlySet<string>,
  /** The default order: a slot as the order's next item is read past (`pastSlots`). */
  order?: readonly string[] | null,
): string | null {
  const next = order ? pastSlots(orderNext, order) : orderNext;
  if (next !== null && isWritten(next, authored)) return next;
  if (planned === null || isSlot(planned)) return next;
  return isWritten(planned, authored) ? planned : next;
}

/** The line for an unwritten next item ("still being written"), short enough for a chip or a toolbar. */
export function edgeShort(edge: CourseEdge): string {
  if (!edge.nextUnit) return "The rest is still being written";
  return edge.partial
    ? `The rest of ${edge.nextUnit.title} is still being written`
    : `${edge.nextUnit.title} is still being written`;
}
