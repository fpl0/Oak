// Everything the map, its panel and the thumbnail read, joined once: content (skill graph, syllabus,
// families), the learner's skill states, course progress and drill cards. Queries come from the shared
// `lib/queries.ts`; nothing here writes.
import type { CourseProgress, SkillState } from "@oak/api";
import { useContent } from "../lib/content.ts";
import { lessonTitles } from "../lib/content-model.ts";
import { useCourseProgress, useFamilies, useSkillMap, useTodayPlan, useVoiceState } from "../lib/queries.ts";
import { mapNextId } from "../session/edge.ts";
import { buildMapGraph, type MapGraph } from "./graph.ts";
import { type NextPath, unitProgress, whatsNext } from "./guide.ts";
import { layoutOak, type MapLayout } from "./layout.ts";
import { withQuiet } from "./revive.ts";

export interface OakModel {
  graph: MapGraph;
  layout: MapLayout;
  states: ReadonlyMap<string, SkillState>;
  next: NextPath;
  lessonStatus: ReadonlyMap<string, string>;
  lessonTitle: (id: string) => string;
  reviveSec: number;
  /** Quiet mode today (`voice.get`; false until the server answers): voice leaves wait for the mic. */
  quiet: { on: boolean; reason: "today" | "always" | "no-mic" | null };
  /** Lessons with a lesson file (`content.lessons`): an unwritten lesson is shown, never opened. */
  authored: ReadonlySet<string>;
  /** Lessons done per unit and the unit holding the next map item (the map's row labels). */
  units: ReadonlyMap<string, { done: number; total: number; current: boolean }>;
}

// The graph and layout depend only on the content bundle, which never changes while the app runs.
const layoutCache = new WeakMap<object, { graph: MapGraph; layout: MapLayout }>();

export function useOak() {
  const content = useContent();
  const map = useSkillMap();
  const progress = useCourseProgress();
  const families = useFamilies();
  const voice = useVoiceState();
  const plan = useTodayPlan();
  const bundle = content.data;
  let model: OakModel | null = null;
  if (bundle) {
    let cached = layoutCache.get(bundle);
    if (!cached) {
      const graph = buildMapGraph(bundle.skills, bundle.syllabus);
      cached = { graph, layout: layoutOak(graph) };
      layoutCache.set(bundle, cached);
    }
    const titles = lessonTitles(bundle.syllabus);
    const authored = new Set(bundle.lessons.map((l) => l.id as string));
    // The next item of the default order, unless it is a lesson nobody has written yet and today's plan has
    // moved on to a written one (U04.CP is planned while U05.L01, before it in the order, is being written).
    const orderNext = progress.data?.next ?? null;
    const planned = plan.data?.mapItemId ?? null;
    const nextId = mapNextId(orderNext, planned, authored, bundle.syllabus?.defaultOrder);
    const lessonStatus = new Map((progress.data?.lessons ?? []).map((l) => [l.lessonId, l.status as string]));
    model = {
      ...cached,
      states: withQuiet(
        new Map((map.data?.nodes ?? []).map((n) => [n.skillId as string, n])),
        voice.data?.quiet === true,
      ),
      quiet: { on: voice.data?.quiet === true, reason: voice.data?.quietReason ?? null },
      next: whatsNext(
        nextId === null ? progress.data : { next: nextId as CourseProgress["next"] },
        bundle.syllabus,
        cached.graph,
        authored,
      ),
      authored,
      lessonStatus,
      lessonTitle: (id: string) => titles.get(id) ?? id,
      reviveSec: map.data?.reviveSec ?? 0,
      units: unitProgress(bundle.syllabus, lessonStatus, nextId),
    };
  }
  return { content, map, progress, families, model };
}
