// ControlReadout (Wave 5): one sound control as a labelled value with a slider and fine keyboard steps, no knob —
// for the A1 sound lessons (cutoff, resonance, attack, release, delay time, feedback) and anywhere a value is set
// by ear. The value is printed large with its unit ("800 Hz"), the method it sets is named in code (`.lpf()`), and
// the slider runs on the control's own scale: log for frequencies (a step is a fraction of an octave), linear
// otherwise. Arrows move a step, Alt+arrows the fine step, Shift+arrows and PageUp/PageDown the coarse step,
// Home/End the ends. `role="slider"` carries the real value (aria-valuenow) and its words (aria-valuetext).
import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useId, useRef } from "react";
import { IconButton } from "./Button.tsx";
import {
  axisFraction,
  type ControlSpec,
  controlKeyValue,
  controlPointerValue,
  unitLabel,
} from "./model-w5.ts";

export type { ControlSpec };

export interface ControlReadoutProps extends ControlSpec {
  /** "Cutoff": the accessible name and the visible label. */
  label: string;
  /** The method it sets, as written in code ("lpf"): shown as `.lpf()`. */
  code?: string;
  value: number;
  onChange(v: number): void;
  /** "Hz", "s", "ms", "dB", "%" or "" (see `unitLabel`). */
  unit?: string;
  /** Overrides the printed value. */
  format?: (v: number) => string;
  /** Shows a Reset once the value moved from it (Strudel's default for the control). */
  defaultValue?: number;
  /** A line under the slider ("Lower lets less of the top through."). */
  help?: ReactNode;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ControlReadout({
  label,
  code,
  value,
  onChange,
  unit = "",
  format,
  defaultValue,
  help,
  disabled = false,
  className,
  min,
  max,
  scale,
  step,
  fine,
  coarse,
  "data-testid": testId,
}: ControlReadoutProps) {
  const spec: ControlSpec = {
    min,
    max,
    scale,
    ...(step === undefined ? {} : { step }),
    ...(fine === undefined ? {} : { fine }),
    ...(coarse === undefined ? {} : { coarse }),
  };
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const helpId = useId();
  const show = (v: number) => (format ? format(v) : unitLabel(v, unit));
  const text = show(value);
  const at = axisFraction(value, spec);

  const set = (v: number) => {
    if (!disabled && v !== value) onChange(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = controlKeyValue(e, value, spec);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(next);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    set(controlPointerValue((e.clientX - r.left) / r.width, spec));
  };

  return (
    <div
      className={clsx(
        "flex min-w-0 flex-col gap-2 rounded-control border border-border bg-surface px-3 py-2.5",
        disabled && "opacity-50",
        className,
      )}
      data-testid={testId}
      data-control={code}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span id={labelId} className="truncate text-sm font-medium text-text">
            {label}
          </span>
          {code && <code className="shrink-0 font-mono text-[0.75rem] text-text-2">.{code}()</code>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <output
            aria-hidden
            className="font-display text-h3 font-semibold text-text tabular-nums"
            data-testid="control-value"
          >
            {text}
          </output>
          {defaultValue !== undefined && (
            <IconButton
              size="sm"
              label={`Reset ${label.toLowerCase()} to ${show(defaultValue)}`}
              icon={<RotateCcw aria-hidden className="size-3.5" />}
              disabled={disabled || value === defaultValue}
              className={clsx(value === defaultValue && "invisible")}
              onClick={() => set(defaultValue)}
            />
          )}
        </span>
      </div>
      <div
        ref={track}
        className={clsx("relative h-6 touch-none", disabled ? "cursor-default" : "cursor-pointer")}
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
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${at * 100}%` }}
        />
        <div
          ref={thumb}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          aria-describedby={help ? helpId : undefined}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 size-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow-card"
          style={{ left: `${at * 100}%` }}
        />
      </div>
      <div aria-hidden className="flex justify-between text-[0.6875rem] text-text-3 tabular-nums">
        <span>{show(min)}</span>
        {scale === "log" && step === undefined && <span>arrows: a half step · Shift: an octave</span>}
        <span>{show(max)}</span>
      </div>
      {help && (
        <p id={helpId} className="text-[0.75rem] text-text-2">
          {help}
        </p>
      )}
    </div>
  );
}
