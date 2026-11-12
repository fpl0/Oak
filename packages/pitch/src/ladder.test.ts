// The tolerance ladder (contracts §8.2).
import { describe, expect, test } from "bun:test";
import {
  dayNumber,
  ladderProgress,
  ladderSnapshot,
  loosenOffer,
  nextSingTolerance,
  singDayStats,
} from "./ladder.ts";
import type { SingDayStat } from "./types.ts";

const auto = { today: "2026-11-21", checkpointPending: false, mode: "auto" as const };
const day = (d: string, medianAbsCents: number, gradedNotes = 10): SingDayStat => ({
  day: d,
  gradedNotes,
  medianAbsCents,
});

describe("nextSingTolerance", () => {
  test("70 → 50 after 3 distinct days ≤ 35¢ within 21 days", () => {
    const days = [day("2026-11-03", 30), day("2026-11-10", 35), day("2026-11-20", 20)];
    expect(nextSingTolerance(70, days, auto)).toBe(50);
  });
  test("each rung has its threshold: 50 needs ≤ 25¢, 35 needs ≤ 20¢; 25 is the finest", () => {
    const at = (c: number) => [day("2026-11-01", c), day("2026-11-02", c), day("2026-11-03", c)];
    expect(nextSingTolerance(50, at(25), auto)).toBe(35);
    expect(nextSingTolerance(50, at(26), auto)).toBe(50);
    expect(nextSingTolerance(35, at(20), auto)).toBe(25);
    expect(nextSingTolerance(35, at(21), auto)).toBe(35);
    expect(nextSingTolerance(25, at(1), auto)).toBe(25);
  });
  test("moves one rung at a time, even when the days would qualify for more", () => {
    const days = [day("2026-11-19", 5), day("2026-11-20", 5), day("2026-11-21", 5)];
    expect(nextSingTolerance(70, days, auto)).toBe(50);
  });
  test("the 21-day window: today and the 20 days before it", () => {
    const edge = [day("2026-11-01", 30), day("2026-11-10", 30), day("2026-11-21", 30)];
    expect(nextSingTolerance(70, edge, auto)).toBe(50);
    const old = [day("2026-10-31", 30), day("2026-11-10", 30), day("2026-11-21", 30)];
    expect(nextSingTolerance(70, old, auto)).toBe(70);
    const future = [day("2026-11-10", 30), day("2026-11-20", 30), day("2026-11-22", 30)];
    expect(nextSingTolerance(70, future, auto)).toBe(70);
  });
  test("days with fewer than 8 graded notes do not count; one day counted once", () => {
    expect(
      nextSingTolerance(70, [day("2026-11-01", 10, 7), day("2026-11-02", 10), day("2026-11-03", 10)], auto),
    ).toBe(70);
    expect(
      nextSingTolerance(70, [day("2026-11-02", 10), day("2026-11-02", 10), day("2026-11-03", 10)], auto),
    ).toBe(70);
    // Two sessions on one day add up to 8 notes.
    const split = [
      day("2026-11-01", 10, 4),
      day("2026-11-01", 10, 4),
      day("2026-11-02", 10),
      day("2026-11-03", 10),
    ];
    expect(nextSingTolerance(70, split, auto)).toBe(50);
  });
  test("never while a checkpoint is pending, never in fixed mode, never loosens", () => {
    const good = [day("2026-11-01", 10), day("2026-11-02", 10), day("2026-11-03", 10)];
    expect(nextSingTolerance(70, good, { ...auto, checkpointPending: true })).toBe(70);
    expect(nextSingTolerance(70, good, { ...auto, mode: "fixed" })).toBe(70);
    const bad = [day("2026-11-01", 90), day("2026-11-02", 90), day("2026-11-03", 90)];
    expect(nextSingTolerance(25, bad, auto)).toBe(25);
  });
  test("since: the days that earned one rung never earn the next", () => {
    const days = [day("2026-11-01", 10), day("2026-11-02", 10), day("2026-11-03", 10)];
    expect(nextSingTolerance(50, days, { ...auto, since: "2026-11-03" })).toBe(50);
    expect(
      nextSingTolerance(50, [...days, day("2026-11-04", 10), day("2026-11-05", 10), day("2026-11-06", 10)], {
        ...auto,
        since: "2026-11-03",
      }),
    ).toBe(35);
  });
});

test("ladderProgress explains the state for Settings → Voice", () => {
  const p = ladderProgress(70, [day("2026-11-02", 30), day("2026-11-05", 50)], auto);
  expect(p).toEqual({
    current: 70,
    next: 70,
    target: 50,
    thresholdCents: 35,
    qualifyingDays: ["2026-11-02"],
    daysNeeded: 3,
    blockedBy: "not-enough-days",
  });
  expect(ladderProgress(25, [], auto).blockedBy).toBe("at-finest");
  expect(ladderProgress(70, [], { ...auto, mode: "fixed" }).blockedBy).toBe("fixed-mode");
  expect(ladderProgress(70, [], { ...auto, checkpointPending: true }).blockedBy).toBe("checkpoint-pending");
  expect(() => ladderProgress(70, [], { ...auto, today: "21/11/2026" })).toThrow(RangeError);
});

test("loosenOffer after 21 days without singing", () => {
  expect(loosenOffer(35, "2026-10-31", "2026-11-21")).toBe(50);
  expect(loosenOffer(35, "2026-11-01", "2026-11-21")).toBe(null);
  expect(loosenOffer(70, "2026-01-01", "2026-11-21")).toBe(null);
  expect(loosenOffer(50, null, "2026-11-21")).toBe(null);
});

test("dayNumber is calendar maths", () => {
  expect((dayNumber("2026-03-01") ?? 0) - (dayNumber("2026-02-28") ?? 0)).toBe(1);
  expect((dayNumber("2028-03-01") ?? 0) - (dayNumber("2028-02-28") ?? 0)).toBe(2);
  expect(dayNumber("2026-02-30")).toBe(null);
});

describe("singDayStats and ladderSnapshot (what GET /voice reports)", () => {
  test("per-day true medians from single notes, oldest first", () => {
    const notes = [
      { day: "2026-11-03", cents: -40 },
      { day: "2026-11-02", cents: 10 },
      { day: "2026-11-02", cents: -30 },
      { day: "2026-11-02", cents: 20 },
      { day: "bad", cents: 5 },
      { day: "2026-11-03", cents: Number.NaN },
    ];
    expect(singDayStats(notes)).toEqual([
      { day: "2026-11-02", gradedNotes: 3, medianAbsCents: 20 },
      { day: "2026-11-03", gradedNotes: 1, medianAbsCents: 40 },
    ]);
  });

  const base = {
    cents: 70 as const,
    mode: "auto" as const,
    today: "2026-11-21",
    pendingCheckpoint: null,
    lastSingDay: "2026-11-20",
    lastChange: null,
  };

  test("a bad day between good ones never undoes them; the third good day earns the step", () => {
    const days = [day("2026-11-10", 30), day("2026-11-12", 80), day("2026-11-14", 28)];
    const s = ladderSnapshot({ ...base, days });
    expect(s.qualifyingDays).toBe(2);
    expect(s.days.map((d) => d.qualifies)).toEqual([true, false, true]);
    expect(s.next).toEqual({ cents: 50, medianAtMost: 35 });
    expect(nextSingTolerance(70, days, auto)).toBe(70);
    const more = [...days, day("2026-11-20", 90), day("2026-11-21", 33)];
    expect(nextSingTolerance(70, more, auto)).toBe(50);
    expect(ladderSnapshot({ ...base, days: more }).qualifyingDays).toBe(3);
  });

  test("held while a checkpoint is pending; fixed mode has no next step; days outside the window drop out", () => {
    const days = [day("2026-10-01", 20), day("2026-11-15", 20)];
    const held = ladderSnapshot({ ...base, days, pendingCheckpoint: "U03.CP" });
    expect(held.held).toEqual({ reason: "checkpoint-pending", checkpointId: "U03.CP" });
    expect(held.days.map((d) => d.day)).toEqual(["2026-11-15"]);
    const fixed = ladderSnapshot({ ...base, mode: "fixed", days, pendingCheckpoint: "U03.CP" });
    expect(fixed.next).toBeNull();
    expect(fixed.held).toBeNull();
    expect(ladderSnapshot({ ...base, cents: 25, days }).next).toBeNull();
  });

  test("the one-tap loosen is offered after 21 days without singing, never at ±70", () => {
    expect(ladderSnapshot({ ...base, cents: 35, days: [], lastSingDay: "2026-10-30" }).offerLoosen).toBe(
      true,
    );
    expect(ladderSnapshot({ ...base, cents: 35, days: [], lastSingDay: "2026-11-19" }).offerLoosen).toBe(
      false,
    );
    expect(ladderSnapshot({ ...base, days: [], lastSingDay: "2026-01-01" }).offerLoosen).toBe(false);
  });
});
