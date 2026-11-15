// The grouping of an odd-meter bar (Wave 7, `grouping`; R2.L01–L02): the bar's eighths (quarters in 5/4) drawn as
// cells, cut into groups of 2 and 3 as the learner adds them. `2` and `3` add a group, Backspace takes the last
// one away, a click on a group swaps it between 2 and 3, `P` plays the bar with the group starts accented. The
// value is the group sizes in order (`[2, 2, 3]`); the grader grades the sequence. Marks are per group; a reveal
// draws the answer's bar under the learner's in reserved space.
import { clsx } from "clsx";
import { Delete, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import {
  addGroup,
  dropGroup,
  flipGroup,
  groupingCells,
  groupingCount,
  groupingHits,
  groupingText,
  groupingUnits,
  sumOf,
} from "../rhythm7.ts";
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
import { playHits } from "./W7Parts.tsx";

function Bar({
  value,
  units,
  feedback,
  onFlip,
  disabled,
  label,
}: {
  value: readonly number[];
  units: number;
  feedback: AnswerWidgetProps<"grouping">["feedback"];
  onFlip: (group: number) => void;
  disabled?: boolean | undefined;
  label: string;
}) {
  const cells = groupingCells(value, units);
  const groups: { at: number; size: number }[] = [];
  let at = 0;
  for (const g of value) {
    groups.push({ at, size: g });
    at += g;
  }
  return (
    <div className="relative w-full max-w-[34rem]" data-grouping-bar>
      <div
        aria-hidden
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${units}, minmax(0, 1fr))` }}
      >
        {cells.map((c) => (
          <span
            key={c.unit}
            className={clsx(
              "flex h-10 items-center justify-center rounded-[6px] border text-sm tabular-nums",
              c.group === null
                ? "border-dashed border-border text-text-3"
                : c.group % 2 === 0
                  ? "border-transparent bg-accent/15 text-text"
                  : "border-transparent bg-accent-2/15 text-text",
              c.start && "font-semibold",
            )}
          >
            {c.group === null ? "·" : c.count}
          </span>
        ))}
      </div>
      {/* The group brackets: one button per group, over its cells (a click swaps 2 and 3). */}
      <ol aria-label={label} className="relative mt-1 h-8">
        {groups.map((g, i) => {
          const mark = markOf(feedback, i);
          const m = mark ? (mark.ok ? "ok" : "bad") : null;
          const left = (g.at / units) * 100;
          const width = (g.size / units) * 100;
          return (
            <li
              key={`${g.at}-${g.size}`}
              className="absolute top-0 h-8 px-0.5"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <button
                type="button"
                data-group={i}
                aria-label={`Group ${i + 1}: ${g.size}${m ? (m === "ok" ? ", right" : ", not this one") : ""}. Swap between 2 and 3`}
                aria-disabled={disabled || undefined}
                onClick={() => onFlip(i)}
                className={clsx(
                  "relative flex h-full w-full items-center justify-center rounded-b-[6px] border-2 border-t-0 text-sm font-semibold",
                  "border-text-3 hover:bg-surface-2",
                  markRing(m),
                )}
              >
                {g.size}
                <MarkBadge mark={m} note={mark?.note} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function GroupingAnswer(p: AnswerWidgetProps<"grouping">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const root = useRef<HTMLDivElement>(null);
  const { units, word } = groupingUnits(spec.meter);
  const left = units - sumOf(value);
  const correct = revealedOf<number[]>(feedback);
  const bpm = env.rhythm?.bpm ?? 180;

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLButtonElement>("[data-add='2']")?.focus();
  }, [p.autoFocus]);

  const add = (size: 2 | 3) => {
    if (!disabled) onChange(addGroup(value, size, units));
  };
  const undo = () => {
    if (!disabled) onChange(dropGroup(value));
  };
  const play = (v: readonly number[]) =>
    playHits(
      audio,
      groupingHits(v, units, bpm, 2).map((h) => ({
        at: h.at,
        s: h.accent ? "bd" : "hh",
        gain: h.accent ? 0.85 : 0.4,
      })),
    );

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const n = digitOf(e);
    if (n === 2 || n === 3) {
      add(n);
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      undo();
      return true;
    }
    if (e.key === "p" || e.key === "P") {
      if (value.length > 0) play(value);
      return true;
    }
    return false;
  };

  return (
    <AnswerFrame
      kind="grouping"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["2", "3"]}>add a group</KeyHint>
          <KeyHint keys={["⌫"]}>take one away</KeyHint>
          <KeyHint keys={["P"]}>play</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-2" data-grouping={groupingText(value)}>
        <p className="text-sm text-text-2">
          One bar of {spec.meter}: {units} {word}s. Cut it into groups of 2 and 3.
        </p>
        <Bar
          value={value}
          units={units}
          feedback={feedback}
          onFlip={(i) => {
            if (!disabled) onChange(flipGroup(value, i, units));
          }}
          disabled={disabled}
          label="Your groups"
        />
        <div className="flex flex-wrap items-center gap-2">
          {([2, 3] as const).map((g) => (
            <Button
              key={g}
              size="sm"
              variant="secondary"
              data-add={g}
              // Not `disabled`: a focused button that turns disabled drops the focus, and the keys with it.
              aria-disabled={disabled || g > left || undefined}
              className={clsx((disabled || g > left) && "opacity-50")}
              onClick={() => add(g)}
              aria-label={`Add a group of ${g}`}
            >
              + {g}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            icon={<Delete aria-hidden className="size-4" />}
            disabled={disabled || value.length === 0}
            onClick={undo}
          >
            Take one away
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={value.length === 0}
            onClick={() => play(value)}
          >
            Play it
          </Button>
          <span className="text-sm text-text-2 tabular-nums" aria-live="polite" data-testid="grouping-left">
            {value.length === 0
              ? ""
              : left === 0
                ? `${groupingText(value)}: counted ${groupingCount(value)}`
                : `${groupingText(value)}, ${left} ${left === 1 ? word : `${word}s`} left`}
          </span>
        </div>
        {/* Reserved height: the answer's groups appear here once revealed, and nothing above moves. */}
        <p
          className="flex min-h-8 flex-wrap items-center gap-1.5 text-sm text-text-2"
          data-testid="grouping-reveal"
        >
          {correct ? (
            <>
              <span>Answer:</span>
              {correct.map((g, i) => (
                <span
                  key={i}
                  className="inline-flex h-7 items-center gap-1 rounded-control border-2 border-dashed border-accent-2 px-1.5 font-semibold text-text tabular-nums"
                >
                  {Array.from({ length: g }, (_, k) => k + 1).join(" ")}
                </span>
              ))}
              <span className="sr-only">{groupingText(correct)}</span>
            </>
          ) : null}
        </p>
      </div>
    </AnswerFrame>
  );
}
