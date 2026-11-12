// A by-ear transcription step (wave3.md §10, `DictationEx.byEar`): the source plays with its code, roll and staff
// hidden; the learner writes code in the Workbench and switches between the source and their own code at the
// bar (the Workbench's A/B, `A`/`B` and Shift+A), at full speed or slower here. The rule of what counts (exact,
// any octave, any key) is shown before they start. Once solved or revealed, the source's roll and staff appear.
import { Pause, Play, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../lib/oak.ts";
import { Button } from "../ui/kit/Button.tsx";
import { useStepHost } from "./frame.tsx";
import { CodeMusic } from "./music.tsx";
import { acceptsText, type ByEarEx, byEarSource } from "./rules.ts";

/** The rule and the source's own player (rates, loop); the A/B against your code is on the Workbench. */
export function ByEarPanel({ ex }: { ex: ByEarEx }) {
  const h = useStepHost();
  const rule = acceptsText(ex.byEar.accepts);
  const src = byEarSource(ex);
  const rates = ex.byEar.rates.length > 0 ? ex.byEar.rates : [1];
  const [rate, setRate] = useState(rates[0] ?? 1);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useRef<import("@oak/strudel").PatternPlayer | null>(null);
  const timer = useRef<number | null>(null);
  const cps = useRef(0.5);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    player.current?.stop();
    setPlaying(false);
  };
  const armEnd = (r: number, looping: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    // Without the loop the source plays once through and stops at its last bar.
    if (!looping) timer.current = window.setTimeout(stop, (src.bars * 1000) / (cps.current * r) + 200);
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
      const out = await player.current.load(src.code, { bars: src.bars, cps: 0 });
      if (!out.ok) throw new Error("the source did not run");
      cps.current = out.cps ?? 0.5;
      player.current.setRate(rate);
      player.current.setLoop(loop ? { fromBar: 0, bars: src.bars } : null);
      await player.current.play();
      setPlaying(true);
      armEnd(rate, loop);
    } catch {
      setFailed(true);
      setPlaying(false);
    }
  };
  const pickRate = (r: number) => {
    setRate(r);
    player.current?.setRate(r);
    if (playing) armEnd(r, loop);
  };
  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    player.current?.setLoop(next ? { fromBar: 0, bars: src.bars } : null);
    if (playing) armEnd(rate, next);
  };
  return (
    <section
      aria-label="The tune to write down"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
      data-testid="by-ear"
      data-accepts={ex.byEar.accepts}
    >
      <div>
        <p className="text-sm font-medium" data-testid="by-ear-rule">
          What counts: {rule.title.toLowerCase()}
        </p>
        <p className="text-sm text-text-2">{rule.body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          onClick={() => void play()}
          data-testid="play-source"
          data-playing={playing ? "1" : "0"}
        >
          {playing ? "Stop the tune" : "Play the tune"}
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
      {rates.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Speed of the tune</legend>
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
      {ex.byEar.ab && (
        <p className="text-sm text-text-3">
          On the Workbench, A plays your code and B the tune, switching at the next bar line.
        </p>
      )}
      {failed && (
        <p className="text-sm text-text-2">The tune did not start. Press any key, then try again.</p>
      )}
      {h.passed || h.rung >= 4 ? <SourceRevealed ex={ex} /> : null}
    </section>
  );
}

/** After a pass or the reveal: the source on the roll and the staff, to compare with what you wrote. */
function SourceRevealed({ ex }: { ex: ByEarEx }) {
  const src = byEarSource(ex);
  return (
    <div className="flex flex-col gap-2" data-testid="source-revealed">
      <p className="text-sm font-medium">The tune, as it was written</p>
      <CodeMusic code={src.code} bars={src.bars} view="roll" label="The tune on the roll" />
      <CodeMusic code={src.code} bars={src.bars} view="staff" label="The tune on the staff" />
    </div>
  );
}
