// The living Requirements checklist (ux §2.3, contracts §6.5–§6.6): one row per rubric rule of the brief, driven
// by the deterministic rubric. Required rules are met or open; suggestions are never a failure (an open
// suggestion is an unticked line, not a cross). Going past the brief earns a note, never a failure. Pure.
import type { GradeResult, RubricRule } from "@oak/content-kit";
import type { BarAnchor } from "./anchors.ts";

export type RowState = "met" | "open" | "unchecked";

export interface ChecklistRow {
  id: string;
  label: string;
  required: boolean;
  state: RowState;
  /** The rubric's own detail line for an open rule ("1 bars; the brief asks for 4–8"). */
  detail: string | null;
  anchor: BarAnchor | null;
  /** This session works towards the rule (`CapstoneSessionDef.focusRules`). */
  focus: boolean;
}

export function checklistOf(
  rules: readonly RubricRule[],
  result: GradeResult | null,
  anchors: Readonly<Record<string, BarAnchor | null>> = {},
  focusRules: readonly string[] = [],
): ChecklistRow[] {
  const byId = new Map((result?.rubric ?? []).map((r) => [r.ruleId, r] as const));
  const usable = result !== null && result.status !== "error";
  return rules.map((rule) => {
    const r = usable ? byId.get(rule.id) : undefined;
    const state: RowState = r === undefined ? "unchecked" : r.ok ? "met" : "open";
    const detail =
      state === "open" && typeof r?.diag?.params.detail === "string" ? r.diag.params.detail : null;
    return {
      id: rule.id,
      label: rule.label,
      required: rule.required,
      state,
      detail,
      anchor: state === "open" ? (anchors[rule.id] ?? null) : null,
      focus: focusRules.includes(rule.id),
    };
  });
}

export interface Readiness {
  /** Every required rule is met on a check of the code now in the editor. */
  ready: boolean;
  met: number;
  required: number;
}

export function readiness(rows: readonly ChecklistRow[]): Readiness {
  const req = rows.filter((r) => r.required);
  const met = req.filter((r) => r.state === "met").length;
  return { ready: req.length > 0 && met === req.length, met, required: req.length };
}

export interface PieceFacts {
  bars: number;
  /** Learner tracks with at least one event. */
  tracks: number;
  bpm: number | null;
}

/**
 * Notes for going past the brief (contracts §6.5 rule 3): more bars, more tracks or more distinct pitches than
 * asked. Never a failure; only said when the required rules are met.
 */
export function beyondBrief(
  rules: readonly RubricRule[],
  result: GradeResult | null,
  piece: PieceFacts,
): string[] {
  if (result?.status !== "pass") return [];
  const notes: string[] = [];
  for (const rule of rules) {
    if (rule.rule === "bars" && rule.min !== undefined && rule.max === undefined && piece.bars > rule.min)
      notes.push(`${piece.bars} bars, where the brief asks for at least ${rule.min}.`);
    if (
      rule.rule === "bars" &&
      rule.min !== undefined &&
      rule.max !== undefined &&
      rule.min !== rule.max &&
      piece.bars === rule.max &&
      rule.max > rule.min
    )
      notes.push(`The full ${piece.bars} bars the brief allows.`);
    if (rule.rule === "tracks" && piece.tracks > rule.min)
      notes.push(`${piece.tracks} parts, where the brief asks for ${rule.min}.`);
    if (rule.rule === "distinct-pitches") {
      const r = result.rubric?.find((x) => x.ruleId === rule.id);
      if (r?.value !== undefined && r.value > rule.min)
        notes.push(
          `${r.value} different notes in the ${String(rule.track).replace(/^@/, "")}, where the brief asks for ${rule.min}.`,
        );
    }
  }
  return notes;
}

/** Splits a label written with backticks into text and inline-code runs, for rendering. */
export function labelRuns(label: string): { code: boolean; text: string }[] {
  return label
    .split("`")
    .map((text, i) => ({ code: i % 2 === 1, text }))
    .filter((r) => r.text.length > 0);
}
