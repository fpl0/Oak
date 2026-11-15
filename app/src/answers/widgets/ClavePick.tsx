// The clave pick (Wave 7; R3.L02, `fam.rhy.clave`): after hearing a groove, which clave is it, son or rumba, 3-2 or
// 2-3. A `choice` whose options are content-kit `CLAVE_OPTIONS` ids is drawn as cards, each with its two bars on
// the eighth grid (the three-side and the two-side: sound, then symbol), son and rumba in rows and the directions
// in columns when all four are offered. An option with authored `audio` can be auditioned (Shift+digit); nothing
// else plays, so the pick stays an ear question. After a check the picked clave (or, revealed, the answer) is
// said in words. Keys: digits pick, arrows move and pick.
import type { Choice } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { claveCells, claveParts } from "../rhythm7.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, digitOf, focusFirst, KeyHint, markOf, revealedOf, SubmitHint } from "../ui.tsx";
import { InlineMd, plainMd } from "./InlineMd.tsx";
import { PickCard, pickKeys } from "./W7Parts.tsx";

/** The two bars of a clave as cells (eighths), the bar line between them. */
export function ClaveBars({ id, answer }: { id: string; answer?: boolean }) {
  const cells = claveCells(id);
  if (!cells) return null;
  return (
    <span
      aria-hidden
      className="flex w-full items-center gap-1.5"
      data-clave-cells={cells.map((c) => (c ? "x" : ".")).join("")}
    >
      {[0, 1].map((bar) => (
        <span key={bar} className="grid flex-1 grid-cols-8 gap-0.5">
          {cells.slice(bar * 8, bar * 8 + 8).map((on, i) => (
            <span
              key={i}
              className={clsx(
                "h-3 rounded-[3px]",
                on ? (answer ? "bg-accent-2" : "bg-accent") : i % 2 === 0 ? "bg-text/15" : "bg-text/[0.07]",
              )}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

/** "Son clave, 2-3: the two-side first, then the three-side." */
export function claveSentence(id: string): string | null {
  const p = claveParts(id);
  if (!p) return null;
  const name = `${p.type === "son" ? "Son" : "Rumba"} clave, ${p.direction}`;
  const order =
    p.direction === "3-2"
      ? "the three-side first, then the two-side"
      : "the two-side first, then the three-side";
  const rumba =
    p.type === "rumba" ? " The three-side's last stroke comes an eighth later than the son's." : "";
  return `${name}: ${order}.${rumba}`;
}

export function ClavePickAnswer(p: AnswerWidgetProps<"choice">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const correct = revealedOf<string[]>(feedback) ?? [];
  const ids = spec.options.map((o) => o.id);
  const types = new Set(spec.options.map((o) => claveParts(o.id)?.type));
  const grid = types.size === 2 && spec.options.length === 4;
  const tabStop = value[0] ?? ids[0];
  const canPlay = Boolean(p.audition) && spec.options.some((o) => o.audio);
  const about =
    feedback.state === "revealed" ? correct[0] : feedback.state === "correct" ? value[0] : undefined;
  const sentence = about ? claveSentence(about) : null;

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const pick = (id: string) => {
    if (!disabled) onChange([id]);
  };
  const play = (o: Choice) => {
    if (o.audio) p.audition?.(o.audio);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const n = digitOf(e);
    if (n !== null && e.shiftKey) {
      const o = spec.options[n - 1];
      if (o) play(o);
      return true;
    }
    return pickKeys(e, root.current, ids, pick);
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
      keys={
        <>
          <KeyHint keys={[`1–${ids.length}`]}>pick</KeyHint>
          {canPlay ? <KeyHint keys={["⇧ + digit"]}>hear it</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div
        ref={root}
        role="radiogroup"
        aria-label={p.label}
        data-clave-pick
        className={clsx("grid gap-2", grid ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}
      >
        {spec.options.map((o, i) => {
          const mark = markOf(feedback, o.id);
          return (
            <div key={o.id} className="relative flex min-w-0 items-stretch gap-1">
              <PickCard
                id={o.id}
                checked={value.includes(o.id)}
                disabled={disabled}
                isAnswer={correct.includes(o.id)}
                mark={mark ? (mark.ok ? "ok" : "bad") : null}
                note={mark?.note}
                tabStop={o.id === tabStop}
                label={`${i + 1}. ${plainMd(o.label)}`}
                onPick={() => pick(o.id)}
                className="flex-1 flex-col gap-2 p-2.5"
              >
                <span className="flex items-baseline gap-2 text-sm font-medium text-text">
                  <span aria-hidden className="font-mono text-[0.75rem] text-text-3">
                    {i + 1}
                  </span>
                  <InlineMd text={o.label} />
                </span>
                <ClaveBars id={o.id} answer={correct.includes(o.id)} />
              </PickCard>
              {o.audio && p.audition ? (
                <button
                  type="button"
                  data-enter="native"
                  tabIndex={-1}
                  aria-label={`Hear ${plainMd(o.label)}`}
                  onClick={() => play(o)}
                  className="inline-flex w-9 shrink-0 items-center justify-center rounded-control border border-border bg-surface text-text-2 hover:bg-surface-2"
                >
                  <Play aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="min-h-10 text-sm text-text-2" data-testid="clave-fact" aria-live="polite">
        {sentence ?? ""}
      </p>
    </AnswerFrame>
  );
}
