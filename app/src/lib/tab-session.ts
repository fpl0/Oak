// Wave 6 (decision of 2026-11-13, d21; docs/design/wave6.md §5.6): a second tab or browser starts its OWN session
// instead of joining the open one. Each tab has an id, kept in sessionStorage: it survives a reload of that tab
// and is not shared with other tabs or windows. `callApi` sends it with `session.start` and `session.day`
// (api.ts `withTab`), so the server can give a reload its session back and a new tab a new one.
// Known edge: the browser's "Duplicate tab" copies sessionStorage, so the copy shares the id until it is closed;
// both then work in one session, which is what the learner asked that copy to be.
// Frozen after Foundation: read it, never fork it.
import type { Session, SessionDay } from "@oak/api";

const KEY = "oak.tab";
let memory: string | null = null;

function fresh(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `tab_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** This tab's id (`tab_` + 16 hex digits). Stable across reloads of the tab; in memory when storage is refused. */
export function tabId(): string {
  if (memory !== null) return memory;
  try {
    const store = globalThis.sessionStorage;
    const kept = store?.getItem(KEY);
    if (kept && /^tab_[0-9a-f]{16}$/.test(kept)) {
      memory = kept;
      return kept;
    }
    memory = fresh();
    store?.setItem(KEY, memory);
  } catch {
    // Private mode or a blocked store: one id for the life of the page.
    memory ??= fresh();
  }
  return memory;
}

/** Tests only: forget the id (the next `tabId()` reads storage again or makes a new one). */
export function resetTabIdForTests(): void {
  memory = null;
}

type DayLike = Pick<SessionDay, "open" | "openSessions"> | null | undefined;

/**
 * The session THIS tab left open today, or `null`. From a Wave 6 server: the open session that carries this tab's
 * id (asked with `?tab=`, so `open` is already it). From an older server, which lists no `openSessions`: its one
 * open session, as before.
 */
export function ownOpenSession(day: DayLike, tab: string = tabId()): Session | null {
  if (!day) return null;
  if (day.openSessions === undefined) return day.open;
  return day.openSessions.find((s) => s.tabId === tab) ?? null;
}

/** The sessions other tabs have open today (Today may say "Another tab has a session open"; it never joins one). */
export function otherOpenSessions(day: DayLike, tab: string = tabId()): Session[] {
  if (!day?.openSessions) return [];
  return day.openSessions.filter((s) => s.tabId !== tab);
}
