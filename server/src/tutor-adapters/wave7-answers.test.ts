// The Wave 7 answer kinds on the REAL course (the tutor engineer's request; wave7.md §11): a grouping, a Euclidean
// rhythm, a voicing built on the keyboard or the staff. `referenceAnswers` hands each to the tutor in the form its
// answer guard reads ("2+2+3", "(3,8)", "voicing: rootless-a", the keyboard's MIDI list), so a reply that names the
// answer below the reveal rung is caught, and the reveal (rung 4) may say it. Without these an ear or build step of the
// tracks looked like an open step ("nothing to withhold") and the tutor was free to say the answer at rung 1.
import { beforeAll, describe, expect, test } from "bun:test";
import type { Exercise, StepDef } from "@oak/content-kit";
import type { ContentSource } from "../content/types.ts";
import { realCourse } from "../testing/course.ts";
import { answerForms, answerLeaks } from "../tutor/answer-guard.ts";
import { referenceAnswers, stepSource } from "./lessons.ts";

let course: ContentSource;
beforeAll(async () => {
  course = await realCourse();
});

type Site = { lessonId: string; step: StepDef; ex: Exercise };
/** Every exercise of the course a predicate picks, a step's parts included (R3.L03's quiz is a step of parts). */
const sites = (pred: (ex: Exercise) => boolean): Site[] =>
  course.lessons.flatMap((l) =>
    l.steps.flatMap((s) => {
      const ex = s.exercise;
      if (ex === undefined) return [];
      const all = ex.kind === "all" ? [ex, ...ex.parts] : [ex];
      return all.filter(pred).map((x) => ({ lessonId: l.id, step: s, ex: x as Exercise }));
    }),
  );
const correctOf = (ex: Exercise) => (ex as { correct?: { grouping?: number[]; euclid?: number[] } }).correct;

describe("the Wave 7 answer kinds reach the tutor as answers it withholds", () => {
  test("a grouping (2+2+3) and a Euclidean rhythm ((k,n,r)) with a fixed answer", () => {
    const groupings = sites((ex) => (correctOf(ex)?.grouping?.length ?? 0) > 0);
    const euclids = sites((ex) => (correctOf(ex)?.euclid?.length ?? 0) >= 2);
    // The rhythm track asks both (R2's odd groupings, R3's Euclidean rhythms).
    expect(groupings.length + euclids.length).toBeGreaterThan(0);
    for (const s of groupings) {
      const want = (correctOf(s.ex)?.grouping ?? []).join("+");
      expect({
        at: `${s.lessonId}/${s.step.id}`,
        has: referenceAnswers(s.step.exercise).includes(want),
      }).toEqual({
        at: `${s.lessonId}/${s.step.id}`,
        has: true,
      });
    }
    for (const s of euclids) {
      const want = `(${(correctOf(s.ex)?.euclid ?? []).join(",")})`;
      // Withheld for the whole step: the quiz's answer is asked in its parts.
      expect(referenceAnswers(s.step.exercise)).toContain(want);
      expect(stepSource(s.lessonId, s.step).solutions).toContain(want);
    }
  });

  test("a voicing built on the keyboard or the staff: its shape, and the keyboard's notes", () => {
    // `keyboard.voicing` and the staff's voicing are built but no lesson uses them yet (J1.L05 and J3 grade the
    // shape in code): a keyboard step and a staff step as the J1.L05 spec writes them stand in.
    const base = {
      id: "build",
      version: 1,
      role: "check",
      prompt: "Build it.",
      skills: [],
      hints: null,
    } as const;
    const keyboard = {
      ...base,
      kind: "keyboard",
      answer: { ui: "keyboard", mode: "chord" },
      expect: { midi: [50, 53, 57, 60], voicing: { shape: ["rootless-a", "rootless-b"], symbol: "Dm7" } },
      pitchMode: "absolute",
    } as unknown as Exercise;
    expect(referenceAnswers(keyboard)).toEqual(["50 53 57 60", "voicing: rootless-a", "voicing: rootless-b"]);
    const staff = {
      ...base,
      kind: "staff-write",
      answer: { ui: "staff-input" },
      expect: { e: "chords", symbols: ["Dm7", "G7"], spelling: "enharmonic", bass: true, voicing: "shell" },
    } as unknown as Exercise;
    expect(referenceAnswers(staff)).toEqual(["Dm7 G7", "voicing: shell"]);
    // Every such step the course does carry (none today) gets the same.
    for (const s of sites(
      (ex) =>
        (ex.kind === "keyboard" && ex.expect.voicing !== undefined) ||
        (ex.kind === "staff-write" && ex.expect.e === "chords" && ex.expect.voicing !== undefined),
    ))
      expect(referenceAnswers(s.ex).some((x) => x.startsWith("voicing: "))).toBe(true);
  });

  test("the guard catches a reply that names the answer below the reveal, and lets the reveal say it", () => {
    const pick = [
      ...sites((ex) => (correctOf(ex)?.grouping?.length ?? 0) > 0),
      ...sites((ex) => (correctOf(ex)?.euclid?.length ?? 0) >= 2),
    ];
    let checked = 0;
    for (const s of pick) {
      const src = stepSource(s.lessonId, s.step);
      const forms = answerForms(src, null);
      // The answer as a tutor would blurt it: the grouping, the (k,n), or the voicing's name.
      const said = src.solutions.find((x) => /^\d(?:\+\d)+$|^\(\d+,\d+(?:,\d+)?\)$|^voicing: /.test(x));
      if (said === undefined) continue;
      const text = `Try it this way: it is ${said}.`;
      expect({ said, caught: answerLeaks(text, forms, 1).length > 0 }).toEqual({ said, caught: true });
      expect(answerLeaks(text, forms, 4)).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
