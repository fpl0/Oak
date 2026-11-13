// Wave 5 seam (docs/design/wave5.md §3.1): minor keys, pentatonic and blues, the dominant seventh, the 12-bar
// form and bass-line roles, in one call each. Everything is built on the existing tables (`SCALES`, the chord
// table, the numerals and `SCHEMAS`); this file adds no spelling of its own.
import type { Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { chordOf, chordPcs, parseChordSymbol, toLeadSheet } from "./chords.ts";
import { chordOfRoman, readChord, romanText } from "./harmony.ts";
import { mod, nameOf, parsePcName, pcOfSpelled, type Spelled } from "./pitch.ts";
import {
  degreeOf,
  degreeSemitones,
  parallelKey,
  relativeKey,
  scaleDefOf,
  scaleNotes,
  spellMidi,
  syllableOf,
  tonicOf,
} from "./scales.ts";
import { SCHEMAS } from "./schemas.ts";
import type { ChordId, SchemaDef, SpelledPitch } from "./types.ts";

// --- minor ----------------------------------------------------------------------------------------------

/** The three forms of minor Oak teaches: natural (U10.L01), harmonic (U10.L06) and melodic (U10.L08). */
export const MINOR_FORMS = ["natural", "harmonic", "melodic"] as const;
export type MinorForm = (typeof MINOR_FORMS)[number];
const MINOR_MODE: Record<MinorForm, ScaleMode> = {
  natural: "minor",
  harmonic: "harmonic minor",
  melodic: "melodic minor",
};

/** The key of a minor form on a tonic: `minorKey("A", "harmonic")` → `{ tonic: "A", mode: "harmonic minor" }`. */
export function minorKey(tonic: string, form: MinorForm = "natural"): KeySpec {
  return { tonic, mode: MINOR_MODE[form] };
}
/** The form of a minor key, or `null` when the key is not one of the three minors. */
export function minorFormOf(key: KeySpec): MinorForm | null {
  for (const f of MINOR_FORMS) if (MINOR_MODE[f] === key.mode) return f;
  return null;
}

export interface MinorDegree {
  /** 1-based, relative to the major scale: "b3", "6" (the raised 6 of melodic minor). */
  degree: Degree;
  /** Do-based minor solfège: do re me fa sol le te; raised 6 and 7 are la and ti. */
  syllable: string;
  /** Strudel `n` in the minor key's own scale: degree − 1. */
  n: number;
  /** True for ♭3, ♭6, ♭7: the degrees that differ from the parallel major. */
  lowered: boolean;
  /** True for the raised 6 and 7 of harmonic and melodic minor. */
  raised: boolean;
}

/** The seven degrees of a minor form, with do-based syllables. */
export function minorDegrees(form: MinorForm): MinorDegree[] {
  const def = scaleDefOf(MINOR_MODE[form]);
  return def.degrees.map((degree, i) => ({
    degree,
    syllable: syllableOf(degree),
    n: i,
    lowered: degree.startsWith("b"),
    raised: (degree === "6" || degree === "7") && form !== "natural",
  }));
}

/** Spelled notes of a minor form, one letter each: `minorScaleNotes("A", "melodic")` → A B C D E F♯ G♯ (as "F#"). */
export function minorScaleNotes(tonic: string, form: MinorForm = "natural"): string[] {
  return scaleNotes(minorKey(tonic, form));
}

/** The relative and parallel key of any major or minor key (U10.L02): C major ↔ A minor; C major ↔ C minor. */
export function keyTwins(key: KeySpec): { relative: KeySpec; parallel: KeySpec } {
  const base: KeySpec = minorFormOf(key) ? { tonic: key.tonic, mode: "minor" } : key;
  return { relative: relativeKey(base), parallel: parallelKey(base) };
}

export interface KeyChord {
  /** 1–7. */
  degree: number;
  /** Oak's dialect: "i", "iio", "III", "V", "viio". */
  rn: string;
  chord: ChordId;
  /** Lead-sheet symbol, spelled in the key: "G♯°". */
  symbol: string;
}

/**
 * The diatonic triads (or sevenths) of a minor key (U10.L04, U10.L06): natural minor gives
 * i ii° III iv v VI VII; `form: "harmonic"` swaps in the major V and the leading-tone vii° (the other five stay
 * natural, as the course teaches them).
 */
export function minorKeyChords(
  tonic: string,
  opts: { form?: "natural" | "harmonic"; seventh?: boolean } = {},
): KeyChord[] {
  const key: KeySpec = { tonic, mode: "minor" };
  const seventh = opts.seventh === true;
  const natural = seventh
    ? ["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"]
    : ["i", "iio", "III", "iv", "v", "VI", "VII"];
  const rns = [...natural];
  if (opts.form === "harmonic") {
    rns[4] = seventh ? "V7" : "V";
    rns[6] = seventh ? "viio7" : "viio";
  }
  return rns.map((rn, i) => {
    const chord = chordOfRoman(rn, key) as ChordId;
    return { degree: i + 1, rn: romanText(chord, key), chord, symbol: toLeadSheet(chord) };
  });
}

/** The chords of a library schema in a key, one per slot: `schemaChords("schema.aeolian", A minor)` → Am F C G. */
export function schemaChords(schemaId: SchemaDef["id"], key: KeySpec): ChordId[] {
  const s = SCHEMAS.find((x) => x.id === schemaId);
  if (!s) throw new RangeError(`@oak/theory: no schema "${schemaId}"`);
  return s.rn.map((rn) => {
    const c = chordOfRoman(rn, key);
    if (!c)
      throw new RangeError(`@oak/theory: "${rn}" of ${schemaId} has no chord in ${key.tonic} ${key.mode}`);
    return c;
  });
}

// --- pentatonic and blues -----------------------------------------------------------------------------

export type PentatonicKind = "major" | "minor";
/** `pentatonicKey("C", "major")` → C major pentatonic (1 2 3 5 6); minor: 1 ♭3 4 5 ♭7. */
export function pentatonicKey(tonic: string, kind: PentatonicKind): KeySpec {
  return { tonic, mode: kind === "major" ? "major pentatonic" : "minor pentatonic" };
}
/** The blues scale on a tonic: 1 ♭3 4 ♭5 5 ♭7 (`scale.blues`, U11.L03). */
export function bluesKey(tonic: string): KeySpec {
  return { tonic, mode: "blues" };
}
/** The degrees of a pentatonic or blues key, in order. */
export function scaleDegrees(key: KeySpec): Degree[] {
  return [...scaleDefOf(key.mode).degrees];
}

export interface BlueNote {
  degree: "b3" | "b5" | "b7";
  /** How the course names it: "flat three". */
  name: string;
  /** Do-based syllable: me, se, te. */
  syllable: string;
  semitones: 3 | 6 | 10;
}
/** The blue notes against a major key (U11.L03): ♭3, ♭5, ♭7. */
export const BLUE_NOTES: readonly BlueNote[] = [
  { degree: "b3", name: "flat three", syllable: "me", semitones: 3 },
  { degree: "b5", name: "flat five", syllable: "se", semitones: 6 },
  { degree: "b7", name: "flat seven", syllable: "te", semitones: 10 },
];
/** The blue note a MIDI pitch is in a key (read against the key's tonic as major), or `null`. */
export function blueNoteOf(midi: number, key: KeySpec): BlueNote | null {
  const s = mod(Math.round(midi) - pcOfSpelled(tonicOf(key)), 12);
  return BLUE_NOTES.find((b) => b.semitones === s) ?? null;
}
/**
 * A blue note spelled by direction (notation): going up it is the raised letter below (♯4 for ♭5 in C: F♯),
 * going down the lowered letter above (G♭); with no direction the blues scale's own spelling (♭3 ♭5 ♭7).
 */
export function spellBlueNote(midi: number, key: KeySpec, direction?: 1 | -1): SpelledPitch {
  const major: KeySpec = { tonic: key.tonic, mode: "major" };
  const plain = spellMidi(midi, { key: bluesKey(key.tonic) });
  if (!direction) return plain;
  // Never a double sharp or flat when a plainer spelling exists: ♭7 of A going up is G, not F𝄪 (the
  // blues-scale spelling stands); ♭5 of E♭ is A going either way, never B𝄫.
  const candidates = [
    spellMidi(midi, { key: major, direction }),
    plain,
    spellMidi(midi, { key: major, direction: direction === 1 ? -1 : 1 }),
  ];
  return candidates.find((c) => !/(##|bb|x)-?\d+$/.test(c.name)) ?? (candidates[0] as SpelledPitch);
}

// --- the dominant seventh -----------------------------------------------------------------------------

/** Whether a chord symbol is a dominant seventh ("C7", "G7/B"); "Cmaj7", "Cm7" and "C" are not. */
export function isDominantSeventhSymbol(symbol: string): boolean {
  const c = parseChordSymbol(symbol.split("/")[0] ?? symbol);
  return c?.quality === "7";
}
/** Whether a pitch-class set (hand-voiced notes) is exactly a dominant seventh; the bass picks the inversion. */
export function isDominantSeventhPcs(pcs: Iterable<number>, bassPc?: number): boolean {
  const set = [...new Set([...pcs].map((p) => mod(p, 12)))];
  if (set.length !== 4) return false;
  return readChord(set, bassPc ?? (set[0] as number))?.quality === "7";
}
/** The dominant seventh on a root: `dominantSeventh("G")` → G B D F. */
export function dominantSeventh(root: string): ChordId {
  return chordOf(root, "7");
}

// --- the 12-bar form ------------------------------------------------------------------------------------

/** `standard`: I I I I · IV IV I I · V IV I I. `quick-change`: IV in bar 2. A turnaround puts V in bar 12. */
export const TWELVE_BAR_VARIANTS = ["standard", "quick-change"] as const;
export type TwelveBarVariant = (typeof TWELVE_BAR_VARIANTS)[number];
export interface TwelveBarForm {
  variant: TwelveBarVariant;
  /** Bar 12 is V (the turnaround, U11.L06) instead of I. */
  turnaround: boolean;
}

/** The numerals of a 12-bar chorus, one per bar, all dominant sevenths ("I7"). */
export function twelveBarPlan(form: TwelveBarForm): string[] {
  const bars = ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "I7"];
  if (form.variant === "quick-change") bars[1] = "IV7";
  if (form.turnaround) bars[11] = "V7";
  return bars;
}
/** The chords of a 12-bar chorus in a key (read as a blues key, so I7 is I7 and not V7/IV). */
export function twelveBarChords(tonic: string, form: TwelveBarForm): ChordId[] {
  const key = bluesKey(tonic);
  return twelveBarPlan(form).map((rn) => chordOfRoman(rn, key) as ChordId);
}
/**
 * Which 12-bar form a bar-by-bar list of chord roots (semitones above the tonic, `null` for a bar with no chord)
 * is: the variant and turnaround, or `null` when the bars are not a 12-bar chorus. Bar 12 may be I or V;
 * bar 2 I (standard) or IV (quick change). Quality is not checked here (the C5 rule reads it separately).
 */
export function twelveBarFormOf(rootSemis: readonly (number | null)[]): TwelveBarForm | null {
  if (rootSemis.length !== 12) return null;
  const want = [0, null, 0, 0, 5, 5, 0, 0, 7, 5, 0, null];
  for (let i = 0; i < 12; i++) {
    const w = want[i];
    const got = rootSemis[i];
    if (w === null || w === undefined) continue;
    if (got === null || got === undefined || mod(got, 12) !== w) return null;
  }
  const b2 = rootSemis[1];
  const b12 = rootSemis[11];
  if (b2 === null || b2 === undefined || b12 === null || b12 === undefined) return null;
  const variant: TwelveBarVariant | null =
    mod(b2, 12) === 0 ? "standard" : mod(b2, 12) === 5 ? "quick-change" : null;
  const last = mod(b12, 12);
  if (!variant || (last !== 0 && last !== 7)) return null;
  return { variant, turnaround: last === 7 };
}

// --- bass lines -------------------------------------------------------------------------------------------

/** What a bass note is to the chord it sounds under (U08.L01–L03). */
export type BassRole = "root" | "octave" | "fifth" | "third" | "seventh" | "approach" | "other";

/**
 * The role of a bass note under a chord. `octave`: the root an octave (or two) away from the root heard before
 * in the same chord (`rootMidi`); `approach`: not a chord tone, a step (diatonic or chromatic) from the next
 * chord's root, on the last beat before it (`approach` in `ctx`).
 */
export function bassRole(
  midi: number,
  chord: ChordId,
  ctx: {
    rootMidi?: number | null;
    nextChord?: ChordId | null;
    beforeChange?: boolean;
    key?: KeySpec | null;
  } = {},
): BassRole {
  const m = Math.round(midi);
  const rel = mod(m - chord.rootPc, 12);
  const pcs = chordPcs(chord) as number[];
  if (rel === 0) {
    if (
      ctx.rootMidi !== null &&
      ctx.rootMidi !== undefined &&
      m !== ctx.rootMidi &&
      (m - ctx.rootMidi) % 12 === 0
    )
      return "octave";
    return "root";
  }
  if (pcs.includes(mod(m, 12))) {
    if (rel === 7 || rel === 6 || rel === 8) return "fifth";
    if (rel === 3 || rel === 4) return "third";
    if (rel === 10 || rel === 11 || rel === 9) return "seventh";
  }
  if (ctx.nextChord && ctx.beforeChange && approachKind(m, ctx.nextChord, ctx.key ?? null) !== null)
    return "approach";
  return "other";
}

export type ApproachKind =
  | "chromatic-below"
  | "chromatic-above"
  | "diatonic-below"
  | "diatonic-above"
  | "dominant";
/**
 * How a note approaches the root of `target` (U08.L03): a semitone below or above (chromatic), a scale step
 * below or above (diatonic, in `key`), or its fifth (the dominant approach); `null` otherwise.
 */
export function approachKind(midi: number, target: ChordId, key: KeySpec | null): ApproachKind | null {
  const rel = mod(Math.round(midi) - target.rootPc, 12);
  if (rel === 11) return "chromatic-below";
  if (rel === 1) return "chromatic-above";
  if (rel === 7) return "dominant";
  if (rel === 10 || rel === 9 || rel === 2 || rel === 3) {
    const inKey = key ? degreeInScale(Math.round(midi), key) : rel === 10 || rel === 2;
    if (inKey) return rel >= 9 ? "diatonic-below" : "diatonic-above";
  }
  return null;
}
function degreeInScale(midi: number, key: KeySpec): boolean {
  const s = mod(midi - pcOfSpelled(tonicOf(key)), 12);
  return scaleDefOf(key.mode).degrees.some((d) => degreeSemitones(d) === s);
}

/**
 * The approach notes to a target root at `targetMidi`, spelled in `key`: one scale step below and above, a
 * semitone below and above, and the fifth below (the dominant approach).
 */
export function approachTones(
  targetMidi: number,
  key: KeySpec,
): Record<ApproachKind, { midi: number; name: string }> {
  const t = Math.round(targetMidi);
  const scaleStep = (dir: 1 | -1): number => {
    for (let d = 1; d <= 3; d++) if (degreeInScale(t + dir * d, key)) return t + dir * d;
    return t + dir * 2;
  };
  const named = (midi: number, direction?: 1 | -1) => ({
    midi,
    name: spellMidi(midi, direction ? { key, direction } : { key }).name,
  });
  return {
    "diatonic-below": named(scaleStep(-1)),
    "diatonic-above": named(scaleStep(1)),
    "chromatic-below": named(t - 1, 1),
    "chromatic-above": named(t + 1, -1),
    dominant: named(t - 5),
  };
}

/** Root, fifth and octave of a chord from a bass root (U08.L02): `rootFiveOctave(chordOf("A","min"), 45)`. */
export function rootFiveOctave(
  chord: ChordId,
  rootMidi: number,
): { root: number; fifth: number; octave: number } {
  const fifth = (chordPcs(chord) as number[])
    .map((pc) => mod(pc - chord.rootPc, 12))
    .find((r) => r >= 6 && r <= 8);
  const r = Math.round(rootMidi);
  return { root: r, fifth: r + (fifth ?? 7), octave: r + 12 };
}

/** A degree label in any key, ♭ form first, with its do-based syllable (the minor degree lens). */
export function degreeLens(midi: number, key: KeySpec): { degree: string; syllable: string } {
  const d = degreeOf(midi, key);
  return { degree: d.degree.replace(/^b/, "♭").replace(/^#/, "♯"), syllable: d.syllable };
}

/** A tonic name with Unicode accidentals: "F#" → "F♯". */
export function tonicDisplay(tonic: string): string {
  const s = parsePcName(tonic) as Spelled | null;
  return s ? nameOf(s, true) : tonic;
}
