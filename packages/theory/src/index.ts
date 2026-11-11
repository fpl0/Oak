// @oak/theory: music theory behind normalization. tonal 6.5.1 is an implementation detail; nothing here
// returns a raw tonal string. Isomorphic: no DOM, no Bun (the CLI lives in cli.bun.ts).
//
// Implemented in the Foundation phase: ./meters.ts (the meter table of contracts §6.9, golden-tested).
// Everything below it is the public surface the theory builder fills in; the signatures are binding.
import type {
  ChordFamilyId,
  ChordQuality,
  Degree,
  KeySpec,
  MeterId,
  MeterSpec,
  PickupSpec,
  Rat,
  ScaleId,
  ScaleMode,
} from "@oak/content-kit";
import type {
  BarPosition,
  ChordId,
  ChordSpelling,
  DegreeInfo,
  HarmonicFunction,
  KeySignature,
  NoteTextKind,
  ParsedNote,
  Pc,
  RomanNumeral,
  ScaleRef,
  SchemaDef,
  SpelledPitch,
  VoicingDict,
} from "./types.ts";

export * from "./meters.ts";
export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/theory: ${name} is not implemented yet`);
}

// --- notes --------------------------------------------------------------------------------------

/**
 * Strudel note-name semantics, not tonal's: `s`/`f` are accidentals after the letter ("cs4", "ef4"; "f4" is
 * the note F4), `#`/`b` too, and a missing octave means octave 3 ("c" = 48). Returns `null` for anything else.
 */
export function parseNote(text: string): ParsedNote | null {
  return todo(`parseNote(${text})`);
}
/** MIDI of a Strudel note name, or `null`. */
export function noteToMidi(text: string): number | null {
  return todo(`noteToMidi(${text})`);
}
export function midiToPc(midi: number): Pc {
  return (((Math.round(midi) % 12) + 12) % 12) as Pc;
}
export function freqToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
/**
 * Spells a MIDI note from context, never from the code's own spelling (`.scale()` spells accidentals
 * backwards). Chord-tone spelling wins over key-scale spelling, which wins over melodic direction.
 */
export function spellMidi(
  midi: number,
  ctx: { key: KeySpec | null; chord?: ChordId; direction?: 1 | -1 },
): SpelledPitch {
  return todo(`spellMidi(${midi}, ${ctx.key?.tonic})`);
}
/** Pitch class of a spelled name ("Eb" → 3, "F#" → 6). */
export function pcOf(name: string): Pc {
  return todo(`pcOf(${name})`);
}

// --- degrees and scales -------------------------------------------------------------------------

/** The degree of a MIDI note in a key, relative to the major scale, with its syllable and `n` step. */
export function degreeOf(midi: number, key: KeySpec): DegreeInfo {
  return todo(`degreeOf(${midi}, ${key.tonic})`);
}
/** Semitones of a degree above the tonic: "b3" → 3, "#4" → 6. */
export function degreeSemitones(degree: Degree): number {
  return todo(`degreeSemitones(${degree})`);
}
/**
 * The `n` value that plays `degree` in `key`'s own scale: an integer for scale tones (degree 5 → 4), or
 * a chromatic step string for the others (STYLE §6: ♯4 in major is "3#", ♭7 is "6b", ♭3 is "2b").
 * `"7b"` is never produced: in C major it plays B♮.
 */
export function strudelStep(degree: Degree, key: KeySpec): number | string {
  return todo(`strudelStep(${degree}, ${key.tonic})`);
}
/** MIDI of an `n` step (number or "3#") in a `.scale()` such as "C4:major", exactly as Strudel resolves it. */
export function stepToMidi(step: number | string, scale: ScaleRef): number {
  return todo(`stepToMidi(${step}, ${scale.tonic})`);
}
/** Spelled notes of a key's scale from the tonic up, each letter once where the scale has seven notes. */
export function scaleNotes(key: KeySpec): string[] {
  return todo(`scaleNotes(${key.tonic})`);
}
export function scalePcs(key: KeySpec): Pc[] {
  return todo(`scalePcs(${key.tonic})`);
}
/** Parses a `.scale()` argument: "C4:major", "A3:harmonic:minor", "C:major" (octave null). */
export function parseScaleName(text: string): ScaleRef | null {
  return todo(`parseScaleName(${text})`);
}
/** "C4:major", "A3:harmonic:minor". The octave is always written (STYLE). */
export function formatScaleName(key: KeySpec, octave: number): string {
  return todo(`formatScaleName(${key.tonic}, ${octave})`);
}
/** `hap.context.scale` ("D4 major") to a key. */
export function keyFromScaleCtx(scaleCtx: string): KeySpec | null {
  return todo(`keyFromScaleCtx(${scaleCtx})`);
}
/** The unlock-table ID of a scale name: "harmonic:minor" → `scale.harmonic-minor`. */
export function scaleIdOf(mode: ScaleMode): ScaleId {
  return `scale.${mode.replace(/ /g, "-")}`;
}
export function keySignature(key: KeySpec): KeySignature {
  return todo(`keySignature(${key.tonic})`);
}
export function relativeKey(key: KeySpec): KeySpec {
  return todo(`relativeKey(${key.tonic})`);
}
export function parallelKey(key: KeySpec): KeySpec {
  return todo(`parallelKey(${key.tonic})`);
}
/** `key` moved by a number of semitones, spelled with at most 6 accidentals. */
export function transposeKey(key: KeySpec, semitones: number): KeySpec {
  return todo(`transposeKey(${key.tonic}, ${semitones})`);
}
/** Interval name between two spelled notes: "m3", "P5", "A4". */
export function intervalBetween(low: string, high: string): string {
  return todo(`intervalBetween(${low}, ${high})`);
}
export function invertInterval(interval: string): string {
  return todo(`invertInterval(${interval})`);
}

// --- chords -------------------------------------------------------------------------------------

/** The single chord-spelling table, one row per `ChordQuality`. */
export const CHORD_TABLE: readonly ChordSpelling[] = [];

/**
 * Parses a chord symbol in any dialect Oak meets: code spelling (`C^7`, `Cm7b5`), forbidden Strudel
 * spellings (`C-7`, `Ch7`), lead sheet (`Cmaj7`, `Cø7`), Unicode glyphs (∆ ø ° − ♭ ♯). Roots are
 * upper-case. Returns `null` for anything else, including a slash chord (`C/E`).
 */
export function parseChordSymbol(symbol: string): ChordId | null {
  return todo(`parseChordSymbol(${symbol})`);
}
/** The one code spelling: `C^7`, `Cm7b5`, `Caug`. */
export function toCode(chord: ChordId): string {
  return todo(`toCode(${chord.root})`);
}
/** Lead-sheet display: `Cmaj7`, `Cm7♭5`, `C/E` for an inversion. */
export function toLeadSheet(chord: ChordId): string {
  return todo(`toLeadSheet(${chord.root})`);
}
export function toJazzGlyph(chord: ChordId): string {
  return todo(`toJazzGlyph(${chord.root})`);
}
/** Chord text abcjs prints correctly (never a literal "h7"). */
export function toAbcChord(chord: ChordId): string {
  return todo(`toAbcChord(${chord.root})`);
}
/** Whether a symbol is written in the one canonical code spelling. */
export function isCanonicalCode(symbol: string): boolean {
  return todo(`isCanonicalCode(${symbol})`);
}
/** The chord family the lint maps a symbol to (`chord.triad`, `chord.dom7`, ...), or `null` if it is no chord. */
export function chordFamilyOf(symbol: string): ChordFamilyId | null {
  return todo(`chordFamilyOf(${symbol})`);
}
/**
 * Whether `dict` voices `symbol` correctly: `missing` when the dictionary does not carry it, `wrong`
 * when Strudel 1.2.6 voices it wrongly (STYLE §5.2). Both are the lint error `code.chord-not-in-dict`.
 */
export function chordInDict(symbol: string, dict: VoicingDict): "ok" | "missing" | "wrong" | "unknown-chord" {
  return todo(`chordInDict(${symbol}, ${dict})`);
}
/** Pitch classes of a chord, root first. */
export function chordPcs(chord: ChordId): Pc[] {
  return todo(`chordPcs(${chord.root})`);
}
/** Root pitch class + triad quality: what progressions compare on, so sevenths and extensions pass. */
export function triadCore(chord: ChordId): {
  rootPc: Pc;
  quality: "maj" | "min" | "dim" | "aug" | "sus2" | "sus4";
} {
  return todo(`triadCore(${chord.root})`);
}
export function sameChord(
  a: ChordId,
  b: ChordId,
  opts?: { bass?: boolean; depth?: "triad" | "seventh" | "extended" },
): boolean {
  return todo(`sameChord(${a.root}, ${b.root}, ${opts?.depth})`);
}
/**
 * Candidate chords for sounding notes, best fit first. Only for hand-voiced note lists and `n()` stacks:
 * the identity of a `voicing()` always comes from its symbol (contracts §6.7).
 */
export function identifyChord(
  midis: number[],
  opts?: { allowRootless?: boolean; bassPc?: Pc },
): (ChordId & { fit: number })[] {
  return todo(`identifyChord(${midis.length}, ${opts?.bassPc})`);
}

// --- Roman numerals, function, schemas ----------------------------------------------------------

/** Case is computed from the quality, never taken from tonal. `next` resolves applied chords (V7/vi). */
export function romanOf(chord: ChordId, key: KeySpec, next?: ChordId): RomanNumeral {
  return todo(`romanOf(${chord.root}, ${key.tonic}, ${next?.root})`);
}
/** Oak's dialect: case = quality, `o`/`°`, `ø`, `+`, figures 6 64 7 65 43 42, applied `/`, prefixes `b` `#`. */
export function parseRN(text: string, key: KeySpec): RomanNumeral | null {
  return todo(`parseRN(${text}, ${key.tonic})`);
}
export function formatRN(rn: RomanNumeral): string {
  return todo(`formatRN(${rn.degree})`);
}
export function rnToChord(rn: RomanNumeral, key: KeySpec): ChordId {
  return todo(`rnToChord(${rn.degree}, ${key.tonic})`);
}
export function functionOf(rn: RomanNumeral, key: KeySpec): HarmonicFunction {
  return todo(`functionOf(${rn.degree}, ${key.tonic})`);
}
/** The schema library: axis, axis-vi, three-chord, doo-wop, aeolian, andalusian, blues12, mixolydian, dorian vamp, ii-V-I, rhythm-A. */
export const SCHEMAS: readonly SchemaDef[] = [];
export function schemaMatch(
  rns: RomanNumeral[],
  lib?: readonly SchemaDef[],
): { schema: SchemaDef; rotation: number } | null {
  return todo(`schemaMatch(${rns.length}, ${lib?.length})`);
}

// --- positions and text -------------------------------------------------------------------------

/** Bar, beat and beat label of an onset (exercises §0.2). With a pickup, cycle 0 is the pickup bar. */
export function barPosition(onset: Rat, meter: MeterId | MeterSpec, pickup?: PickupSpec): BarPosition {
  return todo(
    `barPosition(${onset[0]}/${onset[1]}, ${typeof meter === "string" ? meter : meter.id}, ${pickup?.units})`,
  );
}
/** Normalizes a learner's text answer for comparison (exercises §3.9): "e♭" → "Eb", "CΔ7" → "C^7", "vii°" → "viio". */
export function normalizeText(kind: NoteTextKind, text: string): string | null {
  return todo(`normalizeText(${kind}, ${text})`);
}
/** Quality of a triad or seventh from its intervals in semitones above the root. */
export function qualityOf(intervals: number[]): ChordQuality | null {
  return todo(`qualityOf(${intervals.join(",")})`);
}
