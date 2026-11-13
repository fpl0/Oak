// Input controls of the kit (Wave 2): SegmentedControl (a radio group with roving focus), Stepper (a number with
// − and +) and Callout (a non-modal notice with an optional action). Keyboard-first, themed by --oak-* tokens.
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Info, Minus, Plus, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * One choice among a few (15 / 20 / 25 minutes, Tree / Course / Leaves). `role="radiogroup"`; arrows move and
 * select, Home/End jump; only the selected segment is in the tab order.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  label: string;
  value: V;
  options: readonly SegmentOption<V>[];
  onChange(v: V): void;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (from: number, delta: number | "first" | "last") => {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(from);
    const nextIdx =
      delta === "first"
        ? 0
        : delta === "last"
          ? enabled.length - 1
          : (Math.max(0, at) + delta + enabled.length) % enabled.length;
    const i = enabled[nextIdx] as number;
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    refs.current[i]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") move(i, 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(i, -1);
    else if (e.key === "Home") move(i, "first");
    else if (e.key === "End") move(i, "last");
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-control border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: segmented buttons with roving focus; radio inputs cannot be styled as segments without hiding them.
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            disabled={o.disabled}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium",
              "transition-colors duration-150 disabled:opacity-50",
              size === "sm" ? "h-6 px-2 text-sm" : "h-7 px-3 text-sm",
              on ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A small number with − and + (weekly goal 3–7, a tempo nudge). The value is a native number input, so arrows,
 * typing and screen readers work; the buttons are extra, not the only way in.
 */
export function Stepper({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  describedBy,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
  /** Visible unit after the number ("days", "BPM"). */
  format?: (v: number) => string;
  describedBy?: string;
  disabled?: boolean;
}) {
  const clampTo = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const btn =
    "inline-flex size-8 items-center justify-center border-control-border bg-control text-text-2 hover:bg-control-hover hover:text-text disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-stretch overflow-hidden rounded-control border border-control-border">
        <button
          type="button"
          className={clsx(btn, "border-r")}
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clampTo(value - step))}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          aria-label={label}
          aria-describedby={describedBy}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) onChange(clampTo(n));
          }}
          className="w-12 bg-control text-center tabular-nums text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          className={clsx(btn, "border-l")}
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clampTo(value + step))}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      {format && <span className="text-sm text-text-2">{format(value)}</span>}
    </div>
  );
}

export type CalloutTone = "info" | "success" | "attention" | "issue";
const CALLOUT: Record<CalloutTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-border bg-surface", icon: <Info aria-hidden className="size-4 text-text-2" /> },
  success: {
    box: "border-accent/40 bg-lane-in",
    icon: <CircleCheck aria-hidden className="size-4 text-accent" />,
  },
  attention: {
    box: "border-accent-2/50 bg-accent-2/10",
    icon: <Info aria-hidden className="size-4 text-accent-2" />,
  },
  issue: {
    box: "border-issue/40 bg-issue/10",
    icon: <CircleAlert aria-hidden className="size-4 text-issue" />,
  },
};

/**
 * A calm, non-modal notice in the page ("That's 20 minutes. Wrap up with a quick sketch?", "The tutor is off").
 * `role="status"` (polite), never `alert`, never red for streaks or time (ux §1.6). Actions are real buttons.
 */
export function Callout({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  className,
}: {
  tone?: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = CALLOUT[tone];
  return (
    <div role="status" className={clsx("flex items-start gap-3 rounded-card border p-3", t.box, className)}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-sm text-text-2">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
