// Wave 6 seam (docs/design/wave6.md §3.1): seventh chords and guide tones, interval inversion and compound
// intervals, the modes and their colour tones, chromatic degrees and chromatic solfège, applied chords and dominant
// chains, mixture, pivot chords, key plans and the distance of a key change, in one call each. Everything is built
// on the existing tables (`SCALES`, `MODES`, the chord table, the numerals, `spellMidi`); this file adds no spelling
// of its own.
import type { ChordQuality, Degree, KeySpec, MeterId, MeterSpec, Rat, ScaleMode } from "@oak/content-kit";
import {
  type ColourMode,
  type OutsideChordKind,
  rat,
  SEVENTH_QUALITIES,
  type SeventhQuality,
} from "@oak/content-kit";
import {
  chordNotes,
  chordOf,
  chordPcs,
  chordSpelling,
  parseChordWithBass,
  SEVENTH_CORE,
  toLeadSheet,
  triadCore,
  triadQuality,
} from "./chords.ts";
import { chordOfRoman, readChord, romanText } from "./harmony.ts";
import { invertInterval, parseInterval } from "./intervals.ts";
import { METERS } from "./meters.ts";
import { mod, parsePcName, pcOfSpelled } from "./pitch.ts";
import { barPosition } from "./rhythm.ts";
import { diatonicChords, isMinorRef, rnToChord, romanOf } from "./roman.ts";
import {
  degreeOf,
  degreeSemitones,
  isMinorish,
  MODES,
  parseScaleArg,
  scaleDefOf,
  scalePcs,
  spellMidi,
  strudelStep,
  syllableOf,
  tonicOf,
  transposeKey,
} from "./scales.ts";
import type { ChordId, Pc, SpelledPitch } from "./types.ts";
import { type KeyChord, minorFormOf, minorKeyChords, tonicDisplay } from "./wave5.ts";

const shown = (d: string): string => d.replace(/^b/, "♭").replace(/^#/, "♯");
const pcOfName = (name: string): Pc => pcOfSpelled(parsePcName(name) ?? { letter: 0, alt: 0 });
const keyChord = (chord: ChordId, key: KeySpec, next?: ChordId): KeyChord => {
  const rn = romanOf(chord, key, next);
  return { degree: rn.degree, rn: romanText(chord, key, next), chord, symbol: toLeadSheet(chord) };
};
const need = (rn: string, key: KeySpec): ChordId => {
  const c = chordOfRoman(rn, key);
  if (!c) throw new RangeError(`@oak/theory: "${rn}" has no chord in ${key.tonic} ${key.mode}`);
  return c;
};

// --- seventh chords (U12) ----------------------------------------------------------------------------------

export interface SeventhInfo {
  quality: SeventhQuality;
  /** As the learner says it: "major seventh", "half-diminished seventh". */
  name: string;
  /** Code suffix (`chord("C^7")`), lead-sheet suffix ("maj7"), jazz glyph ("∆7"). */
  code: string;
  leadSheet: string;
  jazz: string;
  /** The triad underneath and the size of the 7th above the root. */
  triad: "maj" | "min" | "dim";
  seventh: "M7" | "m7" | "d7";
  /** Semitones above the root: [0, 4, 7, 11]. */
  intervals: number[];
}
const SEVENTH_NAMES: Record<SeventhQuality, [string, SeventhInfo["triad"], SeventhInfo["seventh"]]> = {
  maj7: ["major seventh", "maj", "M7"],
  m7: ["minor seventh", "min", "m7"],
  "7": ["dominant seventh", "maj", "m7"],
  m7b5: ["half-diminished seventh", "dim", "m7"],
  dim7: ["diminished seventh", "dim", "d7"],
};
/**
 * The five seventh-chord qualities of U12 (content-kit `SEVENTH_QUALITIES`, in teaching order: maj7, 7, m7, ø7, °7)
 * with their spellings, straight from the chord table.
 */
export const SEVENTH_CHORDS: readonly SeventhInfo[] = SEVENTH_QUALITIES.map((quality) => {
  const row = chordSpelling(quality);
  const [name, triad, seventh] = SEVENTH_NAMES[quality];
  return {
    quality,
    name,
    code: row.code,
    leadSheet: row.leadSheet,
    jazz: row.jazz,
    triad,
    seventh,
    intervals: [...row.intervals],
  };
});
export function seventhInfo(quality: SeventhQuality): SeventhInfo {
  return SEVENTH_CHORDS.find((s) => s.quality === quality) as SeventhInfo;
}

const isSeventh = (q: ChordQuality): q is SeventhQuality =>
  (SEVENTH_QUALITIES as readonly string[]).includes(q);

/**
 * The seventh quality of a chord or a symbol, extensions dropped (`C13` → "7", `Dm9` → "m7"); `null` for triads,
 * sixths, sus chords and the minor-major seventh. Read from the symbol: this is how a `chord()` track is graded
 * (contracts §6.7 rule 2).
 */
export function seventhQualityOf(chord: ChordId | string): SeventhQuality | null {
  const c = typeof chord === "string" ? parseChordWithBass(chord) : chord;
  if (!c) return null;
  const core = SEVENTH_CORE[c.quality];
  return isSeventh(core) ? core : null;
}

/**
 * A hand-voiced seventh chord from its pitch classes and bass (contracts §6.7 rule 2: from notes only when
 * hand-voiced): `seventhFromPcs([2, 5, 9, 0], 5)` → Dm7 in first inversion. `null` when the notes are not one of the
 * five sevenths (a triad, a cluster, a rootless voicing).
 */
export function seventhFromPcs(
  pcs: Iterable<number>,
  bassPc: number,
): { chord: ChordId; quality: SeventhQuality; inversion: 0 | 1 | 2 | 3; symbol: string } | null {
  const r = readChord(pcs, bassPc);
  if (!r || !isSeventh(r.quality)) return null;
  return { chord: r.chord, quality: r.quality, inversion: r.inversion, symbol: r.leadSheet };
}

/** A seventh chord on a root: `seventhChord("B", "m7b5")` → Bm7♭5. */
export function seventhChord(root: string, quality: SeventhQuality): ChordId {
  return chordOf(root, quality);
}

/**
 * The diatonic seventh chords of a key with their numerals (U12.L04–L05): major Imaj7 ii7 iii7 IVmaj7 V7 vi7
 * viiø7; natural minor i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7; `form: "harmonic"` swaps in V7 and vii°7. A mode gives
 * its own (G Mixolydian: I7 … ♭VIImaj7). Numerals go back to chords with `chordOfRoman`.
 */
export function keySevenths(key: KeySpec, opts: { form?: "natural" | "harmonic" } = {}): KeyChord[] {
  // Melodic minor's sevenths (Am(maj7) Bm7 Caug(maj7) D7 E7 F♯ø7 G♯ø7) include an augmented major seventh no chord
  // quality names: say so rather than return natural minor's (corrections pass, theory-e).
  if (minorFormOf(key) === "melodic")
    throw new RangeError(
      "@oak/theory: the seventh chords of melodic minor are not built (its III is an augmented major seventh); ask for natural or harmonic minor",
    );
  if (minorFormOf(key))
    return minorKeyChords(key.tonic, {
      seventh: true,
      form: opts.form ?? (key.mode === "harmonic minor" ? "harmonic" : "natural"),
    });
  return diatonicChords(key, true).map((c) => keyChord(c, key));
}

// --- guide tones (U12.L05) ---------------------------------------------------------------------------------

export interface GuideTone {
  role: "third" | "seventh";
  pc: Pc;
  /** Spelled as the chord spells it: "F♯" is "F#". */
  name: string;
  /** Size above the root: "M3", "m3"; "M7", "m7", "d7". */
  interval: string;
}
/**
 * The 3rd and the 7th of a chord: the two notes that tell its quality. A triad has no 7th, a sus chord no 3rd
 * (`null`); a sixth chord's 6th is not a guide tone.
 */
export function guideTones(chord: ChordId): { third: GuideTone | null; seventh: GuideTone | null } {
  const row = chordSpelling(chord.quality);
  const notes = chordNotes(chord);
  const tone = (role: GuideTone["role"]): GuideTone | null => {
    const want = role === "third" ? [3, 4] : chord.quality === "dim7" ? [9] : [10, 11];
    if (role === "seventh" && !/7|9|11|13/.test(row.code)) return null;
    const i = row.intervals.findIndex((s, k) => k > 0 && k < 4 && want.includes(mod(s, 12)));
    const name = notes[i];
    if (i < 0 || !name) return null;
    const semis = mod(row.intervals[i] as number, 12);
    const interval =
      role === "third" ? (semis === 4 ? "M3" : "m3") : semis === 11 ? "M7" : semis === 10 ? "m7" : "d7";
    return { role, pc: pcOfName(name), name, interval };
  };
  return { third: tone("third"), seventh: tone("seventh") };
}

export interface GuideToneStep {
  chord: ChordId;
  role: "third" | "seventh";
  name: string;
  midi: number;
  /** Semitones moved from the note before (0 on the first chord; negative = down). */
  move: number;
}
/**
 * The guide-tone line through a progression: start on the 3rd (or the 7th) of the first chord, then at each change
 * take the next chord's guide tone that is nearest (a common tone, else the smaller step; a tie goes down). Over
 * ii7–V7–Imaj7 in C the line from the 3rd is F F E and the line from the 7th is C B B. A chord without that guide
 * tone (a triad's 7th) uses the one it has; a chord with neither ends the line (`null` from there).
 */
export function guideToneLine(
  chords: readonly ChordId[],
  opts: { start?: "third" | "seventh"; around?: number } = {},
): (GuideToneStep | null)[] {
  const around = opts.around ?? 64;
  const out: (GuideToneStep | null)[] = [];
  let prev: number | null = null;
  for (const chord of chords) {
    const g = guideTones(chord);
    const options = [g.third, g.seventh].filter((t): t is GuideTone => t !== null);
    if (options.length === 0 || (out.length > 0 && prev === null)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      const first = (opts.start === "seventh" ? g.seventh : g.third) ?? (options[0] as GuideTone);
      let midi = around - mod(around - first.pc, 12);
      if (around - midi > 6) midi += 12;
      out.push({ chord, role: first.role, name: first.name, midi, move: 0 });
      prev = midi;
      continue;
    }
    const from: number = prev;
    const moves = options.map((t) => {
      const up = mod(t.pc - from, 12);
      return { t, move: up > 6 || up === 6 ? up - 12 : up };
    });
    moves.sort((a, b) => Math.abs(a.move) - Math.abs(b.move) || a.move - b.move);
    const best = moves[0] as (typeof moves)[number];
    prev = from + best.move;
    out.push({ chord, role: best.t.role, name: best.t.name, midi: prev, move: best.move });
  }
  return out;
}

// --- interval inversion and compound intervals (U12.L06, moved from U04) ------------------------------------

export interface IntervalFacts {
  /** As given: "M10". */
  name: string;
  semitones: number;
  /** The interval inside one octave: "M3" for "M10". An octave stays "P8". */
  simple: string;
  /** Whole octaves added to the simple interval (0 for a simple one; "P8" itself is 0). */
  octaves: number;
  compound: boolean;
  /** The inversion of the simple interval: M3 ↔ m6 (numbers add to 9, major ↔ minor, perfect stays perfect). */
  inversion: string;
}
/** Everything U12.L06 asks about one interval. Throws on a string that is not an interval name. */
export function intervalFacts(name: string): IntervalFacts {
  const p = parseInterval(name);
  if (!p) throw new RangeError(`@oak/theory: not an interval: "${name}"`);
  const compound = p.num > 8;
  const octaves = compound ? Math.floor((p.num - 1) / 7) : 0;
  const simple = compound ? `${p.quality}${p.num - 7 * octaves}` : name.trim();
  return {
    name: name.trim(),
    semitones: p.semitones,
    simple,
    octaves,
    compound,
    inversion: invertInterval(simple),
  };
}
/** The compound of a simple interval: `compoundInterval("M3")` → "M10"; a 2nd becomes a 9th, a 6th a 13th. */
export function compoundInterval(simple: string, octaves = 1): string {
  const p = parseInterval(simple);
  if (!p || p.num > 8 || octaves < 1) throw new RangeError(`@oak/theory: not a simple interval: "${simple}"`);
  return `${p.quality}${p.num + 7 * octaves}`;
}

// --- modes (U14) ---------------------------------------------------------------------------------------------

/** The four colour modes of U14 (content-kit `ColourMode`), in lesson order: U14.L01–L02, L03, L04, L05. */
export const COLOUR_MODES: readonly ColourMode[] = ["mixolydian", "dorian", "lydian", "phrygian"];
/** Every mode the course names by U14.L06, brightest first. */
export const TAUGHT_MODES = ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"] as const;
export type TaughtMode = (typeof TAUGHT_MODES)[number];

export interface ModeColour {
  mode: TaughtMode;
  /** "Mixolydian"; major and minor carry their mode names "Ionian" and "Aeolian". */
  name: string;
  /** The scale it is compared with: a major-family mode against major, a minor-family mode against natural minor. */
  family: "major" | "minor";
  /** The one tone that makes the colour, against the family scale: ♭7, ♮6, ♯4, ♭2 (major: 4 and 7; minor: ♭6). */
  characteristic: Degree[];
  /** "♭7", "♮6", "♯4", "♭2": the tone as a lesson names it. */
  colour: string;
  /** The chords that carry the colour, in Oak's numeral dialect, read in the mode itself. */
  colourChords: string[];
  /** The characteristic progressions (U14.L02–L05): Mixolydian I–♭VII–IV, Dorian i–IV, Lydian I–II, Phrygian i–♭II. */
  progressions: string[][];
  /** The degree of the major scale this mode starts on (Dorian: 2). */
  parentDegree: number;
  /** 7 (Lydian) … 2 (Phrygian): one more flat each step down. */
  brightness: number;
}
const MODE_TEXT: Record<
  TaughtMode,
  Pick<ModeColour, "name" | "family" | "colour" | "colourChords" | "progressions">
> = {
  lydian: {
    name: "Lydian",
    family: "major",
    colour: "♯4",
    colourChords: ["II"],
    progressions: [["I", "II"]],
  },
  major: {
    name: "Ionian",
    family: "major",
    colour: "4 and 7",
    colourChords: ["IV", "V"],
    progressions: [["I", "IV", "V", "I"]],
  },
  mixolydian: {
    name: "Mixolydian",
    family: "major",
    colour: "♭7",
    colourChords: ["bVII", "v"],
    progressions: [
      ["I", "bVII", "IV"],
      ["I", "bVII", "IV", "I"],
    ],
  },
  dorian: {
    name: "Dorian",
    family: "minor",
    colour: "♮6",
    colourChords: ["IV", "ii"],
    progressions: [
      ["i", "IV"],
      ["i7", "IV7"],
    ],
  },
  minor: {
    name: "Aeolian",
    family: "minor",
    colour: "♭6",
    colourChords: ["VI", "iv"],
    progressions: [["i", "VI", "III", "VII"]],
  },
  phrygian: {
    name: "Phrygian",
    family: "minor",
    colour: "♭2",
    colourChords: ["bII", "vii"],
    progressions: [["i", "bII"]],
  },
};
/** The six modes with their colour tone, colour chords and characteristic progressions. */
export const MODE_COLOURS: readonly ModeColour[] = TAUGHT_MODES.map((mode) => {
  const m = MODES.find((x) => x.mode === mode) as (typeof MODES)[number];
  return {
    mode,
    ...MODE_TEXT[mode],
    characteristic: [...m.characteristic],
    parentDegree: m.parentDegree,
    brightness: m.brightness,
  };
});
export function modeColour(mode: ScaleMode): ModeColour | null {
  return MODE_COLOURS.find((m) => m.mode === mode) ?? null;
}
/** `modalKey("D", "dorian")` → `{ tonic: "D", mode: "dorian" }` (code: `.scale("D4:dorian")`). */
export function modalKey(tonic: string, mode: TaughtMode): KeySpec {
  return { tonic, mode };
}
/** The major key with the same notes: D Dorian → C major, G Mixolydian → C major, A minor → C major. */
export function parentMajor(key: KeySpec): KeySpec {
  const m = MODES.find((x) => x.mode === key.mode);
  if (!m) return { tonic: key.tonic, mode: "major" };
  const semis = [0, 2, 4, 5, 7, 9, 11][m.parentDegree - 1] as number;
  return transposeKey({ tonic: key.tonic, mode: "major" }, -semis);
}
/** The major or natural-minor key on the same tonic that the mode is heard against (D Dorian → D minor). */
export function modeFamilyKey(key: KeySpec): KeySpec {
  return { tonic: key.tonic, mode: isMinorish(key.mode) ? "minor" : "major" };
}

export interface CharacteristicTone {
  degree: Degree;
  /** "♭7", "6": for display. */
  display: string;
  syllable: string;
  pc: Pc;
  /** Spelled in the key: F in G Mixolydian, B in D Dorian. */
  name: string;
  /** Strudel `n` in the mode's own scale (degree − 1): 6 for Mixolydian's ♭7. */
  n: number;
}
/** The colour tone(s) of a modal key, spelled: G Mixolydian → F (♭7, te). Empty for a scale that is not a mode. */
export function characteristicTonesOf(key: KeySpec): CharacteristicTone[] {
  const m = MODES.find((x) => x.mode === key.mode);
  if (!m) return [];
  const degrees = scaleDefOf(key.mode).degrees;
  const tonic = pcOfSpelled(tonicOf(key));
  return m.characteristic.map((degree) => {
    const pc = mod(tonic + degreeSemitones(degree), 12) as Pc;
    return {
      degree,
      display: shown(degree),
      syllable: syllableOf(degree),
      pc,
      name: spellMidi(60 + pc, { key }).name.replace(/-?\d+$/, ""),
      n: degrees.indexOf(degree),
    };
  });
}
/**
 * The chords of a mode with their numerals, read in the mode (never as applied chords): G Mixolydian
 * I ii iii° IV v vi ♭VII; D Dorian i ii III IV v vi° VII; F Lydian I II iii ♯iv° V vi vii; E Phrygian
 * i ♭II III iv v° VI vii. Major-family modes are numbered against major, minor-family modes against natural minor.
 */
export function modalChords(key: KeySpec, opts: { seventh?: boolean } = {}): KeyChord[] {
  return diatonicChords(key, opts.seventh === true).map((c) => keyChord(c, key));
}
/** The chords of a mode's characteristic progression in a key: `modalProgression(G Mixolydian)` → G F C. */
export function modalProgression(key: KeySpec, index = 0): KeyChord[] {
  const rns = modeColour(key.mode)?.progressions[index];
  if (!rns) return [];
  return rns.map((rn) => keyChord(need(rn, key), key));
}
/**
 * The taught modes on `tonicPc` whose scale holds every one of `pcs`, brightest first. One pitch-class set can fit
 * several (C D E G A fits Lydian, Ionian and Mixolydian): the colour tone decides, which is why the `mode` rule
 * asks for it on strong beats.
 */
export function modesContaining(pcs: Iterable<number>, tonicPc: number): TaughtMode[] {
  const set = new Set([...pcs].map((p) => mod(Math.round(p), 12)));
  const tonic = spellMidi(60 + mod(tonicPc, 12), { key: null }).name.replace(/-?\d+$/, "");
  return TAUGHT_MODES.filter((mode) => {
    const scale = new Set<number>(scalePcs({ tonic, mode }));
    return [...set].every((p) => scale.has(p));
  });
}

// --- chromatic degrees and chromatic solfège (U15.L01) -------------------------------------------------------

export interface ChromaticDegree {
  /** "#4", "b7": relative to the major scale (contracts §5.2 `Degree`). */
  degree: Degree;
  /** "♯4", "♭7". */
  display: string;
  /** Chromatic solfège: raised di ri fi si li, lowered ra me se le te. */
  syllable: string;
  /** Semitones above the tonic. */
  semitones: number;
  raised: boolean;
  /** How code plays it in a major key (STYLE §6): `n("3#")` = ♯4, `n("6b")` = ♭7. */
  step: string;
  /** The diatonic degree it leans to: ♯4 → 5, ♭7 → 6, ♭6 → 5, ♭2 → 1, ♭3 → 2, ♯5 → 6, ♯1 → 2. */
  resolvesTo: Degree;
}
const CHROMATIC: readonly [Degree, Degree][] = [
  ["#1", "2"],
  ["b2", "1"],
  ["#2", "3"],
  ["b3", "2"],
  ["#4", "5"],
  ["b5", "4"],
  ["#5", "6"],
  ["b6", "5"],
  ["#6", "7"],
  ["b7", "6"],
];
const MAJOR: KeySpec = { tonic: "C", mode: "major" };
/**
 * The ten chromatic degrees of a major key (five pitches, each with a raised and a lowered name), with their
 * syllables and `n` steps. U15.L01 teaches ♯4 ♭7 ♯5 ♯1 ♭2 ♭3 ♭6 (content-kit `CHROMATIC_DEGREES`); the steps equal
 * content-kit `CHROMATIC_STEPS`.
 */
export const CHROMATIC_DEGREE_TABLE: readonly ChromaticDegree[] = CHROMATIC.map(([degree, resolvesTo]) => ({
  degree,
  display: shown(degree),
  syllable: syllableOf(degree),
  semitones: degreeSemitones(degree),
  raised: degree.startsWith("#"),
  step: String(strudelStep(degree, MAJOR)),
  resolvesTo,
}));
export function chromaticDegree(degree: Degree): ChromaticDegree | null {
  return CHROMATIC_DEGREE_TABLE.find((d) => d.degree === degree) ?? null;
}
/** The chromatic scale in solfège: up do di re ri mi fa fi sol si la li ti, down do ti te la le sol se fa mi me re ra. */
export const CHROMATIC_SOLFEGE: { readonly up: readonly string[]; readonly down: readonly string[] } = {
  up: ["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"].map((d) => syllableOf(d as Degree)),
  down: ["1", "7", "b7", "6", "b6", "5", "b5", "4", "3", "b3", "2", "b2"].map((d) => syllableOf(d as Degree)),
};

export interface ChromaticLabel {
  degree: Degree;
  display: string;
  syllable: string;
  /** The note is outside the key's own scale. */
  chromatic: boolean;
  /** Spelled for the staff: by the chord under it when given, else by direction, else the key's usual label. */
  name: string;
  /** `n` in the key's own scale: an integer inside the scale, a step string ("3#") outside it. */
  step: number | string;
}
/**
 * One note as the degree lens labels it from U15.L01 on. A note of the key keeps its label. A chromatic note is
 * named by function: under a chord that contains it, as that chord spells it (G♯ under E7 is ♯5 "si", A♭ under A♭
 * is ♭6 "le"); else by direction (rising ♯, falling ♭); else the key's usual label (♯4 ♭7 ♭3 ♭6 ♭2 in major).
 */
export function chromaticLabel(
  midi: number,
  key: KeySpec,
  ctx: { chord?: ChordId; direction?: 1 | -1 } = {},
): ChromaticLabel {
  const own = degreeOf(midi, key);
  const inScale = (scalePcs(key) as number[]).includes(mod(Math.round(midi), 12));
  const spelled: SpelledPitch = spellMidi(midi, { key, ...ctx });
  const name = spelled.name.replace(/-?\d+$/, "");
  if (inScale)
    return {
      degree: own.degree,
      display: shown(own.degree),
      syllable: own.syllable,
      chromatic: false,
      name,
      step: own.step,
    };
  // The degree that matches the spelling: the letter's distance from the tonic gives the number.
  const t = tonicOf(key);
  const num = mod("CDEFGAB".indexOf(spelled.letter) - t.letter, 7) + 1;
  const semis = mod(Math.round(midi) - pcOfSpelled(t), 12);
  const natural = [0, 2, 4, 5, 7, 9, 11][num - 1] as number;
  let alt = semis - natural;
  if (alt > 6) alt -= 12;
  if (alt < -6) alt += 12;
  const label = `${alt === 1 ? "#" : alt === -1 ? "b" : ""}${num}` as Degree;
  const known = Math.abs(alt) === 1 && syllableOf(label) !== "?";
  const degree = known ? label : own.degree;
  return {
    degree,
    display: shown(degree),
    syllable: syllableOf(degree),
    chromatic: true,
    name,
    step: strudelStep(degree, key),
  };
}

// --- applied chords (U15) --------------------------------------------------------------------------------------

export const APPLIED_KINDS = ["V", "V7", "viio", "viio7"] as const;
export type AppliedKind = (typeof APPLIED_KINDS)[number];

export interface AppliedChord {
  kind: AppliedKind;
  /** Oak's dialect: "V7/V", "viio/ii". */
  rn: string;
  chord: ChordId;
  /** Lead-sheet symbol: "D7". */
  symbol: string;
  /** The diatonic chord it points at, with its numeral: G in C ("V"). */
  target: KeyChord;
  /** Its leading tone: the 3rd of an applied dominant, the root of an applied vii°. F♯ ("♯4") for V/V in C. */
  leadingTone: { name: string; degree: Degree; display: string; resolvesTo: string };
  /** The notes outside the key, spelled: ["F#"]. */
  chromatic: string[];
}
/**
 * The diatonic chords an applied chord may point at: every major or minor triad except the tonic (ii iii IV V vi in
 * major; III iv v VI VII in minor, with V taken as major). A diminished chord cannot be tonicized.
 */
export function appliedTargets(key: KeySpec): KeyChord[] {
  const k: KeySpec = { tonic: key.tonic, mode: isMinorRef(key) ? "minor" : "major" };
  return diatonicChords(k)
    .map((c, i) => keyChord(i === 4 && isMinorRef(key) ? need("V", k) : c, k))
    .filter((c) => c.degree !== 1 && (c.chord.quality === "maj" || c.chord.quality === "min"));
}
/**
 * An applied chord: `appliedChord("V7", 5, C major)` → D7, "V7/V", leading tone F♯ (♯4) resolving to G.
 * `null` when the degree cannot be tonicized.
 */
export function appliedChord(kind: AppliedKind, targetDegree: number, key: KeySpec): AppliedChord | null {
  const target = appliedTargets(key).find((t) => t.degree === targetDegree);
  if (!target) return null;
  const rn = `${kind}/${target.rn}`;
  const chord = chordOfRoman(rn, key);
  if (!chord) return null;
  const notes = chordNotes(chord);
  const scale = new Set<number>(scalePcs({ tonic: key.tonic, mode: isMinorRef(key) ? "minor" : "major" }));
  const lt = (kind === "V" || kind === "V7" ? notes[1] : notes[0]) as string;
  const ltDeg = chromaticLabel(60 + pcOfName(lt), key, { chord }).degree;
  return {
    kind,
    rn,
    chord,
    symbol: toLeadSheet(chord),
    target,
    leadingTone: { name: lt, degree: ltDeg, display: shown(ltDeg), resolvesTo: target.chord.root },
    chromatic: notes.filter((n) => !scale.has(pcOfName(n))),
  };
}
/** Every applied chord of a key, target by target (default: V and V7 of each). */
export function appliedChords(key: KeySpec, kinds: readonly AppliedKind[] = ["V", "V7"]): AppliedChord[] {
  return appliedTargets(key).flatMap((t) =>
    kinds.flatMap((kind) => {
      const a = appliedChord(kind, t.degree, key);
      return a ? [a] : [];
    }),
  );
}
/**
 * How a chord reads as an applied chord in a key, and whether the chord after it is its target ("resolves"):
 * D7 → G in C is `{ rn: "V7/V", target: V, resolves: true }`. `null` for a chord that is not applied.
 */
export function appliedReading(
  chord: ChordId,
  key: KeySpec,
  next?: ChordId,
): { rn: string; kind: AppliedKind | null; target: KeyChord; resolves: boolean } | null {
  const rn = romanOf(chord, key, next);
  if (!rn.of) return null;
  const targetChord = rnToChord({ ...rn.of, inversion: 0 }, key);
  const core = SEVENTH_CORE[rn.quality];
  const kind: AppliedKind | null =
    rn.degree === 5
      ? core === "maj"
        ? "V"
        : core === "7"
          ? "V7"
          : null
      : rn.degree === 7
        ? core === "dim"
          ? "viio"
          : "viio7"
        : null;
  return {
    rn: romanText(chord, key, next),
    kind,
    target: keyChord(targetChord, key),
    resolves: next !== undefined && arrivesOn(next, targetChord),
  };
}
/**
 * Whether `next` is the chord an applied chord points at (corrections pass, theory-f): its root with the target's
 * own triad quality (V/vi → Am, not A or A+), or a dominant seventh on that root, the next link of a dominant
 * chain (V7/ii → D7 in C, U15.L05).
 */
export function arrivesOn(next: ChordId, target: ChordId): boolean {
  if (next.rootPc !== target.rootPc) return false;
  const nq = triadCore(next).quality;
  if (nq === triadCore(target).quality) return true;
  return nq === "maj" && (chordPcs(next) as number[]).includes((next.rootPc + 10) % 12);
}
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
/**
 * A chain of dominants falling by fifths to the tonic (U15.L05): `dominantChain(C major, 4)` → E7 A7 D7 G7, read
 * both ways: as the chain a player says ("III7 VI7 II7 V7") and as applied chords ("V7/vi V7/ii V7/V V7").
 * `length` counts the dominants (1–6); the tonic is not included.
 */
export function dominantChain(
  key: KeySpec,
  length = 4,
): { chord: ChordId; symbol: string; chainRn: string; rn: string }[] {
  if (length < 1 || length > 6) throw new RangeError("@oak/theory: a dominant chain has 1 to 6 chords");
  const tonic = pcOfSpelled(tonicOf(key));
  const chords: ChordId[] = [];
  for (let i = length; i >= 1; i--) {
    const pc = mod(tonic + 7 * i, 12);
    const root = spellMidi(60 + pc, { key: { tonic: key.tonic, mode: "major" } }).name.replace(/-?\d+$/, "");
    chords.push(chordOf(root, "7"));
  }
  const major: KeySpec = { tonic: key.tonic, mode: isMinorRef(key) ? "minor" : "major" };
  return chords.map((chord, i) => {
    const d = degreeOf(60 + chord.rootPc, major);
    return {
      chord,
      symbol: toLeadSheet(chord),
      chainRn: `${d.alt === -1 ? "b" : d.alt === 1 ? "#" : ""}${NUMERALS[d.num - 1]}7`,
      rn: romanText(chord, key, chords[i + 1] ?? (chordOfRoman(isMinorRef(key) ? "i" : "I", key) as ChordId)),
    };
  });
}

// --- mixture: borrowed chords (U16) ----------------------------------------------------------------------------

export interface BorrowedChord {
  /** In the major key: "iv", "bVI", "bVII", "bIII", "iio". */
  rn: string;
  chord: ChordId;
  symbol: string;
  /** The numeral it has in the parallel minor it comes from: "iv", "VI", "VII", "III". */
  sourceRn: string;
  /** The lowered degrees it brings into the major key: iv → ♭6; ♭VI → ♭6 and ♭3; ♭VII → ♭7; ♭III → ♭3 and ♭7. */
  lowered: Degree[];
  /** The lesson that teaches it. */
  lesson: "U16.L01" | "U16.L02" | "U16.L03";
}
const BORROWED: readonly [string, string, BorrowedChord["lesson"]][] = [
  ["iv", "iv", "U16.L01"],
  ["bVI", "VI", "U16.L02"],
  ["bVII", "VII", "U16.L02"],
  ["bIII", "III", "U16.L03"],
  ["iio", "iio", "U16.L03"],
];
/**
 * The chords a major key borrows from its parallel minor (U16.L01–L03): in C, Fm (iv), A♭ (♭VI), B♭ (♭VII),
 * E♭ (♭III) and D° (ii°), each with the lowered degrees it brings. Throws for a key that is not major.
 */
export function borrowedChords(key: KeySpec): BorrowedChord[] {
  if (key.mode !== "major") throw new RangeError("@oak/theory: borrowedChords needs a major key");
  const scale = new Set<number>(scalePcs(key));
  return BORROWED.map(([rn, sourceRn, lesson]) => {
    const chord = need(rn, key);
    const lowered = chordNotes(chord)
      .map((n) => pcOfName(n))
      .filter((pc) => !scale.has(pc))
      .map((pc) => degreeOf(60 + pc, key).degree)
      .sort((a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, "")));
    return { rn, chord, symbol: toLeadSheet(chord), sourceRn, lowered, lesson };
  });
}
/** The borrowed chord a chord is in a major key (compared on the triad core), or `null`. */
export function borrowedReading(chord: ChordId, key: KeySpec): BorrowedChord | null {
  if (key.mode !== "major") return null;
  return (
    borrowedChords(key).find(
      (b) => b.chord.rootPc === chord.rootPc && triadQuality(b.chord.quality) === triadQuality(chord.quality),
    ) ?? null
  );
}
/** The Picardy third (U16.L04): a minor piece ending on the major tonic. `picardy(A minor)` → A major, "I", C♯. */
export function picardy(key: KeySpec): {
  chord: ChordId;
  rn: string;
  symbol: string;
  raised: { degree: Degree; name: string };
} {
  if (!isMinorRef(key)) throw new RangeError("@oak/theory: the Picardy third needs a minor key");
  const chord = chordOf(key.tonic, "maj");
  return {
    chord,
    rn: "I",
    symbol: toLeadSheet(chord),
    raised: { degree: "3", name: chordNotes(chord)[1] as string },
  };
}
/** The Dorian IV (U16.L04): the major IV in a minor key, with the raised 6th. `dorianFour(A minor)` → D, "IV", F♯. */
export function dorianFour(key: KeySpec): {
  chord: ChordId;
  rn: string;
  symbol: string;
  raised: { degree: Degree; name: string };
} {
  if (!isMinorRef(key)) throw new RangeError("@oak/theory: the Dorian IV needs a minor key");
  const chord = need("IV", { tonic: key.tonic, mode: "dorian" });
  return {
    chord,
    rn: "IV",
    symbol: toLeadSheet(chord),
    raised: { degree: "6", name: chordNotes(chord)[1] as string },
  };
}

export type ChromaticChordKind = "diatonic" | "applied" | "borrowed" | "picardy" | "dorian-iv" | "other";
/**
 * Where a chord stands in a key: one of the key's own chords, an applied chord (V/x, vii°/x), a chord borrowed
 * from the parallel minor (major keys), the Picardy I or the Dorian IV (minor keys), or something else.
 */
export function chromaticChordKind(chord: ChordId, key: KeySpec, next?: ChordId): ChromaticChordKind {
  if (romanOf(chord, key, next).of) return "applied";
  const base: KeySpec = { tonic: key.tonic, mode: isMinorRef(key) ? "minor" : key.mode };
  const scale = new Set<number>(scalePcs(base));
  if (isMinorRef(key)) {
    // Minor keys own the raised 7th (V, vii°) and, with it, the raised 6th of melodic minor.
    const tonic = pcOfSpelled(tonicOf(key));
    const third = SEVENTH_CORE[chord.quality];
    const major = third === "maj" || third === "maj7" || third === "7" || third === "6";
    if (chord.rootPc === tonic && major) return "picardy";
    if (chord.rootPc === mod(tonic + 5, 12) && major) return "dorian-iv";
    scale.add(mod(tonic + 11, 12));
  }
  const pcs = chordNotes({ ...chord, quality: SEVENTH_CORE[chord.quality] }).map(pcOfName);
  if (pcs.every((pc) => scale.has(pc))) return "diatonic";
  return borrowedReading(chord, key) ? "borrowed" : "other";
}

/**
 * The kind of outside chord a rule or an answer names (content-kit `OutsideChordKind`; U15–U16): a secondary
 * dominant (V/x, V7/x), an applied leading-tone chord (vii°/x, vii°7/x), or a borrowed chord (from the parallel
 * key: iv ♭VI ♭VII ♭III ii° in major, the Picardy I and the Dorian IV in minor). `null` for a chord of the key and
 * for anything else. Read from the chord in context, never from a string.
 */
export function outsideChordKind(chord: ChordId, key: KeySpec, next?: ChordId): OutsideChordKind | null {
  const kind = chromaticChordKind(chord, key, next);
  if (kind === "applied")
    return romanOf(chord, key, next).degree === 5 ? "secondary-dominant" : "applied-leading-tone";
  return kind === "borrowed" || kind === "picardy" || kind === "dorian-iv" ? "borrowed" : null;
}

// --- modulation (U17) -------------------------------------------------------------------------------------------

export interface PivotChord {
  chord: ChordId;
  symbol: string;
  /** Its numeral in the old key and in the new one: Am is vi in C and ii in G. */
  from: string;
  to: string;
}
/** The triads two keys share, with their numeral in each (U17.L01): C major → G major: C (I/IV), Em (iii/vi), G (V/I), Am (vi/ii). */
export function pivotChords(from: KeySpec, to: KeySpec): PivotChord[] {
  const b = diatonicChords(to);
  return diatonicChords(from)
    .filter((c) => b.some((x) => x.rootPc === c.rootPc && x.quality === c.quality))
    .map((chord) => ({
      chord,
      symbol: toLeadSheet(chord),
      from: romanText(chord, from),
      to: romanText(chord, to),
    }));
}

export type KeyRelation =
  | "same"
  | "relative"
  | "parallel"
  | "dominant"
  | "subdominant"
  | "up-half"
  | "up-step"
  | "down-step"
  | "other";
export interface KeyDistance {
  /** Semitones up from the old tonic to the new one, 0–11. */
  semitones: number;
  /** Steps round the circle of fifths between the two signatures: positive = sharper, −6 … 6. */
  fifths: number;
  relation: KeyRelation;
  /** Notes the two scales share, of 7. */
  commonTones: number;
  /** Triads the two keys share (the pivots). */
  pivots: number;
}
/**
 * How far apart two keys are (U17.L02–L03): C major → D major is +2 semitones, two steps sharper, the "up a step"
 * lift with 5 notes and 2 triads in common; C major → D♭ major is the half-step lift with 2 notes and no triad in
 * common, which is why it is written as a direct modulation.
 */
export function keyDistance(from: KeySpec, to: KeySpec): KeyDistance {
  const a = pcOfSpelled(tonicOf(from));
  const b = pcOfSpelled(tonicOf(to));
  const semitones = mod(b - a, 12);
  const minorA = isMinorRef(from);
  const minorB = isMinorRef(to);
  const sig = (k: KeySpec, minor: boolean): number =>
    mod((pcOfSpelled(tonicOf(k)) + (minor ? 3 : 0)) * 7, 12);
  let fifths = mod(sig(to, minorB) - sig(from, minorA), 12);
  if (fifths > 6) fifths -= 12;
  const sa = new Set<number>(scalePcs(from));
  const commonTones = (scalePcs(to) as number[]).filter((p) => sa.has(p)).length;
  let relation: KeyRelation = "other";
  if (semitones === 0 && minorA === minorB) relation = "same";
  else if (semitones === 0) relation = "parallel";
  else if (minorA !== minorB && fifths === 0) relation = "relative";
  else if (minorA === minorB && semitones === 7) relation = "dominant";
  else if (minorA === minorB && semitones === 5) relation = "subdominant";
  else if (minorA === minorB && semitones === 1) relation = "up-half";
  else if (minorA === minorB && semitones === 2) relation = "up-step";
  else if (minorA === minorB && semitones === 10) relation = "down-step";
  return { semitones, fifths, relation, commonTones, pivots: pivotChords(from, to).length };
}

export interface KeyPlanSpan {
  key: KeySpec;
  /** The octave the code wrote (`C4:major`), `null` when it wrote none. */
  octave: number | null;
  /** 0-based first bar of the span and its length, in bars of the whole piece. */
  fromBar: number;
  bars: number;
  /** As written: "D4:major". */
  text: string;
}
export interface KeyPlan {
  spans: KeyPlanSpan[];
  /** Bars before the plan repeats. */
  totalBars: number;
  /** Each change of key, with the bar it lands on (0-based) and its distance. */
  changes: { bar: number; from: KeySpec; to: KeySpec; distance: KeyDistance }[];
}
/**
 * The key plan a patterned `.scale()` writes (contracts §6.8 item 4, U17.L02): `"<C4:major!16 D4:major!8>"` is
 * C major for 16 bars, then D major for 8. Reads one `< >` sequence of `tonic:mode` steps with `!n` repeats (the
 * form STYLE teaches); a single scale is a plan with one span of one bar. `null` for anything else (the grader
 * reads the events' `scaleCtx` then).
 */
export function parseKeyPlan(scaleArg: string): KeyPlan | null {
  const text = scaleArg.trim();
  const inner = /^<([^<>]*)>$/.exec(text)?.[1] ?? (/[<>[\]{},*/|~]/.test(text) ? null : text);
  if (inner === null) return null;
  const spans: KeyPlanSpan[] = [];
  let at = 0;
  for (const tok of inner.trim().split(/\s+/).filter(Boolean)) {
    const m = /^([^!@]+?)(?:[!@](\d+))?$/.exec(tok);
    const parsed = m ? parseScaleArg(m[1] as string) : null;
    const mode = parsed?.def.mode ?? null;
    if (!m || !parsed || mode === null) return null;
    const bars = m[2] ? Number(m[2]) : 1;
    if (bars < 1) return null;
    const key: KeySpec = { tonic: parsed.tonic, mode };
    const last = spans[spans.length - 1];
    if (last && last.key.tonic === key.tonic && last.key.mode === key.mode && last.octave === parsed.octave)
      last.bars += bars;
    else spans.push({ key, octave: parsed.octave, fromBar: at, bars, text: m[1] as string });
    at += bars;
  }
  if (spans.length === 0) return null;
  const changes = spans.slice(1).map((s, i) => {
    const from = (spans[i] as KeyPlanSpan).key;
    return { bar: s.fromBar, from, to: s.key, distance: keyDistance(from, s.key) };
  });
  return { spans, totalBars: at, changes };
}
/** The key in force at a bar (0-based) of a plan; the plan repeats after `totalBars`. */
export function keyAtBarOfPlan(plan: KeyPlan, bar: number): KeySpec {
  const b = mod(bar, plan.totalBars);
  return (plan.spans.find((s) => b >= s.fromBar && b < s.fromBar + s.bars) ?? (plan.spans[0] as KeyPlanSpan))
    .key;
}
/** The patterned scale string of a lift: `keyLiftScale("C", 16, 2, 8)` → `"<C4:major!16 D4:major!8>"`. */
export function keyLiftScale(
  tonic: string,
  barsBefore: number,
  semitones: number,
  barsAfter: number,
  octave = 4,
): string {
  const from: KeySpec = { tonic, mode: "major" };
  const to = transposeKey(from, semitones);
  return `<${from.tonic}${octave}:major!${barsBefore} ${to.tonic}${octave}:major!${barsAfter}>`;
}
/** "C major", "F♯ Dorian": a key as a sentence names it. */
export function keyDisplay(key: KeySpec): string {
  const colour = modeColour(key.mode);
  const mode = key.mode === "major" || key.mode === "minor" ? key.mode : (colour?.name ?? key.mode);
  return `${tonicDisplay(key.tonic)} ${mode}`;
}

// --- rhythm II (U13): beat grids for compound meter and triplets, pushes ---------------------------------------

export interface BeatGridLine {
  /** Position inside the bar, in cycles (1 cycle = 1 bar). */
  at: Rat;
  /** `beat`: a tempo unit (a quarter in 4/4, a dotted quarter in 6/8); `sub`: a division of it. */
  level: "beat" | "sub";
  /** "1", "&", "la", "li", "trip", "let": what the count says there. */
  label: string;
}
export interface BeatGrid {
  meter: MeterId;
  /** Tempo units per bar and how each divides: 2 (simple), 3 (compound, or triplets in a simple meter). */
  beats: number;
  division: 2 | 3;
  /** True for 6/8, 9/8 and 12/8: the beat is a dotted quarter (contracts §6.9). */
  compound: boolean;
  /** One beat and one division, in cycles. */
  beatLen: Rat;
  subLen: Rat;
  lines: BeatGridLine[];
}
/**
 * The counting grid of one bar (U13.L04–L05; the roll's beat-grid lens): 6/8 is two dotted-quarter beats, each
 * "1 la li"; 12/8 four of them; 4/4 is four beats of "1 &", or of "1 trip let" with `triplets`. The labels are
 * `barPosition`'s. Odd meters (5/8, 7/8, 9/8i) are not part of the core: they throw.
 */
export function beatGrid(meter: MeterId | MeterSpec, opts: { triplets?: boolean } = {}): BeatGrid {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  if (m.tempoUnit === "eighth") throw new RangeError(`@oak/theory: beatGrid does not cover ${m.id}`);
  const compound = m.tempoUnit === "dottedQuarter";
  const division: 2 | 3 = compound || opts.triplets ? 3 : 2;
  const beatLen = rat(1, m.unitsPerBar);
  const subLen = rat(1, m.unitsPerBar * division);
  const lines: BeatGridLine[] = [];
  for (let i = 0; i < m.unitsPerBar * division; i++) {
    const at = rat(i, m.unitsPerBar * division);
    const label = barPosition(at, m).label;
    const onBeat = i % division === 0;
    lines.push({ at, level: onBeat ? "beat" : "sub", label: onBeat ? label : label.replace(/^\d+-?/, "") });
  }
  return { meter: m.id, beats: m.unitsPerBar, division, compound, beatLen, subLen, lines };
}

/**
 * How far `.early()` or `.late()` moves a note that is pushed by one eighth or one sixteenth (U13.L01), in cycles
 * and as the code writes it: in 4/4 an eighth is `1/8` (`.early(1/8)`), a sixteenth `1/16`; in 6/8 an eighth is
 * `1/6`. Compound meters push by the eighth only.
 */
export function pushAmount(meter: MeterId | MeterSpec, by: 8 | 16): { cycles: Rat; code: string } {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  const eighthsPerBar = m.den === 8 ? m.num : m.num * 2;
  const cycles = rat(1, by === 8 ? eighthsPerBar : eighthsPerBar * 2);
  return { cycles, code: `${cycles[0]}/${cycles[1]}` };
}
