// The section ribbon (Wave 5, the section lens, tb.lens.form at U09.L02; docs/design/wave5.md §4.3–§4.4): one band
// per section of the per-track `arrange()` over the roll (or the staff), on the same time axis, coloured by its
// letter (A, B, …) and filled by its energy. A click, or Enter on the focused section, loops that section; the
// arrows move along the ribbon (one tab stop). When the lesson or the learner asks (the form map is open), the
// energy curve runs under it. When the arranged tracks disagree, the ribbon says so in words instead of drawing a
// wrong form; the sections always come from `formView`, never from a parse of its own.
import { useLayoutEffect, useRef } from "react";
import { type FormViewSection, type SectionLoop, sectionLoopOf, stepSection } from "../lib/form-view.ts";
import { energyPath, letterNamed, sectionBarsText, sectionLabel } from "./lines.ts";

/** The time axis the ribbon shares with the roll: x of a cycle, and the visible window. */
export interface RibbonAxis {
  /** Left edge of the music (the roll's gutter). */
  left: number;
  width: number;
  from: number;
  to: number;
  xOf(cycle: number): number;
}

/** A linear axis over `bars` bars across `width` px (the ribbon over the staff, with no roll). */
export function linearAxis(width: number, bars: number, left = 0): RibbonAxis {
  const span = Math.max(1, bars);
  return {
    left,
    width,
    from: 0,
    to: span,
    xOf: (c) => left + ((width - left) * c) / span,
  };
}

export interface SectionRibbonProps {
  sections: readonly FormViewSection[];
  energy: readonly number[];
  problem: string | null;
  axis: RibbonAxis;
  /** The bar playing now (0-based), `null` when stopped. */
  currentBar: number | null;
  loop: SectionLoop | null;
  onLoop(loop: SectionLoop | null): void;
  /** Bar 0 is a pickup: bar numbers count from the first full bar (c4). */
  pickup: boolean;
  /** Draw the energy curve under the ribbon (the form map is open, or a step opened it). */
  showEnergy: boolean;
  /**
   * Bring a section outside the axis's window into view (the roll turns its page to that bar): the arrow keys
   * reach every section of the piece, not only the ones on the roll's page (d3). Absent: the axis shows them all.
   */
  onReveal?(startBar: number): void;
}

const ENERGY_H = 22;

export function SectionRibbon(p: SectionRibbonProps) {
  const list = useRef<HTMLDivElement>(null);
  // A section the arrows moved to on another page of the roll: focused once the page has turned to it.
  const wantFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (wantFocus.current === null) return;
    const el = list.current?.querySelector<HTMLButtonElement>(`[data-start="${wantFocus.current}"]`);
    if (el) {
      wantFocus.current = null;
      el.focus();
    }
  });
  if (p.problem)
    return (
      <p className="oak-ribbon-problem" role="status" data-testid="section-problem">
        <strong>The tracks disagree about the sections.</strong> {p.problem} Write one arrange() per labelled
        track, with the same bars in the same order.
      </p>
    );
  if (p.sections.length === 0) return null;
  const { axis } = p;
  const visible = p.sections.filter((s) => s.startBar + s.bars > axis.from && s.startBar < axis.to);
  const current =
    p.currentBar === null
      ? null
      : (p.sections.find(
          (s) => p.currentBar !== null && p.currentBar >= s.startBar && p.currentBar < s.startBar + s.bars,
        ) ?? null);
  const focusIdx = (() => {
    const looped = p.loop ? visible.findIndex((s) => s.startBar === p.loop?.from) : -1;
    return Math.max(looped, 0);
  })();
  const isLooped = (s: FormViewSection) =>
    p.loop !== null && p.loop.from === s.startBar && p.loop.bars === s.bars;
  const toggle = (s: FormViewSection) => p.onLoop(isLooped(s) ? null : sectionLoopOf(s));
  const onKey = (ev: React.KeyboardEvent<HTMLButtonElement>, s: FormViewSection) => {
    const dir = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    const end =
      ev.key === "Home" ? p.sections[0] : ev.key === "End" ? p.sections[p.sections.length - 1] : null;
    if (dir !== 0 || end) {
      ev.preventDefault();
      ev.stopPropagation();
      // Every section of the piece, not only those in the window: one off the page asks the roll to turn to it.
      const next = end ?? stepSection(p.sections, s, dir as 1 | -1);
      if (!next || next.startBar === s.startBar) return;
      const el = list.current?.querySelector<HTMLButtonElement>(`[data-start="${next.startBar}"]`);
      if (el) el.focus();
      else if (p.onReveal) {
        wantFocus.current = next.startBar;
        p.onReveal(next.startBar);
      }
      return;
    }
    if (ev.key === "Escape" && p.loop) {
      ev.preventDefault();
      ev.stopPropagation();
      p.onLoop(null);
    }
  };
  const energyD = p.showEnergy
    ? energyPath(
        p.energy.slice(Math.floor(axis.from), Math.ceil(axis.to)),
        axis.xOf(axis.to) - axis.xOf(axis.from),
        ENERGY_H,
        Math.max(1, Math.ceil(axis.to) - Math.floor(axis.from)),
      )
    : "";
  return (
    <div className="oak-ribbon-wrap" data-testid="section-ribbon-wrap">
      <div
        ref={list}
        className="oak-ribbon"
        role="toolbar"
        aria-label="Sections: Enter loops a section, arrows move through every section"
        data-testid="section-ribbon"
        data-sections={p.sections.length}
        style={{ width: axis.width }}
      >
        {visible.map((s, i) => {
          const left = Math.max(axis.left, axis.xOf(Math.max(axis.from, s.startBar)));
          const right = Math.min(axis.width, axis.xOf(Math.min(axis.to, s.startBar + s.bars)));
          const looped = isLooped(s);
          const playing = current?.startBar === s.startBar;
          return (
            <button
              key={`${s.tag}-${s.startBar}`}
              type="button"
              className="oak-ribbon-section"
              data-letter={s.letter}
              data-start={s.startBar}
              data-tag={s.tag}
              data-playing={playing ? "1" : undefined}
              aria-pressed={looped}
              aria-label={`${sectionLabel(s, p.pickup)}${looped ? ", looping" : ""}`}
              title={`${s.text} · ${sectionBarsText(s, p.pickup)} · ${s.tracks.join(", ") || "silent"}${looped ? " · looping (click to stop)" : " · click to loop"}`}
              tabIndex={i === focusIdx ? 0 : -1}
              style={{
                left,
                width: Math.max(4, right - left - 2),
                ["--energy" as string]: String(Math.round(s.energy * 100)),
              }}
              onClick={() => toggle(s)}
              onKeyDown={(ev) => onKey(ev, s)}
            >
              {/* A section named by a letter (A, B) shows it once, not "A A". */}
              {letterNamed(s) ? null : (
                <span className="oak-ribbon-letter" aria-hidden>
                  {s.letter}
                </span>
              )}
              <span className="oak-ribbon-text">{s.text}</span>
              {looped ? (
                <span className="oak-ribbon-loop" aria-hidden>
                  ⟲
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {energyD ? (
        <svg
          className="oak-ribbon-energy"
          width={axis.width}
          height={ENERGY_H}
          role="img"
          aria-label={`Energy curve: ${p.sections.map((s) => `${s.text} ${Math.round(s.energy * 100)}%`).join(", ")}`}
          data-testid="energy-curve"
        >
          <g transform={`translate(${axis.xOf(axis.from)},0)`}>
            <path d={energyD} className="oak-energy-line" />
          </g>
        </svg>
      ) : null}
    </div>
  );
}
