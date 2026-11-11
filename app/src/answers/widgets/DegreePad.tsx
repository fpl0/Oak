// Degree buttons (contracts §5.4 `degree-pad`, ux §4.2, §4.5 DegreeSlots): the pad shows only the set in play, in
// the degree colours with the number always printed (♭/♯ add a hatch); movable-do syllables when asked. `1`–`7`
// pick (a minor pad shows 1 2 ♭3 4 5 ♭6 ♭7 on the same keys), `-` or `+` before a digit picks the altered
// degree, `Backspace` clears the last slot, `←`/`→` choose a slot to overwrite. One slot is a radio group.
import type { Degree } from "@oak/api";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { degreeBackgroundCss, degreeStyle } from "../../ui/theme/palette.ts";
import { degreeForDigit, padOrder, popSlot, putSlot } from "../keys.ts";
import { degreeDisplay, degreeSpoken, SYLLABLES } from "../normalize.ts";
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
  useThemeName,
} from "../ui.tsx";

export function DegreeChip({
  degree,
  syllable,
  size = "md",
  ghost = false,
}: {
  degree: Degree | null;
  syllable?: boolean;
  size?: "sm" | "md";
  ghost?: boolean;
}) {
  const theme = useThemeName();
  if (!degree)
    return (
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded-control border-2 border-dashed border-border text-text-3",
          size === "sm" ? "h-8 min-w-8 px-1 text-sm" : "h-11 min-w-11 px-2",
        )}
      >
        <span aria-hidden>·</span>
      </span>
    );
  const st = degreeStyle(degree, theme);
  return (
    <span
      className={clsx(
        "inline-flex flex-col items-center justify-center rounded-control border-2 font-semibold leading-none tabular-nums",
        size === "sm" ? "h-8 min-w-8 px-1 text-sm" : "h-11 min-w-11 px-2 text-base",
        ghost && "border-dashed opacity-90",
      )}
      style={{
        background: degreeBackgroundCss(st),
        color: st.label,
        borderColor: ghost ? "var(--oak-accent-2)" : (st.outline ?? "transparent"),
      }}
    >
      <span>{degreeDisplay(degree)}</span>
      {syllable ? (
        <span className="mt-0.5 text-[0.7rem] font-medium opacity-90">{SYLLABLES[degree]}</span>
      ) : null}
    </span>
  );
}

export function DegreePadAnswer(p: AnswerWidgetProps<"degree-pad">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const theme = useThemeName();
  const root = useRef<HTMLDivElement>(null);
  const len = spec.sequenceLen ?? 1;
  const [prefix, setPrefix] = useState<"flat" | "sharp" | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const syllables = spec.syllables || p.solfege === "syllables";
  const set = padOrder(spec.set);
  const correct = revealedOf<Degree[]>(feedback);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const pick = (d: Degree) => {
    if (disabled) return;
    const at = slot !== null && slot < value.length ? slot : undefined;
    onChange(putSlot(value, len, d, at));
    setSlot(null);
    setPrefix(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key === "-") {
      setPrefix("flat");
      return true;
    }
    if (e.key === "+" || e.key === "#") {
      setPrefix("sharp");
      return true;
    }
    const n = digitOf(e);
    if (n !== null) {
      const d = degreeForDigit(n, set, prefix);
      setPrefix(null);
      if (d) {
        pick(d);
        root.current?.querySelector<HTMLButtonElement>(`[data-degree="${d}"]`)?.focus();
      }
      return d !== null || n <= 7;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled) return true;
      onChange(popSlot(value));
      setSlot(null);
      return true;
    }
    if (len > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.shiftKey) {
      const cur = slot ?? value.length;
      const next = Math.max(0, Math.min(len - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
      setSlot(next);
      return true;
    }
    if (len === 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const list = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-degree]") ?? [])];
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return false;
      const next = (at + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
      list[next]?.focus();
      pick(set[next] as Degree);
      return true;
    }
    return false;
  };

  const single = len === 1;
  return (
    <AnswerFrame
      kind="degree-pad"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["1–7"]}>degree</KeyHint>
          {set.some((d) => d.length > 1) ? <KeyHint keys={["-", "+"]}>♭ / ♯ first</KeyHint> : null}
          {!single ? <KeyHint keys={["⌫"]}>clear last</KeyHint> : null}
          {!single ? <KeyHint keys={["←", "→"]}>pick a slot</KeyHint> : null}
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3">
        {!single ? (
          <ol aria-label="Your degrees" className="flex flex-wrap items-center gap-2">
            {Array.from({ length: len }, (_, i) => {
              const d = (value[i] as Degree | undefined) ?? null;
              const mark = markOf(feedback, i);
              const active = slot === i || (slot === null && i === value.length && !disabled);
              const want = correct?.[i] ?? null;
              return (
                <li
                  key={i}
                  className="flex flex-col items-center gap-1"
                  aria-label={`Slot ${i + 1}: ${d ? degreeSpoken(d) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                >
                  <span
                    className={clsx(
                      "relative rounded-[8px] border-2 p-0.5",
                      active ? "border-text-3" : "border-transparent",
                      markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                    )}
                  >
                    <DegreeChip degree={d} syllable={syllables} />
                    <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                  </span>
                  {/* Reserved height, so a reveal never moves the pad. */}
                  {correct ? (
                    <span className="flex h-8 flex-col items-center">
                      <span className="sr-only">Answer: </span>
                      <DegreeChip degree={want} size="sm" ghost syllable={false} />
                    </span>
                  ) : (
                    <span aria-hidden className="h-8" />
                  )}
                </li>
              );
            })}
          </ol>
        ) : null}
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen at runtime (radio for one answer, checkbox or group for several) */}
        <div
          role={single ? "radiogroup" : "group"}
          aria-label={single ? p.label : "Degree pad"}
          className="flex flex-wrap gap-2"
        >
          {set.map((d) => {
            const on = single && value[0] === d;
            const st = degreeStyle(d, theme);
            const mark = single ? markOf(feedback, 0) : null;
            const isAnswer = single && correct?.[0] === d;
            return (
              // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen at runtime (radio for one answer, checkbox or group for several)
              <button
                key={d}
                type="button"
                data-degree={d}
                role={single ? "radio" : undefined}
                aria-checked={single ? on : undefined}
                aria-disabled={disabled || undefined}
                aria-label={`${degreeSpoken(d)}${syllables ? `, ${SYLLABLES[d]}` : ""}${isAnswer ? " (the answer)" : ""}`}
                tabIndex={single ? ((value[0] ?? set[0]) === d ? 0 : -1) : 0}
                onClick={() => pick(d)}
                className={clsx(
                  "relative flex h-14 min-w-14 flex-col items-center justify-center rounded-card border-2 px-2 font-semibold tabular-nums transition-[filter,border-color]",
                  on ? "border-text" : "border-transparent hover:brightness-105",
                  on && mark ? markRing(mark.ok ? "ok" : "bad") : "",
                  isAnswer && "outline-2 outline-dashed outline-offset-2 outline-accent-2",
                  disabled && "cursor-default",
                )}
                style={{
                  background: degreeBackgroundCss(st),
                  color: st.label,
                  ...(st.outline && !on ? { borderColor: st.outline } : {}),
                }}
              >
                <span className="text-lg leading-none">{degreeDisplay(d)}</span>
                {syllables ? (
                  <span className="mt-1 text-[0.75rem] leading-none font-medium">{SYLLABLES[d]}</span>
                ) : null}
                {on && mark ? <MarkBadge mark={mark.ok ? "ok" : "bad"} note={mark.note} /> : null}
              </button>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {prefix ? `${prefix} — now a digit` : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
