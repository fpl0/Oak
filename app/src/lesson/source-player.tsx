// The source player of an ear step that is written down part by part (a by-ear transcription, a staged chord
// dictation): the hidden code plays through its own pattern player, at full speed or slower, once or looping,
// and the loop can be narrowed to one bar (wave3.md §0 gap: "the by-ear source loops the whole tune"). Chords are
// heard bass first one bar at a time, so the bar loop is where most of the listening happens. Keys: the bar
// buttons are a radio group (arrow keys move, Space picks); the player never takes a global key.
import type { PatternPlayer } from "@oak/strudel";
import { Pause, Play, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../lib/oak.ts";
import { Button } from "../ui/kit/Button.tsx";

export interface SourcePlayerProps {
  code: string;
  bars: number;
  /** Playback rates offered (1 = full speed); one rate hides the speed buttons. */
  rates: readonly number[];
  /** Offer the one-bar loop (default true when there is more than one bar). */
  barLoop?: boolean;
  /** "Play the tune", "Play the chords" … */
  noun: string;
  /** Called each time playback starts (the cue's replay count). */
  onPlay?(): void;
  testId?: string;
  /** The bar picked from outside (a part's first wrong bar), 1-based; `null` = the whole source. */
  focusBar?: number | null;
}

/** A loop region in 0-based bars: the whole source, or one bar. */
export function loopRegion(bars: number, bar: number | null): { fromBar: number; bars: number } {
  if (bar === null || bar < 1 || bar > bars) return { fromBar: 0, bars };
  return { fromBar: bar - 1, bars: 1 };
}

export function SourcePlayer({
  code,
  bars,
  rates: offered,
  barLoop,
  noun,
  onPlay,
  testId = "source-player",
  focusBar = null,
}: SourcePlayerProps) {
  const rates = offered.length > 0 ? offered : [1];
  const [rate, setRate] = useState(rates[0] ?? 1);
  const [loop, setLoop] = useState(true);
  const [bar, setBar] = useState<number | null>(focusBar);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useRef<PatternPlayer | null>(null);
  const timer = useRef<number | null>(null);
  const cps = useRef(0.5);
  const showBars = (barLoop ?? true) && bars > 1;
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );
  useEffect(() => {
    if (focusBar !== null) pickBar(focusBar);
  }, [focusBar]);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    player.current?.stop();
    setPlaying(false);
  };
  const armEnd = (r: number, looping: boolean, b: number | null) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    // Without the loop the source (or the bar) plays once through and stops.
    const span = loopRegion(bars, b).bars;
    if (!looping) timer.current = window.setTimeout(stop, (span * 1000) / (cps.current * r) + 200);
  };
  const apply = (looping: boolean, b: number | null) => {
    const region = loopRegion(bars, b);
    // A single bar always loops on itself when looping; played once, it starts at its own bar line.
    player.current?.setLoop(looping || b !== null ? region : null);
  };
  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    setFailed(false);
    try {
      const oak = await getOak();
      await oak.unlock();
      player.current ??= oak.createPatternPlayer();
      const out = await player.current.load(code, { bars, cps: 0 });
      if (!out.ok) throw new Error("the source did not run");
      cps.current = out.cps ?? 0.5;
      player.current.setRate(rate);
      apply(loop, bar);
      await player.current.play();
      setPlaying(true);
      onPlay?.();
      armEnd(rate, loop, bar);
    } catch {
      setFailed(true);
      setPlaying(false);
    }
  };
  const pickRate = (r: number) => {
    setRate(r);
    player.current?.setRate(r);
    if (playing) armEnd(r, loop, bar);
  };
  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    apply(next, bar);
    if (playing) armEnd(rate, next, bar);
  };
  function pickBar(b: number | null) {
    setBar(b);
    apply(loop, b);
    if (playing) armEnd(rate, loop, b);
  }
  const choices: (number | null)[] = [null, ...Array.from({ length: bars }, (_, i) => i + 1)];
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          onClick={() => void play()}
          data-testid="play-source"
          data-playing={playing ? "1" : "0"}
        >
          {playing ? `Stop the ${noun}` : `Play the ${noun}`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={loop}
          icon={<Repeat aria-hidden className="size-4" />}
          onClick={toggleLoop}
          data-testid="loop-source"
        >
          {loop ? "Looping" : "Once"}
        </Button>
      </div>
      {showBars && (
        <div role="radiogroup" aria-label="Loop which bars" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-text-2">Bars</span>
          {choices.map((b) => (
            <Button
              key={b ?? "all"}
              size="sm"
              role="radio"
              aria-checked={bar === b}
              variant={bar === b ? "primary" : "secondary"}
              onClick={() => pickBar(b)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const i = choices.indexOf(bar);
                const next =
                  choices[(i + (e.key === "ArrowRight" ? 1 : choices.length - 1)) % choices.length];
                pickBar(next ?? null);
                const group = e.currentTarget.parentElement;
                const idx = choices.indexOf(next ?? null);
                (group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[idx] ?? null)?.focus();
              }}
              tabIndex={bar === b ? 0 : -1}
              data-testid={b === null ? "loop-bar-all" : `loop-bar-${b}`}
            >
              {b === null ? "All" : b}
            </Button>
          ))}
        </div>
      )}
      {rates.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Speed</legend>
          <span className="text-sm text-text-2">Speed</span>
          {rates.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === rate ? "primary" : "secondary"}
              aria-pressed={r === rate}
              onClick={() => pickRate(r)}
              data-testid={`rate-${r}`}
            >
              {r === 1 ? "Full" : `${Math.round(r * 100)}%`}
            </Button>
          ))}
        </fieldset>
      )}
      {failed && (
        <p className="text-sm text-text-2">The sound did not start. Press any key, then try again.</p>
      )}
    </div>
  );
}
