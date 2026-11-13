// L6's changes on a chord chart (contracts §6.6 X2: "the 12-bar chart view filling in as the learner writes the
// changes"): the answers engineer's bar-grid widget, one chord symbol a bar, four bars a line, written into the
// code's `chords:` line by the page (song.ts `withChanges`). Until that widget exists, the chart shows what the code
// says, bar by bar, laid out by @oak/notation's `chartLayout`, and the learner writes the line in the editor.
import type { KeySpec, MeterId } from "@oak/content-kit";
import { chartChordText, chartLayout } from "@oak/notation";
import { METERS } from "@oak/theory";
import { clsx } from "clsx";
import { AnswerEnvProvider } from "../answers/env.tsx";
import { answerWidgetFor } from "../answers/registry.tsx";
import type { AnswerFeedback, AnswerSpecOf } from "../answers/types.ts";
import type { BarMark } from "./song.ts";

/** The bar-grid answer the chart uses: code-spelled symbols, triads and dominant sevenths. */
export function chartSpec(bars: number): AnswerSpecOf<"bar-grid"> {
  return { ui: "bar-grid", bars, perRow: 4, entry: "symbol", qualities: ["maj", "min", "7"] };
}

/** The chart's per-bar marks as the widget's feedback (bar index 0-based). */
export function chartFeedback(
  marks: ReadonlyMap<number, BarMark> | null,
  firstCycle: number,
): AnswerFeedback {
  if (!marks || marks.size === 0) return { state: "idle" };
  const parts = [...marks.entries()].map(([cycle, m]) => ({ part: cycle - firstCycle, ok: m === "ok" }));
  return parts.every((p) => p.ok) ? { state: "correct", marks: parts } : { state: "wrong", marks: parts };
}

export function ChangesChart({
  chart,
  onChart,
  bars,
  meter,
  keySpec,
  bpm,
  swing,
  marks,
  firstCycle,
  disabled = false,
  onSubmit,
}: {
  /** One symbol per full bar (`""` empty). */
  chart: readonly string[];
  onChart(next: string[]): void;
  bars: number;
  meter: MeterId;
  /** The song's key: the palette offers its own chords and the chart plays in it. */
  keySpec: KeySpec | null;
  bpm: number;
  swing: boolean;
  /** The last changes check per timeline cycle. */
  marks: ReadonlyMap<number, BarMark> | null;
  /** Timeline cycle of bar 1 (1 after a pickup). */
  firstCycle: number;
  disabled?: boolean;
  onSubmit(): void;
}) {
  const spec = chartSpec(bars);
  const Widget = answerWidgetFor(spec);
  if (Widget)
    return (
      <div data-testid="changes-chart">
        <AnswerEnvProvider
          value={{
            harmony: {
              ...(keySpec ? { key: keySpec } : {}),
              bpm,
              beatsPerBar: METERS[meter]?.unitsPerBar ?? 4,
            },
          }}
        >
          <Widget
            spec={spec}
            value={[...chart]}
            onChange={(v) => onChart(v)}
            onSubmit={onSubmit}
            disabled={disabled}
            feedback={chartFeedback(marks, firstCycle)}
            label="The changes: one chord a bar"
            idBase="tr-changes"
          />
        </AnswerEnvProvider>
      </div>
    );
  const layout = chartLayout({
    chords: chart.flatMap((symbol, i) => (symbol ? [{ bar: i, beat: 1, symbol }] : [])),
    bars,
    meter: METERS[meter] ?? METERS["4/4"],
    key: keySpec,
    ...(swing ? { swing: { subdivision: 8 as const, amount: 1 / 3 } } : {}),
  });
  return (
    <figure
      className="m-0 flex flex-col gap-1.5"
      data-testid="changes-chart"
      aria-label="Your chart, from the chords: line"
    >
      <figcaption className="flex items-baseline justify-between gap-2 text-sm text-text-2">
        <span>Your chart, read from the chords: line</span>
        {layout.swingText ? <span className="text-text-3">{layout.swingText}</span> : null}
      </figcaption>
      <div className="flex flex-col gap-1">
        {layout.lines.map((line) => (
          <ol key={line[0]?.bar ?? 0} className="m-0 grid list-none grid-cols-4 gap-1 p-0">
            {line.map((b) => {
              const mark = marks?.get(b.bar - 1 + firstCycle);
              const sym = b.chords[0]?.text ?? null;
              return (
                <li
                  key={b.bar}
                  data-mark={mark}
                  className={clsx(
                    "flex min-h-11 min-w-0 flex-col justify-between rounded-control border px-1.5 py-1",
                    mark === "issue" ? "border-issue" : mark === "ok" ? "border-accent/60" : "border-border",
                  )}
                  aria-label={`Bar ${b.bar}: ${sym ? chartChordText(chart[b.bar - 1] ?? "") : "empty"}${mark === "issue" ? ", check it" : ""}`}
                >
                  <span className="text-[0.75rem] tabular-nums text-text-3">{b.bar}</span>
                  <span className={clsx("truncate font-medium", sym ? "text-text" : "text-text-3")}>
                    {sym ?? "–"}
                  </span>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </figure>
  );
}
