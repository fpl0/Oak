// The form map (wave6.md §11 `form.map`; CF-T.S1, ladder L8): the learner hears a whole tune, cuts its bar strip
// into sections and names each. The strip is the bars, numbered, in rows; under each row runs the form strip, one
// block per section. A click on a bar cuts the strip before it (or joins it again); a click on a section's block
// selects that section; the labels row names it. By keyboard the bars are one tab stop: `←`/`→` walk the bars
// (`↑`/`↓` a row), `X` or `Space` cuts or joins before the focused bar, the label keys (letters, or digits for
// names) name the section the focused bar is in and step to the next unnamed one, `Backspace` clears a name (and,
// on an unnamed section, joins it to the one before), `P` plays that section when the host can
// (`AnswerEnv.slots.play` with the section's index). The number of sections in the answer is never shown.
import { clsx } from "clsx";
import { Play, Scissors } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { PARTS_PALETTE } from "../../ui/theme/palette.ts";
import { useAnswerEnv } from "../env.tsx";
import { type FormOption, optionForKey, sectionText } from "../form.ts";
import {
  clearSection,
  formMapSections,
  labelSection,
  mapBlocks,
  mapLetters,
  mapOptions,
  mapPerRow,
  mapSegments,
  mapSpan,
  mapSummary,
  sectionAtBar,
  toggleCut,
} from "../form-map.ts";
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

/** A stable colour per section type, by first appearance (the same letter, the same colour). */
function colourOf(labels: readonly string[], label: string): string | null {
  if (label === "") return null;
  const types: string[] = [];
  for (const x of labels) {
    const t = x.replace(/\d+$/, "").toLowerCase();
    if (x !== "" && !types.includes(t)) types.push(t);
  }
  const i = types.indexOf(label.replace(/\d+$/, "").toLowerCase());
  return i < 0 ? null : (PARTS_PALETTE[i % PARTS_PALETTE.length] as string);
}

export function FormMapAnswer(p: AnswerWidgetProps<"form">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const play = env.slots?.play;
  const root = useRef<HTMLDivElement>(null);
  const bars = Math.max(1, spec.bars ?? 1);
  const perRow = mapPerRow(bars);
  const rows = Math.ceil(bars / perRow);
  const sections = formMapSections(value, bars);
  const blocks = mapBlocks(value, bars);
  const segments = mapSegments(blocks, perRow);
  const labels = sections.map((s) => s.label);
  const options = mapOptions(spec, value);
  const letters = spec.vocabulary === "letters";
  const [bar, setBar] = useState(1);
  const at = Math.min(bar, bars);
  const sel = sectionAtBar(sections, at);
  const selBlock = blocks[sel];
  const reveal = revealedOf<string[]>(feedback);
  const revealBlocks = reveal ? mapBlocks(reveal, bars) : null;
  const revealSegments = revealBlocks ? mapSegments(revealBlocks, perRow) : [];

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[data-map-bar][tabindex='0']")?.focus();
  }, [p.autoFocus]);

  const focusBar = (b: number) => {
    const c = Math.max(1, Math.min(bars, b));
    setBar(c);
    root.current?.querySelector<HTMLButtonElement>(`[data-map-bar="${c}"]`)?.focus();
  };
  const cut = (b: number) => {
    if (disabled || b <= 1) return;
    onChange(toggleCut(value, b, bars));
  };
  const name = (o: FormOption) => {
    if (disabled) return;
    const r = labelSection(value, sel, o.id, bars);
    onChange(r.value);
    // Typing A A B A walks the sections: on to the first bar of the next unnamed one.
    if (r.next !== null) {
      const next = formMapSections(r.value, bars)[r.next];
      if (next) {
        setBar(next.bar);
        if (
          root.current?.contains(document.activeElement) &&
          document.activeElement?.hasAttribute("data-map-bar")
        )
          root.current.querySelector<HTMLButtonElement>(`[data-map-bar="${next.bar}"]`)?.focus();
      }
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const onBar = (e.target as HTMLElement).hasAttribute("data-map-bar");
    if (e.key === "x" || e.key === "X") {
      cut(at);
      return true;
    }
    if (!letters) {
      const d = digitOf(e);
      if (d !== null && !e.shiftKey) {
        const o = optionForKey(options, String(d));
        if (o) name(o);
        return o !== null;
      }
    } else if (/^[a-zA-Z]$/.test(e.key) && e.key.toLowerCase() !== "p") {
      const o = optionForKey(options, e.key);
      if (o) {
        name(o);
        return true;
      }
    }
    if ((e.key === "p" || e.key === "P") && play) {
      play(sel);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled) return true;
      const r = clearSection(value, sel, bars);
      onChange(r.value);
      const b = formMapSections(r.value, bars)[r.at];
      if (b && onBar) focusBar(b.bar);
      else if (b) setBar(b.bar);
      return true;
    }
    if (!onBar) return false;
    if (e.key === "ArrowRight") focusBar(at + 1);
    else if (e.key === "ArrowLeft") focusBar(at - 1);
    else if (e.key === "ArrowDown") focusBar(Math.min(bars, at + perRow));
    else if (e.key === "ArrowUp") focusBar(Math.max(1, at - perRow));
    else if (e.key === "Home") focusBar(1);
    else if (e.key === "End") focusBar(bars);
    else return false;
    return true;
  };

  const readsId = `${p.idBase}-reads`;
  const named = labels.some((x) => x !== "");
  return (
    <AnswerFrame
      kind="form"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["←", "→"]}>bar</KeyHint>
          <KeyHint keys={["X"]}>cut or join here</KeyHint>
          <KeyHint keys={[letters ? `A–${options.at(-1)?.key ?? "D"}` : `1–${options.length}`]}>
            name the section
          </KeyHint>
          <KeyHint keys={["⌫"]}>clear</KeyHint>
          {play ? <KeyHint keys={["P"]}>hear it</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-3" data-form-map>
        {/* biome-ignore lint/a11y/useSemanticElements: a bar strip with roving focus (ux §7.9); a fieldset cannot take its grid */}
        <div
          role="group"
          aria-label={`The tune, ${bars} bars. ${mapSummary(value, bars)}`}
          aria-describedby={readsId}
          className="flex min-w-0 flex-col gap-2"
        >
          {Array.from({ length: rows }, (_, row) => {
            const first = row * perRow + 1;
            const count = Math.min(perRow, bars - row * perRow);
            return (
              <div key={row} className="flex min-w-0 flex-col gap-1">
                <div
                  className="grid min-w-0 gap-x-0.5"
                  style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: count }, (_, k) => {
                    const b = first + k;
                    const starts = sections.some((s) => s.bar === b);
                    const inSel = selBlock !== undefined && b >= selBlock.startBar && b <= selBlock.endBar;
                    const block = blocks[sectionAtBar(sections, b)];
                    return (
                      <button
                        key={b}
                        type="button"
                        data-map-bar={b}
                        data-cut={starts && b > 1 ? "1" : undefined}
                        aria-pressed={b > 1 ? starts : undefined}
                        aria-disabled={disabled || undefined}
                        aria-label={`Bar ${b}${b === 1 ? ", the tune starts here" : starts ? ", a section starts here" : ""}. In ${block ? `${mapSpan(block).toLowerCase()}, ${block.label ? sectionText(block.label) : "not named"}` : "the tune"}${b > 1 ? `. Press to ${starts ? "join it to the section before" : "cut before this bar"}` : ""}`}
                        tabIndex={b === at ? 0 : -1}
                        onFocus={() => setBar(b)}
                        onClick={() => {
                          setBar(b);
                          cut(b);
                        }}
                        className={clsx(
                          "relative flex h-9 min-w-0 items-center justify-center border-y-2 border-r text-[0.8125rem] tabular-nums",
                          starts ? "rounded-l-control border-l-4 border-l-text" : "border-l border-l-border",
                          inSel && !disabled
                            ? "border-y-text-3 border-r-border bg-surface-2 text-text"
                            : "border-y-border border-r-border bg-surface text-text-2",
                          b > 1 && !disabled && "hover:bg-surface-2",
                        )}
                      >
                        {b}
                        {starts && b > 1 ? (
                          <Scissors
                            aria-hidden
                            className="absolute -top-2 -left-2 size-3.5 rounded-full bg-surface text-text"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {/* The form strip of this row: one block per section piece; a click selects the section. */}
                <div
                  className="grid min-w-0 gap-x-0.5"
                  style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
                >
                  {segments
                    .filter((g) => g.row === row)
                    .map((g) => {
                      const block = blocks[g.index] as (typeof blocks)[number];
                      const mark = markOf(feedback, g.index);
                      const colour = colourOf(labels, block.label);
                      const selected = !disabled && g.index === sel;
                      return (
                        <button
                          key={`${g.index}-${g.col}`}
                          type="button"
                          data-map-section={g.index}
                          data-enter="native"
                          tabIndex={-1}
                          aria-hidden={!g.first || undefined}
                          aria-pressed={g.first ? selected : undefined}
                          aria-disabled={disabled || undefined}
                          aria-label={`${mapSpan(block)}: ${block.label ? sectionText(block.label) : "not named"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                          onClick={() => {
                            setBar(block.startBar);
                            if (play) play(g.index);
                          }}
                          className={clsx(
                            "relative flex h-9 min-w-0 items-center justify-center rounded-control border-2 px-1 text-sm font-semibold",
                            block.label
                              ? "border-border bg-surface"
                              : "border-dashed border-border text-text-3",
                            selected && "border-text-3 bg-surface-2",
                            g.first ? markRing(mark ? (mark.ok ? "ok" : "bad") : null) : "",
                          )}
                          style={{ gridColumn: `${g.col + 1} / span ${g.span}` }}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-x-1.5 top-0.5 h-1 rounded-full"
                            style={{ background: colour ?? "transparent" }}
                          />
                          <span className="max-w-full truncate">
                            {block.label ? sectionText(block.label) : <span aria-hidden>·</span>}
                            {!g.first && block.label ? <span aria-hidden> …</span> : null}
                          </span>
                          {g.first ? (
                            <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                          ) : null}
                        </button>
                      );
                    })}
                </div>
                {/* Reserved height, so a reveal never moves the rows: the answer's sections, dashed. */}
                <div
                  className="grid h-7 min-w-0 gap-x-0.5"
                  style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
                  aria-hidden={!revealBlocks || undefined}
                >
                  {revealSegments
                    .filter((g) => g.row === row)
                    .map((g) => {
                      const block = (revealBlocks ?? [])[g.index];
                      if (!block) return null;
                      return (
                        <span
                          key={`${g.index}-${g.col}`}
                          className="inline-flex min-w-0 items-center justify-center truncate rounded-control border-2 border-dashed border-accent-2 px-1 text-sm font-semibold"
                          style={{ gridColumn: `${g.col + 1} / span ${g.span}` }}
                        >
                          {g.first ? (
                            <span className="sr-only">Answer, {mapSpan(block).toLowerCase()}: </span>
                          ) : null}
                          {sectionText(block.label)}
                          {!g.first ? <span aria-hidden> …</span> : null}
                        </span>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="min-h-6 text-sm text-text-2" data-testid="form-reads" id={readsId}>
          <span data-testid="form-map-summary">{mapSummary(value, bars)}</span>
          {named ? (
            <>
              {" · Reads as "}
              <span className="font-mono font-semibold tracking-wider text-text">
                {mapLetters(value, bars)}
              </span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons that name the selected section */}
          <div
            role="group"
            aria-label={`Name for ${selBlock ? mapSpan(selBlock).toLowerCase() : "the section"}`}
            className="flex flex-wrap gap-2"
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                data-form-option={o.id}
                aria-pressed={selBlock?.label === o.id}
                aria-disabled={disabled || undefined}
                aria-label={letters ? o.label : `${o.key}. ${o.label}`}
                onClick={() => name(o)}
                className={clsx(
                  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border px-3 py-1 font-medium hover:bg-surface-2",
                  selBlock?.label === o.id ? "border-accent bg-lane-in" : "border-border bg-surface",
                )}
              >
                {!letters ? (
                  <span aria-hidden className="text-[0.75rem] font-normal text-text-3 tabular-nums">
                    {o.key}
                  </span>
                ) : null}
                <span>{o.label}</span>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Scissors aria-hidden className="size-4" />}
            disabled={disabled || at <= 1}
            onClick={() => cut(at)}
          >
            {sections.some((s) => s.bar === at) && at > 1 ? `Join at bar ${at}` : `Cut before bar ${at}`}
          </Button>
          {play && selBlock ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              onClick={() => play(sel)}
            >
              Hear {mapSpan(selBlock).toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>
    </AnswerFrame>
  );
}
