// The UI and tutor view of a GradeResult (contracts §5.7), redacted to a hint rung by the matrix of
// §10.5. The feedback panel, the hint ladder and the tutor's tool results all go through this function,
// so none of them can say more than the ladder has shown.

import type { FeedbackArea, FeedbackId } from "./ids.ts";
import { parseFeedbackId } from "./ids.ts";
import type {
  Diagnostic,
  FacetView,
  GradeResult,
  GradeView,
  HintRung,
  IssueView,
  NEvent,
} from "./schema/index.ts";

/**
 * Areas whose findings describe the learner's own code or performance, never the expected answer:
 * shown in full at every rung (row 2 of the matrix).
 */
export const OPEN_FEEDBACK_AREAS: readonly FeedbackArea[] = [
  "eval",
  "code",
  "lint",
  "sing",
  "tap",
  "predict",
  "make",
  "rubric",
  "pass",
];

/** Diagnostic params that carry the expected answer. Released with the issue's `fix`. */
export const ANSWER_PARAMS = [
  "exp",
  "expected",
  "expSyl",
  "expKey",
  "suggest",
  "idx",
  "deg",
  "member",
  // Wave 3: where a note belongs, the long interval name, the key's kind, the key-signature reason.
  "expAt",
  "expLong",
  "expKind",
  "why",
] as const;

export interface IssueViewOptions {
  /** True once the step has passed: nothing is redacted. */
  passed?: boolean;
  /** Renders a diagnostic with the catalog template (@oak/grader `renderFeedback`). Default: `result.messages`, then the feedback ID. */
  render?: (d: Diagnostic) => string;
  /** Describes the kind of problem without the answer ("wrong degree, too high"). Default: derived from the feedback ID and `dir`. */
  describe?: (d: Diagnostic) => string;
}

function isOpen(id: FeedbackId): boolean {
  const area = parseFeedbackId(id)?.area;
  return area !== undefined && OPEN_FEEDBACK_AREAS.includes(area);
}

function defaultDescribe(d: Diagnostic): string {
  const code = parseFeedbackId(d.id)?.code ?? d.id;
  const kind = code.replace(/[.-]/g, " ");
  const dir = d.params.dir ?? d.params.shiftLabel;
  return dir === undefined ? kind : `${kind} (${dir})`;
}

const MISSING = /(?:^|[.-])missing(?:$|[.-])|(?:^|\.)missed$/;
const EXTRA = /(?:^|[.-])extra(?:$|[.-])/;

/** How many findings are missing, extra or otherwise wrong. Shown at every rung. */
export function countIssues(diagnostics: readonly Diagnostic[]): {
  missing: number;
  extra: number;
  wrong: number;
} {
  const counts = { missing: 0, extra: 0, wrong: 0 };
  for (const d of diagnostics) {
    if (d.severity !== "error" && d.severity !== "warn") continue;
    if (isOpen(d.id)) continue;
    const code = parseFeedbackId(d.id)?.code ?? "";
    if (MISSING.test(code)) counts.missing++;
    else if (EXTRA.test(code)) counts.extra++;
    else counts.wrong++;
  }
  return counts;
}

/**
 * Builds the view of `result` that rung `rung` allows:
 *  - every rung: status, score, facets, counts, each issue's place (track, bar, beat, code range), rubric
 *    labels' met state, and findings about the learner's own code in full;
 *  - rung ≥ 2: each issue's kind and direction (`id`, `what`);
 *  - rung 3: `fix`, `expected`, `got` and ghost notes for the first issue only;
 *  - rung 4 or passed: everything.
 */
export function toIssueView(result: GradeResult, rung: HintRung, opts: IssueViewOptions = {}): GradeView {
  const level: HintRung = opts.passed || result.status === "pass" ? 4 : rung;
  const render =
    opts.render ??
    ((d: Diagnostic): string =>
      result.messages.find(
        (m) => m.id === d.id && m.where?.bar === d.where?.bar && m.where?.beat === d.where?.beat,
      )?.text ?? d.id);
  const describe = opts.describe ?? defaultDescribe;

  const facets: FacetView[] = Object.entries(result.dims).map(([dim, s]) => ({
    dim: dim as FacetView["dim"],
    score: s.score,
    weight: s.weight,
    ...(s.n === undefined ? {} : { n: s.n }),
  }));

  let firstRedacted = true;
  const issues: IssueView[] = result.diagnostics
    .filter((d) => d.severity !== "praise" || level === 4)
    .map((d) => {
      const base = {
        severity: d.severity,
        where: d.where ?? {},
        ...(d.dim === undefined ? {} : { dim: d.dim }),
      };
      if (isOpen(d.id)) return { ...base, id: d.id, what: render(d) };
      const first = firstRedacted;
      firstRedacted = false;
      if (level < 2) return base;
      const view: IssueView = { ...base, id: d.id, what: describe(d) };
      if (level === 4 || (level === 3 && first)) {
        view.fix = render(d);
        const expected = d.params.exp ?? d.params.expected;
        if (expected !== undefined) view.expected = expected;
        if (d.params.got !== undefined) view.got = d.params.got;
      }
      return view;
    });

  const missing = result.overlay?.missing ?? [];
  let ghosts: NEvent[] = [];
  if (level === 4) ghosts = missing;
  else if (level === 3) {
    const first = result.diagnostics.find((d) => !isOpen(d.id));
    const ids = new Set(first?.where?.noteIds ?? []);
    const bar = first?.where?.bar;
    const byId = missing.filter((e) => ids.has(e.id));
    ghosts =
      byId.length > 0 || bar === undefined
        ? byId
        : missing.filter((e) => Math.floor(e.onset[0] / e.onset[1]) + 1 === bar);
  }

  return {
    status: result.status,
    score: result.score,
    facets,
    counts: countIssues(result.diagnostics),
    issues,
    ghosts,
    ...(result.rubric
      ? { rubric: result.rubric.map((r) => ({ ruleId: r.ruleId, required: r.required, ok: r.ok })) }
      : {}),
  };
}
