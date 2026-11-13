// Wave 5 (docs/design/wave5.md §3.3): the DOM half of form and charts. `renderChart` draws a chord chart from
// `chartLayout` as plain HTML (lines of four bars, the chord symbol over the slash of its beat, a slash per beat,
// section labels and "Swing 8ths"), for hosts that want text they can style and read aloud rather than an
// engraved staff (`chartAbc` is the engraved one). `tagSections` gives the section labels abcjs drew on a staff
// their stable classes. Entry: "@oak/notation/render".

import type { Score } from "./types.ts";
import { type ChartLayout, chartBarText } from "./wave5.ts";

/** Stable classes of the chart view and of section labels on a rendered staff. */
export const CHART_CLASSES = {
  root: "oak-chart",
  title: "oak-chart-title",
  swing: "oak-chart-swing",
  line: "oak-chart-line",
  bar: "oak-chart-bar",
  /** Prefix: `oak-chart-b3` on chart bar 3 (1-based). */
  barAt: "oak-chart-b",
  number: "oak-chart-number",
  beat: "oak-chart-beat",
  chord: "oak-chart-chord",
  slash: "oak-chart-slash",
  section: "oak-section",
  /** Prefix: `oak-section-chorus2` on the label of that section. */
  sectionTag: "oak-section-",
  /** On the bar that is playing (`setChartBar`). */
  current: "oak-active",
} as const;

export interface RenderChartOptions {
  /** Show the bar number over the first bar of every line after the first (default true). */
  barNumbers?: boolean;
  /** Accessible name of the chart (default: the title, else "Chord chart"). */
  label?: string;
}

const SLASH = "∕"; // ∕ DIVISION SLASH

/**
 * Draws a chord chart into `el` (replacing its content): a list of lines, each a row of bars; each bar a grid of
 * one cell per beat holding the chord symbol over the slash of the beat it starts on. Colours come from
 * `currentColor` and the host's CSS (`CHART_CLASSES`); nothing animates. Each bar is a list item with a spoken
 * label (`chartBarText`). Returns a function that lights the bar that is playing (1-based, or null).
 */
export function renderChart(
  el: HTMLElement,
  layout: ChartLayout,
  opts: RenderChartOptions = {},
): { setBar(bar: number | null): void } {
  const doc = el.ownerDocument;
  const C = CHART_CLASSES;
  el.replaceChildren();
  const root = doc.createElement("figure");
  root.className = C.root;
  root.style.margin = "0";
  root.setAttribute("aria-label", opts.label ?? layout.title ?? "Chord chart");
  if (layout.title || layout.swingText) {
    const cap = doc.createElement("figcaption");
    cap.style.display = "flex";
    cap.style.justifyContent = "space-between";
    cap.style.gap = "1rem";
    cap.style.marginBottom = "0.5rem";
    if (layout.title) {
      const t = doc.createElement("span");
      t.className = C.title;
      t.style.fontWeight = "600";
      t.textContent = layout.title;
      cap.append(t);
    }
    if (layout.swingText) {
      const s = doc.createElement("span");
      s.className = C.swing;
      s.style.fontStyle = "italic";
      s.textContent = layout.swingText;
      cap.append(s);
    }
    root.append(cap);
  }
  const bars = new Map<number, HTMLElement>();
  for (const line of layout.lines) {
    const row = doc.createElement("ol");
    row.className = C.line;
    row.style.cssText =
      "list-style:none;margin:0 0 0.75rem;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));";
    row.style.gridTemplateColumns = `repeat(${Math.max(1, line.length)}, minmax(0, 1fr))`;
    line.forEach((bar, i) => {
      const cell = doc.createElement("li");
      cell.className = `${C.bar} ${C.barAt}${bar.bar}`;
      cell.setAttribute("aria-label", chartBarText(bar));
      // A barline on the left of each bar (a double one before a section), and the final one after the last bar.
      const left = bar.section?.doubleBar ? "3px double currentColor" : "1px solid currentColor";
      cell.style.cssText = `position:relative;min-width:0;padding:1.6rem 0.25rem 0.25rem;border-left:${left};`;
      if (i === line.length - 1) cell.style.borderRight = "1px solid currentColor";
      if (bar.section || ((opts.barNumbers ?? true) && i === 0 && bar.bar > 1)) {
        const top = doc.createElement("div");
        top.style.cssText =
          "position:absolute;top:0;left:0.25rem;right:0.25rem;display:flex;gap:0.5rem;font-size:0.75em;white-space:nowrap;overflow:hidden;";
        if (bar.section) {
          const s = doc.createElement("span");
          s.className = `${C.section} ${C.sectionTag}${bar.section.tag}`;
          s.style.fontWeight = "600";
          s.textContent = bar.section.text;
          top.append(s);
        }
        // Bar numbers at the start of every line but the first, as on the staff.
        if ((opts.barNumbers ?? true) && i === 0 && bar.bar > 1) {
          const n = doc.createElement("span");
          n.className = C.number;
          n.style.opacity = "0.75";
          n.textContent = String(bar.bar);
          top.append(n);
        }
        cell.append(top);
      }
      const beats = doc.createElement("div");
      beats.setAttribute("aria-hidden", "true");
      beats.style.cssText = `display:grid;grid-template-columns:repeat(${bar.slashes},minmax(0,1fr));align-items:end;`;
      for (let b = 1; b <= bar.slashes; b++) {
        const beat = doc.createElement("div");
        beat.className = C.beat;
        beat.style.cssText = "display:flex;flex-direction:column;align-items:center;min-width:0;";
        const chord = doc.createElement("span");
        chord.className = C.chord;
        chord.style.cssText = "font-weight:600;min-height:1.4em;white-space:nowrap;";
        const here = bar.chords.filter((c) => Math.floor(c.beat + 1e-9) === b);
        chord.textContent = here.map((c) => c.text).join(" ");
        const slash = doc.createElement("span");
        slash.className = C.slash;
        slash.style.cssText = "font-size:1.25em;line-height:1;opacity:0.8;";
        slash.textContent = SLASH;
        beat.append(chord, slash);
        beats.append(beat);
      }
      cell.append(beats);
      row.append(cell);
      bars.set(bar.bar, cell);
    });
    root.append(row);
  }
  el.append(root);
  let lit: HTMLElement | null = null;
  return {
    setBar(bar) {
      const next = bar === null ? null : (bars.get(bar) ?? null);
      if (next === lit) return;
      lit?.classList.remove(C.current);
      lit?.removeAttribute("aria-current");
      next?.classList.add(C.current);
      next?.setAttribute("aria-current", "true");
      lit = next;
    },
  };
}

/**
 * Gives the section labels abcjs drew on a rendered staff (`[P:…]` part labels, `text.abcjs-part`) the classes
 * `oak-section` and `oak-section-{tag}`, in order of `score.sections`.
 */
export function tagSections(el: HTMLElement, score: Score): void {
  const svg = el.querySelector("svg");
  if (!svg) return;
  const parts = [...svg.querySelectorAll("text.abcjs-part, .abcjs-part text, text.abcjs-part-label")];
  (score.sections ?? []).forEach((m, i) => {
    const t = parts[i];
    if (!t) return;
    const keep = (t.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((c) => c && !c.startsWith(CHART_CLASSES.sectionTag) && c !== CHART_CLASSES.section);
    t.setAttribute(
      "class",
      [...keep, CHART_CLASSES.section, `${CHART_CLASSES.sectionTag}${m.tag}`].join(" "),
    );
  });
}
