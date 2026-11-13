// ScopeFrame (Wave 5): the frame Oak's scope, spectrum and probe curves draw in (A1.L01–L04; contracts §3.1 rule 9:
// Oak's panel, never Strudel's canvas). It owns the canvas (sized to its box at the device pixel ratio), the grid at
// the axis ticks, the tick labels (HTML, so they stay crisp and themed), an empty-state sentence over the plot, and
// the redraw loop: `live` redraws every animation frame, or at most ten times a second under reduced motion
// (docs/design/wave5.md §4.4); otherwise it redraws when `frameKey`, the size or the theme changes. The owner draws
// the signal in `draw(ctx, plot)` with the plot's scales and the theme's colours; nothing here touches audio.
import { clsx } from "clsx";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "../theme/motion.ts";
import { useThemeName } from "../theme/use-theme-name.ts";
import {
  type AxisSpec,
  axisFraction,
  axisTicks,
  frameInterval,
  labelWidth,
  thinTicks,
  unitLabel,
} from "./model-w5.ts";

export type { AxisSpec };

export interface ScopeColours {
  /** The signal (accent). */
  line: string;
  /** A second trace: a probe's theory curve, a reference (accent-2). */
  line2: string;
  /** Grid lines. */
  grid: string;
  /** Tick text and quiet marks. */
  text: string;
  /** The plot's background. */
  bg: string;
}

export interface ScopePlot {
  /** CSS pixels of the plot (the canvas is scaled for the device pixel ratio already). */
  width: number;
  height: number;
  /** Axis value → CSS px inside the plot (y grows downwards on screen: `y(max)` is 0). */
  x(v: number): number;
  y(v: number): number;
  colours: ScopeColours;
  /** Milliseconds since the frame started drawing live (0 when not live). */
  t: number;
}

export interface ScopeFrameProps {
  /** Accessible name ("Scope: the wave of what plays"). */
  label: string;
  x: AxisSpec;
  y: AxisSpec;
  draw(ctx: CanvasRenderingContext2D, plot: ScopePlot): void;
  /** Redraw every frame (a running scope); off: redraw on `frameKey`, size and theme changes. */
  live?: boolean;
  /** Changes when the data changes (a new probe, a new spectrum snapshot). */
  frameKey?: unknown;
  /** A sentence over the plot instead of a signal ("Press Play to see the wave"); `null`: draw. */
  empty?: string | null;
  /** What the plot shows, in words, for screen readers (the values a probe draws). */
  description?: string;
  /** Plot height in CSS px (160). */
  height?: number;
  /** A header row above the plot (title, a source switch, a legend). */
  header?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

const AXIS_W = 52;
const AXIS_H = 22;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function readColours(): ScopeColours {
  return {
    line: cssVar("--oak-accent", "#2f6b45"),
    line2: cssVar("--oak-accent-2", "#b7791f"),
    grid: cssVar("--oak-border", "#ddd3c3"),
    text: cssVar("--oak-text-3", "#6e6457"),
    bg: cssVar("--oak-surface", "#fffdf8"),
  };
}

export function ScopeFrame({
  label,
  x,
  y,
  draw,
  live = false,
  frameKey,
  empty = null,
  description,
  height = 160,
  header,
  className,
  "data-testid": testId,
}: ScopeFrameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const theme = useThemeName();
  const reduced = useReducedMotion();
  const descId = useId();
  const xTicks = axisTicks(x);
  const yTicks = axisTicks(y);
  // Tick labels thin out when the plot is narrow, so none overlap (the grid keeps every tick).
  const [plotW, setPlotW] = useState(0);
  const xText = xTicks.map((t) => unitLabel(t, x.unit, { compact: true }));
  const xShow =
    plotW > 0
      ? thinTicks(
          xTicks.map((t) => axisFraction(t, x) * plotW),
          xText.map(labelWidth),
        )
      : xTicks.map(() => true);
  const yShow = thinTicks(
    yTicks.map((t) => (1 - axisFraction(t, y)) * height),
    yTicks.map(() => 12),
    2,
  );
  const xKey = `${x.scale}:${x.min}:${x.max}:${xTicks.join(",")}`;
  const yKey = `${y.scale}:${y.min}:${y.max}:${yTicks.join(",")}`;
  useEffect(() => {
    const el = canvas.current;
    const host = box.current;
    if (!el || !host) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let colours = readColours();
    let raf = 0;
    let last = 0;
    const started = performance.now();
    const paint = (now: number) => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = colours.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of xTicks) {
        const px = Math.round(axisFraction(t, x) * w) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (const t of yTicks) {
        const py = Math.round((1 - axisFraction(t, y)) * h) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }
      ctx.stroke();
      if (empty === null)
        drawRef.current(ctx, {
          width: w,
          height: h,
          x: (v) => axisFraction(v, x) * w,
          y: (v) => (1 - axisFraction(v, y)) * h,
          colours,
          t: live ? now - started : 0,
        });
    };
    const interval = frameInterval(reduced);
    const loop = (now: number) => {
      if (now - last >= interval) {
        last = now;
        paint(now);
      }
      raf = requestAnimationFrame(loop);
    };
    colours = readColours();
    if (live && empty === null) raf = requestAnimationFrame(loop);
    else paint(performance.now());
    const ro = new ResizeObserver(() => {
      setPlotW(host.clientWidth);
      if (!live || empty !== null) paint(performance.now());
    });
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [live, frameKey, empty, reduced, theme, xKey, yKey]);

  return (
    <figure
      className={clsx("m-0 flex min-w-0 flex-col gap-2", className)}
      data-testid={testId}
      data-scope-state={empty === null ? (live ? "live" : "still") : "empty"}
    >
      {header}
      <div className="flex min-w-0">
        <div
          aria-hidden
          className="relative shrink-0 text-right text-[0.6875rem] text-text-3 tabular-nums"
          style={{ width: AXIS_W, height }}
        >
          {yTicks.map((t, i) =>
            !yShow[i] ? null : (
              <span
                key={t}
                className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap"
                style={{ top: `${(1 - axisFraction(t, y)) * 100}%` }}
              >
                {unitLabel(t, y.unit, { compact: true })}
              </span>
            ),
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={box}
            role="img"
            aria-label={`${label}. ${y.label} against ${x.label.toLowerCase()}.`}
            aria-describedby={description || empty ? descId : undefined}
            className="relative min-w-0 overflow-hidden rounded-control border border-border bg-surface"
            style={{ height }}
          >
            <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
            {empty !== null && (
              <p
                aria-hidden
                className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-text-2"
                data-testid="scope-empty"
              >
                {empty}
              </p>
            )}
          </div>
          <div
            aria-hidden
            className="relative min-w-0 text-[0.6875rem] text-text-3 tabular-nums"
            style={{ height: AXIS_H }}
          >
            {xTicks.map((t, i) =>
              !xShow[i] ? null : (
                <span
                  key={t}
                  className="absolute top-1 whitespace-nowrap"
                  style={{
                    left: `${axisFraction(t, x) * 100}%`,
                    transform: `translateX(${i === 0 ? "0" : i === xTicks.length - 1 ? "-100%" : "-50%"})`,
                  }}
                >
                  {xText[i]}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
      <figcaption className="flex flex-wrap justify-between gap-x-3 pl-[52px] text-[0.75rem] text-text-3">
        <span>
          {y.label} against {x.label.toLowerCase()}
        </span>
        {description && empty === null && <span aria-hidden>{description}</span>}
        <span id={descId} className="sr-only">
          {empty ?? description ?? ""}
        </span>
      </figcaption>
    </figure>
  );
}
