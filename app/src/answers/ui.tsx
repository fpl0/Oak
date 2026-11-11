// Shared pieces of every answer widget: the frame (group label, Enter to check, the feedback line with reserved
// height so feedback never shifts the layout), per-part marks, the theme for degree colours, the key hints.
import { clsx } from "clsx";
import { Check, Eye, Loader2, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Kbd } from "../ui/kit/index.ts";
import type { AnswerFeedback, AnswerValue, PartMark } from "./types.ts";
import { InlineMd } from "./widgets/InlineMd.tsx";

// --- theme --------------------------------------------------------------------------------------

/** Paper or Bark, following `<html data-theme>` (degree colours are data, not CSS). */
export { useThemeName } from "../ui/theme/use-theme-name.ts";

// --- marks --------------------------------------------------------------------------------------

export type Mark = "ok" | "bad" | null;

/** The mark of one part, or null when the feedback carries none for it. */
export function markOf(feedback: AnswerFeedback, part: number | string): PartMark | null {
  if (feedback.state === "idle" || feedback.state === "pending") return null;
  return feedback.marks?.find((m) => m.part === part) ?? null;
}

export function markState(feedback: AnswerFeedback, part: number | string): Mark {
  const m = markOf(feedback, part);
  return m ? (m.ok ? "ok" : "bad") : null;
}

/** The correct value, only when the host revealed it. */
export function revealedOf<V = AnswerValue>(feedback: AnswerFeedback): V | null {
  return feedback.state === "revealed" ? (feedback.correct as V) : null;
}

/** Border and ring classes for a marked part. The border width never changes, so nothing moves. */
export function markRing(mark: Mark): string {
  if (mark === "ok") return "border-accent ring-1 ring-accent";
  if (mark === "bad") return "border-issue ring-1 ring-issue";
  return "";
}

/** A small corner badge for a marked part (icon + screen-reader word): colour is never alone. */
export function MarkBadge({ mark, note }: { mark: Mark; note?: string | undefined }) {
  if (!mark) return null;
  return (
    <span
      className={clsx(
        "pointer-events-none absolute -top-1.5 -right-1.5 inline-flex size-4 items-center justify-center rounded-full",
        mark === "ok" ? "bg-accent text-on-accent" : "bg-issue text-white",
      )}
      title={note}
    >
      {mark === "ok" ? <Check aria-hidden className="size-3" /> : <X aria-hidden className="size-3" />}
      <span className="sr-only">{mark === "ok" ? "right" : "not this one"}</span>
    </span>
  );
}

// --- frame --------------------------------------------------------------------------------------

const STATUS_DEFAULT: Record<Exclude<AnswerFeedback["state"], "idle">, string> = {
  pending: "Checking…",
  correct: "That's it.",
  wrong: "Not quite.",
  revealed: "The answer is shown next to yours.",
};

function statusText(feedback: AnswerFeedback): string {
  if (feedback.state === "idle") return "";
  if (feedback.state === "wrong") {
    if (feedback.message) return feedback.message;
    const bad = feedback.marks?.filter((m) => !m.ok).length ?? 0;
    if (bad > 0) return `Not quite: ${bad} ${bad === 1 ? "part differs" : "parts differ"}.`;
  }
  return STATUS_DEFAULT[feedback.state];
}

/** The one-line feedback under a widget: reserved height, polite live region, icon plus words. */
export function FeedbackLine({ feedback, id }: { feedback: AnswerFeedback; id: string }) {
  const text = statusText(feedback);
  const icon =
    feedback.state === "pending" ? (
      <Loader2 aria-hidden className="size-4 animate-spin reduced:animate-none" />
    ) : feedback.state === "correct" ? (
      <Check aria-hidden className="size-4 text-accent" />
    ) : feedback.state === "wrong" ? (
      <X aria-hidden className="size-4 text-issue" />
    ) : feedback.state === "revealed" ? (
      <Eye aria-hidden className="size-4 text-accent-2" />
    ) : null;
  return (
    <p
      id={id}
      aria-live="polite"
      data-testid="answer-status"
      className="flex min-h-6 items-start gap-1.5 text-sm text-text-2"
    >
      <span className="mt-0.5 inline-flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0">
        <InlineMd text={text} />
      </span>
    </p>
  );
}

export interface FrameProps {
  kind: string;
  idBase: string;
  label: string;
  feedback: AnswerFeedback;
  disabled?: boolean | undefined;
  onSubmit(): void;
  /** Widget keys; return true when handled (the frame then prevents the default). */
  onKey?: ((e: KeyboardEvent<HTMLElement>) => boolean) | undefined;
  /** Let Enter through (multi-line inputs); `Mod+Enter` still checks. */
  enterIsNewline?: boolean;
  /** Keys this widget answers to, shown under it. */
  keys?: ReactNode;
  /** Visible question text above the controls (the host usually shows the prompt itself). */
  caption?: ReactNode;
  /** A tap pad says so (contracts: only a tap pad may take Space). */
  keyscope?: "tap";
  className?: string;
  children: ReactNode;
}

/** True for the platform's command modifier. */
export function isMod(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey;
}

/**
 * The frame every widget renders in: `role="group"` named by `label`, Enter = Check (never while disabled,
 * never with Alt, never while an IME composes), the widget's own keys, and the feedback line.
 */
export function AnswerFrame(p: FrameProps) {
  const statusId = `${p.idBase}-status`;
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (p.onKey?.(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== "Enter" || e.altKey) return;
    if (p.enterIsNewline && !isMod(e)) return;
    const target = e.target as HTMLElement;
    // Links and the widget's own "play" buttons keep their Enter; everything else checks.
    if (target.closest("a[href], [data-enter='native']")) return;
    e.preventDefault();
    e.stopPropagation();
    if (!p.disabled) p.onSubmit();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
    <div
      role="group"
      aria-labelledby={`${p.idBase}-label`}
      aria-describedby={statusId}
      aria-busy={p.feedback.state === "pending" || undefined}
      aria-disabled={p.disabled || undefined}
      data-answer={p.kind}
      data-feedback={p.feedback.state}
      data-keyscope={p.keyscope}
      onKeyDown={onKeyDown}
      className={clsx("flex min-w-0 flex-col gap-2", p.className)}
    >
      <span id={`${p.idBase}-label`} className={p.caption ? "font-medium" : "sr-only"}>
        {p.caption ?? p.label}
      </span>
      {p.caption ? <span className="sr-only">{p.label}</span> : null}
      {p.children}
      <FeedbackLine feedback={p.feedback} id={statusId} />
      {p.keys ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-text-3">
          {p.keys}
        </div>
      ) : null}
    </div>
  );
}

/** "`1`–`7` pick" style key hints. */
export function KeyHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 ? <span aria-hidden>/</span> : null}
          <Kbd>{k}</Kbd>
        </span>
      ))}
      <span>{children}</span>
    </span>
  );
}

/** A digit key (top row or numpad) as a number, ignoring modifiers other than Shift. */
export function digitOf(e: {
  code: string;
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): number | null {
  if (e.altKey || e.metaKey || e.ctrlKey) return null;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code) ?? /^(\d)$/.exec(e.key);
  return m ? Number(m[1]) : null;
}

/** Focus the first focusable control inside `el` (the `autoFocus` prop). */
export function focusFirst(el: HTMLElement | null): void {
  el?.querySelector<HTMLElement>(
    "[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex='0']",
  )?.focus();
}
