// The Oak's graph model: the skill graph (contracts §4) joined to the course order (syllabus), so the map can
// group nodes by strand (region) and unit and order them the way the course teaches them. Pure: no DOM.
import type { SyllabusDef } from "@oak/api";
import { REGION_ORDER, type SkillGraph, type SkillNode } from "../lib/content-model.ts";
import { faceLabel } from "./blurbs.ts";

export type Region = SkillNode["region"];

export interface MapNode extends SkillNode {
  /** Node-face label (short form of the name when it is long). */
  label: string;
  /** Unit of the introducing lesson (`U01`, `J1`), or `"—"` when the node has none. */
  unit: string;
  /** Teaching rank: position of the introducing lesson in the course, then in its `introduces` list. */
  rank: number;
}

export interface MapUnit {
  id: string;
  title: string;
  /** `core` or the track id (`J`, `R`, `A`). */
  track: string;
}

export interface MapGraph {
  nodes: MapNode[];
  /** `[from, to]`: `from` is a prerequisite of `to`. */
  edges: [string, string][];
  /** Units in course order (the default linear order first, then the tracks). */
  units: MapUnit[];
  /** Strands that have at least one node, in map order. */
  regions: Region[];
}

/** `U01.L04` → `U01`; `U01.CP` → `U01`; `C0.S1` and `GYM.01` → null. */
export function unitOfSession(id: string): string | null {
  const m = /^([A-Z]+\d+)\.(L\d+|CP\d*)$/.exec(id);
  return m ? (m[1] ?? null) : null;
}

/** Unit of a lesson id (`U01.L04` → `U01`, `R1.L03` → `R1`). */
export function unitOfLesson(id: string | null): string {
  if (!id) return "—";
  return id.split(".")[0] ?? id;
}

export function buildMapGraph(skills: SkillGraph, syllabus: SyllabusDef | null): MapGraph {
  // Unit order: first appearance in the default order, then the syllabus' remaining units, then any unit the
  // graph names that the syllabus does not (sorted, so the order never depends on input order).
  const unitOrder: string[] = [];
  const seen = new Set<string>();
  const addUnit = (u: string | null) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      unitOrder.push(u);
    }
  };
  for (const s of syllabus?.defaultOrder ?? []) addUnit(unitOfSession(s));
  for (const u of syllabus?.units ?? []) addUnit(u.id);
  const extra = [...new Set(skills.nodes.map((n) => unitOfLesson(n.introducedBy)))].filter(
    (u) => !seen.has(u),
  );
  extra.sort((a, b) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)));
  for (const u of extra) addUnit(u);

  // Lesson rank: default order first, then each unit's lesson list in unit order.
  const lessonRank = new Map<string, number>();
  for (const s of syllabus?.defaultOrder ?? []) if (!lessonRank.has(s)) lessonRank.set(s, lessonRank.size);
  const introIndex = new Map<string, number>();
  for (const u of syllabus?.units ?? [])
    for (const l of u.lessons) {
      if (!lessonRank.has(l.id)) lessonRank.set(l.id, lessonRank.size);
      l.introduces.forEach((sk, i) => {
        if (!introIndex.has(sk)) introIndex.set(sk, i);
      });
    }
  const unitIndex = new Map(unitOrder.map((u, i) => [u, i]));
  const registryIndex = new Map(skills.nodes.map((n, i) => [n.id, i]));
  const rankOf = (n: SkillNode): number => {
    const lesson = n.introducedBy ? lessonRank.get(n.introducedBy) : undefined;
    const base =
      lesson !== undefined ? lesson : 100_000 + (unitIndex.get(unitOfLesson(n.introducedBy)) ?? 999) * 100;
    return base * 1000 + (introIndex.get(n.id) ?? 500) + (registryIndex.get(n.id) ?? 0) / 1000;
  };

  const nodes: MapNode[] = skills.nodes
    .map((n) => ({
      ...n,
      label: faceLabel(n.id, n.name),
      unit: unitOfLesson(n.introducedBy),
      rank: rankOf(n),
    }))
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  const titles = new Map<string, { title: string; track: string }>(
    (syllabus?.units ?? []).map((u) => [u.id, u]),
  );
  const used = new Set(nodes.map((n) => n.unit));
  const units: MapUnit[] = unitOrder
    .filter((u) => used.has(u))
    .map((u) => ({
      id: u,
      title: titles.get(u)?.title ?? (u === "—" ? "Not yet placed" : u),
      track: titles.get(u)?.track ?? "core",
    }));
  const regionSet = new Set(nodes.map((n) => n.region));
  const regions = REGION_ORDER.filter((r) => regionSet.has(r));
  const known = new Set(nodes.map((n) => n.id));
  const edges = skills.edges
    .filter(([a, b]) => known.has(a) && known.has(b))
    .sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
  return { nodes, edges, units, regions };
}

/** Every ancestor (prerequisite, transitively) of `ids`, the ids themselves excluded. */
export function ancestorsOf(ids: Iterable<string>, edges: readonly [string, string][]): Set<string> {
  const preds = new Map<string, string[]>();
  for (const [a, b] of edges) {
    const list = preds.get(b);
    if (list) list.push(a);
    else preds.set(b, [a]);
  }
  const start = new Set(ids);
  const out = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const p of preds.get(id) ?? [])
      if (!out.has(p) && !start.has(p)) {
        out.add(p);
        stack.push(p);
      }
  }
  return out;
}
