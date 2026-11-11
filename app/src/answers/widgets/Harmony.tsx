// Chord answers: the quality pad (`quality-pad`) and the Roman numeral palette (`rn-palette`, ux §4.5 RomanPad):
// three columns T | PD | D in the function colours, applied and borrowed rows when the step allows them. RN keys:
// `1`–`7` the diatonic triad, `Shift+digit` the seventh, `-` then a digit a flat-degree chord (`-7` → ♭VII),
// `M` swaps the case of the current slot, `Backspace` clears the last slot, `←`/`→` choose a slot.
import type { ChordQuality } from "@oak/api";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../../ui/kit/index.ts";
import { functionStyle, type HarmonicFn } from "../../ui/theme/palette.ts";
import {
  qualityLabel,
  type RnAllow,
  type RnButton,
  rnDisplay,
  rnForKey,
  rnPalette,
  toggleCase,
  withInversion,
} from "../keys.ts";
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

export function QualityPadAnswer(p: AnswerWidgetProps<"quality-pad">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const correct = revealedOf<ChordQuality[]>(feedback)?.[0] ?? null;
  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  const pick = (q: ChordQuality) => {
    if (!disabled) onChange([q]);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const n = digitOf(e);
    if (n !== null && n >= 1 && n <= spec.set.length) {
      pick(spec.set[n - 1] as ChordQuality);
      root.current?.querySelectorAll<HTMLButtonElement>("[data-quality]")[n - 1]?.focus();
      return true;
    }
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return false;
    const list = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-quality]") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return false;
    const next = (at + dir + list.length) % list.length;
    list[next]?.focus();
    pick(spec.set[next] as ChordQuality);
    return true;
  };
  const mark = markOf(feedback, 0);
  return (
    <AnswerFrame
      kind="quality-pad"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={[`1–${spec.set.length}`]}>pick</KeyHint>
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      <div ref={root} role="radiogroup" aria-label={p.label} className="flex flex-wrap gap-2">
        {spec.set.map((q, i) => {
          const on = value[0] === q;
          const l = qualityLabel(q);
          const isAnswer = correct === q;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
            <button
              key={q}
              type="button"
              role="radio"
              data-quality={q}
              aria-checked={on}
              aria-disabled={disabled || undefined}
              aria-label={`${i + 1}. ${l.long}${isAnswer ? " (the answer)" : ""}`}
              tabIndex={(value[0] ?? spec.set[0]) === q ? 0 : -1}
              onClick={() => pick(q)}
              className={clsx(
                "relative flex min-h-12 min-w-24 flex-col items-start justify-center rounded-control border-2 px-3 py-1.5 text-left",
                on ? "border-accent bg-lane-in" : "border-border bg-surface hover:border-text-3",
                on && mark ? markRing(mark.ok ? "ok" : "bad") : "",
                isAnswer && !on && "border-dashed border-accent-2",
              )}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-[0.75rem] text-text-3 tabular-nums">
                  {i + 1}
                </span>
                <span className="font-semibold">{l.short}</span>
              </span>
              <span className="text-sm text-text-2">{l.long}</span>
              {on && mark ? <MarkBadge mark={mark.ok ? "ok" : "bad"} note={mark.note} /> : null}
            </button>
          );
        })}
      </div>
    </AnswerFrame>
  );
}

const INVERSIONS = [
  { value: "0", label: "Root" },
  { value: "1", label: "1st inv" },
  { value: "2", label: "2nd inv" },
  { value: "3", label: "3rd inv" },
] as const;

function roleFn(role: RnButton["role"]): HarmonicFn | null {
  return role === "chromatic" ? null : role;
}

export function RnPaletteAnswer(p: AnswerWidgetProps<"rn-palette">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const theme = useThemeName();
  const root = useRef<HTMLDivElement>(null);
  const allow = spec.allow as readonly RnAllow[];
  const groups = rnPalette(allow);
  const [flat, setFlat] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [inversion, setInversion] = useState<"0" | "1" | "2" | "3">("0");
  const correct = revealedOf<string[]>(feedback);
  const filled = value.filter((x) => x !== "").length;

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const place = (rn: string) => {
    if (disabled) return;
    const inv = Number(inversion) as 0 | 1 | 2 | 3;
    const text = inv === 0 ? rn : (withInversion(rn, inv) ?? rn);
    const slots = Array.from({ length: spec.slots }, (_, k) => value[k] ?? "");
    const at = slot ?? slots.indexOf("");
    slots[at < 0 ? spec.slots - 1 : at] = text;
    onChange(slots);
    setSlot(null);
    setFlat(false);
  };
  const clearLast = () => {
    if (disabled) return;
    const slots = Array.from({ length: spec.slots }, (_, k) => value[k] ?? "");
    let i = -1;
    for (let k = slots.length - 1; k >= 0; k--)
      if (slots[k] !== "") {
        i = k;
        break;
      }
    if (i >= 0) slots[i] = "";
    onChange(slots);
    setSlot(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key === "-") {
      setFlat(true);
      return true;
    }
    const n = digitOf(e);
    if (n !== null) {
      const rn = rnForKey(n, { shift: e.shiftKey, flat, allow });
      setFlat(false);
      if (rn) place(rn);
      return n >= 1 && n <= 7;
    }
    if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey) {
      const i = slot ?? Math.max(0, filled - 1);
      const cur = value[i];
      if (cur && !disabled) {
        const slots = [...value];
        slots[i] = toggleCase(cur);
        onChange(slots);
      }
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      clearLast();
      return true;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && spec.slots > 1) {
      if ((e.target as HTMLElement).closest("[role=radiogroup]")) return false;
      const cur = slot ?? Math.min(filled, spec.slots - 1);
      setSlot(Math.max(0, Math.min(spec.slots - 1, cur + (e.key === "ArrowLeft" ? -1 : 1))));
      return true;
    }
    return false;
  };

  return (
    <AnswerFrame
      kind="rn-palette"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["1–7"]}>triad</KeyHint>
          {allow.includes("sevenths") ? <KeyHint keys={["⇧ + digit"]}>seventh</KeyHint> : null}
          {allow.includes("borrowed") ? <KeyHint keys={["- then digit"]}>♭ degree</KeyHint> : null}
          <KeyHint keys={["M"]}>major/minor</KeyHint>
          <KeyHint keys={["⌫"]}>clear last</KeyHint>
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3">
        <ol aria-label="Your numerals" className="flex flex-wrap gap-2">
          {Array.from({ length: spec.slots }, (_, i) => {
            const rn = value[i] ?? "";
            const mark = markOf(feedback, i);
            const active = !disabled && (slot === i || (slot === null && i === value.indexOf("")));
            return (
              <li
                key={i}
                className="flex flex-col items-center gap-1"
                aria-label={`Bar ${i + 1}: ${rn ? rnDisplay(rn) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
              >
                <span aria-hidden className="text-[0.7rem] text-text-3">
                  bar {i + 1}
                </span>
                <span
                  className={clsx(
                    "relative inline-flex h-11 min-w-16 items-center justify-center rounded-control border-2 px-2 text-lg font-semibold",
                    rn ? "border-border bg-surface" : "border-dashed border-border text-text-3",
                    active && "border-text-3",
                    markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                  )}
                >
                  {rn ? rnDisplay(rn) : "·"}
                  <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                </span>
                {/* Reserved height, so a reveal never moves the palette. */}
                {correct ? (
                  <span className="inline-flex h-8 min-w-16 items-center justify-center rounded-control border-2 border-dashed border-accent-2 px-2 font-medium">
                    <span className="sr-only">Answer: </span>
                    {correct[i] ? rnDisplay(correct[i] as string) : "—"}
                  </span>
                ) : (
                  <span aria-hidden className="h-8" />
                )}
              </li>
            );
          })}
        </ol>
        {allow.includes("inversions") ? (
          <div className="w-fit">
            <SegmentedControl
              label="Inversion of the next chord"
              value={inversion}
              options={INVERSIONS}
              onChange={(v) => setInversion(v)}
              size="sm"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {groups.map((g) => {
            const fn = g.id === "T" || g.id === "PD" || g.id === "D" ? g.id : null;
            const st = fn ? functionStyle(fn, theme) : null;
            return (
              <fieldset key={g.id} className="flex min-w-0 flex-col gap-1.5">
                <legend className="mb-1 flex items-center gap-1.5 text-sm text-text-2">
                  {st ? (
                    <span
                      aria-hidden
                      className="inline-flex h-5 items-center rounded px-1.5 text-[0.7rem] font-semibold"
                      style={{ background: st.fill, color: st.label }}
                    >
                      {fn}
                    </span>
                  ) : null}
                  {g.label}
                </legend>
                <div
                  className={clsx(
                    "gap-1.5",
                    fn
                      ? clsx(
                          "grid",
                          allow.includes("sevenths") && allow.includes("triads")
                            ? "grid-cols-2"
                            : "grid-cols-1",
                        )
                      : "flex flex-wrap",
                  )}
                >
                  {g.buttons.map((b) => {
                    const f = roleFn(b.role);
                    const bs = f ? functionStyle(f, theme) : null;
                    return (
                      <button
                        key={b.rn}
                        type="button"
                        data-rn={b.rn}
                        aria-disabled={disabled || undefined}
                        aria-label={`${b.display}${b.key ? `, key ${b.key}` : ""}`}
                        onClick={() => place(b.rn)}
                        className={clsx(
                          "inline-flex h-9 min-w-16 items-center justify-between gap-2 rounded-control border border-border bg-surface px-2 font-medium hover:bg-surface-2",
                          !bs && "border-dashed",
                        )}
                        style={bs ? { borderLeft: `4px solid ${bs.fill}` } : undefined}
                      >
                        <span>{b.display}</span>
                        {b.key ? (
                          <span aria-hidden className="font-sans text-[0.7rem] text-text-3">
                            {b.key}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {flat ? "flat — now a digit" : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
