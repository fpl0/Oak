// The source on top of the project (ux §9 Transcription Studio): own audio as a waveform (wavesurfer 8 through
// `@oak/audio/waveview`: zoom, the A–B loop as a draggable region, named sections, bar lines from the tempo
// and first downbeat, a spectrogram on request); a pattern source as a bar timeline (contracts §6.12: "a bar
// timeline replaces the waveform and spectrogram"). Drag across either to set the loop.
import type { TranscriptionPlayer } from "@oak/audio";
import type { WaveView } from "@oak/audio/waveview";
import { clsx } from "clsx";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type BarGrid, barLabelEvery, barLines, beatTicks, formatTime, type Loop, loopOf } from "./grid.ts";
import type { TranscribeTransport, TransportState } from "./transport.ts";

export interface Section {
  id: string;
  label: string;
  startS: number;
  endS: number;
}

const cssVar = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};
const withAlpha = (color: string, a: number) =>
  /^#[0-9a-f]{6}$/i.test(color)
    ? `rgba(${Number.parseInt(color.slice(1, 3), 16)}, ${Number.parseInt(color.slice(3, 5), 16)}, ${Number.parseInt(color.slice(5, 7), 16)}, ${a})`
    : color;

interface RegionsLike {
  addRegion(o: Record<string, unknown>): { id: string; start: number; end: number; remove(): void };
  enableDragSelection(o: Record<string, unknown>, threshold?: number): () => void;
  on(ev: string, cb: (r: { id: string; start: number; end: number; remove(): void }) => void): () => void;
  getRegions(): { id: string; remove(): void }[];
}

export function Waveform({
  transport,
  state,
  buffer,
  grid,
  sections,
  zoom,
  spectrogram,
  theme,
  unitsPerBar = 4,
  swing = false,
}: {
  transport: TranscribeTransport;
  state: TransportState;
  buffer: AudioBuffer;
  grid: BarGrid | null;
  sections: readonly Section[];
  /** Pixels per second; 0 = fit. */
  zoom: number;
  spectrogram: boolean;
  theme: string;
  /** Beats in a bar (the meter's tempo units): beat ticks once zoomed in far enough. */
  unitsPerBar?: number;
  /** The recording swings: off-beat eighths are marked at two thirds of the beat (contracts §6.10). */
  swing?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<WaveView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const regionsRef = useRef<RegionsLike | null>(null);
  const tRef = useRef(transport);
  tRef.current = transport;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    let v: WaveView | null = null;
    const offs: (() => void)[] = [];
    (async () => {
      const [{ createWaveView }, { computePeaks }] = await Promise.all([
        import("@oak/audio/waveview"),
        import("@oak/audio"),
      ]);
      if (!live) return;
      // The view needs a player only to seek, set the loop and read the playhead: the transport is that player.
      const player = {
        seek: (s: number) => tRef.current.seek(s),
        setLoop: (l: Loop | null) => tRef.current.setLoop(l),
        get state() {
          return { time: tRef.current.state.time };
        },
      } as unknown as TranscriptionPlayer;
      const accent = cssVar("--oak-accent", "#4a6b52");
      v = createWaveView({
        container: el,
        player,
        peaks: computePeaks(buffer),
        durationS: buffer.duration,
        audio: buffer,
        spectrogram,
        height: 112,
        colors: {
          wave: cssVar("--oak-text-3", "#8a8f98"),
          progress: accent,
          cursor: cssVar("--oak-danger", "#c0392b"),
          loop: withAlpha(accent, 0.22),
          section: withAlpha(cssVar("--oak-text-3", "#8a8f98"), 0.12),
        },
      });
      const regions = v.wavesurfer
        .getActivePlugins()
        .find((p) => typeof (p as unknown as RegionsLike).enableDragSelection === "function") as unknown as
        | RegionsLike
        | undefined;
      if (regions) {
        regionsRef.current = regions;
        offs.push(regions.enableDragSelection({ color: withAlpha(accent, 0.22) }, 4));
        // A dragged-out span becomes the A–B loop (and the temporary region goes away).
        offs.push(
          regions.on("region-created", (r) => {
            if (!r.id.startsWith("region-")) return;
            const loop = loopOf(r.start, r.end, buffer.duration);
            r.remove();
            if (loop) tRef.current.setLoop(loop);
          }),
        );
      }
      setView(v);
    })().catch((e: unknown) => setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
      for (const off of offs) off();
      regionsRef.current = null;
      v?.dispose();
      setView(null);
    };
    // A new spectrogram setting or theme redraws the view (wavesurfer has no live colour or plugin swap).
  }, [buffer, spectrogram, theme]);

  useEffect(() => {
    view?.setLoopRegion(state.loop);
  }, [view, state.loop?.startS, state.loop?.endS]);
  useEffect(() => {
    view?.setSections(
      sections.map((s) => ({ id: `sec-${s.id}`, startS: s.startS, endS: s.endS, label: s.label })),
    );
  }, [view, sections]);
  useEffect(() => {
    view?.zoom(zoom);
  }, [view, zoom]);
  // Bar lines as markers (a region with no length is a marker); bar numbers every bar, or every 4th when dense.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!view || !regions) return;
    const made: { remove(): void }[] = [];
    view.wavesurfer.once("ready", () => undefined);
    if (grid) {
      const lines = barLines(grid, buffer.duration);
      const width = host.current?.clientWidth ?? 1000;
      const pxPerSec = zoom > 0 ? zoom : width / Math.max(1e-3, buffer.duration);
      const every = barLabelEvery(pxPerSec * grid.barSec, lines.length);
      const color = cssVar("--oak-text-2", "#555");
      // Bar lines a few pixels apart would paint the waveform over: then only the numbered ones are drawn.
      const crowded = pxPerSec * grid.barSec < 6;
      for (const l of lines) {
        if (crowded && l.bar % every !== 0) continue;
        made.push(
          regions.addRegion({
            id: `bar-${l.bar}`,
            start: l.t,
            drag: false,
            resize: false,
            color: withAlpha(color, l.bar % 4 === 0 ? 0.55 : 0.25),
            ...(l.bar % every === 0 ? { content: String(l.bar + 1) } : {}),
          }),
        );
      }
      // Beats (and the off-beat eighths, swung or straight) once there is room to see them.
      const pxPerBeat = (pxPerSec * grid.barSec) / unitsPerBar;
      if (pxPerBeat >= 18 && lines.length * unitsPerBar <= 1600) {
        const ticks = beatTicks(unitsPerBar, swing).filter(
          (t) => t.at > 0 && (t.kind === "beat" || pxPerBeat >= 36),
        );
        for (const l of lines)
          for (const t of ticks) {
            const at = l.t + t.at * grid.barSec;
            if (at > buffer.duration) continue;
            made.push(
              regions.addRegion({
                id: `tick-${l.bar}-${t.at.toFixed(4)}`,
                start: at,
                drag: false,
                resize: false,
                color: withAlpha(color, t.kind === "beat" ? 0.14 : swing ? 0.12 : 0.07),
              }),
            );
          }
      }
    }
    return () => {
      for (const r of made) r.remove();
    };
  }, [view, grid?.barSec, grid?.downbeatS, buffer, zoom, unitsPerBar, swing]);

  return (
    <div className="relative">
      <div
        ref={host}
        className="oak-wave min-h-[128px] overflow-hidden rounded-control bg-surface-2"
        data-testid="waveform"
        role="img"
        aria-label={`Waveform of your recording, ${formatTime(buffer.duration)} long. Drag across it to set a loop.`}
      />
      {failed ? <p className="mt-1 text-sm text-issue">The waveform could not be drawn: {failed}</p> : null}
    </div>
  );
}

/** A section, chorus or line mark over the timeline (song.ts `timelineMarks`). */
export interface TimelineMarkView {
  cycle: number;
  text: string;
  kind: "section" | "line";
}

/**
 * A pattern source's bar timeline: one cell per bar, the playhead, the loop; drag or click to loop bars. Wave 5:
 * section, chorus and line marks over the bars; beat ticks with the off-beat eighths at their swung place when
 * the item swings ("Swing 8ths"); the span being worked outlined; a check's result bar by bar.
 */
export function BarTimeline({
  transport,
  state,
  bars,
  pickup,
  marks = [],
  swing = false,
  unitsPerBar = 4,
  current = null,
  barMarks,
}: {
  transport: TranscribeTransport;
  state: TransportState;
  /** Cycles of the material (the pickup bar counts as one). */
  bars: number;
  /** Cycle 0 is a pickup bar: bars are numbered from the first full bar. */
  pickup: boolean;
  marks?: readonly TimelineMarkView[];
  swing?: boolean;
  unitsPerBar?: number;
  /** The phrase or line being worked, in cycles. */
  current?: { fromBar: number; bars: number } | null;
  /** The last check, per cycle: the bars it named and the ones it found right. */
  barMarks?: ReadonlyMap<number, "ok" | "issue">;
}) {
  const barSec = state.durationS / Math.max(1, bars);
  const drag = useRef<number | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const loopFrom = state.loop ? Math.round(state.loop.startS / barSec) : null;
  const loopTo = state.loop ? Math.round(state.loop.endS / barSec) : null;
  const pos = state.durationS > 0 ? Math.min(1, state.time / state.durationS) : 0;
  const barOf = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(bars - 1, Math.floor(((e.clientX - r.left) / r.width) * bars)));
  };
  const setBars = (a: number, b: number) => {
    const from = Math.min(a, b);
    const to = Math.max(a, b) + 1;
    transport.setLoop({ startS: from * barSec, endS: to * barSec });
  };
  const label = (b: number) => (pickup ? (b === 0 ? "pickup" : `bar ${b}`) : `bar ${b + 1}`);
  // Many bars: the cells and the loop buttons carry the bar number alone (the words would wrap).
  const dense = bars > 8;
  const short = (b: number) => (pickup ? (b === 0 ? "pickup" : String(b)) : String(b + 1));
  const ticks = beatTicks(unitsPerBar, swing).filter((t) => swing || t.kind === "beat");
  const hasMarks = marks.length > 0 || swing;
  return (
    <div>
      {hasMarks ? (
        <div className="relative mb-1 h-5 text-sm" data-testid="timeline-marks">
          {marks.map((m) => (
            <span
              key={`${m.cycle}-${m.text}`}
              className={clsx(
                "absolute top-0 truncate border-l-2 pl-1 leading-5",
                m.kind === "section" ? "border-accent font-medium text-text" : "border-border text-text-3",
              )}
              style={{
                left: `${(m.cycle / Math.max(1, bars)) * 100}%`,
                maxWidth: `${(4 / Math.max(1, bars)) * 100}%`,
              }}
            >
              {m.text}
            </span>
          ))}
          {swing ? (
            <span
              className="absolute top-0 right-0 bg-surface pl-2 leading-5 text-text-2"
              data-testid="swing-label"
            >
              Swing 8ths
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="relative flex h-[112px] touch-none select-none overflow-hidden rounded-control border border-border bg-surface-2"
        data-testid="bar-timeline"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = barOf(e);
          setHover([drag.current, drag.current]);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) setHover([drag.current, barOf(e)]);
        }}
        onPointerUp={(e) => {
          if (drag.current === null) return;
          setBars(drag.current, barOf(e));
          drag.current = null;
          setHover(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setHover(null);
        }}
      >
        {Array.from({ length: bars }, (_, b) => {
          const inLoop = loopFrom !== null && loopTo !== null && b >= loopFrom && b < loopTo;
          const inDrag = hover !== null && b >= Math.min(...hover) && b <= Math.max(...hover);
          const mark = barMarks?.get(b);
          const section = marks.find((m) => m.cycle === b && b > 0);
          return (
            <div
              key={b}
              data-mark={mark}
              className={clsx(
                "relative flex min-w-0 flex-1 items-end border-border pb-1.5 text-sm text-text-2",
                dense ? "px-1" : "px-2",
                b > 0 && (section?.kind === "section" ? "border-l-2 border-l-accent" : "border-l"),
                inLoop && "bg-lane-in",
                inDrag && "bg-accent/15",
              )}
            >
              <span className="truncate">{dense ? short(b) : label(b)}</span>
              <span aria-hidden className="absolute inset-x-0 top-3 h-6">
                {ticks.map((t) => (
                  <span
                    key={t.at}
                    className={clsx(
                      "absolute top-0 w-px",
                      t.kind === "beat" ? "h-6" : "h-3",
                      t.at === 0 ? "bg-text-3" : t.kind === "beat" ? "bg-border" : "bg-text-3/50",
                    )}
                    style={{ left: `${t.at * 100}%` }}
                  />
                ))}
              </span>
              {mark ? (
                <span
                  aria-hidden
                  className={clsx(
                    "absolute inset-x-1 bottom-7 h-1.5 rounded-full",
                    mark === "issue" ? "bg-issue" : "bg-accent/60",
                  )}
                />
              ) : null}
            </div>
          );
        })}
        {current ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-control border-2 border-accent/70"
            style={{
              left: `${(current.fromBar / Math.max(1, bars)) * 100}%`,
              width: `${(current.bars / Math.max(1, bars)) * 100}%`,
            }}
            data-testid="timeline-current"
          />
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-danger"
          style={{ left: `calc(${pos * 100}% - 1px)` }}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {state.loop
          ? `Looping ${loopFrom !== null ? label(loopFrom) : ""} to ${loopTo !== null ? label(loopTo - 1) : ""}`
          : ""}
      </p>
      {barMarks && barMarks.size > 0 ? (
        <p className="sr-only" data-testid="bar-marks">
          {[...barMarks.entries()]
            .filter(([, m]) => m === "issue")
            .map(([b]) => label(b))
            .join(", ") || "Every checked bar is right"}
        </p>
      ) : null}
      <fieldset className="m-0 mt-1 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0">
        <legend className={dense ? "float-left mr-1 text-sm text-text-3" : "sr-only"}>Loop a bar</legend>
        {Array.from({ length: bars }, (_, b) => (
          <button
            key={b}
            type="button"
            className={clsx(
              "rounded-control border border-border py-0.5 text-sm text-text-2 hover:bg-surface-2 aria-pressed:bg-lane-in aria-pressed:text-text",
              dense ? "min-w-8 px-1.5 text-center tabular-nums" : "px-2",
            )}
            aria-pressed={loopFrom === b && loopTo === b + 1}
            aria-label={`Loop ${label(b)}`}
            onClick={(e) => {
              if (e.shiftKey && loopFrom !== null) setBars(loopFrom, b);
              else if (loopFrom === b && loopTo === b + 1) transport.setLoop(null);
              else setBars(b, b);
            }}
          >
            {dense ? short(b) : `Loop ${label(b)}`}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
