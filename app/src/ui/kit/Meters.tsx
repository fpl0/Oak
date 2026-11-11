// Value displays of the kit (Wave 2): ProgressRing, Meter and the mic level meter shell. Presentational and
// themed by --oak-* tokens; values come in as props (the mic meter is fed by whoever owns the mic graph).
import { clsx } from "clsx";
import type { ReactNode } from "react";

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * A circular progress ring ("2 of 3 sessions", a unit's lessons). `value` of `max`; the centre shows `children`
 * or the count. `role="progressbar"` with the label.
 */
export function ProgressRing({
  value,
  max = 1,
  size = 48,
  stroke = 4,
  label,
  tone = "accent",
  children,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label: string;
  tone?: "accent" | "amber";
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = max <= 0 ? 0 : clamp01(value / max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={clsx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          className={clsx(
            "transition-[stroke-dashoffset] duration-300 reduced:transition-none",
            tone === "accent" ? "stroke-accent" : "stroke-accent-2",
          )}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-medium tabular-nums">
        {children ?? `${value}/${max}`}
      </span>
    </div>
  );
}

export type MeterTone = "accent" | "amber" | "neutral";

/**
 * A labelled horizontal meter for a measured quantity (strength, recall, a calibration result): `role="meter"`,
 * the value as text next to the bar, never colour alone. `ticks` draws reference marks (e.g. a pass line at 0.85).
 */
export function Meter({
  value,
  min = 0,
  max = 1,
  label,
  valueText,
  tone = "accent",
  ticks = [],
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  /** What a screen reader and the visible caption say ("85%", "±35¢"). */
  valueText: string;
  tone?: MeterTone;
  ticks?: { at: number; label: string }[];
  className?: string;
}) {
  const span = max - min;
  const pos = (x: number) => (span <= 0 ? 0 : clamp01((x - min) / span) * 100);
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-text-2">{label}</span>
        <span className="font-medium tabular-nums">{valueText}</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot draw the reference ticks or the theme's track. */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-300 reduced:transition-none",
            tone === "accent" && "bg-accent",
            tone === "amber" && "bg-accent-2",
            tone === "neutral" && "bg-text-3",
          )}
          style={{ width: `${pos(value)}%` }}
        />
        {ticks.map((t) => (
          <span
            key={t.label}
            title={t.label}
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-text"
            style={{ left: `calc(${pos(t.at)}% - 1px)` }}
          />
        ))}
      </div>
    </div>
  );
}

/** dBFS to the meter's 0–1 scale: −60 dB (or quieter) is empty, 0 dB is full. */
export function dbToLevel(db: number, floorDb = -60): number {
  if (!Number.isFinite(db)) return 0;
  return clamp01((db - floorDb) / -floorDb);
}

/**
 * The mic level meter shell (onboarding `mic.noise`, Settings → Voice, sing steps): `segments` blocks lit up to
 * `level`, the noise floor marked, clipping called out in words. It draws only what it is given; the mic
 * graph (`app/src/lib/mic.ts`) owns the stream and calls it with fresh levels (≈ 30 per second is plenty).
 */
export function MicLevelMeter({
  level,
  floor,
  clipping = false,
  live,
  label = "Microphone level",
  segments = 24,
  className,
}: {
  /** 0–1 (use `dbToLevel`). */
  level: number;
  /** The measured noise floor on the same 0–1 scale, if known. */
  floor?: number | null;
  clipping?: boolean;
  /** False when no stream is open: the meter shows "Mic off" instead of an empty bar. */
  live: boolean;
  label?: string;
  segments?: number;
  className?: string;
}) {
  const lit = live ? Math.round(clamp01(level) * segments) : 0;
  const floorPct = floor === null || floor === undefined ? null : clamp01(floor) * 100;
  const pct = Math.round(clamp01(level) * 100);
  const text = !live ? "Mic off" : clipping ? "Too loud" : `${pct}%`;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-text-2">
          <span
            aria-hidden
            className={clsx("inline-block size-2 rounded-full", live ? "bg-mic" : "border border-text-3")}
          />
          {label}
        </span>
        <span className={clsx("font-medium tabular-nums", clipping && live && "text-issue")}>{text}</span>
      </div>
      <div className="relative pb-2">
        {/* biome-ignore lint/a11y/useSemanticElements: a segmented level display; a native <meter> is one bar. */}
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={live ? pct : 0}
          aria-valuetext={text}
          className="flex h-4 items-stretch gap-0.5"
        >
          {Array.from({ length: segments }, (_, i) => {
            const on = i < lit;
            const hot = i >= segments - Math.max(2, Math.round(segments / 8));
            return (
              <span
                key={i}
                aria-hidden
                className={clsx(
                  "flex-1 rounded-[2px]",
                  on ? (hot ? "bg-issue" : "bg-accent") : "bg-surface-2",
                )}
              />
            );
          })}
        </div>
        {floorPct !== null && live && (
          <span
            aria-hidden
            title="Noise floor"
            className="absolute bottom-0 h-1.5 w-0.5 rounded-full bg-text-2"
            style={{ left: `calc(${floorPct}% - 1px)` }}
          />
        )}
      </div>
      {floorPct !== null && live && (
        <span className="text-sm text-text-3">The mark under the bar is the room's noise floor.</span>
      )}
    </div>
  );
}
