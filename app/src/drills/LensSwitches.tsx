// The lens switches of the drill footer (wave3.md §4.3): degree numbers, solfège and note names, the one
// shared preference (`useLenses`). A lens that is not unlocked yet has no switch at all (before U03.L02 no
// degree labels, before U03.L08 no syllables); with none unlocked but note names, only that one shows.

import type { TrackLensId } from "@oak/api";
import type { FamilyDef } from "@oak/content-kit";
import { clsx } from "clsx";
import {
  CHORD_LENS_IDS,
  CHORD_LENS_LABELS,
  type ChordLensId,
  LENS_IDS,
  LENS_LABELS,
  type Lenses,
  type LensId,
  TRACK_LENS_LABELS,
} from "../lib/lenses.ts";

/**
 * Families whose trials show no pitch label (rhythm feel, groove lock, form, the twelve-bar chart's numerals):
 * the degree, solfège and note-name switches would change nothing there, so the footer leaves them out.
 */
export function hidesNoteLenses(def: Pick<FamilyDef, "generator"> | undefined): boolean {
  return !!def && /^(rhythm-|form-)/.test(def.generator);
}

/**
 * The label switches. With `chords` (a harmony trial), the chord lenses join them (wave4.md §4.3): chord symbols
 * and Roman numerals, each only once it is unlocked. Wave 7: `track` names the track lenses a trial draws with (the
 * clave grid, the pulse lanes), each only once it is opened; `notes: false` leaves the note lenses out (a rhythm).
 */
export function LensSwitches({
  lenses,
  className,
  chords = false,
  track = [],
  notes = true,
}: {
  lenses: Lenses;
  className?: string;
  chords?: boolean;
  track?: readonly TrackLensId[];
  notes?: boolean;
}) {
  type Entry =
    | { kind: "note"; id: LensId }
    | { kind: "chord"; id: ChordLensId }
    | { kind: "track"; id: TrackLensId };
  const ids: Entry[] = [
    ...(notes
      ? LENS_IDS.filter((id) => lenses.available[id]).map((id) => ({ kind: "note" as const, id }))
      : []),
    ...(chords
      ? CHORD_LENS_IDS.filter((id) => lenses.chords.available[id]).map((id) => ({
          kind: "chord" as const,
          id,
        }))
      : []),
    ...track.filter((id) => lenses.track.available[id]).map((id) => ({ kind: "track" as const, id })),
  ];
  if (!lenses.ready || ids.length === 0) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons; a fieldset would bring its own border and legend layout
    <div role="group" aria-label="Labels" className={clsx("flex items-center gap-1.5", className)}>
      <span aria-hidden className="text-sm text-text-3">
        Labels
      </span>
      {ids.map(({ kind, id }) => {
        const on =
          kind === "note"
            ? lenses.prefs[id as LensId]
            : kind === "chord"
              ? lenses.chords.prefs[id as ChordLensId]
              : lenses.track.prefs[id as TrackLensId];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              kind === "note"
                ? lenses.toggle(id as LensId)
                : kind === "chord"
                  ? lenses.chords.toggle(id as ChordLensId)
                  : lenses.track.toggle(id as TrackLensId)
            }
            data-testid={`lens-${id}`}
            className={clsx(
              "h-7 rounded-control border px-2 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              on
                ? "border-accent bg-lane-in text-text"
                : "border-border bg-surface text-text-2 hover:text-text",
            )}
          >
            {kind === "note"
              ? LENS_LABELS[id as LensId]
              : kind === "chord"
                ? CHORD_LENS_LABELS[id as ChordLensId]
                : TRACK_LENS_LABELS[id as TrackLensId]}
          </button>
        );
      })}
    </div>
  );
}
