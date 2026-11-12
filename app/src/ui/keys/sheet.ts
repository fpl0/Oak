// The shortcut sheet's static sections (ux §7.10): keys a component handles itself — the editor, the Workbench, the
// answer widgets, the tutor composer — as opposed to page keys, which are keymap bindings with a `group` and appear
// in the sheet while their page is on screen.
//
// A component that handles keys of its own lists them here with `registerShortcutSection`, at module load (so the
// sheet shows them from any page, the way it lists the editor's keys) or on mount (only while it is on screen).
// Registering the same `id` again replaces the section. Pure store, no DOM.
import { create } from "zustand";
import { WORKBENCH_LOOP_SHORTCUTS } from "../../workbench/shortcuts.ts";

/** [keys in the keymap's syntax ("Mod+Enter", "Shift+1", "G T"), what they do]. */
export type SheetRow = readonly [keys: string, description: string];

export interface SheetSection {
  id: string;
  title: string;
  rows: readonly SheetRow[];
  /** Position among the static sections (lower first; the built-in ones are 10, 20, 30, 40). */
  order?: number;
}

export const CORE_SECTIONS: readonly SheetSection[] = [
  {
    id: "editor",
    title: "Editor",
    order: 10,
    rows: [
      ["Mod+Enter", "Run (evaluate and play)"],
      ["Mod+.", "Stop"],
      ["Alt+Q", "Previous block"],
      ["Alt+W", "Next block"],
      ["Mod+/", "Toggle comment"],
      ["Ctrl+Space", "Autocomplete"],
      ["Mod+Z", "Undo (an applied card too)"],
      ["Mod+Shift+Z", "Redo"],
    ],
  },
  {
    id: "workbench",
    title: "Workbench",
    order: 20,
    rows: [
      ["Space", "Play / stop"],
      ["R", "Roll"],
      ["N", "Notation"],
      ["K", "Typing-keyboard play"],
      ["A", "A/B: hear A"],
      ["B", "A/B: hear B"],
      ["T", "Practice tempo"],
      ["F", "Focus the editor"],
      ...WORKBENCH_LOOP_SHORTCUTS,
      ["ArrowRight", "Circle of fifths panel: next key (arrows move, Home: the piece's key)"],
      ["Enter", "Circle of fifths panel: hear the code in that key (also Space; Escape stops)"],
    ],
  },
  {
    id: "answers",
    title: "Answers",
    order: 30,
    rows: [
      ["Enter", "Check"],
      ["1", "Pick an option, a degree or a numeral (1 to 9)"],
      ["Shift+1", "Hear an option (1 to 9)"],
      ["-", "Flat before a degree or numeral"],
      ["+", "Sharp before a degree or numeral"],
      ["M", "Major / minor numeral"],
      ["Backspace", "Clear the last slot"],
      ["A", "Piano keys: A W S E D F T G Y H U J K (C to C)"],
      ["Z", "Piano keys: octave down (X up)"],
      ["Alt+ArrowUp", "Move a block up (Alt+Down: down)"],
      ["X", "Rhythm grid: toggle a cell"],
      ["P", "Rhythm grid and blocks: play"],
      ["Space", "Tap pad: tap (also F and J)"],
      ["B", "Degree pad: flat before a degree, when the pad has flat degrees"],
    ],
  },
  {
    // Wave 3: the staff a learner writes on (app/src/answers/staff, ux §4.5).
    id: "staff-input",
    title: "Staff input",
    order: 32,
    rows: [
      ["C", "Place the nearest C at the cursor (any letter A to G); the cursor steps on"],
      ["ArrowRight", "Cursor one grid step right (ArrowLeft: left)"],
      ["Shift+ArrowRight", "Cursor one bar right (Shift+ArrowLeft: left)"],
      ["Home", "Cursor to the start (End: the end)"],
      ["ArrowUp", "Move the cursor, or the note under it, up a step (ArrowDown: down)"],
      ["Shift+ArrowUp", "Raise the note under the cursor a half step (Shift+ArrowDown: lower)"],
      ["Mod+ArrowUp", "Up an octave (Mod+ArrowDown: down)"],
      ["#", "Sharp (also +)"],
      ["-", "Flat"],
      ["=", "Natural"],
      ["4", "Length: 2 sixteenth, 3 eighth, 4 quarter, 5 half, 6 whole"],
      [".", "Dot the length"],
      ["0", "Rest"],
      ["Backspace", "Delete the note (also Delete)"],
      ["Enter", "Check"],
    ],
  },
  {
    // Wave 3: key signatures, keys and intervals (app/src/answers/staff/KeySignature, answers/keys).
    id: "keys-intervals",
    title: "Key signatures, keys and intervals",
    order: 34,
    rows: [
      ["F", "Key signature: add that letter's sharp or flat (any letter A to G)"],
      ["#", "Key signature: write sharps (- writes flats)"],
      ["ArrowUp", "Key signature: move the cursor a step (ArrowDown: down)"],
      [".", "Key signature: add at the cursor (also Insert)"],
      ["Backspace", "Key signature: remove the last accidental"],
      ["ArrowRight", "Circle of fifths: next key round the circle (ArrowLeft: back)"],
      ["ArrowDown", "Circle of fifths: majors to relative minors (ArrowUp: back)"],
      ["3", "Interval: pick the number (1 to 8)"],
      ["Shift+M", "Interval quality: major (m minor, P perfect, A augmented, D diminished)"],
      ["Backspace", "Interval: clear"],
    ],
  },
  {
    id: "tutor",
    title: "Tutor composer",
    order: 40,
    rows: [
      ["Enter", "Send"],
      ["Shift+Enter", "New line"],
      ["Escape", "Stop the answer"],
      ["ArrowUp", "Recall your last message (empty composer)"],
    ],
  },
];

export const useSheetSections = create<{ sections: readonly SheetSection[] }>(() => ({ sections: [] }));

/** Adds (or replaces, by `id`) a static section of the shortcut sheet. Returns the function that removes it. */
export function registerShortcutSection(section: SheetSection): () => void {
  useSheetSections.setState((s) => ({
    sections: [...s.sections.filter((x) => x.id !== section.id), section],
  }));
  return () => useSheetSections.setState((s) => ({ sections: s.sections.filter((x) => x !== section) }));
}

/**
 * The static sections in sheet order: the core ones and the registered ones (a registered section with a core
 * `id` replaces it), sorted by `order`, without rows a live keymap group already lists (`liveKeys`, by "keys|text").
 */
export function sheetSections(
  registered: readonly SheetSection[],
  liveKeys: ReadonlySet<string> = new Set(),
): SheetSection[] {
  const byId = new Map<string, SheetSection>();
  for (const s of CORE_SECTIONS) byId.set(s.id, s);
  for (const s of registered) byId.set(s.id, s);
  return [...byId.values()]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.order ?? 50) - (b.s.order ?? 50) || a.i - b.i)
    .map(({ s }) => ({ ...s, rows: s.rows.filter(([k, d]) => !liveKeys.has(`${k}|${d}`)) }))
    .filter((s) => s.rows.length > 0);
}
