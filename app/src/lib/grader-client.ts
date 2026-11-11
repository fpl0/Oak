// The app's one browser GraderHost (interfaces §8): a module Web Worker running the shared headless grader, used
// for live analysis (roll, staff) and in-browser checks. Created lazily with the toolbox from content, so the
// worker and its Strudel realm load only when a page first needs them.

import type { GradeResult, LintContext, LintResult } from "@oak/api";
import type { EvalOptions, EvalResult, GradeRequest, GraderHost } from "@oak/grader";
import { createBrowserGraderHost } from "@oak/grader/host/browser";
import GraderWorker from "@oak/grader/worker?worker";
import { loadContent } from "./content.ts";

let host: Promise<GraderHost> | null = null;

/** The shared host; boots on first call. */
export function graderHost(): Promise<GraderHost> {
  host ??= loadContent().then((content) =>
    createBrowserGraderHost({
      toolbox: content.toolbox,
      spawn: () => new GraderWorker({ name: "oak-grader" }),
    }),
  );
  return host;
}

export async function analyzeCode(
  code: string,
  opts: EvalOptions,
  signal?: AbortSignal,
): Promise<EvalResult> {
  return (await graderHost()).analyze(code, opts, signal);
}

export async function gradeInBrowser(req: GradeRequest, signal?: AbortSignal): Promise<GradeResult> {
  return (await graderHost()).grade(req, signal);
}

export async function lintInBrowser(code: string, ctx: LintContext): Promise<LintResult> {
  return (await graderHost()).lint(code, ctx);
}

/** Tears the worker down (tests, hot reload). */
export async function disposeGraderHost(): Promise<void> {
  const h = host;
  host = null;
  if (h) await (await h).dispose();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void disposeGraderHost();
  });
}
