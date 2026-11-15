// A Euclidean rhythm's numbers (Wave 7, `euclid`; R3.L01–L03): hits `k`, steps `n` and, when the step asks for it,
// the rotation `r`, each a stepper (a spin button: arrows change it), with the ring the numbers make drawn live
// beside them, the mini-notation they write (`x(5,8,1)`) and a "Play it" that sounds the ring twice. The value is
// `[k, n]` or `[k, n, r]`; the grader grades by the onsets the numbers make, so two spellings of one rhythm are one
// answer. Marks: part 0 is the whole ring; `k`, `n` and `r` mark a number. A reveal draws the answer's ring beside
// the learner's, in space that is always reserved.
import { clsx } from "clsx";
import { Minus, Play, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import {
  clampEuclid,
  type EuclidNumbers,
  euclidCells,
  euclidMini,
  euclidOf,
  euclidSpoken,
  euclidValue,
  ringPoint,
} from "../rhythm7.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, MarkBadge, markOf, markRing, revealedOf, SubmitHint } from "../ui.tsx";
import { playHits } from "./W7Parts.tsx";

const RING = 148;

function Ring({
  e,
  answer,
  mark,
}: {
  e: EuclidNumbers | null;
  answer?: boolean;
  mark?: "ok" | "bad" | null;
}) {
  const n = e?.n ?? 8;
  const cells = e && e.k >= 1 ? euclidCells(e) : Array.from({ length: n }, () => false);
  return (
    <svg
      viewBox="0 0 100 100"
      width={RING}
      height={RING}
      aria-hidden
      data-ring={answer ? "answer" : "yours"}
      data-onsets={cells.flatMap((on, i) => (on ? [i] : [])).join(" ")}
      className={clsx(
        "shrink-0 rounded-full",
        mark === "ok" ? "ring-2 ring-accent" : mark === "bad" ? "ring-2 ring-issue" : "",
      )}
    >
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        className={answer ? "stroke-accent-2" : "stroke-border"}
        strokeWidth="1.5"
        strokeDasharray={answer ? "3 3" : undefined}
      />
      {/* The polygon through the hits: the shape of the rhythm. */}
      {cells.filter(Boolean).length >= 2 ? (
        <polygon
          points={cells
            .flatMap((on, i) => (on ? [ringPoint(i, n, 0.4)] : []))
            .map((p) => `${p.x * 100},${p.y * 100}`)
            .join(" ")}
          className={answer ? "fill-accent-2/10 stroke-accent-2" : "fill-accent/10 stroke-accent"}
          strokeWidth="1"
        />
      ) : null}
      {cells.map((on, i) => {
        const p = ringPoint(i, n, 0.4);
        return (
          <circle
            key={i}
            cx={p.x * 100}
            cy={p.y * 100}
            r={on ? 5.5 : 3}
            className={on ? (answer ? "fill-accent-2" : "fill-accent") : "fill-text-3"}
          />
        );
      })}
      {/* Step 1 is at the top: a short tick outside the ring marks where the bar starts. */}
      <line
        x1="50"
        y1="1.5"
        x2="50"
        y2="5"
        className="stroke-text-3"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Stepper({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onSet,
  mark,
}: {
  id: string;
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean | undefined;
  onSet(v: number): void;
  mark: "ok" | "bad" | null;
}) {
  const set = (v: number) => {
    if (!disabled) onSet(Math.max(min, Math.min(max, v)));
  };
  return (
    <div className="flex items-center gap-2" data-stepper={id}>
      <span className="w-20 text-sm text-text-2">{label}</span>
      <Button
        size="sm"
        variant="ghost"
        data-enter="native"
        tabIndex={-1}
        aria-label={`${label}: one fewer`}
        icon={<Minus aria-hidden className="size-4" />}
        disabled={disabled || (value !== null && value <= min)}
        onClick={() => set((value ?? min + 1) - 1)}
      />
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "not set" : String(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          const by =
            e.key === "ArrowUp" || e.key === "ArrowRight"
              ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft"
                ? -1
                : 0;
          if (by !== 0) {
            e.preventDefault();
            e.stopPropagation();
            set((value ?? (by > 0 ? min - 1 : min + 1)) + by);
          } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            set(e.key === "Home" ? min : max);
          }
        }}
        className={clsx(
          "relative inline-flex h-9 w-12 items-center justify-center rounded-control border-2 bg-surface text-base font-semibold tabular-nums",
          value === null ? "border-dashed border-border text-text-3" : "border-border text-text",
          markRing(mark),
        )}
      >
        {value ?? "–"}
        <MarkBadge mark={mark} />
      </span>
      <Button
        size="sm"
        variant="ghost"
        data-enter="native"
        tabIndex={-1}
        aria-label={`${label}: one more`}
        icon={<Plus aria-hidden className="size-4" />}
        disabled={disabled || (value !== null && value >= max)}
        onClick={() => set((value ?? min - 1) + 1)}
      />
    </div>
  );
}

export function EuclidAnswer(p: AnswerWidgetProps<"euclid">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const root = useRef<HTMLDivElement>(null);
  const maxSteps = Math.max(2, spec.maxSteps);
  const set = euclidOf(value);
  // Before the learner sets anything the ring shows its steps empty (8, or fewer when the step allows fewer).
  const shown: EuclidNumbers = set ?? { k: 0, n: Math.min(8, maxSteps), r: 0 };
  const correctValue = revealedOf<number[]>(feedback);
  const correct = correctValue ? euclidOf(correctValue) : null;
  const m = (part: number | string) => {
    const x = markOf(feedback, part);
    return x ? (x.ok ? "ok" : "bad") : null;
  };
  const bpm = env.rhythm?.bpm ?? 120;
  const sound = env.rhythm?.sound ?? "rim";

  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[role=spinbutton]")?.focus();
  }, [p.autoFocus]);

  const emit = (next: Partial<EuclidNumbers>) => {
    if (disabled) return;
    const e = clampEuclid({ ...shown, k: Math.max(1, shown.k), ...next }, maxSteps);
    onChange(euclidValue(e, spec.rotation));
  };
  const play = () => {
    if (!set) return;
    const cells = euclidCells(shown);
    // One step is a 16th at `bpm` when the ring has 16 steps, an 8th when it has 8: the ring spans one bar.
    const stepSec = (4 * 60) / bpm / shown.n;
    const hits = [0, 1].flatMap((rep) =>
      cells.flatMap((on, i) =>
        on ? [{ at: (rep * shown.n + i) * stepSec, s: sound, gain: i === 0 ? 0.8 : 0.55 }] : [],
      ),
    );
    playHits(audio, hits);
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "p" || e.key === "P") {
      play();
      return true;
    }
    return false;
  };

  const ringMark = m(0);
  return (
    <AnswerFrame
      kind="euclid"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["Tab"]}>next number</KeyHint>
          <KeyHint keys={["↑", "↓"]}>change it</KeyHint>
          <KeyHint keys={["P"]}>play</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-wrap items-center gap-x-6 gap-y-3" data-euclid={value.join(",")}>
        <div className="flex flex-col gap-2">
          <Stepper
            id="k"
            label="Hits"
            value={set ? shown.k : null}
            min={1}
            max={shown.n}
            disabled={disabled}
            onSet={(k) => emit({ k })}
            mark={m("k")}
          />
          <Stepper
            id="n"
            label="Steps"
            value={set ? shown.n : null}
            min={2}
            max={maxSteps}
            disabled={disabled}
            onSet={(n) => emit({ n })}
            mark={m("n")}
          />
          {spec.rotation ? (
            <Stepper
              id="r"
              label="Rotation"
              value={set ? shown.r : null}
              min={0}
              max={shown.n - 1}
              disabled={disabled}
              onSet={(r) => emit({ r })}
              mark={m("r")}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Ring e={set ? shown : null} mark={ringMark} />
          </div>
          {/* Reserved: the answer's ring takes this place once revealed. */}
          <div style={{ width: RING, height: RING }} className="shrink-0" data-testid="euclid-reveal">
            {correct ? <Ring e={correct} answer /> : null}
          </div>
        </div>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-3 text-sm text-text-2">
        <Button
          size="sm"
          variant="ghost"
          data-enter="native"
          icon={<Play aria-hidden className="size-4" />}
          disabled={!set}
          onClick={play}
        >
          Play it
        </Button>
        <span aria-live="polite" data-testid="euclid-reads">
          {set ? (
            <>
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text">
                {euclidMini(shown, spec.rotation, sound)}
              </code>{" "}
              {euclidSpoken(shown)}
            </>
          ) : (
            "Set the hits and the steps."
          )}
        </span>
        {correct ? (
          <span>
            Answer:{" "}
            <code className="rounded-control border-2 border-dashed border-accent-2 px-1.5 font-mono text-text">
              {euclidMini(correct, spec.rotation, sound)}
            </code>
          </span>
        ) : null}
      </div>
    </AnswerFrame>
  );
}
