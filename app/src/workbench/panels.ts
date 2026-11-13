// Which Workbench panels and chord labels exist and which are open (Wave 3 key panels; Wave 4 chord band,
// function bands, range, chord tones and the lead sheet: docs/design/wave4.md §4.3–§4.4). Two deciders, as for
// the note labels (lens-view.ts):
//   - the lenses (Studio, the Toolbox, the capstone…): every panel whose tool is unlocked has a switch; the
//     chord band follows the chord lenses (symbols, numerals) and the function lens;
//   - the content (a lesson step): a panel exists only when the step opens it (`StepUi.initialPanels`, passed
//     through `initialPanelsOf`) and its tool is unlocked; the learner can close it and open it again.
// Pure: tested in wave4.test.ts.
import { WORKBENCH_PANEL_TOOLS, type WorkbenchPanelId } from "@oak/content-kit";
import { CHORD_LENS_UNLOCKS } from "../lib/lenses.ts";

/** The panels the Workbench draws: the content-kit panels plus the lead-sheet view of the staff. */
export type PanelId = WorkbenchPanelId | "lead";
export const PANEL_IDS: readonly PanelId[] = [
  "key",
  "circle",
  "chords",
  "function",
  "range",
  "chord-tones",
  "lead",
];

/** The toolbox row each panel needs (contracts §3.2 group A). */
export const PANEL_UNLOCKS: Readonly<Record<PanelId, string>> = {
  ...WORKBENCH_PANEL_TOOLS,
  lead: "tb.feature.leadsheet",
};

/** Panels a learner switches on and off with a key (lens mode), in the order of the transport's switches. */
export const PANEL_SWITCHES: readonly {
  id: Exclude<PanelId, "chords">;
  label: string;
  keys: string;
  title: string;
}[] = [
  { id: "key", label: "Key", keys: "Shift+K", title: "The key-signature panel" },
  { id: "circle", label: "Circle", keys: "Shift+C", title: "The circle of fifths" },
  { id: "function", label: "Function", keys: "Shift+F", title: "Function bands: T, PD and D" },
  { id: "chord-tones", label: "Chord tones", keys: "Shift+T", title: "Chord tones in the melody" },
  { id: "range", label: "Range", keys: "Shift+G", title: "The range of each melody line" },
  { id: "lead", label: "Lead sheet", keys: "Shift+L", title: "The staff as a lead sheet" },
];

export type PanelState = Record<PanelId, boolean>;
export const NO_PANELS: PanelState = {
  key: false,
  circle: false,
  chords: false,
  function: false,
  range: false,
  "chord-tones": false,
  lead: false,
};

export interface PanelContext {
  /** Who decides: the lenses (switches) or the content (the step's panels). */
  mode: "lenses" | "content";
  /** Panels allowed at all (not the mini variant, the host did not turn them off). */
  allowed: boolean;
  unlocked: ReadonlySet<string>;
  /** The host's panels (a step's `initialPanels`, a Toolbox feature page). */
  initial?: Partial<Record<PanelId, boolean>> | undefined;
  /** The workbench shows a staff (the lead sheet needs one). */
  hasStaff: boolean;
  /** The workbench shows a roll (the chord band, function, range and chord tones draw on it). */
  hasRoll: boolean;
}

/** Which panels this learner can open here. */
export function panelAvailability(c: PanelContext): PanelState {
  const out: PanelState = { ...NO_PANELS };
  if (!c.allowed) return out;
  for (const id of PANEL_IDS) {
    if (!c.unlocked.has(PANEL_UNLOCKS[id])) continue;
    if (id === "lead" && !c.hasStaff) continue;
    if ((id === "range" || id === "chord-tones" || id === "function") && !c.hasRoll) continue;
    // In lens mode the chord band follows the chord lenses; `chords` is a step's way of opening it.
    if (id === "chords" && c.mode === "lenses") continue;
    out[id] = c.mode === "lenses" ? true : c.initial?.[id] === true;
  }
  return out;
}

/** The first state of the panels: the remembered choice (lens mode), with the host's choice winning. */
export function initialPanelState(
  stored: Partial<PanelState>,
  initial: Partial<Record<PanelId, boolean>> | undefined,
  mode: "lenses" | "content",
): PanelState {
  const out: PanelState = { ...NO_PANELS };
  for (const id of PANEL_IDS) {
    const want = initial?.[id];
    out[id] = want !== undefined ? want : mode === "lenses" ? stored[id] === true : false;
  }
  return out;
}

export interface ChordLensView {
  shown: { chordSymbols: boolean; romanNumerals: boolean };
  available: { chordSymbols: boolean; romanNumerals: boolean };
}

/** What the chord band and the staff show. */
export interface ChordDisplay {
  /** The band under the roll. */
  band: boolean;
  symbols: boolean;
  romans: boolean;
  /** Function colours on the band. */
  fn: boolean;
}

export function chordDisplay(
  mode: "lenses" | "content",
  open: PanelState,
  lenses: ChordLensView | null | undefined,
  unlocked: ReadonlySet<string>,
): ChordDisplay {
  if (mode === "lenses") {
    const symbols = lenses?.shown.chordSymbols ?? false;
    const romans = lenses?.shown.romanNumerals ?? false;
    return { band: symbols || romans || open.function, symbols, romans, fn: open.function };
  }
  const symbols = open.chords && unlocked.has(CHORD_LENS_UNLOCKS.chordSymbols);
  const romans = open.chords && unlocked.has(CHORD_LENS_UNLOCKS.romanNumerals);
  return { band: symbols || romans || open.function, symbols, romans, fn: open.function };
}

const STORE = "oak.wb.panels";

/** The viewer's remembered panels (a per-viewer convenience; absent storage gives none). */
export function readStoredPanels(): Partial<PanelState> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, unknown>;
    const out: Partial<PanelState> = {};
    for (const id of PANEL_IDS) if (v[id] === true) out[id] = true;
    return out;
  } catch {
    return {};
  }
}

export function writeStoredPanels(v: PanelState): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    // nothing to do when storage is unavailable
  }
}
