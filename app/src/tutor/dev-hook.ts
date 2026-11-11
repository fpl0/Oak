// Dev-server only: the tutor's seams on `window.__oakTutor`, so the tutor-ui Playwright suite can stand in for the
// surfaces that set subjects (lesson, Studio, capstone) and drive the panel through the scripted fake backend.
// Never present in a production build (`import.meta.env.DEV` is false there and the module tree-shakes away).
import * as context from "./context.ts";
import { usePanelView } from "./hooks.ts";
import { useTurns } from "./turns.ts";

export function installTutorDevHook(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  (window as unknown as { __oakTutor: unknown }).__oakTutor = {
    ...context,
    usePanelView,
    useTurns,
  };
}
