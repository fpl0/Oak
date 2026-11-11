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

/** The banner text of a milestone (ux §5.5), by ID; unknown IDs fall back to their title. */
export const MILESTONE_BANNER: Record<string, string> = {
  M1: "You can make a beat.",
  M2: "You can build a loop with a bass line.",
  M3: "You can now compose a song.",
  M4: "You can read a lead sheet.",
  M5: "You can transcribe a pop song's bass and chords.",
  M6: "You can write in minor and in the blues.",
  M7: "You finished the core. Side A is complete.",
  M8: "You can transcribe a jazz standard's changes.",
  M9: "You can reharmonise a standard.",
};
