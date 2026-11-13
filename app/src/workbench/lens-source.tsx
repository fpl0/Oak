// Where a Workbench gets its lenses (Wave 3, docs/design/wave3.md §4.3): in the app, the shared `useLenses()`
// store (one preference for every view, gated by unlocks) and Settings → Learning's "Roll labels"; outside the app
// (the standalone e2e page, tests) a host can provide a lens source through `WorkbenchLensProvider`, and with
// neither the Workbench keeps its Wave 2 labels. The app hooks run only under a QueryClient.
import type { ChordLensId, LensId, LensPrefs } from "@oak/api";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { chordLensPrefs, useLenses } from "../lib/lenses.ts";
import { apiKey, useBootstrap } from "../lib/queries.ts";
import type { LensState, RollLabelSetting } from "./lens-view.ts";

export interface LensSource extends LensState {
  /** Turn a lens on or off (saved as the learner's preference). */
  toggle(id: LensId): void;
  /** Settings → Learning's roll labels (`auto` follows the lenses). */
  rollSetting: RollLabelSetting;
  /**
   * Wave 4 (wave4.md §4.3): the chord lenses, chord symbols and Roman numerals, from the same store. Absent: a
   * host without them (the Wave 3 standalone page) shows no chord labels outside a lesson step.
   */
  chords?: ChordLensSource;
}

export interface ChordLensSource {
  shown: Record<ChordLensId, boolean>;
  available: Record<ChordLensId, boolean>;
  toggle(id: ChordLensId): void;
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
  const qc = useQueryClient();
  // A toggle flips what is stored now, not what the last render saw: two presses of Shift+H inside one frame
  // (a held or hammered key) are two toggles. `useLenses().toggle` reads the render's preferences, so the second
  // press set the value the first had already set and was dropped.
  const stored = (): LensPrefs =>
    qc.getQueryData<{ settings: { lenses: LensPrefs } }>(apiKey("bootstrap"))?.settings.lenses ??
    lenses.prefs;
  return {
    shown: lenses.shown,
    available: lenses.available,
    toggle: (id) => lenses.set(id, !stored()[id]),
    rollSetting: bootstrap.data?.settings.rollLabels ?? "auto",
    chords: {
      shown: lenses.chords.shown,
      available: lenses.chords.available,
      toggle: (id) => lenses.chords.set(id, !chordLensPrefs(stored())[id]),
    },
  };
}
