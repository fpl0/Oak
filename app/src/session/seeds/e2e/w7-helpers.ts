// Helpers for the session area's Wave 7 specs (w7-*.pw.ts). Every field they read is the server's own (wave7.md §5):
// nothing here fills or patches an answer, and every seed point is one of `WAVE7_SEED_POINTS` (wave7.md §6; a
// missing point is a request to the server engineer, never a replayed day).
import type { APIRequestContext } from "@playwright/test";
import { api } from "./support.ts";

export interface W7Next {
  kind: string;
  mapItemId: string | null;
  title: string;
  goal: string;
  trackId: "J" | "R" | "A" | null;
  day: string;
}
export interface W7Plan {
  kind: string;
  mapItemId: string | null;
  core?: string;
  course?: "in-progress" | "complete";
  focus?: "core" | "J" | "R" | "A";
  track?: { trackId: string; sessionIndex: number; sessionsTotal: number } | null;
  trackOffers?: { trackId: string; next: W7Next; sessionsDone: number; sessionsTotal: number }[];
}

export const plan7 = (request: APIRequestContext) => api<W7Plan>(request, "GET", "/api/session/today");
export const focus7 = (request: APIRequestContext) =>
  api<{ focus: string; chosenAt: string | null }>(request, "GET", "/api/tracks/focus");

/** The summary of the seed's last day (yesterday's session), as the server stored it. */
export async function lastSummary(request: APIRequestContext) {
  const id = (await api<{ summarySessionId: string | null }>(request, "GET", "/api/session/day"))
    .summarySessionId;
  if (!id) throw new Error("the seed's last day has no summary");
  return api<{
    session: { kind: string; mapItemId: string | null };
    next?: W7Next | null;
    courseComplete?: { stage: string } | null;
  }>(request, "GET", `/api/session/${id}/summary`);
}

/**
 * Words that never appear beside a track or at the end of the course (END.md "Never", wave7.md §10.18, §10.23).
 * "a track is never required", "none is required" and "the minor unit behind you" are honest copy; "required",
 * "behind schedule" are not.
 */
export const NEVER7 =
  /!|congratulations|well done|course complete|you're done|sessions left|days left|countdown|(?<!(never|none is) )required|behind (schedule|pace)|falling behind|failed/i;
