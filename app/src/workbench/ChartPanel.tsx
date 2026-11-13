// The chord chart (Wave 5 panel "chart", U11.L05–L06, C5, X2; docs/design/wave5.md §3.3): the piece's chords as a
// lead-sheet chart, four bars a line with a slash per beat (`@oak/notation` `chartLayout` + `renderChart`), the
// bar that plays lit, "Swing 8ths" when a line swings, and the 12-bar form named in words (`bluesView`). Bar
// numbers count from the first full bar after a pickup (c4). Chords come from the chord band (`harmonyView`).
import type { MeterSpec } from "@oak/content-kit";
import type { BluesView } from "@oak/grader";
import { chartLayout } from "@oak/notation";
import { renderChart } from "@oak/notation/render";
import { useEffect, useMemo, useRef } from "react";
import { bluesText, type ChartRegionInput, chartChordsOf, MAX_PIECE_BARS } from "./lines.ts";

export interface ChartPanelProps {
  regions: readonly ChartRegionInput[];
  meter: MeterSpec;
  bars: number;
  pickup: boolean;
  swing: 8 | 16 | null;
  blues: BluesView | null;
  /** The bar playing (0-based cycle), `null` when stopped. */
  currentBar: number | null;
  /** The code's own length in bars (its period), when longer than the bars analysed. */
  period: number | null;
}

export function ChartPanel(p: ChartPanelProps) {
  const host = useRef<HTMLDivElement>(null);
  const lit = useRef<{ setBar(bar: number | null): void } | null>(null);
  const input = useMemo(
    () => chartChordsOf(p.regions, p.meter.unitsPerBar, p.bars, p.pickup),
    [p.regions, p.meter.unitsPerBar, p.bars, p.pickup],
  );
  const layout = useMemo(
    () =>
      chartLayout({
        chords: input.chords,
        bars: input.bars,
        meter: p.meter,
        key: null,
        ...(p.swing ? { swing: { subdivision: p.swing, amount: 1 / 3 } } : {}),
      }),
    [input, p.meter, p.swing],
  );
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    lit.current = renderChart(el, layout, { label: "Chord chart" });
    return () => {
      lit.current = null;
      el.replaceChildren();
    };
  }, [layout]);
  const shift = p.pickup ? 1 : 0;
  useEffect(() => {
    lit.current?.setBar(p.currentBar === null || p.currentBar < shift ? null : p.currentBar - shift + 1);
  }, [p.currentBar, shift, layout]);
  const form = bluesText(p.blues);
  return (
    <section className="oak-wb-panel oak-chart-panel" aria-label="Chord chart" data-testid="chart-panel">
      <h3 className="oak-wb-panel-title">
        <span className="oak-muted">Chart</span> {form ? <span data-testid="chart-form">{form}</span> : null}
      </h3>
      {p.period !== null && p.period > p.bars && input.chords.length > 0 ? (
        <p className="oak-muted" data-testid="chart-short">
          {p.period <= MAX_PIECE_BARS
            ? `Showing ${p.bars} of the ${p.period} bars your code plays: set the length to ${p.period} bars to chart them all.`
            : `Showing the first ${p.bars} of the ${p.period} bars your code plays.`}
        </p>
      ) : null}
      {input.chords.length === 0 ? (
        <p className="oak-muted" data-testid="chart-empty">
          No chords yet: the chart writes the chords your code plays, four bars a line.
        </p>
      ) : (
        <div ref={host} className="oak-chart-host" data-testid="chart" />
      )}
    </section>
  );
}
