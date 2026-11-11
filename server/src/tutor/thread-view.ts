// The merged timeline the panel shows for one subject (contracts §10.2): all days, all four
// conversations, in time order. Tutor text is returned as typed segments (markup.ts), so the UI
// never parses raw model output on its own. Read-only: nothing here calls a model or writes.
import type { TutorNote } from "./domain.ts";
import type { TutorErrorKind } from "./errors.ts";
import { type MarkupOptions, parseMarkup, type Segment } from "./markup.ts";
import type { CardRecord, TutorPorts } from "./ports.ts";
import { answerPolicy, disclosureLevel } from "./redaction.ts";
import { learnerDay, parseConversationId } from "./threads.ts";
import type { BackendId, Lane, Rung, SubjectRef, ThreadKind, TranscriptEntry } from "./types.ts";

export const THREAD_DEFAULT_LIMIT = 200;
export const THREAD_MAX_LIMIT = 500;
const NOTE_CHIPS = 20;

export interface ThreadEntryView {
  conversationId: string;
  seq: number;
  at: string;
  /** The learner-local day of the conversation. Days before `today` are read-only history. */
  day: string | null;
  lane: Lane | null;
  kind: ThreadKind;
  role: "user" | "assistant";
  /** User: the text as typed (render as plain text). Assistant: sanitized markdown. */
  text: string;
  /** Assistant entries only. */
  segments: Segment[] | null;
  /** The learner's code is not echoed back: it can be 40 kB per turn and the editor already has it. */
  hasLearnerCode: boolean;
  cards: CardRecord[];
  review: unknown | null;
  stepId: string | null;
  rung: Rung | null;
  backend: BackendId | null;
  /** A turn that failed or was stopped. It is shown, and never replayed to a model. */
  failed: boolean;
  errorKind: TutorErrorKind | null;
}

export interface ThreadView {
  subject: SubjectRef;
  today: string;
  entries: ThreadEntryView[];
  /** True when older entries were left out by the limit. */
  truncated: boolean;
  /** The subject's non-retracted tutor notes, newest first: the chips with Remove. */
  notes: TutorNote[];
}

export async function buildThreadView(
  subject: SubjectRef,
  ports: Pick<TutorPorts, "conversations" | "notes" | "lessons" | "progress" | "clock">,
  opts: { limit?: number } = {},
): Promise<ThreadView> {
  const limit = Math.min(THREAD_MAX_LIMIT, Math.max(1, Math.trunc(opts.limit ?? THREAD_DEFAULT_LIMIT)));
  const all = await ports.conversations.timeline(subject);
  const shown = all.slice(-limit);
  const today = learnerDay(ports.clock.now(), ports.clock.timeZone());

  const [terms, progress] = await Promise.all([ports.progress.termsIntroduced(), ports.progress.snapshot()]);
  const base: MarkupOptions = {};
  // The ports carry a count plus the most recent IDs. A badge is only decided here when that list
  // is the whole set; otherwise it is left unset and the UI resolves it from its own full list.
  if (terms.count <= terms.recent.length) base.introducedTerms = new Set(terms.recent);
  if (progress.unlocked.count <= progress.unlocked.recent.length)
    base.unlockedTools = new Set(progress.unlocked.recent);

  // `[[reveal]]` is a live button only on today's hint and chat conversations of a lesson step
  // that is still graded and unpassed. That is server state now, not what was true when it was written.
  const revealByStep = new Map<string, boolean>();
  const revealAllowed = async (e: TranscriptEntry, day: string | null, lane: Lane | null) => {
    if (subject.subjectKind !== "lesson" || e.stepId === null || day !== today) return false;
    if (lane !== "hint" && lane !== "chat") return false;
    let allowed = revealByStep.get(e.stepId);
    if (allowed === undefined) {
      const step = await ports.lessons.step(subject.subjectId, e.stepId);
      allowed =
        step !== null &&
        answerPolicy(step, disclosureLevel(await ports.progress.stepState(step.lessonId, step.id))) ===
          "socratic";
      revealByStep.set(e.stepId, allowed);
    }
    return allowed;
  };

  const entries: ThreadEntryView[] = [];
  for (const e of shown) {
    const key = parseConversationId(e.conversationId);
    const day = key?.day ?? null;
    const lane = key?.lane ?? null;
    const cards: CardRecord[] = [];
    for (const id of e.cardIds) {
      const card = await ports.conversations.card(id);
      if (card !== null) cards.push(card);
    }
    entries.push({
      conversationId: e.conversationId,
      seq: e.seq,
      at: e.at,
      day,
      lane,
      kind: e.kind,
      role: e.role,
      text: e.text,
      segments:
        e.role === "assistant"
          ? parseMarkup(e.text, { ...base, revealAllowed: await revealAllowed(e, day, lane) })
          : null,
      hasLearnerCode: e.learnerCode !== null && e.learnerCode !== "",
      cards,
      review: e.review,
      stepId: e.stepId,
      rung: e.rung,
      backend: e.backend,
      failed: e.excluded,
      errorKind: e.errorKind,
    });
  }
  return {
    subject,
    today,
    entries,
    truncated: all.length > shown.length,
    notes: await ports.notes.recent(subject, NOTE_CHIPS),
  };
}
