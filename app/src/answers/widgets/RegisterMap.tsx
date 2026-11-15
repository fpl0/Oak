// "Mark the register each part lives in" (Wave 7; A2.L01, A.CP): a `slot-choice` whose options are register bands
// (theory `REGISTER_ROLES`: sub, bass, low mids, mids, highs) is drawn as a map: one row per part (the slot labels),
// one column per band, low to high, with the band's note range in its header. A row is a radio group; a cell is
// one band. Keys: arrows left and right move along the row and pick, up and down change rows, a digit picks the
// n-th band of the current row, Backspace clears it. Marks per part; a reveal outlines the answer's cell.
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { registerBands } from "../sound7.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  digitOf,
  KeyHint,
  MarkBadge,
  markOf,
  markRing,
  revealedOf,
  SubmitHint,
} from "../ui.tsx";
import { plainMd } from "./InlineMd.tsx";

export function RegisterMapAnswer(p: AnswerWidgetProps<"slot-choice">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const offered = new Set(spec.options.map((o) => o.id));
  const bands = registerBands().filter((b) => offered.has(b.id));
  const labelOf = (id: string) => plainMd(spec.options.find((o) => o.id === id)?.label ?? id);
  const correct = revealedOf<string[]>(feedback);
  const slots = Array.from({ length: spec.slots }, (_, i) => value[i] ?? "");
  const [row, setRow] = useState(0);

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [p.autoFocus]);

  const set = (r: number, id: string) => {
    if (disabled) return;
    const next = [...slots];
    next[r] = id;
    onChange(next);
  };
  const focusCell = (r: number, c: number) =>
    root.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const cell = (document.activeElement as HTMLElement | null)?.getAttribute("data-cell");
    const [r, c] = cell ? cell.split(":").map(Number) : [row, -1];
    const rr = r ?? 0;
    const cc = c ?? -1;
    const n = digitOf(e);
    if (n !== null && n >= 1 && n <= bands.length) {
      set(rr, (bands[n - 1] as (typeof bands)[number]).id);
      focusCell(rr, n - 1);
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const at = cc < 0 ? 0 : Math.max(0, Math.min(bands.length - 1, cc + (e.key === "ArrowLeft" ? -1 : 1)));
      set(rr, (bands[at] as (typeof bands)[number]).id);
      focusCell(rr, at);
      return true;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const nr = Math.max(0, Math.min(spec.slots - 1, rr + (e.key === "ArrowUp" ? -1 : 1)));
      setRow(nr);
      const pickedAt = bands.findIndex((b) => b.id === slots[nr]);
      focusCell(nr, pickedAt < 0 ? Math.max(0, cc) : pickedAt);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!disabled) set(rr, "");
      return true;
    }
    return false;
  };

  const partLabel = (i: number) => spec.labels?.[i] ?? `Part ${i + 1}`;
  return (
    <AnswerFrame
      kind="slot-choice"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["←", "→"]}>register</KeyHint>
          <KeyHint keys={["↑", "↓"]}>part</KeyHint>
          <KeyHint keys={[`1–${bands.length}`]}>pick</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="max-w-full overflow-x-auto" data-register-map>
        <div
          className="grid min-w-[30rem] gap-1"
          style={{ gridTemplateColumns: `minmax(6.5rem, 9rem) repeat(${bands.length}, minmax(4.5rem, 1fr))` }}
        >
          <span aria-hidden />
          {bands.map((b, c) => (
            <span
              key={b.id}
              aria-hidden
              className="flex flex-col px-1 pb-1 text-[0.75rem] leading-tight text-text-3"
            >
              <span className="font-medium text-text-2">
                <span className="font-mono">{c + 1}</span> {labelOf(b.id)}
              </span>
              <span className="tabular-nums">{b.range}</span>
            </span>
          ))}
          {slots.map((v, r) => {
            const mark = markOf(feedback, r);
            const m = mark ? (mark.ok ? "ok" : "bad") : null;
            return (
              <div key={partLabel(r)} role="radiogroup" aria-label={partLabel(r)} className="contents">
                <span className="flex items-center gap-1 pr-2 text-sm font-medium text-text">
                  {partLabel(r)}
                  {m ? <span className="sr-only">{m === "ok" ? ", right" : ", not this one"}</span> : null}
                </span>
                {bands.map((b, c) => {
                  const on = v === b.id;
                  const isAnswer = correct?.[r] === b.id;
                  const tab = on || (v === "" && c === 0);
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: a styled cell with roving focus
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      data-cell={`${r}:${c}`}
                      data-band={b.id}
                      aria-checked={on}
                      aria-disabled={disabled || undefined}
                      aria-label={`${partLabel(r)}: ${labelOf(b.id)}, ${b.range}${on && m ? (m === "ok" ? ", right" : ", not this one") : ""}${isAnswer ? " (the answer)" : ""}`}
                      title={b.text}
                      tabIndex={tab ? 0 : -1}
                      onFocus={() => setRow(r)}
                      onClick={() => set(r, b.id)}
                      className={clsx(
                        "relative h-10 rounded-control border-2 transition-colors reduced:transition-none",
                        on ? "border-text bg-accent/20" : "border-border bg-surface hover:bg-surface-2",
                        on && markRing(m),
                        isAnswer && "outline-2 -outline-offset-4 outline-accent-2 outline-dashed",
                      )}
                    >
                      {on ? <MarkBadge mark={m} note={mark?.note} /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </AnswerFrame>
  );
}
