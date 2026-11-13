// Wave 5 rules of the lesson and checkpoint players (docs/design/wave5.md §4.4, §11): whether a step's answer can be
// drawn at all (a kind the answers registry has no widget for yet never strands the learner), the "match this
// sound" steps of A1 (a `controls` matcher: the sound to match is heard from the start, A against B), and what the
// host passes the Workbench for the scope / spectrum panel and a step's visual probe.
import type { Exercise } from "@oak/api";
import type { ScopePanel } from "@oak/strudel";
import type { AnswerKind, AnswerSpec, AnswerSpecOf } from "../answers/types.ts";
import { type ScopePanelHostProps, scopePanelOf } from "../lib/scope-panel.ts";
import { answerSpecOf, partsOf } from "./model.ts";

/** Whether the registry draws a widget for this answer surface (injected so the rule stays pure in tests). */
export type WidgetAvailable = (spec: AnswerSpec) => boolean;

/** Whether any part of the step asks for an answer the app cannot draw yet. */
export function answerMissing(ex: Exercise | undefined, available: WidgetAvailable): boolean {
  if (!ex) return false;
  return partsOf(ex).some((p) => {
    const spec = answerSpecOf(p);
    return spec !== null && !available(spec);
  });
}

/** The registry's answer as a boolean (`lessonWidgetFor` returns `null` for a kind without a widget). */
export function registryHas(widgetFor: (spec: AnswerSpecOf<AnswerKind>) => unknown): WidgetAvailable {
  return (spec) => widgetFor(spec as AnswerSpecOf<AnswerKind>) !== null;
}

type CodePart = Extract<Exercise, { kind: "code-modify" | "code-make" | "error-hunt" | "code-fill" }>;

/**
 * A "match this sound" step (A1.L02–L04): a code step graded on its controls (`matcher.m === "controls"`). The
 * learner matches a sound by ear, so the sound to match plays from the start (A: yours, B: the sound to match).
 */
export function isMatchSound(ex: Exercise | undefined): boolean {
  if (!ex) return false;
  const m = (ex as Partial<CodePart> & { matcher?: { m?: string } }).matcher;
  return (ex.kind === "code-modify" || ex.kind === "code-make") && m?.m === "controls";
}

/** The A/B labels of a "match this sound" step. */
export const MATCH_SOUND_LABELS = { a: "Your sound", b: "The sound to match" } as const;

/**
 * What the lesson host passes the Workbench for the scope panel of a step: the step's own panels (`initialPanels`
 * scope / spectrum) and its probe, merged with the panels the learner's code asked for (`.scope()`, `.fscope()`).
 * `null` when the step shows neither (the Workbench then opens the panel only from the code).
 */
export function stepScopePanel(
  ui: Parameters<typeof scopePanelOf>[0],
  fromCode: readonly ScopePanel[] = [],
): ScopePanelHostProps | null {
  const p = scopePanelOf(ui, fromCode);
  return p.panels.length > 0 || p.probe !== null ? p : null;
}
