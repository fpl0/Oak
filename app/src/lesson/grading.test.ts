// The player's grading path against the real grader realm: every authored test of the gate sample and the two
// exemplar lessons, sent through `gradeStep` exactly as the player sends a learner's response (wire shape →
// grader shape, params, unlocked tools, the onboarding preview context), must come out as the author pinned it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AttemptResponse, Exercise, LessonDef, SessionId, TestCase } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import sample from "../../../content/core/_sample/L00/lesson.ts";
import u00l02 from "../../../content/core/U00/L02/lesson.ts";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import u02l01 from "../../../content/core/U02/L01/lesson.ts";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import {
  type GradeEnv,
  type GraderDeps,
  gradeStep,
  NEUTRAL_PROFILE,
  openCategories,
  stimulusTrial,
  sungPerformance,
  withTrial,
} from "./grading.ts";
import { partsOf } from "./model.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};

beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

function envOf(def: LessonDef, session: string): GradeEnv {
  return {
    ownerId: def.id,
    key: def.key,
    meter: def.meter,
    bpm: def.bpm,
    unlocked: unlockedAt(courseGraph(), toolbox, session as SessionId),
    allowPreview: false,
    profile: NEUTRAL_PROFILE,
  };
}

/** A content test's response in the wire shape the player stores (staff text and taps as typed). */
function wire(t: TestCase): AttemptResponse | null {
  const r = t.response;
  if ("pitchFixture" in r) return null;
  return r as AttemptResponse;
}

const LESSONS: [LessonDef, string][] = [
  [sample, "U03.L05"],
  [u01l01, "U01.L01"],
  [u02l01, "U02.L01"],
];

for (const [def, session] of LESSONS) {
  describe(`${def.id} authored tests through the player's grading path`, () => {
    for (const step of def.steps) {
      const ex = step.exercise;
      if (!ex) continue;
      for (const part of partsOf(ex)) {
        for (const t of part.tests) {
          const response = wire(t);
          if (!response) continue;
          test(`${step.id} ${part.id}: ${t.name} → ${t.expect}`, async () => {
            const r = await gradeStep(deps, envOf(def, session), part as Exercise, response, {
              params: t.params ?? {},
              attemptNo: 1,
              rung: 0,
              extraReplays: 0,
            });
            if (t.expect === "pass") expect(r.status).toBe("pass");
            else if (t.expect === "fail") expect(r.status).toBe("fail");
            else expect(r.status).toBe("error");
            for (const code of t.feedback ?? []) expect(r.diagnostics.map((d) => d.id)).toContain(code);
          });
        }
      }
    }
  });
}

describe("a sung call is read for its own bars", () => {
  test("U00.L02 S5: one C sung back to the one-bar home note passes (the call is not looped to 4 bars)", async () => {
    const ex = u00l02.steps.find((s) => s.id === "S5")?.exercise as Exercise;
    const env = { ...envOf(u00l02, "U00.L02"), allowPreview: true };
    const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
    const c3 = await gradeStep(deps, env, ex, { sung: [{ midi: 48, cents: 10, credit: 1 }] }, opts);
    expect(c3.status).toBe("pass");
    const d = await gradeStep(deps, env, ex, { sung: [{ midi: 62, cents: 0, credit: 0 }] }, opts);
    expect(d.status).not.toBe("pass");
  });
});

describe("locked tools are rejected in graded steps", () => {
  test("U01.L01 S7 answered with a tool from a later unit fails with a locked-tool code", async () => {
    const step = u01l01.steps.find((s) => s.id === "S7");
    const ex = step?.exercise as Exercise;
    // `.scale()` arrives in U03: the kick line answered with it uses a tool not yet unlocked.
    const r = await gradeStep(
      deps,
      envOf(u01l01, "U01.L01"),
      ex,
      { code: 'setcpm(120/4)\n\ndrums: s("bd bd bd bd").scale("C4:major")' },
      { params: {}, attemptNo: 1, rung: 0, extraReplays: 0 },
    );
    expect(r.status).not.toBe("pass");
    expect(r.diagnostics.some((d) => d.id.startsWith("code.locked"))).toBe(true);
  });
});

describe("generator stimuli", () => {
  test("U02.L01 S6 draws a fam.pit.compare trial whose expected answer is one of the step's options", () => {
    const step = u02l01.steps.find((s) => s.id === "S6");
    const ex = step?.exercise as Exercise;
    const cats = openCategories("fam.pit.compare", "U02.L01", () => false);
    expect(cats.sort()).toEqual(["higher", "lower", "same"]);
    const a = stimulusTrial(ex, "U02.L01", 0, NEUTRAL_PROFILE, cats);
    const b = stimulusTrial(ex, "U02.L01", 0, NEUTRAL_PROFILE, cats);
    expect(a?.code).toBe(b?.code ?? "");
    const choice = a?.expected.choice?.[0] ?? "";
    expect(["higher", "lower", "same"]).toContain(choice);
    const graded = withTrial(ex, a);
    expect(graded.kind === "identify" && graded.correct.choice).toEqual([choice]);
  });

  test("the trial is graded: the expected choice passes, another fails", async () => {
    const step = u02l01.steps.find((s) => s.id === "S6");
    const ex = step?.exercise as Exercise;
    const cats = openCategories("fam.pit.compare", "U02.L01", () => false);
    const trial = stimulusTrial(ex, "U02.L01", 3, NEUTRAL_PROFILE, cats);
    const right = trial?.expected.choice?.[0] as string;
    const wrong = ["higher", "lower", "same"].find((c) => c !== right) as string;
    const env = envOf(u02l01, "U02.L01");
    const o = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0, trial };
    expect((await gradeStep(deps, env, ex, { answer: { choice: [right] } }, o)).status).toBe("pass");
    expect((await gradeStep(deps, env, ex, { answer: { choice: [wrong] } }, o)).status).toBe("fail");
  });

  test("the drawn trial really goes the way its answer says (headless Strudel)", async () => {
    const step = u02l01.steps.find((s) => s.id === "S6");
    const ex = step?.exercise as Exercise;
    const cats = openCategories("fam.pit.compare", "U02.L01", () => false);
    for (let series = 0; series < 6; series++) {
      const trial = stimulusTrial(ex, "U02.L01", series, NEUTRAL_PROFILE, cats);
      if (!trial) throw new Error("no trial");
      const res = await evaluateForGrading(trial.code, { mode: "lesson", bars: 1, lint: null, meter: "2/4" });
      if (!res.ok) throw new Error("trial code does not evaluate");
      const midis = res.events.map((e) => e.midi).filter((m): m is number => typeof m === "number");
      expect(midis.length).toBe(2);
      const [a, b] = midis as [number, number];
      const truth = b > a ? "higher" : b < a ? "lower" : "same";
      expect(trial.expected.choice).toEqual([truth]);
    }
  });
});

describe("sung notes", () => {
  test("within the tolerance is full credit, an octave off is forgiven, silence is no voice", () => {
    const targets = [60, 64, 67];
    const sung = [
      { midi: 60, cents: 10, credit: 0 },
      { midi: 76, cents: -20, credit: 0 },
      { midi: 69, cents: 0, credit: 0 },
    ];
    const r = sungPerformance(sung, targets, 50, "per-note");
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 0]);
    const silent = sungPerformance([{ midi: null, cents: null, credit: 0 }], targets, 50, "per-note");
    expect(silent.diagnostics.map((d) => d.id)).toEqual(["sing.no-voice"]);
  });
});
