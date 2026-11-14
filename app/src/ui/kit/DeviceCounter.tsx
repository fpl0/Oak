// DeviceCounter (Wave 6): named things a piece may hold, each found or still open, with the count beside the
// heading — CF-A's six devices ("3 of 6 · 4 needed"), C7's three colours, the roles of a full arrangement. Every row
// says its state in words and with an icon (never colour alone): a found row says where ("In this song: bars 11 and
// 27"), an open row says "Not yet" and never reads as a failure (the open tone is quiet, not the issue tone: a
// device the song does not use is not a mistake). A row may carry a detail line (the one-sentence definition) and an
// action (play those bars). The counter draws and reports only; the owner finds the devices (the grader's
// `detectDevices`) and words where they are (`barsListText` helps).
import { clsx } from "clsx";
import { Circle, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { deviceCount } from "./model-w6.ts";

export interface DeviceItem {
  id: string;
  /** "Secondary dominant". */
  name: ReactNode;
  found: boolean;
  /** Where it was found ("In this song: bars 11 and 27"); default "Found". */
  where?: ReactNode;
  /** What an open row says; default "Not yet". */
  openText?: ReactNode;
  /** A line under the name: the definition, or where it was taught. */
  detail?: ReactNode;
  /** A control at the end of the row (play those bars, open the lesson). */
  action?: ReactNode;
}

export interface DeviceCounterProps {
  /** The heading and the list's accessible name ("Devices in this song"). */
  label: string;
  items: readonly DeviceItem[];
  /** How many the rule asks for (CF-A: 4). Absent: the counter only counts. */
  need?: number | null;
  /** A line under the heading ("One musical event counts for one device."). */
  note?: ReactNode;
  /** Replaces the count's text ("next session" before the rule is live). */
  countText?: string;
  /** Rows without their detail lines and with less air (beside a checklist). */
  dense?: boolean;
  /** Heading level of the label (3). `null`: no visible heading (the owner prints its own). */
  headingLevel?: 2 | 3 | 4 | null;
  className?: string;
  "data-testid"?: string;
}

export function DeviceCounter({
  label,
  items,
  need = null,
  note,
  countText,
  dense = false,
  headingLevel = 3,
  className,
  "data-testid": testId,
}: DeviceCounterProps) {
  const c = deviceCount(items, need);
  const H = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  return (
    <section
      aria-label={label}
      className={clsx("flex min-w-0 flex-col gap-2", className)}
      data-testid={testId}
      data-device-counter
      data-found={c.found}
      data-met={c.met}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {headingLevel !== null && <H className="min-w-0 font-sans text-base font-semibold">{label}</H>}
        <p
          className={clsx(
            "ml-auto text-sm font-medium tabular-nums",
            c.need !== null && c.met ? "text-accent" : "text-text-2",
          )}
          aria-live="polite"
          data-testid="device-count"
        >
          {countText ?? (
            <>
              {c.found} of {c.total}
              <span className="sr-only"> found</span>
              {c.need !== null &&
                (c.met ? <span className="sr-only">, enough for the rule</span> : ` · ${c.need} needed`)}
            </>
          )}
        </p>
      </div>
      {/* One pip per item, the need marked: the count at a glance. Decorative: the words above say it. */}
      {items.length > 0 && (
        <div aria-hidden className="flex items-center gap-1" data-testid="device-pips">
          {items.map((it, i) => (
            <span key={it.id} className="flex items-center gap-1">
              <span
                className={clsx(
                  "block h-1.5 w-6 rounded-full",
                  i < c.found ? "bg-accent" : "border border-control-border bg-surface-2",
                )}
              />
              {c.need !== null && i + 1 === c.need && i + 1 < items.length && (
                <span className="block h-3 w-0.5 rounded-full bg-text-2" title={`${c.need} needed`} />
              )}
            </span>
          ))}
        </div>
      )}
      {note && <p className="text-sm text-text-2">{note}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-text-2">Nothing to count yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((it) => (
            <li
              key={it.id}
              data-device={it.id}
              data-state={it.found ? "found" : "open"}
              className={clsx("flex items-start gap-3", dense ? "py-1.5" : "py-2.5")}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                {it.found ? (
                  <CircleCheck aria-hidden className="size-4.5 text-accent" />
                ) : (
                  <Circle aria-hidden className="size-4.5 text-text-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="min-w-0">
                  <span className="font-medium">{it.name}</span>
                  <span className={clsx("ml-2 text-sm", it.found ? "text-text" : "text-text-2")}>
                    <span className="sr-only">: </span>
                    {it.found ? (it.where ?? "Found") : (it.openText ?? "Not yet")}
                  </span>
                </p>
                {it.detail && !dense && <div className="mt-0.5 text-sm text-text-2">{it.detail}</div>}
              </div>
              {it.action && <div className="shrink-0">{it.action}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
