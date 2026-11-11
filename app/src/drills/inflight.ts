// The set in flight, kept in this browser so a reload resumes the same set at its next trial (the trial records
// are on the server too: every answer is upserted at once, and `finish` re-sends them all). A per-viewer
// convenience only: storage can be empty or throw (private windows, previews), and the runner then simply
// starts a fresh set. Entries expire after 12 hours and are dropped as soon as their set finishes.
import type { DrillSession } from "@oak/api";
import type { ResumeState } from "./machine.ts";

const KEY = "oak.drills.inflight.v1";
const DONE_KEY = "oak.drills.done.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Stored {
  savedAt: number;
  state: ResumeState;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readAll(s: Storage | null): Record<string, Stored> {
  if (!s) return {};
  try {
    const raw = s.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Stored>) : {};
  } catch {
    return {};
  }
}

function writeAll(s: Storage | null, all: Record<string, Stored>): void {
  if (!s) return;
  try {
    if (Object.keys(all).length === 0) s.removeItem(KEY);
    else s.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota or blocked storage: resuming is a convenience.
  }
}

/** The key of a set: the warm-up item it fulfils (with its families, since item IDs are positional) or the family. */
export function inflightKey(o: {
  warmupItemId: string | null;
  familyIds: readonly string[];
  purpose: string;
}): string {
  return o.warmupItemId
    ? `w:${o.warmupItemId}|${o.familyIds.join(",")}`
    : `${o.purpose}:${o.familyIds.join(",")}`;
}

function valid(st: unknown): st is Stored {
  if (!st || typeof st !== "object") return false;
  const s = st as Stored;
  const sess = s.state?.session as DrillSession | undefined;
  return (
    typeof s.savedAt === "number" &&
    !!sess &&
    typeof sess.id === "string" &&
    typeof sess.setId === "string" &&
    Array.isArray(s.state.outcomes) &&
    Array.isArray(s.state.records)
  );
}

export function loadInflight(
  key: string,
  now = Date.now(),
  s: Storage | null = storage(),
): ResumeState | null {
  const all = readAll(s);
  const hit = all[key];
  if (!valid(hit)) return null;
  if (now - hit.savedAt > MAX_AGE_MS || hit.state.session.finishedAt !== null) {
    delete all[key];
    writeAll(s, all);
    return null;
  }
  return hit.state;
}

export function saveInflight(
  key: string,
  state: ResumeState,
  now = Date.now(),
  s: Storage | null = storage(),
): void {
  const all = readAll(s);
  for (const [k, v] of Object.entries(all)) if (!valid(v) || now - v.savedAt > MAX_AGE_MS) delete all[k];
  all[key] = { savedAt: now, state };
  writeAll(s, all);
}

export function clearInflight(key: string, s: Storage | null = storage()): void {
  const all = readAll(s);
  if (!(key in all)) return;
  delete all[key];
  writeAll(s, all);
}

/** Warm-up items finished today (per learner day), so a reloaded review page does not offer them again. */
export function doneItems(day: string, s: Storage | null = storage()): Set<string> {
  if (!s) return new Set();
  try {
    const raw = JSON.parse(s.getItem(DONE_KEY) ?? "null") as { day?: string; keys?: string[] } | null;
    return raw?.day === day && Array.isArray(raw.keys) ? new Set(raw.keys) : new Set();
  } catch {
    return new Set();
  }
}

export function markItemDone(day: string, key: string, s: Storage | null = storage()): void {
  if (!s) return;
  const keys = doneItems(day, s);
  keys.add(key);
  try {
    s.setItem(DONE_KEY, JSON.stringify({ day, keys: [...keys] }));
  } catch {
    // ignore
  }
}
