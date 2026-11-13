// The Wave 4 shapes the player renders, against the real grader realm: every authored test of the dev fixture
// (U05.L99) through `gradeStep` as the player sends it; a staged chord dictation graded one stage at a time (the
// narrowed copy the player sends) and then whole; a by-ear step in parts graded part by part on its own track;
// the chords of a hand voicing read back as `chord()` symbols for the unlock moment (harmony view, headless
// Strudel); and the pure stage/part rules.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AttemptResponse, ByEarPart, DictationEx, Exercise, SessionId } from "@oak/api";
import { evaluateForGrading, gradeExercise, harmonyView, initRealm, normalize } from "@oak/grader";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import {
  currentStage,
  type StagedSpec,
  stagedResponse,
  stageStatuses,
  stageWidget,
} from "../answers/dictation/stages.ts";
import fixture, {
  CADENCE_C,
  FIXTURE4_CONTEXT,
  FIXTURE4_GATE,
  LOOP_CODE,
  PARTS_BASS_ONLY,
  PARTS_BASS_WRONG,
  PARTS_REF,
} from "./dev/wave4-fixture.ts";
import { gateMetBy } from "./gate.ts";
import { type GradeEnv, type GraderDeps, gradeStep, NEUTRAL_PROFILE } from "./grading.ts";
import { chartLabels, chordPatternOf } from "./harmony.ts";
import type { ByEarEx } from "./rules.ts";
import {
  hasParts,
  isStaged,
  partExercise,
  partMarks,
  partPassed,
  partResponse,
  type StagedEx,
  stageExercise,
  stageOrder,
  stagePassed,
  trackOnly,
} from "./stages.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};

beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const env: GradeEnv = {
  ownerId: fixture.id,
  key: fixture.key,
  meter: fixture.meter,
  bpm: fixture.bpm,
  unlocked: unlockedAt(courseGraph(), toolbox, FIXTURE4_CONTEXT as SessionId),
  allowPreview: false,
  profile: NEUTRAL_PROFILE,
};

const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
const exOf = (id: string) => fixture.steps.find((s) => s.id === id)?.exercise as Exercise;

describe("every authored test of the fixture, through the player's grading path", () => {
  for (const step of fixture.steps) {
    const ex = step.exercise;
    if (!ex) continue;
    for (const t of ex.tests) {
      test(`${step.id} ${ex.id}: ${t.name} → ${t.expect}`, async () => {
        const r = await gradeStep(deps, env, ex, t.response as AttemptResponse, opts);
        if (r.status !== t.expect)
          console.log(step.id, t.name, r.status, r.score, r.diagnostics.map((d) => d.id).join(" "));
        expect(r.status).toBe(t.expect);
      });
    }
  }
});

describe("the gate check scores against the gate's 0.9", () => {
  test("the smooth voicing opens it; root-position jumps do not, in C and in G", async () => {
    for (const id of ["S1", "S2"]) {
      const ex = exOf(id);
      const pass = ex.tests.find((t) => t.expect === "pass");
      const fail = ex.tests.find((t) => t.expect === "fail");
      const ok = await gradeStep(deps, env, ex, pass?.response as AttemptResponse, opts);
      expect(gateMetBy(ok, FIXTURE4_GATE.minScore)).toBe(true);
      const no = await gradeStep(deps, env, ex, fail?.response as AttemptResponse, opts);
      expect(gateMetBy(no, FIXTURE4_GATE.minScore)).toBe(false);
      // What to fix is the grader's own finding: a voice that moves too far.
      expect(no.rubric?.some((r) => !r.ok) || no.diagnostics.length > 0).toBe(true);
    }
  });
});

/** The staged flow the lesson hands the answers widget. */
const specOf = (s: StagedEx): StagedSpec => ({ stages: stageOrder(s), stageAnswers: s.stageAnswers });

describe("a staged chord dictation, one stage at a time", () => {
  const ex = exOf("S3") as DictationEx;
  test("is staged, bass first", () => {
    expect(isStaged(ex)).toBe(true);
    expect(stageOrder(ex as StagedEx)).toEqual(["bass", "quality", "rn"]);
  });

  test("the bass alone: right passes the stage, a wrong degree does not", async () => {
    const s = ex as StagedEx;
    const right = await gradeStep(
      deps,
      env,
      stageExercise(s, "bass"),
      stagedResponse(specOf(s), { bass: ["1", "5", "6", "4"] }, "bass"),
      opts,
    );
    expect(stagePassed(s, right)).toBe(true);
    const wrong = await gradeStep(
      deps,
      env,
      stageExercise(s, "bass"),
      stagedResponse(specOf(s), { bass: ["1", "5", "5", "4"] }, "bass"),
      opts,
    );
    expect(stagePassed(s, wrong)).toBe(false);
    expect(wrong.score).toBeCloseTo(0.75, 2);
  });

  test("the qualities alone, from one pad per chord", async () => {
    const s = ex as StagedEx;
    const r = await gradeStep(
      deps,
      env,
      stageExercise(s, "quality"),
      stagedResponse(specOf(s), { quality: ["maj", "maj", "min", "maj"] }, "quality"),
      opts,
    );
    expect(stagePassed(s, r)).toBe(true);
  });

  test("the numerals alone, compared as numerals (vi is not VI)", async () => {
    const s = ex as StagedEx;
    const right = await gradeStep(
      deps,
      env,
      stageExercise(s, "rn"),
      stagedResponse(specOf(s), { rn: ["I", "V", "vi", "IV"] }, "rn"),
      opts,
    );
    expect(stagePassed(s, right)).toBe(true);
    const upper = await gradeStep(
      deps,
      env,
      stageExercise(s, "rn"),
      stagedResponse(specOf(s), { rn: ["I", "V", "VI", "IV"] }, "rn"),
      opts,
    );
    expect(upper.score).toBeLessThan(1);
  });

  test("the lesson hosts the answers' staged flow: bass open first, a strip of qualities per chord", () => {
    const spec = specOf(ex as StagedEx);
    expect(stageStatuses(spec, {})).toEqual({ bass: "open", quality: "locked", rn: "locked" });
    expect(currentStage(spec, {})).toBe("bass");
    expect(stageStatuses(spec, { bass: { state: "correct" } })).toEqual({
      bass: "passed",
      quality: "open",
      rn: "locked",
    });
    expect(stageWidget(spec, "quality")?.ui).toBe("slot-choice");
    expect(stageStatuses({ ...spec, flow: "together" }, {})).toEqual({
      bass: "open",
      quality: "open",
      rn: "open",
    });
  });
});

describe("a by-ear step in parts, the bass first", () => {
  const ex = exOf("S4") as ByEarEx;
  const parts = (ex.byEar.parts ?? []) as ByEarPart[];
  test("has its parts in order", () => {
    expect(hasParts(ex)).toBe(true);
    expect(parts.map((p) => p.track)).toEqual(["bass", "chords"]);
  });

  test("one track of the code: what every track shares and that track's block", () => {
    const only = trackOnly(PARTS_REF, "bass") ?? "";
    expect(only).toContain("setcpm(88/4)");
    expect(only).toContain("bass:");
    expect(only).not.toContain("chords:");
    expect(trackOnly(PARTS_REF, "melody")).toBeNull();
  });

  test("the bass part passes on its own while the chords are still wrong; the chords part does not", async () => {
    const [bass, chords] = parts as [ByEarPart, ByEarPart];
    const b = await gradeStep(deps, env, partExercise(ex, bass), partResponse(PARTS_BASS_ONLY, bass), opts);
    expect(partPassed(bass, b)).toBe(true);
    const c = await gradeStep(
      deps,
      env,
      partExercise(ex, chords),
      partResponse(PARTS_BASS_ONLY, chords),
      opts,
    );
    expect(partPassed(chords, c)).toBe(false);
    const wrongBass = await gradeStep(
      deps,
      env,
      partExercise(ex, bass),
      partResponse(PARTS_BASS_WRONG, bass),
      opts,
    );
    expect(partPassed(bass, wrongBass)).toBe(false);
  });

  test("marks: one part open at a time", () => {
    expect(partMarks(parts, new Set(), 0)).toEqual(["open", "locked"]);
    expect(partMarks(parts, new Set([0]), 0)).toEqual(["passed", "open"]);
    expect(partMarks(parts, new Set(), 4)).toEqual(["revealed", "revealed"]);
  });
});

describe("the unlock moment and the lead sheet", () => {
  test("a hand voicing reads back as C F G C for Strudel's .voicing()", async () => {
    const res = await evaluateForGrading(CADENCE_C, { mode: "lesson", bars: 4, lint: null, meter: "4/4" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const key = { tonic: "C", mode: "major" } as const;
    const n = normalize(res, { meter: "4/4", key });
    const view = harmonyView(n, { meter: "4/4", key, bars: 4 });
    const barOf = (i: number) => {
      const at = view.slots[i]?.span[0];
      return at ? Math.floor(at[0] / at[1]) : 0;
    };
    expect(chordPatternOf(view.slots, barOf, 4)).toBe("<C F G C>");
    // …and Strudel's voicing of those symbols plays the same pitch classes.
    const theirs = await evaluateForGrading(`setcpm(88/4)\nchords: chord("<C F G C>").voicing().s("piano")`, {
      mode: "lesson",
      bars: 4,
      lint: null,
      meter: "4/4",
    });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    const tn = normalize(theirs, { meter: "4/4", key });
    const tv = harmonyView(tn, { meter: "4/4", key, bars: 4 });
    expect(tv.slots.map((s) => s.code)).toEqual(["C", "F", "G", "C"]);
  });

  test("a held chord carries over a bar without a change", () => {
    const slots = [{ code: "C" }, { code: "G" }];
    const at = [0, 2];
    expect(chordPatternOf(slots, (i) => at[i] ?? 0, 4)).toBe("<C C G G>");
    expect(chordPatternOf([], () => 0, 4)).toBeNull();
  });

  test("a chart's bars: 1-based, 0 = the pickup bar", () => {
    expect(chartLabels([{ bar: 1, beat: 1, symbol: "C" }], false)).toEqual([
      { bar: 0, beat: 1, symbol: "C" },
    ]);
    expect(chartLabels([{ bar: 0, beat: 3, symbol: "G" }], true)).toEqual([{ bar: 0, beat: 3, symbol: "G" }]);
  });

  test("the loop the fixture plays is I V vi IV in C", async () => {
    const res = await evaluateForGrading(LOOP_CODE, { mode: "lesson", bars: 4, lint: null, meter: "4/4" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const key = { tonic: "C", mode: "major" } as const;
    const v = harmonyView(normalize(res, { meter: "4/4", key }), { meter: "4/4", key, bars: 4 });
    expect(v.slots.map((s) => s.rn)).toEqual(["I", "V", "vi", "IV"]);
  });
});
