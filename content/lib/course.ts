// The legal orders of contracts §7.6 as a prerequisite graph, and the questions content CI asks of it:
// "is A guaranteed to come before B in every legal order?" (§3.1 rules 10–12, §4.2), "what may session S
// use?" and "is the skill graph ordered?". Pure and isomorphic: the build, content:check, the validation
// suite and (later) the server's planner all read the same answers.
import type {
  CapstoneDef,
  CheckpointMeta,
  LessonId,
  SessionId,
  SkillDef,
  SyllabusDef,
  ToolEntry,
  TrackId,
  UnitDef,
  UnitId,
  UnlockableId,
} from "@oak/content-kit";

export type SessionKind = "lesson" | "checkpoint" | "capstone" | "gym";
export interface SessionNode {
  id: SessionId;
  kind: SessionKind;
  track: "core" | TrackId;
  unit?: UnitId;
  title: string;
  objective: string;
  optional?: boolean;
  /** Sessions that must be completed before this one opens (direct edges of §7.6). */
  requires: SessionId[];
}
export interface CourseGraph {
  nodes: ReadonlyMap<SessionId, SessionNode>;
  /** Every session guaranteed to be completed before `id` opens, in every legal order (memoized). */
  before(id: SessionId): ReadonlySet<SessionId>;
}

const isCheckpoint = (id: string) => id.endsWith(".CP") || /^[JRA]\.CP\d?$/.test(id);

/** Builds the graph from the syllabus, the capstone definitions and the checkpoint lesson exceptions. */
export function buildCourseGraph(
  syllabus: SyllabusDef,
  capstones: readonly CapstoneDef[],
  exceptions: Partial<
    Record<string, { only?: Partial<Record<string, LessonId[]>>; without?: LessonId[] }>
  > = {},
  /** Lessons a track may go past without (§7.6 rule 5: only J2.L04). */
  passable: readonly LessonId[] = ["J2.L04"],
): CourseGraph {
  const nodes = new Map<SessionId, SessionNode>();
  const unitsById = new Map<string, UnitDef>(syllabus.units.map((u) => [u.id, u]));
  const core = syllabus.units.filter((u) => u.track === "core");

  // 1–2. Core lessons are linear; L03 and later also need the most recent checkpoint before the unit.
  let prev: LessonId | null = null;
  let lastCp: string | null = null;
  for (const unit of core) {
    const cpBefore = lastCp;
    unit.lessons.forEach((l, i) => {
      const requires: SessionId[] = [];
      if (prev) requires.push(prev);
      if (i >= 2 && cpBefore) requires.push(cpBefore as SessionId);
      nodes.set(l.id, {
        id: l.id,
        kind: "lesson",
        track: "core",
        unit: unit.id,
        title: l.title,
        objective: l.objective,
        requires,
      });
      prev = l.id;
    });
    if (unit.checkpoint) lastCp = unit.checkpoint;
  }

  // 5. Track lessons: the gate of §4.3 plus the previous lesson of the track. A passable lesson (J2.L04)
  // can be gone past, so the lesson after it needs the last lesson before it instead.
  for (const track of syllabus.tracks) {
    const lessons = track.units.flatMap((u) =>
      (unitsById.get(u)?.lessons ?? []).map((l) => ({ l, unit: u })),
    );
    let lastRequired: LessonId | null = null;
    let lastAny: LessonId | null = null;
    for (const { l, unit } of lessons) {
      const requires: SessionId[] = [];
      const p = passable.includes(l.id) ? lastAny : lastRequired;
      if (p) requires.push(p);
      for (const g of syllabus.trackGates)
        if (g.opens.includes(l.id) || g.opens.includes(unit))
          requires.push(...gateSessions(g.gate, capstones));
      nodes.set(l.id, {
        id: l.id,
        kind: "lesson",
        track: track.id,
        unit,
        title: l.title,
        objective: l.objective,
        ...(l.optional ? { optional: true } : {}),
        requires: [...new Set(requires)],
      });
      lastAny = l.id;
      if (!passable.includes(l.id)) lastRequired = l.id;
    }
  }

  // 3. A checkpoint opens when the lessons it covers are completed.
  for (const cp of syllabus.checkpoints) nodes.set(cp.id, checkpointNode(cp, unitsById, exceptions));

  // 4. Capstones: S1 opens by its gate; later sessions follow the previous one. A capstone gates nothing
  // but the capstones named in §2.4 / §4.3 (handled by `capstones` in their gates).
  for (const c of capstones) {
    const extra = syllabus.trackGates
      .filter((g) => g.opens.includes(c.id))
      .flatMap((g) => gateSessions(g.gate, capstones));
    c.sessionDefs.forEach((s, i) => {
      const requires =
        i === 0
          ? [...new Set([...gateSessions(c.opensAfter, capstones), ...extra])]
          : [c.sessionDefs[i - 1]?.id as SessionId];
      const track = c.id.startsWith("J")
        ? "J"
        : c.id.startsWith("R")
          ? "R"
          : c.id.startsWith("A")
            ? "A"
            : "core";
      nodes.set(s.id, {
        id: s.id,
        kind: "capstone",
        track,
        title: `${c.title}: ${s.title}`,
        objective: s.goal,
        requires,
      });
    });
  }

  // Gym slots: scheduling, not gates. They sit after the session that precedes them in the default order.
  syllabus.defaultOrder.forEach((id, i) => {
    if (!id.startsWith("GYM.")) return;
    const before = syllabus.defaultOrder[i - 1] as SessionId;
    nodes.set(id, {
      id,
      kind: "gym",
      track: "core",
      title: `Transcription gym ${id.slice(4)}`,
      objective: "A transcription session (ladder or own audio).",
      requires: before ? [before] : [],
    });
  });

  const memo = new Map<SessionId, Set<SessionId>>();
  const before = (id: SessionId): Set<SessionId> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const out = new Set<SessionId>();
    memo.set(id, out); // cycle guard: a cycle shows up as a missing ancestor, and validate reports cycles
    for (const r of nodes.get(id)?.requires ?? []) {
      out.add(r);
      for (const a of before(r)) out.add(a);
    }
    return out;
  };
  return { nodes, before };
}

function checkpointNode(
  cp: CheckpointMeta,
  units: Map<string, UnitDef>,
  exceptions: Partial<Record<string, { only?: Partial<Record<string, LessonId[]>>; without?: LessonId[] }>>,
): SessionNode {
  const ex = exceptions[cp.id];
  const covered: LessonId[] = [];
  for (const u of cp.covers) {
    const lessons = units.get(u)?.lessons ?? [];
    const only = ex?.only?.[u];
    for (const l of lessons) if (!only || only.includes(l.id)) covered.push(l.id);
  }
  for (const [u, ls] of Object.entries(ex?.only ?? {}))
    if (!cp.covers.includes(u as UnitId)) covered.push(...(ls ?? []));
  const requires = covered.filter((l) => !ex?.without?.includes(l));
  const unit = cp.covers[cp.covers.length - 1];
  const track = /^[JRA]\./.test(cp.id) ? (cp.id[0] as TrackId) : "core";
  return {
    id: cp.id,
    kind: "checkpoint",
    track,
    ...(unit ? { unit } : {}),
    title: cp.title,
    objective: `Checkpoint over ${cp.covers.join(", ")}.`,
    requires: [...new Set(requires)],
  };
}

function gateSessions(
  gate: { checkpoints?: string[]; lessonsCompleted?: string[]; capstones?: string[] },
  capstones: readonly CapstoneDef[],
): SessionId[] {
  const out: SessionId[] = [
    ...((gate.checkpoints ?? []) as SessionId[]),
    ...((gate.lessonsCompleted ?? []) as SessionId[]),
  ];
  for (const c of gate.capstones ?? []) {
    const cap = capstones.find((x) => x.id === c);
    const last = cap?.sessionDefs[cap.sessionDefs.length - 1]?.id;
    if (last) out.push(last);
  }
  return out;
}

/** Whether `a` is `b` or is guaranteed to be completed before `b` opens in every legal order. */
export function atOrBefore(graph: CourseGraph, a: SessionId, b: SessionId): boolean {
  return a === b || graph.before(b).has(a);
}

/**
 * Whether a tool may be used by authored code of session `s` (contracts §3.1 rules 2, 10–12): one of its
 * sites is `s` itself or guaranteed before it, or its START fallback site is guaranteed before it.
 */
export function usableAt(graph: CourseGraph, entry: ToolEntry, s: SessionId): boolean {
  const sites = Array.isArray(entry.unlock.at) ? entry.unlock.at : [entry.unlock.at];
  if (sites.some((site) => atOrBefore(graph, site, s))) return true;
  const fb = entry.unlock.fallbackAt;
  return fb !== undefined && graph.before(s).has(fb);
}

/** Everything authored code of session `s` may use: `unlocked ∪ unlocksOf(s)` in every legal order. */
export function unlockedAt(
  graph: CourseGraph,
  toolbox: readonly ToolEntry[],
  s: SessionId,
): Set<UnlockableId> {
  return new Set(toolbox.filter((t) => usableAt(graph, t, s)).map((t) => t.id as UnlockableId));
}

/** The unlock sites a learner can be granted a tool at, in default-order terms (for display). */
export function firstSite(entry: ToolEntry, order: readonly SessionId[]): SessionId {
  const sites = Array.isArray(entry.unlock.at) ? entry.unlock.at : [entry.unlock.at];
  return [...sites].sort((a, b) => rank(order, a) - rank(order, b))[0] as SessionId;
}
const rank = (order: readonly SessionId[], id: SessionId) => {
  const i = order.indexOf(id);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

export interface OrderIssue {
  skill: string;
  prerequisite: string;
  lesson: string;
  message: string;
}
/** §4.2 rule 1: every prerequisite introduced earlier in every legal order, or earlier in the same lesson. */
export function skillOrderIssues(
  graph: CourseGraph,
  syllabus: SyllabusDef,
  skills: readonly SkillDef[],
): OrderIssue[] {
  const introducedIn = new Map<string, { lesson: LessonId; index: number }[]>();
  for (const u of syllabus.units)
    for (const l of u.lessons)
      l.introduces.forEach((s, index) => {
        introducedIn.set(s, [...(introducedIn.get(s) ?? []), { lesson: l.id, index }]);
      });
  const issues: OrderIssue[] = [];
  for (const sk of skills) {
    if (sk.retired) continue;
    const at = introducedIn.get(sk.id) ?? [];
    if (at.length === 0) {
      issues.push({
        skill: sk.id,
        prerequisite: "",
        lesson: "",
        message: `${sk.id} is introduced by no lesson`,
      });
      continue;
    }
    if (at.length > 1)
      issues.push({
        skill: sk.id,
        prerequisite: "",
        lesson: at.map((a) => a.lesson).join(" "),
        message: `${sk.id} is introduced twice`,
      });
    const here = at[0] as { lesson: LessonId; index: number };
    if (here.lesson !== sk.introducedBy)
      issues.push({
        skill: sk.id,
        prerequisite: "",
        lesson: here.lesson,
        message: `${sk.id}.introducedBy is ${sk.introducedBy} but the syllabus introduces it in ${here.lesson}`,
      });
    for (const p of sk.prerequisites) {
      const pAt = introducedIn.get(p)?.[0];
      if (!pAt) {
        issues.push({
          skill: sk.id,
          prerequisite: p,
          lesson: here.lesson,
          message: `prerequisite ${p} is introduced by no lesson`,
        });
        continue;
      }
      const ok =
        pAt.lesson === here.lesson ? pAt.index < here.index : graph.before(here.lesson).has(pAt.lesson);
      if (!ok)
        issues.push({
          skill: sk.id,
          prerequisite: p,
          lesson: here.lesson,
          message: `${sk.id} (${here.lesson}) needs ${p} (${pAt.lesson}), which is not guaranteed to come first`,
        });
    }
  }
  return issues;
}

/** Cycles in the session graph (there must be none). */
export function sessionCycles(graph: CourseGraph): SessionId[][] {
  const state = new Map<SessionId, 0 | 1 | 2>();
  const cycles: SessionId[][] = [];
  const stack: SessionId[] = [];
  const visit = (id: SessionId) => {
    const st = state.get(id) ?? 0;
    if (st === 2) return;
    if (st === 1) {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const r of graph.nodes.get(id)?.requires ?? []) visit(r);
    stack.pop();
    state.set(id, 2);
  };
  for (const id of graph.nodes.keys()) visit(id);
  return cycles;
}

export { isCheckpoint };
