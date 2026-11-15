// The tap pad of a tap trial (ux §4.4): the response window as a timeline with its beats, the learner's taps
// as they land, and after the take the target onsets with each tap's offset. `Space` taps while the pad is
// armed (TapInput captures it); the on-screen pad takes pointer taps.
import type { MeterId, Trial } from "@oak/api";
import { METERS } from "@oak/theory";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "../ui/kit/basics.tsx";
import type { Stage } from "./machine.ts";
import { tapReport } from "./model.ts";
import { useLive } from "./runtime.ts";
import { countMarks } from "./wave6.ts";

export function TapPanel({
  trial,
  stage,
  done,
  taps,
}: {
  trial: Trial;
  stage: Stage;
  /** The take is over (feedback shows the targets). */
  done: boolean;
  /** The captured taps once the take is over. */
  taps: number[] | null;
}) {
  const live = useLive((s) => s.taps);
  const windowSec = useLive((s) => s.windowSec);
  const tapNow = useLive((s) => s.tapNow);
  const shown = done ? (taps ?? []) : live;
  const targets = (trial.params.tapTargets as number[] | undefined) ?? [];
  const span = Math.max(windowSec, (targets[targets.length - 1] ?? 0) + 0.4, 1);
  const meter = METERS[(trial.params.meter as MeterId | undefined) ?? "4/4"] ?? METERS["4/4"];
  const beatSec = 1 / trial.cps / meter.unitsPerBar;
  const beats = Array.from({ length: Math.floor(span / beatSec) + 1 }, (_, i) => i * beatSec);
  const report = done ? tapReport(taps ?? [], targets) : null;
  const armed = tapNow !== null;
  const x = (t: number) => `${Math.max(0, Math.min(100, (t / span) * 100))}%`;
  // Wave 6: where the beat divides in three (6/8, or triplets in 4/4) the count is written under the timeline.
  const counts = countMarks(trial, span);

  return (
    <div className="flex flex-col gap-3" data-keyscope="tap-pad">
      <div
        className="relative h-16 w-full overflow-hidden rounded-control border border-border bg-surface-2"
        role="img"
        aria-label={
          done
            ? `Your taps against the rhythm: ${report?.text ?? ""}`
            : `Tap timeline: ${live.length} ${live.length === 1 ? "tap" : "taps"} so far`
        }
        data-testid="tap-timeline"
      >
        {beats.map((b, i) => (
          <span
            key={b}
            aria-hidden
            className={clsx(
              "absolute top-0 h-full w-px",
              i % meter.unitsPerBar === 0 ? "bg-text-3/60" : "bg-border",
            )}
            style={{ left: x(b) }}
          />
        ))}
        {done &&
          targets.map((t) => (
            <span
              key={`t${t}`}
              aria-hidden
              className="absolute top-2 h-5 w-1.5 -translate-x-1/2 rounded-sm bg-accent/50"
              style={{ left: x(t) }}
            />
          ))}
        {shown.map((t, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute bottom-2 h-5 w-1 -translate-x-1/2 rounded-sm bg-text"
            style={{ left: x(t) }}
          />
        ))}
        <Playhead
          span={span}
          running={!done && (stage === "respond" || stage === "listen" || stage === "count-in")}
        />
      </div>
      {counts.length > 0 && (
        <div
          className="relative -mt-2 h-4 w-full text-[0.6875rem] leading-4"
          data-testid="tap-counts"
          role="img"
          aria-label={`The count: ${counts
            .slice(0, counts.findIndex((c, i) => i > 0 && c.beat && c.label === "1") || counts.length)
            .map((c) => c.label)
            .join(" ")}`}
        >
          {counts.map((c) => (
            <span
              key={c.at}
              aria-hidden
              className={clsx("absolute pl-0.5", c.beat ? "font-semibold text-text-2" : "text-text-3")}
              style={{ left: x(c.at) }}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!armed}
          onPointerDown={(e) => {
            if (e.button === 0) tapNow?.(e.timeStamp);
          }}
          className={clsx(
            "h-14 min-w-40 rounded-card border text-base font-medium transition-colors",
            armed
              ? "border-accent bg-lane-in text-text active:bg-accent active:text-on-accent"
              : "border-border bg-surface text-text-3",
          )}
          aria-label="Tap"
        >
          Tap{" "}
          <span className="ml-1 align-middle">
            <Kbd>Space</Kbd>
          </span>
        </button>
        <p className="text-sm text-text-2" aria-live="polite">
          {done
            ? report?.text
            : armed
              ? `${live.length} ${live.length === 1 ? "tap" : "taps"}`
              : "The pad wakes when the trial starts."}
        </p>
      </div>
      {done && (
        <p className="text-sm text-text-3">Upper marks are the hits to match; lower marks are your taps.</p>
      )}
    </div>
  );
}

/** A thin line moving across the window while it is open (it moves under reduced motion too, ux §7.6). */
export function Playhead({ span, running }: { span: number; running: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!running) {
      setVisible(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      const { clock, windowStart } = useLive.getState();
      if (clock && windowStart !== null && ref.current) {
        const t = clock() - windowStart;
        setVisible(t >= 0);
        ref.current.style.left = `${Math.max(0, Math.min(100, (t / span) * 100))}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, span]);
  return (
    <span
      ref={ref}
      aria-hidden
      className={clsx("absolute top-0 h-full w-0.5 bg-accent", visible ? "opacity-100" : "opacity-0")}
    />
  );
}
