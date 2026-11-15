import { describe, expect, test } from "bun:test";
import { NEWLY_LEARNED_MS, newlyLearned } from "./newly-learned.ts";

const now = Date.parse("2026-11-15T12:00:00Z");
const at = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe("newly learned from introducedAt (carry f1)", () => {
  test("48 hours from the server's introduction instant; never from updatedAt; buds never glint", () => {
    const set = newlyLearned(
      [
        { skillId: "J04" as never, level: "learning", introducedAt: at(1) },
        { skillId: "J05" as never, level: "practiced", introducedAt: at(47.9) },
        { skillId: "J06" as never, level: "practiced", introducedAt: at(48) },
        { skillId: "J07" as never, level: "available", introducedAt: at(1) },
        { skillId: "J08" as never, level: "mastered", introducedAt: null },
        { skillId: "J09" as never, level: "learning" },
        { skillId: "J10" as never, level: "learning", introducedAt: "not a date" },
      ],
      now,
    );
    expect([...set].sort()).toEqual(["J04", "J05"]);
    expect(NEWLY_LEARNED_MS).toBe(172_800_000);
    expect(newlyLearned(null, now).size).toBe(0);
  });
});
