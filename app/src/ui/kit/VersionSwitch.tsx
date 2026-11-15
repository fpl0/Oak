// VersionSwitch (Wave 7): which version of one piece is in front — AC1 "One Tune, Two Genres" (version A and B of
// the same tune), an album track's two versions. A radio group of segments, each with its letter badge, its name
// and a detail line ("96 BPM · rhodes, upright bass"); the one that is playing says so in words and with a small
// speaker, never by colour alone. Arrows move and select, Home/End jump; only the chosen segment is in the tab
// order. The owner binds its page key (`keyHint`, e.g. "V") with `nextVersion`, keeps the audio and decides what
// switching does (stop, or carry on at the same bar).
import { clsx } from "clsx";
import { Volume2 } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { Kbd } from "./basics.tsx";
import { type VersionOption, versionName } from "./model-w7.ts";

export type { VersionOption };

export interface VersionSwitchProps {
  /** Accessible name of the group ("Version"). */
  label?: string;
  options: readonly VersionOption[];
  value: string;
  onChange(id: string): void;
  /** The version that is sounding now, if any. */
  playing?: string | null;
  /** The page key that switches ("V"). */
  keyHint?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function VersionSwitch({
  label = "Version",
  options,
  value,
  onChange,
  playing = null,
  keyHint,
  disabled = false,
  className,
  "data-testid": testId,
}: VersionSwitchProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    let next: number | undefined;
    const n = options.length;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const o = options[next];
    if (o) onChange(o.id);
    refs.current[next]?.focus();
  };
  return (
    <div className={clsx("flex min-w-0 items-center gap-2", className)} data-testid={testId}>
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        className="inline-flex min-w-0 items-stretch gap-0.5 rounded-control border border-border bg-surface-2 p-0.5"
      >
        {options.map((o, i) => {
          const on = o.id === value;
          const sounding = playing === o.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: segmented buttons with roving focus (as AbSwitch).
            <button
              key={o.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${versionName(o)}${sounding ? ", playing" : ""}`}
              data-version={o.id}
              data-playing={sounding || undefined}
              disabled={disabled}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "flex min-w-0 items-center gap-2 rounded-[5px] px-2.5 py-1 text-left",
                "transition-colors duration-150 disabled:opacity-50",
                on ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 font-mono text-[0.8125rem] font-semibold",
                  on ? "bg-accent text-on-accent" : "border border-border bg-surface text-text-2",
                )}
              >
                {o.letter}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {o.label}
                  {sounding && <Volume2 aria-hidden className="size-3.5 shrink-0 text-accent" />}
                </span>
                {o.detail && <span className="truncate text-[0.75rem] text-text-3">{o.detail}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {keyHint && <Kbd>{keyHint}</Kbd>}
    </div>
  );
}
