import { describe, expect, test } from "bun:test";
import { toIssueView } from "./issue-view.ts";
import {
  collectParamRefs,
  drawExerciseParams,
  drawParams,
  fillBlanks,
  hashSeed,
  keyPool,
  MissingParamError,
  mulberry32,
  StarterMarkerError,
  stripMarkers,
  substituteParams,
} from "./params.ts";
import type { GradeResult, ParamGen } from "./schema/index.ts";
import { adjustScore, RUNG_RULES, replayMultiplier } from "./schema/index.ts";

describe("seeded params (contracts §5.5)", () => {
  test("mulberry32 is deterministic and in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    // Golden values: these must never change, or stored attempts stop reproducing.
    const g = mulberry32(1);
    expect([g(), g(), g()].map((x) => Math.floor(x * 1e9))).toEqual([627073940, 2735721, 527447039]);
    expect(hashSeed("U01.L07/mystery-tempo", 1)).toBe(hashSeed("U01.L07/mystery-tempo", 1));
    expect(hashSeed("U01.L07/mystery-tempo", 1)).not.toBe(hashSeed("U01.L07/mystery-tempo", 2));
    expect(hashSeed("a", "b")).not.toBe(hashSeed("ab"));
  });

  test("the mystery-tempo example: 70 to 140, at least 15 away from 100", () => {
    const params: Record<string, ParamGen> = {
      target: { gen: "int", min: 70, max: 140, awayFrom: { value: 100, by: 15 } },
    };
    const seen = new Set<number>();
    for (let series = 0; series < 500; series++) {
      const { target } = drawExerciseParams({ params }, "U01.L07/mystery-tempo", series);
      expect(typeof target).toBe("number");
      expect(target as number).toBeGreaterThanOrEqual(70);
      expect(target as number).toBeLessThanOrEqual(140);
      expect(Math.abs((target as number) - 100)).toBeGreaterThanOrEqual(15);
      seen.add(target as number);
    }
    expect(seen.size).toBeGreaterThan(30);
    // A retry inside the series keeps the same values.
    expect(drawExerciseParams({ params }, "U01.L07/mystery-tempo", 3)).toEqual(
      drawExerciseParams({ params }, "U01.L07/mystery-tempo", 3),
    );
  });

  test("int with a step, choice, degree", () => {
    for (let seed = 0; seed < 100; seed++) {
      const v = drawParams(
        {
          a: { gen: "int", min: 60, max: 120, step: 20 },
          b: { gen: "choice", of: ["bd", "sd", 3] },
          c: { gen: "degree", set: ["b3", "5"] },
        },
        seed,
      );
      expect([60, 80, 100, 120]).toContain(v.a as number);
      expect(["bd", "sd", 3] as (string | number)[]).toContain(v.b as string | number);
      expect(["b3", "5"]).toContain(v.c as string);
    }
  });

  test("key pools by number of accidentals, spelled correctly", () => {
    expect(keyPool("C", "major")).toEqual(["C"]);
    expect(keyPool("C", "minor")).toEqual(["A"]);
    expect(keyPool("≤2acc", "major")).toEqual(["C", "G", "D", "F", "Bb"]);
    expect(keyPool("≤2acc", "minor")).toEqual(["A", "E", "B", "D", "G"]);
    expect(keyPool("≤4acc", "major")).toEqual(["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"]);
    expect(keyPool("≤4acc", "minor")).toEqual(["A", "E", "B", "F#", "C#", "D", "G", "C", "F"]);
    expect(keyPool("≤2acc", "dorian")).toEqual(["D", "A", "E", "G", "C"]);
    expect(keyPool("≤2acc", "mixolydian")).toEqual(["G", "D", "A", "C", "F"]);
    // 12 keys, 12 distinct pitch classes, at most 6 accidentals, no E#, Cb or double accidentals.
    expect(keyPool("all", "major")).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F",
      "Bb",
      "Eb",
      "Ab",
      "Db",
      "F#",
    ]);
    expect(keyPool("all", "minor")).toEqual([
      "A",
      "E",
      "B",
      "F#",
      "C#",
      "G#",
      "D",
      "G",
      "C",
      "F",
      "Bb",
      "Eb",
    ]);
    expect(keyPool("all", "lydian").at(-1)).toBe("B");
    expect(keyPool("all", "locrian").at(-1)).toBe("F");
    expect(keyPool("all", "harmonic minor")).toEqual(keyPool("all", "minor"));
    expect(keyPool("all", "blues")).toEqual(keyPool("all", "minor pentatonic"));
  });

  test("substitution in strings and numeric fields", () => {
    const ex = {
      prompt: "Set the tempo to {{param:target}} BPM in {{param:key}}.",
      constraints: [{ c: "tempo", bpm: { param: "target" }, tol: 4 }],
      hints: [{ text: "setcpm({{param:target}}/4)" }],
      nested: { scale: '.scale("{{param:key}}4:major")' },
      untouched: 3,
    };
    expect(substituteParams(ex, { target: 86, key: "Eb" }) as unknown).toEqual({
      prompt: "Set the tempo to 86 BPM in Eb.",
      constraints: [{ c: "tempo", bpm: 86, tol: 4 }],
      hints: [{ text: "setcpm(86/4)" }],
      nested: { scale: '.scale("Eb4:major")' },
      untouched: 3,
    });
    expect(ex.constraints[0]?.bpm as unknown).toEqual({ param: "target" });
    expect([...collectParamRefs(ex)].sort()).toEqual(["key", "target"]);
    expect(() => substituteParams(ex, { target: 86 })).toThrow(MissingParamError);
    expect(() => substituteParams({ bpm: { param: "key" } }, { key: "Eb" })).toThrow(MissingParamError);
  });
});

describe("starter markers", () => {
  test("editable regions refer to the clean code", () => {
    const clean = stripMarkers('setcpm(96/4)\n\ndrums: s("⟪bd bd bd bd⟫")');
    expect(clean.code).toBe('setcpm(96/4)\n\ndrums: s("bd bd bd bd")');
    expect(clean.editable).toEqual([{ from: 24, to: 35 }]);
    expect(clean.code.slice(24, 35)).toBe("bd bd bd bd");
    expect(stripMarkers('s("bd")').editable).toBeNull();
    const two = stripMarkers('n("⟪0 2⟫ 4").s("⟪piano⟫")');
    expect(two.editable?.map((r) => two.code.slice(r.from, r.to))).toEqual(["0 2", "piano"]);
  });

  test("blanks", () => {
    const starter = 'n("0 ⟦a⟧ 4").scale("⟦key⟧:major")';
    expect(stripMarkers(starter).blanks).toEqual([
      { id: "a", at: 5 },
      { id: "key", at: 17 },
    ]);
    expect(fillBlanks(starter, { a: "2", key: "C4" })).toBe('n("0 2 4").scale("C4:major")');
    expect(() => fillBlanks(starter, { a: "2" })).toThrow(StarterMarkerError);
    expect(() => fillBlanks(starter, { a: "2", key: "C4", other: "x" })).toThrow(StarterMarkerError);
  });

  test("unbalanced markers are errors", () => {
    for (const bad of ["⟪a", "a⟫", "⟪a⟪b⟫⟫", "⟦a", "a⟧", "⟦⟧", "⟦a⟧⟦a⟧"])
      expect(() => stripMarkers(bad)).toThrow(StarterMarkerError);
  });
});

describe("hint rungs and the grade view (contracts §5.3, §10.5)", () => {
  test("evidence multipliers", () => {
    expect([0, 1, 2, 3, 4].map((r) => RUNG_RULES[r as 0].multiplier)).toEqual([1, 0.9, 0.8, 0.7, 0]);
    expect(RUNG_RULES[3].assisted).toBe(true);
    expect(RUNG_RULES[4].bestRating).toBe("Again");
    expect(replayMultiplier(0)).toBe(1);
    expect(replayMultiplier(2)).toBeCloseTo(0.81, 10);
    expect(replayMultiplier(20)).toBe(0.6);
    expect(adjustScore(1, 2, 1)).toBeCloseTo(0.72, 10);
    expect(adjustScore(1, 4, 0)).toBe(0);
  });

  const result: GradeResult = {
    exerciseId: "U03.L03/end-on-home",
    exerciseVersion: 1,
    attemptNo: 2,
    firstAttempt: false,
    mode: "lesson",
    status: "fail",
    score: 0.75,
    adjustedScore: 0.75,
    dims: { pitch: { score: 0.75, weight: 1, n: 8 } },
    constraints: [],
    diagnostics: [
      { id: "code.setcpm-form", severity: "warn", where: { code: [{ from: 0, to: 10 }] }, params: {} },
      {
        id: "melody.wrong-degree",
        severity: "error",
        dim: "pitch",
        where: { bar: 1, beat: 4, track: "mel", noteIds: ["mel|1|7/8|62|0"], code: [{ from: 30, to: 31 }] },
        params: { got: "2", exp: "1", dir: "too high" },
      },
      {
        id: "melody.missing-note",
        severity: "error",
        dim: "pitch",
        where: { bar: 2, beat: 1, track: "mel" },
        params: { exp: "5" },
      },
    ],
    messages: [
      { id: "code.setcpm-form", text: "Write the tempo as a division: setcpm(100/4)." },
      {
        id: "melody.wrong-degree",
        text: "Bar 1, 4: you have 2 (re); the melody has 1 (do).",
        where: { bar: 1, beat: 4 },
      },
      { id: "melody.missing-note", text: "Bar 2, 1: note 5 missing.", where: { bar: 2, beat: 1 } },
    ],
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
    overlay: {
      answer: [],
      missing: [
        {
          id: "ref|1|7/8|60|0",
          track: "mel",
          onset: [7, 8],
          dur: [1, 8],
          midi: 60,
          pitchSource: "n-scale",
          gain: 0.8,
          locs: [],
        },
        {
          id: "ref|2|0/1|67|0",
          track: "mel",
          onset: [1, 1],
          dur: [1, 8],
          midi: 67,
          pitchSource: "n-scale",
          gain: 0.8,
          locs: [],
        },
      ],
    },
  };
  const secrets = (view: unknown): string => JSON.stringify(view);

  test("rungs 0 and 1: where and how many, plus the learner's own lint in full", () => {
    for (const rung of [0, 1] as const) {
      const view = toIssueView(result, rung);
      expect(view.counts).toEqual({ missing: 1, extra: 0, wrong: 1 });
      expect(view.facets).toEqual([{ dim: "pitch", score: 0.75, weight: 1, n: 8 }]);
      expect(view.issues[0]).toMatchObject({
        id: "code.setcpm-form",
        what: "Write the tempo as a division: setcpm(100/4).",
      });
      expect(view.issues[1]).toEqual({
        severity: "error",
        dim: "pitch",
        where: result.diagnostics[1]?.where as object,
      });
      expect(view.issues[2]?.id).toBeUndefined();
      expect(view.ghosts).toEqual([]);
      expect(secrets(view)).not.toContain("melody has");
      expect(secrets(view)).not.toContain("wrong-degree");
    }
  });

  test("rung 2: the kind and direction of each issue, never the expected value", () => {
    const view = toIssueView(result, 2);
    expect(view.issues[1]).toMatchObject({ id: "melody.wrong-degree", what: "wrong degree (too high)" });
    expect(view.issues[1]?.fix).toBeUndefined();
    expect(view.issues[1]?.expected).toBeUndefined();
    expect(view.issues[2]).toMatchObject({ id: "melody.missing-note", what: "missing note" });
    expect(view.ghosts).toEqual([]);
    expect(secrets(view)).not.toContain("melody has");
  });

  test("rung 3: fix, expected value and ghost notes for the first issue only", () => {
    const view = toIssueView(result, 3);
    expect(view.issues[1]).toMatchObject({
      fix: "Bar 1, 4: you have 2 (re); the melody has 1 (do).",
      expected: "1",
      got: "2",
    });
    expect(view.issues[2]?.fix).toBeUndefined();
    expect(view.issues[2]?.expected).toBeUndefined();
    expect(view.ghosts.map((g) => g.id)).toEqual(["ref|1|7/8|60|0"]);
  });

  test("rung 4, or a passed step: everything", () => {
    for (const view of [
      toIssueView(result, 4),
      toIssueView(result, 0, { passed: true }),
      toIssueView({ ...result, status: "pass" }, 1),
    ]) {
      expect(view.issues[2]).toMatchObject({ fix: "Bar 2, 1: note 5 missing.", expected: "5" });
      expect(view.ghosts).toHaveLength(2);
    }
  });

  test("a custom renderer and describer are used when given", () => {
    const view = toIssueView(result, 3, { render: (d) => `R:${d.id}`, describe: (d) => `D:${d.id}` });
    expect(view.issues[0]?.what).toBe("R:code.setcpm-form");
    expect(view.issues[1]).toMatchObject({ what: "D:melody.wrong-degree", fix: "R:melody.wrong-degree" });
  });
});
