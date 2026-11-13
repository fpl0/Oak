// The lens switches of the drill footer (wave3.md §4.3): degree numbers, solfège and note names, the one
// shared preference (`useLenses`). A lens that is not unlocked yet has no switch at all (before U03.L02 no
// degree labels, before U03.L08 no syllables); with none unlocked but note names, only that one shows.
import { clsx } from "clsx";
import {
  CHORD_LENS_IDS,
  CHORD_LENS_LABELS,
  type ChordLensId,
  LENS_IDS,
  LENS_LABELS,
  type Lenses,
  type LensId,
} from "../lib/lenses.ts";

/**
 * The label switches. With `chords` (a harmony trial), the chord lenses join them (wave4.md §4.3): chord symbols
 * and Roman numerals, each only once it is unlocked.
 */
export function LensSwitches({
  lenses,
  className,
  chords = false,
}: {
  lenses: Lenses;
  className?: string;
  chords?: boolean;
}) {
  const ids: ({ kind: "note"; id: LensId } | { kind: "chord"; id: ChordLensId })[] = [
    ...LENS_IDS.filter((id) => lenses.available[id]).map((id) => ({ kind: "note" as const, id })),
    ...(chords
      ? CHORD_LENS_IDS.filter((id) => lenses.chords.available[id]).map((id) => ({
          kind: "chord" as const,
          id,
        }))
      : []),
  ];
  if (!lenses.ready || ids.length === 0) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons; a fieldset would bring its own border and legend layout
    <div role="group" aria-label="Labels" className={clsx("flex items-center gap-1.5", className)}>
      <span aria-hidden className="text-sm text-text-3">
        Labels
      </span>
      {ids.map(({ kind, id }) => {
        const on = kind === "note" ? lenses.prefs[id as LensId] : lenses.chords.prefs[id as ChordLensId];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              kind === "note" ? lenses.toggle(id as LensId) : lenses.chords.toggle(id as ChordLensId)
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
            {kind === "note" ? LENS_LABELS[id as LensId] : CHORD_LENS_LABELS[id as ChordLensId]}
          </button>
        );
      })}
    </div>
  );
}
