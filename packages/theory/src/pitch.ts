// Spelled-pitch arithmetic on the line of fifths. Everything in @oak/theory that spells a note goes
// through here, so a letter appears once per scale and enharmonics never leak in from MIDI.
import type { Pc } from "./types.ts";

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];
/** Semitones of each natural letter above C. */
export const LETTER_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;
/** Position of each letter (C D E F G A B) on the line of fifths, C = 0. */
const LETTER_FIFTHS = [0, 2, 4, -1, 1, 3, 5] as const;
const FIFTHS_ORDER = "FCGDAEB";

export const mod = (n: number, m: number): number => ((n % m) + m) % m;
export const pcOfNumber = (n: number): Pc => mod(Math.round(n), 12) as Pc;

/** A spelled pitch class: letter index (0 = C) and alteration in semitones. */
export interface Spelled {
  letter: number;
  alt: number;
}

export function letterIndex(letter: string): number {
  return LETTERS.indexOf(letter.toUpperCase() as Letter);
}
export function fifthsOf(s: Spelled): number {
  return (LETTER_FIFTHS[s.letter] as number) + 7 * s.alt;
}
export function fromFifths(f: number): Spelled {
  const k = f + 1;
  const letter = letterIndex(FIFTHS_ORDER[mod(k, 7)] as string);
  return { letter, alt: Math.floor(k / 7) };
}
export function pcOfSpelled(s: Spelled): Pc {
  return mod((LETTER_SEMIS[s.letter] as number) + s.alt, 12) as Pc;
}
export function accidentalText(alt: number, unicode = false): string {
  if (alt > 0) return (unicode ? "♯" : "#").repeat(alt);
  if (alt < 0) return (unicode ? "♭" : "b").repeat(-alt);
  return "";
}
/** "Eb", "F#", "C"; with `unicode`, "E♭". */
export function nameOf(s: Spelled, unicode = false): string {
  return `${LETTERS[s.letter]}${accidentalText(s.alt, unicode)}`;
}
/** Transposes a spelled pitch class by a number of fifths (7 = augmented unison, −7 = flat). */
export function addFifths(s: Spelled, f: number): Spelled {
  return fromFifths(fifthsOf(s) + f);
}

const ACC_RE = "(##|bb|#|b|x|♯♯|♭♭|♯|♭|𝄪|𝄫)?";
const PC_RE = new RegExp(`^([A-Ga-g])${ACC_RE}$`);
function accAlt(acc: string): number {
  switch (acc) {
    case "#":
    case "♯":
      return 1;
    case "##":
    case "♯♯":
    case "x":
    case "𝄪":
      return 2;
    case "b":
    case "♭":
      return -1;
    case "bb":
    case "♭♭":
    case "𝄫":
      return -2;
    default:
      return 0;
  }
}
/** Parses a spelled pitch class written with `#`/`b` or Unicode accidentals ("Eb", "f#", "B♭"). */
export function parsePcName(text: string): Spelled | null {
  const m = PC_RE.exec(text.trim());
  if (!m) return null;
  return { letter: letterIndex(m[1] as string), alt: accAlt(m[2] ?? "") };
}
export function parsePcNameOrThrow(text: string): Spelled {
  const s = parsePcName(text);
  if (!s) throw new RangeError(`@oak/theory: not a pitch-class name: "${text}"`);
  return s;
}

// --- degrees relative to the major scale ---------------------------------------------------------

/** Fifths above the tonic of each major-scale degree 1–7. */
const DEGREE_FIFTHS = [0, 2, 4, -1, 1, 3, 5] as const;
/** Semitones above the tonic of each major-scale degree 1–7. */
export const DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;

export interface DegreeParts {
  /** 1–7 (compound degrees 9, 11, 13 fold to 2, 4, 6). */
  num: number;
  alt: number;
  /** The written number (9 stays 9), for chord tones. */
  written: number;
}
const DEGREE_RE = /^(bb|b|##|#|♭♭|♭|♯♯|♯)?(\d{1,2})$/;
export function parseDegreeLabel(text: string): DegreeParts | null {
  const m = DEGREE_RE.exec(text.trim());
  if (!m) return null;
  const written = Number(m[2]);
  if (written < 1 || written > 15) return null;
  return { num: ((written - 1) % 7) + 1, alt: accAlt(m[1] ?? ""), written };
}
export function degreeLabel(num: number, alt: number): string {
  return `${accidentalText(alt)}${num}`;
}
/** Fifths of a degree above a tonic: tonic + degree. */
export function degreeFifths(num: number, alt: number): number {
  return (DEGREE_FIFTHS[num - 1] as number) + 7 * alt;
}
export function degreeSemis(num: number, alt: number): number {
  return (DEGREE_SEMIS[num - 1] as number) + alt;
}
/** Spells a degree above a tonic: ("Eb", 3, −1) → Gb. */
export function spellDegree(tonic: Spelled, num: number, alt: number): Spelled {
  return addFifths(tonic, degreeFifths(num, alt));
}

// --- absolute pitch --------------------------------------------------------------------------------

/** MIDI of a spelled pitch in an octave (scientific: C4 = 60, B#3 = 60, Cb4 = 59). */
export function midiOfSpelled(s: Spelled, oct: number): number {
  return 12 * (oct + 1) + (LETTER_SEMIS[s.letter] as number) + s.alt;
}
/** The octave number a spelled pitch class has when it sounds as `midi`. */
export function octaveFor(s: Spelled, midi: number): number {
  return Math.floor((midi - s.alt - (LETTER_SEMIS[s.letter] as number)) / 12) - 1;
}
