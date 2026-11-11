// Types of the one toolbox-aware lint pass (contracts §3.3, §11.3). The implementation is `lintOak` in
// @oak/grader (it needs acorn and @strudel/mini, which this package may not import); the CM6 editor,
// both grader hosts, content CI and the tutor's card validator all call that one function.
import type { FeedbackId, ToolId, UnlockableId } from "./ids.ts";
import type { CodeRange, KeySpec, MeterId } from "./schema/common.ts";

export const LINT_PROFILES = ["graded", "studio", "content", "tutor-card", "band"] as const;
/**
 * graded: lesson steps, Make, checkpoints, capstones (locked tool = error).
 * studio: Studio and own-audio Transcribe (locked tool = info, never blocks).
 * content: content CI over authored code (strict; locked = error unless `allowPreview`).
 * tutor-card: `propose_code` and review `tryCode` (strict; a locked tool marks the card "preview").
 * band: Band-layer code (strict; locked tools allowed).
 */
export type LintProfile = (typeof LINT_PROFILES)[number];

/** Profiles that also apply the strict safety profile: code the learner did not type. */
export const STRICT_PROFILES: readonly LintProfile[] = ["content", "tutor-card", "band"];

export interface LintContext {
  profile: LintProfile;
  /** For a lesson: `unlocked ∪ unlocksOf(currentSession)` (contracts §3.1 rule 2). */
  unlocked: ReadonlySet<UnlockableId>;
  /** A `preview: true` example or a tutor Preview card. */
  allowPreview: boolean;
  meter: MeterId;
  key: KeySpec | null;
}

export type LintSeverity = "error" | "warn" | "info";
export interface LintDiagnostic {
  id: FeedbackId;
  severity: LintSeverity;
  /** Offsets into the linted text. */
  range: CodeRange;
  line: number;
  params: Record<string, string | number>;
  /** The catalog template rendered with `params`. */
  message: string;
}
export interface LintResult {
  /** No diagnostic of severity `error`: the code may be evaluated. */
  ok: boolean;
  diagnostics: LintDiagnostic[];
  /** Every catalogued thing the code uses. */
  used: UnlockableId[];
  /** Used but not in `ctx.unlocked`. */
  locked: UnlockableId[];
  /** `locked` narrowed to `tb.*` IDs: what a sketch stores in `flags.lockedTools`. */
  lockedTools: ToolId[];
}
