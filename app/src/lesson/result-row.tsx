// The result row of a lesson step and a checkpoint item (docs/design/retry.md §2): the kit's `useResultActions`
// (Alt+R, where the focus lands on a result and after a retry) drawn as the kit's `ResultActions` draws it —
// [secondaries…] … [action] [Try again ⌥R] [primary] — with one difference: the primary keeps the test id the
// lesson and checkpoint suites (and the journey and review suites outside this area) address it by ("continue",
// "next-item"). The kit's row names it "result-continue"; see the apiNotes of the retry pass.
import { ArrowRight, RotateCcw } from "lucide-react";
import { type ReactNode, useId, useLayoutEffect } from "react";
import { RETRY_KEYS, RETRY_LABEL } from "../lib/retry.ts";
import { IS_MAC } from "../ui/keys/KeymapProvider.tsx";
import { formatKeys } from "../ui/keys/keymap.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { type UseResultActionsOptions, useResultActions } from "../ui/kit/ResultActions.tsx";

export interface ResultRowProps extends UseResultActionsOptions {
  continueLabel: string;
  /** A key the surface binds to Continue itself, shown on the button ("Enter"). */
  continueKeys?: string;
  /** Why Continue is held: its tooltip and a line under the row. */
  continueNote?: string;
  /** The practice line (lib/retry.ts `retryLine`), or null. */
  line?: string | null;
  /** The surface's own action (Check, Save answer): the primary place before a result. */
  action?: ReactNode;
  /** Secondary actions at the left (Back, Skip, Continue while Check is the primary). */
  children?: ReactNode;
  continueTestId: string;
  testId?: string;
}

export function ResultRow({
  continueLabel,
  continueKeys,
  continueNote,
  line = null,
  action,
  children,
  continueTestId,
  testId = "result-actions",
  ...o
}: ResultRowProps) {
  // Before the kit looks where the focus is (its effect, a frame later): a field the verdict has made read-only is
  // not where the learner fixes the answer (the answer is changed through Try again), so the focus leaves it and
  // lands where Enter does the expected thing — Continue when open, else Try again (docs/design/retry.md §2.4).
  useLayoutEffect(() => {
    if (o.resultKey === null) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && lockedField(active)) active.blur();
  }, [o.resultKey]);
  const api = useResultActions(o);
  const lineId = useId();
  const showRetry = o.onRetry !== null && o.resultKey !== null;
  const held = o.onContinue !== null && o.continueDisabled === true;
  return (
    <div className="flex flex-col items-stretch gap-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {children ? <div className="mr-auto flex flex-wrap items-center gap-2">{children}</div> : null}
        <div className="flex shrink-0 items-center gap-2">
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
              aria-describedby={line ? lineId : undefined}
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
              icon={<ArrowRight aria-hidden className="size-4" />}
              data-testid={continueTestId}
            >
              {continueLabel}
              {continueKeys && !held ? (
                <span aria-hidden className="contents">
                  <Kbd tone="onAccent">{formatKeys(continueKeys, IS_MAC)}</Kbd>
                </span>
              ) : null}
            </Button>
          )}
        </div>
      </div>
      {line || (held && continueNote) ? (
        <div className="flex flex-col items-end gap-0.5 text-right text-sm text-text-2">
          {line ? (
            <p id={lineId} aria-live="polite" data-testid="result-line">
              {line}
            </p>
          ) : null}
          {held && continueNote ? <p data-testid="continue-note">{continueNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A text field the verdict has locked (read-only or inside a disabled answer): nothing can be typed there. */
export function lockedField(el: Element): boolean {
  if (!el.matches("input, textarea")) return false;
  return (
    (el as HTMLInputElement).readOnly ||
    (el as HTMLInputElement).disabled ||
    el.closest('[aria-disabled="true"]') !== null
  );
}

/**
 * Where the focus goes after "Try again" on a step (docs/design/retry.md §2.4): a control that asks for it
 * (`data-retry-focus`), the code editor on a code step, else the answer widget's own focus stop (the selected or
 * first option of a pad, the text field, the take's button), else the first control of the answer column.
 */
export function answerFocus(code: boolean, root: ParentNode = document): HTMLElement | null {
  const step = root.querySelector<HTMLElement>('[data-testid="lesson-step"]');
  if (!step) return null;
  const asked = step.querySelector<HTMLElement>("[data-retry-focus]");
  if (asked) return asked;
  if (code) {
    const editor = step.querySelector<HTMLElement>(".cm-content");
    if (editor) return editor;
  }
  const open = ':is([tabindex="0"], input:not(:disabled), textarea:not(:disabled), button:not(:disabled))';
  return (
    step.querySelector<HTMLElement>(`[data-answer-area] [data-answer] ${open}`) ??
    step.querySelector<HTMLElement>(`[data-answer-area] ${open}`)
  );
}
