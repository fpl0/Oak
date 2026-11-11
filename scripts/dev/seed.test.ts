import { describe, expect, test } from "bun:test";
import { clockBody, parseArgs } from "./seed.ts";

describe("scripts/dev/seed.ts", () => {
  test("arguments: the point is the free text; flags set port, gap, target, clock", () => {
    expect(parseArgs(["--port", "8801", "after", "U01.L03", "--gap", "10", "--target", "15"])).toMatchObject({
      port: 8801,
      point: "after U01.L03",
      gapDays: 10,
      target: 15,
    });
    expect(parseArgs(["--points"]).points).toBe(true);
    expect(() => parseArgs(["--target", "30"])).toThrow();
    expect(() => parseArgs(["--nope"])).toThrow();
  });
  test("clock specs", () => {
    expect(clockBody("+1d")).toEqual({ advanceDays: 1 });
    expect(clockBody("-2d")).toEqual({ advanceDays: -2 });
    expect(clockBody("+3h")).toEqual({ advanceMs: 3 * 3_600_000 });
    expect(clockBody("reset")).toEqual({ reset: true });
    expect(clockBody("2026-12-01T09:00:00Z")).toEqual({ at: "2026-12-01T09:00:00.000Z" });
    expect(() => clockBody("tomorrow")).toThrow();
  });
});
