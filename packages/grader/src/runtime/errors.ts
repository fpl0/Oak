// A problem in the evaluated code, typed by kind. Thrown inside the runtime only; `evaluateForGrading`
// turns it into an `EvalFailure` (failure is data, never a rejected promise).
import type { LintDiagnostic } from "@oak/content-kit";
import type { GraderErrorInfo, GraderErrorKind } from "../types.ts";

export class GraderError extends Error {
  readonly kind: GraderErrorKind;
  line?: number;
  pos?: number;
  lint?: LintDiagnostic[];
  constructor(kind: GraderErrorKind, message: string, where: { line?: number; pos?: number } = {}) {
    super(message);
    this.name = "GraderError";
    this.kind = kind;
    if (where.line !== undefined) this.line = where.line;
    if (where.pos !== undefined) this.pos = where.pos;
  }
  info(): GraderErrorInfo {
    return {
      kind: this.kind,
      message: this.message,
      ...(this.line !== undefined && { line: this.line }),
      ...(this.pos !== undefined && { pos: this.pos }),
      ...(this.lint && { lint: this.lint }),
    };
  }
}

/** `Name: message` for anything thrown by Strudel or the evaluated code. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const err = e as { message: unknown; name?: unknown };
    const name = typeof err.name === "string" && err.name !== "Error" ? `${err.name}: ` : "";
    return `${name}${String(err.message)}`;
  }
  return String(e);
}
