// Side lessons in the command palette (Wave 5, contracts §2.6): A1.L01–L04 are optional and open once U03.L02 is
// done. The palette lists them with the lessons but says what they are and where they stand, so nothing makes them
// look required (docs/design/wave5.md §10 item 14). The palette fetches nothing for it: it reads the server's
// `sideLessons.list` answer when a page already loaded it, and otherwise the unlock list the shell has anyway (the
// gate's own toolbox rows; a side lesson's own rows once it is done). Pure (tested in side-lessons.test.ts).
import { SIDE_LESSON_GATE, type SideLessons } from "@oak/api";
import type { SyllabusDef, ToolEntry } from "@oak/content-kit";

export interface SideLessonContext {
  /** The server's answer, when some page has loaded it. */
  state: SideLessons | undefined;
  unlocked: ReadonlySet<string>;
  /** The unlock list has loaded. */
  ready: boolean;
  toolbox: readonly ToolEntry[];
  syllabus: SyllabusDef | null;
}

const sitesOf = (t: ToolEntry): string[] => (Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at]);

/** The palette hint of a lesson: `null` for a core lesson (the palette shows its ID). */
export function sideLessonHint(lessonId: string, side: boolean, ctx: SideLessonContext): string | null {
  if (!side) return null;
  const gateTitle =
    ctx.syllabus?.units.flatMap((u) => u.lessons).find((l) => l.id === SIDE_LESSON_GATE)?.title ??
    SIDE_LESSON_GATE;
  const item = ctx.state?.items.find((i) => i.lessonId === lessonId);
  if (item) {
    switch (item.status) {
      case "locked":
        return `Side lesson · opens after ${gateTitle}`;
      case "open":
        return `Optional side lesson · about ${Math.max(1, Math.round(item.estMinutes))} min`;
      case "in_progress":
        return "Side lesson · in progress";
      case "done":
        return "Side lesson · done";
    }
  }
  if (!ctx.ready) return "Optional side lesson";
  const gateRows = ctx.toolbox.filter((t) => sitesOf(t).includes(SIDE_LESSON_GATE));
  if (gateRows.length > 0 && !gateRows.some((t) => ctx.unlocked.has(t.id)))
    return `Side lesson · opens after ${gateTitle}`;
  const own = ctx.toolbox.filter((t) => {
    const sites = sitesOf(t);
    return sites.length === 1 && sites[0] === lessonId;
  });
  if (own.length > 0 && own.every((t) => ctx.unlocked.has(t.id))) return "Side lesson · done";
  return "Optional side lesson";
}
