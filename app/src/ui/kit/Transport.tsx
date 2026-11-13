// Transport pieces (Wave 4): TransportBar (play, position, A–B loop, rate, pitch), Nudge (a − value + control for
// whole steps such as semitones) and AbSwitch (a segmented A/B switch: "Source · Mine · Both"). The bar only draws
// and reports; the owner of the audio (Transcribe, the album, a lesson's A/B) keeps the state and binds its keys.
import { clsx } from "clsx";
import { Minus, Pause, Play, Plus, Repeat } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { Kbd } from "./basics.tsx";
import { FineSlider } from "./FineSlider.tsx";
import { centsLabel, clockLabel, rateLabel, semitoneLabel } from "./model.ts";

// --- Nudge ----------------------------------------------------------------------------------------

export function Nudge({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  keys,
  disabled = false,
  "data-testid": testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
  format?: (v: number) => string;
  /** The keys that also move it, shown in the buttons' names ("-", "="). */
  keys?: readonly [down: string, up: string] | undefined;
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const text = format ? format(value) : String(value);
  const btn =
    "inline-flex size-8 items-center justify-center text-text-2 hover:bg-control-hover hover:text-text disabled:pointer-events-none disabled:opacity-40";
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of one value's controls; a fieldset would add a legend and a frame.
    <div
      role="group"
      aria-label={label}
      className={clsx("flex items-center gap-2", disabled && "opacity-50")}
      data-testid={testId}
    >
      <span className="text-sm text-text-2">{label}</span>
      <div className="inline-flex items-stretch overflow-hidden rounded-control border border-control-border bg-control">
        <button
          type="button"
          className={clsx(btn, "border-r border-control-border")}
          aria-label={`${label} down${keys ? ` (${keys[0]})` : ""}`}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <output
          aria-live="polite"
          className="flex min-w-14 items-center justify-center px-1 text-sm text-text tabular-nums"
        >
          {text}
        </output>
        <button
          type="button"
          className={clsx(btn, "border-l border-control-border")}
          aria-label={`${label} up${keys ? ` (${keys[1]})` : ""}`}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

// --- AbSwitch -------------------------------------------------------------------------------------

export interface AbOption<V extends string> {
  value: V;
  /** The badge: "A", "B", "A+B". */
  letter: string;
  /** What it plays: "Source", "Mine", "Both". */
  label: string;
  disabled?: boolean;
}

/**
 * Which side plays: a radio group of two or three segments, each with its letter badge. Arrows move and select,
 * Home/End jump; only the chosen segment is in the tab order. `keyHint` shows the page's key ("V").
 */
export function AbSwitch<V extends string>({
  label = "Compare",
  value,
  options,
  onChange,
  keyHint,
  disabled = false,
  className,
}: {
  label?: string;
  value: V;
  options: readonly AbOption<NoInfer<V>>[];
  onChange(v: NoInfer<V>): void;
  keyHint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.flatMap((o, i) => (o.disabled || disabled ? [] : [i]));
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const at = enabled.indexOf(i);
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(at + 1) % enabled.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled.at(-1);
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const o = options[next];
    if (o) onChange(o.value);
    refs.current[next]?.focus();
  };
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        className="inline-flex items-center gap-0.5 rounded-control border border-border bg-surface-2 p-0.5"
      >
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: segmented buttons with roving focus (as SegmentedControl).
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${o.letter}: ${o.label}`}
              data-side={o.value}
              disabled={disabled || o.disabled}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm font-medium",
                "transition-colors duration-150 disabled:opacity-50",
                on ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[0.75rem] font-semibold",
                  on ? "bg-accent text-on-accent" : "border border-border bg-surface text-text-2",
                )}
              >
                {o.letter}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      {keyHint && <Kbd>{keyHint}</Kbd>}
    </div>
  );
}

// --- TransportBar ---------------------------------------------------------------------------------

export interface TransportLoop {
  on: boolean;
  onToggle(): void;
  /** What the loop covers, in words ("bars 3–4", "0:12–0:20"); "not set" when there is none. */
  range?: string | null;
  key?: string;
  disabled?: boolean;
}

export interface TransportRate {
  value: number;
  onChange(v: number): void;
  /** Defaults: 25 % to 100 % (contracts §6.12), 5 % steps, 1 % with Alt, 25 % coarse. */
  min?: number;
  max?: number;
  step?: number;
  fine?: number;
  coarse?: number;
  /** "," / "." */
  keys?: readonly [down: string, up: string];
}

export interface TransportPitch {
  semitones: number;
  onSemitones(v: number): void;
  /** ±12 by default. */
  range?: number;
  keys?: readonly [down: string, up: string];
  /** Fine-tune in cents (±50 by default); omit to hide it. */
  cents?: number;
  onCents?(v: number): void;
  centsRange?: number;
}

export function TransportBar({
  label = "Transport",
  playing,
  onPlayToggle,
  playKey = "Space",
  position,
  duration,
  loop,
  rate,
  pitch,
  disabled = false,
  children,
  className,
}: {
  label?: string;
  playing: boolean;
  onPlayToggle(): void;
  playKey?: string;
  /** Seconds; with `duration` the readout shows "0:12 / 2:40". */
  position?: number;
  duration?: number;
  loop?: TransportLoop;
  rate?: TransportRate;
  pitch?: TransportPitch;
  disabled?: boolean;
  /** Extra controls at the end of the bar (an AbSwitch, a zoom). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the transport is a labelled group of controls, not a form section.
    <div
      role="group"
      aria-label={label}
      data-transport
      className={clsx(
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border bg-surface px-3 py-2 shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayToggle}
          disabled={disabled}
          aria-pressed={playing}
          aria-label={`${playing ? "Pause" : "Play"} (${playKey})`}
          data-testid="transport-play"
          className={clsx(
            "inline-flex size-10 items-center justify-center rounded-full border transition-colors duration-150",
            "disabled:pointer-events-none disabled:opacity-50",
            playing
              ? "border-accent bg-lane-in text-accent hover:bg-accent/15"
              : "border-transparent bg-accent text-on-accent hover:bg-accent-hover",
          )}
        >
          {playing ? (
            <Pause aria-hidden className="size-5" />
          ) : (
            <Play aria-hidden className="size-5 translate-x-px" />
          )}
        </button>
        {position !== undefined && (
          <span className="min-w-20 text-sm text-text-2 tabular-nums" data-testid="transport-clock">
            {clockLabel(position)}
            {duration !== undefined && <span className="text-text-3"> / {clockLabel(duration)}</span>}
          </span>
        )}
      </div>
      {loop && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loop.onToggle}
            disabled={disabled || loop.disabled}
            aria-pressed={loop.on}
            aria-label={`Loop${loop.range ? ` ${loop.range}` : ""}${loop.key ? ` (${loop.key})` : ""}`}
            data-testid="transport-loop"
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-sm font-medium transition-colors duration-150",
              "disabled:pointer-events-none disabled:opacity-50",
              loop.on
                ? "border-accent/50 bg-lane-in text-accent"
                : "border-control-border bg-control text-text-2 hover:bg-control-hover hover:text-text",
            )}
          >
            <Repeat aria-hidden className="size-4" />
            Loop
          </button>
          <span
            className={clsx("text-sm", disabled || loop.disabled ? "text-text-3" : "text-text-2")}
            aria-hidden
          >
            {loop.range ?? "not set"}
          </span>
          {loop.key && <Kbd>{loop.key}</Kbd>}
        </div>
      )}
      {rate && (
        <FineSlider
          label="Speed"
          showLabel
          value={rate.value}
          min={rate.min ?? 0.25}
          max={rate.max ?? 1}
          step={rate.step ?? 0.05}
          fine={rate.fine ?? 0.01}
          coarse={rate.coarse ?? 0.25}
          marks={[0.5, 0.75]}
          defaultValue={rate.max ?? 1}
          format={rateLabel}
          onChange={rate.onChange}
          disabled={disabled}
          width="9rem"
          keyHint={
            rate.keys ? (
              <span className="flex gap-0.5" aria-hidden>
                <Kbd>{rate.keys[0]}</Kbd>
                <Kbd>{rate.keys[1]}</Kbd>
              </span>
            ) : undefined
          }
          data-testid="transport-rate"
        />
      )}
      {pitch && (
        <div className="flex flex-wrap items-center gap-3">
          <Nudge
            label="Pitch"
            value={pitch.semitones}
            min={-(pitch.range ?? 12)}
            max={pitch.range ?? 12}
            onChange={pitch.onSemitones}
            format={semitoneLabel}
            keys={pitch.keys}
            disabled={disabled}
            data-testid="transport-pitch"
          />
          {pitch.cents !== undefined && pitch.onCents && (
            <FineSlider
              label="Fine-tune"
              showLabel
              value={pitch.cents}
              min={-(pitch.centsRange ?? 50)}
              max={pitch.centsRange ?? 50}
              step={5}
              fine={1}
              coarse={25}
              origin={0}
              defaultValue={0}
              marks={[0]}
              format={centsLabel}
              onChange={pitch.onCents}
              disabled={disabled}
              width="7rem"
              data-testid="transport-cents"
            />
          )}
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
