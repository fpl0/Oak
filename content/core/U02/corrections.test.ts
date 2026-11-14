// Corrections pass (before the learner starts the course): the U02 findings of the outside review, each pinned on
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
import L06 from "./L06/lesson.ts";
import L07 from "./L07/lesson.ts";

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

describe("U02.L05 S7: the copy really moves", () => {
  test("`.transpose(0)` fails", async () => {
    const r = await grade(L05, "S7", `${T(96)}mel: note("c4 e4 g4 e4").transpose(0).s("piano")`);
    expect(r.status).toBe("fail");
    expect(unmet(r).join("\n")).toContain(
      "the riff comes back at the same pitch: `.transpose(0)` moves nothing",
    );
  });
  test("right answers pass", async () => {
    const riff = `${T(96)}mel: note("c4 e4 g4 e4").s("piano")`;
    for (const code of [
      `${riff}\nvox: note("c4 e4 g4 e4").transpose(12).s("piano")`,
      `${riff}\nvox: note("c4 e4 g4 e4").transpose(-12).s("piano").gain(.6)`,
      `${T(96)}mel: note("<[60 64 67 64] ~>").s("piano")\nvox: note("<~ [60 64 67 64]>").transpose(7).s("piano")`,
    ])
      expect((await grade(L05, "S7", code)).status).toBe("pass");
  });
});

describe("U02.L06 S5: the octave line on a synth wave", () => {
  const mel = `${T(96)}mel: note("c4 e4 g4 e4").s("piano").gain(.5)`;
  test("the octave on the piano fails, and names the sound", async () => {
    const r = await grade(L06, "S5", `${mel}\nvox: note("c5 e5 g5 e5").s("piano").gain(.4)`);
    expect(r.status).toBe("fail");
    expect(unmet(r).join("\n")).toContain(
      "The octave line on a synth wave: `vox` plays piano, none of sine, triangle, square, sawtooth",
    );
  });
  test("right answers pass", async () => {
    for (const vox of [
      'note("c5 e5 g5 e5").s("triangle").gain(.4)',
      'note("c5 e5 g5 e5").s("sawtooth").gain(.5)',
      'note("c4 e4 g4 e4").transpose(12).s("square").gain(.4)',
    ])
      expect((await grade(L06, "S5", `${mel}\nvox: ${vox}`)).status).toBe("pass");
  });
});

describe("U02.L07 S5: the rest at the end stays a rest", () => {
  test("`c4@2` rings through beat 4 and fails", async () => {
    const r = await grade(L07, "S5", `${T(80)}mel: note("e4 d4 c4@2").s("piano")`);
    expect(r.status).toBe("fail");
    expect(unmet(r).join("\n")).toContain(
      "The rest at the end: bar 1, beat 4 is not silent: C4 still sounds there; leave the last beat empty with `~`",
    );
  });
  test("right answers pass", async () => {
    for (const code of [
      `${T(80)}mel: note("e4 d4 c4 ~").s("piano")`,
      `${T(80)}mel: note("e4 d4 [c4 ~] ~").s("piano")`,
      `${T(80)}mel: note("e4 d4 c4 ~").s("triangle").gain(.5)`,
    ])
      expect((await grade(L07, "S5", code)).status).toBe("pass");
  });
});
