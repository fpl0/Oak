// FineSlider (Wave 4): a slider with fine keyboard steps, for playback rate, fine-tune and other values the learner
// sets by ear. Arrows move one step, Alt+arrows the fine step, Shift+arrows and PageUp/PageDown the coarse step,
// Home/End the ends. Pointer drag snaps to `step` (Alt held: the fine step). With `defaultValue` a Reset button
// appears once the value moved. `origin` draws the fill from a centre (0 st, 0¢) instead of the left end.
import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from "react";
import { IconButton } from "./Button.tsx";
import { type SliderSteps, sliderFraction, sliderKeyValue, sliderPointerValue } from "./model.ts";

export interface FineSliderProps extends SliderSteps {
  /** Accessible name ("Playback rate"). A visible label goes beside it (`showLabel`). */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
  /** The value as words and as the visible readout ("75 %", "+15¢"). */
  format?: (v: number) => string;
  /** Draws the fill from this value (a centre) instead of `min`. */
  origin?: number;
  /** Shows a Reset button once the value differs from it. */
  defaultValue?: number;
  /** Tick marks under the track, e.g. [0.5, 0.75, 1]. */
  marks?: readonly number[];
  /** Shows `label` as text before the track. */
  showLabel?: boolean;
  /** The key that also moves it, for the hint after the readout ("," / "."). */
  keyHint?: ReactNode;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
  /** Track width; the default fills the row up to 14 rem. */
  width?: string;
  "data-testid"?: string;
}

export function FineSlider({
  label,
  value,
  min,
  max,
  step,
  fine,
  coarse,
  onChange,
  format,
  origin,
  defaultValue,
  marks,
  showLabel = false,
  keyHint,
  disabled = false,
  describedBy,
  className,
  width = "min(14rem, 100%)",
  "data-testid": testId,
}: FineSliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const text = format ? format(value) : String(value);
  const at = sliderFraction(value, min, max);
  const from = sliderFraction(origin ?? min, min, max);
  const lo = Math.min(at, from);
  const hi = Math.max(at, from);

  const set = (v: number) => {
    if (!disabled && v !== value) onChange(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = sliderKeyValue(e, value, min, max, { step, fine, coarse });
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(next);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    set(sliderPointerValue((e.clientX - r.left) / r.width, min, max, e.altKey ? (fine ?? step) : step));
  };

  return (
    <div
      className={clsx("flex min-w-0 items-center gap-3", disabled && "opacity-50", className)}
      data-testid={testId}
    >
      {showLabel && <span className="shrink-0 text-sm text-text-2">{label}</span>}
      <div
        ref={track}
        className={clsx("relative h-7 min-w-24 touch-none", disabled ? "cursor-default" : "cursor-pointer")}
        style={{ width }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
          thumb.current?.focus();
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full border border-border bg-surface-2"
        />
        <div
          aria-hidden
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
        />
        {marks?.map((m) => (
          <span
            key={m}
            aria-hidden
            className="absolute bottom-0 h-1.5 w-px -translate-x-1/2 bg-text-3"
            style={{ left: `${sliderFraction(m, min, max) * 100}%` }}
          />
        ))}
        <div
          ref={thumb}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          aria-describedby={describedBy}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 size-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow-card"
          style={{ left: `${at * 100}%` }}
        />
      </div>
      <output aria-hidden className="min-w-12 shrink-0 text-sm text-text tabular-nums">
        {text}
      </output>
      {keyHint}
      {defaultValue !== undefined && (
        <IconButton
          size="sm"
          label={`Reset ${label.toLowerCase()} to ${format ? format(defaultValue) : defaultValue}`}
          icon={<RotateCcw aria-hidden className="size-3.5" />}
          disabled={disabled || value === defaultValue}
          className={clsx(value === defaultValue && "invisible")}
          onClick={() => set(defaultValue)}
        />
      )}
    </div>
  );
}
