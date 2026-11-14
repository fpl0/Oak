// LoudnessReadout (Wave 6): a calm meter with numbers, for CF-A's Master step and anywhere a piece's level is read —
// the loudest moment before the limiter on a dB scale with the limiter's threshold marked, how much the limiter
// took off, and what that means in words ("Resting", "Catching the loudest hits", "Working most of the time").
// Calm on purpose: no red zone and no flashing; a peak over the threshold turns the bar's last stretch amber and the
// words say what happened. The bars move at most as fast as their owner feeds them; under reduced motion they jump
// without a transition. It draws only what it is given: the owner measures (`createMasterMeter` of
// @oak/audio/master-meter: `MeterLive` while it plays, `MasterReading` afterwards) and may pass its own sentences as
// `lines`. `dbText` prints levels exactly as `levelText` there does.
import { clsx } from "clsx";
import type { ReactNode } from "react";
import {
  dbFraction,
  dbText,
  LIMITER_WORDS,
  type LimiterActivity,
  loudnessSentence,
  reductionText,
} from "./model-w6.ts";

export type { LimiterActivity };

export interface LoudnessReadoutProps {
  /** Accessible name of the read-out ("Loudness of the last chorus"). */
  label: string;
  /** The loudest sample before the limiter, dBFS; `null` or −∞ before anything was measured. */
  peakDb: number | null;
  /** The average level (after the limiter), dBFS; shown as a second number when given. */
  levelDb?: number | null;
  /** What the limiter took off, dB (0: nothing). */
  reductionDb?: number | null;
  /** What the limiter did over the stretch; `null` while unknown (live, before a summary). */
  limiter?: LimiterActivity | null;
  /** The limiter's threshold, marked on the scale (−3 dB: @oak/strudel's master bus). */
  thresholdDb?: number;
  /** The quietest level the scale shows (−48 dB). */
  floorDb?: number;
  /** The reduction that fills the limiter's bar (12 dB). */
  maxReductionDb?: number;
  /** True while the owner is measuring: the numbers are the newest block's, and the read-out says so. */
  live?: boolean;
  /** Sentences under the meter (the owner's summary); default: one sentence from the numbers. */
  lines?: readonly string[];
  /** Shown instead of the bars before anything was measured. */
  empty?: string;
  /** A control beside the heading (Measure, Stop). */
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

const SCALE_TICKS = [-48, -36, -24, -12, 0];

export function LoudnessReadout({
  label,
  peakDb,
  levelDb,
  reductionDb = null,
  limiter = null,
  thresholdDb = -3,
  floorDb = -48,
  maxReductionDb = 12,
  live = false,
  lines,
  empty = "Nothing measured yet. Play the loudest section and measure while it plays.",
  action,
  className,
  "data-testid": testId,
}: LoudnessReadoutProps) {
  const measured = peakDb !== null && Number.isFinite(peakDb);
  const fill = dbFraction(peakDb, floorDb, 0);
  const mark = dbFraction(thresholdDb, floorDb, 0);
  const over = measured && (peakDb as number) > thresholdDb;
  const red = reductionDb !== null && Number.isFinite(reductionDb) ? Math.max(0, reductionDb) : 0;
  const redFill = maxReductionDb > 0 ? Math.min(1, red / maxReductionDb) : 0;
  const working = red > 1 || limiter === "touching" || limiter === "working";
  const sentence = loudnessSentence({ peakDb, reductionDb, limiter });
  const ticks = SCALE_TICKS.filter((t) => t >= floorDb);
  return (
    <section
      aria-label={label}
      className={clsx("flex min-w-0 flex-col gap-3", className)}
      data-testid={testId}
      data-loudness={!measured ? "empty" : live ? "live" : "read"}
      data-limiter={limiter ?? undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium">
          {label}
          {live && (
            <span className="ml-2 font-normal text-text-2" data-testid="loudness-live">
              measuring
            </span>
          )}
        </p>
        {action}
      </div>
      {!measured ? (
        <p className="text-sm text-text-2" data-testid="loudness-empty">
          {empty}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-1">
            <span className="text-sm text-text-2">Loudest moment, before the limiter</span>
            <span
              className="row-span-2 self-center font-display text-h2 leading-none font-semibold tabular-nums"
              data-testid="loudness-peak"
            >
              {dbText(peakDb)}
            </span>
            <div className="relative pb-4">
              {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot draw the threshold mark or the theme's track. */}
              <div
                role="meter"
                aria-label="Loudest moment before the limiter"
                aria-valuemin={floorDb}
                aria-valuemax={0}
                aria-valuenow={Math.max(floorDb, Math.min(0, Math.round((peakDb as number) * 10) / 10))}
                aria-valuetext={sentence}
                className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150 reduced:transition-none"
                  style={{ width: `${Math.min(fill, mark) * 100}%` }}
                />
                {over && (
                  <div
                    className="absolute inset-y-0 bg-accent-2 transition-[width] duration-150 reduced:transition-none"
                    style={{ left: `${mark * 100}%`, width: `${(fill - mark) * 100}%` }}
                    data-testid="loudness-over"
                  />
                )}
              </div>
              <span
                aria-hidden
                className="absolute top-0 h-2.5 w-0.5 bg-text"
                style={{ left: `calc(${mark * 100}% - 1px)` }}
                title={`The limiter starts at ${dbText(thresholdDb)}`}
              />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-3.5 text-[0.6875rem] text-text-3">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className={clsx(
                      "absolute tabular-nums",
                      t === 0 ? "right-0" : t === floorDb ? "left-0" : "-translate-x-1/2",
                    )}
                    style={
                      t === 0 || t === floorDb ? undefined : { left: `${dbFraction(t, floorDb, 0) * 100}%` }
                    }
                  >
                    {t === 0 ? "0 dB" : t.toString().replace("-", "−")}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
            <span className="text-sm text-text-2">
              The limiter took off
              {limiter && (
                <span
                  className={clsx("ml-2 font-medium", working ? "text-text" : "text-accent")}
                  data-testid="loudness-limiter"
                >
                  {LIMITER_WORDS[limiter]}
                </span>
              )}
            </span>
            <span className="row-span-2 font-medium tabular-nums" data-testid="loudness-reduction">
              {reductionText(reductionDb ?? 0)}
            </span>
            {/* biome-ignore lint/a11y/useSemanticElements: a themed bar with the same track as the meter above. */}
            <div
              role="meter"
              aria-label="Gain the limiter took off"
              aria-valuemin={0}
              aria-valuemax={maxReductionDb}
              aria-valuenow={Math.min(maxReductionDb, Math.round(red * 10) / 10)}
              aria-valuetext={
                limiter
                  ? `${reductionText(red)}, ${LIMITER_WORDS[limiter].toLowerCase()}`
                  : reductionText(red)
              }
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={clsx(
                  "h-full rounded-full transition-[width] duration-150 reduced:transition-none",
                  working ? "bg-accent-2" : "bg-text-3",
                )}
                style={{ width: `${redFill * 100}%` }}
              />
            </div>
          </div>
          {levelDb !== undefined && levelDb !== null && (
            <p className="text-sm text-text-2">
              Average level{" "}
              <span className="font-medium text-text tabular-nums" data-testid="loudness-level">
                {dbText(levelDb)}
              </span>
            </p>
          )}
          {!live && (
            <div className="flex flex-col gap-0.5 text-sm" data-testid="loudness-lines" aria-live="polite">
              {(lines ?? [sentence]).map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
