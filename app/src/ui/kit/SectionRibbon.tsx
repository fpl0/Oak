// SectionRibbon (Wave 5): the sections of a piece as a row of labelled blocks, one tab stop, selectable and
// loopable. Blocks are as wide as their bars; each prints its name and letter (A, B …), so the part colour is never
// the only cue; an optional fill shows its energy. Arrows move between sections, Enter or Space loops the focused one
// (again: stops), Escape stops the loop; a click loops too. With `currentBar` a playhead marks the bar playing now.
// The ribbon draws and reports only; the owner keeps the loop and the transport. Bars count from the first full bar
// after a pickup (c4). Sections come from `formView` (app/src/lib/form-view.ts `formSectionsOf` fits as is).
// The Workbench draws its own ribbon on the roll's time axis (workbench/SectionRibbon.tsx); this one stands alone
// (a capstone brief, a form answer, a lesson or drill prompt, the Coda).
import { clsx } from "clsx";
import { Repeat } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { PARTS_PALETTE } from "../theme/palette.ts";
import {
  barNumber,
  barSpanText,
  letterTone,
  type RibbonSection,
  ribbonKey,
  ribbonSpan,
  sectionName,
} from "./model-w5.ts";

export type { RibbonSection };

export interface SectionRibbonProps {
  sections: readonly RibbonSection[];
  /** Accessible name of the ribbon ("Sections of “Porch Light”"). */
  label: string;
  /** Bars the ribbon spans (default: the end of the last section). */
  totalBars?: number;
  /** Bar 0 is a pickup: bars count from the first full bar. */
  pickup?: boolean;
  /** The bar playing now (0-based), `null` when stopped. */
  currentBar?: number | null;
  /** The tag of the section looping now, `null` when none. */
  loopTag?: string | null;
  /** Loop a section, or stop the loop (`null`). Without it the blocks only select. */
  onLoop?(section: RibbonSection | null): void;
  /** The selected section (a form answer, a brief's focus); shown with a ring. */
  selectedTag?: string | null;
  onSelect?(section: RibbonSection): void;
  /** The arranged tracks disagree: the sentence to show instead of a wrong form. */
  problem?: string | null;
  /** Shown when there are no sections (no `arrange()` yet). */
  empty?: string;
  /** Show the bar numbers under the blocks. */
  showBars?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function SectionRibbon({
  sections,
  label,
  totalBars,
  pickup = false,
  currentBar = null,
  loopTag = null,
  onLoop,
  selectedTag = null,
  onSelect,
  problem = null,
  empty = "No sections yet: write one arrange() per labelled track and run it.",
  showBars = true,
  className,
  "data-testid": testId,
}: SectionRibbonProps) {
  const span = ribbonSpan(sections, totalBars);
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const looping = sections.findIndex((s) => s.tag === loopTag);
  const selected = sections.findIndex((s) => s.tag === selectedTag);
  const [focus, setFocus] = useState(0);
  const tabIndexAt = Math.min(
    sections.length - 1,
    Math.max(0, looping >= 0 ? looping : selected >= 0 ? selected : focus),
  );

  if (problem)
    return (
      <p
        role="status"
        className={clsx(
          "rounded-control border border-dashed border-issue/60 bg-surface-2 px-3 py-2 text-sm text-text",
          className,
        )}
        data-testid={testId}
        data-ribbon-state="problem"
      >
        {problem}
      </p>
    );
  if (sections.length === 0)
    return (
      <p
        className={clsx(
          "rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-2",
          className,
        )}
        data-testid={testId}
        data-ribbon-state="empty"
      >
        {empty}
      </p>
    );

  const go = (i: number) => {
    setFocus(i);
    refs.current[i]?.focus();
  };
  const activate = (i: number) => {
    const s = sections[i];
    if (!s) return;
    onSelect?.(s);
    if (onLoop) onLoop(loopTag === s.tag ? null : s);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const a = ribbonKey(e, i, sections.length, loopTag === sections[i]?.tag);
    if (!a) return;
    if (a.kind === "stop" && !onLoop) return;
    if (a.kind === "stop" && loopTag === null && e.key === "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    if (a.kind === "move") go(a.index);
    else if (a.kind === "loop") activate(a.index);
    else onLoop?.(null);
  };
  const playing = currentBar === null ? -1 : sections.findIndex((s) => inSection(s, currentBar));
  const loopSection = looping >= 0 ? sections[looping] : null;

  return (
    <div className={clsx("flex min-w-0 flex-col gap-1", className)} data-testid={testId}>
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of section blocks with roving focus. */}
      <div
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        className="relative grid min-w-0 gap-1"
        style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
      >
        {sections.map((s, i) => {
          const isLoop = i === looping;
          const isSel = i === selected;
          const tone = PARTS_PALETTE[letterTone(s.letter)];
          // A block under a tenth of the ribbon (a 2-bar intro in a 32-bar song) shows its letter alone; its name
          // stays in its accessible name and its tooltip.
          const compact = Math.max(1, s.bars) / span < 0.1;
          return (
            <button
              key={s.tag}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === tabIndexAt ? 0 : -1}
              aria-label={sectionName(s, pickup, isLoop, i === playing)}
              aria-pressed={onLoop ? isLoop : isSel}
              title={`${s.text} · ${barSpanText(s.startBar, s.bars, pickup)}`}
              data-section={s.tag}
              data-letter={s.letter}
              data-looping={isLoop || undefined}
              onClick={() => {
                setFocus(i);
                activate(i);
              }}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "relative flex h-11 min-w-0 items-center gap-1.5 overflow-hidden rounded-control border bg-surface-2 pr-1.5 pl-2.5 text-left text-sm transition-colors",
                compact && "justify-center pl-2",
                isLoop
                  ? "border-accent bg-accent/15 text-text shadow-[inset_0_0_0_1px_var(--oak-accent)]"
                  : isSel
                    ? "border-accent text-text"
                    : "border-border text-text hover:border-text-3",
                isSel && "ring-2 ring-accent/40",
              )}
              style={{ gridColumn: `${s.startBar + 1} / span ${Math.max(1, s.bars)}` }}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone }} />
              {s.energy !== undefined && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-1 bg-accent/35"
                  style={{ width: `${Math.round(Math.min(1, Math.max(0, s.energy)) * 100)}%` }}
                />
              )}
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[0.6875rem] font-semibold text-text-2"
              >
                {s.letter}
              </span>
              {!compact && (
                <span aria-hidden className="min-w-0 flex-1 truncate font-medium">
                  {s.text}
                </span>
              )}
              {isLoop && !compact && (
                <Repeat aria-hidden className="size-3.5 shrink-0 text-accent" strokeWidth={2.25} />
              )}
            </button>
          );
        })}
        {currentBar !== null && currentBar >= 0 && currentBar < span && (
          <span
            aria-hidden
            data-testid="ribbon-playhead"
            className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-accent-2"
            style={{ left: `calc(${((currentBar + 0.5) / span) * 100}% - 1px)` }}
          />
        )}
      </div>
      {showBars && (
        <div
          aria-hidden
          className="grid min-w-0 gap-1 text-[0.6875rem] text-text-3 tabular-nums"
          style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
        >
          {sections.map((s) => (
            <span
              key={s.tag}
              className="truncate"
              style={{ gridColumn: `${s.startBar + 1} / span ${Math.max(1, s.bars)}` }}
            >
              {barNumber(s.startBar, pickup) ?? "pickup"}
            </span>
          ))}
        </div>
      )}
      <p id={hintId} className="text-[0.75rem] text-text-3" data-testid="ribbon-status">
        {loopSection
          ? `Looping ${loopSection.text}, ${barSpanText(loopSection.startBar, loopSection.bars, pickup)}. Enter or Esc stops.`
          : onLoop
            ? "Click a section, or press Enter on it, to loop it. Arrows move between sections."
            : "Arrows move between sections; Enter picks one."}
      </p>
    </div>
  );
}

function inSection(s: RibbonSection, bar: number): boolean {
  return bar >= s.startBar && bar < s.startBar + Math.max(1, s.bars);
}
