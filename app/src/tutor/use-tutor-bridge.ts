// Connects the tutor context store (context.ts) to the shell: health → availability, and `openTutor()` → the
// docked panel (L) or the drawer (M). Mounted once by AppShell.
import { useEffect, useRef } from "react";
import { useHealth } from "../lib/queries.ts";
import { useShell } from "../lib/shell-store.ts";
import { useIsLarge } from "../lib/use-media.ts";
import { usePrefs } from "../ui/theme/prefs.ts";
import { setAvailability, useTutorContext } from "./context.ts";

export function useTutorBridge(): void {
  const health = useHealth();
  const data = health.data ?? null;
  const failed = health.isError;
  useEffect(() => {
    if (data) setAvailability(data);
    else if (failed) setAvailability({ tutor: "unreachable", tutorBackend: null });
  }, [data, failed]);

  const large = useIsLarge();
  const requests = useTutorContext((s) => s.openRequests);
  const seen = useRef(requests);
  useEffect(() => {
    if (requests === seen.current) return;
    seen.current = requests;
    if (large) usePrefs.getState().set({ tutorOpen: true });
    else useShell.getState().setTutorDrawerOpen(true);
  }, [requests, large]);
}
