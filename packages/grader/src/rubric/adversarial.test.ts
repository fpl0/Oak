// Adversarial music review of rubric rules on real Strudel pieces. `regression:` tests failed before the fix.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import type { RubricContext } from "./context.ts";
import { evaluateRubric } from "./index.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const Am: KeySpec = { tonic: "A", mode: "minor" };

async function ok(r: RubricRule, code: string, bars: number, key: KeySpec): Promise<boolean> {
  const n = await strudel(code, bars);
  const ctx: RubricContext = { meter: "4/4", code, params: {}, bars, key };
  return evaluateRubric([r], n, ctx).rows[0]?.ok === true;
}
const containsRn = (rn: string[], mustResolve = true): RubricRule => ({
  id: "x",
  label: "x",
  required: true,
  skills: [],
  rule: "contains-rn",
  rn,
  min: 1,
  mustResolve,
});
// C7's rule (contracts §6.6): a secondary dominant that resolves.
const SECONDARY = ["V/ii", "V/iii", "V/IV", "V/V", "V/vi", "V7/ii", "V7/iii", "V7/IV", "V7/V", "V7/vi"];

describe("contains-rn: applied chords must sound applied", () => {
  test("regression: I → IV is not a V/IV, and VII → III in minor is not a V/III", async () => {
    expect(await ok(containsRn(SECONDARY), 'chords: chord("<C F G C>").voicing()', 4, C)).toBe(false);
    expect(await ok(containsRn(["V/III", "V7/III"]), 'chords: chord("<Am G C Am>").voicing()', 4, Am)).toBe(
      false,
    );
  });
  test("C7 → F is V7/IV; D7 → G is V7/V; D → G (a raised 4th) is V/V; G7 → C in A minor is V7/III", async () => {
    expect(await ok(containsRn(SECONDARY), 'chords: chord("<C C7 F G>").voicing()', 4, C)).toBe(true);
    expect(await ok(containsRn(SECONDARY), 'chords: chord("<C D7 G C>").voicing()', 4, C)).toBe(true);
    expect(await ok(containsRn(SECONDARY), 'chords: chord("<C D G C>").voicing()', 4, C)).toBe(true);
    expect(await ok(containsRn(["V7/III"]), 'chords: chord("<Am G7 C Am>").voicing()', 4, Am)).toBe(true);
  });
  test("C4: the major V must be followed by i; the minor v does not count", async () => {
    const rule = containsRn(["V"]);
    expect(await ok(rule, 'chords: chord("<Am F E Am>").voicing()', 4, Am)).toBe(true);
    expect(await ok(rule, 'chords: chord("<Am F C G>").voicing()', 4, Am)).toBe(false);
    expect(await ok(rule, 'chords: chord("<Am Dm Em Am>").voicing()', 4, Am)).toBe(false);
    expect(await ok(rule, 'chords: chord("<Am E F Am>").voicing()', 4, Am)).toBe(false);
  });
});

describe("in-key in minor", () => {
  const inKey: RubricRule = {
    id: "k",
    label: "k",
    required: true,
    skills: [],
    rule: "in-key",
    key: "declared",
    minRatio: 1,
  } as RubricRule;
  test("regression: a melody with the leading tone G♯ is in A minor", async () => {
    expect(await ok(inKey, 'mel: note("a4 b4 c5 e5 g#4 a4")', 1, Am)).toBe(true);
    expect(await ok(inKey, 'mel: note("a4 b4 c5 e5 bb4 a4")', 1, Am)).toBe(false);
  });
});
