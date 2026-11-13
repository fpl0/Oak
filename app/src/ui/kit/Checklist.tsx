// Checklist (Wave 4): lines with a state each — a capstone's rubric, X1's phrase checks and their stages, the own-audio
// self-check, a release list. Each state has its own icon and words (never colour alone); "Not yet" is the issue
// tone, never red (ux §1.6). The summary counts every line but optional ones ("3 of 5 met").
import { clsx } from "clsx";
import { Circle, CircleCheck, CircleDashed, CircleDot, Eye, Loader2, Lock, MinusCircle } from "lucide-react";
import type { ReactNode } from "react";
import { CHECKLIST_STATE_LABEL, type ChecklistState, checklistSummary } from "./model.ts";

export type { ChecklistState };

export interface ChecklistItem {
  id: string;
  label: ReactNode;
  state: ChecklistState;
  /** A line under the label: the grader's detail, what to try, a score. */
  detail?: ReactNode;
  /** Replaces the state's own words ("2 of 2", "Bass stage"). */
  stateText?: string;
  /** A control at the end of the line (Check, Reveal, a 0–2 score). */
  action?: ReactNode;
}

const ICON: Record<ChecklistState, ReactNode> = {
  met: <CircleCheck aria-hidden className="size-4.5 text-accent" />,
  partial: <CircleDot aria-hidden className="size-4.5 text-accent-2" />,
  unmet: <MinusCircle aria-hidden className="size-4.5 text-issue" />,
  pending: <Circle aria-hidden className="size-4.5 text-text-3" />,
  running: <Loader2 aria-hidden className="size-4.5 animate-spin text-text-2 reduced:animate-none" />,
  revealed: <Eye aria-hidden className="size-4.5 text-text-2" />,
  locked: <Lock aria-hidden className="size-4 text-text-3" />,
  optional: <CircleDashed aria-hidden className="size-4.5 text-text-3" />,
};

const STATE_TEXT: Record<ChecklistState, string> = {
  met: "text-accent",
  partial: "text-text",
  unmet: "text-issue",
  pending: "text-text-3",
  running: "text-text-2",
  revealed: "text-text-2",
  locked: "text-text-3",
  optional: "text-text-3",
};

export function Checklist({
  label,
  items,
  summary = true,
  dense = false,
  className,
}: {
  /** Accessible name of the list ("Your track's checklist"). */
  label: string;
  items: readonly ChecklistItem[];
  /** Shows "3 of 5 met" above the list. */
  summary?: boolean;
  dense?: boolean;
  className?: string;
}) {
  const s = checklistSummary(items.map((i) => i.state));
  return (
    <div className={clsx("flex flex-col gap-2", className)} data-checklist>
      {summary && items.length > 0 && (
        <p className="text-sm text-text-2" aria-live="polite" data-testid="checklist-summary">
          {s.text}
        </p>
      )}
      <ul aria-label={label} className="flex flex-col divide-y divide-border">
        {items.map((it) => (
          <li
            key={it.id}
            data-state={it.state}
            className={clsx(
              "flex items-start gap-3",
              dense ? "py-1.5" : "py-2.5",
              (it.state === "locked" || it.state === "optional") && "text-text-2",
            )}
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">{ICON[it.state]}</span>
            <div className="min-w-0 flex-1">
              <p className="min-w-0">
                <span className="font-medium">{it.label}</span>
                <span className={clsx("ml-2 text-sm whitespace-nowrap", STATE_TEXT[it.state])}>
                  <span className="sr-only">: </span>
                  {it.stateText ?? CHECKLIST_STATE_LABEL[it.state]}
                </span>
              </p>
              {it.detail && <div className="mt-0.5 text-sm text-text-2">{it.detail}</div>}
            </div>
            {it.action && <div className="shrink-0">{it.action}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
