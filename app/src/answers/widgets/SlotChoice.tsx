// One choice per slot (Wave 4 `slot-choice`): the function strip under four bars (T PD D T), the cadence at the end
// of each phrase, "chord tone or not" per marked note. A strip of slots over one shared palette, as the Roman
// numeral palette works: `1`–`9` put that option in the selected slot and move to the next empty one, `←`/`→`
// choose a slot, `Backspace` clears, `P` plays the selected slot when the host can (`AnswerEnv.slots.play`).
// Function options wear the function colours, always with their letters. Marks per slot; a reveal prints the
// answer under each slot in a row whose height is reserved, so nothing moves.
import type { Choice } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { functionStyle } from "../../ui/theme/palette.ts";
import { useAnswerEnv } from "../env.tsx";
import { clearSlot, fillSlot, optionFunction, optionShort, slotLabels } from "../harmony.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  digitOf,
  focusFirst,
  KeyHint,
  MarkBadge,
  markOf,
  markRing,
  revealedOf,
  SubmitHint,
  useThemeName,
} from "../ui.tsx";
import { plainMd } from "./InlineMd.tsx";

function OptionChip({ option, size = "md" }: { option: Choice; size?: "sm" | "md" }) {
  const theme = useThemeName();
  const fn = optionFunction(option);
  const st = fn ? functionStyle(fn, theme) : null;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-control px-2 font-semibold leading-none",
        size === "sm" ? "h-7 min-w-10 text-sm" : "h-9 min-w-12",
      )}
      style={st ? { background: st.fill, color: st.label } : undefined}
    >
      {optionShort(option)}
    </span>
  );
}

export function SlotChoiceAnswer(p: AnswerWidgetProps<"slot-choice">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const root = useRef<HTMLDivElement>(null);
  const n = spec.slots;
  const firstEmpty = Array.from({ length: n }, (_, k) => value[k] ?? "").indexOf("");
  const [slot, setSlot] = useState<number>(Math.max(firstEmpty, 0));
  const correct = revealedOf<string[]>(feedback);
  const labels = slotLabels(n, {
    ...(env.harmony?.slotsPerBar ? { slotsPerBar: env.harmony.slotsPerBar } : {}),
    ...(env.harmony?.beatsPerBar ? { beatsPerBar: env.harmony.beatsPerBar } : {}),
    ...(spec.labels ? { labels: spec.labels } : {}),
  });
  const byId = new Map(spec.options.map((o) => [o.id, o]));
  const play = env.slots?.play;
  const at = Math.min(slot, n - 1);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  // Focus follows the selected slot while it is in the strip (typing 1 2 3 1 walks along it).
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active?.closest("[data-slots]") || !root.current?.contains(active)) return;
    root.current.querySelector<HTMLButtonElement>(`[data-slot="${at}"]`)?.focus();
  }, [at]);

  const pick = (o: Choice) => {
    if (disabled) return;
    const r = fillSlot(value, n, o.id, at);
    onChange(r.value);
    if (r.next !== null) setSlot(r.next);
  };
  const focusSlot = (i: number) => {
    setSlot(i);
    root.current?.querySelector<HTMLButtonElement>(`[data-slot="${i}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const d = digitOf(e);
    if (d !== null && !e.shiftKey && d >= 1 && d <= spec.options.length) {
      pick(spec.options[d - 1] as Choice);
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.altKey || e.metaKey || e.ctrlKey) return false;
      const inSlots = (e.target as HTMLElement).closest("[data-slots]");
      const next = Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
      if (inSlots) focusSlot(next);
      else setSlot(next);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled) return true;
      const r = clearSlot(value, n, at);
      onChange(r.value);
      if (r.at !== null) setSlot(r.at);
      return true;
    }
    if ((e.key === "p" || e.key === "P") && play && !e.metaKey && !e.ctrlKey && !e.altKey) {
      play(at);
      return true;
    }
    return false;
  };

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
          <KeyHint keys={[`1–${spec.options.length}`]}>fill the slot</KeyHint>
          <KeyHint keys={["←", "→"]}>slot</KeyHint>
          <KeyHint keys={["⌫"]}>clear</KeyHint>
          {play ? <KeyHint keys={["P"]}>hear it</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3">
        <ol data-slots aria-label="Your answer, one per slot" className="flex flex-wrap gap-2">
          {labels.map((l, i) => {
            const id = value[i] ?? "";
            const o = id ? byId.get(id) : undefined;
            const mark = markOf(feedback, i);
            const selected = !disabled && i === at;
            const answer = correct?.[i] ? byId.get(correct[i] as string) : undefined;
            return (
              <li key={l.spoken} className="flex flex-col items-center gap-1">
                <span aria-hidden className="text-[0.7rem] text-text-3">
                  {l.short}
                </span>
                <button
                  type="button"
                  data-slot={i}
                  aria-pressed={selected}
                  aria-disabled={disabled || undefined}
                  aria-label={`${l.spoken}: ${o ? plainMd(o.label) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                  tabIndex={i === at ? 0 : -1}
                  onFocus={() => setSlot(i)}
                  onClick={() => setSlot(i)}
                  className={clsx(
                    "relative inline-flex h-12 min-w-16 items-center justify-center rounded-control border-2 px-1.5",
                    o ? "border-border bg-surface" : "border-dashed border-border text-text-3",
                    selected && "border-text-3 bg-surface-2",
                    markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                  )}
                >
                  {o ? <OptionChip option={o} size="sm" /> : <span aria-hidden>·</span>}
                  <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                </button>
                {/* Reserved height, so a reveal never moves the palette. */}
                {correct ? (
                  <span className="inline-flex h-8 min-w-16 items-center justify-center rounded-control border-2 border-dashed border-accent-2 px-1">
                    <span className="sr-only">Answer: {answer ? plainMd(answer.label) : "none"}</span>
                    <span aria-hidden className="text-sm font-semibold">
                      {answer ? optionShort(answer) : "—"}
                    </span>
                  </span>
                ) : (
                  <span aria-hidden className="h-8" />
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons that fill the selected slot; a fieldset would add a legend we do not show */}
          <div
            role="group"
            aria-label={`Options for ${labels[at]?.spoken ?? "the slot"}`}
            className="flex flex-wrap gap-2"
          >
            {spec.options.map((o, i) => {
              const on = (value[at] ?? "") === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  data-option={o.id}
                  aria-pressed={on}
                  aria-disabled={disabled || undefined}
                  aria-label={`${i + 1}. ${plainMd(o.label)}`}
                  onClick={() => pick(o)}
                  className={clsx(
                    "inline-flex min-h-11 items-center gap-2 rounded-control border px-2 py-1 text-left hover:bg-surface-2",
                    on ? "border-accent bg-lane-in" : "border-border bg-surface",
                  )}
                >
                  <span aria-hidden className="text-[0.75rem] text-text-3 tabular-nums">
                    {i + 1}
                  </span>
                  {optionFunction(o) || optionShort(o) !== o.label ? (
                    <OptionChip option={o} size="sm" />
                  ) : null}
                  <span className="text-sm text-text-2">
                    {optionShort(o) !== o.label ? plainMd(o.label).replace(/^[^:]{1,6}:\s*/, "") : o.label}
                  </span>
                </button>
              );
            })}
          </div>
          {play ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              onClick={() => play(at)}
            >
              Hear {labels[at]?.spoken.toLowerCase() ?? "it"}
            </Button>
          ) : null}
        </div>
      </div>
    </AnswerFrame>
  );
}
