// A jazz chart the learner fills in by ear (Wave 7; the gym's jazz items, J4.L04 through the public exports): one
// cell a bar, four bars a line, a bar of two chords written "Dm7 G7". Each cell shows how Oak reads what was
// typed, in the learner's chosen style (lead sheet, or jazz glyphs once `tb.feature.jazz-glyphs` is theirs), and
// after a check its mark and the bar's one sentence (jazz-chart.ts: what is wrong in the learner's own symbol,
// never the chord that sounds). Enter in a cell checks; the cells are a plain tab order.
import type { ChordSymbolStyle } from "@oak/notation";
import { clsx } from "clsx";
import { useId } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { chartSymbolText, type JazzChartCheck, parseChartCell, readJazzChord } from "./jazz-chart.ts";

export function JazzChart({
  bars,
  value,
  onChange,
  style = "lead-sheet",
  check = null,
  onCheck,
  disabled = false,
  revealed = null,
  label = "Your chart",
}: {
  bars: number;
  /** The text of each bar's cell. */
  value: readonly string[];
  onChange(next: string[]): void;
  style?: ChordSymbolStyle;
  check?: JazzChartCheck | null;
  onCheck(): void;
  disabled?: boolean;
  /** The chart shown (rung 4): read-only cells with the chords that sound. */
  revealed?: readonly (readonly string[])[] | null;
  label?: string;
}) {
  const id = useId();
  const cells = Array.from({ length: bars }, (_, i) => value[i] ?? "");
  const wrong = check?.bars.filter((b) => !b.ok) ?? [];
  return (
    <section aria-label={label} className="flex flex-col gap-2" data-testid="jazz-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-h3">{label}</h3>
        <p className="text-sm text-text-3">
          One cell a bar; two chords in a bar: <span className="font-mono">Dm7 G7</span>. Glyphs read too (∆ –
          ø °). Check with <Kbd>Enter</Kbd>.
        </p>
      </div>
      <ol className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-4">
        {cells.map((text, i) => {
          const result = check?.bars[i];
          const shown = revealed?.[i];
          const symbols = shown ? [...shown] : parseChartCell(text);
          const reads = symbols.map((s) => (readJazzChord(s) ? chartSymbolText(s, style) : null));
          return (
            <li
              key={`bar-${i + 1}`}
              data-mark={result ? (result.ok ? "ok" : "issue") : undefined}
              data-testid="chart-bar"
              className={clsx(
                "flex min-w-0 flex-col gap-1 rounded-control border px-2 py-1.5",
                result ? (result.ok ? "border-accent/60" : "border-issue") : "border-border",
              )}
            >
              <label htmlFor={`${id}-${i}`} className="text-[0.75rem] tabular-nums text-text-3">
                Bar {i + 1}
                {result && !result.ok ? <span className="sr-only">: check it</span> : null}
              </label>
              <input
                id={`${id}-${i}`}
                value={shown ? shown.join(" ") : text}
                readOnly={shown !== undefined && shown !== null}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`${id}-${i}-reads`}
                onChange={(e) => {
                  const next = [...cells];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCheck();
                  }
                }}
                className="h-8 w-full min-w-0 rounded-control border border-control-border bg-control px-1.5 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-accent read-only:bg-surface-2"
                data-testid="chart-cell"
              />
              <span id={`${id}-${i}-reads`} className="min-h-5 truncate text-sm font-medium text-text-2">
                {symbols.length === 0
                  ? "–"
                  : reads.map((r, k) => (
                      <span
                        key={`${symbols[k]}-${k}`}
                        className={clsx(k > 0 && "ml-2", r === null && "text-issue")}
                      >
                        {r ?? `${symbols[k]}?`}
                      </span>
                    ))}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={onCheck}
          disabled={disabled || revealed !== null}
          data-testid="chart-check"
        >
          Check the chart
        </Button>
        {check ? (
          <p className="text-sm" role="status" data-testid="chart-summary">
            {check.score === 1
              ? `${check.summary} That's the chart.`
              : check.passed
                ? `${check.summary} That passes; ${wrong.length === 1 ? "the marked bar is" : "the marked bars are"} worth another listen.`
                : check.summary}
          </p>
        ) : null}
      </div>
      {wrong.length > 0 && !revealed ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-text-2" data-testid="chart-notes">
          {wrong.map((b) => (
            <li key={b.bar}>{b.text}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
