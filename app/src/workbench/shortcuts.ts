// The workbench keys that arrived in Wave 2 (ux §7.10: `L` loop, `[`/`]` shrink/extend, `Shift+[`/`Shift+]`
// move, `M` metronome) and Wave 3 (the lens bar: `D` degrees, `S` solfège, `Shift+N` note names, `Shift+K` the
// key-signature panel, `Shift+C` the circle of fifths) and Wave 4 (`Shift+H`/`Shift+R` chord symbols and numerals, `Shift+F` function,
// `Shift+T` chord tones, `Shift+G` range, `Shift+L` lead sheet). The workbench handles them itself (its own keydown, focus on the workbench, not in the
// editor); the shortcut sheet lists them in its static Workbench section (app/src/ui/shell/GlobalKeys.tsx).
// `shortcutRows()` gives them as display-only keymap rows (`when` is false) for a host that wants them there.
import type { Binding } from "../ui/keys/keymap.ts";

export const WORKBENCH_SHORTCUT_GROUP = "Workbench: loop, metronome, labels and panels";

/**
 * Wave 3: the lens bar (labels and key panels, each once unlocked; not inside a lesson step, where the step
 * decides the labels).
 */
export const WORKBENCH_LENS_SHORTCUTS: readonly (readonly [string, string])[] = [
  ["D", "Degree labels on / off"],
  ["S", "Solfège labels on / off"],
  ["Shift+N", "Note-name labels on / off"],
  ["Shift+K", "Key-signature panel"],
  ["Shift+C", "Circle of fifths"],
  // Wave 4: the chord lenses and the harmony panels, each once unlocked.
  ["Shift+H", "Chord symbols on / off"],
  ["Shift+R", "Roman numerals on / off"],
  ["Shift+F", "Function bands (T, PD, D)"],
  ["Shift+T", "Chord tones in the melody"],
  ["Shift+G", "Range of each melody line"],
  ["Shift+L", "Lead sheet"],
  // Wave 5: the line lenses and the form and sound panels, each once unlocked.
  ["Shift+O", "Section ribbon on / off"],
  ["Shift+E", "Form map and energy curve"],
  ["Shift+B", "Bass roles (root, fifth, octave, approach) on / off"],
  ["Shift+U", "Blue notes on / off"],
  ["Shift+W", "Scope: the wave of what plays"],
  ["Shift+Y", "Spectrum of what plays"],
  ["Shift+P", "Chord chart, four bars a line"],
  // Wave 6: the harmony and time lenses of U12–U17, each once unlocked.
  ["Shift+I", "Guide tones (3rds and 7ths, and their line) on / off"],
  ["Shift+J", "Key ribbon (the key along the piece) on / off"],
  ["Shift+V", "Beat grid (counts, triplets, pushes) on / off"],
];

/**
 * [keys, description] in the keymap's key syntax: the loop and metronome keys (Wave 2), then the lens bar's
 * (Wave 3). The shortcut sheet's static Workbench section lists every row.
 */
export const WORKBENCH_LOOP_SHORTCUTS: readonly (readonly [string, string])[] = [
  ["L", "Loop a region on / off"],
  ["[", "Loop one bar shorter"],
  ["]", "Loop one bar longer"],
  ["Shift+[", "Move the loop one bar earlier"],
  ["Shift+]", "Move the loop one bar later"],
  ["M", "Metronome on / off"],
  ...WORKBENCH_LENS_SHORTCUTS,
];

export function shortcutRows(): Binding[] {
  return WORKBENCH_LOOP_SHORTCUTS.map(([keys, description], i) => ({
    id: `workbench:wave2:${i}`,
    keys,
    scope: "workbench",
    description,
    group: WORKBENCH_SHORTCUT_GROUP,
    when: () => false,
    run: () => {},
  }));
}
