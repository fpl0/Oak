// What the map points at: the "what's next" path (the next map item's skills and the prerequisites feeding
// them) and where "Practise this" goes for a node (its drill family, else its lesson). Pure.
import type { CheckpointMeta, CourseProgress, FamilyDef, SrsCard, SyllabusDef } from "@oak/api";
import type { MapGraph } from "./graph.ts";

export interface NextPath {
  /** The next map item (`U01.L04`, `U01.CP`, `C0.S1`), or null when nothing is next. */
  sessionId: string | null;
  kind: "lesson" | "checkpoint" | "capstone" | null;
  /** "U01.L04 · Eighths" style title for the header line. */
  title: string;
  /** Skills the next item teaches (or tests). */
  targets: string[];
  /** Direct prerequisites of the targets that are not targets themselves. */
  feeders: string[];
  /** `from>to` keys of the edges into the targets. */
  edges: Set<string>;
  /** False for a lesson nobody has written yet (the edge of the written course): shown, never opened. */
  written: boolean;
}

export const edgeKey = (from: string, to: string) => `${from}>${to}`;

const EMPTY: NextPath = {
  sessionId: null,
  kind: null,
  title: "",
  targets: [],
  feeders: [],
  edges: new Set(),
  written: true,
};

function lessonOf(syllabus: SyllabusDef | null, id: string) {
  for (const u of syllabus?.units ?? []) for (const l of u.lessons) if (l.id === id) return l;
  return null;
}

function checkpointSkills(cps: readonly CheckpointMeta[], id: string): string[] {
  const cp = cps.find((c) => c.id === id);
  return cp ? [...new Set([...cp.gated, ...cp.levelSetting])] : [];
}

export function whatsNext(
  progress: Pick<CourseProgress, "next"> | null | undefined,
  syllabus: SyllabusDef | null,
  graph: MapGraph,
  /** Lessons with a lesson file; absent: every lesson counts as written. */
  authored?: ReadonlySet<string>,
): NextPath {
  const next = progress?.next ?? null;
  if (!next) return EMPTY;
  const known = new Set(graph.nodes.map((n) => n.id));
  const checkpoints = syllabus?.checkpoints ?? [];
  let kind: NextPath["kind"] = null;
  let title: string = next;
  let targets: string[] = [];
  const lesson = lessonOf(syllabus, next);
  if (lesson) {
    kind = "lesson";
    title = `${lesson.id} · ${lesson.title}`;
    targets = lesson.introduces.length > 0 ? [...lesson.introduces] : [...lesson.practises];
  } else if (/\.CP\d*$/.test(next)) {
    kind = "checkpoint";
    const cp = checkpoints.find((c) => c.id === next);
    title = cp ? `${cp.id} · ${cp.title}` : next;
    targets = checkpointSkills(checkpoints, next);
  } else {
    const cap = /^(C\d+|[A-Z]+C\d+)\./.exec(next)?.[1] ?? next;
    const meta = syllabus?.capstones.find((c) => c.id === cap);
    kind = "capstone";
    title = meta ? `${meta.id} · ${meta.title}` : next;
    // A capstone uses what the checkpoint before it tested.
    const order = syllabus?.defaultOrder ?? [];
    const at = order.indexOf(next as (typeof order)[number]);
    for (let i = at - 1; i >= 0; i--) {
      const s = order[i] as string;
      if (/\.CP\d*$/.test(s)) {
        targets = checkpointSkills(checkpoints, s);
        break;
      }
    }
  }
  targets = targets.filter((t) => known.has(t));
  const targetSet = new Set(targets);
  const feeders = new Set<string>();
  const edges = new Set<string>();
  for (const [a, b] of graph.edges) {
    if (!targetSet.has(b)) continue;
    edges.add(edgeKey(a, b));
    if (!targetSet.has(a)) feeders.add(a);
  }
  const written = kind !== "lesson" || !authored || authored.size === 0 || authored.has(next);
  return { sessionId: next, kind, title, targets, feeders: [...feeders].sort(), edges, written };
}

export type PractiseTarget =
  | { kind: "family"; familyId: string; title: string }
  | { kind: "lesson"; lessonId: string; title: string; completed: boolean }
  | { kind: "locked"; lessonId: string | null; title: string; unwritten?: boolean };

/** Drill families that train a skill, strongest weight first. */
export function familiesOf(skillId: string, families: readonly FamilyDef[]): FamilyDef[] {
  const weight = (f: FamilyDef) =>
    f.skills
      .filter((s) => s.skill === skillId || String(s.skill).startsWith(`${skillId}/`))
      .reduce((sum, s) => sum + s.w, 0);
  return families
    .filter((f) => weight(f) > 0)
    .sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id));
}

/**
 * "Practise this": the strongest drill family whose card the learner already has (active or graduated),
 * else the introducing lesson when it is open, else a locked note naming the lesson that opens it.
 */
export function practiseTarget(
  skill: { id: string; introducedBy: string | null },
  ctx: {
    families: readonly FamilyDef[];
    cards: readonly Pick<SrsCard, "cardId" | "status">[];
    lessonStatus: ReadonlyMap<string, string>;
    lessonTitle: (id: string) => string;
    /** Lessons with a lesson file; an open lesson nobody has written yet is not offered. */
    authored?: ReadonlySet<string>;
  },
): PractiseTarget {
  const live = new Set(
    ctx.cards.filter((c) => c.status === "active" || c.status === "graduated").map((c) => c.cardId),
  );
  const fam = familiesOf(skill.id, ctx.families).find((f) => live.has(f.id));
  if (fam) return { kind: "family", familyId: fam.id, title: fam.title };
  const lessonId = skill.introducedBy;
  const status = lessonId ? (ctx.lessonStatus.get(lessonId) ?? "locked") : "locked";
  const unwrittenLesson =
    !!lessonId && !!ctx.authored && ctx.authored.size > 0 && !ctx.authored.has(lessonId);
  if (lessonId && status !== "locked" && !unwrittenLesson)
    return { kind: "lesson", lessonId, title: ctx.lessonTitle(lessonId), completed: status === "completed" };
  const unwritten = unwrittenLesson && status !== "locked";
  return {
    kind: "locked",
    lessonId,
    title: lessonId ? ctx.lessonTitle(lessonId) : "",
    ...(unwritten ? { unwritten: true } : {}),
  };
}

/** Lessons done per unit (optional lessons left out), and which unit holds the next map item. */
export function unitProgress(
  syllabus: SyllabusDef | null,
  lessonStatus: ReadonlyMap<string, string>,
  nextSession: string | null,
): Map<string, { done: number; total: number; current: boolean }> {
  const out = new Map<string, { done: number; total: number; current: boolean }>();
  const nextUnit = nextSession ? (/^([A-Z]+\d+)\./.exec(nextSession)?.[1] ?? null) : null;
  for (const u of syllabus?.units ?? []) {
    const core = u.lessons.filter((l) => !l.optional);
    out.set(u.id, {
      done: core.filter((l) => lessonStatus.get(l.id) === "completed").length,
      total: core.length,
      current: u.id === nextUnit,
    });
  }
  return out;
}
