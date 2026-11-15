import { describe, expect, test } from "bun:test";
import { DAY, fixtureStreak } from "./fixtures.ts";
import {
  daysLine,
  goalLine,
  isRestDay,
  repairLine,
  restsLine,
  rhythmSlots,
  slotStateOf,
  streakLine,
  weekStatusLabel,
} from "./streak-model.ts";

describe("the 7/4 bar (ux §5.4)", () => {
  test("Monday first; practised, today, ahead", () => {
    const slots = rhythmSlots(fixtureStreak(), DAY);
    expect(slots.map((s) => s.state)).toEqual([
      "note",
      "note",
      "today",
      "future",
      "future",
      "future",
      "future",
    ]);
    expect(slots[0]?.label).toBe("Monday: practised");
    expect(slots[6]?.day).toBe("2026-11-15");
  });

  test("keep-alive is a half note, a banked rest is a rest, a repair is a tie, a free day is never red", () => {
    const base = { day: DAY, qualified: true, minutes: 2, reviewSets: 1, sketchSaved: false };
    expect(slotStateOf({ ...base, source: "keepalive", kinds: ["keepalive"] }, DAY, DAY)).toBe("half");
    expect(slotStateOf({ ...base, source: "repair", kinds: ["review"] }, DAY, DAY)).toBe("tie");
    expect(
      slotStateOf({ ...base, qualified: false, source: "banked-rest", kinds: [] }, DAY, "2026-11-12"),
    ).toBe("rest");
    expect(slotStateOf({ ...base, qualified: false, source: "rest", kinds: [] }, "2026-11-10", DAY)).toBe(
      "open",
    );
    expect(slotStateOf({ ...base, qualified: false, source: "paused", kinds: [] }, DAY, DAY)).toBe("paused");
  });
});

describe("streak copy (contracts §7.8): calm, no loss framing", () => {
  test("goal line and rest day", () => {
    expect(goalLine(fixtureStreak())).toBe("2 of 5 days this week");
    // A first week that starts on a Sunday has a goal of one day (pro-rated): "day", never "1 of 1 days".
    const sunday = fixtureStreak();
    expect(goalLine({ ...sunday, thisWeek: { ...sunday.thisWeek, qualifyingDays: 1, goal: 1 } })).toBe(
      "This week's goal is met: 1 of 1 day",
    );
    const met = fixtureStreak({ thisWeek: { ...fixtureStreak().thisWeek, goal: 2 } });
    expect(goalLine(met)).toBe("This week's goal is met: 2 of 2 days");
    expect(isRestDay(met)).toBe(true);
    expect(isRestDay(fixtureStreak())).toBe(false);
  });

  test("weeks in a row, a new phrase, the first week", () => {
    expect(streakLine(fixtureStreak())).toBe("3 weeks in a row");
    expect(streakLine(fixtureStreak({ weeks: 1 }))).toBe("1 week in a row");
    const restart = fixtureStreak({ weeks: 0, longestWeeks: 4 });
    const missed = {
      weekStart: "2026-11-02",
      goal: 5,
      qualifyingDays: 2,
      bankedUsed: 0,
      repairedDays: 0,
      status: "missed" as const,
    };
    expect(streakLine(restart, missed)).toBe("A new phrase begins. Longest run: 4 weeks.");
    expect(streakLine(fixtureStreak({ weeks: 0, longestWeeks: 0 }))).toBe(
      "Your first streak week is this one",
    );
  });

  test("repair window names a day and time, never a countdown", () => {
    const line = repairLine(
      { weekStart: "2026-11-02", missingDays: 1, until: "2026-11-11T04:00:00.000Z" },
      "UTC",
    );
    expect(line).toBe("Last week is 1 day short. Practise before Wednesday 04:00 and it's tied over.");
    expect(repairLine(null)).toBeNull();
    for (const s of [line ?? "", goalLine(fixtureStreak()), streakLine(fixtureStreak())])
      expect(s).not.toMatch(/miss|lose|lost|break|broke|hours? left|!/i);
  });

  test("rests and secondary numbers", () => {
    expect(restsLine(fixtureStreak())).toBe("1 rest banked");
    expect(restsLine(fixtureStreak({ bankedRests: 2 }))).toBe("2 rests banked");
    expect(restsLine(fixtureStreak({ bankedRests: 0 }))).toBeNull();
    expect(daysLine(fixtureStreak())).toBe("Day 24 of practice · 2 in a row");
    expect(daysLine(fixtureStreak({ totalDays: 0, currentRunDays: 0 }))).toBe("Day 1 of practice");
  });

  test("week labels", () => {
    const w = { weekStart: "2026-11-02", goal: 5, qualifyingDays: 4, bankedUsed: 1, repairedDays: 0 };
    expect(weekStatusLabel({ ...w, status: "met-banked" })).toBe("goal met with 1 banked rest");
    expect(weekStatusLabel({ ...w, status: "missed" })).toBe("a quieter week");
    expect(weekStatusLabel({ ...w, status: "met-repaired" })).toBe("goal met, tied over");
  });
});
