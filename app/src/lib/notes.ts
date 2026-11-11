// Note names for display. Spelling always goes through @oak/theory (the one spelling table); Strudel's own
// `value.note` is never used for spelling (interfaces §3).
import { spellMidi } from "@oak/theory";
import { accidentals } from "./format.ts";

/** `60` → `C4`, `61` → `D♭4` (MIDI 60 = C4; no key context, so the theory package's default spelling). */
export function formatNoteMidi(midi: number): string {
  return accidentals(spellMidi(midi, { key: null }).name);
}
