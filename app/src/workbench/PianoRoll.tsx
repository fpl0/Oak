// The piano roll (ux §3.4, architecture §2.2): an own canvas. Rows auto-ranged to the events, 1-based
// degree labels and degree colours when a key exists (note names otherwise), chord-tone emphasis, drum
// lanes for unpitched tracks, the meter's bar/beat grid, the playhead from the adapter's clock, hover
// tooltips and the link to code and staff through the HighlightBus. Layout maths: ./roll-layout.ts.
import type { KeySpec, MeterSpec } from "@oak/content-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { degreeCanvasFill } from "../ui/theme/palette.ts";
import type { WorkbenchClock } from "./clock.ts";
import type { BusState, HighlightBus } from "./highlight-bus.ts";
import type { ViewEvent, WorkbenchModel } from "./model.ts";
import { pitchLabel, tooltipText } from "./music.ts";
import { degreeStyle, neutralSwatch, partColor, type ThemeName, themeOf } from "./palette.ts";
import {
  contentWindow,
  followWindow,
  hitTest,
  layoutRoll,
  playheadCycle,
  type RollInputEvent,
  type RollLayout,
  type RollRect,
  xOfCycle,
} from "./roll-layout.ts";

export type RollColorMode = "degree" | "chordTone" | "part" | "mono";
export type RollLabelMode = "none" | "note" | "degree" | "degree+solfege";

export interface GhostNote extends RollInputEvent {}

export interface PianoRollProps {
  model: WorkbenchModel;
  bus: HighlightBus;
  clock: WorkbenchClock;
  color?: RollColorMode;
  labels?: RollLabelMode;
  /** Target notes drawn as dashed outlines (rung ≥ 3). */
  ghosts?: readonly GhostNote[];
  /** Issues without note IDs: a marker at the bar (and beat) on the ruler. */
  barMarks?: readonly { bar: number; beat: number | null; severity: "error" | "warn" | "info" }[];
  /** Tracks silenced by mute or solo: drawn faint. */
  silenced?: (track: string) => boolean;
  /** Alt+click on a note. */
  onAudition?: (e: ViewEvent) => void;
  /** Smallest window in bars (zoom to content otherwise). */
  minBars?: number;
  /** Show the analysis is not what is playing. */
  stale?: boolean;
  height?: number;
  /**
   * Long loops: show this many bars at a time and turn the page with the playhead (and by hand while
   * stopped) instead of squeezing the whole loop into the panel. Off when absent.
   */
  followBars?: number;
}

interface Colors {
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  link: string;
  issue: string;
  laneIn: string;
  accent: string;
}

function readColors(el: Element): Colors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    surface: v("--wb-surface", "#FFFDF8"),
    surface2: v("--wb-surface-2", "#EFE9DE"),
    border: v("--wb-border", "#DDD3C3"),
    text: v("--wb-text", "#1F1A14"),
    text2: v("--wb-text-2", "#5C5247"),
    text3: v("--wb-text-3", "#8A7F72"),
    link: v("--wb-link", "#2F6B45"),
    issue: v("--wb-issue", "#B4532A"),
    laneIn: v("--wb-lane-in", "rgba(47,107,69,.06)"),
    accent: v("--wb-accent", "#2F6B45"),
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function diamond(g: CanvasRenderingContext2D, r: RollRect): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  g.beginPath();
  g.moveTo(cx, r.y);
  g.lineTo(r.x + r.w, cy);
  g.lineTo(cx, r.y + r.h);
  g.lineTo(r.x, cy);
  g.closePath();
}

interface NoteStyle {
  fill: string | CanvasPattern;
  stroke: string | null;
  dashed: boolean;
  hollow: boolean;
  label: string;
  labelColor: string;
}

function noteStyle(
  e: ViewEvent,
  mode: RollColorMode,
  labels: RollLabelMode,
  theme: ThemeName,
  c: Colors,
  g: CanvasRenderingContext2D,
): NoteStyle {
  const deg = e.label?.degree;
  const labelText = (): string => {
    if (labels === "none") return "";
    if (labels === "note" || !deg) return e.label?.display ?? e.s ?? "";
    return deg.label;
  };
  if (e.midi === null) {
    return {
      fill: partColor(e.trackIndex),
      stroke: null,
      dashed: false,
      hollow: false,
      label: "",
      labelColor: c.surface,
    };
  }
  if (mode === "part") {
    return {
      fill: partColor(e.trackIndex),
      stroke: null,
      dashed: false,
      hollow: false,
      label: labelText(),
      labelColor: "#FFFFFF",
    };
  }
  if (mode === "mono") {
    return {
      fill: c.text2,
      stroke: null,
      dashed: false,
      hollow: false,
      label: labelText(),
      labelColor: c.surface,
    };
  }
  const style = deg
    ? degreeStyle(deg.raw, theme)
    : { ...neutralSwatch(theme), hatchAngle: null as number | null };
  const base: NoteStyle = {
    fill: deg ? degreeCanvasFill(degreeStyle(deg.raw, theme), g) : style.fill,
    stroke: style.outline ?? null,
    dashed: false,
    hollow: false,
    label: labelText(),
    labelColor: style.label,
  };
  if (mode === "chordTone" && e.chordTone) {
    const role = e.chordTone;
    base.label = labels === "none" ? "" : role.label;
    if (role.kind === "tension")
      return { ...base, fill: c.surface, stroke: style.fill, labelColor: c.text, hollow: true };
    if (role.kind === "non")
      return {
        ...base,
        fill: c.surface,
        stroke: style.fill,
        dashed: true,
        hollow: true,
        labelColor: c.text2,
      };
    if (role.label === "5")
      return { ...base, fill: style.fill, stroke: style.outline ?? null, labelColor: style.label };
  }
  return base;
}

export function PianoRoll(props: PianoRollProps) {
  const { model, bus, clock } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [table, setTable] = useState(false);
  const busState = useRef<BusState>(bus.get());
  const playPageRef = useRef<number | null>(null);
  const frame = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 600);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inputs = useMemo<RollInputEvent[]>(
    () =>
      model.events.map((e) => {
        const r: RollInputEvent = { id: e.id, onset: e.onset, end: e.end, midi: e.midi, track: e.track };
        if (e.s !== undefined) r.s = e.s;
        if (e.drum !== undefined) r.drum = e.drum;
        return r;
      }),
    [model],
  );

  // Long loops: a page of `followBars` bars that follows the playhead (manual page while stopped).
  const [manualPage, setManualPage] = useState(0);
  const [playPage, setPlayPage] = useState<number | null>(null);
  const content = useMemo(
    () => contentWindow(inputs, model.bars, props.minBars ?? 1),
    [inputs, model.bars, props.minBars],
  );
  const follow =
    props.followBars && props.followBars > 0
      ? followWindow(content, props.followBars, {
          playhead: playPage === null ? null : content[0] + playPage * props.followBars,
          page: manualPage,
        })
      : null;
  const followRef = useRef(follow);
  followRef.current = follow;

  const layout: RollLayout = useMemo(
    () =>
      layoutRoll(inputs, {
        width,
        meter: model.meter as MeterSpec,
        key: model.key as KeySpec | null,
        bars: model.bars,
        minBars: props.minBars ?? 1,
        ...(follow ? { window: follow.window } : {}),
        labels: props.labels ?? (model.key ? "degree" : "note"),
        extra: props.ghosts ?? [],
        pitchHeight: props.height ?? 180,
      }),
    [
      inputs,
      width,
      model,
      props.minBars,
      props.labels,
      props.ghosts,
      props.height,
      follow?.window[0],
      follow?.window[1],
    ],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const L = layoutRef.current;
    const p = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(L.width * dpr) || canvas.height !== Math.round(L.height * dpr)) {
      canvas.width = Math.round(L.width * dpr);
      canvas.height = Math.round(L.height * dpr);
      canvas.style.width = `${L.width}px`;
      canvas.style.height = `${L.height}px`;
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = readColors(canvas);
    const theme = themeOf(document.documentElement);
    const s = busState.current;
    g.clearRect(0, 0, L.width, L.height);
    g.fillStyle = c.surface;
    g.fillRect(0, 0, L.width, L.height);
    g.font = "10px var(--font-mono, ui-monospace, monospace)";
    g.textBaseline = "middle";

    // scale lanes
    if (L.pitch) {
      for (const row of L.pitch.rows) {
        if (model.key && row.inKey) {
          g.fillStyle = c.laneIn;
          g.fillRect(L.gutter, row.y, L.width - L.gutter, L.pitch.rowH);
        } else if (model.key) {
          // 6% diagonal hatch on out-of-key rows
          g.save();
          g.beginPath();
          g.rect(L.gutter, row.y, L.width - L.gutter, L.pitch.rowH);
          g.clip();
          g.strokeStyle = c.text3;
          g.globalAlpha = 0.12;
          g.lineWidth = 1;
          for (let x = L.gutter - L.pitch.rowH; x < L.width; x += 6) {
            g.beginPath();
            g.moveTo(x, row.y + L.pitch.rowH);
            g.lineTo(x + L.pitch.rowH, row.y);
            g.stroke();
          }
          g.restore();
        }
        if (row.tonic) {
          g.strokeStyle = c.text3;
          g.globalAlpha = 0.6;
          g.beginPath();
          g.moveTo(L.gutter, row.y + L.pitch.rowH - 0.5);
          g.lineTo(L.width, row.y + L.pitch.rowH - 0.5);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.fillStyle = row.tonic ? c.text : c.text2;
        g.font = `${row.tonic ? "bold " : ""}10px ui-monospace, monospace`;
        if (row.label) g.fillText(row.label, 4, row.y + L.pitch.rowH / 2);
      }
    }
    if (L.drums) {
      g.font = "10px ui-monospace, monospace";
      for (const lane of L.drums.lanes) {
        g.fillStyle = c.surface2;
        g.globalAlpha = 0.5;
        g.fillRect(L.gutter, lane.y, L.width - L.gutter, L.drums.laneH - 1);
        g.globalAlpha = 1;
        g.fillStyle = c.text2;
        g.fillText(lane.sound, 4, lane.y + L.drums.laneH / 2);
      }
    }

    // grid
    for (const line of L.grid) {
      g.strokeStyle = line.kind === "bar" ? c.text3 : c.border;
      g.globalAlpha = line.kind === "sub" ? 0.35 : line.kind === "beat" ? 0.7 : 1;
      g.lineWidth = line.kind === "bar" ? 1 : 1;
      g.beginPath();
      g.moveTo(Math.round(line.x) + 0.5, line.kind === "bar" ? 0 : L.rulerHeight);
      g.lineTo(Math.round(line.x) + 0.5, L.height);
      g.stroke();
      g.globalAlpha = 1;
      if (line.kind === "bar" && line.bar !== undefined && line.label && line.x < L.width - 8) {
        g.fillStyle = c.text2;
        g.font = "10px ui-monospace, monospace";
        g.fillText(String(line.bar), line.x + 3, L.rulerHeight / 2);
      }
    }
    g.strokeStyle = c.border;
    g.beginPath();
    g.moveTo(L.gutter, L.rulerHeight - 0.5);
    g.lineTo(L.width, L.rulerHeight - 0.5);
    g.stroke();

    // ghost notes (target, rung ≥ 3): dashed outline in the target's degree colour
    if (p.ghosts && p.ghosts.length > 0) {
      const ghostLayout = layoutRoll(p.ghosts, {
        width: L.width,
        meter: model.meter,
        key: model.key,
        bars: model.bars,
        window: [L.from, L.to - L.from],
        extra: inputs,
        pitchHeight: p.height ?? 180,
      });
      g.save();
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      for (const r of ghostLayout.rects) {
        const ghost = p.ghosts.find((x) => x.id === r.id);
        const deg =
          ghost?.midi != null && model.key ? degreeStyle(degreeKey(ghost.midi, model), theme).fill : c.text2;
        g.strokeStyle = deg;
        const y =
          L.pitch && ghost?.midi != null
            ? L.pitch.top + (L.pitch.hi - Math.round(ghost.midi)) * L.pitch.rowH + 1
            : r.y;
        roundRect(g, r.x, y, r.w, r.h, 3);
        g.stroke();
      }
      g.restore();
    }

    // notes
    const hover = new Set(s.hover.events);
    const selected = new Set(s.selected.events);
    for (const r of L.rects) {
      const e = model.byId.get(r.id);
      if (!e) continue;
      const st = noteStyle(
        e,
        p.color ?? (model.key ? "degree" : "part"),
        p.labels ?? (model.key ? "degree" : "note"),
        theme,
        c,
        g,
      );
      const silent = p.silenced?.(e.track) ?? false;
      const playing = s.playing.has(e.id);
      g.globalAlpha = silent ? 0.22 : e.band ? 0.55 : playing ? 1 : 0.8;
      if (playing && !silent) {
        g.shadowColor = typeof st.fill === "string" ? st.fill : c.accent;
        g.shadowBlur = 8;
      }
      if (r.kind === "drum") diamond(g, r);
      else roundRect(g, r.x, r.y, r.w, r.h, 3);
      g.fillStyle = st.fill;
      g.fill();
      g.shadowBlur = 0;
      if (st.stroke) {
        g.save();
        if (st.dashed) g.setLineDash([3, 2]);
        g.lineWidth = st.hollow && !st.dashed ? 2.5 : 1;
        g.strokeStyle = st.stroke;
        g.stroke();
        g.restore();
      }
      if (st.label && r.kind === "note" && r.w >= 18 && r.h >= 9) {
        g.fillStyle = st.labelColor;
        g.font = "bold 9px ui-monospace, monospace";
        g.fillText(st.label, r.x + 3, r.y + r.h / 2 + 0.5, r.w - 4);
      }
      g.globalAlpha = 1;
      const issue = s.issues.get(e.id);
      if (issue) {
        g.save();
        g.strokeStyle = c.issue;
        g.lineWidth = 2;
        if (r.kind === "drum") diamond(g, { ...r, x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
        else roundRect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 5);
        g.stroke();
        g.restore();
      }
      if (selected.has(e.id) || hover.has(e.id)) {
        g.save();
        g.strokeStyle = c.link;
        g.lineWidth = selected.has(e.id) ? 3 : 2;
        if (selected.has(e.id)) g.globalAlpha = 0.85;
        if (r.kind === "drum") diamond(g, { ...r, x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
        else roundRect(g, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 4);
        g.stroke();
        g.restore();
      }
    }

    // bar-level issue markers on the ruler
    for (const m of p.barMarks ?? []) {
      const at = m.bar - 1 + ((m.beat ?? 1) - 1) / model.meter.unitsPerBar;
      if (at < L.from || at > L.to) continue;
      const x = xOfCycle(L, at);
      g.fillStyle = c.issue;
      g.beginPath();
      g.moveTo(x - 5, 2);
      g.lineTo(x + 5, 2);
      g.lineTo(x, L.rulerHeight - 3);
      g.closePath();
      g.fill();
    }

    // playhead
    const f = clock.get();
    if (f.playing) {
      const at = playheadCycle(f.audibleCycle, model.bars);
      if (at >= L.from && at <= L.to) {
        const x = Math.round(xOfCycle(L, at)) + 0.5;
        g.strokeStyle = c.accent;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, L.height);
        g.stroke();
      }
    }
    if (canvas.dataset) {
      canvas.dataset.playhead = f.playing ? playheadCycle(f.audibleCycle, model.bars).toFixed(3) : "";
    }
  }, [model, clock, inputs]);

  const invalidate = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    invalidate();
  }, [invalidate, layout, props.ghosts, props.barMarks, props.color, props.labels, props.silenced]);
  useEffect(
    () =>
      bus.subscribe((s) => {
        busState.current = s;
        // Mirrors of the bus on the DOM: tests and the a11y tree read what the roll lights, in the same tick.
        const el = wrapRef.current;
        if (el) {
          el.dataset.active = [...s.playing].sort().join(" ");
          el.dataset.selected = s.selected.events.join(" ");
        }
        invalidate();
      }),
    [bus, invalidate],
  );
  useEffect(
    () =>
      clock.subscribe((f) => {
        const pageBars = propsRef.current.followBars;
        if (pageBars && pageBars > 0 && followRef.current) {
          const next = f.playing
            ? (followWindow(content, pageBars, {
                playhead: playheadCycle(f.audibleCycle, model.bars),
                page: 0,
              })?.page ?? null)
            : null;
          if (next !== playPageRef.current) {
            playPageRef.current = next;
            setPlayPage(next);
            if (next !== null) setManualPage(next);
          }
        }
        invalidate();
      }),
    [clock, invalidate, content, model.bars],
  );
  useEffect(() => {
    const mo = new MutationObserver(() => invalidate());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [invalidate]);

  const pointAt = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const onMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = pointAt(ev);
    const id = hitTest(layout, pt.x, pt.y);
    if (id) {
      const e = model.byId.get(id);
      bus.hover({ events: [id] }, "roll");
      if (e) {
        const text = tooltipText(
          {
            midi: e.midi,
            track: e.track,
            bar: e.bar,
            beatLabel: e.beatLabel,
            ...(e.s === undefined ? {} : { s: e.s }),
            ...(e.chordSymbol === undefined ? {} : { chordSymbol: e.chordSymbol }),
          },
          model.key,
        );
        setTip({ x: pt.x, y: pt.y, text });
      }
    } else {
      if (bus.get().hover.source === "roll") bus.hover(null, "roll");
      setTip(null);
    }
  };
  const onLeave = () => {
    if (bus.get().hover.source === "roll") bus.hover(null, "roll");
    setTip(null);
  };
  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = pointAt(ev);
    const id = hitTest(layout, pt.x, pt.y);
    if (!id) {
      bus.select(null, "roll");
      return;
    }
    const e = model.byId.get(id);
    if (ev.altKey && e) {
      props.onAudition?.(e);
      return;
    }
    bus.select({ events: [id] }, "roll");
  };

  return (
    <div className="oak-roll" ref={wrapRef} data-testid="piano-roll">
      <div className="oak-view-head">
        {follow ? (
          <span className="oak-roll-pager" data-testid="roll-pager">
            <button
              type="button"
              className="oak-link-button"
              aria-label="Roll: earlier bars"
              disabled={follow.page <= 0 || playPage !== null}
              onClick={() => setManualPage(Math.max(0, follow.page - 1))}
            >
              ‹
            </button>
            <span aria-live="polite">
              Bars {follow.window[0] + 1}–{follow.window[0] + follow.window[1]} of {content[1]}
            </span>
            <button
              type="button"
              className="oak-link-button"
              aria-label="Roll: later bars"
              disabled={follow.page >= follow.pages - 1 || playPage !== null}
              onClick={() => setManualPage(Math.min(follow.pages - 1, follow.page + 1))}
            >
              ›
            </button>
          </span>
        ) : null}
        {props.stale ? (
          <span className="oak-badge" data-testid="roll-stale">
            preview · not playing
          </span>
        ) : null}
        <button
          type="button"
          className="oak-link-button"
          aria-pressed={table}
          onClick={() => setTable((t) => !t)}
        >
          Notes table
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="oak-roll-canvas"
        role="img"
        aria-label={`Piano roll, ${model.events.length} notes in ${model.bars} bars`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        data-testid="roll-canvas"
        data-notes={layout.rects.length}
        data-window={`${layout.from}-${layout.to}`}
      />
      {tip ? (
        <div
          className="oak-tooltip"
          role="tooltip"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
          data-testid="roll-tooltip"
        >
          {tip.text}
        </div>
      ) : null}
      {table ? <NotesTable model={model} bus={bus} /> : null}
    </div>
  );
}

function degreeKey(midi: number, model: WorkbenchModel): string {
  return pitchLabel(midi, model.key).degree?.raw ?? "";
}

/** Accessibility: the roll as a table (bar, beat, part, degree, note, duration). */
function NotesTable({ model, bus }: { model: WorkbenchModel; bus: HighlightBus }) {
  return (
    <table className="oak-notes-table">
      <thead>
        <tr>
          <th>Bar</th>
          <th>Beat</th>
          <th>Part</th>
          <th>Degree</th>
          <th>Note</th>
          <th>Length</th>
        </tr>
      </thead>
      <tbody>
        {model.events.map((e) => (
          <tr key={e.id} onClick={() => bus.select({ events: [e.id] }, "roll")}>
            <td>{e.bar}</td>
            <td>{e.beatLabel}</td>
            <td>{e.track}</td>
            <td>{e.label?.degree?.label ?? "—"}</td>
            <td>{e.label?.display ?? e.s ?? "—"}</td>
            <td>
              {e.durRat[0]}/{e.durRat[1]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
