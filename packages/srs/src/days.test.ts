import { describe, expect, test } from "bun:test";
import {
  addDays,
  dayFromIndex,
  dayIndex,
  dayIndexOf,
  dayStartInstant,
  daysBetween,
  learnerDay,
  weekdayOf,
  weekStart,
} from "./index.ts";

describe("learner days (contracts §7.8)", () => {
  test("the day rolls over at 04:00 local time, not at midnight", () => {
    // Lisbon is UTC+0 in winter.
    expect(learnerDay(new Date("2026-11-11T03:59:59Z"), "Europe/Lisbon")).toBe("2026-11-10");
    expect(learnerDay(new Date("2026-11-11T04:00:00Z"), "Europe/Lisbon")).toBe("2026-11-11");
    // New York is UTC-5 in winter: 08:30Z is 03:30 local, still yesterday.
    expect(learnerDay(new Date("2026-11-11T08:30:00Z"), "America/New_York")).toBe("2026-11-10");
    expect(learnerDay(new Date("2026-11-11T09:00:00Z"), "America/New_York")).toBe("2026-11-11");
    // Tokyo is UTC+9: 20:00Z is 05:00 the next local day.
    expect(learnerDay(new Date("2026-11-11T20:00:00Z"), "Asia/Tokyo")).toBe("2026-11-12");
    expect(learnerDay(new Date("2026-11-11T02:00:00Z"), "UTC", 0)).toBe("2026-11-11");
  });

  test("day arithmetic and weeks that start on Monday", () => {
    expect(dayIndex("1970-01-01")).toBe(0);
    expect(dayFromIndex(dayIndex("2028-02-29"))).toBe("2028-02-29");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2027-01-02", "2026-12-30")).toBe(-3);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    // 2026-11-11 is a Wednesday.
    expect(weekdayOf("2026-11-11")).toBe(2);
    expect(weekStart("2026-11-11")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekdayOf("2026-11-15")).toBe(6);
    expect(() => dayIndex("2026-02-30")).toThrow("calendar day");
    expect(() => dayIndex("11/11/2026")).toThrow("YYYY-MM-DD");
  });

  test("a learner day starts at 04:00 local time, across daylight-saving changes", () => {
    expect(dayStartInstant("2026-11-11", "UTC").toISOString()).toBe("2026-11-11T04:00:00.000Z");
    expect(dayStartInstant("2026-07-01", "Europe/Lisbon").toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(dayStartInstant("2026-12-01", "Europe/Lisbon").toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(dayStartInstant("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(dayStartInstant("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T09:00:00.000Z");
    // The start of a day is on that day, and the instant before it is on the day before.
    for (const zone of ["Europe/Lisbon", "America/New_York", "Asia/Kolkata", "Australia/Sydney"]) {
      for (const day of ["2026-03-08", "2026-03-29", "2026-10-25", "2026-11-01", "2026-06-15"]) {
        const start = dayStartInstant(day, zone);
        expect(learnerDay(start, zone)).toBe(day);
        expect(learnerDay(new Date(start.getTime() - 1000), zone)).toBe(addDays(day, -1));
        expect(dayIndexOf(start, zone)).toBe(dayIndex(day));
      }
    }
  });
});
