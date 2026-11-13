// The player's grading path against the real grader realm: every authored test of the gate sample and the two
// exemplar lessons, sent through `gradeStep` exactly as the player sends a learner's response (wire shape →
// grader shape, params, unlocked tools, the onboarding preview context), must come out as the author pinned it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AttemptResponse, ByEarPart, Exercise, LessonDef, SessionId, TestCase } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import sample from "../../../content/core/_sample/L00/lesson.ts";
import u00l02 from "../../../content/core/U00/L02/lesson.ts";
import u01l01 from "../../../content/core/U01/L01/lesson.ts";
import u02l01 from "../../../content/core/U02/L01/lesson.ts";
import u03l01 from "../../../content/core/U03/L01/lesson.ts";
import u03l02 from "../../../content/core/U03/L02/lesson.ts";
import u03l03 from "../../../content/core/U03/L03/lesson.ts";
import u03l04 from "../../../content/core/U03/L04/lesson.ts";
import u03l05 from "../../../content/core/U03/L05/lesson.ts";
import u03l06 from "../../../content/core/U03/L06/lesson.ts";
import u03l07 from "../../../content/core/U03/L07/lesson.ts";
import u03l08 from "../../../content/core/U03/L08/lesson.ts";
import u03l09 from "../../../content/core/U03/L09/lesson.ts";
import u03l10 from "../../../content/core/U03/L10/lesson.ts";
import u03l11 from "../../../content/core/U03/L11/lesson.ts";
import u04l01 from "../../../content/core/U04/L01/lesson.ts";
import u04l02 from "../../../content/core/U04/L02/lesson.ts";
import u04l03 from "../../../content/core/U04/L03/lesson.ts";
import u04l04 from "../../../content/core/U04/L04/lesson.ts";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import fixture, { BUNS_CODE, BUNS_WRONG, FIXTURE_CONTEXT } from "./dev/wave3-fixture.ts";
import {
  type GradeEnv,
  type GraderDeps,
  gradeStep,
  NEUTRAL_PROFILE,
  openCategories,
  splitTypedParts,
  stimulusTrial,
  sungPerformance,
  withTrial,
} from "./grading.ts";
import { partsOf } from "./model.ts";
import { firstWrongBar } from "./rules.ts";
import {
  hasParts,
  isStaged,
  partExercise,
  partPassed,
  partResponse,
  revealedStages,
  stageExercise,
  stageOrder,
  stagePassed,
} from "./stages.ts";

setDefaultTimeout(60_000);

/** The 30 lessons of U05–U07, in course order (U05 has 8, U06 12, U07 10). */
const W4_LESSON_IDS: readonly string[] = (
  [
    ["U05", 8],
    ["U06", 12],
    ["U07", 10],
  ] as const
).flatMap(([u, n]) => Array.from({ length: n }, (_, i) => `${u}.L${String(i + 1).padStart(2, "0")}`));

const W4_LESSONS: LessonDef[] = await Promise.all(
  W4_LESSON_IDS.map(async (id) => {
    const [unit, lesson] = id.split(".") as [string, string];
    const mod = (await import(`../../../content/core/${unit}/${lesson}/lesson.ts`)) as { default: LessonDef };
    return mod.default;
  }),
);

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
  [fixture, FIXTURE_CONTEXT],
  // Every Wave 3 lesson, each in its own context (its tools unlocked at that lesson).
  ...[u03l01, u03l02, u03l03, u03l04, u03l05, u03l06, u03l07, u03l08, u03l09, u03l10, u03l11].map(
    (d) => [d, d.id] as [LessonDef, string],
  ),
  ...[u04l01, u04l02, u04l03, u04l04].map((d) => [d, d.id] as [LessonDef, string]),
  // Every Wave 4 lesson (U05 Triads, U06 Diatonic Harmony, U07 Melody), each in its own context.
  ...W4_LESSONS.map((d) => [d, d.id] as [LessonDef, string]),
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
            // As content CI reads it (content/validate/harness.ts): "fail" is anything but a pass, so a
            // lint refusal (`0..7`, an error) is a fail too.
            if (t.expect === "pass") expect(r.status).toBe("pass");
            else if (t.expect === "fail") expect(r.status).not.toBe("pass");
            else expect(r.status).toBe("error");
            for (const code of t.feedback ?? []) expect(r.diagnostics.map((d) => d.id)).toContain(code);
          });
        }
      }
    }
  });
}

describe("a typed answer of several parts", () => {
  const s7 = u03l01.steps.find((s) => s.id === "S7")?.exercise as Exercise;
  const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };

  test("U03.L01 S7: the D major scale typed in one field is graded letter by letter", async () => {
    const env = envOf(u03l01, "U03.L01");
    const typed = (t: string) => gradeStep(deps, env, s7, { answer: { text: [t] } }, opts);
    expect((await typed("D E F# G A B C#")).status).toBe("pass");
    expect((await typed("D, E, F#, G, A, B, C#")).status).toBe("pass");
    const wrong = await typed("D E F G A B C#");
    expect(wrong.status).toBe("fail");
    expect(wrong.diagnostics.filter((d) => d.id === "spell.wrong")).toHaveLength(1);
  });

  test("a one-part answer is never split", () => {
    const one = u03l05.steps.find((s) => s.id === "S5")?.exercise as Exercise;
    expect(splitTypedParts(one, { text: ["F# major"] })).toEqual({ text: ["F# major"] });
    expect(splitTypedParts(s7, { text: ["D"] })).toEqual({ text: ["D"] });
  });
});

describe("a drawn melody written on the degree pad (U03.L10 S2)", () => {
  test("the trial's own degrees pass in its own key, a wrong note fails on its slot", async () => {
    const ex = u03l10.steps.find((s) => s.id === "S2")?.exercise as Exercise;
    const env = envOf(u03l10, "U03.L10");
    const stim = (ex as { stimulus: { family: string } }).stimulus;
    const keys = new Set<string>();
    for (let series = 0; series < 6; series++) {
      const cats = openCategories(stim.family, "U03.L10", () => true);
      const trial = stimulusTrial(ex, "U03.L10", series, NEUTRAL_PROFILE, cats);
      if (!trial) throw new Error("no trial");
      keys.add(String((trial.params.key as { tonic: string }).tonic));
      const right = trial.expected.degrees as string[];
      const o = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0, trial };
      expect((await gradeStep(deps, env, ex, { answer: { degrees: right } }, o)).status).toBe("pass");
      const wrong = right.map((d, i) => (i === 1 ? (d === "1" ? "2" : "1") : d));
      const w = await gradeStep(deps, env, ex, { answer: { degrees: wrong } }, o);
      expect(w.status).toBe("fail");
      expect(w.diagnostics.map((d) => d.where?.slot)).toEqual([2]);
    }
    // The trials really move round the keys, so reading them in the lesson's C would have been wrong.
    expect(keys.size).toBeGreaterThan(1);
  });
});

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

describe("Wave 3 shapes through the player's grading path", () => {
  const env = () => envOf(fixture, FIXTURE_CONTEXT);
  const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
  const ex = (id: string) => fixture.steps.find((s) => s.id === id)?.exercise as Exercise;

  test("the by-ear tune is Hot Cross Buns: E D C, then C C C C D D D D (headless Strudel)", async () => {
    const res = await evaluateForGrading(BUNS_CODE, { mode: "lesson", bars: 2, lint: null, meter: "4/4" });
    if (!res.ok) throw new Error("the tune does not evaluate");
    const midis = res.events.map((e) => e.midi).filter((m): m is number => typeof m === "number");
    expect(midis).toEqual([64, 62, 60, 60, 60, 60, 60, 62, 62, 62, 62]);
  });

  test("by ear: a wrong second bar fails and says the first wrong note is in bar 2", async () => {
    const r = await gradeStep(
      deps,
      env(),
      ex("S4"),
      { code: BUNS_CODE.replace(/n\("[^"]+"\)/, `n("${BUNS_WRONG}")`) },
      opts,
    );
    expect(r.status).toBe("fail");
    expect(firstWrongBar(r)).toBe(2);
  });

  test("a key signature goes to the grader as the accidentals in order (answer.text)", async () => {
    const right = await gradeStep(deps, env(), ex("S2"), { answer: { text: ["F#", "C#"] } }, opts);
    expect(right.status).toBe("pass");
    const one = await gradeStep(deps, env(), ex("S2"), { answer: { text: ["F#"] } }, opts);
    expect(one.status).toBe("fail");
  });

  test("U03.L02 S8's sung pattern: 1 3 5 3 1 on pitch passes, a wrong middle note does not", async () => {
    const s8 = u03l02.steps.find((s) => s.id === "S8")?.exercise as Exercise;
    const e = envOf(u03l02, "U03.L02");
    const sung = (ms: number[]) => ms.map((midi) => ({ midi, cents: 5, credit: 1 }));
    expect((await gradeStep(deps, e, s8, { sung: sung([60, 64, 67, 64, 60]) }, opts)).status).toBe("pass");
    expect((await gradeStep(deps, e, s8, { sung: sung([60, 65, 69, 65, 60]) }, opts)).status).not.toBe(
      "pass",
    );
  });
});

describe("Wave 4 stages and parts through the player's grading path (U06.L09)", () => {
  const l09 = W4_LESSONS.find((d) => d.id === "U06.L09") as LessonDef;
  const env = () => envOf(l09, "U06.L09");
  const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
  const exOf = (id: string) => l09.steps.find((s) => s.id === id)?.exercise as Exercise;

  test("S2: each stage graded alone passes on the right answer and fails on its own pinned mistake", async () => {
    const ex = exOf("S2");
    if (!isStaged(ex)) throw new Error("U06.L09 S2 is not staged");
    const right = (
      (ex.tests.find((t) => t.expect === "pass")?.response ?? {}) as { answer: { stages: never } }
    ).answer.stages as Record<string, string[]>;
    // A reveal shows these very stages (the first passing test's).
    expect(revealedStages(ex)).toEqual(right);
    for (const stage of stageOrder(ex)) {
      const only = { answer: { stages: { [stage]: right[stage] } } } as AttemptResponse;
      const r = await gradeStep(deps, env(), stageExercise(ex, stage), only, opts);
      expect(stagePassed(ex, r), `${stage} right`).toBe(true);
    }
    // Each pinned mistake lives in one stage: graded alone, that stage fails and names it.
    for (const t of ex.tests.filter((x) => x.expect === "fail")) {
      const stages = (t.response as { answer: { stages: Record<string, string[]> } }).answer.stages;
      const bad = stageOrder(ex).find((s) => JSON.stringify(stages[s]) !== JSON.stringify(right[s]));
      if (!bad) throw new Error(`${t.name}: no stage differs`);
      const only = { answer: { stages: { [bad]: stages[bad] } } } as AttemptResponse;
      const r = await gradeStep(deps, env(), stageExercise(ex, bad), only, opts);
      expect(stagePassed(ex, r), `${t.name}: the ${bad} stage fails`).toBe(false);
      for (const code of t.feedback ?? []) expect(r.diagnostics.map((d) => d.id)).toContain(code);
    }
  });

  test("S3: each part graded on its own track; the bass part passes while the chords are still wrong", async () => {
    const ex = exOf("S3");
    if (!hasParts(ex)) throw new Error("U06.L09 S3 has no parts");
    const ref = ex.reference.solutions[0] as string;
    const chordsWrong = ex.tests.find((t) => t.name.includes("last chord a degree off"))?.response as {
      code: string;
    };
    const bassWrong = ex.tests.find((t) => t.name.includes("bass heard a step low"))?.response as {
      code: string;
    };
    const [bass, chords] = ex.byEar.parts as [ByEarPart, ByEarPart];
    const grade = (part: ByEarPart, code: string) =>
      gradeStep(deps, env(), partExercise(ex, part) as Exercise, partResponse(code, part), opts);
    expect(partPassed(bass, await grade(bass, ref))).toBe(true);
    expect(partPassed(chords, await grade(chords, ref))).toBe(true);
    expect(partPassed(bass, await grade(bass, chordsWrong.code))).toBe(true);
    expect(partPassed(chords, await grade(chords, chordsWrong.code))).toBe(false);
    const b = await grade(bass, bassWrong.code);
    expect(partPassed(bass, b)).toBe(false);
    expect(b.diagnostics.map((d) => d.id)).toContain("melody.wrong-degree");
  });
});
