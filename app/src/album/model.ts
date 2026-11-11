// The album as a record (ux §5.3): side A holds the core capstones in course order, side B the advanced ones,
// then the B-sides. Released tracks fill their slots; empty slots say what opens them. Pure.
import type { AlbumTrack, CapstoneMeta, CapstoneStatus } from "@oak/api";

export type Side = AlbumTrack["side"];

/** Advanced-track capstones (JC*, RC*, AC*) go on side B; every other capstone is core, side A. */
export function sideOfCapstone(id: string): Exclude<Side, "Bside"> {
  return /^(JC|RC|AC)\d/.test(id) ? "B" : "A";
}

export type Slot =
  | { kind: "track"; no: number; track: AlbumTrack }
  | {
      kind: "empty";
      no: number;
      capstone: Pick<CapstoneMeta, "id" | "title" | "objective">;
      status: CapstoneStatus["status"] | "unknown";
      lockedReason: string | null;
      sessionsDone: number;
      sessionsTotal: number;
    };

export interface SideView {
  side: Side;
  title: string;
  sub: string;
  slots: Slot[];
}

/**
 * The sides of the record. Side A lists every core capstone (released or not); side B lists the advanced
 * capstones only once one of them is released or open; the B-sides only once there is one.
 */
export function albumSides(
  tracks: readonly AlbumTrack[],
  capstones: readonly Pick<CapstoneMeta, "id" | "title" | "objective" | "sessions">[],
  statuses: readonly CapstoneStatus[],
): SideView[] {
  const byCapstone = new Map(
    tracks.filter((t) => t.capstoneId).map((t) => [t.capstoneId as string, t] as const),
  );
  const statusOf = new Map(statuses.map((s) => [s.capstoneId as string, s] as const));
  const sideSlots = (side: "A" | "B"): Slot[] => {
    const slots: Slot[] = [];
    const listed = capstones.filter((c) => sideOfCapstone(c.id) === side);
    listed.forEach((c, i) => {
      const t = byCapstone.get(c.id);
      if (t) slots.push({ kind: "track", no: i + 1, track: t });
      else {
        const st = statusOf.get(c.id);
        slots.push({
          kind: "empty",
          no: i + 1,
          capstone: c,
          status: st?.status ?? "unknown",
          lockedReason: tidyReason(st?.lockedReason ?? null),
          sessionsDone: st?.sessionsDone ?? 0,
          sessionsTotal: st?.sessionsTotal ?? c.sessions,
        });
      }
    });
    // Tracks on this side whose capstone is no longer in the course still belong on the record.
    for (const t of tracks)
      if (t.side === side && t.capstoneId && !listed.some((c) => c.id === t.capstoneId))
        slots.push({ kind: "track", no: slots.length + 1, track: t });
    return slots;
  };
  const out: SideView[] = [{ side: "A", title: "Side A", sub: "Core", slots: sideSlots("A") }];
  const b = sideSlots("B");
  if (b.some((s) => s.kind === "track" || s.status === "open" || s.status === "in_progress"))
    out.push({ side: "B", title: "Side B", sub: "Advanced", slots: b });
  const bsides = tracks
    .filter((t) => t.side === "Bside")
    .sort((x, y) => x.trackNo - y.trackNo || x.createdAt.localeCompare(y.createdAt))
    .map((t, i): Slot => ({ kind: "track", no: i + 1, track: t }));
  if (bsides.length)
    out.push({ side: "Bside", title: "B-sides", sub: "Sketches you promoted", slots: bsides });
  return out;
}

/** Server copy says "the Melody checkpoint checkpoint" when a checkpoint's title already ends in the word. */
export function tidyReason(text: string | null): string | null {
  return text === null ? null : text.replace(/\bcheckpoint checkpoint\b/g, "checkpoint");
}

/** "12:34" for a total in seconds; "—" when nothing is known. */
export function runtime(totalSec: number | null): string {
  if (totalSec === null || !Number.isFinite(totalSec)) return "—";
  const s = Math.round(totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What changed between two versions of a track's code, in a line ("4 lines changed, 2 added"). */
export function changeSummary(before: string | null, after: string): string {
  if (before === null) return "First release";
  const a = before.split("\n");
  const b = after.split("\n");
  if (before === after) return "Same code, new recording";
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((l) => l.trim() && !setA.has(l)).length;
  const removed = a.filter((l) => l.trim() && !setB.has(l)).length;
  const changed = Math.min(added, removed);
  const parts: string[] = [];
  if (changed) parts.push(`${changed} ${changed === 1 ? "line" : "lines"} changed`);
  if (added - changed) parts.push(`${added - changed} added`);
  if (removed - changed) parts.push(`${removed - changed} removed`);
  return parts.length ? parts.join(", ") : "Whitespace only";
}
