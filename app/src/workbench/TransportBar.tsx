// TransportBar (ux §3.4, 44 px): play/stop, the bar.beat counter from the adapter's clock, the tempo the
// code's own setcpm set, meter and key, the practice tempo, and one mute/solo chip per track label (the
// adapter's live mute: the code is never rewritten).
import type { KeySpec, MeterSpec } from "@oak/content-kit";
import type { MuteMap } from "@oak/strudel";
import { useEffect, useRef } from "react";
import type { WorkbenchClock } from "./clock.ts";
import type { RegionStep } from "./loop-math.ts";
import { beatOf } from "./metronome.ts";
import { barBeat, bpmText, chipState, type PracticeTempo } from "./transport-math.ts";

/** The loop region control (`L`, `[`/`]`, `Shift+[`/`Shift+]`). */
export interface TransportLoop {
  on: boolean;
  /** "bars 1–2". */
  label: string;
  onToggle(): void;
  onStep(step: RegionStep): void;
  can: Record<RegionStep, boolean>;
}

/** The metronome control (`M`) and its visual twin (a beat dot per tempo unit). */
export interface TransportMetronome {
  on: boolean;
  onToggle(): void;
}

export interface TransportBarProps {
  playing: boolean;
  busy?: boolean;
  onToggle(): void;
  clock: WorkbenchClock;
  meter: MeterSpec;
  /** cps of the analysed or playing code; null before the first analysis. */
  cps: number | null;
  /** True when the code never set a tempo (the default 0.5 cps applies). */
  cpsDefault?: boolean;
  loopBars: number;
  keySpec: KeySpec | null;
  tracks: readonly string[];
  mutes: MuteMap;
  onMute(label: string): void;
  onSolo(label: string): void;
  practiceTempo: PracticeTempo;
  onPracticeTempo(): void;
  readOnly?: boolean;
  /** Loop region (absent: no loop control). */
  loop?: TransportLoop;
  /** Metronome (absent: no metronome control). */
  metronome?: TransportMetronome;
}

function keyText(k: KeySpec | null): string | null {
  if (!k) return null;
  return `${k.tonic.replace("#", "♯").replace(/(?<=[A-G])b/, "♭")} ${k.mode}`;
}

export function TransportBar(p: TransportBarProps) {
  const counter = useRef<HTMLSpanElement>(null);
  const lastText = useRef("");
  useEffect(() => {
    const paint = () => {
      const f = p.clock.get();
      const text = barBeat(f.playing ? f.audibleCycle : 0, p.meter, p.loopBars).text;
      if (text !== lastText.current && counter.current) {
        counter.current.textContent = text;
        lastText.current = text;
      }
    };
    paint();
    return p.clock.subscribe(paint);
  }, [p.clock, p.meter, p.loopBars]);

  // The metronome's visual twin: one dot per tempo unit, the current beat lit while playing.
  const beats = useRef<HTMLSpanElement>(null);
  const metronomeOn = p.metronome?.on ?? false;
  useEffect(() => {
    if (!metronomeOn) return;
    let last = -2;
    const paint = () => {
      const f = p.clock.get();
      const beat = f.playing ? beatOf(f.audibleCycle, p.meter.unitsPerBar) : -1;
      if (beat === last || !beats.current) return;
      last = beat;
      beats.current.querySelectorAll("i").forEach((dot, i) => {
        dot.dataset.on = i === beat ? "1" : "0";
      });
    };
    paint();
    return p.clock.subscribe(paint);
  }, [p.clock, p.meter, metronomeOn]);

  const bpm = p.cps ? bpmText(p.cps * p.practiceTempo, p.meter) : null;
  return (
    <div className="oak-transport" role="toolbar" aria-label="Transport" data-testid="transport">
      <button
        type="button"
        className="oak-play"
        onClick={p.onToggle}
        disabled={p.busy}
        aria-pressed={p.playing}
        data-testid="play-toggle"
        aria-label={p.playing ? "Stop" : "Play"}
      >
        {p.playing ? "■" : "▶"}
      </button>
      <span className="oak-counter" ref={counter} data-testid="bar-counter" aria-live="off">
        1.1 / {p.loopBars}
      </span>
      <span className="oak-tempo" data-testid="tempo">
        {/* No tempo until the code has run once: show the meter alone rather than a dash. */}
        {bpm ? `${bpm} BPM · ` : ""}
        {p.meter.id}
        {p.cpsDefault ? (
          <span className="oak-muted" title="No setcpm line: Strudel's default tempo">
            {" "}
            (default)
          </span>
        ) : null}
      </span>
      {keyText(p.keySpec) ? <span className="oak-key-name">{keyText(p.keySpec)}</span> : null}
      <button
        type="button"
        className="oak-link-button"
        onClick={p.onPracticeTempo}
        title="Practice tempo (the code is untouched)"
      >
        Practice {Math.round(p.practiceTempo * 100)}%
      </button>
      {p.loop ? (
        <span className="oak-loop-step" data-testid="loop-control">
          <button
            type="button"
            className="oak-toggle"
            aria-pressed={p.loop.on}
            onClick={p.loop.onToggle}
            title="Loop a region (L; [ and ] change its length, Shift+[ and Shift+] move it)"
            data-testid="loop-toggle"
          >
            Loop {p.loop.label}
          </button>
          <button
            type="button"
            aria-label="Loop one bar shorter"
            title="Shorter ([)"
            disabled={!p.loop.can.shrink}
            onClick={() => p.loop?.onStep("shrink")}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Loop one bar longer"
            title="Longer (])"
            disabled={!p.loop.can.extend}
            onClick={() => p.loop?.onStep("extend")}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Move the loop one bar earlier"
            title="Earlier (Shift+[)"
            disabled={!p.loop.can.earlier}
            onClick={() => p.loop?.onStep("earlier")}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Move the loop one bar later"
            title="Later (Shift+])"
            disabled={!p.loop.can.later}
            onClick={() => p.loop?.onStep("later")}
          >
            ›
          </button>
        </span>
      ) : null}
      {p.metronome ? (
        <button
          type="button"
          className="oak-toggle"
          aria-pressed={p.metronome.on}
          onClick={p.metronome.onToggle}
          title="Metronome (M): a click on every beat, never written into the code"
          data-testid="metronome-toggle"
        >
          Metronome
          {p.metronome.on ? (
            <span className="oak-beats" ref={beats} aria-hidden data-testid="metronome-beats">
              {Array.from({ length: Math.max(1, Math.round(p.meter.unitsPerBar)) }, (_, i) => (
                <i key={i} data-accent={i === 0 ? "1" : "0"} data-on="0" />
              ))}
            </span>
          ) : null}
        </button>
      ) : null}
      <span className="oak-chips">
        {p.tracks.map((t) => {
          const st = chipState(t, p.mutes);
          return (
            <span key={t} className={`oak-track-chip ${st}`} data-track={t} data-state={st}>
              <button
                type="button"
                aria-pressed={st === "muted"}
                onClick={() => p.onMute(t)}
                title={`Mute ${t}`}
                data-testid={`mute-${t}`}
              >
                {t.startsWith("band.") ? `${t.slice(5)} (band)` : t}
              </button>
              <button
                type="button"
                aria-pressed={st === "solo"}
                onClick={() => p.onSolo(t)}
                title={`Solo ${t}`}
                data-testid={`solo-${t}`}
              >
                S
              </button>
            </span>
          );
        })}
      </span>
      {p.readOnly ? <span className="oak-badge">read-only</span> : null}
    </div>
  );
}
