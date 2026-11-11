// Motion tokens and helpers (ux §7.6). CSS reads --oak-dur-*; script-driven motion reads these.
import { useSyncExternalStore } from "react";

export const DURATION = { fast: 120, base: 200, slow: 360 } as const;
export const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";

function subscribe(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => obs.disconnect();
}

export function isReducedMotion(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";
}

/** True while reduced motion is in effect (system setting or the in-app override). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, () => false);
}

/** Script-side duration: collapses to a ≤120 ms cross-fade under reduced motion. */
export function duration(kind: keyof typeof DURATION): number {
  return isReducedMotion() ? Math.min(DURATION[kind], DURATION.fast) : DURATION[kind];
}

/**
 * Beat-synced ceremony: when audio is playing, ceremonial motion (unlock flips, milestone banners) starts on
 * the next downbeat. `clock` gives the current cycle and seconds per cycle; without one it runs now.
 */
export function onNextDownbeat(
  run: () => void,
  clock?: { cycle(): number; cps(): number; playing: boolean } | null,
): () => void {
  if (!clock?.playing || clock.cps() <= 0) {
    run();
    return () => {};
  }
  const cycle = clock.cycle();
  const waitMs = Math.max(0, ((Math.floor(cycle) + 1 - cycle) / clock.cps()) * 1000);
  const t = setTimeout(run, waitMs);
  return () => clearTimeout(t);
}
