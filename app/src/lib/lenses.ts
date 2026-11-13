// The note-label lenses (Wave 3, docs/design/wave3.md §4.3): degree numbers, solfège syllables and note
// names, one shared preference for the Workbench (roll, staff, keyboard), the drills and the answer widgets.
// The preference is the `lenses` setting on the server (persisted with `settings.put`, read from bootstrap);
// a lens is shown only once its tool is unlocked. Frozen after Foundation: read it, never fork it.
import type { ChordLensId, LensId, LensPrefs } from "@oak/api";
import { CHORD_LENS_IDS, DEFAULT_SETTINGS, LENS_IDS } from "@oak/api";
import type { UnlockableId } from "@oak/content-kit";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "../ui/kit/Toast.tsx";
import { apiKey, useBootstrap, useSettingsPut } from "./queries.ts";
import { useUnlockedSet } from "./unlocked.ts";

export type { ChordLensId, LensId, LensPrefs };
export { CHORD_LENS_IDS, LENS_IDS };

/** The tool that opens each lens; `null`: always available. */
export const LENS_UNLOCKS: Readonly<Record<LensId, UnlockableId | null>> = {
  degrees: "tb.feature.degree-labels" as UnlockableId,
  solfege: "tb.feature.solfege" as UnlockableId,
  noteNames: null,
};

/** Toggle labels, as the lens switches show them. */
export const LENS_LABELS: Readonly<Record<LensId, string>> = {
  degrees: "Degrees",
  solfege: "Solfège",
  noteNames: "Note names",
};

export const DEFAULT_LENSES: LensPrefs = DEFAULT_SETTINGS.lenses;

/** Which lenses the learner has unlocked. */
export function lensAvailability(unlocked: ReadonlySet<string>): Record<LensId, boolean> {
  const out = {} as Record<LensId, boolean>;
  for (const id of LENS_IDS) {
    const tool = LENS_UNLOCKS[id];
    out[id] = tool === null || unlocked.has(tool);
  }
  return out;
}

/** What is shown: the preference, where the lens is unlocked. */
export function effectiveLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): LensPrefs {
  const a = lensAvailability(unlocked);
  return {
    degrees: prefs.degrees && a.degrees,
    solfege: prefs.solfege && a.solfege,
    noteNames: prefs.noteNames && a.noteNames,
  };
}

/**
 * The piano roll's label mode for the shown lenses (the Workbench's `roll.labels`). Solfège rides on degrees
 * in the roll gutter; note names alone give `note`.
 */
export function rollLabelsOf(shown: LensPrefs): "none" | "note" | "degree" | "degree+solfege" {
  if (shown.degrees && shown.solfege) return "degree+solfege";
  if (shown.degrees) return "degree";
  if (shown.noteNames) return "note";
  return "none";
}

// --- Wave 4: the chord-label lenses (docs/design/wave4.md §4.3) ----------------------------------------
// Chord symbols and Roman numerals on the roll's chord band and on the staff (above / below). Kept apart from
// the note lenses: `LENS_IDS` and the note switches are unchanged. Stored in the same `lenses` setting as two
// optional booleans (absent = on).

/**
 * The tool that opens each chord lens. Chord symbols arrive with U05.L04 ("Chord Names & Arpeggios"), whose
 * only toolbox row is `tb.arp`; there is no dedicated feature row yet (requested from the content lead as
 * `tb.feature.chord-symbols`, wave4.md §4.3). Roman numerals: `tb.feature.rn` (U06.L02).
 */
export const CHORD_LENS_UNLOCKS: Readonly<Record<ChordLensId, UnlockableId>> = {
  chordSymbols: "tb.arp" as UnlockableId,
  romanNumerals: "tb.feature.rn" as UnlockableId,
};
export const CHORD_LENS_LABELS: Readonly<Record<ChordLensId, string>> = {
  chordSymbols: "Chord symbols",
  romanNumerals: "Roman numerals",
};
export type ChordLensPrefs = Record<ChordLensId, boolean>;

/** The stored chord-lens preference (absent fields are on). */
export function chordLensPrefs(prefs: LensPrefs): ChordLensPrefs {
  return { chordSymbols: prefs.chordSymbols ?? true, romanNumerals: prefs.romanNumerals ?? true };
}
/** Which chord lenses the learner has unlocked. */
export function chordLensAvailability(unlocked: ReadonlySet<string>): ChordLensPrefs {
  return {
    chordSymbols: unlocked.has(CHORD_LENS_UNLOCKS.chordSymbols),
    romanNumerals: unlocked.has(CHORD_LENS_UNLOCKS.romanNumerals),
  };
}
/** What views show: preference ∧ unlocked. */
export function effectiveChordLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): ChordLensPrefs {
  const p = chordLensPrefs(prefs);
  const a = chordLensAvailability(unlocked);
  return {
    chordSymbols: p.chordSymbols && a.chordSymbols,
    romanNumerals: p.romanNumerals && a.romanNumerals,
  };
}

export interface ChordLenses {
  prefs: ChordLensPrefs;
  shown: ChordLensPrefs;
  available: ChordLensPrefs;
  set(id: ChordLensId, on: boolean): void;
  toggle(id: ChordLensId): void;
}

export interface Lenses {
  /** The stored preference (defaults until bootstrap has loaded). */
  prefs: LensPrefs;
  /** What views show: preference ∧ unlocked. */
  shown: LensPrefs;
  /** Which lenses exist for this learner yet (a locked lens has no switch). */
  available: Record<LensId, boolean>;
  /** Bootstrap and the unlock list have loaded. */
  ready: boolean;
  /** Turn one lens on or off (optimistic; persisted; a failed save rolls back with a toast). */
  set(id: LensId, on: boolean): void;
  toggle(id: LensId): void;
  /** Wave 4: chord symbols and Roman numerals (the same store, the same persistence and rollback). */
  chords: ChordLenses;
}

type BootstrapData = NonNullable<ReturnType<typeof useBootstrap>["data"]>;

/** The lenses, shared by every view through the bootstrap query. */
export function useLenses(): Lenses {
  const bootstrap = useBootstrap();
  const { unlocked, ready: unlocksReady } = useUnlockedSet();
  const qc = useQueryClient();
  const put = useSettingsPut();
  const prefs = bootstrap.data?.settings.lenses ?? DEFAULT_LENSES;
  const set = (id: LensId | ChordLensId, on: boolean) => {
    const key = apiKey("bootstrap");
    const before = qc.getQueryData<BootstrapData>(key);
    const current = before?.settings.lenses ?? prefs;
    if ((current[id] ?? true) === on) return;
    const next: LensPrefs = { ...current, [id]: on };
    if (before)
      qc.setQueryData<BootstrapData>(key, { ...before, settings: { ...before.settings, lenses: next } });
    put.mutate(
      { params: { key: "lenses" }, body: { value: next } },
      {
        // Before bootstrap has loaded there was nothing to update optimistically: read it back once saved, so
        // the switch shows what was just stored (Foundation risk: set() saved but showed nothing).
        onSuccess: () => {
          if (!before) void qc.invalidateQueries({ queryKey: key });
        },
        onError: (e) => {
          if (before) qc.setQueryData<BootstrapData>(key, before);
          toast.error("That label change wasn't saved", e.message);
        },
      },
    );
  };
  // A toggle flips what is stored now, not what the last render saw: two presses inside one frame are two toggles
  // (review:surfaces found hammered Shift+H / Shift+R presses lost).
  const stored = (): LensPrefs =>
    qc.getQueryData<BootstrapData>(apiKey("bootstrap"))?.settings.lenses ?? prefs;
  return {
    prefs,
    shown: effectiveLenses(prefs, unlocked),
    available: lensAvailability(unlocked),
    ready: bootstrap.isSuccess && unlocksReady,
    set,
    toggle: (id) => set(id, !(stored()[id] ?? true)),
    chords: {
      prefs: chordLensPrefs(prefs),
      shown: effectiveChordLenses(prefs, unlocked),
      available: chordLensAvailability(unlocked),
      set,
      toggle: (id) => set(id, !chordLensPrefs(stored())[id]),
    },
  };
}
