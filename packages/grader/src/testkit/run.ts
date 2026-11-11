// Test-only adapter over `evaluateForGrading`: the call shape of the spike S1 suites (resolve with the
// result, throw a typed error), so the facts they pinned are re-run against the production runtime.
// Not a test file itself (no `.test.ts`), and not exported from the package.
import { evaluateForGrading } from "../runtime/analyze.ts";
import type { EvalOptions, EvalSuccess, GraderErrorKind } from "../types.ts";

export class RunError extends Error {
  readonly kind: GraderErrorKind;
  readonly line: number | undefined;
  constructor(kind: GraderErrorKind, message: string, line?: number) {
    super(message);
    this.kind = kind;
    this.line = line;
  }
}

export interface RunOptions extends Partial<Omit<EvalOptions, "lint">> {
  lint?: EvalOptions["lint"];
}

/** One bar in `lesson` mode without the lint unless told otherwise. */
export async function run(code: string, opts: RunOptions = {}): Promise<EvalSuccess> {
  const r = await evaluateForGrading(code, { mode: "lesson", bars: 1, lint: null, ...opts });
  if (!r.ok) throw new RunError(r.error.kind, r.error.message, r.error.line);
  return r;
}

export async function fails(code: string, opts: RunOptions = {}): Promise<RunError> {
  try {
    await run(code, opts);
  } catch (e) {
    if (e instanceof RunError) return e;
    throw e;
  }
  throw new Error(`expected a failure for: ${code}`);
}
