// The tutor's words for the Wave 5 answers (`tutorAnswerOf`): the form strip, the scale builder, the bar buttons and
// the twelve-bar grid say what the learner entered, section by section or bar by bar, and never the step's answer.
import { describe, expect, test } from "bun:test";
import type { AttemptResponse, Exercise, LessonDef } from "@oak/api";
import u09l01 from "../../../content/core/U09/L01/lesson.ts";
import u09l03 from "../../../content/core/U09/L03/lesson.ts";
import u11l01 from "../../../content/core/U11/L01/lesson.ts";
import { answerText } from "../tutor/context.ts";
import { tutorAnswerOf } from "./public.ts";

const step = (def: LessonDef, id: string) => def.steps.find((s) => s.id === id)?.exercise as Exercise;
const wrongOf = (ex: Exercise) => ex.tests.find((t) => t.expect === "fail")?.response as AttemptResponse;
const C = { tonic: "C", mode: "major" } as const;

describe("Wave 5 answers in the tutor's words", () => {
  test("the form strip (U09.L03 S5): each section with its bars, the learner's letters", () => {
    const ex = step(u09l03, "S5");
    const text = answerText(
      tutorAnswerOf(ex, { answer: { sections: ["A", "A", "B"] } }, { key: C }) as never,
    );
    expect(text).toContain("Section 1 (bars 1–8): A");
    expect(text).toContain("Section 3 (bars 17–24): B");
    expect(text).not.toContain("Section 3 (bars 17–24): A");
  });

  test("a form left half done reads as not answered", () => {
    const ex = step(u09l03, "S5");
    const text = answerText(tutorAnswerOf(ex, { answer: { sections: ["A", "", ""] } }) as never);
    expect(text).toContain("Section 2 (bars 9–16): (not answered)");
  });

  test("the scale builder (U11.L01 S6): the keys by name from the tonic, not the expected degrees", () => {
    const ex = step(u11l01, "S6");
    const wrong = wrongOf(ex);
    const a = tutorAnswerOf(ex, wrong, { key: C });
    const text = answerText(a as never);
    expect(text).toMatch(/the scale I built from G: G3 A3 B3/);
    expect(text).not.toContain("G A B D E\n");
    expect(text).not.toMatch(/degrees 1 2 3 5 6/);
  });

  test("the bar buttons (U09.L01 S6): the bar picked", () => {
    const ex = step(u09l01, "S6");
    const text = answerText(tutorAnswerOf(ex, { answer: { number: 5 } }) as never);
    expect(text).toContain("My answer: bar 5");
    expect(text).not.toContain("bar 9");
  });

  test("a twelve-bar chart: bar by bar, numerals in the key", () => {
    const ex = {
      kind: "fact",
      id: "chart",
      prompt: "Chart it.",
      answer: { ui: "bar-grid", bars: 4, perRow: 4, entry: "rn", qualities: ["7"] },
      tests: [],
    } as unknown as Exercise;
    const text = answerText(
      tutorAnswerOf(ex, { answer: { rn: ["I7", "IV7", "", "V7"] } }, { key: C }) as never,
    );
    expect(text).toContain("Numerals I placed (in C major)");
    expect(text).toContain("bar 2: IV7");
    expect(text).toContain("bar 3: (empty)");
  });
});
