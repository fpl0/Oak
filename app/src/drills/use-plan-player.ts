// A one-at-a-time player for plans the learner asks for outside the machine's own stages (dictation's
// "Play mine" and A/B at the bar). A new play stops the previous one; unmounting stops everything.
import type { AudioPlan } from "@oak/drills";
import type { PlaybackHandle } from "@oak/strudel";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../lib/oak.ts";
import { playSettled, preloadSpec } from "./runtime.ts";

export function usePlanPlayer(): {
  playing: string | null;
  play(id: string, plan: AudioPlan): void;
  stop(): void;
} {
  const handle = useRef<PlaybackHandle | null>(null);
  const token = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = () => {
    token.current++;
    handle.current?.stop();
    handle.current = null;
    setPlaying(null);
  };
  useEffect(
    () => () => {
      token.current++;
      handle.current?.stop();
    },
    [],
  );
  const play = (id: string, plan: AudioPlan) => {
    stop();
    if (plan.events.length === 0) return;
    const mine = ++token.current;
    setPlaying(id);
    void (async () => {
      try {
        const oak = await getOak();
        if (plan.preload.length > 0) await oak.preload(preloadSpec(plan.preload)).catch(() => {});
        if (mine !== token.current) return;
        const h = playSettled(oak, plan, { at: oak.ctx.currentTime + 0.1 });
        handle.current = h;
        await h.done;
      } catch {
        // Sound failed to start: nothing to stop.
      } finally {
        if (mine === token.current) {
          handle.current = null;
          setPlaying(null);
        }
      }
    })();
  };
  return { playing, play, stop };
}
