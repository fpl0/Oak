// The only place notation calls @oak/theory (the one owner of spelling, key signatures and the chord
// table, contracts §6.7 rule 7), adapted to what the engraver needs.
import type { KeySpec, MeterSpec, Rat } from "@oak/content-kit";
import type { ChordId, KeySignature, SpelledPitch } from "@oak/theory";
import * as theory from "@oak/theory";

export function spell(
  midi: number,
  ctx: { key: KeySpec | null; chord?: ChordId; direction?: 1 | -1 },
): SpelledPitch {
  return theory.spellMidi(midi, ctx);
}
/** The key signature plus its alteration per letter (`sig.F === 1` in D major). */
export function keySig(key: KeySpec | null): KeySignature & { sig: Record<string, number> } {
  const ks: KeySignature = key ? theory.keySignature(key) : { accidentals: 0, notes: [], abcK: "C" };
  const sig: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (const n of ks.notes) {
    const m = /^([A-G])(#+|b+)?$/.exec(n);
    if (m) sig[m[1] as string] = (m[2] ?? "").startsWith("#") ? (m[2] ?? "").length : -(m[2] ?? "").length;
  }
  return { ...ks, sig };
}
export function keyFromScaleCtx(scaleCtx: string): KeySpec | null {
  return theory.keyFromScaleCtx(scaleCtx);
}
export function parseChord(symbol: string): ChordId | null {
  return theory.parseChordSymbol(symbol);
}
/**
 * Lead-sheet display of a code symbol, in the form abcjs prints correctly (theory's `abc` column:
 * `Cm7b5` → C m7♭5, `Co7` → C°7). An unknown symbol is shown as written, minus the literal `h7`.
 */
export function chordDisplay(symbol: string): string {
  const chord = parseChord(symbol);
  const text = chord ? theory.toAbcChord(chord) : symbol;
  return text.replace(/h7?$/, "ø7");
}
export function degreeLabel(p: SpelledPitch, key: KeySpec): { degree: string; syllable: string } {
  const d = theory.degreeOf(p.midi, key);
  return { degree: d.degree, syllable: d.syllable };
}
/** Rhythm-count syllable: the beat number on the beat ("1"), the syllable alone off it ("e", "&", "la"). */
export function countLabel(inBarCycles: Rat, meter: MeterSpec): string {
  const label = theory.barPosition(inBarCycles, meter).label;
  const m = /^(\d+)(.*)$/.exec(label);
  if (!m) return label;
  return m[2] ? (m[2] as string) : (m[1] as string);
}
export function parseNoteName(
  text: string,
): { midi: number; letter: string; alt: number; oct: number } | null {
  return theory.parseNote(text);
}
const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** A SpelledPitch from its parts (no spelling decision: the caller chose letter and alteration). */
export function makePitch(letter: number, alt: number, midi: number): SpelledPitch {
  const oct = (midi - alt - (NATURAL[letter] as number)) / 12 - 1;
  const l = LETTERS[letter] as string;
  const acc = alt > 0 ? "#".repeat(alt) : "b".repeat(-alt);
  return { midi, name: `${l}${acc}${oct}`, letter: l, alt, oct };
}
