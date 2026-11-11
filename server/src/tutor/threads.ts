// The thread model (contracts §10.2, §10.4, §10.9).
//
// The learner sees one thread per subject. The model sees up to four conversations per subject
// per learner-local day (hint, note, chat, review), each with one constant effort. A new day
// starts new conversations, which bounds token growth; earlier days stay as read-only history.
// Nothing is ever updated or deleted.
import type { Rung, StepSource, StepState, TutorNote } from "./domain.ts";
import type {
  Clock,
  ConversationRecord,
  ConversationStore,
  ProgressPort,
  SettingsPort,
  TutorNotesStore,
  UsageSink,
} from "./ports.ts";
import {
  type ConversationKey,
  type Effort,
  LANES,
  type Lane,
  laneFor,
  SUBJECT_KINDS,
  type SubjectKind,
  type SubjectRef,
  type ThreadKind,
  type TranscriptEntry,
} from "./types.ts";

/** The learner-local day rolls over at 04:00, so a late session stays on one day. */
export const DAY_ROLLOVER_HOUR = 4;
/** Tutor hints share the step's ladder but stop at rung 3; rung 4 is reached only through the UI. */
export const MAX_TUTOR_RUNG: Rung = 3;
export const SEED_NOTES = 10;
const MAX_HANDOFFS = 5;

function localParts(now: Date, timeZone: string): { y: number; m: number; d: number; h: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const get = (type: string, parts: Intl.DateTimeFormatPart[]) =>
    Number(parts.find((p) => p.type === type)?.value);
  const parts = fmt.formatToParts(now);
  return { y: get("year", parts), m: get("month", parts), d: get("day", parts), h: get("hour", parts) };
}

/** `YYYY-MM-DD` in the learner's zone, with the 04:00 rollover. An unknown zone falls back to UTC. */
export function learnerDay(now: Date, timeZone: string): string {
  let p: ReturnType<typeof localParts>;
  try {
    p = localParts(now, timeZone);
  } catch {
    p = localParts(now, "UTC");
  }
  // Calendar arithmetic on the local date, so a DST change cannot move the boundary.
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d - (p.h < DAY_ROLLOVER_HOUR ? 1 : 0)));
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM` of a learner-local day: the unit of the budget. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function conversationKey(subject: SubjectRef, kind: ThreadKind, day: string): ConversationKey {
  return { subjectKind: subject.subjectKind, subjectId: subject.subjectId, day, lane: laneFor(kind) };
}

/** `<subjectKind>:<subjectId>:<yyyy-mm-dd>:<threadKind>` (contracts §1.2). */
export function conversationId(key: ConversationKey): string {
  return `${key.subjectKind}:${key.subjectId}:${key.day}:${key.lane}`;
}

export function parseConversationId(id: string): ConversationKey | null {
  const parts = id.split(":");
  if (parts.length < 4) return null;
  const subjectKind = parts[0] as SubjectKind;
  const lane = parts[parts.length - 1] as Lane;
  const day = parts[parts.length - 2] as string;
  const subjectId = parts.slice(1, -2).join(":");
  if (!SUBJECT_KINDS.includes(subjectKind) || !LANES.includes(lane)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || subjectId === "") return null;
  return { subjectKind, subjectId, day, lane };
}

export interface OpenConversation {
  record: ConversationRecord;
  /** Prior turns, failed tails left out. */
  transcript: TranscriptEntry[];
  isFirstTurn: boolean;
}

/** Find today's conversation for the key, or start it. The first message of a new day starts a new one. */
export async function openConversation(
  store: ConversationStore,
  key: ConversationKey,
  init: { effort: Effort; prefixVersion: string },
): Promise<OpenConversation> {
  let record = await store.find(key);
  if (record === null) {
    try {
      record = await store.create({ id: conversationId(key), key, ...init });
    } catch (e) {
      // Two requests raced for the same key: the UNIQUE constraint let one through.
      record = await store.find(key);
      if (record === null) throw e;
    }
  }
  const transcript = await store.entries(record.id);
  return { record, transcript, isFirstTurn: transcript.length === 0 };
}

/**
 * The notes a new conversation is seeded with: the most recent non-retracted ones, this
 * subject's first, then the general ones (contracts §10.2 "Seeding").
 */
export async function seedNotes(
  notes: TutorNotesStore,
  subject: SubjectRef,
  limit = SEED_NOTES,
): Promise<TutorNote[]> {
  const own = await notes.recent(subject, limit);
  const general =
    subject.subjectKind === "general"
      ? []
      : await notes.recent({ subjectKind: "general", subjectId: "general" }, limit);
  const seen = new Set<string>();
  const out: TutorNote[] = [];
  for (const n of [...own, ...general]) {
    // A retracted note is never sent again, whatever the store returned.
    if (n.retractedAt !== null || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out.slice(0, limit);
}

/**
 * What the chat conversation should know about the subject's other conversations today: the
 * one-line summaries written since the last chat turn. Derived from the transcript, so there is
 * no mutable "pending" state to keep.
 */
export function handoffLines(subjectDay: readonly TranscriptEntry[], chatConversationId: string): string[] {
  let lastChat = -1;
  subjectDay.forEach((e, i) => {
    if (e.conversationId === chatConversationId) lastChat = i;
  });
  return subjectDay
    .slice(lastChat + 1)
    .filter((e) => e.conversationId !== chatConversationId && e.summary !== null && !e.excluded)
    .map((e) => e.summary as string)
    .slice(-MAX_HANDOFFS);
}

export function hintSummary(rung: Rung, stepId: string): string {
  return `hint at rung ${rung} on ${stepId}`;
}

/**
 * "Tutor hints count on the same ladder" (contracts §10.4). A request on the hint conversation
 * of a graded, unpassed step raises the stored rung by one BEFORE the model is called, exactly as
 * pressing Hint would, and never past 3. A chat message never moves the rung.
 */
export async function coupleHintRung(
  kind: ThreadKind,
  step: Pick<StepSource, "lessonId" | "id" | "grading">,
  state: StepState,
  progress: ProgressPort,
): Promise<StepState> {
  if (laneFor(kind) !== "hint" || step.grading !== "graded" || state.passed) return state;
  if (state.rung >= MAX_TUTOR_RUNG) return state;
  const stored = await progress.advanceHintRung(step.lessonId, step.id, MAX_TUTOR_RUNG);
  // Trust the store only upwards and only within the tutor's range: a faulty adapter must not
  // be able to open rung 4 from here.
  const rung = Math.min(MAX_TUTOR_RUNG, Math.max(state.rung, stored)) as Rung;
  return { ...state, rung };
}

export interface BudgetStatus {
  month: string;
  monthUsd: number;
  softMarkerUsd: number;
  softPassed: boolean;
  /** True the first time the month's estimate is seen past the marker: show the one toast. */
  firstSoftCrossing: boolean;
}

/**
 * The budget hook (contracts §10.9). The soft marker never blocks and never changes model or
 * effort. There is no hard cap (removed 2026-11-11). Subscription usage has no dollar figure and
 * so never counts towards the marker.
 */
export async function checkBudget(ports: {
  settings: SettingsPort;
  usage: UsageSink;
  clock: Clock;
}): Promise<BudgetStatus> {
  const settings = await ports.settings.tutor();
  const month = monthOf(learnerDay(ports.clock.now(), ports.clock.timeZone()));
  const { costUsd } = await ports.usage.month(month);
  const softPassed = costUsd >= settings.softMonthlyUsd;
  return {
    month,
    monthUsd: costUsd,
    softMarkerUsd: settings.softMonthlyUsd,
    softPassed,
    firstSoftCrossing: softPassed && settings.softWarnedMonth !== month,
  };
}
