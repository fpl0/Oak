// GraderPort over a `GraderHost` in `tutor` mode (16 bars, 1500 ms, 5000 haps). In production the host
// is the `bun-subprocess` backend: model-written code is only ever evaluated with memory isolation
// (contracts §10.A). A lint or evaluation failure is data (`ok: false`); only infrastructure throws.
import {
  countIssues,
  drawExerciseParams,
  type GradeResult,
  type KeySpec,
  type LintContext,
  type MeterId,
  SCALE_MODES,
  type ScaleMode,
  type UnlockableId,
} from "@oak/content-kit";
import { type GraderHost, renderFeedback, toTutorEvalView } from "@oak/grader";
import type { ContentIndex } from "../content/index.ts";
import type { Repos } from "../db/repos/index.ts";
import type { EvalResult, GradeSnapshot, RawIssue } from "../tutor/domain.ts";
import type { CompareRequest, CompareResult, EvalRequest, GraderPort } from "../tutor/ports.ts";

export function parseKeyText(text: string | null): KeySpec | null {
  if (text === null) return null;
  const m = /^\s*([A-Ga-g][#b♯♭]?)\s*[: ]\s*([a-z]+)\s*$/.exec(text);
  if (m === null) return null;
  const mode = m[2] as ScaleMode;
  if (!(SCALE_MODES as readonly string[]).includes(mode)) return null;
  return { tonic: (m[1] as string).replace("♯", "#").replace("♭", "b"), mode };
}

function render(d: GradeResult["diagnostics"][number]): string {
  try {
    return renderFeedback(d);
  } catch {
    return d.id;
  }
}

/** A `GradeResult` reduced to what the tutor's tools return. Unredacted: the executors redact it. */
export function toGradeSnapshot(result: GradeResult): GradeSnapshot {
  const dims: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.dims)) if (v !== undefined) dims[k] = v.score;
  const issues: RawIssue[] = result.diagnostics.map((d) => {
    const p = d.params;
    const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
    const code = d.where?.code?.[0];
    return {
      where: {
        track: d.where?.track ?? null,
        bar: d.where?.bar ?? null,
        beat: d.where?.beat ?? null,
        code: code === undefined ? null : { from: code.from, to: code.to },
      },
      severity: d.severity === "error" || d.severity === "warn" ? d.severity : "info",
      feedback: d.id,
      direction: str(p.direction),
      concept: str(p.concept),
      what: render(d),
      fix: str(p.fix),
      expected: str(p.expected ?? p.exp),
      got: str(p.got),
    };
  });
  return {
    status: result.status,
    score: result.score,
    dims,
    counts: countIssues(result.diagnostics),
    issues,
    warnings: result.diagnostics
      .filter((d) => d.id.startsWith("code.") && d.severity !== "error")
      .map((d) => d.id),
  };
}

export class GraderAdapter implements GraderPort {
  constructor(
    private readonly host: () => GraderHost,
    private readonly repos: Repos,
    private readonly content: ContentIndex,
  ) {}

  #lint(origin: "tutor" | "learner", key: KeySpec | null, meter: MeterId): LintContext {
    return {
      profile: origin === "tutor" ? "tutor-card" : "studio",
      unlocked: this.repos.unlocks.ids() as Set<UnlockableId>,
      allowPreview: origin === "tutor",
      meter,
      key,
    };
  }

  async evaluate(req: EvalRequest, signal: AbortSignal): Promise<EvalResult> {
    const key = parseKeyText(req.key);
    const meter: MeterId = "4/4";
    const host = this.host();
    const lint = this.#lint(req.origin, key, meter);
    const lr = await host.lint(req.code, lint);
    if (!lr.ok) {
      const first = lr.diagnostics.find((d) => d.severity === "error");
      return {
        ok: false,
        error: {
          kind: "lint",
          message: first?.message ?? "the code did not pass the safety check",
          line: first?.line ?? null,
        },
        tempo: null,
        tracks: [],
        warnings: lr.diagnostics.filter((d) => d.severity !== "error").map((d) => d.id),
        lockedTools: lr.lockedTools,
      };
    }
    const result = await host.analyze(
      req.code,
      { mode: "tutor", bars: Math.min(16, Math.max(1, req.bars)), fromBar: req.fromBar, lint },
      signal,
    );
    const view = toTutorEvalView(result, key === null ? { meter } : { meter, key });
    return { ...view, lockedTools: [...new Set([...view.lockedTools, ...lr.lockedTools])] };
  }

  async compare(req: CompareRequest, signal: AbortSignal): Promise<CompareResult> {
    const host = this.host();
    let target: Parameters<GraderHost["compare"]>[0]["target"];
    let key: KeySpec | null = null;
    let meter: MeterId = "4/4";
    if (req.target.kind === "exercise") {
      const site = this.content.exercise(req.target.ref);
      if (site === null)
        return {
          ok: false,
          error: { kind: "unknown-exercise", message: `no exercise ${req.target.ref}`, line: null },
        };
      const lesson = this.content.lessonDef(site.owner);
      key = site.exercise.key ?? lesson?.key ?? null;
      meter = site.exercise.meter ?? lesson?.meter ?? "4/4";
      const series =
        site.stepId === null ? 0 : (this.repos.lessons.stepState(site.owner, site.stepId)?.seriesNo ?? 0);
      target = {
        kind: "exercise",
        exercise: site.exercise,
        params: drawExerciseParams(site.exercise, site.globalId, series),
      };
    } else {
      target = { kind: "code", code: req.target.code };
    }
    const result = await host.compare(
      {
        learnerCode: req.learnerCode,
        target,
        fromBar: req.fromBar,
        bars: Math.min(16, Math.max(1, req.bars)),
        mode: req.mode,
        key,
        meter,
        lint: this.#lint(req.learnerOrigin, key, meter),
      },
      signal,
    );
    if (result.status === "error") {
      const d = result.diagnostics[0];
      return {
        ok: false,
        error: {
          kind: d?.id ?? "eval.error",
          message: d === undefined ? "evaluation failed" : render(d),
          line: null,
        },
      };
    }
    return { ok: true, grade: toGradeSnapshot(result) };
  }
}
