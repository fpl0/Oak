// Corrections pass (before the learner starts the course): the U03 findings of the outside review, each pinned on
// the SHIPPED step it was found in, graded as content CI and the app grade it. Each counterexample missed what the
// brief asks for and passed; it now fails with a line the learner can act on, and right answers written another
// way still pass. (The authored variants in each lesson.ts pin pass/fail; this file pins the words.)
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, GradeResult, LessonDef, SessionId } from "@oak/content-kit";
import { gradeExercise, initRealm, renderFeedback } from "@oak/grader";
import { courseGraph } from "../../index.ts";
import { unlockedAt } from "../../lib/course.ts";
import { toolbox } from "../../toolbox.ts";
import L05 from "./L05/lesson.ts";

setDefaultTimeout(120_000);
beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const exerciseOf = (lesson: LessonDef, step: string): Exercise => {
  const ex = lesson.steps.find((s) => s.id === step)?.exercise;
  if (!ex) throw new Error(`${lesson.id} ${step}: no exercise`);
  return ex as Exercise;
};
const grade = (lesson: LessonDef, step: string, code: string): Promise<GradeResult> => {
  const exercise = exerciseOf(lesson, step);
  return gradeExercise({
    exercise,
    response: { code },
    ctx: {
      exerciseGlobalId: `${lesson.id}/${exercise.id}`,
      mode: "lesson",
      key: lesson.key,
      meter: lesson.meter,
      bpm: lesson.bpm,
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedAt(courseGraph(), toolbox, lesson.id as SessionId),
        allowPreview: false,
        meter: lesson.meter,
        key: lesson.key,
      },
    },
  } as never);
};
/** What the learner reads for each unmet rule. */
const unmet = (r: GradeResult): string[] =>
  r.diagnostics.filter((d) => d.id === "rubric.unmet").map((d) => renderFeedback(d));

const T = (bpm: number) => `setcpm(${bpm}/4)\n\n`;
const deg = (key: string) => `${T(92)}mel: n("<[0 2 1 4] [3 2 0 ~]>").scale("${key}").s("piano")`;

describe("U03.L05 S8: a second key, not one key named twice", () => {
  test("`<C4:major!2 C4:major!2>` fails, and says the tune stays in C", async () => {
    const r = await grade(L05, "S8", deg("<C4:major!2 C4:major!2>"));
    expect(r.status).toBe("fail");
    expect(unmet(r).join("\n")).toContain("the tune stays in C major: every `.scale()` names the same key");
  });
  test("the same key an octave lower is still one key", async () => {
    expect((await grade(L05, "S8", deg("<C4:major!2 C3:major!2>"))).status).toBe("fail");
  });
  test("right answers pass", async () => {
    for (const key of ["<C4:major!2 F4:major!2>", "<C4:major!2 G3:major!2>", "<D4:major E4:major>"])
      expect((await grade(L05, "S8", deg(key))).status).toBe("pass");
  });
});
