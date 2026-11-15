// The prompt column's sticky footer (ux §3.1, §3.7, §3.8, contracts §11.8): the hint ladder (4 rungs, the server
// keeps the rung; Reveal after 2 graded attempts, 3 for sing and tap), Ask Claude, "Report a grading problem",
// "Try a new one", Wrap up, and the result row (docs/design/retry.md §2): Check before a result, then "Try again"
// and Continue, through the kit's `useResultActions` (result-row.tsx). Hints are free; the copy never shames.
import type { Exercise, HintLadder, HintRung, StepDef } from "@oak/api";
import { ArrowRight, Lightbulb, MessageCircle } from "lucide-react";
import { createContext, type ReactNode, useState } from "react";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { InlineMd } from "./frame.tsx";
import { hintText } from "./model.ts";
import { ResultRow } from "./result-row.tsx";

/**
 * Where a Check button says why it is not open yet ("Bar 3 is still empty."): the footer draws the line above its
 * row, so the button itself can sit in the row's primary place (`ResultActions` keeps that pair on one line).
 */
export const CheckReasonContext = createContext<((why: string | null) => void) | null>(null);

/** Draws a Check button's reason line (with `id`, the button's `aria-describedby`) above the row it wraps. */
export function CheckReasonSlot({ id, children }: { id: string; children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <>
      {reason ? (
        <p id={id} className="text-right text-sm text-text-2" data-testid="check-reason">
          {reason}
        </p>
      ) : null}
      <CheckReasonContext value={setReason}>{children}</CheckReasonContext>
    </>
  );
}

const DEFAULT_NOTE = "Pass the check, or show the answer, to go on.";

const RUNG_LABEL: readonly string[] = ["Nudge", "Pointer", "Partial", "Reveal"];

export interface StepFooterProps {
  step: StepDef;
  exercise: Exercise | undefined;
  ladder: HintLadder | null;
  rung: HintRung;
  revealAvailable: boolean;
  attempts: number;
  failed: boolean;
  passed: boolean;
  busy: boolean;
  hintBusy: boolean;
  notice: string | null;
  canContinue: boolean;
  continueLabel: string;
  /** The renderer's own buttons (Check): the primary place before a result, hidden while one is shown. */
  actions: ReactNode;
  /** The result on screen (a new value per verdict), or null: Try again shows with a result. */
  resultKey: string | null;
  /** Try again (null where nothing can be tried again: a Make, a step without an exercise). */
  onRetry: (() => void) | null;
  /** Where the focus goes after Try again (the pad, the editor, the take). */
  retryFocus?: () => HTMLElement | null;
  /** Move the focus to the row when a result appears in this visit (not when a step is revisited). */
  focusOnResult: boolean;
  /** The practice or reveal line (lib/retry.ts `retryLine`). */
  line: string | null;
  /** The id the Check button's reason line gets (its `aria-describedby`). */
  reasonId: string;
  onHint(reveal: boolean): void;
  onContinue(): void;
  onAsk(): void;
  onNudge: (() => void) | null;
  onReport: (() => void) | null;
  onNewSeries: (() => void) | null;
  /** The new-series link's words ("Try a new one"; a revealed gate check: "Start a fresh try"). */
  newSeriesLabel?: string;
  /** The line under a held Continue (default: pass the check or show the answer). */
  continueNote?: string;
  onWrapUp: (() => void) | null;
  onDismissNotice(): void;
  tutorAvailable: boolean;
}

export function StepFooter(p: StepFooterProps) {
  const texts: { rung: number; text: string }[] = [];
  if (p.ladder)
    for (let r = 1 as HintRung; r <= Math.min(p.rung, 3); r = (r + 1) as HintRung) {
      const t = hintText(p.ladder, r);
      if (t) texts.push({ rung: r, text: t });
    }
  const nextLabel = p.rung < 3 ? RUNG_LABEL[p.rung] : null;
  return (
    <div className="flex flex-col gap-2">
      {p.notice && (
        <p
          role="status"
          className="flex items-start justify-between gap-2 rounded-control bg-surface-2 px-3 py-2 text-sm"
          data-testid="step-notice"
        >
          <span>{p.notice}</span>
          <button
            type="button"
            className="text-text-3 hover:text-text"
            onClick={p.onDismissNotice}
            aria-label="Dismiss"
          >
            ×
          </button>
        </p>
      )}
      {texts.length > 0 && (
        <ol
          className="flex max-h-28 flex-col gap-1 overflow-y-auto text-sm"
          aria-label="Hints so far"
          data-testid="hint-texts"
        >
          {texts.map((t) => (
            <li key={t.rung} data-rung={t.rung}>
              <span className="text-text-3">{RUNG_LABEL[t.rung - 1]}: </span>
              <InlineMd text={t.text} />
            </li>
          ))}
        </ol>
      )}
      {p.failed && p.attempts >= 3 && !p.passed && p.tutorAvailable && (
        <p className="text-sm text-text-2" data-testid="stuck-line">
          Stuck here? Talk it through with Claude.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {p.ladder && !p.passed ? (
          <>
            <span
              className="flex items-center gap-1"
              role="img"
              aria-label={`Hints used: ${p.rung} of 4`}
              data-testid="hint-dots"
            >
              {[1, 2, 3, 4].map((r) => (
                <span
                  key={r}
                  aria-hidden
                  className={`size-2 rounded-full border ${r <= p.rung ? "border-accent-2 bg-accent-2" : "border-text-3"}`}
                />
              ))}
            </span>
            {nextLabel && (
              <Button
                size="sm"
                variant={p.failed ? "secondary" : "ghost"}
                icon={<Lightbulb aria-hidden className="size-3.5" />}
                onClick={() => p.onHint(false)}
                loading={p.hintBusy}
                disabled={p.busy}
                data-testid="hint"
                title="Hints are free: they just tell Oak to bring this back sooner."
              >
                Hint: {nextLabel} <Kbd>H</Kbd>
              </Button>
            )}
            {p.revealAvailable && p.rung < 4 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => p.onHint(true)}
                disabled={p.busy || p.hintBusy}
                data-testid="reveal-button"
              >
                Show the answer
              </Button>
            )}
          </>
        ) : null}
        {p.onNudge && (
          <Button
            size="sm"
            variant="ghost"
            icon={<MessageCircle aria-hidden className="size-3.5" />}
            onClick={p.onNudge}
            data-testid="ask-nudge"
          >
            Nudge from Claude
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={p.onAsk} data-testid="ask-claude">
          Ask Claude
        </Button>
      </div>
      {(p.onNewSeries || p.onReport || p.onWrapUp) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {p.onNewSeries && (
            <button
              type="button"
              className={buttonClass("link", "sm")}
              onClick={p.onNewSeries}
              data-testid="new-series"
            >
              {p.newSeriesLabel ?? "Try a new one"}
            </button>
          )}
          {p.onReport && (
            <button
              type="button"
              className={buttonClass("link", "sm")}
              onClick={p.onReport}
              data-testid="report-problem"
            >
              Report a grading problem
            </button>
          )}
          {p.onWrapUp && (
            <button
              type="button"
              className={buttonClass("link", "sm")}
              onClick={p.onWrapUp}
              data-testid="wrap-up"
            >
              Wrap up
            </button>
          )}
        </div>
      )}
      <CheckReasonSlot id={p.reasonId}>
        <StepActions p={p} />
      </CheckReasonSlot>
    </div>
  );
}

/**
 * The row (docs/design/retry.md §2.2). Before a result the renderer's Check holds the primary place and an open
 * Continue (an ungraded step, a passed step looked back at, "Skip" on a sung step) waits at the left as a
 * secondary, so one green button shows at a time. With a result: "Try again" and Continue, Continue last and
 * focused when it is open (Enter goes on), Try again focused when it is held.
 */
function StepActions({ p }: { p: StepFooterProps }) {
  const make = p.step.kind === "make";
  const shown = p.resultKey !== null;
  const checkHere = !shown && p.actions !== null && p.actions !== undefined && p.actions !== false;
  const continueOpen = p.canContinue && !p.busy;
  // Continue waits at the left while Check is the primary, or when it only skips.
  const continueAside = !make && (checkHere || (p.continueLabel === "Skip" && !shown)) && p.canContinue;
  const aside = continueAside ? (
    <Button
      variant="secondary"
      onClick={p.onContinue}
      disabled={!continueOpen}
      data-testid="continue"
      icon={<ArrowRight aria-hidden className="size-4" />}
    >
      {p.continueLabel}
    </Button>
  ) : null;
  return (
    <ResultRow
      testId="step-actions"
      continueTestId="continue"
      resultKey={p.resultKey}
      onRetry={p.onRetry}
      retryDisabled={p.busy}
      {...(p.retryFocus ? { retryFocus: p.retryFocus } : {})}
      focusOnResult={p.focusOnResult}
      onContinue={make || continueAside ? null : p.onContinue}
      continueDisabled={!continueOpen}
      continueLabel={p.continueLabel}
      continueKeys="Enter"
      continueNote={p.continueNote ?? DEFAULT_NOTE}
      line={p.line}
      action={checkHere || make ? p.actions : null}
    >
      {aside}
    </ResultRow>
  );
}
