// The tutor's words for the Wave 6 answer shapes (`tutorAnswerOf`): a step of several answers checked together
// (four chord qualities, two bars, a mode per clip) part by part, a drum grid in 12/8 by row and step, chromatic
// degrees with their signs, applied numerals, a tied rhythm on the staff. Only what the learner entered: never the
// step's `correct`, never another part's expected answer.
import { describe, expect, test } from "bun:test";
import type { AttemptResponse, Exercise, LessonDef } from "@oak/api";
import u12l01 from "../../../content/core/U12/L01/lesson.ts";
import u13l03 from "../../../content/core/U13/L03/lesson.ts";
import u13l06 from "../../../content/core/U13/L06/lesson.ts";
import u14l01 from "../../../content/core/U14/L01/lesson.ts";
import u15l02 from "../../../content/core/U15/L02/lesson.ts";
import u17l04 from "../../../content/core/U17/L04/lesson.ts";
import { answerText } from "../tutor/context.ts";
import { tutorAnswerOf } from "./public.ts";

const step = (def: LessonDef, id: string) => def.steps.find((s) => s.id === id)?.exercise as Exercise;
const parts = (ex: Exercise) => (ex as Extract<Exercise, { kind: "all" }>).parts;
const failOf = (ex: Exercise) => ex.tests.find((t) => t.expect === "fail")?.response as AttemptResponse;
const passOf = (ex: Exercise) => ex.tests.find((t) => t.expect === "pass")?.response as AttemptResponse;
const C = { tonic: "C", mode: "major" } as const;

/** The learner's answer to a several-part step: the first part's pinned mistake, the rest right. */
function firstWrong(ex: Exercise): AttemptResponse {
  return { parts: parts(ex).map((p, i) => (i === 0 ? failOf(p) : passOf(p))) } as AttemptResponse;
}

describe("Wave 6 answers in the tutor's words", () => {
  test("four seventh qualities (U12.L01 S6): part by part, the learner's picks, never the expected one", () => {
    const ex = step(u12l01, "S6");
    const a = tutorAnswerOf(ex, firstWrong(ex), { key: C });
    expect(a?.kind).toBe("slots");
    const text = answerText(a as never);
    expect(text).toContain("My answers, slot by slot:");
    // Part 1 was a major seventh; the learner heard a minor seventh.
    expect(text).toMatch(/Part 1: minor 7th/);
    expect(text).not.toMatch(/Part 1: major 7th/);
    expect(text).toMatch(/Part 4: major 7th/);
  });

  test("two bars (U15.L02 S4): the bar picked for each clip, not where the applied chord sits", () => {
    const ex = step(u15l02, "S4");
    const text = answerText(tutorAnswerOf(ex, firstWrong(ex)) as never);
    expect(text).toContain("Part 1: bar 4");
    expect(text).not.toContain("Part 1: bar 3");
    expect(text).toContain("Part 2: bar 2");
  });

  test("a bar and a distance (U17.L04 S2): the option's label, not its ID", () => {
    const ex = step(u17l04, "S2");
    const r = {
      parts: [{ answer: { number: 4 } }, { answer: { choice: ["half-step"] } }],
    } as AttemptResponse;
    const text = answerText(tutorAnswerOf(ex, r) as never);
    expect(text).toContain("Part 1: bar 4");
    expect(text).toContain("Part 2: A half step");
    expect(text).not.toContain("whole");
  });

  test("a mode per clip (U14.L01 S6): the learner's mode for each clip by its label", () => {
    const ex = step(u14l01, "S6");
    const text = answerText(tutorAnswerOf(ex, firstWrong(ex)) as never);
    expect(text).toContain("Part 1: Major");
    expect(text).not.toMatch(/Part 1: Mixolydian/);
  });

  test("an unanswered part reads as not answered; nothing answered sends nothing", () => {
    const ex = step(u14l01, "S6");
    const r = { parts: [{ answer: { choice: ["major"] } }, {}, {}, {}] } as AttemptResponse;
    const text = answerText(tutorAnswerOf(ex, r) as never);
    expect(text).toContain("Part 1: Major");
    expect(text).toContain("Part 2: (not answered)");
    expect(tutorAnswerOf(ex, { parts: [{}, {}, {}, {}] } as AttemptResponse)).toBeNull();
  });

  test("a drum grid in 12/8 (U13.L06 S6): the steps on, row by row, counted from 1", () => {
    const ex = step(u13l06, "S6");
    const text = answerText(tutorAnswerOf(ex, failOf(ex)) as never);
    expect(text).toContain(
      "the steps I switched on (of 12 in the bar): kick: steps 1, 3, 7, 9; snare: steps 5, 11",
    );
    // The right snare (steps 4 and 10) is not sent.
    expect(text).not.toContain("snare: steps 4, 10");
  });

  test("a family's push cells read as step numbers", () => {
    const ex = { ...step(u13l06, "S6"), answer: { ui: "grid", stepsPerBar: 16, bars: 1 } } as Exercise;
    const text = answerText(tutorAnswerOf(ex, { answer: { choice: ["c14"] } } as AttemptResponse) as never);
    expect(text).toContain("of 16 in the bar): steps 15");
  });

  test("applied numerals (U15.L02 S6): the learner's numerals as placed", () => {
    const ex = step(u15l02, "S6");
    const text = answerText(tutorAnswerOf(ex, failOf(ex), { key: C }) as never);
    expect(text).toContain("Numerals I placed (in C major):");
    expect(text).toContain("II7");
    expect(text).not.toContain("V7/V");
  });

  test("chromatic degrees print with their signs", () => {
    const ex = {
      kind: "identify",
      id: "e",
      prompt: "Which degree?",
      answer: { ui: "degree-pad", set: ["4", "#4", "5"] },
      tests: [],
    } as unknown as Exercise;
    const text = answerText(
      tutorAnswerOf(ex, { answer: { degrees: ["#4", "b7"] } } as AttemptResponse) as never,
    );
    expect(text).toContain("degrees ♯4 ♭7");
  });

  test("a tied rhythm on the staff (U13.L03 S7): the learner's note list with its tie, not the passage", () => {
    const ex = step(u13l03, "S7");
    const wrong = ex.tests.find((t) => t.name === "the tie left out: G played twice")
      ?.response as AttemptResponse;
    const text = answerText(tutorAnswerOf(ex, wrong) as never);
    expect(text).toContain("C4:4 D4:4 E4:4. G4:8 G4:2 E4:2");
    expect(text).not.toContain("G4:8~");
  });
});

describe("a drawn 'which bar' trial in the tutor's words", () => {
  test("U17.L03 S4 answered on the trial's own bars: the bar, or no key change", () => {
    const ex = step(u17l04, "S2");
    const part = parts(ex)[0] as Exercise;
    expect(
      answerText(tutorAnswerOf(part, { answer: { choice: ["5"] } } as AttemptResponse) as never),
    ).toContain("My answer: bar 5");
    expect(
      answerText(tutorAnswerOf(part, { answer: { choice: ["none"] } } as AttemptResponse) as never),
    ).toContain("My answer: no key change");
  });
});
