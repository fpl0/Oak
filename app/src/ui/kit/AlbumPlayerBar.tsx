// AlbumPlayerBar (Wave 6): one bar that plays a whole record — Side A from its first track to the last (the finale
// Coda, the album's header), or any list of recordings. It shows where the record is in the words of
// content/specs/END.md ("3 of 12 · Four-Chord Song · 0:42 / 1:36"), a play / stop button that names what it plays
// ("Play Side A"), previous and next, and the track's progress. Keys on the bar: Space plays or stops, Left and
// Right change track, Escape stops; every button also works as a button. The bar draws and reports only: the owner
// keeps the <audio> element, the running order and the breath between tracks, and stops the record when the page is
// left. It never starts by itself. With `sticky` it stays at the bottom of the scrolling page while the learner
// reads on.
import { clsx } from "clsx";
import { Play, SkipBack, SkipForward, Square } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { IconButton } from "./Button.tsx";
import { clockLabel } from "./model.ts";
import { nowPlayingText, playerKey, playFraction } from "./model-w6.ts";

export interface AlbumPlayerBarProps {
  /** What the bar plays, for its name and its play button ("Side A"). */
  label: string;
  /** Tracks in the record (for "3 of 12"). */
  total: number;
  /** The track playing now: its 1-based place and title; `null` when stopped. */
  index: number | null;
  title: string | null;
  elapsedS: number;
  /** The playing track's length, when known. */
  durationS: number | null;
  playing: boolean;
  /** Play from the start (or from where the owner chooses), or stop. Omit when nothing can play. */
  onToggle?: () => void;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  /** Draw the previous and next buttons (default: yes; they are disabled while stopped or at an end). */
  skips?: boolean;
  /** Why nothing can play ("No track has a recording yet"). */
  disabledReason?: string;
  /** The line shown while stopped ("12 tracks · 18:40. Plays from the first track to the last."). */
  idleText?: ReactNode;
  /** The playing track's cover (decorative: give it aria-hidden). */
  cover?: ReactNode;
  /** Controls after the transport (Open the album, Download). */
  actions?: ReactNode;
  /** Stay at the bottom of the scrolling page. */
  sticky?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function AlbumPlayerBar({
  label,
  total,
  index,
  title,
  elapsedS,
  durationS,
  playing,
  onToggle,
  onPrev,
  onNext,
  skips = true,
  disabledReason,
  idleText,
  cover,
  actions,
  sticky = false,
  className,
  "data-testid": testId,
}: AlbumPlayerBarProps) {
  const canPlay = onToggle !== undefined;
  const line = nowPlayingText({ index, total, title, elapsedS, durationS });
  const f = playFraction(elapsedS, durationS);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // A focused button keeps Space and Enter for itself; the arrows and Escape are the bar's everywhere.
    if (e.key === " " && target.closest("button, a, input, [role='slider']")) return;
    const a = playerKey(e, playing);
    if (!a) return;
    if (a === "toggle" || a === "stop") {
      if (!canPlay) return;
      e.preventDefault();
      onToggle?.();
    } else if (a === "prev" && onPrev && playing) {
      e.preventDefault();
      onPrev();
    } else if (a === "next" && onNext && playing) {
      e.preventDefault();
      onNext();
    }
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled transport group; a <fieldset> would add a form frame.
    <div
      role="group"
      aria-label={`${label} player`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the bar itself takes focus so Space and the arrows work on it.
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid={testId}
      data-player-state={playing ? "playing" : "stopped"}
      className={clsx(
        "flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2.5 shadow-card",
        sticky && "sticky bottom-3 z-20",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={!canPlay}
          title={canPlay ? undefined : disabledReason}
          aria-label={
            canPlay
              ? playing
                ? `Stop ${label}`
                : `Play ${label}`
              : `${label}: ${disabledReason ?? "nothing to play yet"}`
          }
          data-testid="player-toggle"
          className={clsx(
            "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-control border px-4 font-medium transition-colors duration-150",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-text-3",
            playing
              ? "border-accent bg-lane-in text-accent"
              : "border-transparent bg-accent text-on-accent hover:bg-accent-hover",
          )}
        >
          {playing ? (
            <Square aria-hidden className="size-4" />
          ) : (
            <Play aria-hidden className="size-4 translate-x-px" />
          )}
          <span aria-hidden>{playing ? "Stop" : `Play ${label}`}</span>
        </button>
        {skips && canPlay && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label="Previous track"
              shortcut="←"
              icon={<SkipBack aria-hidden className="size-4" />}
              onClick={onPrev}
              disabled={!playing || !onPrev}
              data-testid="player-prev"
            />
            <IconButton
              label="Next track"
              shortcut="→"
              icon={<SkipForward aria-hidden className="size-4" />}
              onClick={onNext}
              disabled={!playing || !onNext}
              data-testid="player-next"
            />
          </div>
        )}
        {cover && playing && (
          <div
            aria-hidden
            className="size-10 shrink-0 overflow-hidden rounded-control bg-surface-2 [&>*]:size-full"
          >
            {cover}
          </div>
        )}
        <p
          className={clsx("min-w-0 flex-1 text-sm text-text-2 tabular-nums", playing && "truncate")}
          aria-live="polite"
          data-testid="player-now"
        >
          {playing && line ? (
            <>
              <span className="text-text-3">
                {index} of {total}
              </span>
              <span className="mx-1.5 text-text-3">·</span>
              <span className="font-medium text-text">{title}</span>
              <span className="mx-1.5 text-text-3">·</span>
              <span>
                {clockLabel(elapsedS)}
                {durationS && durationS > 0 ? ` / ${clockLabel(durationS)}` : ""}
              </span>
            </>
          ) : canPlay ? (
            (idleText ?? "Plays from the first track to the last.")
          ) : (
            (disabledReason ?? "Nothing to play yet.")
          )}
        </p>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {playing && (
        <div
          role="progressbar"
          aria-label="Progress of this track"
          aria-valuemin={0}
          aria-valuemax={durationS && durationS > 0 ? Math.round(durationS) : 100}
          aria-valuenow={durationS && durationS > 0 ? Math.round(Math.min(elapsedS, durationS)) : 0}
          aria-valuetext={line}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear reduced:transition-none"
            style={{ width: `${f * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
