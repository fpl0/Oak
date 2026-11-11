import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { addDays, weekdayIndex, weekStart } from "../lib/days.ts";
import { type Harness, harness } from "../testing/harness.ts";
import { inRepairWindow, StreakService, weekGoal } from "./streak.ts";

// 2026-11-02 is a Monday.
const W0 = "2026-11-02";
const W1 = addDays(W0, 7);
const W2 = addDays(W0, 14);
const W3 = addDays(W0, 21);

let h: Harness;
let streak: StreakService;
beforeEach(async () => {
  h = await harness({ now: `${W0}T12:00:00.000Z` });
  h.server.deps.repos.profile.patch({ timezone: "UTC", onboardedAt: `${W0}T09:00:00.000Z` });
  streak = h.server.deps.services.streak;
});
afterEach(async () => {
  await h.close();
});

/** Moves the clock to noon UTC of `day` and records a qualifying review there. */
function practise(day: string, kind: "review" | "sketch" | "keepalive" = "review") {
  h.clock.set(`${day}T12:00:00.000Z`);
  return streak.qualify(kind, { day });
}
function at(day: string) {
  h.clock.set(`${day}T12:00:00.000Z`);
  return streak.summary(day);
}

describe("pure rules", () => {
  test("2026-11-02 is a Monday and weeks start on Monday", () => {
    expect(weekdayIndex(W0)).toBe(0);
    expect(weekStart(addDays(W0, 6))).toBe(W0);
    expect(weekStart(W1)).toBe(W1);
  });

  test.each([
    // [goal, first day, expected first-week goal]: max(1, ceil(G × daysLeftInWeek / 7))
    [5, W0, 5],
    [5, addDays(W0, 3), 3], // Thursday: 4 days left → ceil(20/7) = 3
    [5, addDays(W0, 6), 1], // Sunday: 1 day left → ceil(5/7) = 1
    [7, addDays(W0, 2), 5], // Wednesday: 5 days left → 5
    [3, addDays(W0, 5), 1], // Saturday: 2 days left → ceil(6/7) = 1
  ])("first-week goal: G=%i from %s is %i", (goal, first, expected) => {
    expect(weekGoal(goal, weekStart(first), first)).toBe(expected);
    expect(weekGoal(goal, addDays(weekStart(first), 7), first)).toBe(goal);
  });

  test("the repair window is Monday and Tuesday (until Wednesday 04:00)", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => inRepairWindow(addDays(W1, i)))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  test("runs: paused and open ties neither count nor break; a miss breaks", () => {
    const w = (status: string) =>
      ({ weekStart: W0, goal: 5, qualifyingDays: 5, bankedUsed: 0, repairedDays: 0, status }) as never;
    expect(StreakService.runs([w("met"), w("paused"), w("met-banked")], false)).toEqual({
      current: 2,
      longest: 2,
    });
    expect(StreakService.runs([w("met"), w("met"), w("missed"), w("met")], true)).toEqual({
      current: 2,
      longest: 2,
    });
    expect(StreakService.runs([w("met"), w("tie-open")], false)).toEqual({ current: 1, longest: 1 });
    expect(StreakService.runs([], false)).toEqual({ current: 0, longest: 0 });
  });
});

describe("weeks", () => {
  test("a week met on qualifying days earns one banked rest; the bank holds 2", () => {
    for (const w of [W0, W1, W2]) for (let i = 0; i < 5; i++) practise(addDays(w, i));
    const s = at(W3);
    expect(s.weeks).toBe(3);
    expect(s.bankedRests).toBe(2);
    expect(h.server.deps.repos.streak.weeks().map((w) => w.status as string)).toEqual(["met", "met", "met"]);
  });

  test("a short week is covered by banked rests and earns none", () => {
    for (const w of [W0, W1]) for (let i = 0; i < 5; i++) practise(addDays(w, i));
    for (let i = 0; i < 3; i++) practise(addDays(W2, i));
    const s = at(W3);
    const w2 = h.server.deps.repos.streak.week(W2);
    expect(w2).toMatchObject({ status: "met-banked", qualifyingDays: 3, bankedUsed: 2 });
    expect(s.bankedRests).toBe(0);
    expect(s.weeks).toBe(3);
  });

  test("a week short even with the bank opens a 48-hour tie; two activities repair two days", () => {
    for (let i = 0; i < 3; i++) practise(addDays(W0, i));
    const monday = at(W1);
    expect(h.server.deps.repos.streak.week(W0)?.status).toBe("tie-open");
    expect(monday.repair).toEqual({
      weekStart: W0,
      missingDays: 2,
      until: `${addDays(W1, 2)}T04:00:00.000Z`,
    });
    practise(W1); // Monday: one repaired day, still one short
    expect(h.server.deps.repos.streak.week(W0)).toMatchObject({ status: "tie-open", repairedDays: 1 });
    expect(h.server.deps.repos.streak.day(W1)?.source).toBe("repair");
    const s = practise(addDays(W1, 1)); // Tuesday: met
    expect(h.server.deps.repos.streak.week(W0)).toMatchObject({ status: "met-repaired", repairedDays: 2 });
    expect(s.weeks).toBe(1);
    expect(s.repair).toBeNull();
    // The repair days count for the new week too.
    expect(s.thisWeek.qualifyingDays).toBe(2);
  });

  test("an unrepaired tie is missed once the window closes; the streak restarts", () => {
    for (let i = 0; i < 5; i++) practise(addDays(W0, i));
    practise(W1);
    const s = at(addDays(W2, 2)); // W1 had 1 day; Wednesday of W2: the window is over
    expect(h.server.deps.repos.streak.week(W1)?.status).toBe("missed");
    expect(s.weeks).toBe(0);
    expect(s.longestWeeks).toBe(1);
    expect(s.repair).toBeNull();
  });

  test("activity after the window does not repair", () => {
    for (let i = 0; i < 3; i++) practise(addDays(W0, i));
    practise(addDays(W1, 2)); // Wednesday
    expect(h.server.deps.repos.streak.week(W0)?.status).toBe("missed");
    expect(h.server.deps.repos.streak.day(addDays(W1, 2))?.source).toBe("review");
  });

  test("a paused week is neither met nor missed", () => {
    h.server.deps.repos.settings.put("pausedWeeks", [W1], `${W0}T00:00:00.000Z`);
    for (let i = 0; i < 5; i++) practise(addDays(W0, i));
    for (let i = 0; i < 5; i++) practise(addDays(W2, i));
    const s = at(W3);
    expect(h.server.deps.repos.streak.week(W1)?.status).toBe("paused");
    expect(s.weeks).toBe(2);
  });

  test("the first week uses the pro-rated goal", () => {
    h.server.deps.repos.profile.patch({ onboardedAt: `${addDays(W0, 3)}T09:00:00.000Z` }); // Thursday
    for (let i = 3; i < 6; i++) practise(addDays(W0, i));
    const s = at(W1);
    expect(h.server.deps.repos.streak.week(W0)).toMatchObject({ goal: 3, status: "met" });
    expect(s.weeks).toBe(1);
    expect(s.bankedRests).toBe(1);
  });

  test("the running week counts once it is met and never breaks the streak before it ends", () => {
    for (let i = 0; i < 5; i++) practise(addDays(W0, i));
    expect(at(addDays(W0, 4)).weeks).toBe(1);
    expect(at(addDays(W1, 3)).weeks).toBe(1); // W1 has no days yet but is still running
  });
});

describe("days", () => {
  test("a review set qualifies with ≥ 4 trials, or ≥ 5 fact cards", () => {
    h.clock.set(`${W0}T12:00:00.000Z`);
    expect(streak.reviewSet(3).todayQualified).toBe(false);
    expect(streak.reviewSet(4, { facts: true }).todayQualified).toBe(false);
    expect(streak.reviewSet(5, { facts: true }).todayQualified).toBe(true);
    h.clock.set(`${addDays(W0, 1)}T12:00:00.000Z`);
    expect(streak.reviewSet(4).todayQualified).toBe(true);
  });

  test("the learner day rolls over at 04:00 local time", () => {
    h.server.deps.repos.profile.patch({ timezone: "Europe/Lisbon" });
    h.clock.set(`${W1}T03:30:00.000Z`); // 03:30 in Lisbon (WET, UTC+0): still Sunday
    expect(streak.time.day()).toBe(addDays(W0, 6));
    h.clock.set(`${W1}T04:30:00.000Z`);
    expect(streak.time.day()).toBe(W1);
  });

  test("totals: days practised and the current run of days", () => {
    for (const d of [W0, addDays(W0, 1), addDays(W0, 3), addDays(W0, 4)]) practise(d);
    const s = at(addDays(W0, 4));
    expect(s.totalDays).toBe(4);
    expect(s.currentRunDays).toBe(2);
    expect(s.todayQualified).toBe(true);
    expect(at(addDays(W0, 5)).currentRunDays).toBe(2); // today not yet: the run ending yesterday
    expect(streak.gap(addDays(W0, 7))).toBe(3);
  });

  test("history lists the last weeks and their days", () => {
    for (let i = 0; i < 5; i++) practise(addDays(W0, i));
    const r = streak.history(4, W1);
    expect(r.weeks.map((w) => w.weekStart)).toEqual([W0, W1]);
    expect(r.days).toHaveLength(5);
    expect(r.summary.thisWeek.days).toHaveLength(7);
  });
});
