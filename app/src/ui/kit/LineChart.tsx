// LineChart (Wave 5): a small line chart of one series, for the energy curve of a piece (U09.L04, C3's contrast)
// and other 0–1 series. The line and its soft area are SVG (crisp at any width); points, labels and the marked point
// are HTML, so text never stretches. The chart is one image to a screen reader, named by a sentence that says the
// lowest and highest points; `table` adds the values as a visually hidden table.
import { clsx } from "clsx";
import { useId } from "react";
import { chartPath, chartPoints, chartSummary, percent } from "./model-w5.ts";

export interface LineChartProps {
  values: readonly number[];
  /** What the series is ("Energy"): the start of the accessible sentence. */
  label: string;
  /** One label per point ("Verse", "Chorus"): shown under the points when `showLabels`, and in the sentence. */
  labels?: readonly string[];
  min?: number;
  max?: number;
  /** A point to mark (the section playing, the bar under the cursor). */
  marked?: number | null;
  /** Height of the plot in px (96). */
  height?: number;
  showLabels?: boolean;
  /** Value text in the sentence and the table (default: a percent of 0–1). */
  format?: (v: number) => string;
  /** Adds a visually hidden table of the values. */
  table?: boolean;
  /** Text under an empty chart. */
  empty?: string;
  className?: string;
  "data-testid"?: string;
}

const W = 1000;

export function LineChart({
  values,
  label,
  labels,
  min = 0,
  max = 1,
  marked = null,
  height = 96,
  showLabels = true,
  format = percent,
  table = false,
  empty = "Nothing to draw yet.",
  className,
  "data-testid": testId,
}: LineChartProps) {
  const gradient = useId();
  const pts = chartPoints(values, min, max);
  const summary = chartSummary(values, labels, label, format);
  if (values.length === 0)
    return (
      <p
        className={clsx(
          "rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-2",
          className,
        )}
        data-testid={testId}
      >
        {empty}
      </p>
    );
  return (
    <figure className={clsx("m-0 flex min-w-0 flex-col gap-1", className)} data-testid={testId}>
      <div role="img" aria-label={summary} className="relative min-w-0" style={{ height }}>
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--oak-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--oak-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={height * g}
              y2={height * g}
              stroke="var(--oak-border)"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1="0"
            x2={W}
            y1={height}
            y2={height}
            stroke="var(--oak-border)"
            vectorEffect="non-scaling-stroke"
          />
          <path d={chartPath(pts, W, height, true)} fill={`url(#${gradient})`} />
          <path
            d={chartPath(pts, W, height)}
            fill="none"
            stroke="var(--oak-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {pts.map(([x, y], i) => (
          <span
            key={i}
            aria-hidden
            data-point={i}
            data-marked={marked === i || undefined}
            className={clsx(
              "absolute rounded-full border-2 border-surface",
              marked === i ? "size-3 bg-accent-2" : "size-2 bg-accent",
            )}
            style={{
              left: `${x * 100}%`,
              top: `${(1 - y) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
      {showLabels && labels && labels.length === values.length && (
        <div aria-hidden className="relative h-4 min-w-0 text-[0.6875rem] text-text-3" data-chart-labels>
          {labels.map((l, i) =>
            // A run of points with one label (bars of one section) prints it once, at its first point.
            i > 0 && labels[i - 1] === l ? null : (
              <span
                key={i}
                className={clsx(
                  "absolute top-0 max-w-[6rem] truncate whitespace-nowrap",
                  marked === i && "font-semibold text-text-2",
                )}
                style={{
                  left: `${(pts[i]?.[0] ?? 0) * 100}%`,
                  transform: `translateX(${i === 0 && pts.length > 1 ? "0" : i === pts.length - 1 && pts.length > 1 ? "-100%" : "-50%"})`,
                }}
              >
                {l}
              </span>
            ),
          )}
        </div>
      )}
      {table && (
        <table className="sr-only">
          <caption>{label}</caption>
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                <th scope="row">{labels?.[i] ?? `Point ${i + 1}`}</th>
                <td>{format(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
