// Builds the volatile part of a user turn: the <oak_context> block and the wrappers for the
// learner's code and message (contracts §10.1 "Context injection").
//
// <oak_context> is the only app-authored text in a turn, and the persona tells the model so.
// Everything in it is redacted to the turn's level by redaction.ts. It is deterministic: fixed
// line order, sorted keys, nothing finer than the learner-local day, so equal inputs give equal
// bytes and the transcript stays cache-friendly.
import { answerForms, answerKindOf } from "./answer-guard.ts";
import type { GradeSnapshot, ReviewSource, TutorNote } from "./domain.ts";
import { hintsShown, type IssueView, redactGrade } from "./redaction.ts";
import { factLines } from "./review-facts.ts";
import type { TurnContext, UserTurn } from "./types.ts";
import { vocabularyLines, vocabularyOf } from "./vocabulary.ts";

export const CONTEXT_VERSION = "1";

/** Notes sent with the first turn of a conversation (contracts §10.2). */
export const MAX_NOTES = 10;
/** Introduced terms and unlocked tools are sent as a count plus the most recent (contracts §10.8). */
export const MAX_RECENT_TERMS = 30;
export const MAX_RECENT_TOOLS = 20;

const RESERVED_TAGS = /<(\/?)(oak_context|oak_notes|learner_code|learner_message)\b/gi;

/**
 * Text that is not Oak's own must not be able to close its wrapper and open an <oak_context> of
 * its own: that would give learner (or earlier model) text the app's authority.
 */
export function escapeReserved(text: string): string {
  return text.replace(RESERVED_TAGS, "&lt;$1$2");
}

/** One context value on one line. */
function inline(text: string, max = 600): string {
  const flat = escapeReserved(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A longer value: first line after the key, the rest indented, so no value can fake a key. */
function block(text: string, max = 4_000): string {
  const lines = escapeReserved(text.length > max ? `${text.slice(0, max - 1)}…` : text)
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
  return lines.join("\n  ");
}

function issueLine(v: IssueView): string {
  const where = [v.track, v.bar === null ? null : `bar ${v.bar}`, v.beat === null ? null : `beat ${v.beat}`]
    .filter((x) => x !== null)
    .join(" ");
  const parts = [`issue ${v.n}: ${where === "" ? "whole answer" : where}`];
  if (v.feedback !== undefined) parts.push(v.direction ? `${v.feedback} (${v.direction})` : v.feedback);
  if (v.what !== undefined) parts.push(inline(v.what));
  if (v.concept) parts.push(`concept: ${inline(v.concept)}`);
  if (v.fix) parts.push(`fix: ${inline(v.fix)}`);
  if (v.expected) parts.push(`expected: ${inline(v.expected)}`);
  if (v.got) parts.push(`got: ${inline(v.got)}`);
  return parts.join(" · ");
}

function checkerLines(grade: GradeSnapshot, ctx: Pick<TurnContext, "disclosure" | "step">): string[] {
  const view = redactGrade(grade, ctx.disclosure, ctx.step ? answerForms(ctx.step) : []);
  const dims = Object.entries(view.dims)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  const head = [
    `checker: ${view.status}`,
    `score ${view.score}`,
    `missing ${view.counts.missing}`,
    `extra ${view.counts.extra}`,
    `wrong ${view.counts.wrong}`,
  ];
  if (dims !== "") head.push(`dims ${dims}`);
  const lines = [head.join(" · "), ...view.issues.map(issueLine)];
  if (view.issues_omitted > 0) lines.push(`issues_omitted: ${view.issues_omitted}`);
  if (view.warnings.length > 0) lines.push(`lint: ${view.warnings.map((w) => inline(w, 80)).join(", ")}`);
  return lines;
}

function reviewLines(kind: string, subjectId: string, r: ReviewSource): string[] {
  const lines = [
    `review_of: ${kind} ${subjectId} "${inline(r.title, 120)}"`,
    `revisions_wanted: ${r.revisions}`,
    `total_bars: ${r.totalBars ?? "unknown"}`,
    `brief: ${block(r.brief)}`,
    `analysis: ${block(r.analysis)}`,
  ];
  for (const item of r.rubric) {
    lines.push(
      `rubric: ${inline(item.label, 160)}${item.required ? " (required)" : ""}: ${item.met ? "met" : "not met"}`,
    );
  }
  for (const item of r.checklist) lines.push(`checklist: ${inline(item, 160)}`);
  if (r.target?.kind === "album")
    lines.push(`review_target: album track ${inline(r.target.trackId, 80)} version ${r.target.version}`);
  else if (r.target?.kind === "transcription")
    lines.push(`review_target: transcription version ${r.target.version}`);
  // Oak's analysis, fact by fact: every strength and revision is anchored to bars listed here (contracts §10.6).
  if (r.facts) lines.push(...factLines(r.facts).map((l) => inline(l, 400)));
  // Only present once a graded ladder piece has passed (contracts §10.6).
  if (r.reference !== null) lines.push(`reference: ${block(r.reference)}`);
  return lines;
}

export function notesBlock(notes: readonly TutorNote[]): string {
  const lines = notes
    .slice(0, MAX_NOTES)
    .map((n) => `- ${n.day} · ${n.source} · ${n.subjectKind} ${n.subjectId}: ${inline(n.text, 400)}`);
  return ["<oak_notes>", ...lines, "</oak_notes>"].join("\n");
}

export function buildOakContext(ctx: TurnContext): string {
  const { conversation: key, step, lesson } = ctx;
  const lines: string[] = [];

  const screen = [`screen: ${key.subjectKind} ${inline(key.subjectId, 120)}`];
  const title = lesson?.title ?? ctx.facts.title;
  if (title) screen[0] += ` "${inline(title, 120)}"`;
  if (step) screen.push(`step ${step.id} (${step.kind}, ${step.grading})`);
  if (step && ctx.stepState) screen.push(`attempt ${ctx.stepState.attempts}`);
  lines.push(screen.join(" · "));

  const limit = [
    ctx.limits.maxWords === null ? null : `${ctx.limits.maxWords} words`,
    `${ctx.limits.maxCards} cards`,
  ];
  lines.push(
    `thread: ${ctx.kind} · day ${key.day} · reply_limit: ${limit.filter((x) => x !== null).join(", ")}`,
  );

  if (lesson) {
    // The step's own key wins over the lesson's (wave4.md §5.6): a step in G inside a lesson in C is in G.
    const key = step?.key ?? lesson.key;
    lines.push(`key: ${key ?? "none"} · meter: ${lesson.meter ?? "none"} · bpm: ${lesson.bpm ?? "none"}`);
  } else if (step?.key) lines.push(`key: ${step.key}`);
  const answerKind = step ? answerKindOf(step) : null;
  if (answerKind) lines.push(`answer_kind: ${inline(answerKind, 60)}`);
  if (step) {
    lines.push(`prompt: ${block(step.prompt, 1_200)}`);
    for (const c of step.constraints) lines.push(`constraint: ${inline(c, 200)}`);
    if (step.rubric) {
      step.rubric.forEach((r, i) => {
        const met = ctx.stepState?.rubricMet?.[i];
        const state = met === undefined ? "not checked" : met ? "met" : "not met";
        lines.push(`rubric: ${inline(r.label, 160)}${r.required ? " (required)" : ""}: ${state}`);
      });
    }
  }

  const rung =
    step?.grading === "graded" ? `${ctx.rung} of 4${ctx.stepState?.passed ? " (passed)" : ""}` : "n/a";
  lines.push(
    `hint_rung: ${rung} · answer_policy: ${ctx.answerPolicy} · reveal_token: ${ctx.revealAllowed ? "allowed" : "not available"}`,
  );
  lines.push(`cards: ${ctx.apply}`);
  lines.push(
    `learner_code: ${ctx.learnerCode === null ? "none" : `attached (${ctx.learnerCode.split("\n").length} lines)`}`,
  );

  if (ctx.grade) lines.push(...checkerLines(ctx.grade, ctx));
  if (step) {
    hintsShown(step.hints, ctx.disclosure).forEach((h, i) => {
      lines.push(`hint_shown ${i + 1}: ${inline(h, 400)}`);
    });
  }

  const terms = ctx.terms.recent.slice(0, MAX_RECENT_TERMS);
  lines.push(`terms_introduced: ${ctx.terms.count} · recent: ${terms.length ? terms.join(", ") : "none"}`);
  lines.push(...vocabularyLines(vocabularyOf(ctx.terms)));
  const tools = ctx.progress.unlocked.recent.slice(0, MAX_RECENT_TOOLS);
  lines.push(
    `tools_unlocked: ${ctx.progress.unlocked.count} · recent: ${tools.length ? tools.join(", ") : "none"}`,
  );
  const p = ctx.progress;
  lines.push(
    `progress: unit ${p.current.unit ?? "none"} · lesson ${p.current.lesson ?? "none"} · streak_weeks ${p.streakWeeks} · quiet ${p.quiet ? "yes" : "no"}`,
  );

  for (const h of ctx.handoffs) lines.push(`handoff: ${inline(h, 300)}`);
  if (ctx.review) lines.push(...reviewLines(key.subjectKind, key.subjectId, ctx.review));
  if (ctx.notes.length > 0) lines.push(notesBlock(ctx.notes));

  return [`<oak_context v="${CONTEXT_VERSION}">`, ...lines, "</oak_context>"].join("\n");
}

/**
 * The user turn as the contract's text blocks: context, then the learner's code, then their
 * message. The API backend sends them as separate text blocks; the CLI backend joins them
 * (`renderUserTurn`), because it has no other place for context (spike S8).
 */
export function userTurnBlocks(user: UserTurn): string[] {
  const blocks = [user.oakContext];
  if (user.learnerCode !== null)
    blocks.push(`<learner_code>\n${escapeReserved(user.learnerCode)}\n</learner_code>`);
  blocks.push(`<learner_message>\n${escapeReserved(user.text)}\n</learner_message>`);
  return blocks;
}

export function renderUserTurn(user: UserTurn): string {
  return userTurnBlocks(user).join("\n\n");
}
