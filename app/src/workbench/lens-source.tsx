// Where a Workbench gets its lenses (Wave 3, docs/design/wave3.md §4.3): in the app, the shared `useLenses()`
// store (one preference for every view, gated by unlocks) and Settings → Learning's "Roll labels"; outside the app
// (the standalone e2e page, tests) a host can provide a lens source through `WorkbenchLensProvider`, and with
// neither the Workbench keeps its Wave 2 labels. The app hooks run only under a QueryClient.
import type { ChordLensId, LensId, LensPrefs, LineLensId, MusicLensId, TrackLensId } from "@oak/api";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { chordLensPrefs, lineLensPrefs, musicLensPrefs, trackLensPrefs, useLenses } from "../lib/lenses.ts";
import { apiKey, useBootstrap, useCourseProgress } from "../lib/queries.ts";
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
  /**
   * Wave 5 (wave5.md §4.3): the line lenses, sections (the ribbon), bass roles and blue notes, from the same store.
   * Absent: a host without them shows none of the three outside a lesson step.
   */
  lines?: LineLensSource;
  /**
   * Wave 6 (wave6.md §4.3): guide tones, the key ribbon and the beat grid, from the same store. Unlike the label
   * lenses these also apply inside a lesson step (no step names them). Absent: none of the three.
   */
  music?: MusicLensSource;
  /**
   * Wave 7 (wave7.md §4.2): the advanced tracks' eight lenses, from the same store. Each opens with its lesson or one
   * of its tools (the Workbench adds the lesson being taken). Absent: none of them.
   */
  track?: TrackLensSource;
  /**
   * Wave 6: the lessons the learner has completed, for how deep the chord and degree lenses write
   * (`harmonyDepth`: applied numerals from U15.L02, borrowed ones from U16.L01) and for the key panel's rows.
   * Absent: none (a host that knows better passes `harmonyDepth` to the Workbench).
   */
  completedLessons?: ReadonlySet<string>;
}

export interface MusicLensSource {
  /** The stored preference (absent = on), whatever is unlocked. */
  prefs: Record<MusicLensId, boolean>;
  /** Which of them the learner's unlocks open (the Workbench adds the tools of the lesson being taken). */
  available: Record<MusicLensId, boolean>;
  toggle(id: MusicLensId): void;
}

export interface TrackLensSource {
  /** The stored preference (absent = on), whatever is open. */
  prefs: Record<TrackLensId, boolean>;
  /** Which of them the learner's tools or completed lessons open. */
  available: Record<TrackLensId, boolean>;
  toggle(id: TrackLensId): void;
}

export interface LineLensSource {
  shown: Record<LineLensId, boolean>;
  available: Record<LineLensId, boolean>;
  toggle(id: LineLensId): void;
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
  const progress = useCourseProgress();
  const qc = useQueryClient();
  const done = progress.data?.lessons;
  const completedLessons = useMemo(
    () => new Set((done ?? []).filter((l) => l.completedAt !== null).map((l) => l.lessonId as string)),
    [done],
  );
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
    lines: {
      shown: lenses.lines.shown,
      available: lenses.lines.available,
      toggle: (id) => lenses.lines.set(id, !lineLensPrefs(stored())[id]),
    },
    music: {
      prefs: lenses.music.prefs,
      available: lenses.music.available,
      toggle: (id) => lenses.music.set(id, !musicLensPrefs(stored())[id]),
    },
    track: {
      prefs: lenses.track.prefs,
      available: lenses.track.available,
      toggle: (id) => lenses.track.set(id, !trackLensPrefs(stored())[id]),
    },
    completedLessons,
  };
}
