// Loop-region playback (ux §3.4 "Loop ⟲ bars 1–2"). The adapter's editor has no loop of its own, so a looping
// region plays through the hidden PatternPlayer (`.ribbon(fromBar, bars)`, no editor, nothing in the DOM):
// the code text is never touched, the region, the mutes and the practice tempo change live, and the
// coordinator stops the editor (and anything else) when the loop starts. The playhead is driven from the
// transport clock mapped into the region, so the roll, the staff and the bar counter follow the loop.
import type { LintContext } from "@oak/content-kit";
import type { BandSetup, EditorHandle, EvalOutcome, MuteMap, OakStrudel, PatternPlayer } from "@oak/strudel";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbenchClock } from "./clock.ts";
import { codeWithBand, type LoopRegion, loopPosition, mutesForLoop } from "./loop-math.ts";

export interface UseLoopOptions {
  oak: OakStrudel;
  handle: EditorHandle | null;
  clock: WorkbenchClock;
  /** Called every frame with the bar position while the loop plays (roll and staff highlights). */
  onPosition(position: number): void;
  onStopped(): void;
  lint: LintContext;
  loopBars: number;
  band: BandSetup | null;
  mutes: MuteMap;
  region: LoopRegion;
  /** Practice tempo (1, 0.85, 0.7, 0.5): the player's rate. */
  rate: number;
}

export interface LoopPlayback {
  playing: boolean;
  /** Loads `code` (and the Band) and plays the region. Resolves with the load outcome. */
  start(code: string): Promise<EvalOutcome | null>;
  stop(): void;
}

export function useLoopPlayback(opts: UseLoopOptions): LoopPlayback {
  const [playing, setPlaying] = useState(false);
  const player = useRef<PatternPlayer | null>(null);
  const raf = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const playingRef = useRef(false);

  const halt = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      optsRef.current.clock.stop();
      optsRef.current.onStopped();
    }
  }, []);

  const frame = useCallback(() => {
    raf.current = 0;
    const o = optsRef.current;
    const p = player.current;
    if (!p?.playing) {
      // Stopped from elsewhere: another source claimed the coordinator, or the panic key.
      halt();
      return;
    }
    const position = loopPosition(o.oak.transport.audibleCycle(), o.region);
    o.clock.tick(position);
    o.onPosition(position);
    raf.current = requestAnimationFrame(frame);
  }, [halt]);

  const start = useCallback(
    async (code: string): Promise<EvalOutcome | null> => {
      const o = optsRef.current;
      await o.oak.unlock();
      player.current ??= o.oak.createPatternPlayer();
      const p = player.current;
      const load = (text: string) => p.load(text, { bars: o.loopBars, cps: 0, lint: o.lint });
      let outcome = await load(codeWithBand(code, o.band));
      // A Band that cannot join (for example a locked tool under a graded lint) never silences the learner.
      if (!outcome.ok && o.band) outcome = await load(code);
      if (!outcome.ok) return outcome;
      const now = optsRef.current;
      p.setLoop({ fromBar: now.region.from, bars: now.region.bars });
      p.setMutes(mutesForLoop(now.mutes));
      p.setRate(now.rate);
      now.handle?.stop();
      await p.play();
      playingRef.current = true;
      setPlaying(true);
      if (!raf.current) raf.current = requestAnimationFrame(frame);
      return outcome;
    },
    [frame],
  );

  const stop = useCallback(() => {
    player.current?.stop();
    halt();
  }, [halt]);

  // Live changes while looping: the region, the mutes and the practice tempo.
  useEffect(() => {
    player.current?.setLoop({ fromBar: opts.region.from, bars: opts.region.bars });
  }, [opts.region.from, opts.region.bars]);
  useEffect(() => {
    player.current?.setMutes(mutesForLoop(opts.mutes));
  }, [opts.mutes]);
  useEffect(() => {
    player.current?.setRate(opts.rate);
  }, [opts.rate]);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  return { playing, start, stop };
}
