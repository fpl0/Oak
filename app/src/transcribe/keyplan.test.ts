// The key plan of a source: spans over the timeline, the key in force at a bar, each change in words (from
// @oak/theory's distances), and the plan as a transposed player sounds it.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import {
  changesKey,
  keyAtBar,
  keyChangeText,
  keyPlanText,
  keyRibbon,
  keySpansOf,
  soundingSpans,
} from "./keyplan.ts";

const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });

describe("spans", () => {
  test("a tune in one key is one span, and the ribbon has nothing to say", () => {
    const spans = keySpansOf(null, K("C"), 32, false);
    expect(spans).toEqual([{ key: K("C"), fromBar: 1, toBar: 32, fromCycle: 0, cycles: 32 }]);
    expect(changesKey(spans)).toBe(false);
    expect(keySpansOf(null, null, 32, false)).toEqual([]);
  });
  test("a lift for the last eight bars; cycles follow a pickup bar", () => {
    const plan = [
      { bar: 1, key: K("C") },
      { bar: 25, key: K("D") },
    ];
    const spans = keySpansOf(plan, K("C"), 32, false);
    expect(spans.map((s) => [s.key.tonic, s.fromBar, s.toBar, s.fromCycle, s.cycles])).toEqual([
      ["C", 1, 24, 0, 24],
      ["D", 25, 32, 24, 8],
    ]);
    expect(changesKey(spans)).toBe(true);
    const withPickup = keySpansOf(
      [{ bar: 0, key: K("C") }, plan[1] as (typeof plan)[number]],
      K("C"),
      32,
      true,
    );
    expect(withPickup.map((s) => [s.fromBar, s.fromCycle, s.cycles])).toEqual([
      [0, 0, 25],
      [25, 25, 8],
    ]);
  });
  test("a plan that starts late is led in by the song's key; equal neighbours are one span; order is by bar", () => {
    const spans = keySpansOf(
      [
        { bar: 21, key: K("C") },
        { bar: 17, key: K("D") },
        { bar: 19, key: K("D") },
        { bar: 40, key: K("E") },
      ],
      K("Db"),
      32,
      false,
    );
    expect(spans.map((s) => [s.key.tonic, s.fromBar, s.toBar])).toEqual([
      ["Db", 1, 16],
      ["D", 17, 20],
      ["C", 21, 32],
    ]);
  });
  test("the key in force at a bar", () => {
    const spans = keySpansOf(
      [
        { bar: 1, key: K("Db") },
        { bar: 17, key: K("D") },
        { bar: 21, key: K("C") },
        { bar: 25, key: K("Db") },
      ],
      K("Db"),
      32,
      false,
    );
    expect([1, 16, 17, 20, 21, 24, 25, 32].map((b) => keyAtBar(spans, b)?.tonic)).toEqual([
      "Db",
      "Db",
      "D",
      "D",
      "C",
      "C",
      "Db",
      "Db",
    ]);
    expect(keyAtBar([], 3)).toBeNull();
  });
});

describe("a change in words", () => {
  test("the lifts, the fifths, the relative and the parallel key", () => {
    expect(keyChangeText(K("C"), K("D"))).toBe("+2: up a whole step");
    expect(keyChangeText(K("C"), K("Db"))).toBe("+1: up a half step");
    expect(keyChangeText(K("C"), K("G"))).toBe("a fifth up");
    expect(keyChangeText(K("C"), K("F"))).toBe("a fourth up");
    expect(keyChangeText(K("D"), K("C"))).toBe("−2: down a whole step");
    expect(keyChangeText(K("C"), K("A"))).toBe("−3 half steps");
    expect(keyChangeText(K("C"), K("A", "minor"))).toBe("the relative key");
    expect(keyChangeText(K("C"), K("C", "minor"))).toBe("the same home, other mode");
    expect(keyChangeText(K("C"), K("Eb"))).toBe("+3 half steps");
  });
});

describe("the ribbon", () => {
  const spans = keySpansOf(
    [
      { bar: 1, key: K("F") },
      { bar: 25, key: K("G") },
    ],
    K("F"),
    32,
    false,
  );
  test("names, the change, and nothing about transposition while the player is not transposed", () => {
    expect(keyRibbon(spans).map((s) => [s.text, s.change, s.sounding])).toEqual([
      ["F major", null, null],
      ["G major", "+2: up a whole step", null],
    ]);
    expect(keyPlanText(spans)).toBe("F major, then G major from bar 25");
  });
  test("transposed, every span sounds moved by the same amount; the given keys stay what is written", () => {
    const r = keyRibbon(spans, -2);
    expect(r.map((s) => [s.text, s.sounding])).toEqual([
      ["F major", "E♭ major"],
      ["G major", "F major"],
    ]);
    expect(soundingSpans(spans, 0)).toEqual(spans);
  });
});
