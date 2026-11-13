// Review: once a capstone review had ever been requested, the workspace polled the tutor timeline every 3 s for as
// long as it stayed open (the review had long arrived); a request still on its way left "Request review" clickable,
// and one that failed read "Requested … when it is ready" for good. `reviewWaitOf` is the rule.
import { describe, expect, test } from "bun:test";
import { joinReviewWait, REVIEW_WAIT_MS, reviewWaitOf } from "./queries.ts";

const ask = {
  role: "user" as const,
  kind: "review-capstone" as const,
  review: null,
  excluded: false,
  errorKind: null,
};
const chat = { role: "user" as const, kind: "chat" as const, review: null, excluded: false, errorKind: null };
const answer = (o: { review?: unknown; errorKind?: "overloaded" | null; excluded?: boolean } = {}) => ({
  role: "assistant" as const,
  kind: "review-capstone" as const,
  review: o.review === undefined ? { summary: "…" } : o.review,
  excluded: o.excluded ?? false,
  errorKind: o.errorKind ?? null,
});

describe("where a review request stands", () => {
  test("never asked, or answered: idle (nothing polls)", () => {
    expect(reviewWaitOf([], null, 0)).toEqual({ kind: "idle" });
    expect(reviewWaitOf([chat], null, 0)).toEqual({ kind: "idle" });
    expect(reviewWaitOf([ask, answer()], null, 0)).toEqual({ kind: "idle" });
    // A reload long after: the answered request never polls again.
    expect(reviewWaitOf([ask, answer()], null, 10 * REVIEW_WAIT_MS)).toEqual({ kind: "idle" });
  });
  test("asked from this page and not on the timeline yet: pending (the button waits)", () => {
    expect(reviewWaitOf([ask, answer()], { asksBefore: 1 }, 1000)).toEqual({ kind: "pending" });
    expect(reviewWaitOf([], { asksBefore: 0 }, 0)).toEqual({ kind: "pending" });
  });
  test("asked and unanswered: pending, then stalled after the limit", () => {
    expect(reviewWaitOf([ask], null, 0)).toEqual({ kind: "pending" });
    expect(reviewWaitOf([ask, answer(), ask], { asksBefore: 1 }, 5000)).toEqual({ kind: "pending" });
    expect(reviewWaitOf([ask], null, REVIEW_WAIT_MS)).toEqual({ kind: "stalled" });
  });
  test("an error answer: failed; an excluded review does not count", () => {
    expect(reviewWaitOf([ask, answer({ review: null, errorKind: "overloaded" })], null, 0)).toEqual({
      kind: "failed",
    });
    expect(reviewWaitOf([ask, answer({ excluded: true })], null, 0)).toEqual({ kind: "pending" });
  });
  test("the second request's answer is the one that counts", () => {
    expect(reviewWaitOf([ask, answer(), ask], null, 0)).toEqual({ kind: "pending" });
    expect(reviewWaitOf([ask, answer(), ask, answer()], { asksBefore: 1 }, 0)).toEqual({ kind: "idle" });
  });
});

describe("c9: the Brief follows the tutor panel's own record of the request", () => {
  const T = 1_000_000;
  test("a request that failed before reaching the server clears pending at once", () => {
    const waiting = reviewWaitOf([], { asksBefore: 0 }, 100);
    expect(waiting).toEqual({ kind: "pending" });
    expect(joinReviewWait(waiting, { phase: "failed-early", at: T + 50 }, T, T + 60)).toEqual({
      kind: "failed",
    });
    expect(joinReviewWait(waiting, { phase: "failed", at: T + 50, message: "x" }, T, T + 60)).toEqual({
      kind: "failed",
    });
    // An older failure (before this page asked) does not end the new wait.
    expect(joinReviewWait(waiting, { phase: "failed-early", at: T - 10 }, T, T + 60)).toEqual({
      kind: "pending",
    });
  });
  test("a request the panel sent itself reads as pending on the Brief, for the wait's length", () => {
    expect(joinReviewWait({ kind: "idle" }, { phase: "pending", at: T }, null, T + 1000)).toEqual({
      kind: "pending",
    });
    expect(
      joinReviewWait({ kind: "idle" }, { phase: "pending", at: T }, null, T + REVIEW_WAIT_MS + 1),
    ).toEqual({
      kind: "idle",
    });
    expect(joinReviewWait({ kind: "idle" }, { phase: "answered", at: T }, null, T + 10)).toEqual({
      kind: "idle",
    });
    expect(joinReviewWait({ kind: "idle" }, null, null, T)).toEqual({ kind: "idle" });
  });
});
