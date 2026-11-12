// The events matcher's rhythm options say what they compare (wave2.md known gap 7, fixed in Wave 3):
// `onsets+durations` is the explicit name of what `exact` always did; `exact` stays valid for the lessons
// that use it, and content CI refuses it beside `durations: false`, which would say the opposite.
import { describe, expect, test } from "bun:test";
import { checkExercise, schemaIssues } from "./define.ts";
import type { Exercise, Matcher } from "./schema/index.ts";
import { MatcherSchema } from "./zod.ts";

const modify = (matcher: Matcher): Exercise => ({
  kind: "code-modify",
  id: "x",
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
  code: { starter: 's("bd")' },
  reference: { solutions: ['s("bd")'], bars: 1 },
  matcher,
  target: { audible: true },
});
const rules = (x: Exercise) => checkExercise(x, "ex").map((i) => i.rule);

describe("events matcher rhythm options", () => {
  test("onsets+durations is a valid option", () => {
    expect(
      schemaIssues(MatcherSchema, {
        m: "events",
        pitch: "absolute",
        rhythm: "onsets+durations",
        durations: true,
      }),
    ).toEqual([]);
    expect(
      schemaIssues(MatcherSchema, { m: "events", pitch: "absolute", rhythm: "lengths", durations: true }),
    ).not.toEqual([]);
  });
  test("exact with durations: false is refused, wherever the matcher sits", () => {
    const bad = { m: "events", pitch: "absolute", rhythm: "exact", durations: false } as const;
    expect(rules(modify(bad))).toContain("matcher.rhythm-exact-durations");
    expect(rules(modify({ m: "all", of: [bad] }))).toContain("matcher.rhythm-exact-durations");
    const staff: Exercise = {
      kind: "staff-write",
      id: "s",
      version: 1,
      prompt: "",
      skills: [],
      role: "check",
      hints: null,
      tests: [],
      answer: {
        ui: "staff-input",
        clef: "treble",
        bars: 1,
        palette: { durations: ["4"], accidentals: false, ties: false, rests: false },
      },
      expect: { e: "events", reference: { solutions: ['note("c4")'], bars: 1 }, matcher: bad },
    };
    expect(rules(staff)).toContain("matcher.rhythm-exact-durations");
  });
  test("what existing lessons write stays valid", () => {
    for (const m of [
      { m: "events", pitch: "absolute", rhythm: "exact", durations: true, sound: "drum-role" },
      { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
      { m: "events", pitch: "absolute", rhythm: "onsets", durations: true },
      { m: "events", pitch: "absolute", rhythm: "onsets+durations", durations: false },
      { m: "events", pitch: "absolute", rhythm: "ignore", durations: false },
    ] as const)
      expect(rules(modify(m))).not.toContain("matcher.rhythm-exact-durations");
  });
});
