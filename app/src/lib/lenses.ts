// The note-label lenses (Wave 3, docs/design/wave3.md §4.3): degree numbers, solfège syllables and note
// names, one shared preference for the Workbench (roll, staff, keyboard), the drills and the answer widgets.
// The preference is the `lenses` setting on the server (persisted with `settings.put`, read from bootstrap);
// a lens is shown only once its tool is unlocked. Frozen after Foundation: read it, never fork it.
import type { ChordLensId, LensId, LensPrefs, LineLensId, MusicLensId, TrackLensId } from "@oak/api";
import {
  CHORD_LENS_IDS,
  DEFAULT_SETTINGS,
  LENS_IDS,
  LINE_LENS_IDS,
  MUSIC_LENS_IDS,
  TRACK_LENS_IDS,
} from "@oak/api";
import type { UnlockableId } from "@oak/content-kit";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { toast } from "../ui/kit/Toast.tsx";
import { callApi } from "./api.ts";
import { apiKey, useBootstrap, useCourseProgress } from "./queries.ts";
import { useUnlockedSet } from "./unlocked.ts";

export type { ChordLensId, LensId, LensPrefs, LineLensId, MusicLensId, TrackLensId };
export { CHORD_LENS_IDS, LENS_IDS, LINE_LENS_IDS, MUSIC_LENS_IDS, TRACK_LENS_IDS };

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
 * The tool that opens each chord lens. Chord symbols: `tb.feature.chord-symbols` (contracts §3.2; since 1.6 it
 * unlocks at U05.L09 "Chord Names", the lesson split out of U05.L04 and taught directly after it; Wave 5 c14 had
 * switched it from `tb.arp`, and the server's start-up backfill grants the row to learners past U05.L04). Roman
 * numerals: `tb.feature.rn` (U06.L02).
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

// --- Wave 6: the harmony and time lenses of U12–U17 (docs/design/wave6.md §4.3) ------------------------------
// Guide tones (the 3rd and 7th of each chord and the line they make), the key plan (the key in force along the
// timeline when a piece changes key) and the beat grid of a compound meter or of triplets on the roll. Stored in the
// same `lenses` setting as three optional booleans (absent = on). How DEEP the chord and degree lenses write
// (sevenths, applied and borrowed numerals, chromatic syllables) is not a switch but a gate: `harmony-lens.ts`.

/**
 * The tools that open each lens (any one of them). Guide tones arrive with the seventh chords: there is no lens
 * row yet, so the lens opens with `chord.seventh` (U12.L01; requested from the content lead as `tb.lens.guide-tones`
 * at U12.L05 — when it lands only this table changes). The key plan: `tb.scale.patterned` (U03.L05, where a
 * patterned scale first changes the key; the lens draws nothing for a piece in one key). The beat grid:
 * `tb.meter.compound` (U13.L04) or `tb.ply` (U13.L05, triplets).
 */
export const MUSIC_LENS_UNLOCKS: Readonly<Record<MusicLensId, readonly UnlockableId[]>> = {
  guideTones: ["chord.seventh" as UnlockableId],
  keyPlan: ["tb.scale.patterned" as UnlockableId],
  // Pushes (U13.L01) come before the compound meters: the beat grid opens with them too (drawn against the plain grid).
  beatGrid: [
    "tb.meter.compound" as UnlockableId,
    "tb.ply" as UnlockableId,
    "tb.early" as UnlockableId,
    "tb.late" as UnlockableId,
  ],
};
export const MUSIC_LENS_LABELS: Readonly<Record<MusicLensId, string>> = {
  guideTones: "Guide tones",
  keyPlan: "Key",
  beatGrid: "Beat grid",
};
export type MusicLensPrefs = Record<MusicLensId, boolean>;

/** The stored preference (absent fields are on). */
export function musicLensPrefs(prefs: LensPrefs): MusicLensPrefs {
  return {
    guideTones: prefs.guideTones ?? true,
    keyPlan: prefs.keyPlan ?? true,
    beatGrid: prefs.beatGrid ?? true,
  };
}
/** Which of them the learner has unlocked. */
export function musicLensAvailability(unlocked: ReadonlySet<string>): MusicLensPrefs {
  const open = (id: MusicLensId): boolean => MUSIC_LENS_UNLOCKS[id].some((t) => unlocked.has(t));
  return { guideTones: open("guideTones"), keyPlan: open("keyPlan"), beatGrid: open("beatGrid") };
}
/** What views show: preference ∧ unlocked. */
export function effectiveMusicLenses(prefs: LensPrefs, unlocked: ReadonlySet<string>): MusicLensPrefs {
  const p = musicLensPrefs(prefs);
  const a = musicLensAvailability(unlocked);
  return {
    guideTones: p.guideTones && a.guideTones,
    keyPlan: p.keyPlan && a.keyPlan,
    beatGrid: p.beatGrid && a.beatGrid,
  };
}
export interface MusicLenses {
  prefs: MusicLensPrefs;
  shown: MusicLensPrefs;
  available: MusicLensPrefs;
  set(id: MusicLensId, on: boolean): void;
  toggle(id: MusicLensId): void;
}

// --- Wave 7: the advanced tracks' lenses (docs/design/wave7.md §4.3) -------------------------------------------

/**
 * What opens each track lens: any one of its tools, or its lesson completed (inside the lesson that teaches it the
 * host adds that lesson's id, as for `harmonyDepth`). A lens draws nothing for a piece that has nothing to show
 * (no clave, one pulse, one key), so opening a lesson early never shows a wrong label.
 * - tensions: J2.L03 "Extensions" (`chord.ext`) — the 9, 11 and 13 of each melody note against its chord, avoid
 *   notes marked (`tensionView`).
 * - voicings: J1.L05 "Shells" (`tb.voicing.n`) — the type of each hand voicing (`voicingView`).
 * - chordScales: J2.L04 "Chord-Scales" (`scale.locrian`, `scale.altered`) — each chord's scale (`chordScales`).
 * - clave: R3.L02 "Clave Direction" — the two-bar grid with the clave's strokes (`claveView`).
 * - polyLanes: R2.L04 "Polyrhythm" (`tb.mini.polymeter` from R2.L05) — a lane per pulse on the roll.
 * - microtiming: R1.L05 "Displacement & Laid-Back Feel" — how far each onset sits from the grid (`feelView`).
 * - registers: A2.L01 "Roles & Registers" (`tb.fscope`) — register bands on the spectrum panel and the clashes
 *   under the low-interval limits (`registerClashView`).
 * - density: A2.L02 "Texture & Density" — a density strip per section (`densityView`).
 */
export const TRACK_LENS_GATES: Readonly<
  Record<TrackLensId, { tools: readonly UnlockableId[]; lesson: string }>
> = {
  tensions: { tools: ["chord.ext" as UnlockableId], lesson: "J2.L03" },
  voicings: { tools: ["tb.voicing.n" as UnlockableId], lesson: "J1.L05" },
  chordScales: {
    tools: ["scale.locrian" as UnlockableId, "scale.altered" as UnlockableId],
    lesson: "J2.L04",
  },
  clave: { tools: [], lesson: "R3.L02" },
  polyLanes: { tools: ["tb.mini.polymeter" as UnlockableId], lesson: "R2.L04" },
  microtiming: { tools: [], lesson: "R1.L05" },
  registers: { tools: ["tb.fscope" as UnlockableId], lesson: "A2.L01" },
  density: { tools: [], lesson: "A2.L02" },
};
export const TRACK_LENS_LABELS: Readonly<Record<TrackLensId, string>> = {
  tensions: "Tensions",
  voicings: "Voicings",
  chordScales: "Chord-scales",
  clave: "Clave",
  polyLanes: "Pulse lanes",
  microtiming: "Microtiming",
  registers: "Registers",
  density: "Density",
};
export type TrackLensPrefs = Record<TrackLensId, boolean>;
const eachTrackLens = (f: (id: TrackLensId) => boolean): TrackLensPrefs =>
  Object.fromEntries(TRACK_LENS_IDS.map((id) => [id, f(id)])) as TrackLensPrefs;
/** The stored preference (absent fields are on). */
export function trackLensPrefs(prefs: LensPrefs): TrackLensPrefs {
  return eachTrackLens((id) => prefs[id] ?? true);
}
/** Which of them the learner has opened: a tool unlocked, or the lesson completed. */
export function trackLensAvailability(
  unlocked: ReadonlySet<string>,
  completed: ReadonlySet<string>,
): TrackLensPrefs {
  return eachTrackLens(
    (id) =>
      TRACK_LENS_GATES[id].tools.some((t) => unlocked.has(t)) || completed.has(TRACK_LENS_GATES[id].lesson),
  );
}
/** What views show: preference ∧ opened. */
export function effectiveTrackLenses(
  prefs: LensPrefs,
  unlocked: ReadonlySet<string>,
  completed: ReadonlySet<string>,
): TrackLensPrefs {
  const p = trackLensPrefs(prefs);
  const a = trackLensAvailability(unlocked, completed);
  return eachTrackLens((id) => p[id] && a[id]);
}
export interface TrackLenses {
  prefs: TrackLensPrefs;
  shown: TrackLensPrefs;
  available: TrackLensPrefs;
  set(id: TrackLensId, on: boolean): void;
  toggle(id: TrackLensId): void;
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
  /** Wave 6: guide tones, the key plan, the beat grid (the same store, the same persistence and rollback). */
  music: MusicLenses;
  /** Wave 7: the advanced tracks' lenses (the same store, the same persistence and rollback). */
  track: TrackLenses;
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
  const progress = useCourseProgress();
  const completed = new Set(
    (progress.data?.lessons ?? []).filter((l) => l.completedAt !== null).map((l) => l.lessonId as string),
  );
  const set = (id: LensId | ChordLensId | LineLensId | MusicLensId | TrackLensId, on: boolean) => {
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
    music: {
      prefs: musicLensPrefs(prefs),
      shown: effectiveMusicLenses(prefs, unlocked),
      available: musicLensAvailability(unlocked),
      set,
      toggle: (id) => set(id, !musicLensPrefs(stored())[id]),
    },
    track: {
      prefs: trackLensPrefs(prefs),
      shown: effectiveTrackLenses(prefs, unlocked, completed),
      available: trackLensAvailability(unlocked, completed),
      set,
      toggle: (id) => set(id, !trackLensPrefs(stored())[id]),
    },
  };
}
