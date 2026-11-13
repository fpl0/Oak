// MediaCard (Wave 4): one album track (or any recording) as a card — cover, title, what it is, the version and its
// date, the length, and a play button that says what it does. `layout="tile"` stacks it for a grid of tracks;
// `layout="row"` lays it flat for a list. The title is a node so the owner can make it a router Link.
import { clsx } from "clsx";
import { Pause, Play } from "lucide-react";
import type { ReactNode } from "react";
import { clockLabel } from "./model.ts";

export function MediaCard({
  cover,
  title,
  titleText,
  subtitle,
  meta,
  durationS,
  badges,
  playing = false,
  onPlay,
  playDisabledReason,
  actions,
  layout = "tile",
  className,
  "data-testid": testId,
}: {
  /** The cover art (AlbumCover, a tree-ring cover). Decorative: give it aria-hidden. */
  cover: ReactNode;
  title: ReactNode;
  /** The title as plain words, for the play button's name ("Play “Intro”"). */
  titleText: string;
  /** "C2 · Four-Chord Song". */
  subtitle?: ReactNode;
  /** "v3 · 12 Nov 2026". */
  meta?: ReactNode;
  durationS?: number | null;
  badges?: ReactNode;
  playing?: boolean;
  /** Omit when there is nothing to play; `playDisabledReason` then says why. */
  onPlay?: () => void;
  playDisabledReason?: string;
  actions?: ReactNode;
  layout?: "tile" | "row";
  className?: string;
  "data-testid"?: string;
}) {
  const canPlay = onPlay !== undefined;
  const play = (
    <button
      type="button"
      onClick={onPlay}
      disabled={!canPlay}
      aria-pressed={canPlay ? playing : undefined}
      aria-label={
        canPlay
          ? `${playing ? "Pause" : "Play"} “${titleText}”`
          : `“${titleText}”: ${playDisabledReason ?? "no recording yet"}`
      }
      title={canPlay ? undefined : playDisabledReason}
      data-testid="media-play"
      className={clsx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-text-3",
        playing
          ? "border-accent bg-lane-in text-accent"
          : "border-transparent bg-accent text-on-accent hover:bg-accent-hover",
      )}
    >
      {playing ? (
        <Pause aria-hidden className="size-4" />
      ) : (
        <Play aria-hidden className="size-4 translate-x-px" />
      )}
    </button>
  );
  const text = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="min-w-0 truncate font-display text-h3 font-semibold">{title}</div>
      {subtitle && <div className="truncate text-sm text-text-2">{subtitle}</div>}
      {(meta || durationS) && (
        <p className="truncate text-sm text-text-3 tabular-nums">
          {meta}
          {meta && durationS ? " · " : null}
          {durationS ? clockLabel(durationS) : null}
        </p>
      )}
      {badges && <div className="mt-1 flex flex-wrap items-center gap-1">{badges}</div>}
    </div>
  );
  return (
    <article
      data-testid={testId}
      data-media-card={layout}
      className={clsx(
        "rounded-card border border-border bg-surface shadow-card",
        layout === "tile" ? "flex flex-col gap-3 p-3" : "flex items-center gap-4 p-3",
        className,
      )}
    >
      <div
        className={clsx(
          "overflow-hidden rounded-control bg-surface-2",
          layout === "tile" ? "aspect-square w-full" : "size-16 shrink-0",
          "[&>*]:size-full",
        )}
      >
        {cover}
      </div>
      <div className={clsx("flex min-w-0 gap-3", layout === "row" ? "flex-1 items-center" : "items-start")}>
        {text}
        {play}
      </div>
      {actions && (
        <div className={clsx("flex flex-wrap items-center gap-2", layout === "row" && "ml-auto")}>
          {actions}
        </div>
      )}
    </article>
  );
}
