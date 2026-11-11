// Rhythm grid entry (contracts §5.4 `grid`): toggle cells per subdivision, one row per drum (or one row of hits),
// counted `1 e & a`. Arrows walk the cells (one tab stop), Space or a click toggles, `X` toggles too, `P` plays
// the grid back through the shared adapter (`audition`). Cells are marked by their choice ID (`"6"`, `"kick:6"`).
import type { DrumRole } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { useAnswerEnv } from "../env.tsx";
import { gridCounts, gridToCode, rowLabel } from "../keys.ts";
import { gridSteps } from "../response.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, markOf, revealedOf } from "../ui.tsx";

export function RhythmGridAnswer(p: AnswerWidgetProps<"grid">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const root = useRef<HTMLDivElement>(null);
  const steps = gridSteps(spec);
  const rows = spec.rows as readonly (DrumRole | "hit")[];
  const beatsPerBar = env.grid?.beatsPerBar ?? 4;
  const bpm = env.grid?.bpm ?? 90;
  const per = Math.max(1, Math.round(spec.stepsPerBar / beatsPerBar));
  const counts = gridCounts(spec.stepsPerBar, spec.bars, beatsPerBar);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [head, setHead] = useState<number | null>(null);
  const correct = revealedOf<boolean[][]>(feedback);
  const one = rows.length === 1;
  const idOf = (r: number, c: number) => (one ? String(c) : `${rows[r] ?? r}:${c}`);

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [p.autoFocus]);

  // The playhead for one pass of the grid (it moves with reduced motion too: ux §7.6).
  useEffect(() => {
    if (head === null) return;
    const stepMs = ((60 / bpm) * beatsPerBar * 1000) / spec.stepsPerBar;
    const t = setTimeout(() => setHead(head + 1 >= steps ? null : head + 1), stepMs);
    return () => clearTimeout(t);
  }, [head, bpm, beatsPerBar, spec.stepsPerBar, steps]);

  const toggle = (r: number, c: number) => {
    if (disabled) return;
    const next = value.map((row) => [...row]);
    const row = next[r] ?? [];
    row[c] = !row[c];
    next[r] = row;
    onChange(next);
  };
  const play = () => {
    if (!p.audition) return;
    p.audition(gridToCode(rows, value, { stepsPerBar: spec.stepsPerBar, bars: spec.bars, bpm, beatsPerBar }));
    setHead(0);
  };
  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r));
    const cc = Math.max(0, Math.min(steps - 1, c));
    setFocus([rr, cc]);
    root.current?.querySelector<HTMLButtonElement>(`[data-cell="${rr}:${cc}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const [r, c] = focus;
    const inGrid = (e.target as HTMLElement).hasAttribute("data-cell");
    if (e.key === "p" || e.key === "P") {
      play();
      return true;
    }
    if (!inGrid) return false;
    if (e.key === "x" || e.key === "X") {
      toggle(r, c);
      return true;
    }
    if (e.key === "ArrowRight") move(r, c + 1);
    else if (e.key === "ArrowLeft") move(r, c - 1);
    else if (e.key === "ArrowDown") move(r + 1, c);
    else if (e.key === "ArrowUp") move(r - 1, c);
    else if (e.key === "Home") move(r, 0);
    else if (e.key === "End") move(r, steps - 1);
    else return false;
    return true;
  };

  return (
    <AnswerFrame
      kind="grid"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["←", "→", "↑", "↓"]}>move</KeyHint>
          <KeyHint keys={["Space", "X"]}>toggle</KeyHint>
          {p.audition ? <KeyHint keys={["P"]}>play</KeyHint> : null}
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-2">
        {p.audition ? (
          <div>
            <Button
              size="sm"
              icon={<Play aria-hidden className="size-4" />}
              onClick={play}
              data-enter="native"
            >
              Play the grid
            </Button>
          </div>
        ) : null}
        <div className="max-w-full overflow-x-auto pb-1">
          <table className="border-separate border-spacing-0" aria-label={p.label}>
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  Part
                </th>
                {counts.map((label, c) => (
                  <th
                    key={c}
                    scope="col"
                    className={clsx(
                      "h-5 min-w-7 px-0 text-center text-[0.7rem] font-normal tabular-nums",
                      c % per === 0 ? "text-text-2" : "text-text-3",
                      head === c && "text-accent",
                    )}
                  >
                    <span aria-hidden>{label}</span>
                    <span className="sr-only">
                      bar {Math.floor(c / spec.stepsPerBar) + 1}, {label === "" ? "" : label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row}>
                  <th
                    scope="row"
                    className={clsx(
                      "pr-2 text-left text-sm font-normal whitespace-nowrap text-text-2",
                      one && "sr-only",
                    )}
                  >
                    {rowLabel(row)}
                  </th>
                  {Array.from({ length: steps }, (_, c) => {
                    const on = value[r]?.[c] === true;
                    const mark = markOf(feedback, idOf(r, c));
                    const want = correct?.[r]?.[c] === true;
                    const beatStart = c % per === 0;
                    const barStart = c % spec.stepsPerBar === 0;
                    return (
                      <td
                        key={c}
                        className={clsx(
                          "p-0.5",
                          barStart && c > 0 && "border-l-2 border-text-3",
                          !barStart && beatStart && "border-l border-border",
                        )}
                      >
                        <button
                          type="button"
                          data-cell={`${r}:${c}`}
                          aria-pressed={on}
                          aria-disabled={disabled || undefined}
                          aria-label={`${one ? "Hit" : rowLabel(row)} at ${counts[c] || "·"} of beat ${Math.floor((c % spec.stepsPerBar) / per) + 1}, bar ${Math.floor(c / spec.stepsPerBar) + 1}${mark ? (mark.ok ? ", right" : ", not this one") : ""}${want ? ", in the answer" : ""}`}
                          tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                          onFocus={() => setFocus([r, c])}
                          onClick={() => toggle(r, c)}
                          className={clsx(
                            "flex size-7 items-center justify-center rounded-[5px] border-2",
                            on
                              ? "border-text bg-text"
                              : beatStart
                                ? "border-border bg-surface-2"
                                : "border-border bg-surface",
                            !on && "hover:border-text-3",
                            head === c && "ring-2 ring-accent",
                            mark?.ok === true && "border-accent",
                            mark?.ok === false && "border-issue",
                            want && "outline-2 outline-dashed outline-offset-1 outline-accent-2",
                          )}
                        >
                          {mark?.ok === false ? (
                            <span
                              aria-hidden
                              className={clsx("text-[0.7rem] font-bold", on ? "text-bg" : "text-issue")}
                            >
                              ×
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AnswerFrame>
  );
}
