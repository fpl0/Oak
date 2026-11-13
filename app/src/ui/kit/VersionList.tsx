// VersionList (Wave 4): the versions of a sketch, an album track or a transcription, newest first. Each row is a
// button (Enter opens that version; ArrowUp/ArrowDown move between rows, Home/End jump); the open one carries
// aria-current and the latest is marked "latest". Row actions (Compare, Restore) sit beside the button, never in it.
import { clsx } from "clsx";
import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";
import { listKeyIndex, versionLabel } from "./model.ts";

export interface VersionItem {
  version: number;
  /** A learner's name for it ("Bridge idea"). */
  name?: string | null;
  /** When it was saved, already formatted ("12 Nov, 14:02"). */
  when?: string;
  /** One quiet line under it (a liner-note excerpt, "released", "has a tutor review"). */
  note?: ReactNode;
  /** Chips after the label. */
  badges?: ReactNode;
}

export function VersionList({
  label,
  items,
  selected,
  onSelect,
  latest,
  actions,
  className,
}: {
  label: string;
  items: readonly VersionItem[];
  /** The version on screen. */
  selected: number | null;
  onSelect(version: number): void;
  /** Marks this version "latest" (defaults to the highest). */
  latest?: number;
  /** Controls at the end of a row. */
  actions?: (item: VersionItem) => ReactNode;
  className?: string;
}) {
  const sorted = [...items].sort((a, b) => b.version - a.version);
  const newest = latest ?? sorted[0]?.version;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = listKeyIndex(e.key, i, sorted.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    refs.current[next]?.focus();
  };
  if (sorted.length === 0) return <p className="py-2 text-sm text-text-3">No versions saved yet.</p>;
  return (
    <ul aria-label={label} className={clsx("flex flex-col gap-1", className)} data-version-list>
      {sorted.map((v, i) => {
        const on = v.version === selected;
        return (
          <li
            key={v.version}
            className={clsx(
              "flex items-center gap-2 rounded-control border pr-1.5",
              on ? "border-accent/50 bg-lane-in" : "border-transparent hover:bg-surface-2",
            )}
          >
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              aria-current={on ? "true" : undefined}
              data-version={v.version}
              onClick={() => onSelect(v.version)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-control px-2.5 py-1.5 text-left"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <span className={clsx("truncate font-medium", on ? "text-accent" : "text-text")}>
                  {versionLabel(v.version, v.name)}
                </span>
                {v.version === newest && (
                  <span className="shrink-0 text-sm text-text-3" data-testid="version-latest">
                    latest
                  </span>
                )}
                {v.badges}
                {v.when && <span className="ml-auto shrink-0 text-sm text-text-3">{v.when}</span>}
              </span>
              {v.note && <span className="line-clamp-2 text-sm text-text-2">{v.note}</span>}
            </button>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions(v)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
