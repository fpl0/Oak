// Small React bindings of the session runner.
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "zustand";
import { sessionRunner } from "./live.ts";
import { browserStorage, type EndedRecord, loadEnded } from "./persist.ts";
import type { RunnerView } from "./runner.ts";

/** Lets the runner navigate (the router is one per app, so this is set once and kept). */
export function useRunnerNavigator(): void {
  const router = useRouter();
  useEffect(() => {
    sessionRunner.setNavigator((to) => {
      // Inside the session (block to block, session to Coda) the entry is replaced, so Back never steps through
      // finished blocks. Coming in from Today it is pushed: Back from the session returns to Today (it used to
      // replace Today itself, so Back left Oak altogether).
      const inSession = router.state.location.pathname.startsWith("/session");
      void router.navigate({ to, replace: to !== "/" && inSession });
    });
  }, [router]);
}

export function useRunnerView<T>(select: (v: RunnerView) => T): T {
  return useStore(sessionRunner.view, select);
}

/** The session ended last in this browser: the runner's (this tab) or the saved one (after a reload). */
export function useLastEnded(): EndedRecord | null {
  const inTab = useRunnerView((v) => v.ended);
  return inTab ?? loadEnded(browserStorage());
}
