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
export function courseEdge(
  progress: Pick<CourseProgress, "next"> | null | undefined,
  syllabus: SyllabusDef | null,
  authored: ReadonlySet<string>,
  /**
   * Today's plan, when known: a day whose New block is a written item (U04.CP is planned while U05.L01, before
   * it in the default order, is not written) is not the edge yet.
   */
  plan?: { mapItemId: string | null } | null,
): CourseEdge | null {
  if (!progress || !syllabus) return null;
  if (plan && plan.mapItemId !== null && isWritten(plan.mapItemId, authored)) return null;
  const next = progress.next;
  if (next !== null && isWritten(next, authored)) return null;
  const units = syllabus.units.filter((u) => u.track === "core");
  if (next === null) {
    const last = units.at(-1);
    return { nextId: null, nextUnit: null, doneUnit: last ? { id: last.id, title: last.title } : null };
  }
  const at = unitOfLesson(syllabus, next);
  const coreAt = at ? units.findIndex((u) => u.id === at.id) : -1;
  const before = coreAt > 0 ? units[coreAt - 1] : null;
  return {
    nextId: next,
    nextUnit: at ? { id: at.id, title: at.title } : null,
    doneUnit: before ? { id: before.id, title: before.title } : null,
  };
}

/** The unit a lesson belongs to ("U05.L04" → "Triads"), or the ID itself. */
export function unitTitleOf(syllabus: SyllabusDef | null, lessonId: string): string {
  return unitOfLesson(syllabus, lessonId)?.title ?? lessonId;
}

/** "Intervals" → "You have finished every lesson written so far, through Intervals." */
export function edgeLead(edge: CourseEdge): string {
  const through = edge.doneUnit ? `, through ${edge.doneUnit.title}` : "";
  const next = edge.nextUnit
    ? `${edge.nextUnit.title}, the next unit, is still being written.`
    : "The rest of the course is still being written.";
  return `You have finished every lesson written so far${through}. ${next} Until it arrives, a short review keeps what you know fresh, and Studio is yours.`;
}

/** The line for an unwritten next item ("still being written"), short enough for a chip or a toolbar. */
export function edgeShort(edge: CourseEdge): string {
  return edge.nextUnit ? `${edge.nextUnit.title} is still being written` : "The rest is still being written";
}
