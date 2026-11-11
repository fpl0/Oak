// The small music kernel the generators compute with: pitch classes, spelled keys, scale steps as
// Strudel resolves them, degrees, intervals and chord tones. Everything here is integer arithmetic on
// MIDI numbers and letter names; the property tests compare it against headless Strudel and against
// @oak/theory, which stays the owner of normalization, chord-symbol parsing and analysis.
import type { ChordQuality, Degree, KeyPool, KeySpec, ScaleMode } from "@oak/content-kit";

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export interface PcName {
  letter: string;
  alt: number;
  /** 0 to 11. */
  pc: number;
}
/** Parses a spelled pitch class: "Eb", "F#", "Bbb". Throws for anything else (a programming error). */
export function parsePc(name: string): PcName {
  const m = /^([A-Ga-g])([#b]*)$/.exec(name);
  if (!m) throw new RangeError(`not a pitch-class name: "${name}"`);
  const letter = (m[1] as string).toUpperCase();
  const acc = m[2] as string;
  const alt = acc.startsWith("b") ? -acc.length : acc.length;
  return { letter, alt, pc: mod((LETTER_PC[letter] as number) + alt, 12) };
}
export function pcName(letter: string, alt: number): string {
  return letter + (alt < 0 ? "b".repeat(-alt) : "#".repeat(alt));
}
const letterIndex = (letter: string): number => LETTERS.indexOf(letter as (typeof LETTERS)[number]);

/** MIDI of a spelled tonic in an octave, letter-based like Strudel: "Cb4" is 59, "B#3" is 60. */
export function tonicMidi(tonic: string, octave: number): number {
  const p = parsePc(tonic);
  return 12 * (octave + 1) + (LETTER_PC[p.letter] as number) + p.alt;
}

/** A spelled pitch. `code` is the Strudel form ("eb4"), `name` the scientific form ("Eb4"). */
export interface Spelled {
  midi: number;
  letter: string;
  alt: number;
  oct: number;
  /** "Eb". */
  pc: string;
  name: string;
  code: string;
}
function spelled(midi: number, letter: string, alt: number): Spelled {
  const oct = Math.floor((midi - alt) / 12) - 1;
  const pc = pcName(letter, alt);
  return { midi, letter, alt, oct, pc, name: `${pc}${oct}`, code: `${pc.toLowerCase()}${oct}` };
}
/** MIDI of a Strudel note name with an octave ("c#4", "Bb3"); `null` otherwise. */
export function noteMidi(text: string): number | null {
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(text);
  if (!m) return null;
  const acc = m[2] as string;
  const alt = acc.startsWith("b") ? -acc.length : acc.length;
  return 12 * (Number(m[3]) + 1) + (LETTER_PC[(m[1] as string).toUpperCase()] as number) + alt;
}

// --- scales -------------------------------------------------------------------------------------

/** Semitones of each scale step above the tonic, as @strudel/tonal 1.2.6 resolves the names of STYLE §3. */
export const MODE_STEPS: Readonly<Record<ScaleMode, readonly number[]>> = {
  major: MAJOR,
  minor: [0, 2, 3, 5, 7, 8, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "major pentatonic": [0, 2, 4, 7, 9],
  "minor pentatonic": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};
/** Letter offset of each scale step from the tonic letter. */
const MODE_LETTERS: Readonly<Partial<Record<ScaleMode, readonly number[]>>> = {
  "major pentatonic": [0, 1, 2, 4, 5],
  "minor pentatonic": [0, 2, 3, 4, 6],
  blues: [0, 2, 3, 4, 4, 6],
};
/** Sharps (+) or flats (−) of the mode's signature relative to the major key on the same tonic. */
const MODE_SIGNATURE_SHIFT: Readonly<Record<ScaleMode, number>> = {
  major: 0,
  minor: -3,
  "harmonic minor": -3,
  "melodic minor": -3,
  dorian: -2,
  phrygian: -4,
  lydian: 1,
  mixolydian: -1,
  locrian: -5,
  "major pentatonic": 0,
  "minor pentatonic": -3,
  blues: -3,
};
const MAJOR_SIGNATURE: Readonly<Record<string, number>> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };

/** Signed accidental count of a key's signature: 3 for A major, −3 for C minor, −1 for G dorian. */
export function keyAccidentals(key: KeySpec): number {
  const p = parsePc(key.tonic);
  return (MAJOR_SIGNATURE[p.letter] as number) + 7 * p.alt + MODE_SIGNATURE_SHIFT[key.mode];
}
/** The sharps or flats of a signature in order: 2 → ["F#", "C#"], −3 → ["Bb", "Eb", "Ab"]. */
export function signatureNotes(accidentals: number): string[] {
  const sharps = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"];
  const flats = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"];
  return accidentals >= 0 ? sharps.slice(0, accidentals) : flats.slice(0, -accidentals);
}

/** `.scale()` argument: "C4:major", "A3:harmonic:minor" (STYLE §3). */
export function scaleArg(key: KeySpec, octave: number): string {
  return `${key.tonic}${octave}:${key.mode.replace(/ /g, ":")}`;
}
/** `hap.context.scale` for that argument: "A3 harmonic minor". */
export function scaleContext(key: KeySpec, octave: number): string {
  return `${key.tonic}${octave} ${key.mode}`;
}
/** MIDI of an `n` step (5, -1, "3#", "6b") in `.scale(key at octave)`, exactly as Strudel resolves it. */
export function stepToMidi(step: number | string, key: KeySpec, octave: number): number {
  const m = /^(-?\d+)([#b]*)$/.exec(String(step));
  if (!m) throw new RangeError(`not a scale step: "${step}"`);
  const n = Number(m[1]);
  const acc = m[2] as string;
  const steps = MODE_STEPS[key.mode];
  const idx = mod(n, steps.length);
  const oct = Math.floor(n / steps.length);
  return (
    tonicMidi(key.tonic, octave) +
    12 * oct +
    (steps[idx] as number) +
    (acc.startsWith("b") ? -acc.length : acc.length)
  );
}

/** Spelled pitch classes of a key's scale from the tonic up; each letter once in a seven-note scale. */
export function scaleNames(key: KeySpec): string[] {
  const tonic = parsePc(key.tonic);
  const steps = MODE_STEPS[key.mode];
  const letters = MODE_LETTERS[key.mode] ?? steps.map((_, i) => i);
  return steps.map((semis, i) => {
    const letter = LETTERS[mod(letterIndex(tonic.letter) + (letters[i] as number), 7)] as string;
    const alt = mod(tonic.pc + semis - (LETTER_PC[letter] as number) + 6, 12) - 6;
    return pcName(letter, alt);
  });
}

// --- keys ---------------------------------------------------------------------------------------

const POOL_LIMIT: Readonly<Record<KeyPool, number>> = { C: 0, "≤2acc": 2, "≤4acc": 4, all: 6 };
const SHARP_TIE_MODES: readonly ScaleMode[] = ["major", "lydian", "major pentatonic"];

/** The twelve keys of a mode, one per pitch class, each spelled with at most six accidentals. */
export function allKeys(mode: ScaleMode): KeySpec[] {
  const out: KeySpec[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const candidates: KeySpec[] = [];
    for (const letter of LETTERS)
      for (const alt of [0, 1, -1])
        if (mod((LETTER_PC[letter] as number) + alt, 12) === pc)
          candidates.push({ tonic: pcName(letter, alt), mode });
    candidates.sort((a, b) => {
      const d = Math.abs(keyAccidentals(a)) - Math.abs(keyAccidentals(b));
      if (d !== 0) return d;
      const sharpFirst = SHARP_TIE_MODES.includes(mode) ? -1 : 1;
      return keyAccidentals(a) > 0 ? sharpFirst : -sharpFirst;
    });
    out.push(candidates[0] as KeySpec);
  }
  return out;
}
/** Keys of a pool: `C` is the key without accidentals, `≤2acc` up to two sharps or flats, and so on. */
export function keysFor(pool: KeyPool, mode: ScaleMode): KeySpec[] {
  return allKeys(mode).filter((k) => Math.abs(keyAccidentals(k)) <= POOL_LIMIT[pool]);
}
export const sameKey = (a: KeySpec | undefined, b: KeySpec | undefined): boolean =>
  a !== undefined && b !== undefined && parsePc(a.tonic).pc === parsePc(b.tonic).pc && a.mode === b.mode;
export const keyLabel = (key: KeySpec): string => `${key.tonic} ${key.mode}`;

// --- degrees ------------------------------------------------------------------------------------

const DEGREE_BY_SEMITONE: readonly Degree[] = [
  "1",
  "b2",
  "2",
  "b3",
  "3",
  "4",
  "#4",
  "5",
  "b6",
  "6",
  "b7",
  "7",
];
export function parseDegree(degree: Degree): { num: number; alt: number } {
  const alt = degree.startsWith("b") ? -1 : degree.startsWith("#") ? 1 : 0;
  return { num: Number(degree.replace(/[#b]/g, "")), alt };
}
/** Semitones of a degree above the tonic: "b3" → 3, "#4" → 6. */
export function degreeSemis(degree: Degree): number {
  const { num, alt } = parseDegree(degree);
  return (MAJOR[num - 1] as number) + alt;
}
/** The degree of a MIDI note above a tonic, relative to the major scale (♯4 for the tritone). */
export function degreeOfMidi(midi: number, key: KeySpec): Degree {
  return DEGREE_BY_SEMITONE[mod(midi - parsePc(key.tonic).pc, 12)] as Degree;
}
/**
 * The `n` value that plays `degree` in the key's own seven-note scale: an integer for a scale tone, or
 * the scale step of the same number with `#` or `b` (STYLE §6: ♯4 in major is "3#", ♭7 is "6b").
 */
export function stepForDegree(degree: Degree, key: KeySpec): number | string {
  const steps = MODE_STEPS[key.mode];
  if (steps.length !== 7) throw new RangeError(`stepForDegree needs a seven-note scale, not ${key.mode}`);
  const { num } = parseDegree(degree);
  const diff = degreeSemis(degree) - (steps[num - 1] as number);
  if (diff === 0) return num - 1;
  if (Math.abs(diff) > 2) throw new RangeError(`degree ${degree} is too far from step ${num} of ${key.mode}`);
  return `${num - 1}${diff > 0 ? "#".repeat(diff) : "b".repeat(-diff)}`;
}
/** Movable-do syllables, do-based minor. */
export const SYLLABLES: Readonly<Record<Degree, string>> = {
  "1": "do",
  "#1": "di",
  b2: "ra",
  "2": "re",
  "#2": "ri",
  b3: "me",
  "3": "mi",
  "4": "fa",
  "#4": "fi",
  b5: "se",
  "5": "sol",
  "#5": "si",
  b6: "le",
  "6": "la",
  "#6": "li",
  b7: "te",
  "7": "ti",
};

// --- spelling -----------------------------------------------------------------------------------

const DEFAULT_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Spells a MIDI note in a key: a scale tone takes the scale's letter; a chromatic note takes the letter
 * of its degree (♭3, ♯4, ♭6, ♭7). A spelling that would need a double accidental falls back to the
 * plain name. With no key the names are C C♯ D E♭ E F F♯ G A♭ A B♭ B.
 */
export function spellMidi(midi: number, key: KeySpec | null): Spelled {
  const pc = mod(midi, 12);
  const plain = (names: readonly string[]): Spelled => {
    const p = parsePc(names[pc] as string);
    return spelled(midi, p.letter, p.alt);
  };
  if (!key) return plain(DEFAULT_NAMES);
  const tonic = parsePc(key.tonic);
  const semis = mod(pc - tonic.pc, 12);
  const idx = MODE_STEPS[key.mode].indexOf(semis);
  if (idx >= 0) {
    const p = parsePc(scaleNames(key)[idx] as string);
    return spelled(midi, p.letter, p.alt);
  }
  const { num } = parseDegree(DEGREE_BY_SEMITONE[semis] as Degree);
  const letter = LETTERS[mod(letterIndex(tonic.letter) + num - 1, 7)] as string;
  const alt = mod(pc - (LETTER_PC[letter] as number) + 6, 12) - 6;
  if (Math.abs(alt) > 1) return plain(keyAccidentals(key) < 0 ? FLAT_NAMES : SHARP_NAMES);
  return spelled(midi, letter, alt);
}
/** The spelled pitch of a letter name near a MIDI number ("Bb" at 58). */
export function spellAs(midi: number, pc: string): Spelled {
  const p = parsePc(pc);
  if (p.pc !== mod(midi, 12)) throw new RangeError(`${pc} is not the pitch class of MIDI ${midi}`);
  return spelled(midi, p.letter, p.alt);
}

// --- intervals ----------------------------------------------------------------------------------

const SIMPLE_INTERVALS = ["P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8"];
/** The usual name of an interval of 0 to 12 semitones (the tritone is "TT"); larger ones are compound: "M9". */
export function intervalOfSemis(semitones: number): string {
  const s = Math.abs(semitones);
  if (s <= 12) return SIMPLE_INTERVALS[s] as string;
  const simple = SIMPLE_INTERVALS[s - 12] as string;
  return simple === "TT" ? "A11" : `${simple[0]}${Number(simple.slice(1)) + 7}`;
}
/** Interval name from spelled notes: letters give the number, semitones the quality ("A4", "d5", "m3"). */
export function intervalName(low: Spelled, high: Spelled): string {
  const span = letterIndex(high.letter) + 7 * high.oct - (letterIndex(low.letter) + 7 * low.oct);
  const semis = high.midi - low.midi;
  const number = span + 1;
  const ref = (MAJOR[mod(span, 7)] as number) + 12 * Math.floor(span / 7);
  const diff = semis - ref;
  const perfect = [0, 3, 4].includes(mod(span, 7));
  const quality = perfect
    ? ({ "0": "P", "1": "A", "-1": "d" } as Record<string, string>)[String(diff)]
    : ({ "0": "M", "-1": "m", "1": "A", "-2": "d" } as Record<string, string>)[String(diff)];
  if (!quality) throw new RangeError(`no interval name for ${low.name}–${high.name}`);
  return `${quality}${number}`;
}

// --- chords -------------------------------------------------------------------------------------

/** Semitones above the root, and the chord degree (1 3 5 7 9 11 13, or 2 4 6) each tone is spelled as. */
export const CHORD_TONES: Readonly<
  Record<ChordQuality, { semis: readonly number[]; degrees: readonly number[] }>
> = {
  maj: { semis: [0, 4, 7], degrees: [1, 3, 5] },
  min: { semis: [0, 3, 7], degrees: [1, 3, 5] },
  dim: { semis: [0, 3, 6], degrees: [1, 3, 5] },
  aug: { semis: [0, 4, 8], degrees: [1, 3, 5] },
  sus2: { semis: [0, 2, 7], degrees: [1, 2, 5] },
  sus4: { semis: [0, 5, 7], degrees: [1, 4, 5] },
  maj7: { semis: [0, 4, 7, 11], degrees: [1, 3, 5, 7] },
  "7": { semis: [0, 4, 7, 10], degrees: [1, 3, 5, 7] },
  m7: { semis: [0, 3, 7, 10], degrees: [1, 3, 5, 7] },
  m7b5: { semis: [0, 3, 6, 10], degrees: [1, 3, 5, 7] },
  dim7: { semis: [0, 3, 6, 9], degrees: [1, 3, 5, 7] },
  mMaj7: { semis: [0, 3, 7, 11], degrees: [1, 3, 5, 7] },
  "6": { semis: [0, 4, 7, 9], degrees: [1, 3, 5, 6] },
  m6: { semis: [0, 3, 7, 9], degrees: [1, 3, 5, 6] },
  "69": { semis: [0, 4, 7, 9, 14], degrees: [1, 3, 5, 6, 9] },
  add9: { semis: [0, 4, 7, 14], degrees: [1, 3, 5, 9] },
  "9": { semis: [0, 4, 7, 10, 14], degrees: [1, 3, 5, 7, 9] },
  maj9: { semis: [0, 4, 7, 11, 14], degrees: [1, 3, 5, 7, 9] },
  m9: { semis: [0, 3, 7, 10, 14], degrees: [1, 3, 5, 7, 9] },
  m11: { semis: [0, 3, 7, 10, 14, 17], degrees: [1, 3, 5, 7, 9, 11] },
  "7b9": { semis: [0, 4, 7, 10, 13], degrees: [1, 3, 5, 7, 9] },
  "7#9": { semis: [0, 4, 7, 10, 15], degrees: [1, 3, 5, 7, 9] },
  "7#11": { semis: [0, 4, 7, 10, 18], degrees: [1, 3, 5, 7, 11] },
  "7b13": { semis: [0, 4, 7, 10, 20], degrees: [1, 3, 5, 7, 13] },
  "13": { semis: [0, 4, 7, 10, 14, 21], degrees: [1, 3, 5, 7, 9, 13] },
  // The altered dominant as @oak/theory defines it: 1 3 ♭7 with every altered tension ♭9 ♯9 ♯11 ♭13.
  "7alt": { semis: [0, 4, 10, 13, 15, 18, 20], degrees: [1, 3, 7, 9, 9, 11, 13] },
  "maj7#11": { semis: [0, 4, 7, 11, 18], degrees: [1, 3, 5, 7, 11] },
  "7sus4": { semis: [0, 5, 7, 10], degrees: [1, 4, 5, 7] },
};
/** The code suffix of STYLE §5.1 ("^7", "m7b5", "o") and the lead-sheet suffix ("maj7", "m7♭5", "°"). */
export const CHORD_SUFFIX: Readonly<Record<ChordQuality, { code: string; lead: string; name: string }>> = {
  maj: { code: "", lead: "", name: "major triad" },
  min: { code: "m", lead: "m", name: "minor triad" },
  dim: { code: "o", lead: "°", name: "diminished triad" },
  aug: { code: "aug", lead: "+", name: "augmented triad" },
  sus2: { code: "2", lead: "sus2", name: "suspended second" },
  sus4: { code: "sus", lead: "sus4", name: "suspended fourth" },
  maj7: { code: "^7", lead: "maj7", name: "major seventh" },
  "7": { code: "7", lead: "7", name: "dominant seventh" },
  m7: { code: "m7", lead: "m7", name: "minor seventh" },
  m7b5: { code: "m7b5", lead: "m7♭5", name: "half-diminished seventh" },
  dim7: { code: "o7", lead: "°7", name: "diminished seventh" },
  mMaj7: { code: "m^7", lead: "m(maj7)", name: "minor-major seventh" },
  "6": { code: "6", lead: "6", name: "sixth" },
  m6: { code: "m6", lead: "m6", name: "minor sixth" },
  "69": { code: "69", lead: "6/9", name: "six-nine" },
  add9: { code: "add9", lead: "add9", name: "added ninth" },
  "9": { code: "9", lead: "9", name: "ninth" },
  maj9: { code: "^9", lead: "maj9", name: "major ninth" },
  m9: { code: "m9", lead: "m9", name: "minor ninth" },
  m11: { code: "m11", lead: "m11", name: "minor eleventh" },
  "7b9": { code: "7b9", lead: "7♭9", name: "dominant seventh flat nine" },
  "7#9": { code: "7#9", lead: "7♯9", name: "dominant seventh sharp nine" },
  "7#11": { code: "7#11", lead: "7♯11", name: "dominant seventh sharp eleven" },
  "7b13": { code: "7b13", lead: "7♭13", name: "dominant seventh flat thirteen" },
  "13": { code: "13", lead: "13", name: "thirteenth" },
  "7alt": { code: "7alt", lead: "7alt", name: "altered dominant" },
  "maj7#11": { code: "^7#11", lead: "maj7♯11", name: "major seventh sharp eleven" },
  "7sus4": { code: "7sus", lead: "7sus4", name: "dominant sus" },
};
/** Pitch classes of a chord, root first. */
export function chordPcs(rootPc: number, quality: ChordQuality): number[] {
  return CHORD_TONES[quality].semis.map((s) => mod(rootPc + s, 12));
}
/** Spelled chord tones by stacked letters: C dim7 is C E♭ G♭ B𝄫 ("Bbb"). */
export function spellChord(root: string, quality: ChordQuality): string[] {
  const r = parsePc(root);
  const { semis, degrees } = CHORD_TONES[quality];
  return semis.map((s, i) => {
    const letter = LETTERS[mod(letterIndex(r.letter) + (degrees[i] as number) - 1, 7)] as string;
    const alt = mod(r.pc + s - (LETTER_PC[letter] as number) + 6, 12) - 6;
    return pcName(letter, alt);
  });
}
/** Code spelling of a chord symbol ("F#m7b5") and its lead-sheet display ("F♯m7♭5"). */
export function chordCode(root: string, quality: ChordQuality): string {
  return `${root}${CHORD_SUFFIX[quality].code}`;
}
export function chordDisplay(root: string, quality: ChordQuality): string {
  return `${root.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭")}${CHORD_SUFFIX[quality].lead}`;
}

// --- Roman numerals -----------------------------------------------------------------------------

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
const MINORISH: readonly ChordQuality[] = ["min", "dim", "m7", "m7b5", "dim7", "mMaj7", "m6", "m9", "m11"];
const RN_SUFFIX: Readonly<Partial<Record<ChordQuality, string>>> = {
  maj: "",
  min: "",
  dim: "o",
  aug: "+",
  maj7: "maj7",
  "7": "7",
  m7: "7",
  m7b5: "ø7",
  dim7: "o7",
};
const INVERSION_FIGURE = {
  triad: ["", "6", "64"],
  seventh: ["7", "65", "43", "42"],
} as const;
/** One chord of a progression, relative to a key. `degree` is relative to the major scale ("b7" for ♭VII). */
export interface RnChord {
  degree: Degree;
  quality: ChordQuality;
  inversion?: 0 | 1 | 2 | 3;
  /** Applied chord: the degree it tonicizes ("5" for V/V). `degree` is then relative to that target. */
  of?: Degree;
}
/**
 * The Roman numeral in Oak's ASCII dialect: case = quality, `o` diminished, `ø7` half-diminished, `+`
 * augmented, figures 6 64 7 65 43 42, `b`/`#` prefixes, `/` for applied chords ("V7/V").
 */
export function formatRn(chord: RnChord): string {
  const { num, alt } = parseDegree(chord.degree);
  const base = NUMERALS[num - 1] as string;
  const numeral = MINORISH.includes(chord.quality) ? base.toLowerCase() : base;
  const prefix = alt < 0 ? "b" : alt > 0 ? "#" : "";
  const suffix = RN_SUFFIX[chord.quality];
  if (suffix === undefined) throw new RangeError(`no Roman-numeral suffix for quality ${chord.quality}`);
  const seventh = CHORD_TONES[chord.quality].semis.length === 4;
  const inv = chord.inversion ?? 0;
  let text: string;
  if (seventh) {
    const figure = INVERSION_FIGURE.seventh[inv] as string;
    text = `${prefix}${numeral}${suffix.replace(/7$/, "")}${figure}`;
  } else {
    text = `${prefix}${numeral}${suffix}${(INVERSION_FIGURE.triad as readonly string[])[inv] ?? ""}`;
  }
  return chord.of ? `${text}/${formatRn({ degree: chord.of, quality: degreeTriad(chord.of) })}` : text;
}
/** The diatonic triad quality on a degree of the major scale (targets of applied chords). */
function degreeTriad(degree: Degree): ChordQuality {
  const { num, alt } = parseDegree(degree);
  if (alt !== 0) return "maj";
  return (["maj", "min", "min", "maj", "maj", "min", "dim"] as const)[num - 1] as ChordQuality;
}
/** Root pitch class of a progression chord in a key. */
export function rnRootPc(chord: RnChord, key: KeySpec): number {
  const base = parsePc(key.tonic).pc + (chord.of ? degreeSemis(chord.of) : 0);
  return mod(base + degreeSemis(chord.degree), 12);
}
/** Spelled root of a progression chord in a key. */
export function rnRoot(chord: RnChord, key: KeySpec): string {
  return spellMidi(60 + rnRootPc(chord, key), key).pc;
}
/** The diatonic triad (or seventh) on scale degree 1 to 7 of a seven-note mode. */
export function diatonicChord(key: KeySpec, degreeNo: number, seventh = false): RnChord {
  const steps = MODE_STEPS[key.mode];
  if (steps.length !== 7) throw new RangeError("diatonic chords need a seven-note scale");
  const at = (i: number): number => (steps[mod(i, 7)] as number) + 12 * Math.floor(i / 7);
  const root = at(degreeNo - 1);
  const ivs = [at(degreeNo + 1) - root, at(degreeNo + 3) - root, at(degreeNo + 5) - root];
  const quality = qualityOfIntervals(seventh ? [0, ...ivs] : [0, ivs[0] as number, ivs[1] as number]);
  if (!quality) throw new RangeError(`no quality for degree ${degreeNo} of ${key.mode}`);
  return { degree: DEGREE_BY_SEMITONE[root % 12] as Degree, quality };
}
export function qualityOfIntervals(intervals: readonly number[]): ChordQuality | null {
  const want = intervals.join(",");
  for (const q of Object.keys(CHORD_TONES) as ChordQuality[])
    if (CHORD_TONES[q].semis.join(",") === want) return q;
  return null;
}
