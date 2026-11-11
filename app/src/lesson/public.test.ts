import { describe, expect, test } from "bun:test";
import { chipsOf } from "../tutor/context.ts";
import { clearLesson, lessonSubject, publishLesson, useLessonPublic } from "./public.ts";
import type { LessonSnapshot } from "./types.ts";

const snap: LessonSnapshot = {
  lessonId: "U01.L02",
  lessonVersion: 1,
  title: "Count to four",
  status: "step",
  stepId: "S2",
  stepIndex: 1,
  stepKind: "modify",
  graded: true,
  passed: false,
  code: 'setcpm(96/4)\n\ndrums: s("bd bd ~ bd")',
  lastResult: null,
  rung: 2,
  attempts: 1,
  splitPart: null,
};

describe("the lesson's public snapshot", () => {
  test("publish and clear (only the lesson still shown)", () => {
    publishLesson(snap);
    clearLesson("U01.L03");
    expect(useLessonPublic.getState().lesson?.stepId).toBe("S2");
    clearLesson("U01.L02");
    expect(useLessonPublic.getState().lesson).toBeNull();
  });

  test("becomes a lesson tutor subject whose chips name the step, the code and the hints", () => {
    const s = lessonSubject(snap);
    expect(s.thread).toEqual({ subjectKind: "lesson", subjectId: "U01.L02" });
    expect(chipsOf(s).map((c) => c.id)).toEqual(["step", "code", "hints"]);
  });
});
