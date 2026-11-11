// The bridge between the one lint pass (`lintOak` in @oak/grader, injected as `OakStrudelOptions.lint`)
// and the editor. Pure: no CodeMirror import, so it is tested under Bun.
import type { CodeRange, FeedbackId, LintContext, LintDiagnostic, LintResult } from "@oak/content-kit";
import { friendlyEvalError } from "./friendly.ts";

/** What `@codemirror/lint` takes. */
export interface CmDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
  source: string;
  message: string;
}

const SEVERITY: Record<LintDiagnostic["severity"], CmDiagnostic["severity"]> = {
  error: "error",
  warn: "warning",
  info: "info",
};

/** Lint diagnostics to CodeMirror's, clamped to the document (a stale range must not throw in the view). */
export function toCmDiagnostics(diagnostics: readonly LintDiagnostic[], docLength: number): CmDiagnostic[] {
  return diagnostics.map((d) => {
    const from = Math.max(0, Math.min(d.range.from, docLength));
    const to = Math.max(from, Math.min(d.range.to, docLength));
    return { from, to, severity: SEVERITY[d.severity], source: d.id, message: d.message };
  });
}

/** The diagnostic IDs the adapter itself produces (everything else comes from the lint or the grader). */
export const ADAPTER_FEEDBACK = {
  /** A syntax error thrown by the transpiler or the mini-notation parser at evaluation time. */
  syntax: "eval.syntax",
  /** Any other exception while evaluating the code. */
  runtime: "eval.runtime",
  /** The code did not return a pattern. */
  notAPattern: "eval.not-a-pattern",
  /** The lint itself failed: the code is not run (fail closed, contracts §11.3). */
  lintFailed: "eval.lint-failed",
  /** Playback was asked for without a user gesture. */
  audioLocked: "eval.audio-locked",
  /** The Band code failed its lint or its evaluation; the learner's code still plays. */
  band: "eval.band-failed",
  /** The editor was disposed while the evaluation waited. */
  disposed: "eval.disposed",
  /** The code evaluated to a pattern with no note in the loop (info, never blocking). */
  silent: "eval.silent",
} as const satisfies Record<string, FeedbackId>;

export function lineOf(code: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, code.length);
  for (let i = 0; i < end; i++) if (code.charCodeAt(i) === 10) line++;
  return line;
}

export function diagnostic(
  id: FeedbackId,
  severity: LintDiagnostic["severity"],
  message: string,
  code: string,
  range: CodeRange = { from: 0, to: 0 },
): LintDiagnostic {
  return { id, severity, range, line: lineOf(code, range.from), params: {}, message };
}

/**
 * An evaluation error to a diagnostic. `evalScope` replaces `window.SyntaxError` with the mini-notation
 * parser's class, so `instanceof SyntaxError` is unreliable in the adapter realm: duck-type instead
 * (docs/spikes.md, s2 gotchas). acorn errors carry `pos`; peggy errors carry `location.start.offset`.
 */
export function errorToDiagnostic(err: unknown, code: string): LintDiagnostic {
  const e = (err ?? {}) as {
    name?: string;
    message?: string;
    pos?: number;
    location?: { start?: { offset?: number } };
  };
  const message = typeof e.message === "string" && e.message.length > 0 ? e.message : String(err);
  const offset = typeof e.pos === "number" ? e.pos : e.location?.start?.offset;
  const syntax =
    typeof offset === "number" ||
    e.name === "SyntaxError" ||
    /parse error|Unexpected token|Unterminated/i.test(message);
  // The learner reads one calm sentence at the place it is about (ux §7.11); the raw text stays in `detail`.
  const friendly = friendlyEvalError(message, code, typeof offset === "number" ? offset : null);
  const range = friendly.range ?? { from: 0, to: 0 };
  const d = diagnostic(
    syntax ? ADAPTER_FEEDBACK.syntax : ADAPTER_FEEDBACK.runtime,
    "error",
    friendly.message,
    code,
    range,
  );
  d.params = { detail: friendly.detail };
  return d;
}

export type LintOutcome = { ok: true; result: LintResult } | { ok: false; diagnostic: LintDiagnostic };

/** Runs the injected lint. A lint that throws is an infrastructure failure: the code is not evaluated. */
export function runLint(
  lint: (code: string, ctx: LintContext) => LintResult,
  code: string,
  ctx: LintContext,
): LintOutcome {
  try {
    return { ok: true, result: lint(code, ctx) };
  } catch (err) {
    const message = `The code check failed to run (${(err as Error)?.message ?? err}); nothing was played.`;
    return { ok: false, diagnostic: diagnostic(ADAPTER_FEEDBACK.lintFailed, "error", message, code) };
  }
}

export const hasError = (diagnostics: readonly LintDiagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");
