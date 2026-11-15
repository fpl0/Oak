// ExportButton (Wave 7, carry f2): "Export" on an album track or a version — the button, the render's progress
// with Cancel, and one status line. Five phases (`ExportState`): idle, rendering (a bar, determinate when the
// renderer reports a fraction; Cancel beside it), done ("Saved Four-Chord Song.wav (2.1 MB)."), failed (the
// renderer's own plain words and "Nothing was saved."), cancelled. It renders nothing itself: the owner calls the
// offline renderer, saves the file and passes the state (docs/design/wave7.md §5.5, §10 item 22: an export is what
// the released version plays, a failed render leaves nothing behind, the release recording is never replaced).
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Download, X } from "lucide-react";
import { Button } from "./Button.tsx";
import { type ExportState, exportStatusText } from "./model-w7.ts";

export type { ExportState };

export interface ExportButtonProps {
  state: ExportState;
  onExport(): void;
  onCancel(): void;
  /** The button's words ("Export WAV"). */
  label?: string;
  /** What is exported, for the accessible name ("Four-Chord Song, version 3"). */
  what?: string;
  /** Why it cannot export now ("Release a version first."); the button is then disabled and says so. */
  disabledReason?: string | null;
  size?: "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

export function ExportButton({
  state,
  onExport,
  onCancel,
  label = "Export WAV",
  what,
  disabledReason = null,
  size = "md",
  className,
  "data-testid": testId,
}: ExportButtonProps) {
  const rendering = state.phase === "rendering";
  const status = disabledReason ?? exportStatusText(state);
  const fraction = typeof state.fraction === "number" ? Math.max(0, Math.min(1, state.fraction)) : null;
  const again = state.phase === "done" || state.phase === "failed" || state.phase === "cancelled";
  return (
    <div
      className={clsx("flex min-w-0 flex-col gap-1.5", className)}
      data-testid={testId}
      data-export-phase={state.phase}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size={size}
          icon={<Download aria-hidden className="size-4" />}
          onClick={onExport}
          disabled={rendering || disabledReason !== null}
          aria-label={`${state.phase === "failed" ? "Try again: " : ""}${label}${what ? `: ${what}` : ""}`}
        >
          {state.phase === "failed" ? "Try again" : again ? `${label} again` : label}
        </Button>
        {rendering && (
          <>
            <div
              role="progressbar"
              aria-label={`Rendering${what ? ` ${what}` : ""}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
              aria-valuetext={exportStatusText(state)}
              className="relative h-1.5 w-32 overflow-hidden rounded-full bg-surface-2"
            >
              {fraction === null ? (
                <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-accent/60 reduced:animate-none" />
              ) : (
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200 reduced:transition-none"
                  style={{ width: `${fraction * 100}%` }}
                />
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<X aria-hidden className="size-3.5" />}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={clsx(
          "flex min-h-5 items-start gap-1.5 text-sm",
          state.phase === "failed" ? "text-issue" : "text-text-2",
        )}
        data-testid="export-status"
      >
        {state.phase === "done" && !disabledReason && (
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        )}
        {state.phase === "failed" && !disabledReason && (
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        )}
        <span className="min-w-0">{status}</span>
      </p>
    </div>
  );
}
