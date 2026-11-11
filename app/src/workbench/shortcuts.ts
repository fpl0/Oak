// The workbench keys that arrived in Wave 2 (ux §7.10: `L` loop, `[`/`]` shrink/extend, `Shift+[`/`Shift+]`
// move, `M` metronome). The workbench handles them itself (its own keydown, focus on the workbench, not in the
// editor); the shortcut sheet lists them in its static Workbench section (app/src/ui/shell/GlobalKeys.tsx).
// `shortcutRows()` gives them as display-only keymap rows (`when` is false) for a host that wants them there.
import type { Binding } from "../ui/keys/keymap.ts";

export const WORKBENCH_SHORTCUT_GROUP = "Workbench: loop and metronome";

/** [keys, description] in the keymap's key syntax. */
export const WORKBENCH_LOOP_SHORTCUTS: readonly (readonly [string, string])[] = [
  ["L", "Loop a region on / off"],
  ["[", "Loop one bar shorter"],
  ["]", "Loop one bar longer"],
  ["Shift+[", "Move the loop one bar earlier"],
  ["Shift+]", "Move the loop one bar later"],
  ["M", "Metronome on / off"],
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
