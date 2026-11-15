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
/**
 * The key whose signature a staff shows for `key`. Wave 5: a blues key (`.scale("C4:blues")`, U11) is written in
 * the tonic's major signature, as blues lead sheets are: the 12-bar blues runs on I7 IV7 V7, and its blue notes
 * (♭3, ♭5, ♭7) are accidentals against the major (E♭, G♭/F♯ and B♭ in C, never a three-flat signature). Every
 * other mode keeps its own signature (a minor pentatonic riff in A reads in A minor).
 */
export function signatureKey(key: KeySpec | null): KeySpec | null {
  return key && key.mode === "blues" ? { tonic: key.tonic, mode: "major" } : key;
}
/** The key signature plus its alteration per letter (`sig.F === 1` in D major). */
export function keySig(key0: KeySpec | null): KeySignature & { sig: Record<string, number> } {
  const key = signatureKey(key0);
  const ks: KeySignature = key ? theory.keySignature(key) : { accidentals: 0, notes: [], abcK: "C" };
  const sig: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (const n of ks.notes) {
    const m = /^([A-G])(#+|b+)?$/.exec(n);
    if (m) sig[m[1] as string] = (m[2] ?? "").startsWith("#") ? (m[2] ?? "").length : -(m[2] ?? "").length;
  }
  return { ...ks, sig };
}
/** A blue note (♭3, ♭5, ♭7 against the tonic read as major), or null. */
export function blueNote(midi: number, key: KeySpec): theory.BlueNote | null {
  return theory.blueNoteOf(midi, key);
}
/** A blue note spelled for the staff: ♭3 and ♭7 as flats, ♭5 by direction (F♯ going up, G♭ going down). */
export function spellBlue(midi: number, key: KeySpec, direction?: 1 | -1): SpelledPitch {
  return theory.spellBlueNote(midi, key, direction);
}
/** Whether a chord symbol is a dominant seventh ("C7", "G7/B"). */
export function isDominantSeventh(symbol: string): boolean {
  return theory.isDominantSeventhSymbol(symbol);
}
/** The pitch classes of a chord (spelled names), for "is this note a chord tone". */
export function chordPcs(chord: ChordId): number[] {
  return theory.chordNotes(chord).flatMap((n) => {
    const p = theory.parseNote(`${n}4`);
    return p ? [((p.midi % 12) + 12) % 12] : [];
  });
}
/**
 * The pitch classes of a chord's guide tones (its 3rd and its 7th; `null` where it has none), or `null` for a
 * symbol the chord table does not know. Slash chords read as the chord over the bass.
 */
export function guideTonePcs(symbol: string): { third: number | null; seventh: number | null } | null {
  const chord = theory.parseChordWithBass(symbol);
  if (!chord) return null;
  const g = theory.guideTones(chord);
  return { third: g.third?.pc ?? null, seventh: g.seventh?.pc ?? null };
}
export function keyFromScaleCtx(scaleCtx: string): KeySpec | null {
  return theory.keyFromScaleCtx(scaleCtx);
}
export function parseChord(symbol: string): ChordId | null {
  return theory.parseChordSymbol(symbol);
}
/** A chord symbol (slash chords too: `G/B`, `Bb/D`) as the chord its notes are spelled from. */
export function chordForSpelling(symbol: string): ChordId | null {
  return theory.parseChordWithBass(symbol);
}
/**
 * Lead-sheet display of a code symbol, in the form abcjs prints correctly (theory's `abc` column:
 * `Cm7b5` → C m7♭5, `Co7` → C°7, `G/B` keeps its bass). An unknown symbol is shown as written, minus the literal
 * `h7`.
 */
export function chordDisplay(symbol: string): string {
  const chord = theory.parseChordWithBass(symbol);
  const text = chord ? theory.toAbcChord(chord) : symbol;
  return text.replace(/h7?$/, "ø7");
}
/** Wave 7: the jazz-glyph display of a code symbol (`C^7` → C∆7, `Cm7b5` → Cø7); unknown text as written. */
export function jazzChordDisplay(symbol: string): string {
  const chord = theory.parseChordWithBass(symbol);
  return chord ? theory.toJazzGlyph(chord) : symbol;
}
/**
 * A Roman numeral in Oak's dialect (`V6`, `viio7`, `bVII`, `iih7`, `V65/V`) as printed under the staff: theory's
 * display (`displayRN`: ° and ø, ♭ and ♯ before the numeral), figures as digits after it ("V65", "I64": abcjs
 * cannot stack them, `ABCJS_LIMITS` "stacked-figures"). abcjs prints annotation text as written, so the glyphs are
 * Unicode here (chord symbols are ASCII: abcjs turns b, # and o into glyphs itself). Unknown text is kept.
 */
export function romanDisplay(rn: string): string {
  return (
    rn
      .trim()
      .replace(/h7/g, "ø7")
      .replace(/(^|\/)b(?=[IViv])/g, "$1♭")
      .replace(/(^|\/)#(?=[IViv])/g, "$1♯")
      .replace(/([iv])o(?=\d|\/|$)/g, "$1°")
      // Wave 7: an altered tension in the figure is a glyph as in the chord symbol above it (V7♭9, Imaj7♯11),
      // never the ASCII letter beside the jazz symbol's ♭.
      .replace(/(?<=\d)b(?=\d)/g, "♭")
      .replace(/(?<=\d)#(?=\d)/g, "♯")
  );
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
/** Letter steps and alteration of a tension above a chord's root, by semitones (♭9 9 ♯9 11 ♯11 ♭13 13). */
const TENSIONS: Record<number, [number, number]> = {
  1: [1, -1],
  2: [1, 0],
  3: [1, 1],
  5: [3, 0],
  6: [3, 1],
  8: [5, -1],
  9: [5, 0],
};
/**
 * Wave 7: a note that is not a tone of `chord` spelled as the tension it is above the chord's root (the 9th of E♭
 * is F, not the E♯ the key of B would give; the ♭9 of G is A♭), or null when it is no tension or that spelling would
 * need a double accidental or a white-key enharmonic (E♯, B♯, C♭, F♭).
 */
export function spellTension(midi: number, chord: ChordId): SpelledPitch | null {
  const m = Math.round(midi);
  const semis = (((m - chord.rootPc) % 12) + 12) % 12;
  const t = TENSIONS[semis];
  const rootLetter = LETTERS.indexOf(chord.root.charAt(0));
  if (!t || rootLetter < 0) return null;
  const letter = (rootLetter + t[0]) % 7;
  const pc = ((m % 12) + 12) % 12;
  let alt = pc - (NATURAL[letter] as number);
  if (alt > 6) alt -= 12;
  if (alt < -6) alt += 12;
  if (Math.abs(alt) > 1) return null;
  const p = makePitch(letter, alt, m);
  return /^(?:E#|B#|Cb|Fb)/.test(p.name) ? null : p;
}
