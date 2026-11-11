// The app's one session runner, wired to the API, telemetry, the lesson snapshot and the browser.

import { useLessonPublic } from "../lesson/public.ts";
import { callApi } from "../lib/api.ts";
import { useShell } from "../lib/shell-store.ts";
import { logBlock } from "../lib/telemetry.ts";
import { browserStorage } from "./persist.ts";
import { baselineOf, createRunner } from "./runner.ts";
import { reportBlockDone, useSession } from "./store.ts";

export const sessionRunner = createRunner({
  startSession: (body) => callApi("session.start", { body }),
  endSession: ({ sessionId, body }) => callApi("session.end", { params: { id: sessionId }, body }),
  baseline: async () => {
    const [map, cando] = await Promise.all([
      callApi("skills.map").catch(() => null),
      callApi("cando.list").catch(() => ({ items: [] })),
    ]);
    return baselineOf(map, cando.items);
  },
  heartbeat: ({ sessionId, ...beat }) => logBlock({ sessionId, ...beat }),
  stepId: () => useLessonPublic.getState().lesson?.stepId ?? null,
  playing: () => useShell.getState().nowPlaying !== null,
  path: () => (typeof location === "undefined" ? "/" : location.pathname),
  storage: browserStorage(),
  now: () => Date.now(),
  listen: (onActivity, onVisible) => {
    if (typeof window === "undefined") return () => {};
    let last = 0;
    const act = () => {
      const t = Date.now();
      if (t - last < 250) return;
      last = t;
      onActivity();
    };
    const vis = () => onVisible(document.visibilityState === "visible");
    const events = ["keydown", "pointerdown", "pointermove", "wheel", "input"] as const;
    for (const e of events) window.addEventListener(e, act, { passive: true, capture: true });
    document.addEventListener("visibilitychange", vis);
    return () => {
      for (const e of events) window.removeEventListener(e, act, { capture: true });
      document.removeEventListener("visibilitychange", vis);
    };
  },
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
});

// Tests drive the session without the sibling block surfaces (dev builds only; never in production).
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __oakSession?: unknown }).__oakSession = {
    runner: sessionRunner,
    report: reportBlockDone,
    state: () => useSession.getState(),
  };
}
