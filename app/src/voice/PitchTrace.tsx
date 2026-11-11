// A live pitch trace (ux §4.3, simplified for set-up): the last few seconds of detected pitch over a note grid,
// optional target ribbon (a note ± tolerance, folded to the octave sung) and range marks. Canvas, themed from
// the --oak-* tokens at draw time so Paper and Bark both read. The text alternative is the caller's
// (`noteReadout`), announced politely next to it.
import type { PitchFrame } from "@oak/pitch";
import { useEffect, useRef } from "react";
import { formatNoteMidi } from "../lib/notes.ts";
import { midiOfHz, voiced } from "./logic.ts";

export interface PitchTraceProps {
  /** The frames so far (read every animation frame while `live`). */
  frames: () => readonly PitchFrame[];
  live: boolean;
  /** Seconds of history shown. */
  windowSec?: number;
  lowMidi?: number;
  highMidi?: number;
  /** Target ribbon: the sung pitch is folded to the octave nearest this note. */
  target?: { midi: number; cents: number; hit?: boolean } | null;
  /** Range marks (low, high) drawn as dashed lines. */
  marks?: readonly { midi: number; label: string }[];
  height?: number;
  label: string;
}

function token(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export function PitchTrace(props: PitchTraceProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    let raf = 0;
    let width = w.clientWidth || 600;
    const ro = new ResizeObserver((e) => {
      width = Math.max(200, Math.floor(e[0]?.contentRect.width ?? width));
    });
    ro.observe(w);
    const draw = () => {
      const p = propsRef.current;
      const h = p.height ?? 200;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(width * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${width}px`;
        c.style.height = `${h}px`;
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const col = {
        bg: token(c, "--oak-surface", "#fffdf8"),
        grid: token(c, "--oak-border", "#ddd3c3"),
        text: token(c, "--oak-text-3", "#6e6457"),
        trace: token(c, "--oak-accent", "#2f6b45"),
        target: token(c, "--oak-lane-in", "rgba(47,107,69,0.06)"),
        amber: token(c, "--oak-accent-2", "#b7791f"),
      };
      g.fillStyle = col.bg;
      g.fillRect(0, 0, width, h);
      const lo = p.lowMidi ?? 40;
      const hi = p.highMidi ?? 76;
      const left = 36;
      const y = (m: number) => h - 8 - ((m - lo) / (hi - lo)) * (h - 16);
      // Note grid: a line per C (labelled) and a faint one per E and G.
      g.font = "11px ui-sans-serif, system-ui, sans-serif";
      g.textBaseline = "middle";
      for (let m = Math.ceil(lo); m <= hi; m++) {
        const pc = ((m % 12) + 12) % 12;
        if (pc !== 0 && pc !== 4 && pc !== 7) continue;
        g.strokeStyle = col.grid;
        g.globalAlpha = pc === 0 ? 1 : 0.45;
        g.beginPath();
        g.moveTo(left, y(m) + 0.5);
        g.lineTo(width, y(m) + 0.5);
        g.stroke();
        g.globalAlpha = 1;
        if (pc === 0) {
          g.fillStyle = col.text;
          g.fillText(formatNoteMidi(m), 4, y(m));
        }
      }
      const frames = p.frames();
      const now = frames.length ? (frames[frames.length - 1] as PitchFrame).t : 0;
      const win = p.windowSec ?? 6;
      const x = (t: number) => left + ((t - (now - win)) / win) * (width - left);
      // Target ribbon, folded into view.
      const tgt = p.target;
      if (tgt) {
        const band = tgt.cents / 100;
        g.fillStyle = tgt.hit ? col.trace : col.amber;
        g.globalAlpha = tgt.hit ? 0.22 : 0.16;
        g.fillRect(left, y(tgt.midi + band), width - left, y(tgt.midi - band) - y(tgt.midi + band));
        g.globalAlpha = 1;
        g.fillStyle = col.text;
        g.fillText(formatNoteMidi(tgt.midi), left + 4, y(tgt.midi + band) - 7);
      }
      for (const mk of p.marks ?? []) {
        g.setLineDash([4, 4]);
        g.strokeStyle = col.amber;
        g.beginPath();
        g.moveTo(left, y(mk.midi));
        g.lineTo(width, y(mk.midi));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = col.text;
        g.fillText(mk.label, width - g.measureText(mk.label).width - 6, y(mk.midi) - 8);
      }
      // The trace: gaps where unvoiced; folded to the target's octave when there is one.
      g.strokeStyle = col.trace;
      g.lineWidth = 3;
      g.lineJoin = "round";
      g.beginPath();
      let pen = false;
      for (const f of frames) {
        if (f.t < now - win) continue;
        if (!voiced(f)) {
          pen = false;
          continue;
        }
        let m = midiOfHz(f.hz);
        if (tgt) m -= Math.round((m - tgt.midi) / 12) * 12;
        if (m < lo - 1 || m > hi + 1) {
          pen = false;
          continue;
        }
        if (pen) g.lineTo(x(f.t), y(m));
        else g.moveTo(x(f.t), y(m));
        pen = true;
      }
      g.stroke();
      g.lineWidth = 1;
      if (p.live) raf = requestAnimationFrame(draw);
    };
    draw();
    if (props.live) raf = requestAnimationFrame(draw);
    // A still trace redraws when the theme or the width changes (Paper ↔ Bark).
    const redraw = () => {
      if (!propsRef.current.live) draw();
    };
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const ro2 = new ResizeObserver(redraw);
    ro2.observe(w);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ro2.disconnect();
      mo.disconnect();
    };
  }, [props.live]);

  return (
    <div ref={wrap} className="w-full overflow-hidden rounded-card border border-border">
      <canvas ref={canvas} role="img" aria-label={props.label} className="block" />
    </div>
  );
}
