// Whether a review is on its way for a thread (Wave 5, carry-over c9): the panel's own "Request review" follows the
// same pending state as the capstone Brief. Two sources, newest wins: this browser's request (`ReviewRequest`, set
// when the ask is queued and when its turn ends) and the server's timeline (a review asked from the Brief or another
// tab that has not come back). A request that failed before reaching the server is not pending at all: the
// timeline has nothing to wait for. Pure.
import type { TranscriptEntry } from "@oak/api";
import { isReviewKind, type ReviewRequest } from "./context.ts";

/** How long a review on the timeline is waited for (the capstone Brief's `REVIEW_WAIT_MS`). */
export const REVIEW_WAIT_MS = 120_000;

type Entry = Pick<TranscriptEntry, "role" | "kind" | "review" | "excluded" | "errorKind" | "at">;

/** When the timeline's last review request was asked, if it has not been answered (or failed) yet. */
export function unansweredReviewAt(entries: readonly Entry[]): number | null {
  let last = -1;
  entries.forEach((e, i) => {
    if (e.role === "user" && isReviewKind(e.kind)) last = i;
  });
  if (last < 0) return null;
  const after = entries.slice(last + 1).filter((e) => e.role === "assistant" && isReviewKind(e.kind));
  if (after.some((e) => (e.review !== null && !e.excluded) || e.errorKind !== null)) return null;
  const at = Date.parse((entries[last] as Entry).at);
  return Number.isFinite(at) ? at : null;
}

export function reviewPending(
  request: ReviewRequest | null,
  entries: readonly Entry[],
  now: number,
): boolean {
  if (request?.phase === "pending") return true;
  const asked = unansweredReviewAt(entries);
  if (asked === null) return false;
  // What this browser learnt last is newer than the timeline's request: it ended (answered or failed).
  if (request && request.at >= asked) return false;
  return now - asked < REVIEW_WAIT_MS;
}
