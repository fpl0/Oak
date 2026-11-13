// The note-label lenses (Wave 3, docs/design/wave3.md §4.3): degree numbers, solfège syllables and note
// names, one shared preference for the Workbench (roll, staff, keyboard), the drills and the answer widgets.
// The preference is the `lenses` setting on the server (persisted with `settings.put`, read from bootstrap);
// a lens is shown only once its tool is unlocked. Frozen after Foundation: read it, never fork it.
import type { ChordLensId, LensId, LensPrefs, LineLensId } from "@oak/api";
import { CHORD_LENS_IDS, DEFAULT_SETTINGS, LENS_IDS, LINE_LENS_IDS } from "@oak/api";
import type { UnlockableId } from "@oak/content-kit";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { toast } from "../ui/kit/Toast.tsx";
import { callApi } from "./api.ts";
import { apiKey, useBootstrap } from "./queries.ts";
import { useUnlockedSet } from "./unlocked.ts";

export type { ChordLensId, LensId, LensPrefs, LineLensId };
export { CHORD_LENS_IDS, LENS_IDS, LINE_LENS_IDS };

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
 * The tool that opens each chord lens. Chord symbols: `tb.feature.chord-symbols` (U05.L04, contracts §3.2 v1.4;
 * Wave 5 c14 switched it from `tb.arp`, the only row U05.L04 had before; the server's start-up backfill grants the
 * new row to learners past U05.L04). Roman numerals: `tb.feature.rn` (U06.L02).
 */
export const CHORD_LENS_UNLOCKS: Readonly<Record<ChordLensId, UnlockableId>> = {
  chordSymbols: "tb.feature.chord-symbols" as UnlockableId,
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

// --- Wave 5: the form and line lenses (docs/design/wave5.md §4.3) ------------------------------------------
// The section ribbon over the roll and the staff (from `arrange()`), root / fifth / octave / approach marks on the
// bass line, and blue notes. Stored in the same `lenses` setting as three optional booleans (absent = on). The
// degree and solfège lenses need nothing new for minor: `@oak/theory` labels ♭3 ♭6 ♭7 and me / le / te in any key
// (`degreeLens`), so a minor key only changes what they say.

/**
 * The tool that opens each line lens. Sections: `tb.lens.form` (U09.L02). Bass roles arrive with U08 (root bass
 * lines at U08.L01, root–five–octave at U08.L02); there is no dedicated lens row yet, so the lens opens with
 * `tb.rootNotes` (U08.L01; requested from the content lead as `tb.lens.bass-roles` at U08.L02 — when it lands only
 * this table changes). Blue notes: `scale.blues` (U11.L03).
 */
export const LINE_LENS_UNLOCKS: Readonly<Record<LineLensId, UnlockableId>> = {
  sections: "tb.lens.form" as UnlockableId,
  bassRoles: "tb.rootNotes" as UnlockableId,
  blueNotes: "scale.blues" as UnlockableId,
};
export const LINE_LENS_LABELS: Readonly<Record<LineLensId, string>> = {
  sections: "Sections",
  bassRoles: "Bass roles",
  blueNotes: "Blue notes",
};
export type LineLensPrefs = Record<LineLensId, boolean>;

/** The stored line-lens preference (absent fields are on). */
export function lineLensPrefs(prefs: LensPrefs): LineLensPrefs {
  return {
    sections: prefs.sections ?? true,
    bassRoles: prefs.bassRoles ?? true,
    blueNotes: prefs.blueNotes ?? true,
  };
}
/** Which line lenses the learner has unlocked. */
export function lineLensAvailability(unlocked: ReadonlySet<string>): LineLensPrefs {
  return {
    sections: unlocked.has(LINE_LENS_UNLOCKS.sections),
    bassRoles: unlocked.has(LINE_LENS_UNLOCKS.bassRoles),
    blueNotes: unlocked.has(LINE_LENS_UNLOCKS.blueNotes),
  };
}
/** What views show: preference ∧ unlocked. */
export function effectiveLineLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): LineLensPrefs {
  const p = lineLensPrefs(prefs);
  const a = lineLensAvailability(unlocked);
  return {
    sections: p.sections && a.sections,
    bassRoles: p.bassRoles && a.bassRoles,
    blueNotes: p.blueNotes && a.blueNotes,
  };
}
export interface LineLenses {
  prefs: LineLensPrefs;
  shown: LineLensPrefs;
  available: LineLensPrefs;
  set(id: LineLensId, on: boolean): void;
  toggle(id: LineLensId): void;
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
  /** Wave 5: sections, bass roles, blue notes (the same store, the same persistence and rollback). */
  lines: LineLenses;
}

type BootstrapData = NonNullable<ReturnType<typeof useBootstrap>["data"]>;

// Lens saves run one at a time, and each sends what is stored when it goes out: a burst of presses can neither
// land out of order on the server nor be overwritten by a bootstrap refetch mid-burst (review:surfaces found six
// fast Shift+O/B/U/D/S/N presses leaving the switches on a state nobody chose). One save waits at most; it reads
// the latest preference when its turn comes. Nothing is invalidated on success: the cache already holds it.
const lensSave: { chain: Promise<void>; queued: boolean; saved: LensPrefs | null } = {
  chain: Promise.resolve(),
  queued: false,
  saved: null,
};

function queueLensSave(qc: QueryClient, fallback: LensPrefs, hadBootstrap: boolean): void {
  if (lensSave.queued) return;
  lensSave.queued = true;
  const key = apiKey("bootstrap");
  lensSave.chain = lensSave.chain.then(async () => {
    lensSave.queued = false;
    const value = qc.getQueryData<BootstrapData>(key)?.settings.lenses ?? fallback;
    try {
      await callApi("settings.put", { params: { key: "lenses" }, body: { value } });
      lensSave.saved = value;
      // Before bootstrap has loaded there was nothing to update optimistically: read it back once saved, so the
      // switch shows what was just stored (Foundation risk: set() saved but showed nothing).
      if (!hadBootstrap && !lensSave.queued) await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      const data = qc.getQueryData<BootstrapData>(key);
      if (data && lensSave.saved && !lensSave.queued)
        qc.setQueryData<BootstrapData>(key, {
          ...data,
          settings: { ...data.settings, lenses: lensSave.saved },
        });
      toast.error("That label change wasn't saved", e instanceof Error ? e.message : String(e));
    }
  });
}

/** The lenses, shared by every view through the bootstrap query. */
export function useLenses(): Lenses {
  const bootstrap = useBootstrap();
  const { unlocked, ready: unlocksReady } = useUnlockedSet();
  const qc = useQueryClient();
  const prefs = bootstrap.data?.settings.lenses ?? DEFAULT_LENSES;
  const set = (id: LensId | ChordLensId | LineLensId, on: boolean) => {
    const key = apiKey("bootstrap");
    const before = qc.getQueryData<BootstrapData>(key);
    const current = before?.settings.lenses ?? prefs;
    if ((current[id] ?? true) === on) return;
    const next: LensPrefs = { ...current, [id]: on };
    if (before) {
      lensSave.saved ??= current;
      qc.setQueryData<BootstrapData>(key, { ...before, settings: { ...before.settings, lenses: next } });
    }
    queueLensSave(qc, next, before !== undefined);
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
    lines: {
      prefs: lineLensPrefs(prefs),
      shown: effectiveLineLenses(prefs, unlocked),
      available: lineLensAvailability(unlocked),
      set,
      toggle: (id) => set(id, !lineLensPrefs(stored())[id]),
    },
  };
}
