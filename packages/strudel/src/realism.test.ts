// Realism levels of ladder stimuli (contracts §6.12; docs/design/wave4.md §3.5): the spec of each level.
import { describe, expect, test } from "bun:test";
import { isCleanRealism, realismSpec, StrudelNotBuiltError } from "./realism.ts";

describe("realismSpec", () => {
  test("R0 is clean; each level adds its layer", () => {
    expect(isCleanRealism(realismSpec(0))).toBe(true);
    expect(realismSpec(1)).toMatchObject({ timingMs: 15, velocity: 0.1, swing: null, room: 0 });
    expect(realismSpec(2, { swung: true })).toMatchObject({ swing: { amount: 1 / 3 }, room: 0.3 });
    expect(realismSpec(2).swing).toBeNull();
    expect(realismSpec(3, { target: "bass" }).buried).toEqual({ track: "bass", db: -6 });
    expect(realismSpec(3).buried).toBeNull();
    expect(realismSpec(4, { target: "mel", vocalLead: "tenor" })).toMatchObject({
      leadSound: "tenor",
      detuneCents: 30,
    });
    expect(isCleanRealism(realismSpec(1))).toBe(false);
  });
  test("the not-built error is typed", () => {
    const e = new StrudelNotBuiltError("x");
    expect(e.code).toBe("strudel_not_built");
  });
});
