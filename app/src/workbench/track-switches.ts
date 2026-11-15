// The advanced tracks' lens switches in the Workbench's lens bar (Wave 7, docs/design/wave7.md §4.2), and the
// lessons that teach what the chord lens names. Pure: the Studio and the tests read it without the Workbench.
import type { TrackLensId } from "@oak/api";

/**
 * The advanced tracks' lens switches (Wave 7, wave7.md §4.2): label, key and title. Three have a key of their own
 * (the only Shift+letters left); the other five are switched from the lens bar and the command palette.
 */
export const TRACK_SWITCHES: readonly { id: TrackLensId; label: string; keys: string; title: string }[] = [
  {
    id: "tensions",
    label: "Tensions",
    keys: "Shift+X",
    title: "The melody's 9, 11 and 13 against each chord; a held avoid note ringed",
  },
  {
    id: "voicings",
    label: "Voicings",
    keys: "",
    title: "Shell, rootless A or B, drop-2 or spread over each voiced chord",
  },
  {
    id: "chordScales",
    label: "Chord-scales",
    keys: "Shift+Q",
    title: "A common chord-scale for each chord, under the chord band",
  },
  {
    id: "clave",
    label: "Clave",
    keys: "",
    title: "The clave's two-bar grid behind the roll, its direction named",
  },
  {
    id: "polyLanes",
    label: "Pulse lanes",
    keys: "",
    title: "A lane per pulse of a polyrhythm, or a polymeter's cycle against the bar",
  },
  {
    id: "microtiming",
    label: "Microtiming",
    keys: "",
    title: "How far each onset sits from the grid, in milliseconds at the piece's tempo",
  },
  {
    id: "registers",
    label: "Registers",
    keys: "",
    title: "Register bands and each part's range on the spectrum panel",
  },
  {
    id: "density",
    label: "Density",
    keys: "Shift+D",
    title: "How busy each section is, one bar per section",
  },
];
/** The lesson that teaches each substitution the chord lens names (J5), and the ii–V bracket (J1.L03). */
export const DEVICE_LESSONS: Readonly<Record<string, string>> = {
  "tritone sub": "J5.L01",
  backdoor: "J5.L02",
  "passing °7": "J5.L03",
};
export const TWO_FIVE_LESSON = "J1.L03";
/** Jazz chord glyphs (J1.L02): the chord band and the staff write C∆7, D–7, Bø7. */
export const JAZZ_GLYPHS_TOOL = "tb.feature.jazz-glyphs";

/** Patterned swing (R1.L02): swung notes are drawn against their straight places from here on. */
export const PATTERNED_SWING_TOOL = "tb.swing.patterned";
