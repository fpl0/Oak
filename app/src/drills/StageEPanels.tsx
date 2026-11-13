// Stage E panels of the drill runner (Wave 5): the section strip of a form trial (each section heard on its own,
// its letter shown once answered), the twelve-bar chart (the bar that is playing lit as it plays, the asked bar
// marked, the numerals revealed after the answer). Keyboard-first; nothing here animates longer than the kit's
// transitions, and nothing depends on colour alone (letters, numerals and outlines).
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { useLive } from "./runtime.ts";
import { type BluesChart, barAt, type SectionWindow } from "./wave5.ts";

/** The bar playing now (1-based, passage bars), from the runner's playhead, or null when the passage is silent. */
export function usePlayingBar(): number | null {
  const playhead = useLive((s) => s.playhead);
  const [bar, setBar] = useState<number | null>(null);
  useEffect(() => {
    if (!playhead) {
      setBar(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const b = barAt(playhead.clock() - playhead.start, playhead.cps, playhead.bars);
      setBar(b === null ? null : b + playhead.fromBar);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playhead]);
  return playhead ? bar : null;
}

/** The twelve bars (or the passage heard), four to a line: the playing bar lit, the asked bar marked. */
export function BarChart({
  chart,
  revealed,
  onPlayBar,
}: {
  chart: BluesChart;
  revealed: boolean;
  /** After the answer: hear one bar by itself. */
  onPlayBar?(bar: number): void;
}) {
  const playing = usePlayingBar();
  const rows: (typeof chart.cells)[] = [];
  for (let i = 0; i < chart.cells.length; i += chart.perRow)
    rows.push(chart.cells.slice(i, i + chart.perRow));
  const offset = chart.cells.some((c) => c.formBar !== c.bar);
  return (
    <section className="flex w-full max-w-xl flex-col gap-1.5" data-testid="bar-chart" aria-label="The bars">
      {rows.map((row) => (
        <div key={row[0]?.bar} className="grid grid-cols-4 gap-1.5">
          {row.map((c) => {
            const isPlaying = playing === c.bar;
            const marked = chart.marked === c.bar;
            const label = `Bar ${c.bar}${offset && revealed ? ` (bar ${c.formBar} of the form)` : ""}${
              revealed && c.rn ? `: ${c.rn}` : ""
            }${marked ? ", the bar asked about" : ""}${isPlaying ? ", playing" : ""}`;
            const body = (
              <>
                <span className="text-[0.75rem] tabular-nums text-text-3">
                  {c.bar}
                  {offset && revealed ? ` · ${c.formBar}` : ""}
                </span>
                <span className="min-h-6 font-medium">{revealed ? (c.rn ?? "–") : marked ? "?" : ""}</span>
              </>
            );
            const cls = clsx(
              "flex h-14 flex-col items-start justify-between rounded-control border px-2 py-1 text-left transition-colors duration-100",
              isPlaying ? "border-accent bg-lane-in" : "border-border bg-surface",
              marked && "outline-2 outline-offset-1 outline-accent-2",
            );
            return revealed && onPlayBar ? (
              <button
                key={c.bar}
                type="button"
                className={clsx(
                  cls,
                  "hover:border-text-3 focus-visible:outline-2 focus-visible:outline-accent",
                )}
                aria-label={`${label}. Hear this bar alone`}
                onClick={() => onPlayBar(c.bar)}
                data-bar={c.bar}
                data-playing={isPlaying || undefined}
              >
                {body}
              </button>
            ) : (
              <div
                key={c.bar}
                className={cls}
                role="img"
                aria-label={label}
                data-bar={c.bar}
                data-playing={isPlaying || undefined}
              >
                {body}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/** The sections of a form trial: hear each one alone; once answered, its letter (and yours where it differs). */
export function SectionsBar({
  sections,
  revealed,
  yours,
  onPlay,
  playing,
}: {
  sections: readonly SectionWindow[];
  revealed: boolean;
  yours: readonly string[] | null;
  onPlay(index: number): void;
  playing: number | null;
}) {
  let bar = 1;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of play buttons
    <div
      role="group"
      aria-label="Hear a section alone"
      className="flex flex-wrap gap-2"
      data-testid="sections-bar"
    >
      {sections.map((s) => {
        const from = bar;
        bar += s.bars;
        const mine = yours?.[s.index];
        const differs = revealed && mine !== undefined && mine !== "" && mine !== s.letter;
        return (
          <Button
            key={s.index}
            size="sm"
            variant={playing === s.index ? "secondary" : "ghost"}
            onClick={() => onPlay(s.index)}
            data-section={s.index}
            aria-label={`Section ${s.index + 1}, bars ${from} to ${from + s.bars - 1}${
              revealed ? `: ${s.letter}${differs ? `, you wrote ${mine}` : ""}` : ""
            }. Hear it alone`}
          >
            <span className="tabular-nums">
              {revealed ? s.letter : `Section ${s.index + 1}`}
              <span className="text-text-3">
                {" "}
                · bars {from}–{from + s.bars - 1}
              </span>
              {differs ? <span className="text-text-2"> (you: {mine})</span> : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
