// Transport-independent request handler, shared by the Worker entry (browser and Bun) and the subprocess
// entry. One request at a time: the entries chain them.

import type { GradeResult } from "@oak/content-kit";
import { lintOak } from "../lint/oak.ts";
import { evaluateForGrading } from "../runtime/analyze.ts";
import { errorMessage } from "../runtime/errors.ts";
import { initRealm, lastLockdown, R } from "../runtime/realm.ts";
import type {
  CompareRequest,
  GradeRequest,
  GraderInit,
  GraderReady,
  GraderRequest,
  GraderResponse,
} from "../types.ts";

export type GradeFns = {
  gradeExercise(req: GradeRequest): Promise<GradeResult>;
  compareCode(req: CompareRequest): Promise<GradeResult>;
};

let booted = false;
let grading: GradeFns | null = null;

/**
 * Sets the realm up and answers `ready`. `fns` are the grading entry points (`gradeExercise`,
 * `compareCode`); they are loaded lazily by default so this module does not import the package root.
 */
export async function boot(
  init: GraderInit,
  fns?: GradeFns,
): Promise<GraderReady & { lockdown?: { neutered: string[]; failed: string[] } }> {
  const t0 = performance.now();
  grading = fns ?? ((await import("../index.ts")) as unknown as GradeFns);
  const ready = await initRealm({ toolbox: init.toolbox, lockdown: init.lockdown });
  booted = true;
  const report = lastLockdown();
  return { ...ready, initMs: performance.now() - t0 + ready.initMs, ...(report && { lockdown: report }) };
}

export async function handle(req: GraderRequest): Promise<GraderResponse> {
  const t0 = performance.now();
  const ms = () => performance.now() - t0;
  if (!booted)
    return { id: req.id, ok: false, error: { kind: "internal", message: "the grader is not booted" }, ms: 0 };
  try {
    switch (req.kind) {
      case "ping":
        return { id: req.id, ok: true, kind: "ping", ms: ms() };
      case "analyze": {
        const result = await evaluateForGrading(req.code, req.opts);
        return { id: req.id, ok: true, kind: "analyze", result, ms: ms() };
      }
      case "lint":
        return {
          id: req.id,
          ok: true,
          kind: "lint",
          result: lintOak(req.code, req.ctx, R.toolbox),
          ms: ms(),
        };
      case "grade": {
        const result = await (grading as GradeFns).gradeExercise(req.req);
        return { id: req.id, ok: true, kind: "grade", result, ms: ms() };
      }
      case "compare": {
        const result = await (grading as GradeFns).compareCode(req.req);
        return { id: req.id, ok: true, kind: "compare", result, ms: ms() };
      }
    }
  } catch (e) {
    return { id: req.id, ok: false, error: { kind: "internal", message: errorMessage(e) }, ms: ms() };
  }
}
