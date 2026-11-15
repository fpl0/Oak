// Oak's scope and spectrum panel (Wave 5, docs/design/wave5.md §3.4, §4.4; contracts §3.1 rule 9: `.scope()` and
// `.fscope()` draw here, never on Strudel's canvas). The live wave (triggered, so a held note stands still) and the
// spectrum of the master bus (or one track, once the sound engineer taps tracks), the harmonics of a simple wave
// labelled by number, frequency and note, and the visual probe of the step or the code: the filter curve, the
// envelope's shape or the delay's echoes, drawn from the values the code sets (no audio needed). The frame loop
// runs only while something plays, at most 30 frames a second (10 with reduced motion), and measures itself:
// `data-frame-ms` on the panel is the mean cost of a frame, so a test can hold it under budget.
import { harmonicLevels, spectrumBands, steadyWave } from "@oak/audio";
import type { ScopeTap } from "@oak/strudel";
import type { VisualProbe } from "@oak/strudel/probes";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../ui/theme/motion.ts";
import {
  fitWave,
  harmonicRows,
  isSilent,
  PROBE_BEFORE_RUN,
  PROBE_HINTS,
  PROBE_TITLES,
  probeCaption,
  probeGeometry,
  SCOPE_FPS,
  SCOPE_FPS_REDUCED,
  spectrumBars,
  wavePoints,
} from "./scope-view.ts";
import { RegisterBands } from "./TrackStrips.tsx";
import type { RegisterLens } from "./track-lens.ts";

export interface ScopePanelProps {
  tap: ScopeTap;
  /** Which live views are open: the wave (`.scope()`, tb.scope) and the spectrum (`.fscope()`, tb.fscope). */
  show: { wave: boolean; spectrum: boolean };
  playing: boolean;
  /** The probe for the code that ran, `null` when it sets nothing the probe draws. */
  probe: VisualProbe | null;
  /** The probe the step (or the code) asks for: with no `probe`, its hint says what to add. */
  probeKind: VisualProbe["kind"] | null;
  /** The fundamental of the probed note (harmonics), Hz. */
  f0: number | null;
  /** One line under the title: what the panel listens to ("the whole mix", or why a track fell back to it). */
  sourceNote: string;
  /** The code has run at least once (before that a probe has nothing to read yet). */
  ran: boolean;
  /** Wave 7, the register lens (A2.L01): the register bands and each part's range on the spectrum's own axis. */
  registers?: RegisterLens | null;
}

const WAVE_H = 88;
const SPEC_H = 88;

interface Colors {
  surface: string;
  border: string;
  text2: string;
  accent: string;
  accent2: string;
}

function colorsOf(el: Element): Colors {
  const cs = getComputedStyle(el);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    surface: v("--wb-surface", "#fffdf8"),
    border: v("--wb-border", "#ddd3c3"),
    text2: v("--wb-text-2", "#5c5247"),
    accent: v("--wb-accent", "#2f6b45"),
    accent2: v("--wb-blue", "#0b5f8a"),
  };
}

function fit(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const g = canvas.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

export function ScopePanel(p: ScopePanelProps) {
  const root = useRef<HTMLElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(320);
  const [heard, setHeard] = useState(false);
  const heardRef = useRef(false);
  const [levels, setLevels] = useState<(number | null)[] | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 320);
      if (w > 0) setWidth(Math.max(160, w - 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new sound (another fundamental or other harmonics) never shows the last one's measured levels.
  const harmonicsKey =
    p.probe?.kind === "harmonics" ? `${p.f0 ?? ""}|${JSON.stringify(p.probe)}` : `${p.probe?.kind ?? ""}`;
  useEffect(() => {
    setLevels(null);
  }, [harmonicsKey]);

  // The frame loop: only while playing, throttled, measured.
  useEffect(() => {
    const tap = p.tap;
    const waveBuf = new Float32Array(tap.fftSize);
    const specBuf = new Float32Array(tap.fftSize / 2);
    let raf = 0;
    let last = 0;
    let frames = 0;
    let cost = 0;
    // Levels are measured from the frames of this run only: a restart clears the last run's, and the first
    // measurement waits a few frames so the analyser's smoothing holds no sound from before.
    let lastLevels = performance.now() - 200;
    if (p.playing) setLevels(null);
    const interval = 1000 / (reduced ? SCOPE_FPS_REDUCED : SCOPE_FPS);
    const draw = () => {
      const cur = propsRef.current;
      const c = root.current ? colorsOf(root.current) : null;
      if (!c) return;
      const w = Math.max(160, root.current?.clientWidth ? root.current.clientWidth - 26 : width);
      const t0 = performance.now();
      const samples = cur.playing ? tap.wave(waveBuf) : new Float32Array(0);
      const silent = !cur.playing || isSilent(samples);
      if (silent === heardRef.current) {
        heardRef.current = !silent;
        setHeard(!silent);
      }
      const wc = waveRef.current;
      if (wc && cur.show.wave) {
        const g = fit(wc, w, WAVE_H);
        if (g) {
          g.fillStyle = c.surface;
          g.fillRect(0, 0, w, WAVE_H);
          g.strokeStyle = c.border;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(0, WAVE_H / 2 + 0.5);
          g.lineTo(w, WAVE_H / 2 + 0.5);
          g.stroke();
          if (!silent) {
            // Scaled to fit: a quiet mix still shows its shape (the caption says the height is not the level).
            const pts = wavePoints(fitWave(steadyWave(samples)), w, WAVE_H);
            g.strokeStyle = c.accent;
            g.lineWidth = 2;
            g.beginPath();
            for (const [i, [x, y]] of pts.entries()) {
              if (i === 0) g.moveTo(x, y);
              else g.lineTo(x, y);
            }
            g.stroke();
          }
        }
      }
      const sc = specRef.current;
      let spec: Float32Array | null = null;
      if (sc && cur.show.spectrum) {
        const g = fit(sc, w, SPEC_H);
        if (g) {
          g.fillStyle = c.surface;
          g.fillRect(0, 0, w, SPEC_H);
          if (!silent) {
            spec = tap.spectrum(specBuf);
            const bars = spectrumBars(spectrumBands(spec, tap.sampleRate, { bands: 48 }), w, SPEC_H);
            g.fillStyle = c.accent2;
            for (const b of bars) g.fillRect(b.x, SPEC_H - b.h, b.w, b.h);
          }
        }
      }
      // Harmonics measured on the spectrum, at most twice a second (text, not a picture). The spectrum is read on
      // every frame all the same: the analyser smooths each read with the one before, so reads half a second apart
      // would blend the sound that played before (a sine's fundamental into the sawtooth that replaced it).
      const now = performance.now();
      if (cur.probe?.kind === "harmonics" && cur.f0) {
        if (!silent) spec ??= tap.spectrum(specBuf);
        if (now - lastLevels > 500) {
          lastLevels = now;
          setLevels(silent || !spec ? null : harmonicLevels(spec, tap.sampleRate, cur.f0, 8));
        }
      }
      cost += performance.now() - t0;
      frames++;
      if (frames % 15 === 0 && root.current) {
        root.current.dataset.frameMs = (cost / frames).toFixed(3);
        root.current.dataset.frames = String(frames);
      }
    };
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < interval) return;
      last = t;
      draw();
    };
    if (p.playing) raf = requestAnimationFrame(loop);
    else draw();
    return () => cancelAnimationFrame(raf);
  }, [p.tap, p.playing, reduced, width]);

  const anyLive = p.show.wave || p.show.spectrum;
  return (
    <section
      ref={root}
      className="oak-wb-panel oak-scope"
      aria-label="Scope"
      data-testid="scope-panel"
      data-heard={heard ? "1" : "0"}
    >
      <h3 className="oak-wb-panel-title">
        <span className="oak-muted">Scope</span>{" "}
        <span className="oak-scope-source" data-testid="scope-source">
          {p.sourceNote}
        </span>
      </h3>
      {anyLive ? (
        <div className="oak-scope-live">
          {p.show.wave ? (
            <canvas
              ref={waveRef}
              className="oak-scope-canvas"
              role="img"
              aria-label="The wave of what plays now, scaled to fit"
              data-testid="scope-wave"
            />
          ) : null}
          {p.show.spectrum ? (
            <canvas
              ref={specRef}
              className="oak-scope-canvas"
              role="img"
              aria-label="The spectrum of what plays now: low frequencies on the left"
              data-testid="scope-spectrum"
            />
          ) : null}
          {!heard ? (
            <p className="oak-scope-idle" data-testid="scope-idle">
              {p.playing ? "Listening… nothing sounds yet." : "Press Play to see the wave."}
            </p>
          ) : null}
        </div>
      ) : null}
      {p.show.spectrum && p.registers ? <RegisterBands registers={p.registers} /> : null}
      {p.probeKind || p.probe ? (
        <ProbeView
          probe={p.probe}
          kind={(p.probe?.kind ?? p.probeKind) as VisualProbe["kind"]}
          f0={p.f0}
          levels={levels}
          ran={p.ran}
        />
      ) : null}
    </section>
  );
}

const PW = 280;
const PH = 84;

/** One probe: its picture (SVG, both themes through currentColor), its caption and, for harmonics, the rows. */
export function ProbeView({
  probe,
  kind,
  f0,
  levels,
  ran,
}: {
  probe: VisualProbe | null;
  kind: VisualProbe["kind"];
  f0: number | null;
  levels?: readonly (number | null)[] | null;
  ran: boolean;
}) {
  if (!probe)
    return (
      <div className="oak-probe" data-testid="probe" data-kind={kind} data-empty="1">
        <h4 className="oak-probe-title">{PROBE_TITLES[kind]}</h4>
        <p className="oak-muted">{ran ? PROBE_HINTS[kind] : PROBE_BEFORE_RUN[kind]}</p>
      </div>
    );
  const geo = probeGeometry(probe, PW, PH);
  const rows = probe.kind === "harmonics" ? harmonicRows(probe, f0) : [];
  const fundamental = levels?.[0] ?? null;
  return (
    <div className="oak-probe" data-testid="probe" data-kind={probe.kind}>
      <h4 className="oak-probe-title">{PROBE_TITLES[probe.kind]}</h4>
      <svg
        viewBox={`0 -14 ${PW} ${PH + 46}`}
        className="oak-probe-svg"
        role="img"
        aria-label={probeCaption(probe)}
        data-testid="probe-svg"
      >
        <line x1={0} y1={PH} x2={PW} y2={PH} className="oak-probe-axis" />
        {probe.kind === "filter" ? (
          <line x1={0} y1={(18 / 54) * PH} x2={PW} y2={(18 / 54) * PH} className="oak-probe-zero" />
        ) : null}
        {geo.path ? <path d={geo.path} className="oak-probe-curve" data-testid="probe-curve" /> : null}
        {geo.bars.map((b) => (
          <g key={`${b.label}-${b.x}`}>
            <rect x={b.x} y={PH - b.h} width={b.w} height={b.h} className="oak-probe-bar" />
            <text x={b.x + b.w / 2} y={PH + 12} textAnchor="middle" className="oak-probe-label">
              {b.label}
            </text>
          </g>
        ))}
        {geo.marks.map((m) => (
          <g key={`${m.label}-${m.x}`}>
            <line x1={m.x} y1={0} x2={m.x} y2={PH} className="oak-probe-mark" />
            <text x={Math.min(PW - 2, m.x + 3)} y={-3} className="oak-probe-label">
              {m.label}
            </text>
          </g>
        ))}
        <text x={0} y={PH + 26} className="oak-probe-label">
          {geo.axis.left}
        </text>
        <text x={PW} y={PH + 26} textAnchor="end" className="oak-probe-label">
          {geo.axis.right}
        </text>
      </svg>
      <p className="oak-probe-caption" data-testid="probe-caption">
        {probeCaption(probe)}
      </p>
      {rows.length > 0 ? (
        <ol className="oak-harmonics" aria-label="Harmonics" data-testid="harmonics">
          {rows.map((r, i) => {
            const lv = levels?.[i];
            const rel =
              lv != null && fundamental != null && Number.isFinite(lv) && Number.isFinite(fundamental)
                ? Math.round(lv - fundamental)
                : null;
            return (
              <li key={r.n} data-amp={r.amp.toFixed(3)}>
                <b>{r.n}</b>
                {f0 ? (
                  <span>
                    {" "}
                    {r.hz} Hz · {r.near ? "" : "≈"}
                    {r.note}
                  </span>
                ) : null}
                <span className="oak-muted"> {r.amp === 0 ? "· none" : `· ${Math.round(r.amp * 100)}%`}</span>
                {rel !== null && i > 0 ? <span className="oak-muted"> · heard {rel} dB</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
