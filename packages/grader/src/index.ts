// @oak/grader: the shared headless grader. One module graph runs in three hosts: a browser module
// Worker (./host/browser.dom.ts), a Bun Worker and a Bun subprocess (./host/bun.bun.ts). The only Strudel
// packages it may import are @strudel/core, mini, tonal and transpiler.
//
// Promote spikes/s1-grader (runtime.ts, lint.ts, protocol.ts, host.ts, worker.ts, proc.ts, watchdog.ts).
// Everything below is the binding public surface; bodies are filled in by the grader builders.
import type {
  AnalysisSummary,
  Diagnostic,
  DrumRole,
  FeedbackId,
  GradeResult,
  KeySpec,
  Layer,
  LintContext,
  LintDiagnostic,
  LintResult,
  Matcher,
  Md,
  MeterId,
  NEvent,
  ParamValues,
  RubricRule,
  TargetSelector,
  ToolEntry,
  TrackRef,
} from "@oak/content-kit";
import type {
  CompareRequest,
  EvalOptions,
  EvalResult,
  FeedbackTemplate,
  GradeContext,
  GradeRequest,
  GraderInit,
  GraderReady,
  MatchResult,
  NormalizeContext,
  Normalized,
  SectionInfo,
  TutorEvalView,
} from "./types.ts";

export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/grader: ${name} is not implemented yet`);
}

// --- realm (call inside a worker, a subprocess, or directly in tests and content CI) -------------

/**
 * Sets the realm up once: evalScope(core, mini without its SyntaxError, tonal, repl stubs), the `.p`
 * collector with repl.mjs 1.2.6 semantics, identity stubs for the visual methods, the `_oakChord`
 * voicing shim, `.cpm()` re-registered against the captured cps, console capture, the fuel meter and a
 * snapshot for healing. With `lockdown` it then captures `Function` and disables code generation from
 * strings. Order matters (docs/spikes.md, s1 "realm setup").
 */
export function initRealm(init: Omit<GraderInit, "kind">): Promise<GraderReady> {
  return todo(`initRealm(lockdown=${init.lockdown})`);
}
/**
 * Lint, evaluate and query. State is reset before every call (`resetVoicings()`, `useRNG('legacy')`,
 * cleared label map and cps, a unique logger line) and the realm is healed after it. Never throws for a
 * problem in `code`: lint errors, syntax errors, query errors, too many events and silence come back as
 * `{ ok: false }` or as diagnostics.
 */
export function evaluateForGrading(code: string, opts: EvalOptions): Promise<EvalResult> {
  return todo(`evaluateForGrading(${code.length} chars, ${opts.mode})`);
}
/** Raw events to `NEvent`s: exact rationals, pitch precedence, drum roles, gain, deterministic IDs, role inference. */
export function normalize(result: Extract<EvalResult, { ok: true }>, ctx: NormalizeContext): Normalized {
  return todo(`normalize(${result.events.length} events, ${ctx.meter})`);
}
/** Grades one response. Dispatches by exercise kind; code kinds run lint → constraints → eval → normalize → match → rubric. */
export function gradeExercise(req: GradeRequest): Promise<GradeResult> {
  return todo(`gradeExercise(${req.ctx.exerciseGlobalId})`);
}
/** `compare_haps`: the learner's code against an exercise's reference or against other code. */
export function compareCode(req: CompareRequest): Promise<GradeResult> {
  return todo(`compareCode(${req.mode})`);
}
/** How many bars a code answer is queried for in `lesson` mode: `min(64, max(reference.bars, min(16, periodOf(answer))))`. */
export function barsToQuery(mode: GradeContext["mode"], referenceBars: number, answerPeriod: number): number {
  return todo(`barsToQuery(${mode}, ${referenceBars}, ${answerPeriod})`);
}

// --- lint (contracts §3.3, §11.3) ---------------------------------------------------------------

/**
 * The one toolbox-aware lint pass, used by the CM6 editor, every grader host, content CI and the tutor's
 * card validator. Walks: syntax and safety, call identifiers, string arguments by callee, mini-notation,
 * labels and tempo, dialect rules. Pure and synchronous: safe on the main thread.
 */
export function lintOak(code: string, ctx: LintContext, toolbox: readonly ToolEntry[]): LintResult {
  return todo(`lintOak(${code.length} chars, ${ctx.profile}, ${toolbox.length} tools)`);
}
/** The base safety profile alone (all code, including the learner's own typing). */
export function lintBase(code: string): LintDiagnostic[] {
  return todo(`lintBase(${code.length} chars)`);
}
/** The strict profile (code the learner did not type). A snippet that fails it is never evaluated anywhere. */
export function lintStrict(code: string): LintDiagnostic[] {
  return todo(`lintStrict(${code.length} chars)`);
}
/** Maps every callee, method name, sound, scale, chord symbol and mini operator in `code` to a toolbox ID. */
export function toolsUsed(
  code: string,
  toolbox: readonly ToolEntry[],
): { id: string; range: { from: number; to: number } }[] {
  return todo(`toolsUsed(${code.length} chars, ${toolbox.length} tools)`);
}

// --- feedback catalog ---------------------------------------------------------------------------

/** The registry of feedback codes: exercises §2.6 plus the additions of contracts §5.7. Source of truth for `FeedbackId`. */
export const FEEDBACK_CATALOG: Readonly<Record<string, FeedbackTemplate>> = {};
/** Renders a diagnostic with its catalog template, or the exercise's override text. Deterministic. */
export function renderFeedback(d: Diagnostic, overrides?: Partial<Record<FeedbackId, Md>>): string {
  return todo(`renderFeedback(${d.id}, ${overrides ? "overrides" : "catalog"})`);
}

// --- analysis shared with the app, the notation engine and the tutor -----------------------------

/** Role resolution of contracts §6.2: fixed labels first, then `inferRoles` on the rest. */
export function inferRoles(
  byTrack: Record<string, NEvent[]>,
): Partial<Record<Exclude<Layer, "all">, string>> {
  return todo(`inferRoles(${Object.keys(byTrack).length} tracks)`);
}
/** Events a `TrackRef` selects: a label, '*', '@role' or 'band.<label>'. */
export function selectTrack(n: Normalized, ref: TrackRef): NEvent[] {
  return todo(`selectTrack(${n.all.length}, ${ref})`);
}
/** Resolves a predicate target at grade time: the selected events, whose `locs` and IDs are the accepted click targets. */
export function resolveTarget(n: Normalized, selector: TargetSelector, ctx: NormalizeContext): NEvent[] {
  return todo(`resolveTarget(${n.all.length}, ${JSON.stringify(selector)}, ${ctx.meter})`);
}
export function drumRole(s: string, bank?: string): DrumRole | null {
  return todo(`drumRole(${s}, ${bank})`);
}
/** Smallest number of bars after which the events repeat, up to `maxBars`. */
export function periodOf(events: readonly NEvent[], maxBars: number): number {
  return todo(`periodOf(${events.length}, ${maxBars})`);
}
/**
 * Sections of a piece written with one `arrange()` per labelled track (contracts §6.3). `null` when no
 * track is arranged; throws nothing: disagreement between tracks is reported as `{ inconsistent }`.
 */
export function sectionsFromAst(
  code: string,
):
  | { sections: SectionInfo[]; totalBars: number }
  | { inconsistent: { track: string; detail: string } }
  | null {
  return todo(`sectionsFromAst(${code.length} chars)`);
}
/** The deterministic summary a compose or transcribe result carries, and liner notes are written from. */
export function analyzePiece(n: Normalized, ctx: NormalizeContext & { code: string }): AnalysisSummary {
  return todo(`analyzePiece(${n.all.length}, ${ctx.meter})`);
}
/** Deterministic liner notes from the analysis and the satisfied rules: the fallback when the tutor is off. */
export function linerNotes(
  analysis: AnalysisSummary,
  result: GradeResult,
  extra?: { band?: string; lockedTools?: string[]; attribution?: string },
): string {
  return todo(`linerNotes(${analysis.bars}, ${result.status}, ${extra?.band})`);
}
/** Straightens swung onsets back to the grid: subtracts `amount / 2 × slot` from each off-beat onset, durations untouched (contracts §6.10 item 6). */
export function straighten(
  events: readonly NEvent[],
  swing: { subdivision: 8 | 16; amount: number },
  meter: MeterId,
): NEvent[] {
  return todo(`straighten(${events.length}, ${swing.subdivision}, ${meter})`);
}
export function keyEstimate(events: readonly NEvent[]): { key: KeySpec; r: number }[] {
  return todo(`keyEstimate(${events.length})`);
}

// --- matchers (also usable directly, on events the caller already has) ---------------------------

/** Runs a content `Matcher` on reference and answer events. */
export function runMatcher(
  matcher: Matcher,
  reference: Normalized,
  answer: Normalized,
  ctx: NormalizeContext,
): MatchResult {
  return todo(`runMatcher(${matcher.m}, ${reference.all.length}, ${answer.all.length}, ${ctx.meter})`);
}
/** Evaluates rubric rules on a piece. Numeric rules return `{ ok, value, target }` with partial credit `min(1, value / target)`. */
export function runRubric(
  rules: readonly RubricRule[],
  n: Normalized,
  ctx: NormalizeContext & { code: string; params: ParamValues },
): NonNullable<GradeResult["rubric"]> {
  return todo(`runRubric(${rules.length}, ${n.all.length}, ${ctx.meter})`);
}

// --- views for the tutor ------------------------------------------------------------------------

/** `evaluate_strudel` output (≤ 64 events per track), before redaction. */
export function toTutorEvalView(result: EvalResult, ctx: NormalizeContext): TutorEvalView {
  return todo(`toTutorEvalView(${result.ok}, ${ctx.meter})`);
}
