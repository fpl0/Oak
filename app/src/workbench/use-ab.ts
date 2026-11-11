// "Hear the difference" (ux §3.6): A plays the learner's code in its editor, B plays the target as hidden
// code through the adapter's PatternPlayer (no editor, nothing in the DOM). A switch waits for the next
// downbeat of whatever plays now; Shift+A alternates yours/target every bar.
import type { EditorHandle, OakStrudel, PatternPlayer } from "@oak/strudel";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ABControls } from "./FeedbackPanel.tsx";
import { msToNextDownbeat } from "./transport-math.ts";

export interface UseABOptions {
  oak: OakStrudel;
  handle: EditorHandle | null;
  /** Target code, already clean; null disables A/B. */
  target: string | null;
  bars: number;
  /** cps of the learner's code (the target plays at the same tempo unless it sets its own). */
  cps: number;
}

export function useAB(opts: UseABOptions): (ABControls & { alternating: boolean; alternate(): void }) | null {
  const [active, setActive] = useState<"A" | "B" | null>(null);
  const [pendingSide, setPending] = useState<"A" | "B" | null>(null);
  const [alternating, setAlternating] = useState(false);
  const player = useRef<PatternPlayer | null>(null);
  const loadedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const altTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const activeRef = useRef(active);
  activeRef.current = active;

  const clearTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    if (altTimer.current) clearTimeout(altTimer.current);
    timer.current = null;
    altTimer.current = null;
  };

  /** ms until the next bar line of whatever plays now. */
  const untilDownbeat = useCallback((): number => {
    const o = optsRef.current;
    if (activeRef.current === "B" && player.current?.playing) {
      const pos = player.current.position();
      return msToNextDownbeat(pos, o.cps);
    }
    if (activeRef.current === "A" && o.handle?.playing)
      return msToNextDownbeat(o.oak.transport.cycle(), o.oak.transport.cps());
    return 0;
  }, []);

  const startB = useCallback(async () => {
    const o = optsRef.current;
    if (!o.target) return;
    player.current ??= o.oak.createPatternPlayer();
    if (loadedFor.current !== o.target) {
      const out = await player.current.load(o.target, { bars: o.bars, cps: o.cps });
      if (!out.ok) {
        setPending(null);
        return;
      }
      loadedFor.current = o.target;
    }
    o.handle?.stop();
    await player.current.play();
    setActive("B");
    setPending(null);
  }, []);

  const startA = useCallback(async () => {
    const o = optsRef.current;
    player.current?.stop();
    await o.handle?.play();
    setActive("A");
    setPending(null);
  }, []);

  const switchTo = useCallback(
    (side: "A" | "B") => {
      if (timer.current) clearTimeout(timer.current);
      setPending(side);
      const go = () => void (side === "A" ? startA() : startB());
      const wait = untilDownbeat();
      if (wait <= 0) go();
      else timer.current = setTimeout(go, wait);
    },
    [startA, startB, untilDownbeat],
  );

  const stop = useCallback(() => {
    clearTimers();
    setAlternating(false);
    player.current?.stop();
    optsRef.current.handle?.stop();
    setActive(null);
    setPending(null);
  }, []);

  const alternate = useCallback(() => {
    if (alternating) {
      stop();
      return;
    }
    setAlternating(true);
    const barMs = 1000 / Math.max(1e-6, optsRef.current.cps);
    const step = (side: "A" | "B") => {
      void (side === "A" ? startA() : startB()).then(() => {
        altTimer.current = setTimeout(() => step(side === "A" ? "B" : "A"), barMs);
      });
    };
    step("A");
  }, [alternating, startA, startB, stop]);

  // A new target means a new load; leaving the page stops and frees the hidden player.
  useEffect(() => {
    loadedFor.current = null;
  }, [opts.target]);
  useEffect(
    () => () => {
      clearTimers();
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  if (!opts.target) return null;
  return {
    active,
    pendingSide,
    alternating,
    playA: () => switchTo("A"),
    playB: () => switchTo("B"),
    stop,
    alternate,
  };
}
