// PartLevels (Wave 7): a labelled meter row per part — A2.L05 "Balance & Levels", the mix of AC2, the register and
// density views beside them. Each row: the part's name, a bar on a dB scale (−60 to 0 by default) with the brief's
// target band shaded when there is one, the level in numbers, and the row's words. A part more than 24 dB under
// the loudest one is marked "Not heard" with an icon and a hatched bar (the corrections pass, rule c: such a part
// does not count as heard), never by colour alone; a silent part says "silent". The owner measures (peak or RMS)
// and passes the levels; `live` while they update (no transitions under reduced motion).
import { clsx } from "clsx";
import { EarOff, Target } from "lucide-react";
import { Chip } from "./basics.tsx";
import { INAUDIBLE_BELOW_DB, type LevelPart, levelRows } from "./model-w7.ts";

export type { LevelPart };

export interface PartLevelsProps {
  /** Accessible name of the list ("Levels"). */
  label?: string;
  parts: readonly LevelPart[];
  floorDb?: number;
  ceilDb?: number;
  /** Updating as the piece plays. */
  live?: boolean;
  /** Shown when there are no parts ("Press Play to measure each part."). */
  empty?: string;
  className?: string;
  "data-testid"?: string;
}

export function PartLevels({
  label = "Levels",
  parts,
  floorDb = -60,
  ceilDb = 0,
  live = false,
  empty = "Press Play to measure each part.",
  className,
  "data-testid": testId,
}: PartLevelsProps) {
  const rows = levelRows(parts, { floorDb, ceilDb });
  const frac = (db: number) => Math.max(0, Math.min(1, (db - floorDb) / (ceilDb - floorDb)));
  if (rows.length === 0)
    return (
      <p className={clsx("text-sm text-text-3", className)} data-testid={testId}>
        {empty}
      </p>
    );
  return (
    <section
      aria-label={label}
      className={clsx("flex min-w-0 flex-col gap-1.5", className)}
      data-testid={testId}
    >
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid min-w-0 grid-cols-[7rem_minmax(6rem,1fr)_11rem] items-center gap-3"
            data-part={r.id}
            data-heard={r.heard || undefined}
          >
            <span className="truncate text-sm font-medium text-text">{r.label}</span>
            {/* biome-ignore lint/a11y/useSemanticElements: a <meter> cannot draw the target band or the hatch. */}
            <div
              role="meter"
              aria-label={r.label}
              aria-valuemin={floorDb}
              aria-valuemax={ceilDb}
              aria-valuenow={Number.isFinite(r.db) && r.db !== null ? Math.round(r.db * 10) / 10 : floorDb}
              aria-valuetext={r.sentence}
              className="relative h-3 min-w-0 overflow-hidden rounded-full border border-border bg-surface-2"
            >
              {r.target && (
                <span
                  aria-hidden
                  data-target
                  className="absolute inset-y-0 border-x-2 border-text-2/70 bg-text/10"
                  style={{
                    left: `${frac(r.target.low) * 100}%`,
                    width: `${Math.max(0, frac(r.target.high) - frac(r.target.low)) * 100}%`,
                  }}
                />
              )}
              <span
                aria-hidden
                className={clsx(
                  "absolute inset-y-0 left-0 rounded-full",
                  live ? "transition-[width] duration-100 reduced:transition-none" : "",
                  r.heard ? "bg-accent" : "oak-hatch bg-text-3/50",
                )}
                style={{ width: `${r.fraction * 100}%` }}
              />
            </div>
            <span className="flex min-w-0 items-center gap-1.5 text-sm tabular-nums">
              <span className={r.heard ? "text-text" : "text-text-2"}>{r.text}</span>
              {!r.heard && r.db !== null && Number.isFinite(r.db) && (
                <Chip tone="issue" className="h-5 px-1.5 text-[0.75rem]">
                  <EarOff aria-hidden className="size-3" />
                  Not heard
                </Chip>
              )}
              {r.inTarget === true && (
                <Chip tone="accent" className="h-5 px-1.5 text-[0.75rem]">
                  <Target aria-hidden className="size-3" />
                  In range
                </Chip>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[0.75rem] text-text-3">
        A part more than {INAUDIBLE_BELOW_DB} dB under the loudest part is not heard in the mix.
      </p>
    </section>
  );
}
