// Small answers: bar buttons (error hunt "which bar?"), A/B same-different, a slider estimate (tempo, swing
// amount), and hum-to-predict (records nothing: a timed "hum it, then run" affordance, completion only).
// Wave 6: the bar buttons are a bar timeline (BarStrip.tsx); with `AnswerEnv.keyChange` (U17: "where does the key
// change") the bars from the pick on are the new key, `P` plays from the focused bar, and the line under the strip
// names the keys once the answer is known.
import { clsx } from "clsx";
import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Progress } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { sliderText, snapToStep } from "../keys.ts";
import { laybackHits, laybackWords, swingHits, swingWords } from "../rhythm7.ts";
import { fromLog, snapLog, toLog } from "../sound7.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  digitOf,
  focusFirst,
  KeyHint,
  MarkBadge,
  markOf,
  revealedOf,
  SubmitHint,
  TAKE_RETRY_PROPS,
  TakeRetryLabel,
  useTakeRetryKey,
} from "../ui.tsx";
import { BarStrip, keyChangeLine } from "./BarStrip.tsx";
import { playHits } from "./W7Parts.tsx";

function radioKeys(
  root: HTMLElement | null,
  e: React.KeyboardEvent<HTMLElement>,
  pick: (i: number) => void,
): boolean {
  const dir =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!dir || !root) return false;
  const list = [...root.querySelectorAll<HTMLButtonElement>("[role=radio]")];
  const at = list.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return false;
  const next = (at + dir + list.length) % list.length;
  list[next]?.focus();
  pick(next);
  return true;
}

const RADIO =
  "relative inline-flex items-center justify-center rounded-control border-2 font-medium tabular-nums";

export function BarButtonsAnswer(p: AnswerWidgetProps<"bar-buttons">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const chosen = value.at(-1) ?? null;
  const correct = revealedOf<number[]>(feedback)?.at(-1) ?? null;
  const mark = markOf(feedback, 0);
  const kc = useAnswerEnv().keyChange;
  const known = feedback.state === "correct" || feedback.state === "revealed";
  const shownBar = feedback.state === "revealed" ? correct : chosen;
  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  const pick = (bar: number) => {
    if (!disabled) onChange([bar]);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.key === "p" || e.key === "P") && kc?.play && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const at = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [])].indexOf(
        document.activeElement as HTMLButtonElement,
      );
      kc.play(at >= 0 ? at + 1 : (chosen ?? 1));
      return true;
    }
    const n = digitOf(e);
    if (n !== null && n >= 1 && n <= spec.bars) {
      pick(n);
      root.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[n - 1]?.focus();
      return true;
    }
    return radioKeys(root.current, e, (i) => pick(i + 1));
  };
  return (
    <AnswerFrame
      kind="bar-buttons"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={[`1–${Math.min(9, spec.bars)}`]}>bar</KeyHint>
          {kc?.play ? <KeyHint keys={["P"]}>hear from this bar</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div
        ref={root}
        role="radiogroup"
        aria-label={p.label}
        aria-describedby={kc ? `${p.idBase}-keyline` : undefined}
      >
        <BarStrip
          bars={spec.bars}
          idBase={p.idBase}
          from={kc ? shownBar : null}
          keyChange={kc}
          line={kc ? keyChangeLine({ from: kc.from, to: kc.to, bar: shownBar, known }) : null}
          renderCell={(bar) => {
            const on = chosen === bar;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
              <button
                key={bar}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={disabled || undefined}
                aria-label={`Bar ${bar}${kc && on ? ", the new key begins here" : ""}${correct === bar ? " (the answer)" : ""}`}
                tabIndex={(chosen ?? 1) === bar ? 0 : -1}
                onClick={() => pick(bar)}
                className={clsx(
                  RADIO,
                  "h-11 w-full min-w-0 flex-col px-1 leading-tight",
                  on ? "border-accent bg-lane-in" : "border-border bg-surface hover:border-text-3",
                  on && mark?.ok === true && "ring-1 ring-accent",
                  on && mark?.ok === false && "border-issue ring-1 ring-issue",
                  correct === bar && !on && "border-dashed border-accent-2",
                )}
              >
                <span aria-hidden className="text-[0.65rem] font-normal text-text-3">
                  bar
                </span>
                <span>{bar}</span>
                {on && mark ? <MarkBadge mark={mark.ok ? "ok" : "bad"} note={mark.note} /> : null}
              </button>
            );
          }}
        />
      </div>
    </AnswerFrame>
  );
}

const SD = [
  { id: "same", label: "Same" },
  { id: "different", label: "Different" },
] as const;

export function SameDifferentAnswer(p: AnswerWidgetProps<"same-different">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState<"A" | "B" | null>(null);
  const correct = revealedOf<string[]>(feedback)?.[0] ?? null;
  const mark = markOf(feedback, 0);
  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  const play = (which: "A" | "B") => {
    if (!p.audition) return;
    p.audition(which === "A" ? spec.a : spec.b);
    setLast(which);
  };
  const pick = (id: string) => {
    if (!disabled) onChange([id]);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === "a" || e.key === "A") {
      play("A");
      return true;
    }
    if (e.key === "b" || e.key === "B") {
      play("B");
      return true;
    }
    const n = digitOf(e);
    if (n === 1 || n === 2) {
      pick(SD[n - 1]?.id as string);
      root.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[n - 1]?.focus();
      return true;
    }
    return radioKeys(root.current, e, (i) => pick(SD[i]?.id as string));
  };
  return (
    <AnswerFrame
      kind="same-different"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          {p.audition ? <KeyHint keys={["A", "B"]}>play</KeyHint> : null}
          <KeyHint keys={["1", "2"]}>same / different</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3">
        {p.audition ? (
          <div className="flex flex-wrap items-center gap-2">
            {(["A", "B"] as const).map((w) => (
              <Button
                key={w}
                data-enter="native"
                icon={<Play aria-hidden className="size-4" />}
                onClick={() => play(w)}
                aria-label={`Play ${w}`}
                className={clsx(last === w && "border-accent")}
              >
                {w}
              </Button>
            ))}
            <span className="text-sm text-text-3" aria-live="polite">
              {last ? `Played ${last}.` : "Play both, as often as you like."}
            </span>
          </div>
        ) : (
          <p className="text-sm text-text-2">This page has no sound, so A and B cannot play here.</p>
        )}
        {spec.question ? <p className="text-text">{spec.question}</p> : null}
        <div role="radiogroup" aria-label={p.label} className="flex flex-wrap gap-2">
          {SD.map((o, i) => {
            const on = value[0] === o.id;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={disabled || undefined}
                aria-label={`${i + 1}. ${o.label}${correct === o.id ? " (the answer)" : ""}`}
                tabIndex={(value[0] ?? "same") === o.id ? 0 : -1}
                onClick={() => pick(o.id)}
                className={clsx(
                  RADIO,
                  "h-10 min-w-28 gap-2 px-4",
                  on ? "border-accent bg-lane-in" : "border-border bg-surface hover:border-text-3",
                  on && mark?.ok === true && "ring-1 ring-accent",
                  on && mark?.ok === false && "border-issue ring-1 ring-issue",
                  correct === o.id && !on && "border-dashed border-accent-2",
                )}
              >
                <span aria-hidden className="text-[0.75rem] text-text-3">
                  {i + 1}
                </span>
                {o.label}
                {on && mark ? <MarkBadge mark={mark.ok ? "ok" : "bad"} note={mark.note} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </AnswerFrame>
  );
}

/**
 * The words under a value that plays (Wave 7): a swing amount with the long:short ratio it gives, a lay-back in
 * milliseconds with the `.late()` it takes at the piece's tempo (wave7.md §10 item 21: time is measured, never
 * "small"), a cutoff in Hz.
 */
function sliderMeaning(spec: AnswerWidgetProps<"slider">["spec"], v: number, bpm: number): string | null {
  if (spec.format === "swing") {
    const w = swingWords(v);
    return `long:short ${w.ratio}, ${w.feel}`;
  }
  if (spec.format === "ms") {
    const w = laybackWords(v, bpm);
    return `${w.ms}: ${w.code}, ${w.feel}`;
  }
  return null;
}

export function SliderAnswer(p: AnswerWidgetProps<"slider">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const ref = useRef<HTMLInputElement>(null);
  const log = spec.scale === "log" && spec.min > 0;
  const mid = log
    ? snapLog(fromLog(0.5, spec.min, spec.max))
    : snapToStep((spec.min + spec.max) / 2, spec.min, spec.max, spec.step);
  const shown = value ?? mid;
  const correct = revealedOf<number>(feedback);
  const mark = markOf(feedback, 0);
  const bpm = env.slider?.bpm ?? 96;
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, [p.autoFocus]);
  // Position on the track, 0–100: linear, or logarithmic for a cutoff.
  const pct = (v: number) =>
    log ? toLog(v, spec.min, spec.max) * 100 : ((v - spec.min) / (spec.max - spec.min)) * 100;
  const LOG_STEPS = 1000;
  const fromPos = (pos: number) =>
    log
      ? Math.max(spec.min, Math.min(spec.max, snapLog(fromLog(pos / LOG_STEPS, spec.min, spec.max))))
      : snapToStep(pos, spec.min, spec.max, spec.step);
  const fmt = { ...(spec.unit ? { unit: spec.unit } : {}), ...(spec.format ? { format: spec.format } : {}) };
  const plays = spec.play === "control" ? Boolean(env.slider?.play) : spec.play !== undefined;
  const target = spec.play === "control" ? env.slider?.playTarget : undefined;
  const play = (v: number) => {
    if (spec.play === "swing") playHits(audio, swingHits(v, bpm, 2));
    else if (spec.play === "layback") playHits(audio, laybackHits(v, bpm, 2));
    else env.slider?.play?.(v);
  };
  const meaning = value === null ? null : sliderMeaning(spec, value, bpm);
  return (
    <AnswerFrame
      kind="slider"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return false;
        if ((e.key === "p" || e.key === "P") && plays) {
          play(shown);
          return true;
        }
        if ((e.key === "t" || e.key === "T") && target) {
          target();
          return true;
        }
        return false;
      }}
      keys={
        <>
          <KeyHint keys={["←", "→"]}>adjust</KeyHint>
          <KeyHint keys={["PgUp", "PgDn"]}>by ten</KeyHint>
          {plays ? <KeyHint keys={["P"]}>play yours</KeyHint> : null}
          {target ? <KeyHint keys={["T"]}>hear the target</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div className="flex max-w-[32rem] flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={clsx("text-lg font-semibold tabular-nums", value === null && "text-text-3")}>
            {value === null ? "Move the slider" : sliderText(value, fmt)}
          </span>
          <span className="relative min-h-6 text-sm">
            {mark ? (
              <span className={mark.ok ? "text-accent" : "text-issue"}>
                {mark.note ?? (mark.ok ? "close enough" : "not this")}
              </span>
            ) : null}
          </span>
        </div>
        <div className="relative">
          <input
            ref={ref}
            type="range"
            aria-label={p.label}
            aria-valuetext={`${sliderText(value, fmt)}${meaning ? `, ${meaning}` : ""}`}
            min={log ? 0 : spec.min}
            max={log ? LOG_STEPS : spec.max}
            step={log ? 1 : spec.step}
            value={log ? Math.round(toLog(shown, spec.min, spec.max) * LOG_STEPS) : shown}
            disabled={disabled}
            onChange={(e) => onChange(fromPos(Number(e.target.value)))}
            onPointerUp={() => {
              if (plays && value !== null) play(value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "PageUp" && e.key !== "PageDown") return;
              e.preventDefault();
              const dir = e.key === "PageUp" ? 1 : -1;
              if (log)
                onChange(fromPos(Math.round(toLog(shown, spec.min, spec.max) * LOG_STEPS) + dir * 100));
              else onChange(snapToStep(shown + spec.step * 10 * dir, spec.min, spec.max, spec.step));
            }}
            className={clsx("h-6 w-full accent-[var(--oak-accent)]", value === null && "opacity-60")}
          />
          {correct !== null ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 h-6 w-0.5 bg-accent-2"
              style={{ left: `calc(${pct(correct)}% - 1px)` }}
            />
          ) : null}
        </div>
        <div className="relative h-5 text-[0.75rem] text-text-3">
          <span className="absolute left-0">{sliderText(spec.min, fmt)}</span>
          {(spec.marks ?? []).map((m) => (
            <span
              key={m.at}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${pct(m.at)}%` }}
            >
              {m.label}
            </span>
          ))}
          <span className="absolute right-0">{sliderText(spec.max, fmt)}</span>
        </div>
        {spec.play ? (
          <div className="mt-1 flex min-h-9 flex-wrap items-center gap-2 text-sm text-text-2">
            {plays ? (
              <Button
                size="sm"
                variant="ghost"
                data-enter="native"
                icon={<Play aria-hidden className="size-4" />}
                onClick={() => play(shown)}
              >
                Play yours
              </Button>
            ) : null}
            {target ? (
              <Button
                size="sm"
                variant="ghost"
                data-enter="native"
                icon={<Play aria-hidden className="size-4" />}
                onClick={target}
              >
                Hear the target
              </Button>
            ) : null}
            <span data-testid="slider-meaning" aria-hidden>
              {meaning ?? ""}
            </span>
          </div>
        ) : null}
        <p className="min-h-6 text-sm text-text-2">
          {correct !== null ? (
            <>
              Answer:{" "}
              <span className="rounded-control border-2 border-dashed border-accent-2 px-1.5 font-semibold text-text">
                {sliderText(correct, fmt)}
              </span>
              {sliderMeaning(spec, correct, bpm) ? <span> ({sliderMeaning(spec, correct, bpm)})</span> : null}
            </>
          ) : null}
        </p>
      </div>
    </AnswerFrame>
  );
}

export function HumAnswer(p: AnswerWidgetProps<"hum">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const seconds = env.hum?.seconds ?? Math.max(2, spec.bars * 2);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const done = value.length > 0;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (p.autoFocus) btn.current?.focus();
  }, [p.autoFocus]);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const t = (performance.now() - startedAt) / 1000;
      setNow(t);
      if (t >= seconds) {
        clearInterval(id);
        setStartedAt(null);
        // Completion only: hum predictions are never graded against a key (contracts §5.4 `PredictEx`).
        onChange([{ midi: null, cents: null, credit: 1 }]);
      }
    }, 100);
    return () => clearInterval(id);
  }, [startedAt, seconds, onChange]);
  const start = () => {
    if (disabled) return;
    env.hum?.play?.();
    setNow(0);
    setStartedAt(performance.now());
  };
  // The host's "Try again" (docs/design/retry.md §2.5): a new hum starts at once.
  const retakes = useRef(p.retake ?? 0);
  useEffect(() => {
    const n = p.retake ?? 0;
    if (n <= retakes.current) return;
    retakes.current = n;
    if (startedAt === null) start();
  }, [p.retake]);
  const humming = startedAt !== null;
  // The hum's own Try again before a verdict: Alt+R as the button, the same key as the host's row after one.
  useTakeRetryKey(done && !humming && p.locked !== true && !disabled, start);
  const left = Math.max(0, Math.ceil(seconds - now));
  return (
    <AnswerFrame
      kind="hum"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      keys={<KeyHint keys={["Enter"]}>{done ? "continue" : "on the button: start"}</KeyHint>}
    >
      <div className="flex max-w-[32rem] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {p.locked === true && done && !humming ? null : (
            <Button
              ref={btn}
              data-enter="native"
              {...(done && !humming ? TAKE_RETRY_PROPS : {})}
              {...(done && !humming ? { icon: <RotateCcw aria-hidden className="size-4" /> } : {})}
              variant={done ? "secondary" : "primary"}
              onClick={start}
              disabled={humming || disabled}
            >
              {humming ? "Humming…" : done ? <TakeRetryLabel /> : "Hum it"}
            </Button>
          )}
          <span className="text-sm text-text-2" aria-live="polite">
            {humming
              ? `Hum what you expect to hear. ${left} s`
              : done
                ? "Now run the code and compare."
                : `Read the code, then hum ${spec.bars === 1 ? "the bar" : `the ${spec.bars} bars`} you expect. Nothing is recorded.`}
          </span>
        </div>
        <Progress
          value={humming ? Math.min(1, now / seconds) : done ? 1 : 0}
          label="Hum time"
          tone={done ? "accent" : "amber"}
        />
      </div>
    </AnswerFrame>
  );
}
