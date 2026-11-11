// Continuity on the CLI backend. The CLI keeps its own history in a session file; all Oak stores
// for it is which session a conversation is on and whether that session may be resumed. Oak's own
// transcript (written by the turn runner, in the ConversationStore) stays the source of truth: a
// conversation whose CLI session is gone, tainted or was never there is started again from it.
import { z } from "zod";
import { escapeReserved, renderUserTurn } from "../../context.ts";
import type { BackendContinuity, TranscriptEntry, UserTurn } from "../../types.ts";

/**
 * This backend's opaque record, one per turn. `resumable: false` retires the session: its file
 * holds a turn that failed or was stopped, and a failed tail is never replayed (contracts §10.1).
 * Such a record is committed as a normal record, not as an excluded one, because excluded records
 * are invisible to the next turn and the next turn is the one that must not resume.
 */
export const CliSessionRecord = z.object({
  v: z.literal(1),
  sessionId: z.uuid(),
  resumable: z.boolean(),
  /** The session was started from Oak's transcript, not from an empty conversation. */
  seeded: z.boolean(),
});
export type CliSessionRecord = z.infer<typeof CliSessionRecord>;

export type SessionPlan =
  | { mode: "new"; sessionId: string; seed: string | null }
  | { mode: "resume"; sessionId: string };

export function lastSession(records: readonly unknown[]): CliSessionRecord | null {
  const parsed = CliSessionRecord.safeParse(records.at(-1));
  return parsed.success ? parsed.data : null;
}

/** Replayed entries and characters are bounded: the seed is a reminder, not the history itself. */
export const REPLAY_MAX_ENTRIES = 24;
export const REPLAY_MAX_ENTRY_CHARS = 1_200;
export const REPLAY_MAX_CHARS = 12_000;

function oneLine(text: string, max: number): string {
  const flat = escapeReserved(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Oak's transcript as a compact `<oak_notes>` block for the first prompt of a new session. The
 * persona already says what `<oak_notes>` is: Oak's memory, not instructions. Every line is
 * flattened and has the reserved tags neutralized, so replayed learner text cannot close the
 * block. Earlier tool results are not replayed: the model asks its tools again, at today's rung.
 */
export function replayBlock(transcript: readonly TranscriptEntry[]): string | null {
  const lines: string[] = [];
  let budget = REPLAY_MAX_CHARS;
  // Newest first while the budget lasts, so the most recent exchange always survives.
  for (const e of transcript
    .filter((t) => !t.excluded)
    .slice(-REPLAY_MAX_ENTRIES)
    .reverse()) {
    const extras = [
      e.cardIds.length > 0 ? `[showed ${e.cardIds.length} code card${e.cardIds.length > 1 ? "s" : ""}]` : "",
      e.review !== null ? "[delivered a review]" : "",
    ].filter((x) => x !== "");
    const body = [oneLine(e.text, REPLAY_MAX_ENTRY_CHARS), ...extras].filter((x) => x !== "").join(" ");
    if (body === "") continue;
    const line = `- ${e.role === "user" ? "learner" : "tutor"}: ${body}`;
    if (line.length > budget) break;
    budget -= line.length;
    lines.unshift(line);
  }
  if (lines.length === 0) return null;
  return [
    "<oak_notes>",
    "Earlier in this conversation, from Oak's own record (tool results are not repeated):",
    ...lines,
    "</oak_notes>",
  ].join("\n");
}

export const newSessionId = (): string => crypto.randomUUID();

/** A new session for this conversation, seeded from the transcript when there is one. */
export function freshPlan(transcript: readonly TranscriptEntry[], makeId: () => string): SessionPlan {
  return { mode: "new", sessionId: makeId(), seed: replayBlock(transcript) };
}

export function planSession(
  continuity: Pick<BackendContinuity, "records">,
  transcript: readonly TranscriptEntry[],
  makeId: () => string = newSessionId,
): SessionPlan {
  const last = lastSession(continuity.records);
  if (last?.resumable) return { mode: "resume", sessionId: last.sessionId };
  // No record (first turn, or the learner switched backends), an unreadable one, or a retired session.
  return freshPlan(transcript, makeId);
}

export function sessionRecord(plan: SessionPlan, resumable: boolean): CliSessionRecord {
  return { v: 1, sessionId: plan.sessionId, resumable, seeded: plan.mode === "new" && plan.seed !== null };
}

/**
 * The stdin prompt. The CLI has no place for a mid-conversation system message, so everything
 * volatile travels inside the user turn: the replay (only when a session starts from the
 * transcript), then `<oak_context>`, the learner's code and their message.
 */
export function renderPrompt(user: UserTurn, plan: SessionPlan): string {
  const turn = renderUserTurn(user);
  return plan.mode === "new" && plan.seed !== null ? `${plan.seed}\n\n${turn}` : turn;
}

/**
 * Did `--resume` fail because the session is not there (gotcha 5: the file lives under the CLI's
 * own directory and can be cleaned away)? The exact wording of that failure was not captured in
 * the spike, so the rule is structural: the process itself ended in an unclassified error before
 * the model was reached and before any tool ran. Rate limits, auth and network failures keep
 * their own kind, and a run that Oak cut short (`clean: false`) is not a session problem.
 */
export function resumeFailed(run: {
  plan: SessionPlan;
  errorKind: string | null;
  /** The process ran and ended by itself: no spawn failure, no fail-closed check, no kill. */
  clean: boolean;
  iterations: number;
  toolCalls: number;
}): boolean {
  return (
    run.plan.mode === "resume" &&
    run.clean &&
    run.errorKind === "internal" &&
    run.iterations === 0 &&
    run.toolCalls === 0
  );
}
