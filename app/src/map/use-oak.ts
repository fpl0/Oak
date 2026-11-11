// Everything the map, its panel and the thumbnail read, joined once: content (skill graph, syllabus,
// families), the learner's skill states, course progress and drill cards. Queries come from the shared
// `lib/queries.ts`; nothing here writes.
import type { SkillState } from "@oak/api";
import { useContent } from "../lib/content.ts";
import { lessonTitles } from "../lib/content-model.ts";
import { useCourseProgress, useFamilies, useSkillMap } from "../lib/queries.ts";
import { buildMapGraph, type MapGraph } from "./graph.ts";
import { type NextPath, unitProgress, whatsNext } from "./guide.ts";
import { layoutOak, type MapLayout } from "./layout.ts";

export interface OakModel {
  graph: MapGraph;
  layout: MapLayout;
  states: ReadonlyMap<string, SkillState>;
  next: NextPath;
  lessonStatus: ReadonlyMap<string, string>;
  lessonTitle: (id: string) => string;
  reviveSec: number;
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
    const lessonStatus = new Map((progress.data?.lessons ?? []).map((l) => [l.lessonId, l.status as string]));
    model = {
      ...cached,
      states: new Map((map.data?.nodes ?? []).map((n) => [n.skillId, n])),
      next: whatsNext(progress.data, bundle.syllabus, cached.graph),
      lessonStatus,
      lessonTitle: (id: string) => titles.get(id) ?? id,
      reviveSec: map.data?.reviveSec ?? 0,
      units: unitProgress(bundle.syllabus, lessonStatus, progress.data?.next ?? null),
    };
  }
  return { content, map, progress, families, model };
}
