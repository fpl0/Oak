// KeyStrip (Wave 6): the key in force along a piece as a row of segments as wide as their bars, with every change
// marked where it happens — a notch on the bar line and the change in words ("+2: up a whole step"), never colour
// alone. One tab stop: arrows move between keys, Home/End go to the ends, Enter or Space picks the focused one (hear
// it, loop it: the owner decides). With `currentBar` the key that sounds now is named and outlined. A piece in one
// key draws one calm segment ("C major throughout"); pass `hideSingle` to draw nothing then (the key lens rule,
// docs/design/wave6.md §4.3). The strip draws and reports only: key names and the words of a change come from
// @oak/theory (`keyDisplay`, `keyDistance`) through the owner; `keySegments` turns the 1-based spans of the
// grader's `keyPlanView` into segments. The Workbench keeps its own ribbon on the roll's time axis; this one stands
// alone (a brief, a prompt, a song card, the Coda), as the SectionRibbon does.
import { clsx } from "clsx";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { barNumber, barSpanText } from "./model-w5.ts";
import {
  type KeySegment,
  keyPlanSentence,
  keySegmentAt,
  keySegmentName,
  keyStripKey,
  keyStripSpan,
  shortChange,
  shortKeyName,
} from "./model-w6.ts";

export type { KeySegment };

export interface KeyStripProps {
  segments: readonly KeySegment[];
  /** Accessible name of the strip ("Key along “Porch Light”"). */
  label: string;
  /** Bars the strip spans (default: the end of the last segment). */
  totalBars?: number;
  /** Bar 0 is a pickup: bars count from the first full bar. */
  pickup?: boolean;
  /** The bar playing now (0-based), `null` when stopped. */
  currentBar?: number | null;
  /** The picked segment (its `id`, or its index as a string when it has none). */
  selectedId?: string | null;
  /** Pick a segment (Enter, Space or a click). Without it the segments only take focus, to be read. */
  onSelect?(segment: KeySegment, index: number): void;
  /** Draw nothing for a piece in one key. */
  hideSingle?: boolean;
  /** Shown when there are no segments (no key is known yet). */
  empty?: string;
  /** Show the bar numbers under the segments. */
  showBars?: boolean;
  className?: string;
  "data-testid"?: string;
}

const idOf = (s: KeySegment, i: number) => s.id ?? String(i);

export function KeyStrip({
  segments,
  label,
  totalBars,
  pickup = false,
  currentBar = null,
  selectedId = null,
  onSelect,
  hideSingle = false,
  empty = "No key yet: give the piece a .scale() and run it.",
  showBars = true,
  className,
  "data-testid": testId,
}: KeyStripProps) {
  const span = keyStripSpan(segments, totalBars);
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const selected = segments.findIndex((s, i) => idOf(s, i) === selectedId);
  const playing = keySegmentAt(segments, currentBar);
  const tabAt = Math.min(segments.length - 1, Math.max(0, selected >= 0 ? selected : focus));

  if (segments.length === 0)
    return (
      <p
        className={clsx(
          "rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-2",
          className,
        )}
        data-testid={testId}
        data-keystrip-state="empty"
      >
        {empty}
      </p>
    );
  if (segments.length === 1 && hideSingle) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const a = keyStripKey(e, i, segments.length);
    if (!a) return;
    if (a.kind === "pick" && !onSelect) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.kind === "move") {
      setFocus(a.index);
      refs.current[a.index]?.focus();
    } else {
      const s = segments[a.index];
      if (s) onSelect?.(s, a.index);
    }
  };
  const now = playing >= 0 ? segments[playing] : null;
  const changes = segments.length - 1;

  return (
    <div
      className={clsx("flex min-w-0 flex-col gap-1", className)}
      data-testid={testId}
      data-keystrip-state={changes > 0 ? "changes" : "single"}
      data-keys={segments.map((s) => s.text).join(" → ")}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of key segments with roving focus. */}
      <div
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        className="relative grid min-w-0 gap-x-0 pt-5"
        style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
      >
        {segments.map((s, i) => {
          const isSel = i === selected;
          const isNow = i === playing;
          const first = i === 0;
          // A segment under a sixth of the strip prints its key short ("D", "Em") and its change as a figure
          // ("+2"); the full name and the change in words stay in its accessible name and tooltip.
          const compact = Math.max(1, s.bars) / span < 1 / 6;
          return (
            <button
              key={idOf(s, i)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === tabAt ? 0 : -1}
              aria-label={keySegmentName(s, pickup, isNow)}
              aria-pressed={onSelect ? isSel : undefined}
              aria-current={isNow ? "true" : undefined}
              title={`${s.text} · ${barSpanText(s.startBar, s.bars, pickup)}${s.change ? ` · ${s.change}` : ""}`}
              data-key={s.text}
              data-change={s.change ?? undefined}
              data-current={isNow || undefined}
              onClick={() => {
                setFocus(i);
                onSelect?.(s, i);
              }}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "relative flex h-10 min-w-0 items-center gap-2 border-y border-r bg-surface-2 px-2.5 text-left text-sm transition-colors",
                first ? "rounded-l-control border-l" : "border-l-0",
                i === segments.length - 1 && "rounded-r-control",
                !onSelect && "cursor-default",
                isNow
                  ? "border-accent bg-lane-in text-text"
                  : isSel
                    ? "border-accent text-text"
                    : "border-border text-text hover:border-text-3",
                isSel && "shadow-[inset_0_0_0_1px_var(--oak-accent)]",
                compact && "px-1.5",
              )}
              style={{ gridColumn: `${s.startBar + 1} / span ${Math.max(1, s.bars)}` }}
            >
              {!first && (
                // The change mark: a heavy bar line with a notch above it, and the change in words over the strip.
                <>
                  <span
                    aria-hidden
                    className="absolute -top-px -bottom-px left-0 w-[3px] bg-accent-2"
                    data-testid="key-change-mark"
                  />
                  <span
                    aria-hidden
                    className="absolute -top-5 left-0 flex h-5 max-w-full items-center gap-1 text-[0.6875rem] font-medium whitespace-nowrap text-text-2"
                  >
                    <span className="h-2 w-[3px] shrink-0 self-end bg-accent-2" />
                    <span className="truncate pl-0.5">
                      {compact ? shortChange(s.change ?? "new key") : (s.change ?? "new key")}
                    </span>
                  </span>
                </>
              )}
              <span aria-hidden className={clsx("min-w-0 truncate font-medium", !first && "pl-1.5")}>
                {compact ? shortKeyName(s.text) : s.text}
                {!compact && s.sounding && s.sounding !== s.text && (
                  <span className="font-normal text-text-2"> · sounds {s.sounding}</span>
                )}
              </span>
            </button>
          );
        })}
        {currentBar !== null && currentBar >= 0 && currentBar < span && (
          <span
            aria-hidden
            data-testid="keystrip-playhead"
            className="pointer-events-none absolute top-5 bottom-0 w-0.5 rounded-full bg-accent"
            style={{ left: `calc(${((currentBar + 0.5) / span) * 100}% - 1px)` }}
          />
        )}
      </div>
      {showBars && (
        <div
          aria-hidden
          className="grid min-w-0 text-[0.6875rem] text-text-3 tabular-nums"
          style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
        >
          {segments.map((s, i) => (
            <span
              key={idOf(s, i)}
              className="truncate pl-0.5"
              style={{ gridColumn: `${s.startBar + 1} / span ${Math.max(1, s.bars)}` }}
            >
              {barNumber(s.startBar, pickup) ?? "pickup"}
            </span>
          ))}
        </div>
      )}
      <p id={hintId} className="text-[0.75rem] text-text-3" data-testid="keystrip-status" aria-live="polite">
        {now
          ? `Now in ${now.sounding && now.sounding !== now.text ? `${now.text} (sounds ${now.sounding})` : now.text}. `
          : ""}
        {keyPlanSentence(segments, pickup)}.
      </p>
    </div>
  );
}
