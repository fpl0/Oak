// Wave 4 seam (docs/design/wave4.md §3.1): the harmony questions U05–U07 ask, each answered in one call over
// the existing chord table, Roman numerals and schemas. Nothing here spells a chord itself: identity,
// spelling and numerals come from chords.ts and roman.ts, so the three dialects cannot drift.
//
//   readChord          a triad or seventh from a pitch-class set and a bass (root, quality, inversion, names)
//   diatonicChordOn    the diatonic chord on a degree of a key (triad or seventh)
//   romanText / chordOfRoman   Roman numerals to and from text in a key ("V6", "I64", "ii7", "viiø7")
//   harmonicFunction   tonic / predominant / dominant (or chromatic)
//   cadenceOf          the cadence two chords and the melody's last note make
//   schemaOf           which loop a chord sequence is, in any rotation (axis, doo-wop, three-chord rock)
//   chordSymbol        normalisation between lead-sheet display, Oak code spelling, jazz glyphs and a voicing dict
//   toneRole           chord tone or which non-chord tone a melody note is against the chord under it
import type { CadenceType, ChordQuality, KeySpec } from "@oak/content-kit";
import {
  chordPcs,
  identifyChord,
  parseChordWithBass,
  toAbcChord,
  toCode,
  toJazzGlyph,
  toLeadSheet,
} from "./chords.ts";
import { mod } from "./pitch.ts";
import {
  classifyCadence,
  diatonicChords,
  formatRN,
  functionOf,
  inversionOf,
  parseRN,
  rnToChord,
  romanOf,
} from "./roman.ts";
import { SCHEMAS, schemaMatch } from "./schemas.ts";
import type { ChordId, HarmonicFunction, Pc, RomanNumeral, SchemaDef, VoicingDict } from "./types.ts";

/** The triad and seventh qualities U05–U07 read from notes (sus and extended chords come from symbols only). */
export const READABLE_QUALITIES: readonly ChordQuality[] = [
  "maj",
  "min",
  "dim",
  "aug",
  "maj7",
  "7",
  "m7",
  "m7b5",
  "dim7",
];

/** One chord read from sounding notes, with every name a view needs. */
export interface ChordReading {
  chord: ChordId;
  root: string;
  quality: ChordQuality;
  /** 0 root position, 1 first (3rd in the bass), 2 second (5th), 3 third (7th). */
  inversion: 0 | 1 | 2 | 3;
  /** Lead-sheet display with the slash bass for an inversion: "C/E", "G7/B", "B°". */
  leadSheet: string;
  /** Oak code spelling (no slash: code has no slash chords): "C", "Co", "Caug". */
  code: string;
  /** True when the bass is not the root. */
  slash: boolean;
}

/**
 * A triad or seventh chord from a pitch-class set and the bass pitch class. Only `READABLE_QUALITIES` are
 * considered and every pitch class must be a chord tone (a fifth may be missing); `null` otherwise. The bass
 * decides the inversion (contracts §6.7 item 5). Ties keep the reading whose root is the bass.
 */
export function readChord(pcs: Iterable<number>, bassPc: number): ChordReading | null {
  const set = [...new Set([...pcs].map((p) => mod(p, 12)))];
  if (set.length < 2) return null;
  const bass = mod(bassPc, 12) as Pc;
  const midis = set.map((pc) => 60 + pc);
  const cands = identifyChord(midis, { bassPc: bass }).filter(
    (c) =>
      READABLE_QUALITIES.includes(c.quality) &&
      set.every((pc) => (chordPcs(c) as number[]).includes(pc)) &&
      (chordPcs(c) as number[]).includes(bass),
  );
  const best = cands[0];
  if (!best) return null;
  const { fit: _fit, ...chord } = best;
  return describe(chord);
}

function describe(chord: ChordId): ChordReading {
  return {
    chord,
    root: chord.root,
    quality: chord.quality,
    inversion: inversionOf(chord),
    leadSheet: toLeadSheet(chord),
    code: toCode(chord),
    slash: chord.bassPc !== chord.rootPc,
  };
}

/**
 * The diatonic chord on `degree` (1–7) of a key: a triad, or a seventh chord with `seventh` (U06.L10). Minor
 * keys read natural minor, as `diatonicChords` does; the harmonic-minor V arrives in U10.
 */
export function diatonicChordOn(key: KeySpec, degree: number, opts: { seventh?: boolean } = {}): ChordId {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7)
    throw new RangeError(`@oak/theory: a degree is 1 to 7, not ${degree}`);
  const chord = diatonicChords(key, opts.seventh ?? false)[degree - 1];
  if (!chord) throw new RangeError(`@oak/theory: no diatonic chord on ${degree} in ${key.tonic} ${key.mode}`);
  return chord;
}

/** A chord's Roman numeral in a key, in Oak's dialect ("I", "V6", "I64", "viio", "V7", "Imaj7", "V7/V"). */
export function romanText(chord: ChordId, key: KeySpec, next?: ChordId): string {
  return formatRN(romanOf(chord, key, next));
}

/** The chord a Roman numeral names in a key ("V6" in C → G/B); `null` for text that is not a numeral. */
export function chordOfRoman(text: string, key: KeySpec): ChordId | null {
  const rn = parseRN(text, key);
  return rn ? rnToChord(rn, key) : null;
}

/** (degree, quality, inversion) of a numeral, the form RN answers are graded in (never by string). */
export function romanParts(
  text: string,
  key: KeySpec,
): Pick<RomanNumeral, "degree" | "alt" | "quality" | "inversion"> | null {
  const rn = parseRN(text, key);
  if (!rn || rn.of) return null;
  return { degree: rn.degree, alt: rn.alt, quality: rn.quality, inversion: rn.inversion };
}

/** T (tonic), PD (predominant), D (dominant) or chromatic, for a chord in a key. */
export function harmonicFunction(chord: ChordId, key: KeySpec): HarmonicFunction {
  return functionOf(romanOf(chord, key), key);
}

/**
 * The cadence the last two chords of a phrase make. With `melodyMidi` (the melody's last note), a V→I in root
 * position is a PAC only when the melody ends on the tonic, otherwise an IAC (contracts §6.6, C2).
 */
export function cadenceOf(
  penult: ChordId,
  final: ChordId,
  key: KeySpec,
  opts: { melodyMidi?: number } = {},
): CadenceType {
  const tonicPc = rnToChord({ degree: 1, alt: 0, quality: "maj", inversion: 0 }, key).rootPc;
  const melodyOnTonic = opts.melodyMidi === undefined ? undefined : mod(opts.melodyMidi, 12) === tonicPc;
  return classifyCadence(
    romanOf(penult, key, final),
    romanOf(final, key),
    key,
    melodyOnTonic === undefined ? {} : { melodyOnTonic },
  );
}

/**
 * Which schema a chord sequence is (one chord per slot), exact or in any rotation the schema allows, compared
 * on root and triad quality so sevenths pass. `null` when it is none of the library's.
 */
export function schemaOf(
  chords: readonly ChordId[],
  key: KeySpec,
  lib: readonly SchemaDef[] = SCHEMAS,
): { schema: SchemaDef; rotation: number } | null {
  if (chords.length === 0) return null;
  return schemaMatch(
    chords.map((c) => romanOf(c, key)),
    lib,
    key,
  );
}

/** The dialects a chord symbol is shown or written in. */
export type ChordDialect = "lead-sheet" | "code" | "jazz" | "abc";

/**
 * A chord symbol in any dialect Oak reads ("C°", "Co", "Cdim", "C+", "Caug", "G/B", "Cmaj7", "C^7") written in
 * `to`: lead-sheet display (Unicode, slash bass kept), Oak code (`dict` picks a dictionary's own spelling; the
 * slash bass is dropped because code puts it on the `bass:` track), jazz glyphs, or abcjs text. `null` when it
 * is not a chord symbol.
 */
export function chordSymbol(
  text: string,
  to: ChordDialect,
  opts: { dict?: VoicingDict } = {},
): string | null {
  const chord = parseChordWithBass(text.trim());
  if (!chord) return null;
  switch (to) {
    case "lead-sheet":
      return toLeadSheet(chord);
    case "code":
      return toCode(chord, opts.dict);
    case "jazz":
      return toJazzGlyph(chord);
    case "abc":
      return toAbcChord(chord);
  }
}

/** What a melody note is against the chord under it (exercises §3.4, U07.L03–L05). */
export type ToneRole =
  | "chord-tone"
  | "passing"
  | "neighbour"
  | "appoggiatura"
  | "suspension"
  | "anticipation"
  | "escape"
  | "other";

export interface ToneContext {
  /** The previous melody note (MIDI), if any. */
  prev?: number | null;
  /** The next melody note (MIDI), if any. */
  next?: number | null;
  /** Whether the note starts on a strong position (a beat, contracts §6.6 "beats 1 and 3" for C2). */
  strong: boolean;
  /** The chord under the next note, when it changes (for anticipations). */
  nextChord?: ChordId | null;
  /** The note was held or re-struck from the previous chord, where it was a chord tone (for suspensions). */
  heldFromPrevChord?: boolean;
}

const isStep = (d: number): boolean => Math.abs(d) >= 1 && Math.abs(d) <= 2;

/**
 * Chord tone, or the non-chord tone a note is from how it is approached and left: passing (step in, step out,
 * same direction), neighbour (step in, step back), appoggiatura (leap in, step out, strong), suspension (held or
 * re-struck from the previous chord, strong, resolving down by step: 4–3, 9–8), anticipation (a tone of the
 * next chord, weak), escape (step in, leap out the other way). The grader's `classifyNct` applies the same
 * rules over a whole line with ties and slots.
 */
export function toneRole(midi: number, chord: ChordId, ctx: ToneContext): ToneRole {
  const pcs = chordPcs(chord) as number[];
  if (pcs.includes(mod(midi, 12))) return "chord-tone";
  const into = ctx.prev == null ? null : midi - ctx.prev;
  const outOf = ctx.next == null ? null : ctx.next - midi;
  if ((ctx.heldFromPrevChord || into === 0) && ctx.strong && outOf !== null && outOf < 0 && isStep(outOf))
    return "suspension";
  if (!ctx.strong && ctx.nextChord && (chordPcs(ctx.nextChord) as number[]).includes(mod(midi, 12)))
    return "anticipation";
  if (into !== null && outOf !== null && isStep(into) && isStep(outOf))
    return Math.sign(into) === Math.sign(outOf) ? "passing" : "neighbour";
  if (into !== null && outOf !== null && into !== 0 && !isStep(into) && isStep(outOf) && ctx.strong)
    return "appoggiatura";
  if (
    into !== null &&
    outOf !== null &&
    isStep(into) &&
    Math.abs(outOf) > 2 &&
    Math.sign(into) !== Math.sign(outOf)
  )
    return "escape";
  return "other";
}
