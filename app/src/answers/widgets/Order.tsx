// Ordering / Parsons (ux §7.9 "Parsons keyboard-complete"): blocks from a shuffled pool into an order. Pointer:
// drag, or the small buttons. Keyboard: `↑`/`↓` walk a list, `←`/`→` switch lists, `Alt+↑`/`Alt+↓` move a placed
// block, `Alt+→` places a pool block, `Backspace` returns a placed block, `P` plays a block's audition.
import type { ParsonsBlock } from "@oak/api";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Play, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { insertItem, moveItem, poolOrder, removeItem } from "../keys.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, MarkBadge, markOf, revealedOf, SubmitHint } from "../ui.tsx";

const MINI =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text";

export function OrderAnswer(p: AnswerWidgetProps<"order">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const all = [...spec.blocks, ...spec.distractors];
  const byId = new Map(all.map((b) => [b.id, b] as const));
  const pool = poolOrder(all).filter((b) => !value.includes(b.id));
  const placed = value.map((id) => byId.get(id)).filter((b): b is ParsonsBlock => b !== undefined);
  const correct = revealedOf<string[]>(feedback);
  const lines = spec.assemble === "lines";
  const [drag, setDrag] = useState<string | null>(null);

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[data-block]")?.focus();
  }, [p.autoFocus]);

  const focusBlock = (list: "pool" | "answer", i: number) => {
    const from = document.activeElement;
    requestAnimationFrame(() => {
      // The learner may have moved on already: only follow the block when focus is still where the key was pressed.
      const now = document.activeElement;
      if (now !== from && now !== document.body && now !== null) return;
      const items = [
        ...(root.current?.querySelectorAll<HTMLElement>(`[data-list="${list}"] [data-block]`) ?? []),
      ];
      const other = [
        ...(root.current?.querySelectorAll<HTMLElement>(
          `[data-list="${list === "pool" ? "answer" : "pool"}"] [data-block]`,
        ) ?? []),
      ];
      (items[Math.max(0, Math.min(items.length - 1, i))] ?? other[0])?.focus();
    });
  };
  const place = (id: string, at?: number) => {
    if (!disabled) onChange(insertItem(value, id, at));
  };
  const unplace = (id: string) => {
    if (!disabled) onChange(removeItem(value, id));
  };
  const shift = (id: string, by: number) => {
    const i = value.indexOf(id);
    if (!disabled && i >= 0) onChange(moveItem(value, i, i + by));
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
    if (!el) return false;
    const id = el.dataset.block as string;
    const list = el.closest<HTMLElement>("[data-list]")?.dataset.list as "pool" | "answer";
    const index = list === "answer" ? value.indexOf(id) : pool.findIndex((b) => b.id === id);
    if (e.key === "p" || e.key === "P") {
      const a = byId.get(id)?.audition;
      if (a) p.audition?.(a);
      return true;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && list === "answer") {
      shift(id, e.key === "ArrowUp" ? -1 : 1);
      focusBlock("answer", index + (e.key === "ArrowUp" ? -1 : 1));
      return true;
    }
    if (e.altKey && e.key === "ArrowRight" && list === "pool") {
      place(id);
      focusBlock("pool", index);
      return true;
    }
    if (
      (e.key === "Backspace" || e.key === "Delete" || (e.altKey && e.key === "ArrowLeft")) &&
      list === "answer"
    ) {
      unplace(id);
      focusBlock("answer", index);
      return true;
    }
    if (e.altKey) return false;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      focusBlock(list, index + (e.key === "ArrowUp" ? -1 : 1));
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      focusBlock(e.key === "ArrowLeft" ? "pool" : "answer", 0);
      return true;
    }
    return false;
  };

  const blockRow = (b: ParsonsBlock, list: "pool" | "answer", i: number) => {
    const mark = list === "answer" ? markOf(feedback, i) : null;
    return (
      <li
        key={b.id}
        data-block={b.id}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a block is a keyboard-operable item (ux §7.9)
        tabIndex={0}
        draggable={!disabled}
        onDragStart={(e) => {
          setDrag(b.id);
          e.dataTransfer.setData("text/plain", b.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => list === "answer" && e.preventDefault()}
        onDrop={(e) => {
          if (list !== "answer") return;
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData("text/plain");
          if (id) place(id, i);
        }}
        aria-label={`${list === "answer" ? `${i + 1}. ` : ""}${b.text}${mark ? (mark.ok ? ", right" : ", not in place") : ""}`}
        aria-keyshortcuts={list === "answer" ? "Alt+ArrowUp Alt+ArrowDown Backspace" : "Alt+ArrowRight"}
        className={clsx(
          "group relative flex min-h-10 items-center gap-2 rounded-control border-2 bg-surface px-2 py-1",
          mark?.ok === true ? "border-accent" : mark?.ok === false ? "border-issue" : "border-border",
          drag === b.id && "opacity-50",
          !disabled && "cursor-grab",
        )}
      >
        {list === "answer" ? (
          <span aria-hidden className="w-5 shrink-0 text-right text-[0.75rem] text-text-3 tabular-nums">
            {i + 1}
          </span>
        ) : null}
        <span
          className={clsx("min-w-0 flex-1 break-words", lines ? "font-mono text-[0.875rem]" : "font-medium")}
        >
          {b.text}
        </span>
        {b.audition && p.audition ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={MINI}
            title="Play (P)"
            onClick={() => p.audition?.(b.audition as string)}
          >
            <Play className="size-4" />
          </button>
        ) : null}
        {!disabled && list === "pool" ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={MINI}
            title="Place (Alt+→)"
            onClick={() => place(b.id)}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
        {!disabled && list === "answer" ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className={MINI}
              title="Earlier (Alt+↑)"
              onClick={() => shift(b.id, -1)}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className={MINI}
              title="Later (Alt+↓)"
              onClick={() => shift(b.id, 1)}
            >
              <ArrowDown className="size-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className={MINI}
              title="Take out (Backspace)"
              onClick={() => unplace(b.id)}
            >
              <X className="size-4" />
            </button>
          </>
        ) : null}
        <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
      </li>
    );
  };

  return (
    <AnswerFrame
      kind="order"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["Alt →"]}>place</KeyHint>
          <KeyHint keys={["Alt ↑", "Alt ↓"]}>move</KeyHint>
          <KeyHint keys={["⌫"]}>take out</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="grid gap-3 md:grid-cols-2">
        <section
          aria-label={correct ? "The answer" : "Blocks to place"}
          className="flex min-w-0 flex-col gap-1.5"
        >
          <h4 className="text-sm font-medium text-text-2">{correct ? "The answer" : "Blocks"}</h4>
          {correct ? (
            <ol className="flex flex-col gap-1.5">
              {correct.map((id, i) => (
                <li
                  key={id}
                  className="flex min-h-10 items-center gap-2 rounded-control border-2 border-dashed border-accent-2 px-2 py-1"
                >
                  <span className="w-5 text-right text-[0.75rem] text-text-3 tabular-nums">{i + 1}</span>
                  <span
                    className={clsx("min-w-0 flex-1", lines ? "font-mono text-[0.875rem]" : "font-medium")}
                  >
                    {byId.get(id)?.text ?? id}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <ul
              data-list="pool"
              className="flex min-h-12 flex-col gap-1.5 rounded-card border border-dashed border-border p-1.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) unplace(id);
              }}
            >
              {pool.length === 0 ? (
                <li className="px-2 py-2 text-sm text-text-3">Every block is placed.</li>
              ) : null}
              {pool.map((b, i) => blockRow(b, "pool", i))}
            </ul>
          )}
        </section>
        <section aria-label="Your order" className="flex min-w-0 flex-col gap-1.5">
          <h4 className="text-sm font-medium text-text-2">Your order</h4>
          <ol
            data-list="answer"
            className="flex min-h-12 flex-col gap-1.5 rounded-card border border-border bg-surface-2/50 p-1.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) place(id);
            }}
          >
            {placed.length === 0 ? (
              <li className="px-2 py-2 text-sm text-text-3">Place the blocks here, first to last.</li>
            ) : null}
            {placed.map((b, i) => blockRow(b, "answer", i))}
          </ol>
        </section>
      </div>
    </AnswerFrame>
  );
}
