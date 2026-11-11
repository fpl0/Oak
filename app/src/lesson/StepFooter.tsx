// The prompt column's sticky footer (ux §3.1, §3.7, §3.8, contracts §11.8): the hint ladder (4 rungs, the server
// keeps the rung; Reveal after 2 graded attempts, 3 for sing and tap), Ask Claude, "Report a grading problem",
// "Try a new one", Wrap up, and Continue. Hints are free; the copy never shames.
import type { Exercise, HintLadder, HintRung, StepDef } from "@oak/api";
import { ArrowRight, Lightbulb, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { InlineMd } from "./frame.tsx";
import { hintText } from "./model.ts";

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
  /** The renderer's own buttons (Check). */
  actions: ReactNode;
  onHint(reveal: boolean): void;
  onContinue(): void;
  onAsk(): void;
  onNudge: (() => void) | null;
  onReport: (() => void) | null;
  onNewSeries: (() => void) | null;
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
              className="text-link underline-offset-2 hover:underline"
              onClick={p.onNewSeries}
              data-testid="new-series"
            >
              Try a new one
            </button>
          )}
          {p.onReport && (
            <button
              type="button"
              className="text-text-3 underline-offset-2 hover:text-text hover:underline"
              onClick={p.onReport}
              data-testid="report-problem"
            >
              Report a grading problem
            </button>
          )}
          {p.onWrapUp && (
            <button
              type="button"
              className="text-text-3 underline-offset-2 hover:text-text hover:underline"
              onClick={p.onWrapUp}
              data-testid="wrap-up"
            >
              Wrap up
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {p.actions}
        {p.step.kind !== "make" && (
          <Button
            variant={p.canContinue && p.continueLabel !== "Skip" ? "primary" : "secondary"}
            onClick={p.onContinue}
            disabled={!p.canContinue || p.busy}
            data-testid="continue"
            title={p.canContinue ? undefined : "Pass the check, or show the answer, to go on."}
            icon={<ArrowRight aria-hidden className="size-4" />}
          >
            {p.continueLabel}
          </Button>
        )}
      </div>
      {!p.canContinue && p.step.kind !== "make" && (
        <p className="text-right text-xs text-text-3">Pass the check, or show the answer, to go on.</p>
      )}
    </div>
  );
}
