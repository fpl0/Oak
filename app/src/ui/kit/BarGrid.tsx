// BarGrid (Wave 5): a grid of bar boxes, four a line by default: the twelve-bar chart (U11.L05–L06, C5, X2), a
// lead-sheet chart, a 16-bar form. Each box is a button that names its bar and what it holds ("Bar 5: F7"); empty
// boxes show a slash a beat, as a chart does. One tab stop: arrows move a box (up/down a line), Home/End the line's
// ends, Mod+Home/End the grid's ends; Enter or a click selects. The grid draws and reports only; the owner keeps the
// values (an answer widget, a chart view). Bars count from the first full bar after a pickup (c4): pass `firstBar`.
import { clsx } from "clsx";
import { Check, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { gridMove, gridRows } from "./model-w5.ts";

export type BarCellState = "empty" | "given" | "filled" | "met" | "unmet";

export interface BarCell {
  /** What the box shows ("F7", "IV7", a chip). `null`: empty (slashes). */
  content: ReactNode | null;
  /** The content as words for the box's name ("F7", "four seven"); default: the content when it is a string. */
  text?: string;
  /** given: printed in the chart, not the learner's; met / unmet: after a check (icon + words, never colour alone). */
  state?: BarCellState;
}

export interface BarGridProps {
  cells: readonly BarCell[];
  /** Accessible name ("Twelve-bar chart"). */
  label: string;
  /** Boxes a line (4). */
  perRow?: number;
  /** Beats a bar: the slashes an empty box shows (4). */
  beats?: number;
  /** The number of the first box (1; with a pickup handled outside, still 1 for the first full bar). */
  firstBar?: number;
  /** The selected box, `null` for none. */
  selected?: number | null;
  onSelect?(index: number): void;
  /** The bar playing now (0-based box index), `null` when stopped. */
  current?: number | null;
  /** Line labels shown before each line ("1–4", or the twelve-bar's "I", "IV", "V" lines). Default: bar ranges. */
  lineLabels?: readonly string[];
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

const STATE_WORDS: Record<BarCellState, string> = {
  empty: "empty",
  given: "given",
  filled: "",
  met: "right",
  unmet: "not yet",
};

export function BarGrid({
  cells,
  label,
  perRow = 4,
  beats = 4,
  firstBar = 1,
  selected = null,
  onSelect,
  current = null,
  lineLabels,
  disabled = false,
  className,
  "data-testid": testId,
}: BarGridProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const count = cells.length;
  const rows = gridRows(count, perRow);
  const tabAt = Math.min(count - 1, Math.max(0, selected ?? focus));

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = gridMove(e, i, count, perRow);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setFocus(next);
    refs.current[next]?.focus();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of bar boxes with roving focus; a fieldset would add a frame.
    <div
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={clsx("flex min-w-0 flex-col gap-1.5", className)}
      data-testid={testId}
    >
      {rows.map((row, r) => {
        const first = (row[0] ?? 0) + firstBar;
        const last = (row[row.length - 1] ?? 0) + firstBar;
        return (
          <div key={first} className="flex min-w-0 items-stretch gap-1.5">
            <span
              aria-hidden
              className="flex w-10 shrink-0 items-center justify-end pr-1 text-[0.6875rem] text-text-3 tabular-nums"
            >
              {lineLabels?.[r] ?? (first === last ? `${first}` : `${first}–${last}`)}
            </span>
            <div
              className="grid min-w-0 flex-1 gap-1.5"
              style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
            >
              {row.map((i) => {
                const cell = cells[i] as BarCell;
                const state: BarCellState = cell.state ?? (cell.content === null ? "empty" : "filled");
                const text = cell.text ?? (typeof cell.content === "string" ? cell.content : "");
                const words = [
                  `Bar ${i + firstBar}`,
                  text ? `: ${text}` : state === "empty" ? ": empty" : "",
                  state !== "empty" && STATE_WORDS[state] ? `, ${STATE_WORDS[state]}` : "",
                  current === i ? ", playing now" : "",
                ].join("");
                return (
                  <button
                    key={i}
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    type="button"
                    disabled={disabled}
                    tabIndex={i === tabAt ? 0 : -1}
                    aria-label={words}
                    aria-pressed={onSelect ? selected === i : undefined}
                    data-bar={i + firstBar}
                    data-state={state}
                    data-current={current === i || undefined}
                    onClick={() => {
                      setFocus(i);
                      onSelect?.(i);
                    }}
                    onFocus={() => setFocus(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={clsx(
                      "relative flex h-14 min-w-0 items-center justify-center rounded-control border px-1.5 text-base transition-colors disabled:cursor-default",
                      selected === i
                        ? "border-accent bg-lane-in ring-2 ring-accent/40"
                        : state === "given"
                          ? "border-border bg-surface-2"
                          : state === "unmet"
                            ? "border-issue bg-surface"
                            : state === "met"
                              ? "border-accent/70 bg-surface"
                              : "border-control-border bg-control hover:bg-control-hover",
                      current === i && "outline-2 outline-offset-1 outline-accent-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute top-0.5 left-1.5 text-[0.625rem] text-text-3 tabular-nums"
                    >
                      {i + firstBar}
                    </span>
                    {state === "empty" ? (
                      <span aria-hidden className="font-mono text-text-3 tracking-[0.35em]">
                        {"/".repeat(Math.max(1, beats))}
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className={clsx(
                          "min-w-0 truncate font-medium",
                          state === "given" ? "text-text-2" : "text-text",
                        )}
                      >
                        {cell.content}
                      </span>
                    )}
                    {(state === "met" || state === "unmet") && (
                      <span
                        aria-hidden
                        className={clsx(
                          "absolute top-0.5 right-1 flex items-center gap-0.5 text-[0.625rem]",
                          state === "met" ? "text-accent" : "text-issue",
                        )}
                      >
                        {state === "met" ? (
                          <Check className="size-3" strokeWidth={2.5} />
                        ) : (
                          <X className="size-3" strokeWidth={2.5} />
                        )}
                        {STATE_WORDS[state]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
