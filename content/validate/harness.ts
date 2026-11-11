// The thin adapter between content CI and the packages that do the real work (architecture §3.7 as
// amended by contracts): `lintOak`, `gradeExercise`, `evaluateForGrading` and `normalize` from
// @oak/grader, `notate` from @oak/notation, `gradeTaps` from @oak/pitch and `evalHeadless` from
// @oak/grader/testing. There is no stand-in: a test the real packages cannot decide (a sung response
// without a recorded fixture) is reported as pending, never counted as a pass.
import type {
  Exercise,
  KeySpec,
  LessonDef,
  LintContext,
  LintResult,
  MeterId,
  SessionId,
  TapEx,
  TestCase,
  TestResponse,
  UnlockableId,
} from "@oak/content-kit";
import * as grader from "@oak/grader";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import * as notation from "@oak/notation";
import { gradeTaps } from "@oak/pitch";
import { METERS } from "@oak/theory";
import { courseGraph } from "../index.ts";
import { unlockedAt } from "../lib/course.ts";
import { toolbox } from "../toolbox.ts";

/** The Wave 1 gate sample is checked as if it were taught at this session. */
export const SAMPLE_CONTEXT: SessionId = "U03.L05";

type Backend = "package";
const used = { lint: new Set<Backend>(), grade: new Set<Backend>(), notation: new Set<Backend>() };
export function backends(): Record<keyof typeof used, Backend[]> {
  return { lint: [...used.lint], grade: [...used.grade], notation: [...used.notation] };
}

/** The grader realm, initialised once per process with the course toolbox (tool IDs for `uses`/`must-use`). */
let realm: Promise<unknown> | null = null;
const ensureRealm = () => {
  realm ??= grader.initRealm({ toolbox: [...toolbox], lockdown: false });
  return realm;
};

// --- lint ---------------------------------------------------------------------------------------

const unlockedCache = new Map<string, Set<UnlockableId>>();
export function unlockedFor(session: SessionId): Set<UnlockableId> {
  let set = unlockedCache.get(session);
  if (!set) {
    set = unlockedAt(courseGraph(), toolbox, session);
    unlockedCache.set(session, set);
  }
  return set;
}

export interface LintOptions {
  session: SessionId;
  meter: MeterId;
  key?: KeySpec | null;
  allowPreview?: boolean;
  profile?: LintContext["profile"];
}
export function lint(code: string, o: LintOptions): LintResult {
  const ctx: LintContext = {
    profile: o.profile ?? "content",
    unlocked: unlockedFor(o.session),
    allowPreview: o.allowPreview ?? false,
    meter: o.meter,
    key: o.key ?? null,
  };
  used.lint.add("package");
  return grader.lintOak(code, ctx, toolbox);
}

// --- evaluation ---------------------------------------------------------------------------------

/** `.scope()` and `.fscope()` are identity in the grader realm (contracts §3.1 rule 9); the test realm lacks them. */
const forTestRealm = (code: string) => code.replace(/\.f?scope\(\s*\)/g, "");

export interface EvalOutcome {
  ok: boolean;
  error?: string;
  events: HeadlessEvent[];
  logs: string[];
  cpsSet: boolean;
  cps: number;
  tracks: string[];
}
export async function evaluate(code: string, bars = 1): Promise<EvalOutcome> {
  try {
    const r = await evalHeadless(forTestRealm(code), bars);
    return { ok: true, events: r.events, logs: r.logs, cpsSet: r.cpsSet, cps: r.cps, tracks: r.tracks };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      events: [],
      logs: [],
      cpsSet: false,
      cps: 0,
      tracks: [],
    };
  }
}
/** Strudel log lines that mean the code is wrong even though it ran (architecture §3.7 item 3). */
export const BAD_LOG = /\[(mini|tonal|voicing|query|eval)\]|error|unknown chord/i;

// --- grading ------------------------------------------------------------------------------------

export interface GradeOutcome {
  /** False when the packages cannot decide this test (the caller reports it, never counts it as a pass). */
  decided: boolean;
  passed: boolean;
  score: number;
  feedback: string[];
  backend: Backend;
  note?: string;
}

const NEUTRAL_PROFILE = {
  rangeLow: 48,
  rangeHigh: 72,
  comfLow: 52,
  comfHigh: 67,
  tapLatencyMs: 0,
  tapJitterMs: 15,
  singLatencyMs: 0,
  singTolCents: 50,
  singTolMode: "auto",
  noiseFloorDb: -60,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
} as const;

type Lesson = Pick<LessonDef, "id" | "key" | "meter" | "bpm" | "swing" | "pickup">;

/** Taps are graded by @oak/pitch against the targets the grader reads off the evaluated stimulus. */
async function tapPerformance(ex: TapEx, taps: number[], lesson: Lesson): Promise<grader.MatchResult> {
  await ensureRealm();
  const meter = ex.meter ?? lesson.meter;
  const code = ex.stimulus.src === "code" ? ex.stimulus.code : null;
  if (code === null) throw new Error(`${ex.id}: tap tests need a code stimulus`);
  const res = await grader.evaluateForGrading(code, { mode: "lesson", bars: ex.bars, lint: null, meter });
  if (!res.ok) throw new Error(`${ex.id}: the stimulus does not evaluate: ${res.error.message}`);
  const n = grader.normalize(res, { meter, key: ex.key ?? lesson.key });
  const targets = grader.tapTargets(ex.target, n, ex.bars, meter);
  return gradeTaps(taps, targets, ex.tol, NEUTRAL_PROFILE) as unknown as grader.MatchResult;
}

async function toExerciseResponse(
  ex: Exercise,
  r: TestResponse,
  lesson: Lesson,
): Promise<grader.ExerciseResponse | null> {
  if ("staff" in r)
    return { staff: notation.parseNoteList(r.staff, { meter: METERS[ex.meter ?? lesson.meter] }) };
  if ("taps" in r)
    return ex.kind === "tap" ? { performance: await tapPerformance(ex, r.taps, lesson) } : null;
  if ("pitchFixture" in r) return null;
  return r as grader.ExerciseResponse;
}

export async function grade(
  ex: Exercise,
  test: TestCase,
  lesson: Lesson,
  session: SessionId,
): Promise<GradeOutcome> {
  await ensureRealm();
  const response = await toExerciseResponse(ex, test.response, lesson);
  if (!response)
    return {
      decided: false,
      passed: false,
      score: 0,
      feedback: [],
      backend: "package",
      note: `no recorded fixture can drive a ${Object.keys(test.response)[0]} response to ${ex.kind}`,
    };
  const result = await grader.gradeExercise({
    exercise: ex,
    response,
    ctx: {
      exerciseGlobalId: `${lesson.id}/${ex.id}`,
      mode: "lesson",
      key: ex.key ?? lesson.key,
      meter: ex.meter ?? lesson.meter,
      bpm: lesson.bpm,
      ...(lesson.swing ? { swing: lesson.swing } : {}),
      ...(lesson.pickup ? { pickup: lesson.pickup } : {}),
      params: test.params ?? {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedFor(session),
        allowPreview: false,
        meter: lesson.meter,
        key: lesson.key,
      },
      profile: NEUTRAL_PROFILE,
    },
  });
  used.grade.add("package");
  return {
    decided: true,
    passed: result.status === "pass",
    score: result.score,
    feedback: result.diagnostics.map((d) => d.id),
    backend: "package",
    ...(result.status === "error" && test.expect !== "error"
      ? { note: result.messages.join(" / ") || "evaluation error" }
      : {}),
  };
}

// --- notation -----------------------------------------------------------------------------------

export interface NotationOutcome {
  available: boolean;
  approximate?: boolean;
  warnings?: number;
  abc?: string;
  error?: string;
}
/** Evaluates code in the grader realm, normalizes it and engraves its pitched events on one staff. */
export async function notateCode(
  code: string,
  meter: MeterId,
  key: KeySpec | null,
  bars: number,
): Promise<NotationOutcome> {
  await ensureRealm();
  const res = await grader.evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter });
  if (!res.ok) return { available: true, error: res.error.message };
  const n = grader.normalize(res, key ? { meter, key } : { meter });
  const { score, abc } = notation.notate({
    events: n.all.filter((e) => e.midi !== null && !e.drum),
    meter: METERS[meter],
    key,
    bars,
    staff: "treble",
  });
  used.notation.add("package");
  return { available: true, approximate: score.approximate, warnings: score.warnings.length, abc: abc.abc };
}

/** Kept for callers that only have headless events: the event list is re-evaluated through the grader. */
export type { HeadlessEvent };
