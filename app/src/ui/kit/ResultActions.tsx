// The result actions every judged exercise shows (docs/design/retry.md §2): "Try again" immediately before the
// primary action, the primary last in a right-aligned row, one key (Alt+R) for the retry, one line when the next
// take is practice. `useResultActions` is the logic (the key, where the focus lands when a result appears, where
// it goes after a retry); `ResultActions` is the row that uses it. A surface keeps its own state: it says whether
// a result is on screen (`resultKey`), what Try again does and what Continue does; the kit never grades, posts or
// moves on by itself.
import { ArrowRight, RotateCcw } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useId, useRef } from "react";
import { CONTINUE_LABEL, RETRY_KEYS, RETRY_LABEL, resultFocusTarget } from "../../lib/retry.ts";
import { IS_MAC, useHotkeys } from "../keys/KeymapProvider.tsx";
import { formatKeys } from "../keys/keymap.ts";
import { Button } from "./Button.tsx";
import { Kbd } from "./basics.tsx";

export interface UseResultActionsOptions {
  /**
   * Identity of the result on screen: a new value each time a new result appears (an attempt id, a take count),
   * `null` while there is none (before the first answer, during a take, after Try again).
   */
  resultKey: string | number | null;
  /** Try again; `null` hides the control (no result yet, or nothing to do again). */
  onRetry: (() => void) | null;
  /** Shown but not pressable (a check is posting, a take is running). */
  retryDisabled?: boolean;
  /** Continue; `null` when the surface has no primary of its own here. */
  onContinue: (() => void) | null;
  continueDisabled?: boolean;
  /** After Try again: the element the learner answers with (the pad, the editor, the Start button). */
  retryFocus?: () => HTMLElement | null;
  /** Move the focus when a result appears (default true). */
  focusOnResult?: boolean;
  /** Bind Alt+R (default true). Only one row on screen binds it. */
  shortcut?: boolean;
}

/** A field the learner is typing an answer in; a locked (read-only or disabled) one does not keep the focus. */
export function isEditing(active: Element | null): boolean {
  if (!(active instanceof Element) || active === document.body) return false;
  const field = active.closest(EDITABLE);
  if (field === null) return false;
  if (
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
    (field.readOnly || field.disabled)
  )
    return false;
  return true;
}

export interface ResultActionsApi {
  retryRef: Ref<HTMLButtonElement>;
  continueRef: Ref<HTMLButtonElement>;
  /** Runs Try again exactly as the button and Alt+R do (focus included). */
  retry(): void;
  retryAvailable: boolean;
  /** The key as shown on this platform ("⌥R", "Alt+R"). */
  retryKeyLabel: string;
}

const EDITABLE =
  "input:not([type=button]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true], .cm-editor";

/** The logic of the result row: Alt+R, focus on a new result, focus after a retry. */
export function useResultActions(o: UseResultActionsOptions): ResultActionsApi {
  const retryRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(o);
  latest.current = o;
  const retryAvailable = o.onRetry !== null && o.retryDisabled !== true;

  const retry = () => {
    const cur = latest.current;
    if (cur.onRetry === null || cur.retryDisabled === true) return;
    cur.onRetry();
    const target = cur.retryFocus;
    if (target) requestAnimationFrame(() => target()?.focus());
  };

  useHotkeys(
    [
      {
        id: "result.retry",
        keys: RETRY_KEYS,
        scope: "global",
        description: `${RETRY_LABEL} (after any result)`,
        allowInInput: true,
        when: () => latest.current.onRetry !== null && latest.current.retryDisabled !== true,
        run: retry,
      },
    ],
    o.shortcut !== false,
  );

  // A new result: the focus lands where Enter continues, or on Try again when Continue is held; never out of the
  // editor or a text field the learner is fixing the answer in.
  // The key is marked as shown only once its frame ran: under StrictMode (dev) the effect runs, is cleaned up and
  // runs again, and a result already on screen when the row mounts must still get the focus.
  const shown = useRef<string | number | null>(null);
  useEffect(() => {
    const key = o.resultKey;
    if (key === null) {
      shown.current = null;
      return;
    }
    if (shown.current === key) return;
    if (latest.current.focusOnResult === false) {
      shown.current = key;
      return;
    }
    let ran = false;
    const frame = requestAnimationFrame(() => {
      ran = true;
      shown.current = key;
      const cur = latest.current;
      const target = resultFocusTarget({
        continueEnabled:
          cur.onContinue !== null && cur.continueDisabled !== true && continueRef.current !== null,
        retryEnabled: cur.onRetry !== null && cur.retryDisabled !== true && retryRef.current !== null,
        inEditor: isEditing(document.activeElement),
      });
      if (target === "continue") continueRef.current?.focus();
      else if (target === "retry") retryRef.current?.focus();
    });
    return () => {
      if (!ran) cancelAnimationFrame(frame);
    };
  }, [o.resultKey]);

  return { retryRef, continueRef, retry, retryAvailable, retryKeyLabel: formatKeys(RETRY_KEYS, IS_MAC) };
}

export interface ResultActionsProps extends UseResultActionsOptions {
  /** The primary's words (default "Continue"; a checkpoint "Next item", a drill's last trial "Finish the set"). */
  continueLabel?: string;
  /** A key the surface itself binds to Continue, shown on the button ("Enter"). */
  continueKeys?: string;
  /** Why Continue is held, as its tooltip and under the row. */
  continueNote?: string;
  /** The practice line (lib/retry.ts `retryLine`), or null. */
  line?: string | null;
  /** Further secondary actions, placed before Try again (Hear the note again, Set up later, Report…). */
  children?: ReactNode;
  /**
   * The surface's own action for the answer (Check, Save answer, Play the note), drawn in the pair's place at the
   * right, before Try again: before a result it is the primary; a surface hides it once a result is on screen.
   */
  action?: ReactNode;
  testId?: string;
  /** The primary's test id (default "result-continue"; surfaces whose suites address their own keep it). */
  continueTestId?: string;
  /** The id of the verdict the buttons describe, so a screen reader hears it with the focused button. */
  describedBy?: string | undefined;
}

/**
 * The row: [children…] … [Try again ⌥R] [Continue]. The pair is right-aligned and never wraps, so the primary
 * never moves when Try again appears; further secondaries sit at the left and wrap above it on a narrow column. A held Continue is drawn as a secondary button (one green primary per state). Try again is a secondary button with a counter-clockwise arrow, `aria-keyshortcuts="Alt+R"`, named
 * "Try again" for screen readers and described by the practice line when there is one.
 */
export function ResultActions({
  continueLabel = CONTINUE_LABEL,
  continueKeys,
  continueNote,
  line = null,
  children,
  action,
  testId = "result-actions",
  continueTestId = "result-continue",
  describedBy,
  ...o
}: ResultActionsProps) {
  const api = useResultActions(o);
  const lineId = useId();
  const showRetry = o.onRetry !== null && o.resultKey !== null;
  const held = o.onContinue !== null && o.continueDisabled === true;
  return (
    <div className="flex flex-col items-stretch gap-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {children && <div className="mr-auto flex flex-wrap items-center gap-2">{children}</div>}
        <div className="flex shrink-0 items-center gap-2" data-result-pair>
          {action}
          {showRetry && (
            <Button
              ref={api.retryRef}
              variant="secondary"
              onClick={api.retry}
              disabled={o.retryDisabled}
              icon={<RotateCcw aria-hidden className="size-4" />}
              aria-label={RETRY_LABEL}
              aria-keyshortcuts={RETRY_KEYS}
              aria-describedby={[describedBy, line ? lineId : null].filter(Boolean).join(" ") || undefined}
              data-testid="result-retry"
            >
              {RETRY_LABEL}
              <span aria-hidden className="contents">
                <Kbd>{api.retryKeyLabel}</Kbd>
              </span>
            </Button>
          )}
          {o.onContinue !== null && (
            <Button
              ref={api.continueRef}
              variant={held ? "secondary" : "primary"}
              onClick={o.onContinue}
              disabled={o.continueDisabled}
              title={held ? continueNote : undefined}
              aria-keyshortcuts={continueKeys}
              aria-describedby={describedBy}
              icon={<ArrowRight aria-hidden className="size-4" />}
              data-testid={continueTestId}
            >
              {continueLabel}
              {continueKeys && (
                <span aria-hidden className="contents">
                  <Kbd tone={held ? "default" : "onAccent"}>{formatKeys(continueKeys, IS_MAC)}</Kbd>
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
      {(line || (held && continueNote)) && (
        <div className="flex flex-col items-end gap-0.5 text-right text-sm text-text-2">
          {line && (
            <p id={lineId} aria-live="polite" data-testid="result-line">
              {line}
            </p>
          )}
          {held && continueNote && <p data-testid="result-held">{continueNote}</p>}
        </div>
      )}
    </div>
  );
}
