// The form strip (content/specs/CF.md "The form map"; contracts §2.9 L8): the bars of a tune under the timeline,
// numbered, which the learner cuts into sections and names. A click on a bar line cuts or joins; a click on a
// section selects it (and loops it). By keyboard: the arrows move along the bar lines, Enter or X cuts or joins, a
// letter names the section at the cursor, a digit tags a variant (A2), Backspace clears the name. Read-only once
// the map has passed: then it is the tune's sections, each a button that loops it. The same strip maps the
// sections of the learner's own recording, where nothing is graded.
import { clsx } from "clsx";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { registerShortcutSection } from "../ui/keys/sheet.ts";
import {
  FORM_LETTERS,
  type FormMap,
  type FormSection,
  formLettersOf,
  hasCut,
  type SectionMark,
  sectionIndexAt,
  sectionsOf,
  setLabel,
  stepCut,
  toggleCut,
} from "./form-map.ts";

registerShortcutSection({
  id: "transcribe-form",
  title: "Transcribe: the form strip",
  order: 26,
  rows: [
    [
      "ArrowRight",
      "Next bar line (ArrowLeft: back; ArrowUp, ArrowDown: the next or previous cut; Home, End)",
    ],
    ["Enter", "Cut a section here, or join the two that meet here (also X and Space)"],
    ["A", "Name the section at the cursor A (B to H likewise)"],
    ["2", "Tag the section as a variant: A2 (3 to 9 likewise; 1 removes the tag)"],
    ["Backspace", "Clear the section's name"],
  ],
});

const LETTER_SET: ReadonlySet<string> = new Set(FORM_LETTERS);

export function FormMapStrip({
  map,
  onChange,
  pickup = false,
  marks = null,
  active = null,
  onSection,
  cursor: cursorProp,
  onCursor,
  label,
  hint,
  compact = false,
}: {
  map: FormMap;
  /** Absent: the strip is read-only (the map has passed, or was shown). */
  onChange?: ((m: FormMap) => void) | undefined;
  /** The timeline above starts with a pickup bar: the strip leaves that column empty so the bars line up. */
  pickup?: boolean;
  /** The last check, per section index. */
  marks?: ReadonlyMap<number, SectionMark> | null;
  /** The section being worked (0-based), outlined. */
  active?: number | null;
  /** A section was chosen (clicked, or Enter on a read-only strip): loop it. */
  onSection?: ((s: FormSection) => void) | undefined;
  /** The bar line the keyboard cursor is on (1-based bar it stands before); kept by the host when it has a key that moves it. */
  cursor?: number;
  onCursor?: (bar: number) => void;
  label: string;
  hint?: ReactNode;
  /** Fewer numbers (a long recording): every fourth bar is numbered. */
  compact?: boolean;
}) {
  const id = useId();
  const editable = onChange !== undefined;
  const [own, setOwn] = useState(1);
  const cursor = Math.max(1, Math.min(map.bars, cursorProp ?? own));
  const setCursor = (b: number) => {
    const next = Math.max(1, Math.min(map.bars, b));
    setOwn(next);
    onCursor?.(next);
  };
  const [focused, setFocused] = useState(false);
  const [say, setSay] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const sections = sectionsOf(map);
  const cols = map.bars + (pickup ? 1 : 0);
  const colOf = (bar: number) => bar - 1 + (pickup ? 1 : 0);
  const pct = (col: number) => `${(col / cols) * 100}%`;
  // A long recording: fewer numbers, and past 144 bars only the cuts and the numbered lines are drawn (a bar is
  // then a few pixels wide: sections are cut with X at the playing bar, or from the keyboard).
  const numberEvery =
    map.bars <= 36 && !compact
      ? 1
      : map.bars <= 72
        ? compact
          ? 4
          : 2
        : map.bars <= 144
          ? 4
          : map.bars <= 288
            ? 8
            : map.bars <= 576
              ? 16
              : 32;
  const dense = map.bars > 144;

  const describe = (m: FormMap, bar: number) => {
    const s = sectionsOf(m)[sectionIndexAt(m, bar)] as FormSection;
    const cut = bar === 1 ? "the start" : hasCut(m, bar) ? "a cut" : "no cut";
    return `Bar line ${bar}: ${cut}. Section ${s.index + 1}, bars ${s.from} to ${s.to}, ${s.label ? `named ${s.label}` : "not named yet"}.`;
  };
  useEffect(() => {
    if (focused) setSay(describe(map, cursor));
  }, [cursor, focused, map]);

  const apply = (next: FormMap) => {
    if (next !== map) onChange?.(next);
  };
  const nameAt = (bar: number, name: (old: string) => string) => {
    const i = sectionIndexAt(map, bar);
    apply(setLabel(map, i, name(map.labels[i] ?? "")));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    if (k === "ArrowRight") setCursor(cursor + 1);
    else if (k === "ArrowLeft") setCursor(cursor - 1);
    else if (k === "ArrowDown") setCursor(stepCut(map, cursor, 1) ?? cursor);
    else if (k === "ArrowUp") setCursor(stepCut(map, cursor, -1) ?? cursor);
    else if (k === "Home") setCursor(1);
    else if (k === "End") setCursor(map.bars);
    else if (k === "PageDown") setCursor(cursor + 4);
    else if (k === "PageUp") setCursor(cursor - 4);
    else if (k === "Enter" || k === " " || ((k === "x" || k === "X") && !e.shiftKey)) {
      if (editable) apply(toggleCut(map, cursor));
      else onSection?.(sections[sectionIndexAt(map, cursor)] as FormSection);
    } else if (editable && k.length === 1 && LETTER_SET.has(k.toUpperCase()) && !e.shiftKey)
      nameAt(cursor, () => k.toUpperCase());
    else if (editable && /^[1-9]$/.test(k))
      nameAt(cursor, (old) => {
        const base = old.replace(/\d+$/, "");
        return base ? (k === "1" ? base : `${base}${k}`) : old;
      });
    else if (editable && (k === "Backspace" || k === "Delete")) nameAt(cursor, () => "");
    else handled = false;
    if (handled) {
      // The page's own keys (digits loop a line, letters switch sides) stay out while the strip has the key.
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="flex flex-col gap-1" data-testid="form-map" data-form={formLettersOf(map)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span id={`${id}-label`} className="font-medium text-text">
          {label}
        </span>
        {hint ? <span className="text-text-3">{hint}</span> : null}
      </div>
      <div
        ref={host}
        role="slider"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-roledescription={
          editable ? "form strip: arrows move, Enter or X cuts, letters name" : "form strip"
        }
        aria-valuemin={1}
        aria-valuemax={map.bars}
        aria-valuenow={cursor}
        aria-valuetext={describe(map, cursor)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        className="relative h-[68px] select-none rounded-control border border-border bg-surface-2"
        data-testid="form-strip"
        data-cursor={cursor}
      >
        {/* The sections: a block each, named. */}
        {sections.map((s) => {
          const mark = marks?.get(s.index);
          return (
            <button
              key={s.from}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setCursor(s.from);
                host.current?.focus();
                onSection?.(s);
              }}
              aria-label={`Section ${s.index + 1}, bars ${s.from} to ${s.to}: ${s.label || "not named yet"}${mark === "issue" ? ", check it" : mark === "ok" ? ", right" : ""}`}
              data-testid="form-section"
              data-label={s.label}
              data-mark={mark}
              className={clsx(
                "absolute top-1 flex h-8 items-center justify-center overflow-hidden rounded-control border text-sm",
                mark === "issue"
                  ? "border-issue bg-issue/10"
                  : mark === "ok"
                    ? "border-accent/70 bg-lane-in"
                    : "border-border bg-surface",
                active === s.index && "ring-2 ring-accent/70",
                s.label ? "font-semibold text-text" : "text-text-3",
              )}
              style={{
                left: `calc(${pct(colOf(s.from))} + 2px)`,
                width: `calc(${pct(s.bars)} - 4px)`,
              }}
            >
              <span className="truncate px-1">{s.label || (editable ? "name it" : `${s.index + 1}`)}</span>
            </button>
          );
        })}
        {/* The bar lines: a target on each; a cut is drawn through both rows. */}
        {Array.from({ length: map.bars }, (_, i) => {
          const bar = i + 1;
          const cut = hasCut(map, bar);
          const numbered = bar === 1 || (bar - 1) % numberEvery === 0;
          if (dense && !cut && !numbered) return null;
          return (
            <span
              key={bar}
              className="pointer-events-none absolute inset-y-0"
              style={{ left: pct(colOf(bar)), width: pct(1) }}
            >
              {bar > 1 && editable && !dense ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setCursor(bar);
                    host.current?.focus();
                    apply(toggleCut(map, bar));
                  }}
                  aria-label={cut ? `Join the sections at bar ${bar}` : `Cut before bar ${bar}`}
                  aria-pressed={cut}
                  data-testid="form-line"
                  data-bar={bar}
                  className="group pointer-events-auto absolute bottom-0 -left-2 z-10 h-7 w-4 cursor-col-resize"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "absolute bottom-0 left-1/2 w-px -translate-x-1/2",
                      cut
                        ? "h-7 w-0.5 bg-accent"
                        : "h-2.5 bg-text-3 group-hover:h-7 group-hover:bg-accent/60",
                    )}
                  />
                </button>
              ) : bar > 1 ? (
                <span
                  aria-hidden
                  className={clsx(
                    "absolute bottom-0 left-0 w-px",
                    cut ? "h-7 w-0.5 bg-accent" : "h-2.5 bg-text-3",
                  )}
                />
              ) : null}
              {numbered ? (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 left-1 text-[0.6875rem] leading-none tabular-nums text-text-3"
                >
                  {bar}
                </span>
              ) : null}
            </span>
          );
        })}
        {focused ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-px bg-text"
            style={{ left: pct(colOf(cursor)) }}
            data-testid="form-cursor"
          />
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {say}
      </p>
    </div>
  );
}
