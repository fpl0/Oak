// `compare_haps` for the tutor (contracts §10.3): the learner's code against an exercise's reference or
// against other code, in a window of at most 16 bars, with the matcher the mode names.
import type { Exercise, GradeResult, Matcher } from "@oak/content-kit";
import { rat, substituteParams } from "@oak/content-kit";
import { diag, messagesOf, sortDiagnostics } from "../feedback/catalog.ts";
import { runMatcher } from "../match/index.ts";
import type { CompareMode, CompareRequest, NormalizeContext } from "../types.ts";
import { MODE_LIMITS } from "../types.ts";
import type { GradeDeps } from "./index.ts";
import { evalFailureDiagnostics } from "./index.ts";

/** The matcher a compare mode stands for; `auto` takes the exercise's own matcher, else exact events. */
export function compareMatcher(mode: CompareMode, exercise?: Exercise): Matcher {
  switch (mode) {
    case "events":
      return { m: "events", pitch: "absolute", rhythm: "onsets", durations: false, sound: "drum-role" };
    case "rhythm":
      return { m: "rhythm", tol: rat(0), durations: false, perRole: true, displacementCredit: 0.5 };
    case "melody":
      return { m: "melody", pitch: "key-relative", wPitch: 0.7, wRhythm: 0.3, rhythmTol: rat(0) };
    case "harmony":
      return { m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" };
    case "pcset":
      return { m: "pcset", perOnset: true, bass: true };
    case "auto":
      if (exercise && "matcher" in exercise && exercise.matcher) return exercise.matcher;
      if (exercise?.kind === "transcribe-step" && exercise.grading.mode === "auto")
        return exercise.grading.matcher;
      return compareMatcher("events");
  }
}

function referenceCode(ex: Exercise): string | null {
  if ("reference" in ex && ex.reference && "solutions" in ex.reference)
    return ex.reference.solutions[0] ?? null;
  if (ex.kind === "transcribe-step" && ex.grading.mode === "auto")
    return ex.grading.reference.solutions[0] ?? null;
  if (ex.kind === "staff-write" && "reference" in ex.expect) return ex.expect.reference.solutions[0] ?? null;
  return null;
}

/** Compares two pieces of code (or code against an exercise reference) in the tutor's window. */
export async function compareWith(req: CompareRequest, deps: GradeDeps): Promise<GradeResult> {
  const bars = Math.max(1, Math.min(MODE_LIMITS.tutor.maxBars, req.bars));
  const exercise =
    req.target.kind === "exercise" ? substituteParams(req.target.exercise, req.target.params) : undefined;
  const targetCode = req.target.kind === "code" ? req.target.code : exercise ? referenceCode(exercise) : null;
  const base: Omit<GradeResult, "status" | "score" | "adjustedScore" | "dims" | "diagnostics" | "messages"> =
    {
      exerciseId: exercise ? exercise.id : "compare",
      exerciseVersion: exercise?.version ?? 0,
      attemptNo: 0,
      firstAttempt: false,
      mode: "tutor",
      constraints: [],
      assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
    };
  const fail = (ds: ReturnType<typeof diag>[]): GradeResult => ({
    ...base,
    status: "error",
    score: 0,
    adjustedScore: 0,
    dims: {},
    diagnostics: ds,
    messages: messagesOf(ds),
  });
  if (!targetCode) return fail([diag("eval.not-a-pattern")]);
  const opts = { mode: "tutor" as const, bars, fromBar: req.fromBar, meter: req.meter };
  const a = await deps.evaluate(req.learnerCode, { ...opts, lint: req.lint });
  if (!a.ok) return fail(evalFailureDiagnostics(a, bars));
  const t = await deps.evaluate(targetCode, { ...opts, lint: req.target.kind === "code" ? req.lint : null });
  if (!t.ok) return fail(evalFailureDiagnostics(t, bars));
  const ctx: NormalizeContext = { meter: req.meter, ...(req.key ? { key: req.key } : {}) };
  const m = runMatcher(compareMatcher(req.mode, exercise), deps.normalize(t, ctx), deps.normalize(a, ctx), {
    ...ctx,
    code: req.learnerCode,
    params: {},
  });
  const diagnostics = sortDiagnostics(m.diagnostics);
  return {
    ...base,
    status: m.score >= 1 - 1e-9 ? "pass" : "fail",
    score: m.score,
    adjustedScore: 0,
    dims: m.dims,
    diagnostics,
    messages: messagesOf(diagnostics),
    ...(m.overlay ? { overlay: m.overlay } : {}),
  };
}
