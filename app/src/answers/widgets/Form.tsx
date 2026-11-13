// The form answer (wave5.md §11, `form`; contracts §6.3 item 4; U09.L01, L03, `fam.frm.sections`): name the sections
// of a piece heard. `input: "label"` is a timeline of blocks, as wide as their bars, one label each; a click selects
// a block and plays it when the host can (`AnswerEnv.slots.play`), `P` plays the selected one again. `input:
// "order"` puts the section cards in the order heard: a card goes to the end of the line, `Alt+←/→` moves a placed
// card, `Backspace` takes the selected one out. Labels are letters (A B A B, by first appearance) or section names;
// the line under the strip shows the letters the answer reads as, the shape the grader compares. Keys: digits pick a
// name, letters a letter, `←`/`→` choose a block, `Enter` checks.
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { PARTS_PALETTE } from "../../ui/theme/palette.ts";
import { useAnswerEnv } from "../env.tsx";
import {
  appendCard,
  blockSpan,
  cardPool,
  cardsRepeat,
  clearLabel,
  type FormOption,
  formBlocks,
  formOptions,
  optionForKey,
  placeLabel,
  readsAsLetters,
  removeCard,
  sectionText,
  shiftCard,
} from "../form.ts";
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
} from "../ui.tsx";

/** A stable colour per section type, by first appearance in the answer (the same letter, the same colour). */
function colourOf(value: readonly string[], id: string): string | null {
  if (id === "") return null;
  const types: string[] = [];
  for (const x of value) {
    const t = x.replace(/\d+$/, "").toLowerCase();
    if (x !== "" && !types.includes(t)) types.push(t);
  }
  const i = types.indexOf(id.replace(/\d+$/, "").toLowerCase());
  return i < 0 ? null : (PARTS_PALETTE[i % PARTS_PALETTE.length] as string);
}

export function FormAnswer(p: AnswerWidgetProps<"form">) {
  return p.spec.input === "order" ? <FormOrder {...p} /> : <FormLabels {...p} />;
}

function OptionRow({
  options,
  onPick,
  disabled,
  label,
  current,
  keysShown,
}: {
  options: readonly FormOption[];
  onPick(o: FormOption): void;
  disabled: boolean | undefined;
  label: string;
  current?: string;
  keysShown: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row of buttons that fill the selected block; a fieldset would add a legend we do not show
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-form-option={o.id}
          aria-pressed={current === undefined ? undefined : current === o.id}
          aria-disabled={disabled || undefined}
          aria-label={keysShown ? `${o.key}. ${o.label}` : o.label}
          onClick={() => onPick(o)}
          className={clsx(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border px-3 py-1 font-medium hover:bg-surface-2",
            current === o.id ? "border-accent bg-lane-in" : "border-border bg-surface",
          )}
        >
          {keysShown && o.key !== o.label ? (
            <span aria-hidden className="text-[0.75rem] font-normal text-text-3 tabular-nums">
              {o.key}
            </span>
          ) : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function ReadsAs({ value, id }: { value: readonly string[]; id: string }) {
  const filled = value.some((x) => x !== "");
  return (
    <p className="min-h-6 text-sm text-text-2" data-testid="form-reads" id={id}>
      {filled ? (
        <>
          Reads as{" "}
          <span className="font-mono font-semibold tracking-wider text-text">{readsAsLetters(value)}</span>
        </>
      ) : (
        <span className="text-text-3">The letters your answer reads as appear here.</span>
      )}
    </p>
  );
}

function FormLabels(p: AnswerWidgetProps<"form">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const play = env.slots?.play;
  const root = useRef<HTMLDivElement>(null);
  const n = spec.sections;
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const options = formOptions(spec);
  const blocks = formBlocks(spec);
  const letters = spec.vocabulary === "letters";
  const firstEmpty = slots.indexOf("");
  const [sel, setSel] = useState<number>(Math.max(firstEmpty, 0));
  const at = Math.min(sel, n - 1);
  const correct = revealedOf<string[]>(feedback);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  // Focus follows the selected block while it is in the strip, so typing A A B A walks along it.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active?.closest("[data-form-blocks]") || !root.current?.contains(active)) return;
    root.current.querySelector<HTMLButtonElement>(`[data-form-block="${at}"]`)?.focus();
  }, [at]);

  const pick = (o: FormOption) => {
    if (disabled) return;
    const r = placeLabel(slots, n, o.id, at);
    onChange(r.value);
    if (r.next !== null) setSel(r.next);
  };
  const choose = (i: number, hear: boolean) => {
    setSel(i);
    if (hear && play) play(i);
  };
  const focusBlock = (i: number) => {
    setSel(i);
    root.current?.querySelector<HTMLButtonElement>(`[data-form-block="${i}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!letters) {
      const d = digitOf(e);
      if (d !== null && !e.shiftKey) {
        const o = optionForKey(options, String(d));
        if (o) pick(o);
        return o !== null;
      }
    } else if (/^[a-zA-Z]$/.test(e.key) && e.key.toLowerCase() !== "p") {
      const o = optionForKey(options, e.key);
      if (o) {
        pick(o);
        return true;
      }
    }
    if ((e.key === "p" || e.key === "P") && play) {
      play(at);
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const next = Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
      if ((e.target as HTMLElement).closest("[data-form-blocks]")) focusBlock(next);
      else setSel(next);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled) return true;
      const r = clearLabel(slots, n, at);
      onChange(r.value);
      setSel(r.at);
      return true;
    }
    return false;
  };

  const readsId = `${p.idBase}-reads`;
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
          <KeyHint keys={[letters ? `A–${options.at(-1)?.key ?? "B"}` : `1–${options.length}`]}>
            label
          </KeyHint>
          <KeyHint keys={["←", "→"]}>section</KeyHint>
          <KeyHint keys={["⌫"]}>clear</KeyHint>
          {play ? <KeyHint keys={["P"]}>hear it</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-3">
        <ol
          data-form-blocks
          aria-label="The piece, section by section"
          aria-describedby={readsId}
          className="flex w-full min-w-0 gap-1.5"
        >
          {blocks.map((b) => {
            const id = slots[b.index] ?? "";
            const mark = markOf(feedback, b.index);
            const selected = !disabled && b.index === at;
            const colour = colourOf(slots, id);
            const want = correct?.[b.index] ?? null;
            const span = blockSpan(b);
            return (
              <li
                key={b.index}
                className="flex min-w-0 flex-col gap-1"
                style={{ flex: `${b.share * 100} 1 0%`, minWidth: "4.25rem" }}
              >
                <span
                  aria-hidden
                  className="truncate text-[0.7rem] whitespace-nowrap text-text-3 tabular-nums"
                >
                  {b.startBar === null ? `${b.index + 1}` : span.replace(/^Bars? /, "")}
                </span>
                <button
                  type="button"
                  data-form-block={b.index}
                  aria-pressed={selected}
                  aria-disabled={disabled || undefined}
                  aria-label={`${span}: ${id ? sectionText(id) : "empty"}${mark ? (mark.ok ? ", right" : ", not this one") : ""}${play ? ". Click to hear it" : ""}`}
                  tabIndex={b.index === at ? 0 : -1}
                  onFocus={() => setSel(b.index)}
                  onClick={() => choose(b.index, true)}
                  className={clsx(
                    "relative flex h-14 w-full min-w-0 flex-col items-center justify-center rounded-control border-2 px-1 font-semibold",
                    id ? "border-border bg-surface" : "border-dashed border-border text-text-3",
                    selected && "border-text-3 bg-surface-2",
                    markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-2 top-1 h-1 rounded-full"
                    style={{ background: colour ?? "transparent" }}
                  />
                  <span className="max-w-full truncate">
                    {id ? sectionText(id) : <span aria-hidden>·</span>}
                  </span>
                  {play ? (
                    <Play aria-hidden className="absolute right-1 bottom-1 size-3 text-text-3 opacity-70" />
                  ) : null}
                  <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                </button>
                {/* Reserved height, so a reveal never moves the palette. */}
                {correct ? (
                  <span className="inline-flex h-8 min-w-0 items-center justify-center truncate rounded-control border-2 border-dashed border-accent-2 px-1 text-sm font-semibold">
                    <span className="sr-only">Answer: </span>
                    {want ? sectionText(want) : "—"}
                  </span>
                ) : (
                  <span aria-hidden className="h-8" />
                )}
              </li>
            );
          })}
        </ol>
        <ReadsAs value={slots} id={readsId} />
        <div className="flex flex-wrap items-center gap-2">
          <OptionRow
            options={options}
            onPick={pick}
            disabled={disabled}
            label={`Labels for ${blockSpan(blocks[at] ?? { index: at, startBar: null, bars: null, share: 1 }).toLowerCase()}`}
            current={slots[at] ?? ""}
            keysShown={!letters}
          />
          {play ? (
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              onClick={() => play(at)}
            >
              Hear section {at + 1}
            </Button>
          ) : null}
        </div>
      </div>
    </AnswerFrame>
  );
}

function FormOrder(p: AnswerWidgetProps<"form">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const n = spec.sections;
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const placed = slots.filter((x) => x !== "").length;
  const options = formOptions(spec);
  const pool = cardPool(spec, slots);
  const repeat = cardsRepeat(spec);
  const letters = spec.vocabulary === "letters";
  const [sel, setSel] = useState<number | null>(null);
  const correct = revealedOf<string[]>(feedback);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const add = (o: FormOption) => {
    if (disabled || placed >= n) return;
    if (!repeat && slots.includes(o.id)) return;
    const inPool = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-form-option]");
    // The focused option is about to leave the pool: hand focus on now, inside the widget (the next option, else the
    // last card placed), so a key typed before the next frame is not lost on <body> (gate: "1 3" placed one card).
    if (inPool && !repeat && inPool.dataset.formOption === o.id) {
      const rest = [...(root.current?.querySelectorAll<HTMLElement>("[data-form-option]") ?? [])];
      const at = rest.indexOf(inPool);
      const stay = rest[at + 1] ?? rest[at - 1] ?? null;
      (
        stay ?? root.current?.querySelector<HTMLElement>(`[data-form-card="${Math.max(0, placed - 1)}"]`)
      )?.focus();
    }
    onChange(appendCard(slots, n, o.id));
    // A placed card leaves the pool: keep focus inside the answer (the next card, else the line's last card).
    if (inPool || !root.current?.contains(document.activeElement))
      requestAnimationFrame(() => {
        const r = root.current;
        if (!r || r.contains(document.activeElement)) return;
        (
          r.querySelector<HTMLElement>("[data-form-option]") ??
          r.querySelector<HTMLElement>(`[data-form-card="${placed}"]`)
        )?.focus();
      });
  };
  const focusPlaced = (i: number) =>
    root.current?.querySelector<HTMLButtonElement>(`[data-form-card="${i}"]`)?.focus();

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey) return false;
    const inLine = (e.target as HTMLElement).closest("[data-form-line]");
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && inLine && sel !== null) {
      if (disabled) return true;
      const r = shiftCard(slots, sel, e.key === "ArrowLeft" ? -1 : 1);
      onChange(r.value);
      setSel(r.at);
      // Both slots are filled before and after the move: the target card exists now, so focus follows at once.
      focusPlaced(r.at);
      requestAnimationFrame(() => focusPlaced(r.at));
      return true;
    }
    if (e.altKey) return false;
    if (!letters) {
      const d = digitOf(e);
      if (d !== null && !e.shiftKey) {
        const o = optionForKey(options, String(d));
        if (o) add(o);
        return o !== null;
      }
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      const o = optionForKey(options, e.key);
      if (o) {
        add(o);
        return true;
      }
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && inLine && placed > 0) {
      const cur = sel ?? 0;
      const next = Math.max(0, Math.min(placed - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
      setSel(next);
      focusPlaced(next);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (disabled || placed === 0) return true;
      const at = sel !== null && sel < placed ? sel : placed - 1;
      onChange(removeCard(slots, n, at));
      const next = Math.max(0, Math.min(at, placed - 2));
      setSel(placed - 1 > 0 ? next : null);
      if (placed - 1 > 0) requestAnimationFrame(() => focusPlaced(next));
      return true;
    }
    return false;
  };

  const readsId = `${p.idBase}-reads`;
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
          <KeyHint keys={[letters ? `A–${options.at(-1)?.key ?? "B"}` : `1–${options.length}`]}>
            add a card
          </KeyHint>
          <KeyHint keys={["Alt + ←", "→"]}>move</KeyHint>
          <KeyHint keys={["⌫"]}>take out</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex min-w-0 flex-col gap-3">
        <ol
          data-form-line
          aria-label={`In the order heard, ${placed} of ${n} placed`}
          aria-describedby={repeat ? readsId : undefined}
          className="flex flex-wrap items-start gap-2"
        >
          {slots.map((id, i) => {
            const mark = markOf(feedback, i);
            const colour = colourOf(slots, id);
            const want = correct?.[i] ?? null;
            const selected = sel === i && id !== "";
            return (
              // Keyed by position: moving or adding a card re-labels the slots in place, so the focused card never
              // unmounts and a key typed right after Alt + arrow is not lost (gate: "4 2" after a move placed nothing).
              <li key={i} className="flex flex-col items-center gap-1">
                <span aria-hidden className="text-[0.7rem] text-text-3 tabular-nums">
                  {i + 1}
                </span>
                {id ? (
                  <button
                    type="button"
                    data-form-card={i}
                    aria-pressed={selected}
                    aria-disabled={disabled || undefined}
                    aria-label={`${i + 1}. ${sectionText(id)}${mark ? (mark.ok ? ", right" : ", not this one") : ""}`}
                    tabIndex={i === (sel ?? 0) ? 0 : -1}
                    onFocus={() => setSel(i)}
                    onClick={() => setSel(i)}
                    className={clsx(
                      "relative inline-flex h-12 min-w-20 items-center justify-center rounded-control border-2 border-border bg-surface px-3 font-semibold",
                      selected && "border-text-3 bg-surface-2",
                      markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-2 top-1 h-1 rounded-full"
                      style={{ background: colour ?? "transparent" }}
                    />
                    {sectionText(id)}
                    <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-12 min-w-20 items-center justify-center rounded-control border-2 border-dashed border-border text-text-3"
                  >
                    ·
                  </span>
                )}
                {correct ? (
                  <span className="inline-flex h-8 min-w-20 items-center justify-center rounded-control border-2 border-dashed border-accent-2 px-1 text-sm font-semibold">
                    <span className="sr-only">Answer: </span>
                    {want ? sectionText(want) : "—"}
                  </span>
                ) : (
                  <span aria-hidden className="h-8" />
                )}
              </li>
            );
          })}
        </ol>
        {repeat ? <ReadsAs value={slots} id={readsId} /> : null}
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          {pool.length > 0 && placed < n ? (
            <OptionRow
              options={pool}
              onPick={add}
              disabled={disabled}
              label={repeat ? "Sections: each can be used again" : "Sections still to place"}
              keysShown={!letters}
            />
          ) : (
            <span className="text-sm text-text-3">
              Every section is placed. Select a card and use Alt + arrows to move it.
            </span>
          )}
        </div>
      </div>
    </AnswerFrame>
  );
}
