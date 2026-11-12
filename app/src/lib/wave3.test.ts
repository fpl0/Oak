// The Wave 3 app seams in lib (docs/design/wave3.md §4): lens gating and the idempotency key.
import { describe, expect, test } from "bun:test";
import { IdempotencyKeySchema } from "@oak/api";
import { idempotencyKey } from "./idempotency.ts";
import { DEFAULT_LENSES, effectiveLenses, lensAvailability, rollLabelsOf } from "./lenses.ts";

describe("lenses", () => {
  const none = new Set<string>();
  const degrees = new Set(["tb.feature.degree-labels"]);
  const both = new Set(["tb.feature.degree-labels", "tb.feature.solfege"]);
  test("a lens shows only once its tool is unlocked; note names always can", () => {
    expect(lensAvailability(none)).toEqual({ degrees: false, solfege: false, noteNames: true });
    expect(lensAvailability(degrees)).toEqual({ degrees: true, solfege: false, noteNames: true });
    expect(effectiveLenses(DEFAULT_LENSES, none)).toEqual({
      degrees: false,
      solfege: false,
      noteNames: false,
    });
    expect(effectiveLenses(DEFAULT_LENSES, degrees)).toEqual({
      degrees: true,
      solfege: false,
      noteNames: false,
    });
    expect(effectiveLenses(DEFAULT_LENSES, both)).toEqual({ degrees: true, solfege: true, noteNames: false });
    expect(effectiveLenses({ degrees: false, solfege: true, noteNames: true }, both)).toEqual({
      degrees: false,
      solfege: true,
      noteNames: true,
    });
  });
  test("roll label mode", () => {
    expect(rollLabelsOf({ degrees: true, solfege: true, noteNames: false })).toBe("degree+solfege");
    expect(rollLabelsOf({ degrees: true, solfege: false, noteNames: true })).toBe("degree");
    expect(rollLabelsOf({ degrees: false, solfege: false, noteNames: true })).toBe("note");
    expect(rollLabelsOf({ degrees: false, solfege: true, noteNames: false })).toBe("none");
  });
});

describe("idempotency keys", () => {
  test("fresh, unique and accepted by the contract", () => {
    const keys = new Set(Array.from({ length: 50 }, () => idempotencyKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(IdempotencyKeySchema.safeParse(k).success).toBe(true);
  });
});
