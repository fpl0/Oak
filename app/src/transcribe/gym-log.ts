// What the gym served after the core, kept in this browser (Oak is local-first and single-learner; the server's
// gym history records sessions by kind, not by source: apiNotes asks for a `source` on `GymSession`). Read and
// written defensively: blocked storage means the two-week rule only knows this visit.
import { type GymLogEntry, localDay, NO_REPEAT_DAYS } from "./gym-after-core.ts";

const KEY = "oak.transcribe.gym-log";
let memory: GymLogEntry[] = [];

export function readGymLog(): GymLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const xs = JSON.parse(raw) as unknown;
    if (!Array.isArray(xs)) return memory;
    return xs.filter(
      (x): x is GymLogEntry =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as GymLogEntry).sourceId === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test((x as GymLogEntry).day ?? ""),
    );
  } catch {
    return memory;
  }
}

/** Records that a source was served today; entries older than four weeks are dropped. */
export function logGymSource(sourceId: string, today: string = localDay()): GymLogEntry[] {
  const t = Date.parse(`${today}T00:00:00Z`);
  const kept = readGymLog().filter(
    (e) =>
      !(e.sourceId === sourceId && e.day === today) &&
      t - Date.parse(`${e.day}T00:00:00Z`) < 2 * NO_REPEAT_DAYS * 86_400_000,
  );
  const next = [...kept, { sourceId, day: today }];
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: kept for this visit
  }
  return next;
}
