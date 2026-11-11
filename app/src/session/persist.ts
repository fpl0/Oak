// What this browser remembers about the session (a per-viewer convenience; the server is the record): the open
// session's store state, so a reload resumes at the same block, and the session ended last, so Today can say
// "done for today" and a reloaded Coda can show its summary. Every access is wrapped: private windows and
// blocked storage simply remember nothing, and every page still renders.
import type { CanDoEntry, SessionSummary, SkillState } from "@oak/api";
import type { BlockReport, SessionState } from "./types.ts";

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ACTIVE_KEY = "oak.session.active.v1";
export const ENDED_KEY = "oak.session.ended.v1";

/** What the Coda compares against: the map levels and can-do statuses when the session started. */
export interface Baseline {
  levels: [string, SkillState["level"]][];
  canDo: [string, CanDoEntry["status"]][];
}

export interface SavedActive {
  v: 1;
  state: SessionState;
  baseline: Baseline;
  recapDone: boolean;
}

export interface EndedRecord {
  v: 1;
  sessionId: string;
  day: string;
  summary: SessionSummary | null;
  reports: BlockReport[];
  /** "Wrap up" was taken before the Make. */
  wrappedEarly: boolean;
  baseline: Baseline;
  /** The plan's main item and title, for "Today you". */
  mapItemId: string | null;
  title: string;
}

export function browserStorage(): KeyValue | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read<T>(kv: KeyValue | null, key: string): T | null {
  if (!kv) return null;
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(kv: KeyValue | null, key: string, value: unknown): void {
  if (!kv) return;
  try {
    if (value === null) kv.removeItem(key);
    else kv.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: nothing is remembered, nothing breaks.
  }
}

export function saveActive(kv: KeyValue | null, saved: SavedActive): void {
  write(kv, ACTIVE_KEY, saved);
}

/** The saved state of `sessionId` (another session's leftovers are ignored). */
export function loadActive(kv: KeyValue | null, sessionId: string): SavedActive | null {
  const s = read<SavedActive>(kv, ACTIVE_KEY);
  if (s?.v !== 1 || s.state?.session?.id !== sessionId || !s.state.plan) return null;
  return s;
}

export function clearActive(kv: KeyValue | null): void {
  write(kv, ACTIVE_KEY, null);
}

export function saveEnded(kv: KeyValue | null, rec: EndedRecord): void {
  write(kv, ENDED_KEY, rec);
}

export function loadEnded(kv: KeyValue | null): EndedRecord | null {
  const r = read<EndedRecord>(kv, ENDED_KEY);
  return r && r.v === 1 && typeof r.sessionId === "string" && typeof r.day === "string" ? r : null;
}

export const EMPTY_BASELINE: Baseline = { levels: [], canDo: [] };
