// `runRubric`: evaluates rubric rules on a piece. Numeric rules return `{ ok, value, target }` with
// partial credit `min(1, value / target)`; `required` is all-or-nothing for pass (contracts §5.6, §6.5).
import type { Diagnostic, GradeResult, RubricRule } from "@oak/content-kit";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, Normalized } from "../types.ts";
import type { RubricContext } from "./context.ts";
import { evalRule, ruleCredit } from "./rules.ts";

export type RubricRow = NonNullable<GradeResult["rubric"]>[number];

/** One row per rule, in rule order, each with its `rubric.met` / `rubric.unmet` diagnostic. */
export function runRubric(rules: readonly RubricRule[], n: Normalized, ctx: RubricContext): RubricRow[] {
  return evaluateRubric(rules, n, ctx).rows;
}

/** The rows plus the extra findings rules produce and each rule's partial credit. */
export function evaluateRubric(
  rules: readonly RubricRule[],
  n: Normalized,
  ctx: RubricContext,
): { rows: RubricRow[]; extra: Diagnostic[]; credits: number[] } {
  const rows: RubricRow[] = [];
  const extra: Diagnostic[] = [];
  const credits: number[] = [];
  for (const rule of rules) {
    let e: ReturnType<typeof evalRule>;
    try {
      e = evalRule(rule, n, ctx);
    } catch (err) {
      // A rule that cannot be computed on this piece (no pitch, unknown symbol) is unmet, never a crash.
      e = { ok: false, detail: `could not be checked (${err instanceof Error ? err.message : String(err)})` };
    }
    const where = { ...(e.where ?? {}), rule: rule.id };
    const d: Diagnostic = e.ok
      ? diag("rubric.met", { label: rule.label }, where, "rubric")
      : {
          ...diag("rubric.unmet", { label: rule.label, detail: e.detail }, where, "rubric"),
          ...(rule.required ? {} : { severity: "info" as const }),
        };
    rows.push({
      ruleId: rule.id,
      required: rule.required,
      ok: e.ok,
      ...(e.value !== undefined ? { value: e.value } : {}),
      ...(e.target !== undefined ? { target: e.target } : {}),
      diag: d,
    });
    credits.push(ruleCredit(e));
    if (e.extra) extra.push(...e.extra.map((x) => ({ ...x, where: { ...(x.where ?? {}), rule: rule.id } })));
  }
  return { rows, extra, credits };
}

/**
 * The rubric as a matcher (`{ m: 'rubric' }`): the score is the mean credit of the required rules (of all
 * rules when none is required); suggestions are reported but never lower the score (contracts §6.5).
 */
export function rubricMatch(
  rules: readonly RubricRule[],
  n: Normalized,
  ctx: RubricContext,
): MatchResult & { rows: RubricRow[] } {
  const { rows, extra, credits } = evaluateRubric(rules, n, ctx);
  const required = rules.map((r, i) => (r.required ? i : -1)).filter((i) => i >= 0);
  const counted = required.length > 0 ? required : rules.map((_, i) => i);
  const score =
    counted.length === 0 ? 1 : counted.reduce((a, i) => a + (credits[i] as number), 0) / counted.length;
  const allRequiredOk = required.every((i) => rows[i]?.ok);
  const diagnostics = [...rows.filter((r) => !r.ok || r.required).map((r) => r.diag as Diagnostic), ...extra];
  return {
    // A broken required rule never scores 1, even when other credit rounds it up.
    score: allRequiredOk ? score : Math.min(score, 0.999),
    dims: { rubric: { score, weight: 1, n: rules.length } },
    diagnostics,
    rows,
  };
}

export type { RubricContext };
