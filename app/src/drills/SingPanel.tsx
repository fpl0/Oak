// The PitchLane of a sing trial (ux §4.3): target ribbons as tall as the learner's tolerance, the live trace
// folded to the target's octave (an octave off is never wrong), a needle in words, and a text alternative.
// Drawn on a canvas from the live store, so the trace never re-renders React per frame.
import type { Trial } from "@oak/api";
import { useEffect, useRef, useState } from "react";
import { dbToLevel, MicLevelMeter } from "../ui/kit/Meters.tsx";
import { useLive } from "./runtime.ts";

export interface SingTarget {
  midi: number;
  on: number;
  off: number;
}

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export const noteName = (midi: number): string =>
  `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

/** Folds a sung pitch to the octave nearest the target (contracts §8.1: per-note octave folding). */
export function fold(midi: number, target: number): number {
  return midi + 12 * Math.round((target - midi) / 12);
}

/** The target sounding at `t`, else the nearest one in time. */
export function targetAt(targets: readonly SingTarget[], t: number): SingTarget | null {
  let best: SingTarget | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const g of targets) {
    const d = t < g.on ? g.on - t : t > g.off ? t - g.off : 0;
    if (d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

/** "a little low (−30¢)", "spot on", "a little high (+40¢)". */
export function needleText(cents: number, tol: number): string {
  const c = Math.round(cents);
  if (Math.abs(c) <= Math.max(10, tol / 3)) return "spot on";
  const word = Math.abs(c) > tol ? "" : "a little ";
  return `${word}${c < 0 ? "low" : "high"} (${c > 0 ? "+" : "−"}${Math.abs(c)}¢)`;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function SingPanel({
  trial,
  targets,
  tolCents,
  active,
  micOpen,
  label,
  labels,
}: {
  trial: Trial;
  targets: readonly SingTarget[];
  tolCents: number;
  /** Ribbon labels per target ("5", "5 · sol"); note names when absent (an unkeyed trial). */
  labels?: readonly string[] | undefined;
  /** The sung window is open (the trace and needle are live). */
  active: boolean;
  /** The microphone is open (the level meter is live). */
  micOpen: boolean;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labelText = labels ?? targets.map((t) => noteName(t.midi));
  const [needle, setNeedle] = useState<string | null>(null);
  const levelDb = useLive((s) => s.levelDb);
  const span = Math.max(1, ...targets.map((t) => t.off)) + 0.4;
  const lo = Math.min(...targets.map((t) => t.midi)) - 3;
  const hi = Math.max(...targets.map((t) => t.midi)) + 3;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let last = 0;
    const draw = () => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr)) el.width = Math.round(w * dpr);
      if (el.height !== Math.round(h * dpr)) el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const x = (t: number) => (Math.max(0, Math.min(span, t)) / span) * w;
      const y = (m: number) => h - ((m - lo) / Math.max(1, hi - lo)) * h;
      const accent = cssVar("--oak-accent", "#2f6b45");
      const text2 = cssVar("--oak-text-3", "#6e6457");
      const lane = cssVar("--oak-lane-in", "rgba(47,107,69,0.08)");
      // Ribbons: ±tolerance around each target.
      for (const g of targets) {
        const band = tolCents / 100;
        ctx.fillStyle = lane;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        const top = y(g.midi + band);
        const bot = y(g.midi - band);
        ctx.fillRect(x(g.on), top, x(g.off) - x(g.on), bot - top);
        ctx.strokeRect(x(g.on) + 0.5, top + 0.5, x(g.off) - x(g.on) - 1, bot - top - 1);
        ctx.fillStyle = text2;
        ctx.font = "12px var(--oak-font-sans, system-ui)";
        ctx.fillText(labelText[targets.indexOf(g)] ?? noteName(g.midi), x(g.on) + 4, top - 4);
      }
      // The live trace, folded to the target octave; gaps where unvoiced.
      const frames = useLive.getState().frames;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let pen = false;
      let latest: { t: number; m: number } | null = null;
      for (const f of frames) {
        if (f.midi === null || f.t < 0) {
          pen = false;
          continue;
        }
        const g = targetAt(targets, f.t);
        const m = g ? fold(f.midi, g.midi) : f.midi;
        const px = x(f.t);
        const py = y(Math.max(lo, Math.min(hi, m)));
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
        latest = { t: f.t, m };
      }
      ctx.stroke();
      const now = performance.now();
      if (latest && now - last > 250) {
        last = now;
        const g = targetAt(targets, latest.t);
        if (g) setNeedle(needleText((latest.m - g.midi) * 100, tolCents));
      }
    };
    draw();
    const unsub = useLive.subscribe(draw);
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => {
      unsub();
      window.removeEventListener("resize", onResize);
    };
  }, [targets, tolCents, span, lo, hi, labelText]);

  const first = targets[0];
  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        className="h-36 w-full rounded-control border border-border bg-surface-2"
        aria-hidden
        data-testid="pitch-lane"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-2" aria-live="polite" data-testid="sing-needle">
          {first
            ? `Target ${targets.length > 1 ? labelText.join(", ") : (labelText[0] ?? noteName(first.midi))}.`
            : label}{" "}
          {active && needle ? `You are ${needle}.` : ""}
        </p>
        <MicLevelMeter
          className="w-56"
          live={micOpen}
          level={dbToLevel(levelDb)}
          label="Your voice"
          segments={16}
        />
      </div>
      {trial.params.mode === "sing" && !active && (
        <p className="text-sm text-text-3">Any vowel works. An octave higher or lower counts.</p>
      )}
    </div>
  );
}
