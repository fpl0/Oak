// The merged timeline of one subject (contracts §10.2): every day and every lane, oldest first, from the server
// record, followed by the turns this panel is running. A live turn shows its progress (the summarised-thinking
// line, tool activity, the phase), streams its text, its cards and its review, and on failure keeps what it wrote
// with the right way forward (Retry, a cool-down, the settings page, or rephrasing).
import {
  type CardData,
  type CardRecord,
  type SubjectRef,
  type TranscriptEntry,
  TUTOR_ERROR_COPY,
  type TutorErrorKind,
} from "@oak/api";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Check, ChevronRight, CircleAlert, Leaf, Loader2, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "../lib/format.ts";
import { useStepHint } from "../lib/queries.ts";
import { retryAt, type TurnState } from "../lib/tutor-stream.ts";
import { Button } from "../ui/kit/Button.tsx";
import { CodeCard } from "./CodeCard.tsx";
import { patchSubject, type TutorSubject, tutorHostFor } from "./context.ts";
import { Markdown } from "./Markdown.tsx";
import type { TokenContext } from "./music-tokens.ts";
import { ReviewView, reviewOf } from "./ReviewView.tsx";
import { dismissTurn, type LiveTurn, retryTurn, stopTurn, useTurns } from "./turns.ts";

/** What a tool call looks like to the learner. Fixed copy: nothing the tool saw is shown. */
export const TOOL_ACTIVITY: Record<string, { running: string; ok: string; failed: string }> = {
  evaluate_strudel: {
    running: "Playing your code headlessly",
    ok: "Played your code headlessly",
    failed: "Your code did not run headlessly",
  },
  compare_haps: {
    running: "Comparing with the target",
    ok: "Compared with the target",
    failed: "Could not compare",
  },
  get_learner_progress: {
    running: "Looking at your progress",
    ok: "Looked at your progress",
    failed: "Progress not read",
  },
  get_lesson_context: {
    running: "Reading the step",
    ok: "Read the step",
    failed: "The step could not be read",
  },
  propose_code: {
    running: "Writing a code card",
    ok: "Wrote a code card",
    failed: "A code card did not pass Oak's checks",
  },
  submit_capstone_review: {
    running: "Writing the review",
    ok: "Wrote the review",
    failed: "The review was sent back",
  },
  submit_transcription_review: {
    running: "Writing the review",
    ok: "Wrote the review",
    failed: "The review was sent back",
  },
};
const toolCopy = (name: string) =>
  TOOL_ACTIVITY[name] ?? { running: "Working", ok: "Done", failed: "A step failed" };

const ERROR_TITLE: Partial<Record<TutorErrorKind, string>> = {
  aborted: "Stopped",
  rate_limit: "Claude is cooling down",
  auth: "The tutor is not signed in",
  refusal: "Claude did not answer that",
};

// --- day grouping -----------------------------------------------------------------------------------

/** The learner-local day of an instant (04:00 rollover, contracts §10.2). */
export function learnerDay(iso: string | number): string {
  const d = new Date(typeof iso === "number" ? iso : Date.parse(iso));
  d.setHours(d.getHours() - 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const y = new Date(`${today}T12:00:00`);
  y.setDate(y.getDate() - 1);
  if (day === learnerDay(y.getTime() + 4 * 3_600_000)) return "Yesterday";
  return formatDate(`${day}T12:00:00`);
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-text-3" data-testid="day-divider">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

// --- pieces ------------------------------------------------------------------------------------------

function YouBubble({ text }: { text: string }) {
  // The selection travels inside the message; show the learner's own words and say a selection went with them.
  const [own, sel] = text.split("\n\nSelected code:\n");
  return (
    <div className="ml-6 self-end rounded-card rounded-br-sm bg-lane-in px-3 py-2 text-sm whitespace-pre-wrap break-words">
      <span className="sr-only">You: </span>
      {own}
      {sel && <span className="mt-1 block text-xs text-text-3">with your selected code</span>}
    </div>
  );
}

function ClaudeMark() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-text-2">
      <Leaf aria-hidden className="size-3.5 text-accent" /> Claude
    </span>
  );
}

function RevealButton({ subject }: { subject: TutorSubject }) {
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hint = useStepHint();
  const qc = useQueryClient();
  if (done || (subject.rung ?? 0) >= 4)
    return <span className="text-sm text-text-2">Hint 4 is open in the lesson: the answer is there.</span>;
  const reveal = async () => {
    const host = tutorHostFor(subject.thread);
    try {
      if (host?.reveal) await host.reveal();
      else if (subject.lessonId && subject.stepId) {
        await hint.mutateAsync({
          params: { id: subject.lessonId, stepId: subject.stepId },
          body: { reveal: true },
        });
        await qc.invalidateQueries({ queryKey: ["api", "steps.state"] });
      }
      patchSubject(subject.thread, { rung: 4 });
      setDone(true);
    } catch (e) {
      setConfirm(false);
      const msg = e instanceof Error ? e.message : "";
      setProblem(
        /not available/.test(msg)
          ? "Hint 4 opens after you have checked this step twice. Try once more first."
          : "The reveal was not recorded. Try again, or use the lesson's hint button.",
      );
    }
  };
  if (!confirm)
    return (
      <span className="my-1 inline-flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirm(true)} data-testid="reveal">
          Reveal (hint 4)
        </Button>
        {problem && (
          <span role="status" className="text-sm text-text-2" data-testid="reveal-problem">
            {problem}
          </span>
        )}
      </span>
    );
  return (
    <span className="my-1 flex flex-wrap items-center gap-2 rounded-control border border-accent-2/50 bg-accent-2/10 p-2 text-sm">
      <span className="basis-full">Show the answer? This step then counts as assisted.</span>
      <Button size="sm" variant="primary" loading={hint.isPending} onClick={reveal} autoFocus>
        Reveal the answer
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Not yet
      </Button>
    </span>
  );
}

function revealRenderer(allowed: boolean, subject: TutorSubject) {
  return () =>
    subject.graded && (subject.rung ?? 0) >= 4 ? (
      <span className="text-sm text-text-2">Hint 4 is open in the lesson: the answer is there.</span>
    ) : allowed && subject.graded && !subject.passed ? (
      <RevealButton subject={subject} />
    ) : (
      <span className="text-sm text-text-3">(the answer stays in the lesson's hint ladder)</span>
    );
}

function Cards({
  cards,
  subject,
  thread,
  ctx,
}: {
  cards: (CardData | CardRecord)[];
  subject: TutorSubject;
  thread: SubjectRef;
  ctx: TokenContext;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {cards.map((c) => (
        <CodeCard
          key={c.cardId}
          card={c}
          subject={subject}
          thread={thread}
          ctx={ctx}
          applied={"applied" in c ? c.applied : false}
        />
      ))}
    </div>
  );
}

// --- history -----------------------------------------------------------------------------------------

export function HistoryEntry({
  entry,
  cards,
  subject,
  ctx,
  revealAllowed,
}: {
  entry: TranscriptEntry;
  cards: CardRecord[];
  subject: TutorSubject;
  ctx: TokenContext;
  revealAllowed: boolean;
}) {
  if (entry.role === "user") return <YouBubble text={entry.text} />;
  const review = entry.review ? reviewOf(entry.review) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="tutor-message" data-status="done">
      <ClaudeMark />
      {entry.text.trim() && (
        <Markdown
          text={entry.text}
          ctx={ctx}
          thread={subject.thread}
          renderReveal={revealRenderer(revealAllowed, subject)}
        />
      )}
      <Cards
        cards={cards.filter((c) => entry.cardIds.includes(c.cardId))}
        subject={subject}
        thread={subject.thread}
        ctx={ctx}
      />
      {review && (
        <ReviewView
          data={review}
          subject={subject}
          thread={subject.thread}
          ctx={ctx}
          id={`${entry.conversationId}-${entry.seq}`}
        />
      )}
      {!entry.text.trim() && !review && entry.cardIds.length === 0 && (
        <p className="text-sm text-text-2">
          Claude had nothing to add this time. Try asking in a different way.
        </p>
      )}
    </div>
  );
}

// --- live --------------------------------------------------------------------------------------------

function Cooldown({ until, onReady, busy }: { until: number; onReady(): void; busy: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= until) return;
    const t = setTimeout(() => setNow(Date.now()), 1_000);
    return () => clearTimeout(t);
  }, [now, until]);
  const left = Math.max(0, Math.ceil((until - now) / 1_000));
  if (left === 0) {
    return (
      <Button
        size="sm"
        icon={<RotateCcw aria-hidden className="size-3.5" />}
        onClick={onReady}
        disabled={busy}
        title={busy ? BUSY_TITLE : undefined}
      >
        Retry
      </Button>
    );
  }
  return (
    <span className="text-sm text-text-2 tabular-nums" aria-live="off">
      Cooling down — {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}

/** Why Retry waits: turns run one at a time. */
const BUSY_TITLE = "Claude is answering another message. Retry when it has finished.";

function TurnError({ turn, onRephrase }: { turn: LiveTurn; onRephrase(text: string): void }) {
  const err = turn.state.error as NonNullable<TurnState["error"]>;
  const busy = useTurns((s) => s.turns.some((t) => t.state.status === "streaming"));
  const retry = () => void retryTurn(turn.id);
  const until = retryAt(turn.state, turn.finishedAt ?? Date.now());
  const title = err.stalled
    ? "Claude stopped responding"
    : (ERROR_TITLE[err.kind] ?? `Claude was interrupted (${err.kind.replace("_", " ")})`);
  return (
    <div
      role="status"
      data-testid="turn-error"
      data-kind={err.kind}
      className={clsx(
        "flex flex-col gap-2 rounded-control border p-2.5 text-sm",
        err.kind === "aborted" ? "border-border bg-surface-2" : "border-issue/40 bg-issue/8",
      )}
    >
      <p className="flex items-start gap-1.5">
        {err.kind !== "aborted" && <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-issue" />}
        <span>
          <span className="font-medium">{title}.</span>{" "}
          <span className="text-text-2">
            {err.kind === "aborted"
              ? turn.state.text
                ? "What Claude wrote so far is kept."
                : "Nothing was written."
              : err.message || TUTOR_ERROR_COPY[err.kind]}
            {turn.state.text && err.kind !== "aborted" ? " The partial answer is kept above." : ""}
          </span>
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {err.kind === "auth" ? (
          <Link
            to="/settings/tutor"
            className="text-sm font-medium text-link underline-offset-2 hover:underline"
          >
            Open Settings › Tutor
          </Link>
        ) : err.kind === "refusal" ? (
          <Button size="sm" onClick={() => onRephrase(turn.label)}>
            Rephrase
          </Button>
        ) : until > Date.now() ? (
          <Cooldown until={until} onReady={retry} busy={busy} />
        ) : (
          <Button
            size="sm"
            icon={<RotateCcw aria-hidden className="size-3.5" />}
            onClick={retry}
            disabled={busy}
            title={busy ? BUSY_TITLE : undefined}
          >
            {err.kind === "aborted" ? "Send again" : "Retry"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={<X aria-hidden className="size-3.5" />}
          onClick={() => dismissTurn(turn.id)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const lastLine =
    text
      .trim()
      .split(/(?<=[.?!])\s+/)
      .at(-1) ?? "";
  return (
    <div className="text-sm text-text-3 italic">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-control text-left hover:text-text-2"
        data-testid="thinking"
      >
        <ChevronRight
          aria-hidden
          className={clsx("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        {open ? "Thinking" : live ? `Thinking: ${lastLine}` : "Thinking summary"}
      </button>
      {open && <p className="mt-1 ml-4 whitespace-pre-wrap not-italic">{text}</p>}
    </div>
  );
}

export function LiveTurnView({
  turn,
  subject,
  ctx,
  onRephrase,
}: {
  turn: LiveTurn;
  subject: TutorSubject;
  ctx: TokenContext;
  onRephrase(text: string): void;
}) {
  const s = turn.state;
  const streaming = s.status === "streaming";
  const empty = s.status === "done" && !s.text.trim() && s.cards.length === 0 && !s.review;
  const drafting = Object.keys(s.drafts).length > 0;
  return (
    <>
      <YouBubble text={turn.label} />
      <div
        className="flex flex-col gap-2"
        data-testid="tutor-message"
        data-status={s.status}
        aria-busy={streaming}
      >
        <div className="flex items-center justify-between gap-2">
          <ClaudeMark />
          {streaming && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Square aria-hidden className="size-3" />}
              onClick={() => stopTurn(turn.id)}
              aria-keyshortcuts="Escape"
            >
              Stop
            </Button>
          )}
        </div>
        <Thinking text={s.thinking} live={streaming && !s.text} />
        {s.tools.length > 0 && (
          <ul
            className="flex flex-col gap-0.5 text-xs text-text-3"
            aria-label="What Claude did"
            data-testid="tool-activity"
          >
            {s.tools.map((t) => {
              const c = toolCopy(t.name);
              return (
                <li key={t.toolUseId} className="flex items-center gap-1.5">
                  {t.ok === null ? (
                    <Loader2 aria-hidden className="size-3 animate-spin reduced:animate-none" />
                  ) : t.ok ? (
                    <Check aria-hidden className="size-3 text-accent" />
                  ) : (
                    <CircleAlert aria-hidden className="size-3 text-issue" />
                  )}
                  {t.ok === null ? c.running : t.ok ? c.ok : c.failed}
                </li>
              );
            })}
          </ul>
        )}
        {s.text && (
          <Markdown
            text={s.text}
            ctx={ctx}
            thread={turn.thread}
            renderReveal={revealRenderer(s.meta?.revealAllowed ?? false, subject)}
          />
        )}
        {streaming && (
          <p className="flex items-center gap-1.5 text-xs text-text-3" data-testid="turn-phase">
            <span
              aria-hidden
              className="size-1.5 animate-pulse rounded-full bg-accent reduced:animate-none"
            />
            {drafting ? "Drafting a code card…" : (s.phase?.label ?? "Waiting for Claude…")}
          </p>
        )}
        <Cards cards={s.cards} subject={subject} thread={turn.thread} ctx={ctx} />
        {s.review && (
          <ReviewView
            data={s.review as Parameters<typeof ReviewView>[0]["data"]}
            subject={subject}
            thread={turn.thread}
            ctx={ctx}
            id={`live-${turn.id}`}
          />
        )}
        {empty && (
          <p className="text-sm text-text-2">
            Claude had nothing to add this time. Try asking in a different way.
          </p>
        )}
        {s.status === "error" && <TurnError turn={turn} onRephrase={onRephrase} />}
      </div>
    </>
  );
}

export { DayDivider, dayLabel };
