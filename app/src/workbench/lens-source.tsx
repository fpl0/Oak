// Where a Workbench gets its lenses (Wave 3, docs/design/wave3.md §4.3): in the app, the shared `useLenses()`
// store (one preference for every view, gated by unlocks) and Settings → Learning's "Roll labels"; outside the app
// (the standalone e2e page, tests) a host can provide a lens source through `WorkbenchLensProvider`, and with
// neither the Workbench keeps its Wave 2 labels. The app hooks run only under a QueryClient.
import type { LensId } from "@oak/api";
import { QueryClientContext } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { useLenses } from "../lib/lenses.ts";
import { useBootstrap } from "../lib/queries.ts";
import type { LensState, RollLabelSetting } from "./lens-view.ts";

export interface LensSource extends LensState {
  /** Turn a lens on or off (saved as the learner's preference). */
  toggle(id: LensId): void;
  /** Settings → Learning's roll labels (`auto` follows the lenses). */
  rollSetting: RollLabelSetting;
}

const LensContext = createContext<LensSource | null>(null);

/** Supplies a lens source to every Workbench below it (the standalone page; tests). */
export function WorkbenchLensProvider({ value, children }: { value: LensSource; children: ReactNode }) {
  return <LensContext.Provider value={value}>{children}</LensContext.Provider>;
}

/** The provided source, else `"app"` when the app's query client is there, else `null` (no lenses). */
export function useLensSourceKind(): LensSource | "app" | null {
  const provided = useContext(LensContext);
  const qc = useContext(QueryClientContext);
  if (provided) return provided;
  return qc ? "app" : null;
}

/** The app's lens source (call only under a QueryClient). */
export function useAppLensSource(): LensSource {
  const lenses = useLenses();
  const bootstrap = useBootstrap();
  return {
    shown: lenses.shown,
    available: lenses.available,
    toggle: lenses.toggle,
    rollSetting: bootstrap.data?.settings.rollLabels ?? "auto",
  };
}
