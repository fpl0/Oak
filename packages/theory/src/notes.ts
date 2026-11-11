// Notes with Strudel's semantics: `s`/`f` are accidentals after the letter, a missing octave is 3.
import { letterIndex, mod, nameOf, parsePcName, pcOfSpelled } from "./pitch.ts";
import type { ParsedNote, Pc } from "./types.ts";

const STRUDEL_NOTE = /^([a-gA-G])([#bsf]*)(-?\d+)?$/;

/**
 * Strudel note-name semantics, not tonal's: `s`/`f` are accidentals after the letter ("cs4", "ef4"; "f4" is
 * the note F4), `#`/`b` too, and a missing octave means octave 3 ("c" = 48). Returns `null` for anything else,
 * including more than two accidentals.
 */
export function parseNote(text: string): ParsedNote | null {
  const m = STRUDEL_NOTE.exec(text.trim());
  if (!m) return null;
  const letter = (m[1] as string).toUpperCase();
  let alt = 0;
  for (const ch of m[2] ?? "") alt += ch === "#" || ch === "s" ? 1 : -1;
  if (Math.abs(alt) > 2) return null;
  const defaultedOctave = m[3] === undefined;
  const oct = defaultedOctave ? 3 : Number(m[3]);
  const midi = 12 * (oct + 1) + ([0, 2, 4, 5, 7, 9, 11][letterIndex(letter)] as number) + alt;
  return { midi, letter, alt, oct, defaultedOctave };
}

/** MIDI of a Strudel note name, or `null`. */
export function noteToMidi(text: string): number | null {
  return parseNote(text)?.midi ?? null;
}

export function midiToPc(midi: number): Pc {
  return mod(Math.round(midi), 12) as Pc;
}
export function freqToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Pitch class of a spelled name ("Eb" → 3, "F#" → 6, "Cb" → 11). Accepts Strudel's `s`/`f` too. Throws on garbage. */
export function pcOf(name: string): Pc {
  const s = parsePcName(name);
  if (s) return pcOfSpelled(s);
  const n = parseNote(name);
  if (n) return midiToPc(n.midi);
  throw new RangeError(`@oak/theory: not a note name: "${name}"`);
}

/** Scientific name of a Strudel note name ("cs4" → "C#4", "ef" → "Eb3"), or `null`. */
export function normalizeNoteName(text: string): string | null {
  const n = parseNote(text);
  if (!n) return null;
  return `${nameOf({ letter: letterIndex(n.letter), alt: n.alt })}${n.oct}`;
}
