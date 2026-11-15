// /progress (ux §2.3, §5.5) and Today's next-unlock card: pure helpers over server data. Honest numbers only:
// counts the server stored, nothing estimated here except the next-unlock fallback, which counts map sessions in
// the default order exactly as `GET /unlocks/next` does.
import type { CanDoEntry, CourseProgress, NextUnlock, StreakDay } from "@oak/api";
import type { SyllabusDef, ToolEntry } from "@oak/content-kit";

/** The ledger is a status history: the current status is the latest row; `firstAt` is the first evidence. */
export function ledger(entries: readonly CanDoEntry[]): Map<string, { latest: CanDoEntry; firstAt: string }> {
  const out = new Map<string, { latest: CanDoEntry; firstAt: string }>();
  for (const e of entries) {
    const cur = out.get(e.candoId);
    if (!cur) out.set(e.candoId, { latest: e, firstAt: e.at });
    else
      out.set(e.candoId, {
        latest: cur.latest.at <= e.at ? e : cur.latest,
        firstAt: [e.at, cur.firstAt].sort()[0] as string,
      });
  }
  return out;
}

/** The can-do statuses before an instant (the Coda's "emerging → solid"). */
export function statusesBefore(
  entries: readonly CanDoEntry[],
  before: string,
): Map<string, CanDoEntry["status"]> {
  const m = new Map<string, CanDoEntry>();
  for (const e of entries) {
    if (e.at >= before) continue;
    const cur = m.get(e.candoId);
    if (!cur || cur.at <= e.at) m.set(e.candoId, e);
  }
  return new Map([...m].map(([k, v]) => [k, v.status]));
}

export interface UnitProgress {
  unitId: string;
  title: string;
  done: number;
  total: number;
  inProgress: boolean;
  checkpoint: { id: string; status: CourseProgress["checkpoints"][number]["status"] } | null;
}

/** Lessons completed per core unit, with the unit's checkpoint. Units with no lesson started are included. */
export function unitProgress(syllabus: Pick<SyllabusDef, "units">, course: CourseProgress): UnitProgress[] {
  const lessons = new Map(course.lessons.map((l) => [l.lessonId as string, l]));
  const cps = new Map(course.checkpoints.map((c) => [c.cpId as string, c]));
  return syllabus.units
    .filter((u) => u.track === "core")
    .map((u) => {
      const ls = u.lessons.filter((l) => !l.optional);
      const states = ls.map((l) => lessons.get(l.id)?.status ?? "locked");
      const cp = u.checkpoint ? (cps.get(u.checkpoint) ?? null) : null;
      return {
        unitId: u.id,
        title: u.title,
        done: states.filter((s) => s === "completed").length,
        total: ls.length,
        inProgress: states.some((s) => s === "in_progress" || s === "available"),
        checkpoint: cp ? { id: cp.cpId, status: cp.status } : null,
      };
    });
}

export interface PracticeTime {
  totalMinutes: number;
  last7: number;
  last28: number;
  daysPractised: number;
}

/** Minutes practised (the server sums active minutes per day; idle time is never counted). */
export function practiceTime(days: readonly StreakDay[], today: string): PracticeTime {
  const t = Date.parse(`${today}T12:00:00Z`);
  const ageOf = (d: string) => Math.round((t - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);
  let total = 0;
  let last7 = 0;
  let last28 = 0;
  let practised = 0;
  for (const d of days) {
    total += d.minutes;
    const age = ageOf(d.day);
    if (age >= 0 && age < 7) last7 += d.minutes;
    if (age >= 0 && age < 28) last28 += d.minutes;
    if (d.qualified && d.source !== "banked-rest" && d.source !== "paused") practised++;
  }
  return {
    totalMinutes: Math.round(total),
    last7: Math.round(last7),
    last28: Math.round(last28),
    daysPractised: practised,
  };
}

/** "2 h 15 min", "40 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Which map items are done (lessons completed, checkpoints passed, capstone sessions held, gym slots used). */
export function doneItems(course: CourseProgress): Set<string> {
  const done = new Set<string>();
  for (const l of course.lessons) if (l.status === "completed") done.add(l.lessonId);
  for (const c of course.checkpoints)
    if (c.status === "passed" || c.status === "soft-passed") done.add(c.cpId);
  for (const c of course.capstones)
    for (let i = 1; i <= c.sessionsDone; i++) done.add(`${c.capstoneId}.S${i}`);
  for (const g of course.gym) done.add(g.gymId);
  return done;
}

function kindOfItem(id: string): NextUnlock["remainingKind"] {
  if (/\.L\d+$/.test(id)) return "lesson";
  if (/\.CP\d?$/.test(id)) return "checkpoint";
  if (/\.S\d+$/.test(id)) return "capstone";
  return "session";
}

/**
 * The next unlocks counted along the default order (the same rule as `GET /unlocks/next`, used while that
 * endpoint is not available): for each tool not yet unlocked whose site lies ahead, the map sessions still to
 * complete up to and including that site. Gym slots are scheduling, not map sessions, so they are not counted.
 */
export function nextUnlocksFrom(
  order: readonly string[],
  done: ReadonlySet<string>,
  toolbox: readonly Pick<ToolEntry, "id" | "kind" | "unlock">[],
  unlocked: ReadonlySet<string>,
  limit = 3,
): NextUnlock[] {
  const ahead = order.filter((id) => !done.has(id) && !id.startsWith("GYM."));
  const pos = new Map(ahead.map((id, i) => [id, i]));
  const out: NextUnlock[] = [];
  for (const t of toolbox) {
    if (unlocked.has(t.id)) continue;
    const sites = Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at];
    let best: { site: string; i: number } | null = null;
    for (const s of sites) {
      const i = pos.get(s);
      if (i !== undefined && (best === null || i < best.i)) best = { site: s, i };
    }
    if (best === null) continue;
    out.push({
      itemId: t.id as NextUnlock["itemId"],
      kind: t.kind,
      grantedBy: best.site as NextUnlock["grantedBy"],
      remaining: best.i + 1,
      remainingKind: kindOfItem(best.site),
    });
  }
  return out.sort((a, b) => a.remaining - b.remaining || a.itemId.localeCompare(b.itemId)).slice(0, limit);
}

export interface MilestoneRow {
  id: string;
  title: string;
  description: string;
  reachedAt: string | null;
}

/** Milestones reached at or after `since` (the Coda's banner: reached in this session), oldest first. */
export function milestonesReached(milestones: readonly MilestoneRow[], since: string): MilestoneRow[] {
  return milestones
    .filter((m) => m.reachedAt !== null && m.reachedAt >= since)
    .sort((a, b) => (a.reachedAt as string).localeCompare(b.reachedAt as string));
}

export interface MilestoneTimeline {
  /** Reached, oldest first. */
  reached: MilestoneRow[];
  /** The first one not reached yet, in the registry's order (the course's order). */
  next: MilestoneRow | null;
  /** The rest ahead, after `next`. */
  ahead: MilestoneRow[];
}

/** The /progress timeline: what is behind you, the one milestone you are working towards, the rest. */
export function milestoneTimeline(milestones: readonly MilestoneRow[]): MilestoneTimeline {
  const reached = milestones
    .filter((m) => m.reachedAt !== null)
    .sort((a, b) => (a.reachedAt as string).localeCompare(b.reachedAt as string));
  const open = milestones.filter((m) => m.reachedAt === null);
  return { reached, next: open[0] ?? null, ahead: open.slice(1) };
}

export interface LedgerCounts {
  /** Statements in this area. */
  total: number;
  /** With any evidence (emerging or better, fading included). */
  shown: number;
  /** Solid or strong now. */
  solid: number;
}

/** Honest counts per area: evidence, and how many hold at solid or better today. */
export function ledgerCounts(
  defs: readonly { id: string }[],
  rows: ReadonlyMap<string, { latest: Pick<CanDoEntry, "status"> }>,
): LedgerCounts {
  let shown = 0;
  let solid = 0;
  for (const d of defs) {
    const r = rows.get(d.id);
    if (!r) continue;
    shown++;
    if (r.latest.status === "solid" || r.latest.status === "strong") solid++;
  }
  return { total: defs.length, shown, solid };
}

/** Where a can-do's latest evidence came from, in words ("a lesson", "a checkpoint"). */
export const EVIDENCE_LABEL: Record<CanDoEntry["evidenceKind"], string> = {
  sketch: "a sketch",
  track: "an album track",
  lesson: "a lesson",
  checkpoint: "a checkpoint",
  set: "a review set",
  transcription: "a transcription",
};

// --- Wave 4: the transcription ladder and the can-dos by place in the course ------------------------------------

/**
 * What each generated rung lets the learner say (contracts §2.9; PLAN "You can now transcribe a bass line").
 * Reached by a graded pass at that level or higher: passed at 85% or better, nothing revealed (wave4.md §5.4,
 * `TranscriptionSchema.gradedPass`). A finished, revealed or self-assessed transcription never counts.
 */
export type RungLevel = 1 | 2 | 3 | 4 | 5 | 6 | 8;
export const LADDER_CLAIMS: Readonly<Record<RungLevel, { name: string; claim: string }>> = {
  1: { name: "Drum loops", claim: "You can transcribe a drum loop." },
  2: { name: "Bass lines", claim: "You can now transcribe a bass line." },
  3: { name: "Four-chord loops", claim: "You can take down a chord loop, bass first." },
  4: { name: "Short melodies", claim: "You can transcribe a short melody." },
  5: { name: "Folk songs", claim: "You can transcribe a whole folk song, phrase by phrase." },
  6: { name: "Blues", claim: "You can transcribe a blues: its bass, its changes and its melody." },
  // Wave 6 (contracts §2.9): L7 is the learner's own audio, self-assessed, never a rung; L8 is a whole standard.
  8: { name: "Standards", claim: "You can transcribe a standard: its form, bass, changes and melody." },
};

export interface LadderRung {
  level: RungLevel;
  name: string;
  claim: string;
  /** Graded passes at exactly this level. */
  passes: number;
  /** A graded pass at this level or higher. */
  reached: boolean;
  /** The learner's current level. */
  current: boolean;
}

/**
 * The rungs Progress shows: L1–L4 always, L5 once the learner is past the generated rungs (a level of 4 or more, or
 * any pass at 5 or 6; a released X1 counts as an L5 pass), L6 once L5 is reached or X2 counted. Released X1 and X2
 * count as passes at 5 and 6 on the server (`progressReport`).
 */
export function ladderRungs(ladder: { level: number; gradedPasses: Record<string, number> }): LadderRung[] {
  const passes = (l: number) => Math.max(0, ladder.gradedPasses[String(l)] ?? 0);
  // L8 comes into view once L6 is reached (a pass at 6, a released X2) or the learner stands on it (a released
  // CF-T counts as a pass at 8 on the server).
  const top: RungLevel =
    ladder.level >= 8 || passes(8) > 0 || passes(6) > 0
      ? 8
      : ladder.level >= 5 || passes(5) > 0
        ? 6
        : ladder.level >= 4 || passes(4) > 0
          ? 5
          : 4;
  const levels = ([1, 2, 3, 4, 5, 6, 8] as const).filter((l) => l <= top);
  return levels.map((level) => {
    let higher = 0;
    for (let l = level; l <= 8; l++) higher += passes(l);
    return {
      level,
      ...LADDER_CLAIMS[level],
      passes: passes(level),
      reached: higher > 0,
      current: ladder.level === level,
    };
  });
}

/** The default-order position of a can-do's source (a capstone by its first session); -1 when not in the order. */
export function sourceRank(source: string, order: readonly string[]): number {
  const i = order.indexOf(source);
  if (i >= 0) return i;
  return order.indexOf(`${source}.S1`);
}

/**
 * The ledger's split (ux §5.5): statements already shown, or whose lesson, checkpoint or capstone is done or comes
 * up next in the course, stay in view; the rest wait under "Later in the course". A statement from a track
 * outside the default order is later until it has evidence.
 */
export function ledgerNow(
  defs: readonly { id: string; source: string }[],
  shown: ReadonlySet<string>,
  order: readonly string[],
  done: ReadonlySet<string>,
  next: string | null,
): { now: string[]; later: string[] } {
  const nextRank = next === null ? Number.POSITIVE_INFINITY : sourceRank(next, order);
  const now: string[] = [];
  const later: string[] = [];
  for (const d of defs) {
    const rank = sourceRank(d.source, order);
    const isDone = done.has(d.source) || done.has(`${d.source}.S1`);
    const near = rank >= 0 && rank <= (nextRank < 0 ? Number.POSITIVE_INFINITY : nextRank);
    (shown.has(d.id) || isDone || near ? now : later).push(d.id);
  }
  return { now, later };
}

/** "U05.L03" → "U05"; "C2" → "C2"; "U06.CP" → "U06". */
export function sourceUnit(source: string): string {
  return /^([A-Z]+\d+)\./.exec(source)?.[1] ?? source;
}

/**
 * Today's album strip: the core capstones in course order (C0, C1, C2, X1, C3 …), a window of `size` slots that
 * ends with the next one to release, so the newest tracks and the next empty slot are in view.
 */
export function albumWindow<T extends { id: string }>(
  capstones: readonly T[],
  order: readonly string[],
  released: ReadonlySet<string | null>,
  size = 4,
): T[] {
  const at = (c: T) => {
    const i = order.indexOf(`${c.id}.S1`);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const sorted = [...capstones].sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
  const next = sorted.findIndex((c) => !released.has(c.id));
  const end = next < 0 ? sorted.length : next + 1;
  return sorted.slice(Math.max(0, end - size), Math.max(end, Math.min(size, sorted.length)));
}

const FINALE: readonly string[] = ["CF-T", "CF-A"];

/**
 * Today's album strip (Wave 6): the core album's slots around where the learner is, in the record's running order
 * (album `SIDE_A_ORDER`, END.md): C0…C7, X1 and X2 by their first session, then the two parts of the core finale,
 * the single last. CF-T's first session falls before C6's, but it is track 11; neither finale is ever left out.
 */
export function albumStripSlots<T extends { id: string }>(
  capstones: readonly T[],
  order: readonly string[],
  released: ReadonlySet<string | null>,
  size = 3,
): T[] {
  const core = capstones.filter((c) => /^(C|X)\d+$/.test(c.id) || FINALE.includes(c.id));
  const finaleLast = [
    ...order.filter((id) => !FINALE.some((f) => id.startsWith(`${f}.`))),
    ...FINALE.map((f) => `${f}.S1`),
  ];
  return albumWindow(core, finaleLast, released, size);
}

/**
 * Wave 7: once Side A is complete and Side B's first track is released, the strip goes on with Side B (wave7.md §5.5):
 * the eight track capstones, the
 * released ones in the order they were released (Side B is numbered in release order), then the rest in the order of
 * `ALBUM_SIDES`; the window ends on the next unreleased one, as on Side A. Before that, Side A as before.
 */
export function albumStripSlotsAB<T extends { id: string }>(
  capstones: readonly T[],
  order: readonly string[],
  released: ReadonlySet<string | null>,
  releasedAt: ReadonlyMap<string, string>,
  sideB: readonly string[],
  size = 3,
): T[] {
  const sideA = capstones.filter((c) => /^(C|X)\d+$/.test(c.id) || FINALE.includes(c.id));
  const aDone = sideA.length > 0 && sideA.every((c) => released.has(c.id));
  const b = capstones.filter((c) => sideB.includes(c.id));
  // Side B shows once its first track is released (as the album page does, wave7.md §5.5): before that the tracks
  // are optional, and three empty Side B slots would read as the next thing to do.
  if (!aDone || b.length === 0 || !b.some((c) => released.has(c.id)))
    return albumStripSlots(capstones, order, released, size);
  const rank = (id: string) => {
    const at = releasedAt.get(id);
    return at ? `0 ${at}` : `1 ${String(sideB.indexOf(id)).padStart(2, "0")}`;
  };
  const bOrder = [...b].sort((x, y) => rank(x.id).localeCompare(rank(y.id))).map((c) => `${c.id}.S1`);
  return albumWindow(b, bOrder, released, size);
}

// --- Wave 5: what backs each milestone ------------------------------------------------------------------------

export interface MilestoneConditionLike {
  sessions?: readonly string[];
  capstones?: readonly string[];
  canDos?: readonly string[];
  ladder?: { level: number; after?: string };
  anyOf?: readonly MilestoneConditionLike[];
}

export interface EvidenceItem {
  /** The map item, capstone or `ladder:5`. */
  id: string;
  kind: "lesson" | "checkpoint" | "capstone" | "session" | "ladder" | "cando";
  /** "U08.L05 Bass Dictation & Tone" */
  label: string;
  met: boolean;
  /** How it was shown: "completed", "passed", "released: every rubric check passed", "2 graded passes". */
  detail: string;
}

export interface EvidenceContext {
  course: Pick<CourseProgress, "lessons" | "checkpoints" | "capstones" | "gym"> | null;
  /** Graded ladder passes per level (`LadderState.gradedPasses`; X1 counts at 5 and X2 at 6). */
  gradedPasses: Readonly<Record<string, number>> | null;
  /** Can-dos with evidence now (emerging or better). */
  canDoShown?: ReadonlySet<string>;
  titleOf: (id: string) => string;
}

function conditionEvidence(c: MilestoneConditionLike, ctx: EvidenceContext): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const course = ctx.course;
  for (const id of c.sessions ?? []) {
    const title = ctx.titleOf(id);
    const label = title && title !== id ? `${id} ${title}` : id;
    if (/\.L\d+$/.test(id)) {
      const l = course?.lessons.find((x) => x.lessonId === id);
      const met = l?.status === "completed";
      out.push({ id, kind: "lesson", label, met, detail: met ? "completed" : "ahead" });
    } else if (/\.CP\d?$/.test(id)) {
      const cp = course?.checkpoints.find((x) => x.cpId === id);
      const met = cp?.status === "passed" || cp?.status === "soft-passed";
      out.push({
        id,
        kind: "checkpoint",
        label: title || id,
        met,
        detail: met ? "passed, graded without hints" : cp?.status === "failed" ? "retake open" : "ahead",
      });
    } else {
      const done = course ? doneItems(course as CourseProgress).has(id) : false;
      out.push({ id, kind: "session", label, met: done, detail: done ? "done" : "ahead" });
    }
  }
  for (const id of c.capstones ?? []) {
    const cap = course?.capstones.find((x) => x.capstoneId === id);
    const met = cap?.status === "released";
    out.push({
      id,
      kind: "capstone",
      label: ctx.titleOf(id) || id,
      met,
      detail: met
        ? "released to your album: every check passed"
        : cap?.status === "in_progress"
          ? `in progress, ${cap.sessionsDone} of ${cap.sessionsTotal} sessions`
          : cap?.status === "open"
            ? "open now"
            : "ahead",
    });
  }
  for (const id of c.canDos ?? []) {
    const met = ctx.canDoShown?.has(id) ?? false;
    out.push({ id, kind: "cando", label: ctx.titleOf(id) || id, met, detail: met ? "shown" : "ahead" });
  }
  if (c.ladder) {
    const lvl = c.ladder.level;
    let n = 0;
    for (const [k, v] of Object.entries(ctx.gradedPasses ?? {})) if (Number(k) >= lvl) n += Math.max(0, v);
    const met = n > 0;
    out.push({
      id: `ladder:${lvl}`,
      kind: "ladder",
      label: `Transcription ladder, level ${lvl} or higher`,
      met,
      detail: met
        ? `${n} graded ${n === 1 ? "pass" : "passes"}: 85% or better, nothing revealed`
        : "a graded pass still to come: 85% or better, nothing revealed",
    });
  }
  return out;
}

/**
 * The evidence behind a milestone, as /progress lists it: every condition it names with whether it holds and how it
 * was shown (a lesson completed, a checkpoint passed, a capstone released with its checks passed, graded ladder
 * passes). With `anyOf`, the branch that holds (else the first) is listed after the plain conditions.
 */
export function milestoneEvidence(when: MilestoneConditionLike, ctx: EvidenceContext): EvidenceItem[] {
  const own = conditionEvidence(when, ctx);
  if (!when.anyOf || when.anyOf.length === 0) return own;
  const branches = when.anyOf.map((b) => conditionEvidence(b, ctx));
  const held = branches.find((b) => b.length > 0 && b.every((e) => e.met)) ?? branches[0] ?? [];
  return [...own, ...held];
}

/**
 * Where a can-do's latest evidence came from, named when it can be: "a graded step in U08.L03 Walking Up to It",
 * "the U10.CP Minor checkpoint", "your album track C4 Minor Indie Ballad"; else the plain kind ("a review set").
 */
export function evidenceLine(
  e: Pick<CanDoEntry, "evidenceKind" | "evidenceId">,
  titleOf: (id: string) => string,
): string {
  const t = titleOf(e.evidenceId);
  const named = t && t !== e.evidenceId;
  switch (e.evidenceKind) {
    case "lesson":
      return named ? `graded work in ${e.evidenceId} ${t}` : EVIDENCE_LABEL.lesson;
    case "checkpoint":
      return named ? `the ${t}` : EVIDENCE_LABEL.checkpoint;
    case "track":
      return named ? `your album track ${t}` : EVIDENCE_LABEL.track;
    default:
      return EVIDENCE_LABEL[e.evidenceKind];
  }
}
