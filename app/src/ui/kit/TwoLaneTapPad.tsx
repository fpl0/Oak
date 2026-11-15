// TwoLaneTapPad (Wave 7): two lanes, one hand each — R2.L04's 3 against 2, the clave against the pulse, stage H's
// polyrhythm trials. F taps the first lane and J the second (as the answers' tap pad), a press on a lane taps it
// too (on pointer-down, not on click: a click lands late). The pad draws and reports only: `onTap(lane, at)` gives
// the event's `timeStamp` (the performance clock); the owner keeps the audio clock, the count-in, the targets and
// the grading, and passes back what to draw: each lane's `targets` and `marks` as fractions of the span, and the
// `playhead`. A mark's state has a shape as well as a colour (filled on time, hollow early or late, a dashed ring
// for a missed target, a short tick for an extra tap), and each lane says its count in words.
import { clsx } from "clsx";
import { Hand } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { Kbd } from "./basics.tsx";
import { LANE_KEYS, laneOfKey, tapCountText } from "./model-w7.ts";

export type LaneMarkState = "hit" | "near" | "miss" | "extra";

export interface LaneMark {
  /** Where it sits along the span, 0–1. */
  at: number;
  state?: LaneMarkState;
}

export interface TapLane {
  /** "3", "Clave", "Pulse". */
  label: string;
  /** A short line under the label ("three even taps a bar"). */
  hint?: string;
  /** The places to tap, 0–1 along the span (drawn once the owner shows them). */
  targets?: readonly number[];
  /** The taps so far (live) or marked after the attempt. */
  marks?: readonly LaneMark[];
  /** The lane's own result in words, after the attempt ("5 of 6 on time"). */
  note?: string;
}

export interface TwoLaneTapPadProps {
  /** Accessible name of the pad ("Tap 3 against 2"). */
  label: string;
  lanes: readonly [TapLane, TapLane];
  /** Taps are taken (the take is running). */
  armed: boolean;
  onTap(lane: 0 | 1, at: number): void;
  /** The playhead along the span, 0–1, or `null`. */
  playhead?: number | null;
  /** Beat lines along the span (fractions), e.g. the bar's beats; the first of each group heavier. */
  beats?: readonly { at: number; strong?: boolean }[];
  /** Why taps are not taken now ("Press Start, then tap after the count-in."). */
  idleText?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

const pctOf = (f: number) => `${Math.max(0, Math.min(1, f)) * 100}%`;

function Mark({ m }: { m: LaneMark }) {
  const state = m.state ?? "hit";
  return (
    <span
      aria-hidden
      data-mark={state}
      className={clsx(
        "absolute -translate-x-1/2",
        state === "hit" && "top-2 bottom-2 w-1.5 rounded-full bg-accent",
        state === "near" && "top-2 bottom-2 w-1.5 rounded-full border-2 border-accent-2 bg-surface",
        state === "miss" &&
          "top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-dashed border-issue",
        state === "extra" && "top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-text-3",
      )}
      style={{ left: pctOf(m.at) }}
    />
  );
}

export function TwoLaneTapPad({
  label,
  lanes,
  armed,
  onTap,
  playhead = null,
  beats = [],
  idleText,
  disabled = false,
  className,
  "data-testid": testId,
}: TwoLaneTapPadProps) {
  const [lit, setLit] = useState<[number, number]>([0, 0]);
  const timers = useRef<[ReturnType<typeof setTimeout> | null, ReturnType<typeof setTimeout> | null]>([
    null,
    null,
  ]);
  useEffect(
    () => () => {
      for (const t of timers.current) if (t) clearTimeout(t);
    },
    [],
  );
  const live = armed && !disabled;
  const tap = (lane: 0 | 1, at: number) => {
    if (!live) return;
    onTap(lane, at);
    setLit((l) => (lane === 0 ? [l[0] + 1, l[1]] : [l[0], l[1] + 1]));
    const t = timers.current[lane];
    if (t) clearTimeout(t);
    timers.current[lane] = setTimeout(() => {
      setLit((l) => (lane === 0 ? [0, l[1]] : [l[0], 0]));
    }, 110);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const lane = laneOfKey(e.key);
    if (lane === null || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    tap(lane, e.timeStamp);
  };
  const onLaneDown = (lane: 0 | 1) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.closest<HTMLElement>("[data-tap-pad]")?.focus();
    tap(lane, e.timeStamp);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: one focus stop that takes the F and J keys for both lanes.
    <div
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${label}: F taps ${lanes[0].label}, J taps ${lanes[1].label}`}
      aria-disabled={disabled || undefined}
      data-tap-pad
      data-keyscope="tap"
      data-armed={live || undefined}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={clsx(
        "flex min-w-0 flex-col gap-2 rounded-card border bg-surface p-3",
        live ? "border-accent/50" : "border-border",
        disabled && "opacity-60",
        className,
      )}
    >
      {lanes.map((lane, i) => {
        const idx = i as 0 | 1;
        const marks = lane.marks ?? [];
        const taps = marks.filter((m) => m.state !== "miss").length;
        return (
          <div key={lane.label + String(i)} className="flex min-w-0 items-stretch gap-3" data-lane={i}>
            <div className="flex w-36 shrink-0 flex-col justify-center">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                <Kbd>{LANE_KEYS[idx].toUpperCase()}</Kbd>
                {lane.label}
                {lane.hint && <span className="font-normal text-text-3">· {lane.hint}</span>}
              </span>
              <span className="text-[0.75rem] text-text-3" data-testid="lane-count">
                {lane.note ?? tapCountText(taps)}
              </span>
            </div>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Tap ${lane.label} (${LANE_KEYS[idx].toUpperCase()})`}
              onPointerDown={onLaneDown(idx)}
              onClick={(e) => e.preventDefault()}
              className={clsx(
                "relative h-12 min-w-0 flex-1 overflow-hidden rounded-control border transition-colors duration-100",
                lit[idx] ? "border-accent bg-lane-in" : "border-border bg-surface-2",
                live ? "cursor-pointer" : "cursor-default",
              )}
            >
              {/* The span sits inside the lane, so a mark at its very start or end is drawn whole. */}
              <span className="absolute inset-y-0 right-3 left-3">
                {beats.map((b) => (
                  <span
                    key={b.at}
                    aria-hidden
                    className={clsx("absolute inset-y-0 w-px", b.strong ? "bg-text-3/70" : "bg-border")}
                    style={{ left: pctOf(b.at) }}
                  />
                ))}
                {(lane.targets ?? []).map((t) => (
                  <span
                    key={`t${t}`}
                    aria-hidden
                    data-target
                    className="absolute top-1 bottom-1 w-2.5 -translate-x-1/2 rounded-full bg-accent/15"
                    style={{ left: pctOf(t) }}
                  />
                ))}
                {marks.map((m, j) => (
                  <Mark key={`${m.at}-${j}`} m={m} />
                ))}
                {playhead !== null && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-0.5 bg-text"
                    style={{ left: pctOf(playhead) }}
                  />
                )}
              </span>
            </button>
          </div>
        );
      })}
      <p className="flex items-center gap-1.5 pl-[9.75rem] text-[0.75rem] text-text-3" aria-live="polite">
        <Hand aria-hidden className="size-3.5" />
        {live ? "Tapping: F and J, or press a lane." : (idleText ?? "Not taking taps.")}
      </p>
    </div>
  );
}
