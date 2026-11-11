// Single and multiple choice (contracts §5.4 `choice`): buttons, cards or audio cards. `1`–`9` pick the n-th
// option (toggle when multi), `Shift+1`–`9` plays its audio, arrows move between options (and pick, for a single
// choice, as a radio group does). Marks per option ID; a reveal outlines the right ones.
import type { Choice } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAnswerEnv } from "../env.tsx";
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
} from "../ui.tsx";
import { InlineMd, plainMd } from "./InlineMd.tsx";

export function ChoiceAnswer(p: AnswerWidgetProps<"choice">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const thumbOf = useAnswerEnv().choiceThumb;
  const multi = spec.multi === true;
  const layout = spec.layout ?? "buttons";
  const cards = layout !== "buttons";
  const correct = revealedOf<string[]>(feedback) ?? [];
  const canPlay = Boolean(p.audition) && spec.options.some((o) => o.audio);

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const pick = (o: Choice) => {
    if (disabled) return;
    if (multi) onChange(value.includes(o.id) ? value.filter((v) => v !== o.id) : [...value, o.id]);
    else onChange([o.id]);
  };
  const play = (o: Choice) => {
    if (o.audio) p.audition?.(o.audio);
  };
  const buttons = () => [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-option]") ?? [])];

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const n = digitOf(e);
    if (n !== null && n >= 1 && n <= spec.options.length) {
      const o = spec.options[n - 1] as Choice;
      if (e.shiftKey) play(o);
      else {
        pick(o);
        buttons()[n - 1]?.focus();
      }
      return true;
    }
    const dir =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (dir === 0) return false;
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return false;
    const next = (at + dir + list.length) % list.length;
    list[next]?.focus();
    if (!multi) pick(spec.options[next] as Choice);
    return true;
  };

  const tabStop = multi ? null : (value[0] ?? spec.options[0]?.id);
  return (
    <AnswerFrame
      kind="choice"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={[`1–${Math.min(9, spec.options.length)}`]}>{multi ? "toggle" : "pick"}</KeyHint>
          {canPlay ? <KeyHint keys={["⇧ + digit"]}>play</KeyHint> : null}
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen at runtime (radio for one answer, checkbox or group for several) */}
      <div
        ref={root}
        role={multi ? "group" : "radiogroup"}
        aria-label={p.label}
        className={clsx(
          cards
            ? "grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]"
            : "flex flex-wrap gap-2",
        )}
      >
        {spec.options.map((o, i) => {
          const on = value.includes(o.id);
          const mark = markOf(feedback, o.id);
          const isAnswer = correct.includes(o.id);
          return (
            <div key={o.id} className={clsx("relative", cards && "flex")}>
              {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen at runtime (radio for one answer, checkbox or group for several) */}
              <button
                type="button"
                data-option={o.id}
                role={multi ? "checkbox" : "radio"}
                aria-checked={on}
                aria-disabled={disabled || undefined}
                aria-label={`${i + 1}. ${plainMd(o.label)}${isAnswer ? " (the answer)" : ""}`}
                tabIndex={multi || o.id === tabStop ? 0 : -1}
                onClick={() => pick(o)}
                className={clsx(
                  "relative flex min-h-10 items-center gap-2 rounded-control border-2 px-3 text-left transition-colors",
                  cards ? "w-full flex-1 py-3 pr-12" : "py-1.5",
                  on
                    ? "border-accent bg-lane-in text-text"
                    : "border-border bg-surface text-text hover:border-text-3",
                  markRing(mark ? (mark.ok ? "ok" : "bad") : null),
                  isAnswer && !on && "border-dashed border-accent-2",
                  disabled && "cursor-default opacity-80",
                )}
              >
                <span
                  aria-hidden
                  className={clsx(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded border text-[0.75rem] tabular-nums",
                    on ? "border-accent bg-accent text-on-accent" : "border-border text-text-3",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  {cards && o.thumb && thumbOf ? <span aria-hidden>{thumbOf(o)}</span> : null}
                  <span>
                    <InlineMd text={o.label} />
                  </span>
                </span>
                {isAnswer ? (
                  <span className="absolute -top-2 left-2 rounded bg-surface px-1 text-[0.65rem] leading-4 font-medium text-accent-2">
                    answer
                  </span>
                ) : null}
              </button>
              {cards && o.audio && p.audition ? (
                <button
                  type="button"
                  data-enter="native"
                  aria-label={`Play ${plainMd(o.label)}`}
                  title={`Play (⇧${i + 1})`}
                  onClick={() => play(o)}
                  className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control border border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <Play aria-hidden className="size-4" />
                </button>
              ) : null}
              <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
            </div>
          );
        })}
      </div>
    </AnswerFrame>
  );
}
