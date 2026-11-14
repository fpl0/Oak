// Wave 6 review (review:journey), the lesson's own grading path against the real grader and the authored lessons:
// a tapped push that lands on the beat, again and again, is named for what it is (`tap.push-on-beat`, from
// @oak/pitch `gradeRhythmTaps`) before the per-tap lines, and a 6/8 sway tapped in quarter notes is named as
// such; neither changes the verdict, and the authored passing taps still pass.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, LessonDef, SessionId } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import u13l01 from "../../../content/core/U13/L01/lesson.ts";
import u13l03 from "../../../content/core/U13/L03/lesson.ts";
import u13l04 from "../../../content/core/U13/L04/lesson.ts";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { issueLines, renderer, shapeOf, summaryOf, viewFor } from "./feedback.ts";
import { type GradeEnv, type GraderDeps, gradeStep, NEUTRAL_PROFILE } from "./grading.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};
beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const envOf = (def: LessonDef): GradeEnv => ({
  ownerId: def.id,
  key: def.key,
  meter: def.meter,
  bpm: def.bpm,
  unlocked: unlockedAt(courseGraph(), toolbox, def.id as SessionId),
  allowPreview: false,
  profile: NEUTRAL_PROFILE,
});
const exOf = (def: LessonDef, stepId: string) =>
  def.steps.find((s) => s.id === stepId)?.exercise as Exercise & {
    tests: { name: string; response: { taps: number[] }; expect: string }[];
  };
const OPTS = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };

describe("U13.L01 S2: the push tapped on the beat", () => {
  const ex = exOf(u13l01 as LessonDef, "S2");
  const env = envOf(u13l01 as LessonDef);
  // 96 BPM in 4/4: a bar is 2.5 s, the pushes sit on the last eighth (2.1875 s, …), beat 1 an eighth later.
  const onBeat = [2.5, 5, 7.5, 10];

  test("every push on the beat after it: named first, with the count, and still not a pass", async () => {
    for (const nudge of [0, 0.02, -0.015]) {
      const r = await gradeStep(deps, env, ex, { taps: onBeat.map((t) => t + nudge) }, OPTS);
      expect(r.status).toBe("fail");
      expect(r.diagnostics[0]?.id as string).toBe("tap.push-on-beat");
      expect(r.diagnostics[0]?.params).toMatchObject({ n: 4, of: 4, by: "an eighth" });
    }
  });

  test("the authored taps grade as authored (the rhythm reading changes no verdict)", async () => {
    for (const t of ex.tests) {
      const r = await gradeStep(deps, env, ex, t.response, OPTS);
      expect(`${t.name}: ${r.status}`).toBe(`${t.name}: ${t.expect}`);
    }
    const pass = ex.tests.find((t) => t.expect === "pass");
    const r = await gradeStep(deps, env, ex, (pass as { response: { taps: number[] } }).response, OPTS);
    expect(r.diagnostics.map((d) => d.id as string)).not.toContain("tap.push-on-beat");
  });
});

describe("U13.L04 S2: the 6/8 sway tapped in quarter notes", () => {
  const ex = exOf(u13l04 as LessonDef, "S2");
  const env = envOf(u13l04 as LessonDef);
  test("three taps a bar is named as a grouping, not only as extra taps", async () => {
    const waltz = ex.tests.find((t) => t.name.startsWith("three taps a bar"));
    const r = await gradeStep(deps, env, ex, (waltz as { response: { taps: number[] } }).response, OPTS);
    expect(r.status).toBe("fail");
    expect(r.diagnostics[0]?.id as string).toBe("tap.grouping");
  });
});

describe("what the verdict says", () => {
  test("a tapped push on the beat: the summary counts no taps for the named finding, and says it", async () => {
    const ex = exOf(u13l01 as LessonDef, "S2");
    const r = await gradeStep(deps, envOf(u13l01 as LessonDef), ex, { taps: [2.5, 5, 7.5, 10] }, OPTS);
    const view = viewFor(r, 0, false, renderer(null, r, ex));
    expect(summaryOf(view, r, shapeOf(ex))).toBe("Not in time yet. Listen, then tap along again.");
    const lines = issueLines(view, shapeOf(ex)).map((l) => l.what);
    expect(lines).toEqual([
      "All 4 of your pushes landed on the beat. A push comes an eighth early: tap it just before the beat, then leave the beat itself empty.",
    ]);
  });
  test("notes on a staff are placed by bar and beat, never by the staff's own voice", async () => {
    const ex = exOf(u13l03 as LessonDef, "S7");
    const r = await gradeStep(
      deps,
      envOf(u13l03 as LessonDef),
      ex,
      { staff: "C5:4 D5:4 E5:4. G5:8~ G5:2 E5:2" } as never,
      OPTS,
    );
    const view = viewFor(r, 0, false, renderer(null, r, ex));
    const wheres = issueLines(view, shapeOf(ex)).map((l) => l.where);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toMatch(/^Bar \d, beat /);
  });
});
