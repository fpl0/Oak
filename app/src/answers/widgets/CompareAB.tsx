// The A/B sound pick (Wave 7; A1.L05–L07, A2, `fam.snd.params`): "which is brighter / dirtier / wider / farther /
// moving / busier". A two-option `choice` whose ids are one of the sound axes (content-kit `SOUND_COMPARE_OPTIONS`,
// plus density) is drawn as two cards, A and B, each with its own play button (`AnswerEnv.compare`), under the
// question. Picking card A answers the first id, card B the second (content-kit: "the first id the A card when it
// is the answer"). Keys: `A`/`B` or `1`/`2` pick, `Shift` with them plays, arrows move and pick.
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAnswerEnv } from "../env.tsx";
import { type ComparePair, cardOf } from "../sound7.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, digitOf, focusFirst, KeyHint, markOf, revealedOf, SubmitHint } from "../ui.tsx";
import { PickCard } from "./W7Parts.tsx";

export function CompareABAnswer(p: AnswerWidgetProps<"choice"> & { pair: ComparePair }) {
  const { value, onChange, disabled, feedback, pair } = p;
  const env = useAnswerEnv();
  const root = useRef<HTMLDivElement>(null);
  const correct = revealedOf<string[]>(feedback) ?? [];
  const picked = cardOf(pair, value);
  const answerCard = correct.length > 0 ? cardOf(pair, correct) : null;
  const c = env.compare;
  const canPlay = Boolean(c?.play) || Boolean(p.audition && (c?.a || c?.b));

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const pick = (card: "A" | "B") => {
    if (!disabled) onChange([card === "A" ? pair.a.id : pair.b.id]);
  };
  const play = (card: "A" | "B") => {
    if (c?.play) c.play(card);
    else {
      const code = card === "A" ? c?.a : c?.b;
      if (code) p.audition?.(code);
    }
  };
  const focus = (card: "A" | "B") =>
    root.current?.querySelector<HTMLElement>(`[data-card="${card}"] [role=radio]`)?.focus();
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const n = digitOf(e);
    const card: "A" | "B" | null =
      n === 1 || e.code === "KeyA" ? "A" : n === 2 || e.code === "KeyB" ? "B" : null;
    if (card) {
      if (e.shiftKey) play(card);
      else {
        pick(card);
        focus(card);
      }
      return true;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const next = picked === "A" ? "B" : "A";
      pick(next);
      focus(next);
      return true;
    }
    return false;
  };

  return (
    <AnswerFrame
      kind="choice"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      caption={pair.question}
      keys={
        <>
          <KeyHint keys={["A", "B"]}>pick</KeyHint>
          {canPlay ? <KeyHint keys={["⇧A", "⇧B"]}>hear it</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div
        ref={root}
        role="radiogroup"
        aria-label={pair.question}
        className="grid max-w-[30rem] grid-cols-2 gap-3"
        data-compare={pair.axis}
      >
        {(["A", "B"] as const).map((card) => {
          const id = card === "A" ? pair.a.id : pair.b.id;
          const mark = markOf(feedback, id);
          return (
            <div key={card} data-card={card} className="flex flex-col gap-1.5">
              <PickCard
                id={id}
                checked={picked === card}
                disabled={disabled}
                isAnswer={answerCard === card}
                mark={mark ? (mark.ok ? "ok" : "bad") : null}
                note={mark?.note}
                tabStop={(picked ?? "A") === card}
                label={`${card} is ${pair.word}`}
                onPick={() => pick(card)}
                className="h-20 flex-col items-center justify-center gap-0.5"
              >
                <span className="font-display text-3xl leading-none text-text">{card}</span>
                <span className={clsx("text-[0.8125rem]", picked === card ? "text-text" : "text-text-3")}>
                  {picked === card ? pair.word : " "}
                </span>
              </PickCard>
              {canPlay ? (
                <button
                  type="button"
                  data-enter="native"
                  onClick={() => play(card)}
                  aria-label={`Hear ${card}`}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-border bg-surface text-sm text-text-2 hover:bg-surface-2"
                >
                  <Play aria-hidden className="size-4" />
                  Hear {card}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </AnswerFrame>
  );
}
