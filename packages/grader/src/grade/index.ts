// `grade`: one response to one exercise → a GradeResult (contracts §5.7, §6). Dispatches every exercise
// kind of @oak/content-kit. Code kinds run lint → constraints → eval → normalize → match → rubric; answer
// kinds compare normalized answers; performance kinds wrap the @oak/pitch result. The realm (evaluation
// and normalization) is injected, so the same pipeline runs in a Worker, a subprocess or a test.
import type {
  AstConstraint,
  CodeRange,
  Diagnostic,
  Exercise,
  ExerciseOf,
  GradeResult,
  GradeStatus,
  InvestigateQ,
  KeySpec,
  Matcher,
  NEvent,
  Reference,
  RubricRule,
} from "@oak/content-kit";
import {
  adjustScore,
  BY_EAR_PITCH,
  DEFAULT_PASS,
  R,
  rat,
  stripMarkers,
  substituteParams,
} from "@oak/content-kit";
import { intervalOf, labelPitch, romanOf, scalePcs, spellMidi, triadCore } from "@oak/theory";
import { romanText } from "../analyze/chords.ts";
import { firstBars, mod12 } from "../analyze/events.ts";
import { keyOf } from "../analyze/key.ts";
import { degreeSequence, melodyLine } from "../analyze/melody.ts";
import { analyzePiece } from "../analyze/piece.ts";
import { arrangedTotal, sectionsFromAst } from "../analyze/sections.ts";
import { normalizedFromEvents, periodOf, resolveTarget, selectTrack } from "../analyze/tracks.ts";
import { diag, messagesOf, sortDiagnostics } from "../feedback/catalog.ts";
import { miniErrorDetail } from "../lint/mini.ts";
import { slotsOf } from "../match/harmony.ts";
import { runMatcher } from "../match/index.ts";
import { melodyEvents } from "../match/melody.ts";
import type { PerformanceResult } from "../perf/index.ts";
import { performancePasses } from "../perf/index.ts";
import type { RubricContext } from "../rubric/context.ts";
import { evaluateRubric } from "../rubric/index.ts";
import { pieceBars } from "../rubric/rules.ts";
import { barsToQuery } from "../runtime/caps.ts";
import type {
  EvalOptions,
  EvalResult,
  EvalSuccess,
  ExerciseResponse,
  GradeContext,
  GradeRequest,
  MatchResult,
  NormalizeContext,
  Normalized,
} from "../types.ts";
import { MODE_LIMITS } from "../types.ts";
import type { AnswerCheck } from "./answers.ts";
import {
  foldRefined,
  gradeAnswer,
  keyboardCheck,
  keySignatureCheck,
  qualitySlots,
  rnSlots,
  spelledNotes,
  staffName,
} from "./answers.ts";
import type { ConstraintRow } from "./constraints.ts";
import { checkConstraints } from "./constraints.ts";
import { judgeSungPattern } from "./sing.ts";
import { refineStaffResult } from "./staff.ts";
import { staffChordsCheck } from "./staff-chords.ts";

/** What the pipeline needs from the realm. `evaluateForGrading` and `normalize` in production. */
export interface GradeDeps {
  evaluate(code: string, opts: EvalOptions): Promise<EvalResult>;
  normalize(result: EvalSuccess, ctx: NormalizeContext): Normalized;
  /** The lint's `toolsUsed`, so `must-use` and `uses` resolve toolbox IDs exactly. */
  toolsUsed?: (code: string) => { id: string }[];
  /** A toolbox entry's code form (`ToolEntry.code`), so messages name a tool as the learner writes it. */
  toolCode?: (id: string) => string | null;
  /** Replaces the built-in constraint checker (the lint package's AST-exact one). */
  checkConstraints?: (
    constraints: readonly AstConstraint[],
    input: Parameters<typeof checkConstraints>[1],
  ) => ConstraintRow[];
}

// --- result assembly ----------------------------------------------------------------------------

interface Partial0 {
  status?: GradeStatus;
  score: number;
  pass?: boolean;
  dims?: GradeResult["dims"];
  diagnostics?: Diagnostic[];
  constraints?: GradeResult["constraints"];
  rubric?: GradeResult["rubric"];
  overlay?: GradeResult["overlay"];
  eval?: GradeResult["eval"];
  analysis?: GradeResult["analysis"];
  modality?: GradeResult["modality"];
}

function passThreshold(ex: Exercise): number | null {
  return ex.pass ?? DEFAULT_PASS[ex.kind];
}

function finish(ex: Exercise, ctx: GradeContext, p: Partial0): GradeResult {
  const threshold = passThreshold(ex);
  const score = Math.max(0, Math.min(1, Number.isFinite(p.score) ? p.score : 0));
  let status: GradeStatus =
    p.status ?? (threshold === null ? "ungraded" : (p.pass ?? score >= threshold - 1e-9) ? "pass" : "fail");
  if (status === "pass" && p.pass === false) status = "fail";
  const ds = [...(p.diagnostics ?? [])];
  if (status === "pass") {
    const polish = ds.filter((d) => d.severity === "warn" || d.severity === "error").length;
    ds.push(
      polish === 0 && score >= 1 - 1e-9
        ? diag("pass.perfect")
        : diag("pass.close", { n: Math.max(1, polish) }),
    );
  }
  const diagnostics = sortDiagnostics(ds);
  return {
    exerciseId: ctx.exerciseGlobalId,
    exerciseVersion: ex.version,
    attemptNo: ctx.attemptNo,
    firstAttempt: ctx.firstAttempt,
    mode: ctx.mode,
    status,
    score,
    adjustedScore:
      status === "error" || status === "ungraded" ? 0 : adjustScore(score, ctx.rung, ctx.extraReplays),
    dims: p.dims ?? {},
    constraints: p.constraints ?? [],
    ...(p.rubric ? { rubric: p.rubric } : {}),
    diagnostics,
    messages: messagesOf(diagnostics, ex.feedbackText),
    assist: {
      rung: ctx.rung,
      tutorHints: ctx.tutorHints,
      extraReplays: ctx.extraReplays,
      revealed: ctx.rung === 4,
    },
    ...(Object.keys(ctx.params).length ? { params: ctx.params } : {}),
    ...(p.modality ? { modality: p.modality } : {}),
    ...(p.eval ? { eval: p.eval } : {}),
    ...(p.analysis ? { analysis: p.analysis } : {}),
    ...(p.overlay ? { overlay: p.overlay } : {}),
  };
}

const errorResult = (ex: Exercise, ctx: GradeContext, diagnostics: Diagnostic[]): GradeResult =>
  finish(ex, ctx, { status: "error", score: 0, diagnostics });

/** Diagnostics of a failed evaluation (lint errors keep their own codes and code ranges). */
export function evalFailureDiagnostics(res: Extract<EvalResult, { ok: false }>, bars: number): Diagnostic[] {
  const e = res.error;
  switch (e.kind) {
    case "lint":
      return (e.lint ?? res.lint?.diagnostics ?? []).map((l) => ({
        id: l.id,
        severity: l.severity,
        params: l.params,
        where: { code: [l.range] },
      }));
    case "eval": {
      const mini = /mini|pattern|parse/i.test(e.message) && !/SyntaxError|Unexpected token/i.test(e.message);
      return [
        diag(mini ? "eval.mini-parse" : "eval.syntax", {
          line: e.line ?? 1,
          detail: mini ? miniErrorDetail(e.message) : e.message,
        }),
      ];
    }
    case "query":
      return [diag("eval.query", { fn: "The pattern", detail: e.message })];
    case "not-a-pattern":
      return [diag("eval.not-a-pattern")];
    case "too-many-events":
      return [diag("eval.too-many-events", { n: /\d+/.exec(e.message)?.[0] ?? "too many", bars })];
    case "too-much-work":
      return [diag("eval.too-much-work")];
    case "timeout":
      return [diag("eval.timeout", { ms: /\d+/.exec(e.message)?.[0] ?? "1500" })];
    default:
      return [diag("eval.crashed")];
  }
}
const evalSummary = (r: EvalSuccess): NonNullable<GradeResult["eval"]> => ({
  ms: r.ms,
  cps: r.cps,
  bpm: r.bpm,
  bars: r.bars,
  tracks: r.tracks,
  logs: r.logs.map((l) => ({ level: l.level, text: l.tag ? `[${l.tag}] ${l.message}` : l.message })),
  truncated: r.truncated,
});
const lintNotes = (r: EvalSuccess): Diagnostic[] =>
  r.diagnostics.filter((d) => d.severity !== "error" || d.id.startsWith("code."));

const nctx = (ex: Exercise, ctx: GradeContext): NormalizeContext => ({
  meter: ex.meter ?? ctx.meter,
  key: ex.key ?? ctx.key,
  ...((ex.swing ?? ctx.swing)
    ? { swing: (ex.swing ?? ctx.swing) as NonNullable<GradeContext["swing"]> }
    : {}),
  ...((ex.pickup ?? ctx.pickup)
    ? { pickup: (ex.pickup ?? ctx.pickup) as NonNullable<GradeContext["pickup"]> }
    : {}),
});

// --- evaluation helpers -------------------------------------------------------------------------

interface Evaluated {
  res: EvalSuccess;
  n: Normalized;
}
async function evaluateCode(
  deps: GradeDeps,
  code: string,
  bars: number,
  ex: Exercise,
  ctx: GradeContext,
  trusted: boolean,
): Promise<{ ok: true; ev: Evaluated } | { ok: false; diagnostics: Diagnostic[] }> {
  const nc = nctx(ex, ctx);
  const res = await deps.evaluate(code, {
    mode: ctx.mode,
    bars,
    lint: trusted ? null : ctx.lint,
    meter: nc.meter,
    ...(ctx.band && !trusted ? { band: ctx.band } : {}),
  });
  if (!res.ok) return { ok: false, diagnostics: evalFailureDiagnostics(res, bars) };
  return { ok: true, ev: { res, n: deps.normalize(res, nc) } };
}
/** The reference is content: a failure there is a content bug and throws. */
async function evaluateReference(
  deps: GradeDeps,
  code: string,
  bars: number,
  ex: Exercise,
  ctx: GradeContext,
): Promise<Evaluated> {
  const r = await evaluateCode(deps, code, bars, ex, ctx, true);
  if (!r.ok)
    throw new Error(
      `@oak/grader: the reference of ${ctx.exerciseGlobalId} does not evaluate: ${r.diagnostics.map((d) => d.id).join(", ")}`,
    );
  return r.ev;
}

/** A `Normalized` restricted to cycles [0, bars). */
function window(n: Normalized, bars: number): Normalized {
  const keep = (ev: readonly NEvent[]): NEvent[] => firstBars(ev, bars);
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = keep(ev);
  return { ...n, byTrack, all: keep(n.all), band: keep(n.band) };
}

// --- code kinds ---------------------------------------------------------------------------------

interface CodeSpecLite {
  code: string;
  starter: string;
  reference?: Reference;
  matcher?: Matcher;
  constraints?: readonly AstConstraint[];
  requireChange?: boolean;
  /** By-ear steps: the matcher reports like a transcription teacher (`MelodyReportOptions`). */
  transcription?: boolean;
}

/** Grades code against a reference with a matcher (code-modify, code-fill, error-hunt fix, transcribe). */
async function gradeAgainstReference(
  ex: Exercise,
  ctx: GradeContext,
  deps: GradeDeps,
  spec: CodeSpecLite,
): Promise<GradeResult> {
  const clean = stripMarkers(spec.starter).code;
  if (spec.requireChange && clean.trim() === spec.code.trim())
    return finish(ex, ctx, { score: 0, pass: false, diagnostics: [diag("code.unchanged")] });
  const ref = spec.reference as Reference;
  const matcher = spec.matcher as Matcher;
  const cap = MODE_LIMITS[ctx.mode].maxBars;
  const probeBars = Math.min(cap, Math.max(ref.bars, ctx.mode === "lesson" ? 16 : ref.bars));
  const answer = await evaluateCode(deps, spec.code, probeBars, ex, ctx, false);
  if (!answer.ok) return errorResult(ex, ctx, answer.diagnostics);
  const { res, n: nAll } = answer.ev;
  const period = periodOf(nAll.all, MODE_LIMITS[ctx.mode].periodCap, probeBars);
  const bars = barsToQuery(ctx.mode, ref.bars, period);
  const nAns = ctx.window ? onsetWindow(window(nAll, bars), ctx.window) : window(nAll, bars);
  const nc = nctx(ex, ctx);
  const constraintRows = runConstraints(spec.constraints ?? [], spec, ctx, deps, res);
  const extra = lintNotes(res);
  if (nAns.all.length === 0)
    return finish(ex, ctx, {
      score: 0,
      pass: false,
      diagnostics: [...extra, diag("eval.silent", { bars: Math.max(1, ref.bars) })],
      constraints: constraintRows,
      eval: evalSummary(res),
    });

  let best: MatchResult | null = null;
  for (const solution of ref.solutions) {
    const refEv = await evaluateReference(deps, solution, bars, ex, ctx);
    const rctx: NormalizeContext & Partial<RubricContext> = {
      ...nc,
      code: spec.code,
      params: ctx.params,
      bars,
      ...(deps.toolsUsed ? { toolsUsed: deps.toolsUsed } : {}),
      ...(deps.toolCode ? { toolCode: deps.toolCode } : {}),
      ...(spec.transcription ? { transcription: true } : {}),
    };
    const refN = ctx.window ? onsetWindow(refEv.n, ctx.window) : refEv.n;
    const m = runMatcher(matcher, scoped(refN, ref), scoped(nAns, ref), rctx);
    if (!best || m.score > best.score) best = m;
    if (m.score >= 1) break;
  }
  const m = best as MatchResult;
  return foldCode(ex, ctx, m, constraintRows, extra, res);
}
/** Events with an onset in `[from, to)` cycles (a phrase window, `GradeContext.window`). */
function onsetWindow(
  n: Normalized,
  w: { from: import("@oak/content-kit").Rat; to: import("@oak/content-kit").Rat },
): Normalized {
  const keep = (ev: readonly NEvent[]): NEvent[] =>
    ev.filter((e) => R.lte(w.from, e.onset) && R.lt(e.onset, w.to));
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = keep(ev);
  return { ...n, byTrack, all: keep(n.all), band: keep(n.band) };
}
/** `Reference.tracks` limits what both sides are graded on (default '*'). */
function scoped(n: Normalized, ref: Reference): Normalized {
  if (!ref.tracks || ref.tracks.length === 0) return n;
  const keep = new Set(ref.tracks.flatMap((t) => selectTrack(n, t)).map((e) => e.id));
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = ev.filter((e) => keep.has(e.id));
  return { ...n, byTrack, all: n.all.filter((e) => keep.has(e.id)) };
}
function runConstraints(
  constraints: readonly AstConstraint[],
  spec: CodeSpecLite,
  ctx: GradeContext,
  deps: GradeDeps,
  res: EvalSuccess,
): ConstraintRow[] {
  if (constraints.length === 0) return [];
  const input = {
    code: spec.code,
    starter: spec.starter,
    params: ctx.params,
    meter: ctx.meter,
    bpm: res.bpm,
    cpsSet: res.cpsSet,
    tracks: res.tracks,
    ...(deps.toolsUsed ? { toolsUsed: deps.toolsUsed } : {}),
    ...(deps.toolCode ? { toolCode: deps.toolCode } : {}),
  };
  return (deps.checkConstraints ?? checkConstraints)(constraints, input);
}
function foldCode(
  ex: Exercise,
  ctx: GradeContext,
  m: MatchResult,
  rows: ConstraintRow[],
  extra: Diagnostic[],
  res: EvalSuccess,
): GradeResult {
  const failed = rows.filter((r) => !r.ok);
  const dims = { ...m.dims };
  let score = m.score;
  if (rows.length > 0) {
    const share = (rows.length - failed.length) / rows.length;
    dims.constraints = { score: share, weight: 0, n: rows.length };
    if (failed.length) score *= 0.5 + 0.5 * share;
  }
  // Every member of an `all` matcher must pass as well as their mean (content-kit `Matcher`): below the mark,
  // the weakest member is the score, so a failed attempt never reports a passing score (the voicing gate
  // reads the score, contracts §3.1 rule 6).
  const mark = (passThreshold(ex) ?? 1) - 1e-9;
  if (m.floor !== undefined && m.floor < mark) score = Math.min(score, m.floor);
  return finish(ex, ctx, {
    score,
    pass: failed.length === 0 && score >= mark,
    dims,
    diagnostics: [...extra, ...failed.map((r) => r.diag as Diagnostic), ...m.diagnostics],
    constraints: rows,
    ...(m.overlay ? { overlay: m.overlay } : {}),
    eval: evalSummary(res),
  });
}

/** The blank values of a starter that produce `solution` (for `fill.blank-wrong`), or null. */
export function blanksOfSolution(starter: string, solution: string): Record<string, string> | null {
  const { code, blanks } = stripMarkers(starter);
  if (blanks.length === 0) return {};
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let pattern = "^";
  let last = 0;
  for (const b of blanks) {
    pattern += `${esc(code.slice(last, b.at))}([\\s\\S]*?)`;
    last = b.at;
  }
  pattern += `${esc(code.slice(last))}$`;
  const m = new RegExp(pattern).exec(solution);
  if (!m) return null;
  return Object.fromEntries(blanks.map((b, i) => [b.id, (m[i + 1] as string).trim()]));
}

async function gradeCodeFill(
  ex: ExerciseOf<"code-fill">,
  ctx: GradeContext,
  deps: GradeDeps,
  blanks: Record<string, string>,
): Promise<GradeResult> {
  const { blanks: marks } = stripMarkers(ex.code.starter);
  const empty = marks.filter((b) => !(blanks[b.id] ?? "").trim());
  if (empty.length > 0)
    return finish(ex, ctx, {
      score: 0,
      pass: false,
      diagnostics: empty.map((b) => diag("fill.blank-empty", {}, { blank: b.id })),
    });
  const values = Object.fromEntries(marks.map((b) => [b.id, blanks[b.id] as string]));
  let code = stripMarkers(ex.code.starter).code;
  for (const b of [...marks].sort((x, y) => y.at - x.at))
    code = code.slice(0, b.at) + values[b.id] + code.slice(b.at);
  const r = await gradeAgainstReference(ex, ctx, deps, {
    code,
    starter: ex.code.starter,
    reference: ex.reference,
    matcher: ex.matcher,
  });
  if (r.status !== "fail") return r;
  // Name the blanks that differ from every solution's blank values.
  const expected = ex.reference.solutions
    .map((s) => blanksOfSolution(ex.code.starter, s))
    .filter((x): x is Record<string, string> => !!x);
  const squash = (s: string): string => s.replace(/\s+/g, "").replace(/'/g, '"');
  const wrong = marks.filter(
    (b) => expected.length > 0 && expected.every((e) => squash(e[b.id] ?? "") !== squash(values[b.id] ?? "")),
  );
  const ds = [...wrong.map((b) => diag("fill.blank-wrong", {}, { blank: b.id })), ...r.diagnostics];
  return {
    ...r,
    diagnostics: sortDiagnostics(ds),
    messages: messagesOf(sortDiagnostics(ds), ex.feedbackText),
  };
}

/** Token-diff ranges between a starter and the solution: where the bug is (error-hunt default). */
export function diffRanges(before: string, after: string): CodeRange[] {
  const tok = (s: string): { t: string; from: number; to: number }[] =>
    [...s.matchAll(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g)].map((m) => ({
      t: m[0],
      from: m.index as number,
      to: (m.index as number) + m[0].length,
    }));
  const a = tok(before);
  const b = tok(after);
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      (L[i] as number[])[j] =
        a[i]?.t === b[j]?.t
          ? ((L[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((L[i + 1] as number[])[j] as number, (L[i] as number[])[j + 1] as number);
  const changed: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]?.t === b[j]?.t) {
      i++;
      j++;
    } else if (((L[i + 1] as number[])[j + 1] as number) === ((L[i] as number[])[j] as number)) {
      // A substitution keeps the common subsequence: the token itself changed.
      changed.push(i++);
      j++;
    } else if (((L[i + 1] as number[])[j] as number) >= ((L[i] as number[])[j + 1] as number))
      changed.push(i++);
    else {
      // An insertion: mark the token it goes before (or after, at the end).
      changed.push(Math.min(i, a.length - 1));
      j++;
    }
  }
  while (i < a.length) changed.push(i++);
  if (j < b.length && a.length) changed.push(a.length - 1);
  const ranges: CodeRange[] = [];
  for (const k of [...new Set(changed)].sort((x, y) => x - y)) {
    const t = a[k];
    if (!t) continue;
    const last = ranges[ranges.length - 1];
    if (last && t.from - last.to <= 1) last.to = t.to;
    else ranges.push({ from: t.from, to: t.to });
  }
  return ranges;
}
const overlaps = (a: CodeRange, b: CodeRange): boolean => a.from < b.to && b.from < a.to;

async function gradeErrorHunt(
  ex: ExerciseOf<"error-hunt">,
  ctx: GradeContext,
  deps: GradeDeps,
  resp: { clicks: (CodeRange | string)[]; code?: string },
): Promise<GradeResult> {
  const clean = stripMarkers(ex.code.starter).code;
  const bugs = ex.bugs ?? diffRanges(clean, ex.reference.solutions[0] ?? clean);
  // Event clicks (staff, roll) and bar clicks are resolved on the evaluated starter.
  let bugIds = new Set<string>();
  let bugBars = new Set<number>();
  if (resp.clicks.some((c) => typeof c === "string")) {
    const ev = await evaluateReference(deps, clean, ex.reference.bars, ex, ctx);
    const sol = await evaluateReference(deps, ex.reference.solutions[0] ?? clean, ex.reference.bars, ex, ctx);
    bugIds = new Set(
      ev.n.all.filter((e) => e.locs.some((l) => bugs.some((b) => overlaps(l, b)))).map((e) => e.id),
    );
    const sig = (n: Normalized, b: number): string =>
      n.all
        .filter((e) => R.floor(e.onset) === b)
        .map((e) => `${R.str(e.onset)}|${e.midi}|${e.s ?? ""}|${e.chordSymbol ?? ""}`)
        .sort()
        .join(";");
    bugBars = new Set(
      Array.from({ length: ex.reference.bars }, (_, b) => b)
        .filter((b) => sig(ev.n, b) !== sig(sol.n, b))
        .map((b) => b + 1),
    );
    for (const e of ev.n.all) if (bugIds.has(e.id)) bugBars.add(R.floor(e.onset) + 1);
  }
  const hit = (c: CodeRange | string): boolean => {
    if (typeof c !== "string") return bugs.some((b) => overlaps(c, b));
    if (/^\d+$/.test(c)) return bugBars.has(Number(c));
    return bugIds.has(c);
  };
  const firstHit = resp.clicks.findIndex(hit);
  const locate = firstHit === 0 ? 1 : firstHit > 0 ? 0.5 : 0;
  const ds: Diagnostic[] = [];
  for (const c of resp.clicks.slice(0, firstHit < 0 ? resp.clicks.length : firstHit)) {
    const where =
      typeof c === "string" ? (/^\d+$/.test(c) ? { bar: Number(c) } : { noteIds: [c] }) : { code: [c] };
    ds.push(diag("hunt.not-here", {}, where, "locate"));
  }
  if (firstHit >= 0) ds.push(diag("hunt.found", {}, undefined, "locate"));
  let fix: GradeResult | null = null;
  if (resp.code !== undefined)
    fix = await gradeAgainstReference(ex, ctx, deps, {
      code: resp.code,
      starter: ex.code.starter,
      reference: ex.reference,
      matcher: ex.matcher,
      requireChange: true,
    });
  if (fix?.status === "error") return fix;
  const fixScore = fix?.score ?? 0;
  const score = 0.4 * locate + 0.6 * fixScore;
  return finish(ex, ctx, {
    score,
    pass: locate > 0 && fix?.status === "pass",
    dims: {
      locate: { score: locate, weight: 0.4 },
      fix: { score: fixScore, weight: 0.6 },
      ...(fix?.dims ?? {}),
    },
    diagnostics: [
      ...ds,
      ...(fix?.diagnostics.filter((d) => d.id !== "pass.perfect" && d.id !== "pass.close") ?? []),
    ],
    constraints: fix?.constraints ?? [],
    ...(fix?.overlay ? { overlay: fix.overlay } : {}),
    ...(fix?.eval ? { eval: fix.eval } : {}),
  });
}

/** Make and compose: rubric on the learner's own piece (contracts §6.5, §6.6). */
async function gradeRubricPiece(
  ex: ExerciseOf<"code-make"> | ExerciseOf<"compose-brief">,
  ctx: GradeContext,
  deps: GradeDeps,
  code: string,
): Promise<GradeResult> {
  const ast = sectionsFromAst(code);
  const astTotal = arrangedTotal(ast);
  const cap = MODE_LIMITS[ctx.mode].maxBars;
  const want = ex.kind === "code-make" ? ex.bars[1] : 16;
  const bars = Math.min(cap, Math.max(want, astTotal ?? Math.min(cap, ctx.mode === "capstone" ? 64 : 16)));
  const answer = await evaluateCode(deps, code, bars, ex, ctx, false);
  if (!answer.ok) return errorResult(ex, ctx, answer.diagnostics);
  const { res, n } = answer.ev;
  const nc = nctx(ex, ctx);
  const extra = lintNotes(res);
  const totalBars = astTotal ?? res.totalBars ?? periodOf(n.all, MODE_LIMITS[ctx.mode].periodCap, bars);
  if (n.all.length === 0)
    return finish(ex, ctx, {
      score: 0,
      pass: false,
      diagnostics: [...extra, diag("make.silent"), diag("eval.silent", { bars })],
      eval: evalSummary(res),
    });
  const rules: RubricRule[] = [...ex.rubric];
  if (ex.kind === "compose-brief" && ex.minDurationSec !== undefined)
    rules.push({
      id: "min-duration",
      label: `At least ${ex.minDurationSec} s long`,
      required: true,
      skills: [],
      rule: "duration-sec",
      min: ex.minDurationSec,
    });
  // References of `matches` rules are evaluated first, so the rubric itself stays synchronous.
  const refs = new Map<Reference, Normalized>();
  for (const r of rules)
    if (r.rule === "matches" && !refs.has(r.reference))
      refs.set(
        r.reference,
        (await evaluateReference(deps, r.reference.solutions[0] ?? "", r.reference.bars, ex, ctx)).n,
      );
  const rctx: RubricContext = {
    ...nc,
    code,
    params: ctx.params,
    bars,
    totalBars,
    ...(deps.toolsUsed ? { toolsUsed: deps.toolsUsed } : {}),
    ...(deps.toolCode ? { toolCode: deps.toolCode } : {}),
    ...(ctx.profile ? { profile: ctx.profile } : {}),
    resolveReference: (ref) => refs.get(ref) ?? null,
  };
  const { rows, extra: ruleExtra, credits } = evaluateRubric(rules, n, rctx);
  const required = rows.map((r, i) => ({ r, c: credits[i] as number })).filter((x) => x.r.required);
  const requiredOk = required.every((x) => x.r.ok);
  const score =
    required.length === 0
      ? credits.length
        ? credits.reduce((a, b) => a + b, 0) / credits.length
        : 1
      : required.reduce((a, x) => a + x.c, 0) / required.length;
  const ds: Diagnostic[] = [...extra, ...rows.map((r) => r.diag as Diagnostic), ...ruleExtra];
  // A failing capstone written in another key than its brief's: say so first, since every rule above read it in
  // the brief's key ("chord 1 is iv" for a D-minor C4). Relative keys (one scale) are the same key here.
  const mismatch = !requiredOk && ex.kind === "compose-brief" ? keyMismatch(n, ctx.key ?? null) : null;
  if (mismatch) ds.unshift(diag("harmony.key-mismatch", mismatch));
  if (ex.kind === "code-make" && pieceBars(n, rctx) > ex.bars[1]) ds.push(diag("make.beyond-brief"));
  if (res.truncated) ds.push(diag("eval.truncated", { bars: res.bars }));
  const analysis = ex.kind === "compose-brief" ? analyzePiece(n, { ...nc, code, bars }) : undefined;
  return finish(ex, ctx, {
    score,
    pass: requiredOk,
    dims: { rubric: { score, weight: 1, n: rows.length } },
    diagnostics: ds,
    rubric: rows,
    eval: evalSummary(res),
    ...(analysis ? { analysis } : {}),
  });
}

/** The key a piece is heard in when its scale differs from the brief's (`null` when they agree or nothing reads). */
export function keyMismatch(n: Normalized, brief: KeySpec | null): { got: string; exp: string } | null {
  if (!brief || !/^(major|minor)$/.test(brief.mode)) return null;
  const heard = keyOf(
    n.all.filter((e) => !e.track.startsWith("band.")),
    null,
  );
  if (!heard) return null;
  const set = (k: KeySpec) => [...scalePcs(k)].sort((a, b) => a - b).join(",");
  if (set(heard) === set(brief)) return null;
  // Read the heard key in the brief's mode when its relative names the same scale (C major heard, minor brief).
  const shown =
    heard.mode !== brief.mode && heard.tonic !== brief.tonic ? (relativeOf(heard) ?? heard) : heard;
  return { got: `${shown.tonic} ${shown.mode}`, exp: `${brief.tonic} ${brief.mode}` };
}

const SHARP_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
function relativeOf(k: KeySpec): KeySpec | null {
  const pc = scalePcs(k)[0];
  if (pc === undefined) return null;
  if (k.mode === "major") return { tonic: SHARP_NAMES[(pc + 9) % 12] as string, mode: "minor" };
  if (k.mode === "minor") return { tonic: SHARP_NAMES[(pc + 3) % 12] as string, mode: "major" };
  return null;
}

// --- answer kinds -------------------------------------------------------------------------------

const answerFold = (
  ex: Exercise,
  ctx: GradeContext,
  a: AnswerCheck,
  extra: Partial0 = { score: 0 },
): GradeResult =>
  finish(ex, ctx, {
    ...extra,
    score: a.score,
    dims: a.dims,
    diagnostics: foldRefined(a.diagnostics, ex.feedbackText as Partial<Record<string, string>> | undefined),
  });

async function gradeInvestigate(
  ex: ExerciseOf<"run-investigate">,
  ctx: GradeContext,
  deps: GradeDeps,
  resp: ExerciseResponse,
): Promise<GradeResult> {
  if (ex.questions.length === 0) return finish(ex, ctx, { status: "ungraded", score: 1 });
  // One response per question; a single (non-`parts`) response answers every question it fits: an
  // `answer` carries `choice` and `number` together, a `click` answers the click question.
  const parts = "parts" in resp ? resp.parts : null;
  let evaluated: Evaluated | null = null;
  const checks: AnswerCheck[] = [];
  for (const [i, q] of ex.questions.entries()) {
    const r = parts ? (parts[i] ?? { skipped: true as const }) : resp;
    checks.push(await gradeQuestion(q, r, i));
  }
  async function gradeQuestion(q: InvestigateQ, r: ExerciseResponse, i: number): Promise<AnswerCheck> {
    const slot = { slot: i + 1 };
    if (q.q === "choice") {
      const got = "answer" in r ? (r.answer.choice ?? []) : [];
      const ok = got.length === q.correct.length && q.correct.every((c) => got.includes(c));
      return {
        score: ok ? 1 : 0,
        dims: {},
        diagnostics: ok ? [] : [diag("investigate.wrong", { exp: q.correct.join(", ") }, slot, "choice")],
        slots: [ok ? 1 : 0],
      };
    }
    if (q.q === "number") {
      const got = "answer" in r ? r.answer.number : undefined;
      const ok = got !== undefined && Math.abs(got - q.correct) <= (q.tol ?? 0) + 1e-9;
      return {
        score: ok ? 1 : 0,
        dims: {},
        diagnostics: ok ? [] : [diag("investigate.wrong", { exp: q.correct }, slot, "choice")],
        slots: [ok ? 1 : 0],
      };
    }
    if (!("click" in r))
      return {
        score: 0,
        dims: {},
        diagnostics: [diag("investigate.not-here", {}, slot, "locate")],
        slots: [0],
      };
    evaluated ??= await evaluateReference(deps, stripMarkers(ex.code.starter).code, 16, ex, ctx);
    const targets = resolveTarget(evaluated.n, q.target, nctx(ex, ctx));
    const c = r.click;
    const ok =
      typeof c === "string"
        ? targets.some((e) => e.id === c)
        : targets.some((e) => e.locs.some((l) => overlaps(l, c)));
    return {
      score: ok ? 1 : 0,
      dims: {},
      diagnostics: ok
        ? []
        : [
            diag(
              "investigate.not-here",
              {},
              { ...slot, ...(typeof c === "string" ? { noteIds: [c] } : { code: [c] }) },
              "locate",
            ),
          ],
      slots: [ok ? 1 : 0],
    };
  }
  const score = checks.reduce((a, c) => a + c.score, 0) / checks.length;
  return finish(ex, ctx, {
    score,
    dims: { choice: { score, weight: 1, n: checks.length } },
    diagnostics: checks.flatMap((c) => c.diagnostics),
  });
}

async function gradeParsons(
  ex: ExerciseOf<"parsons">,
  ctx: GradeContext,
  deps: GradeDeps,
  order: string[],
): Promise<GradeResult> {
  const ds: Diagnostic[] = [];
  const distractors = new Set((ex.distractors ?? []).map((b) => b.id));
  const used = order.filter((id) => distractors.has(id));
  if (used.length)
    ds.push(diag("parsons.distractor", {}, { slot: order.indexOf(used[0] as string) + 1 }, "order"));
  if (ex.accept.orders?.some((o) => o.length === order.length && o.every((id, i) => id === order[i])))
    return finish(ex, ctx, { score: 1, dims: { order: { score: 1, weight: 1 } } });
  const blocks = new Map([...ex.blocks, ...(ex.distractors ?? [])].map((b) => [b.id, b.text]));
  if (ex.accept.reference && ex.accept.matcher && used.length === 0) {
    const code = order.map((id) => blocks.get(id) ?? "").join(ex.assemble === "lines" ? "\n" : " ");
    const r = await gradeAgainstReference(ex, ctx, deps, {
      code,
      starter: "",
      reference: ex.accept.reference,
      matcher: ex.accept.matcher,
    });
    if (r.status !== "fail" || !ex.accept.orders) return r;
  }
  const missing = ex.blocks.filter((b) => !order.includes(b.id)).length;
  if (missing) ds.push(diag("parsons.missing", { n: missing }, undefined, "order"));
  const target = ex.accept.orders?.[0] ?? ex.blocks.map((b) => b.id);
  const firstDiff = target.findIndex((id, i) => order[i] !== id);
  if (firstDiff >= 0 && !used.length && !missing)
    ds.push(diag("parsons.swap", {}, { slot: firstDiff + 1 }, "order"));
  const inPlace = target.filter((id, i) => order[i] === id).length;
  const score = target.length
    ? (inPlace / Math.max(target.length, order.length)) * (used.length ? 0.5 : 1)
    : 0;
  return finish(ex, ctx, { score, pass: false, dims: { order: { score, weight: 1 } }, diagnostics: ds });
}

/**
 * Staged dictation answers (bass → quality → RN, tonic, rhythm, pitch) against the evaluated reference.
 * Wave 4 (`dictation.stage-answers`): the bass stage may be answered as degrees (a degree pad, 1-based) or
 * as note names; qualities at the depth the widget offers; numerals by degree, quality and (when the
 * widget allows inversions) bass. Each stage's score is reported in its own dimension (`bass`, `quality`,
 * `rn`, `pitch`, `rhythm`, `choice` for the tonic) so a sequential host opens the next stage when the one
 * before reaches `stagePass` (`stagePassed`). The step passes when every listed stage is answered and
 * reaches `stagePass` (default 0.8) with `stageAnswers`, else on the weighted mean.
 */
async function gradeStages(
  ex: ExerciseOf<"dictation">,
  ctx: GradeContext,
  deps: GradeDeps,
  stages: NonNullable<import("@oak/content-kit").Answer["stages"]>,
): Promise<GradeResult> {
  const ref = await evaluateReference(deps, ex.reference.solutions[0] ?? "", ex.reference.bars, ex, ctx);
  const nc = nctx(ex, ctx);
  const key = keyOf(ref.n.all, nc.key ?? null);
  const order = ex.stages ?? (Object.keys(stages) as (keyof typeof stages)[]);
  const weights = ex.stageWeights ?? order.map(() => 1 / order.length);
  const slots = slotsOf(ref.n, nc).filter((s) => s.chord);
  const ds: Diagnostic[] = [];
  const stageScores: number[] = [];
  const dims: GradeResult["dims"] = {};
  const mel = melodyLine(melodyEvents(ref.n));
  const barOfSlot = (i: number): number | undefined => {
    const slot = slots[i];
    return slot ? R.floor(slot.span[0]) + 1 : undefined;
  };
  const withBar = (d: Diagnostic): Diagnostic => {
    const i = (d.where?.slot ?? 1) - 1;
    const bar = barOfSlot(i);
    return bar === undefined ? d : { ...d, where: { ...(d.where ?? {}), slot: i + 1, bar } };
  };
  const answered = order.filter((st) => (stages[st]?.length ?? 0) > 0);
  const staged = ex.stageAnswers !== undefined;
  for (const stage of order) {
    const got = stages[stage] ?? [];
    const widget = ex.stageAnswers?.[stage];
    let check: AnswerCheck;
    if (stage === "bass") {
      // A degree pad sends degrees (1-based); a typed or note answer sends note names.
      const asDegrees =
        got.length > 0 ? got.every((g) => /^[b#♭♯]?[1-7]$/.test(g.trim())) : widget?.ui === "degree-pad";
      const expected = slots.map((s) =>
        key && s.chord
          ? asDegrees
            ? labelPitch(60 + s.chord.bassPc, key).degree
            : spellMidi(60 + s.chord.bassPc, { key }).name.replace(/-?\d+$/, "")
          : "?",
      );
      const normDeg = (x: string): string => x.trim().replace("♭", "b").replace("♯", "#");
      const same = (e: string, g: string): boolean =>
        asDegrees ? normDeg(e) === normDeg(g) : mod12(pcOfSafe(e)) === mod12(pcOfSafe(g)) && pcOfSafe(g) >= 0;
      const n = Math.max(expected.length, got.length);
      let ok = 0;
      const cd: Diagnostic[] = [];
      for (let i = 0; i < n; i++) {
        const e = expected[i];
        const g = got[i];
        if (e !== undefined && g !== undefined && same(e, g)) {
          ok++;
          continue;
        }
        const bar = barOfSlot(i) ?? i + 1;
        cd.push(
          diag(
            "harmony.bass",
            { got: g ?? "nothing", exp: e ?? "nothing", bar },
            { slot: i + 1, bar },
            "bass",
          ),
        );
      }
      check = { score: n === 0 ? 1 : ok / n, dims: {}, diagnostics: cd, slots: [] };
    } else if (stage === "quality") {
      const offered = widget?.ui === "quality-pad" ? widget.set : null;
      const expected = slots.map((s) =>
        s.chord ? (offered?.includes(s.chord.quality) ? s.chord.quality : triadCore(s.chord).quality) : "?",
      );
      check = qualitySlots(expected, got);
    } else if (stage === "rn") {
      const inversion = widget?.ui === "rn-palette" && widget.allow.includes("inversions");
      const expected = slots.map((s, i) =>
        key && s.chord
          ? romanText({
              ...romanOf(s.chord, key, slots[i + 1]?.chord ?? undefined),
              ...(inversion ? {} : { inversion: 0 as const }),
            })
          : "?",
      );
      check = rnSlots(expected, got, key, { inversion });
    } else if (stage === "tonic") {
      const expected = key ? [key.tonic] : [];
      const ok =
        expected.length > 0 &&
        got[0] !== undefined &&
        mod12(pcOfSafe(expected[0] as string)) === mod12(pcOfSafe(got[0]));
      check = {
        score: ok ? 1 : 0,
        dims: {},
        diagnostics: ok
          ? []
          : [diag("id.wrong", { got: got[0] ?? "nothing", exp: expected[0] ?? "?" }, undefined, "stage")],
        slots: [],
      };
    } else {
      const expected =
        stage === "pitch"
          ? key
            ? degreeSequence(mel, key)
            : []
          : [...new Set(mel.map((x) => R.str(x.onset)))];
      const n = Math.max(expected.length, got.length);
      let ok = 0;
      const cd: Diagnostic[] = [];
      for (let i = 0; i < n; i++) {
        const e = expected[i];
        const g = got[i];
        if (e !== undefined && g !== undefined && e === g) {
          ok++;
          continue;
        }
        const params = { got: g ?? "nothing", exp: e ?? "nothing" };
        cd.push(
          stage === "pitch"
            ? diag(
                "melody.wrong-degree",
                { ...params, gotSyl: "", expSyl: "", line: "melody" },
                { slot: i + 1 },
                "pitch",
              )
            : diag("id.wrong", params, { slot: i + 1 }, "stage"),
        );
      }
      check = { score: n === 0 ? 1 : ok / n, dims: {}, diagnostics: cd, slots: [] };
    }
    // A sequential host sends the stages one at a time: a stage not sent yet is open, not wrong.
    check = {
      ...check,
      diagnostics: foldRefined(
        check.diagnostics,
        ex.feedbackText as Partial<Record<string, string>> | undefined,
      ),
    };
    if (got.length > 0 || !staged)
      ds.push(
        ...(stage === "bass" || stage === "quality" || stage === "rn"
          ? check.diagnostics.map(withBar)
          : check.diagnostics),
      );
    stageScores.push(check.score);
    const dim = STAGE_DIM[stage];
    dims[dim] = { score: check.score, weight: 0, n: Math.max(slots.length, got.length) };
  }
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const score = stageScores.reduce((a, s, i) => a + s * (weights[i] ?? 0), 0) / wSum;
  dims.stage = { score, weight: 1, n: order.length };
  const pass = staged
    ? answered.length === order.length && stageScores.every((x) => x >= (ex.stagePass ?? STAGE_PASS) - 1e-9)
    : undefined;
  return finish(ex, ctx, { score, ...(pass !== undefined ? { pass } : {}), dims, diagnostics: ds });
}
/** Default pass mark of a stage in a sequential staged dictation (contracts §6.6 X1: 0.80). */
export const STAGE_PASS = 0.8;
const STAGE_DIM: Record<
  import("@oak/content-kit").DictationStage,
  "bass" | "quality" | "rn" | "pitch" | "rhythm" | "choice"
> = { bass: "bass", quality: "quality", rn: "rn", pitch: "pitch", rhythm: "rhythm", tonic: "choice" };
/**
 * Whether one stage of a staged dictation passed (the host opens the next stage then): its dimension score
 * reaches the exercise's `stagePass` (default 0.8).
 */
export function stagePassed(
  result: GradeResult,
  stage: import("@oak/content-kit").DictationStage,
  stagePass = STAGE_PASS,
): boolean {
  const d = result.dims[STAGE_DIM[stage]];
  return !!d && d.score >= stagePass - 1e-9;
}
function pcOfSafe(name: string): number {
  const m = /^([A-Ga-g])([#b]*)/.exec(name.trim());
  if (!m) return -1;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[(m[1] as string).toUpperCase()] as number;
  for (const ch of m[2] ?? "") pc += ch === "#" ? 1 : -1;
  return pc;
}

// --- dispatch -----------------------------------------------------------------------------------

/** Grades one response. Throws only for programming errors (a reference that does not evaluate). */
export async function gradeWith(req: GradeRequest, deps: GradeDeps): Promise<GradeResult> {
  const ctx = req.ctx;
  const ex = Object.keys(ctx.params).length ? substituteParams(req.exercise, ctx.params) : req.exercise;
  const resp = req.response;
  if ("skipped" in resp) {
    const fallback = (ex.kind === "sing" || ex.kind === "tap") && ex.fallback ? "fallback" : undefined;
    return finish(ex, ctx, { status: "ungraded", score: 0, ...(fallback ? { modality: fallback } : {}) });
  }
  const wrongShape = (): GradeResult => errorResult(ex, ctx, [diag("eval.crashed")]);
  switch (ex.kind) {
    case "predict": {
      const ds = [diag("predict.done")];
      if (ex.correct !== undefined && "answer" in resp) {
        const got =
          typeof ex.correct === "number"
            ? resp.answer.number === ex.correct
            : (resp.answer.choice ?? []).join() === ex.correct.join();
        return finish(ex, ctx, { status: "ungraded", score: got ? 1 : 0, diagnostics: ds });
      }
      return finish(ex, ctx, { status: "ungraded", score: 1, diagnostics: ds });
    }
    case "listen":
      return finish(ex, ctx, { status: "ungraded", score: 1 });
    case "run-investigate":
      return gradeInvestigate(ex, ctx, deps, resp);
    case "code-modify":
      if (!("code" in resp)) return wrongShape();
      return gradeAgainstReference(ex, ctx, deps, {
        code: resp.code,
        starter: ex.code.starter,
        reference: ex.reference,
        matcher: ex.matcher,
        constraints: ex.constraints ?? [],
        requireChange: true,
      });
    case "code-fill":
      if ("blanks" in resp) return gradeCodeFill(ex, ctx, deps, resp.blanks);
      if ("code" in resp)
        return gradeAgainstReference(ex, ctx, deps, {
          code: resp.code,
          starter: ex.code.starter,
          reference: ex.reference,
          matcher: ex.matcher,
        });
      return wrongShape();
    case "parsons":
      if (!("order" in resp)) return wrongShape();
      return gradeParsons(ex, ctx, deps, resp.order);
    case "error-hunt":
      if ("clicks" in resp) return gradeErrorHunt(ex, ctx, deps, resp);
      if ("click" in resp) return gradeErrorHunt(ex, ctx, deps, { clicks: [resp.click] });
      // A fix submitted without clicks locates the bug by its edit: the changed ranges are the clicks.
      if ("code" in resp)
        return gradeErrorHunt(ex, ctx, deps, {
          clicks: diffRanges(stripMarkers(ex.code.starter).code, resp.code),
          code: resp.code,
        });
      return wrongShape();
    case "code-make":
    case "compose-brief":
      if (!("code" in resp)) return wrongShape();
      // Onboarding (a preview context, contracts §3.1 rule 5a) is exempt: Sketch 001 is the loop as heard.
      if (
        ex.kind === "code-make" &&
        !ctx.lint?.allowPreview &&
        isUnchangedStarter(ex.code.starter, resp.code)
      ) {
        // A Make is the learner's own piece: its starter, as it came, made nothing, even where the starter
        // already meets the brief's required rule. The rubric still shows; the result does not pass.
        const r = await gradeRubricPiece(ex, ctx, deps, resp.code);
        if (r.status !== "pass") return r;
        return finish(ex, ctx, {
          score: 0,
          pass: false,
          ...(r.dims ? { dims: r.dims } : {}),
          diagnostics: [diag("make.unchanged"), ...r.diagnostics.filter((d) => d.severity !== "praise")],
          ...(r.rubric ? { rubric: r.rubric } : {}),
          ...(r.eval ? { eval: r.eval } : {}),
        });
      }
      return gradeRubricPiece(ex, ctx, deps, resp.code);
    case "identify": {
      if (!("answer" in resp)) return wrongShape();
      const spelled = await spelledIntervalsOf(ex, ctx, deps);
      return answerFold(
        ex,
        ctx,
        gradeAnswer(ex.answer, ex.correct, resp.answer, {
          ...(ex.partial ? { partial: ex.partial } : {}),
          key: ex.key ?? ctx.key,
          ...(spelled ? { spelledIntervals: spelled } : {}),
        }),
      );
    }
    case "fact": {
      if (!("answer" in resp)) return wrongShape();
      const spelled = ex.spelling === "strict" ? await spelledIntervalsOf(ex, ctx, deps) : null;
      return answerFold(
        ex,
        ctx,
        gradeAnswer(ex.answer, ex.correct, resp.answer, {
          key: ex.key ?? ctx.key,
          spelling: ex.spelling,
          order: ex.order,
          ...(spelled ? { spelledIntervals: spelled } : {}),
        }),
      );
    }
    case "keyboard": {
      if (!("answer" in resp)) return wrongShape();
      return answerFold(
        ex,
        ctx,
        keyboardCheck(ex.expect, resp.answer.midi ?? [], ex.pitchMode, ex.answer.mode),
      );
    }
    case "staff-read": {
      if (ex.correct && "answer" in resp)
        return answerFold(
          ex,
          ctx,
          gradeAnswer(ex.answer, ex.correct, resp.answer, { key: ex.key ?? ctx.key }),
        );
      if (ex.reference && ex.matcher) {
        if ("code" in resp)
          return gradeAgainstReference(ex, ctx, deps, {
            code: resp.code,
            starter: "",
            reference: ex.reference,
            matcher: ex.matcher,
          });
        if ("staff" in resp) return gradeStaffEvents(ex, ctx, deps, resp.staff, ex.reference, ex.matcher);
      }
      return wrongShape();
    }
    case "staff-write": {
      const e = ex.expect;
      if (e.e === "key-signature") {
        if (!("answer" in resp)) return wrongShape();
        return answerFold(ex, ctx, keySignatureCheck(e.key, resp.answer.text ?? [], e.order ?? "set"));
      }
      if (!("staff" in resp)) return wrongShape();
      if (e.e === "chords") {
        const nc = nctx(ex, ctx);
        return answerFold(
          ex,
          ctx,
          staffChordsCheck(e, resp.staff, {
            key: ex.answer.key ?? nc.key ?? null,
            meter: nc.meter,
            ...(nc.pickup ? { pickup: nc.pickup } : {}),
          }),
        );
      }
      if (e.e === "pitches") {
        // The staff's own key signature (Wave 3) is the key the notes are written in.
        const key = ex.answer.key ?? ex.key ?? ctx.key;
        const names = resp.staff.filter((x) => x.midi !== null).map((x) => staffName(x, key));
        return answerFold(
          ex,
          ctx,
          spelledNotes(e.spelled, names, {
            strict: true,
            order: e.order,
            key,
            withOctave: e.withOctave,
            staff: true,
          }),
        );
      }
      const matcher: Matcher =
        e.e === "rhythm"
          ? { m: "rhythm", tol: rat(0), durations: true, perRole: false, displacementCredit: 0.5 }
          : e.matcher;
      return gradeStaffEvents(ex, ctx, deps, resp.staff, e.reference, matcher);
    }
    case "tap":
    case "sing": {
      if (!("performance" in resp)) return wrongShape();
      const perf = resp.performance;
      if (perf.diagnostics.some((d) => d.id === "sing.no-voice" || d.id === "sing.bleed"))
        return errorResult(ex, ctx, perf.diagnostics);
      const pass = performancePasses(ex.kind, perf, ex.tol);
      // A sung pattern: pitch judged each note; the pattern findings name degrees, not cents. Degree targets
      // carry their own degrees; a melody to echo or sight-sing is labelled in the key.
      const notes = (perf as PerformanceResult).notes;
      const key = ex.key ?? ctx.key;
      const degrees =
        ex.kind !== "sing"
          ? null
          : ex.target.from === "degrees"
            ? ex.target.degrees
            : notes?.every((x) => x.targetMidi !== undefined)
              ? notes.map((x) => labelPitch(Math.round(x.targetMidi as number), key).degree)
              : null;
      const diagnostics =
        ex.kind === "sing" && degrees && notes?.some((x) => x.targetMidi !== undefined)
          ? judgeSungPattern({
              degrees,
              key,
              labels: ex.labels ?? defaultSingLabels(ctx.exerciseGlobalId),
              notes,
              diagnostics: perf.diagnostics,
              mode: ex.mode,
            })
          : perf.diagnostics;
      return finish(ex, ctx, {
        score: perf.score,
        pass,
        dims: perf.dims,
        diagnostics,
        modality: "normal",
      });
    }
    case "dictation": {
      if ("answer" in resp && resp.answer.stages) return gradeStages(ex, ctx, deps, resp.answer.stages);
      const partOf = "code" in resp && "part" in resp ? resp.part : undefined;
      if ("code" in resp && typeof resp.code === "string" && partOf !== undefined && ex.byEar?.parts) {
        // One part of a by-ear transcription (`by-ear.parts`): its own track, matcher and pass mark.
        const part = ex.byEar.parts.find((p) => p.track === partOf);
        if (!part) return wrongShape();
        const partEx = { ...ex, pass: part.pass ?? DEFAULT_PASS.dictation ?? 0.85 } as typeof ex;
        return gradeAgainstReference(partEx, ctx, deps, {
          code: resp.code,
          starter: ex.answer.ui === "code" ? ex.answer.starter : "",
          reference: { ...ex.reference, tracks: [part.track] },
          matcher: byEarMatcher(part.matcher, ex.byEar.accepts),
          transcription: true,
        });
      }
      if ("code" in resp)
        // A code answer starts from the step's starter: handing it back unchanged is `code.unchanged`
        // (AUTHORING §9), not a list of every missing note.
        return gradeAgainstReference(ex, ctx, deps, {
          code: resp.code,
          starter: ex.answer.ui === "code" ? ex.answer.starter : "",
          ...(ex.answer.ui === "code" && ex.answer.starter.trim() !== "" ? { requireChange: true } : {}),
          reference: ex.reference,
          matcher: ex.byEar ? byEarMatcher(ex.matcher, ex.byEar.accepts) : ex.matcher,
          ...(ex.byEar ? { transcription: true } : {}),
        });
      if ("staff" in resp) return gradeStaffEvents(ex, ctx, deps, resp.staff, ex.reference, ex.matcher);
      if ("answer" in resp && resp.answer.degrees) {
        const ref = await evaluateReference(
          deps,
          ex.reference.solutions[0] ?? "",
          ex.reference.bars,
          ex,
          ctx,
        );
        const key = keyOf(ref.n.all, nctx(ex, ctx).key ?? null);
        const want = key ? degreeSequence(melodyLine(melodyEvents(ref.n)), key) : [];
        return answerFold(
          ex,
          ctx,
          gradeAnswer({ ui: "degree-pad", set: [], syllables: false }, { degrees: want }, resp.answer, {
            key,
          }),
        );
      }
      return wrongShape();
    }
    case "transcribe-step": {
      if (ex.grading.mode === "self") return finish(ex, ctx, { status: "ungraded", score: 0 });
      if (!("code" in resp)) return wrongShape();
      const stageOf = "stage" in resp ? resp.stage : undefined;
      if (stageOf !== undefined && ex.grading.stages) {
        // One stage of a staged chord transcription (`transcribe.stages`): bass, then quality, then numerals.
        const st = ex.grading.stages.find((x) => x.stage === stageOf);
        if (!st) return wrongShape();
        return gradeAgainstReference({ ...ex, pass: st.pass }, ctx, deps, {
          code: resp.code,
          starter: "",
          reference: ex.grading.reference,
          matcher: st.matcher,
        });
      }
      return gradeAgainstReference(ex, ctx, deps, {
        code: resp.code,
        starter: "",
        reference: ex.grading.reference,
        matcher: ex.grading.matcher,
      });
    }
    case "all": {
      if (!("parts" in resp)) return wrongShape();
      const results: GradeResult[] = [];
      for (const [i, part] of ex.parts.entries())
        results.push(
          await gradeWith(
            {
              exercise: part,
              response: resp.parts[i] ?? { skipped: true },
              ctx: { ...ctx, exerciseGlobalId: `${ctx.exerciseGlobalId}#${i + 1}` },
            },
            deps,
          ),
        );
      if (results.some((r) => r.status === "error"))
        return errorResult(
          ex,
          ctx,
          results.flatMap((r) => r.diagnostics),
        );
      const graded = results
        .map((r, i) => ({ r, w: ex.weights?.[i] ?? 1 }))
        .filter((x) => x.r.status !== "ungraded");
      const wSum = graded.reduce((a, x) => a + x.w, 0) || 1;
      const score = graded.reduce((a, x) => a + x.r.score * x.w, 0) / wSum;
      const dims: GradeResult["dims"] = {};
      for (const { r } of graded) Object.assign(dims, r.dims);
      return finish(ex, ctx, {
        score,
        pass: graded.every((x) => x.r.status === "pass"),
        dims,
        diagnostics: results.flatMap((r) =>
          r.diagnostics.filter((d) => d.id !== "pass.perfect" && d.id !== "pass.close"),
        ),
        constraints: results.flatMap((r) => r.constraints),
      });
    }
  }
}

/** Staff or note-list answers: events the learner entered, against the evaluated reference. */
async function gradeStaffEvents(
  ex: Exercise,
  ctx: GradeContext,
  deps: GradeDeps,
  staff: NEvent[],
  ref: Reference,
  matcher: Matcher,
): Promise<GradeResult> {
  const r = await evaluateReference(deps, ref.solutions[0] ?? "", ref.bars, ex, ctx);
  const nc = nctx(ex, ctx);
  const ans = normalizedFromEvents(
    staff.map((e) => ({ ...e, track: e.track || "staff" })),
    { cps: r.n.cps, bpm: r.n.bpm },
  );
  // A staff answer has one line: compare it with the reference's whole selection.
  const refN = scoped(window(r.n, ref.bars), ref);
  const raw = runMatcher(matcher, refN, ans, {
    ...nc,
    code: "",
    params: ctx.params,
  });
  // What was written, not only what sounds: octave, accidental and enharmonic slips are named apart.
  const staffKey = (ex.kind === "staff-write" ? ex.answer.key : undefined) ?? nc.key ?? null;
  const m = refineStaffResult(raw, refN.all, ans.all, staffKey, {
    meter: nc.meter,
    ...(nc.pickup ? { pickup: nc.pickup } : {}),
  });
  const mark = (passThreshold(ex) ?? 1) - 1e-9;
  return finish(ex, ctx, {
    score: m.floor !== undefined && m.floor < mark ? Math.min(m.score, m.floor) : m.score,
    dims: m.dims,
    diagnostics: m.diagnostics,
    ...(m.overlay ? { overlay: m.overlay } : {}),
  });
}

/**
 * The pitch rule a by-ear step shows the learner decides the comparison (content CI checks the matcher
 * agrees): `exact` = these notes in this octave, `any-octave` = octave-free, `any-key` = the tune in any
 * key. The matcher's own `pitch` is replaced by the rule's, nested matchers included, so a by-ear step can
 * never accept a transposition its rule does not allow.
 */
/**
 * The interval each answer slot names, as the stimulus spells it: one bar per slot, two notes per bar.
 * Only read when an interval answer expects the tritone ("TT"), which A4 and d5 both sound as; null when
 * the stimulus does not lay the pairs out that way.
 */
async function spelledIntervalsOf(
  ex: Extract<Exercise, { kind: "identify" | "fact" }>,
  ctx: GradeContext,
  deps: GradeDeps,
): Promise<(string | null)[] | null> {
  const expected = ex.correct.text;
  if (ex.answer.ui !== "text" || ex.answer.normalize !== "interval" || !expected) return null;
  if (!expected.some((e) => /^tt$|tritone/i.test(e.trim()))) return null;
  const stim = ex.stimulus;
  if (stim?.src !== "code") return null;
  const ref = await evaluateReference(deps, stim.code, stim.bars, ex, ctx);
  const key = nctx(ex, ctx).key ?? null;
  const bars = new Map<number, NEvent[]>();
  for (const e of ref.n.all) {
    if (e.midi === null) continue;
    const bar = Math.floor(e.onset[0] / e.onset[1]);
    bars.set(bar, [...(bars.get(bar) ?? []), e]);
  }
  const pairs = [...bars.entries()].sort((a, b) => a[0] - b[0]).map(([, es]) => es);
  if (pairs.length !== expected.length) return null;
  return pairs.map((es) => {
    const notes = [...new Map(es.map((e) => [e.midi, e])).values()];
    if (notes.length !== 2) return null;
    const [a, b] = notes as [NEvent, NEvent];
    const named = (e: NEvent): number | string =>
      e.written && /^[A-Ga-g](?:##|bb|#|b)?-?\d+$/.test(e.written) ? e.written : (e.midi as number);
    try {
      return intervalOf(named(a), named(b), key).name;
    } catch {
      return null;
    }
  });
}

export function byEarMatcher(matcher: Matcher, accepts: "exact" | "any-octave" | "any-key"): Matcher {
  const pitch = BY_EAR_PITCH[accepts][0];
  switch (matcher.m) {
    case "melody":
    case "events":
      return { ...matcher, pitch };
    case "all":
      return { ...matcher, of: matcher.of.map((m) => byEarMatcher(m, accepts)) };
    default:
      return matcher;
  }
}

/**
 * What a sing step labels its notes with when the step does not say: numbers before U03.L08, movable-do
 * syllables from U03.L08 on (contracts §8.3). Read from the exercise's owner (`U03.L08/…`, `U04.CP/…`).
 */
export function defaultSingLabels(exerciseGlobalId: string): "numbers" | "syllables" {
  const m = /^U(\d{2})\.(?:L(\d{2})|CP)\//.exec(exerciseGlobalId);
  if (!m) return "numbers";
  const unit = Number(m[1]);
  const lesson = m[2] === undefined ? 99 : Number(m[2]);
  return unit > 3 || (unit === 3 && lesson >= 8) ? "syllables" : "numbers";
}

/** The code is the starter as it came (markers stripped; whitespace at the ends and line ends ignored). */
export function isUnchangedStarter(starter: string | undefined, code: string): boolean {
  if (starter === undefined || starter.trim() === "") return false;
  const norm = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim();
  return norm(stripMarkers(starter).code) === norm(code);
}
