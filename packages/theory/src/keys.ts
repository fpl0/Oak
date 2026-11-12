// Key context for labels and spelling (Wave 3 seam, docs/design/wave3.md §3.2): what the Workbench lenses,
// the staff, the drills and the grader need to say about one pitch in one key — its 1-based degree with
// chromatic alteration (b3, #4), its movable-do syllable, its spelled name — plus key signatures as
// sharps/flats in order, circle-of-fifths neighbours, and interval names between two notes.
// Built on scales.ts, intervals.ts and pitch.ts; nothing here spells by itself.
import type { Degree, KeySpec, ScaleMode } from "@oak/content-kit";
import { intervalBetween, parseInterval } from "./intervals.ts";
import {
  addFifths,
  fifthsOf,
  fromFifths,
  nameOf,
  parseDegreeLabel,
  parsePcName,
  spellDegree,
} from "./pitch.ts";
import {
  degreeOf,
  displayName,
  keyFromScaleCtx,
  keySignature,
  parallelKey,
  relativeKey,
  spellMidi,
} from "./scales.ts";
import { parseKeyText } from "./text.ts";

/** Sharps of a key signature, in signature order. */
export const SHARP_ORDER = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"] as const;
/** Flats of a key signature, in signature order. */
export const FLAT_ORDER = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"] as const;

/**
 * Anything that names a key: a `KeySpec`; a `.scale()` argument or `scaleCtx` ("C4:major", "D4 major");
 * key text ("Eb", "F#m", "A minor", "D dorian"); or a signature in fifths (−7 … 7: −3 = three flats),
 * read as major unless `mode` says otherwise.
 */
export type KeyInput = KeySpec | string | number;

/** The key of a signature: `keyFromFifths(-3)` = E♭ major, `keyFromFifths(-3, "minor")` = C minor. */
export function keyFromFifths(fifths: number, mode: "major" | "minor" = "major"): KeySpec {
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7)
    throw new RangeError(`@oak/theory: a key signature has −7 to 7 fifths, got ${fifths}`);
  return { tonic: nameOf(fromFifths(mode === "major" ? fifths : fifths + 3)), mode };
}

/** Any key input to a `KeySpec`, or `null` when it names no key Oak knows. */
export function keyOf(input: KeyInput, mode?: "major" | "minor"): KeySpec | null {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < -7 || input > 7) return null;
    return keyFromFifths(input, mode ?? "major");
  }
  if (typeof input === "object")
    return parsePcName(input.tonic) ? { tonic: input.tonic, mode: input.mode } : null;
  const text = input.trim();
  if (text === "") return null;
  // scaleCtx form first ("D4 major", "eb4 major"), then key text ("C4:major", "F#m", "A minor").
  return (/^[A-Ga-g](?:##|bb|#|b)?-?\d+\s/.test(text) ? keyFromScaleCtx(text) : null) ?? parseKeyText(text);
}

/** Fifths of a key's signature: +2 for D major and B minor, −3 for E♭ major and C minor, −2 for D dorian. */
export function fifthsOfKey(key: KeySpec): number {
  return keySignature(key).accidentals;
}

export interface SignatureInfo {
  /** −7 … 7. */
  fifths: number;
  /** Sharps in signature order (empty for flat keys). */
  sharps: string[];
  /** Flats in signature order (empty for sharp keys). */
  flats: string[];
  /** The major and the relative minor with this signature. */
  major: KeySpec;
  minor: KeySpec;
}

/** A key signature by fifths or by key: its sharps or flats in order, and the two keys that share it. */
export function signatureOf(keyOrFifths: KeySpec | number): SignatureInfo {
  const fifths = typeof keyOrFifths === "number" ? keyOrFifths : fifthsOfKey(keyOrFifths);
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7)
    throw new RangeError(`@oak/theory: a key signature has −7 to 7 fifths, got ${fifths}`);
  return {
    fifths,
    sharps: fifths > 0 ? SHARP_ORDER.slice(0, fifths) : [],
    flats: fifths < 0 ? FLAT_ORDER.slice(0, -fifths) : [],
    major: keyFromFifths(fifths, "major"),
    minor: keyFromFifths(fifths, "minor"),
  };
}

export interface PitchLabel {
  midi: number;
  /** 1-based degree relative to the major scale, with the alteration: "1", "b3", "#4". */
  degree: Degree;
  /** 1 … 7. */
  num: number;
  /** −1, 0, 1 (rarely ±2). */
  alt: number;
  /** True when the pitch is not in the key's own scale (b3 in major, #4 anywhere in major). */
  chromatic: boolean;
  /** Movable do, do-based minor: do re mi fa sol la ti; me le te ra fi … */
  syllable: string;
  /** Spelled in the key: "F#4", "Bb3". */
  name: string;
  /** Display form with Unicode accidentals: "F♯4". */
  display: string;
  /** Display degree: "♭3", "♯4", "5". */
  degreeDisplay: string;
}

/**
 * Labels a pitch in a key: degree (1-based, b3 / #4), syllable, spelled name. Chromatic notes are spelled
 * by the key's own convention (theory `spellMidi`); `direction` (1 up, −1 down) spells a passing chromatic
 * note by its melodic direction instead (♯4 rising, ♭5 falling) — the degree label follows the spelling.
 */
export function labelPitch(midi: number, key: KeySpec, opts: { direction?: 1 | -1 } = {}): PitchLabel {
  const spelled = spellMidi(midi, opts.direction ? { key, direction: opts.direction } : { key });
  const own = degreeOf(midi, key);
  // The degree follows the spelling: B♭ in C (descending) is b7, A♯ (ascending) is #6.
  const tonic = parsePcName(key.tonic);
  let degree = own.degree;
  let num = own.num;
  let alt = own.alt;
  if (tonic) {
    const letterNum = (((("CDEFGAB".indexOf(spelled.letter) - tonic.letter) % 7) + 7) % 7) + 1;
    if (letterNum !== own.num) {
      const naturalSemis = [0, 2, 4, 5, 7, 9, 11][letterNum - 1] as number;
      const a = ((((own.semitones - naturalSemis + 6) % 12) + 12) % 12) - 6;
      const label = `${a > 0 ? "#".repeat(a) : "b".repeat(-a)}${letterNum}`;
      if ((DEGREE_SET as Set<string>).has(label)) {
        degree = label as Degree;
        num = letterNum;
        alt = a;
      }
    }
  }
  const scaleOwn = isInScale(own.semitones, key);
  return {
    midi,
    degree,
    num,
    alt,
    chromatic: !scaleOwn,
    syllable: syllableFor(degree),
    name: spelled.name,
    display: displayName(spelled),
    degreeDisplay: degree.replace(/#/g, "♯").replace(/b/g, "♭"),
  };
}

const DEGREE_SET: ReadonlySet<string> = new Set([
  "1",
  "#1",
  "b2",
  "2",
  "#2",
  "b3",
  "3",
  "4",
  "#4",
  "b5",
  "5",
  "#5",
  "b6",
  "6",
  "#6",
  "b7",
  "7",
]);
const SYLLABLE: Record<string, string> = {
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
function syllableFor(d: Degree): string {
  return SYLLABLE[d] ?? "?";
}
const SCALE_SEMIS: Record<ScaleMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
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
function isInScale(semitones: number, key: KeySpec): boolean {
  return SCALE_SEMIS[key.mode].includes(((semitones % 12) + 12) % 12);
}

export interface FifthsNeighbours {
  key: KeySpec;
  /** −7 … 7. */
  fifths: number;
  /** One fifth up, same mode (G → D). Past 7 sharps or flats the enharmonic key is used (C♯ → A♭). */
  clockwise: KeySpec;
  /** One fifth down, same mode (G → C). */
  counterclockwise: KeySpec;
  relative: KeySpec;
  parallel: KeySpec;
}

function stepAround(key: KeySpec, by: 1 | -1): KeySpec {
  const t = parsePcName(key.tonic);
  if (!t) throw new RangeError(`@oak/theory: not a key tonic: "${key.tonic}"`);
  let next = addFifths(t, by);
  const sig = fifthsOf(next) + (fifthsOfKey(key) - fifthsOf(t));
  if (sig > 7 || sig < -7) next = fromFifths(fifthsOf(next) + (sig > 7 ? -12 : 12));
  return { tonic: nameOf(next), mode: key.mode };
}

/** A key's neighbours on the circle of fifths, and its relative and parallel keys. */
export function fifthsNeighbours(key: KeySpec): FifthsNeighbours {
  return {
    key,
    fifths: fifthsOfKey(key),
    clockwise: stepAround(key, 1),
    counterclockwise: stepAround(key, -1),
    relative: relativeKey(key),
    parallel: parallelKey(key),
  };
}

const LONG_QUALITY: Record<string, string> = {
  P: "perfect",
  M: "major",
  m: "minor",
  A: "augmented",
  d: "diminished",
  AA: "doubly augmented",
  dd: "doubly diminished",
};
const ORDINAL = [
  "",
  "unison",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "octave",
  "9th",
  "10th",
  "11th",
  "12th",
  "13th",
];

export interface IntervalInfo {
  /** Size in semitones, always ≥ 0. */
  semitones: number;
  /** Generic interval: the letter-name count, 1-based (C→E = 3, a "third"), compound kept (10). */
  generic: number;
  /** Specific interval name: "m3", "P5", "A4", "M10". */
  name: string;
  quality: "P" | "M" | "m" | "A" | "d" | "AA" | "dd";
  /** "minor 3rd", "perfect 5th", "augmented 4th", "octave". */
  long: string;
  /** A4 or d5 (six semitones), whatever the spelling. */
  tritone: boolean;
  compound: boolean;
  /** From the first note to the second. */
  direction: "up" | "down" | "unison";
  /** The two notes as spelled for the name, low to high. */
  low: string;
  high: string;
}

/**
 * The interval between two notes, generic and specific. Notes are MIDI numbers (spelled in `key`, C major
 * when absent: in-key intervals then read the way the key writes them) or spelled names with octaves
 * ("C4", "Eb4", spelling wins). Direction is reported, the name is always of the ascending interval.
 */
export function intervalOf(a: number | string, b: number | string, key: KeySpec | null = null): IntervalInfo {
  const spell = (x: number | string): { name: string; midi: number } => {
    if (typeof x === "number") {
      const p = spellMidi(x, { key });
      return { name: p.name, midi: x };
    }
    const m = /^([A-Ga-g](?:##|bb|#|b)?)(-?\d+)$/.exec(x.trim());
    if (!m) throw new RangeError(`@oak/theory: intervalOf needs MIDI or a note with octave, got "${x}"`);
    const s = parsePcName(m[1] as string);
    if (!s) throw new RangeError(`@oak/theory: not a note: "${x}"`);
    const midi = 12 * (Number(m[2]) + 1) + ([0, 2, 4, 5, 7, 9, 11][s.letter] as number) + s.alt;
    return { name: `${nameOf(s)}${m[2]}`, midi };
  };
  const x = spell(a);
  const y = spell(b);
  const direction = y.midi > x.midi ? "up" : y.midi < x.midi ? "down" : "unison";
  const [low, high] = direction === "down" ? [y, x] : [x, y];
  const name = intervalBetween(low.name, high.name);
  const parts = parseInterval(name);
  if (!parts) throw new RangeError(`@oak/theory: no interval name for ${low.name}–${high.name}`);
  const simple = parts.num > 8 ? ((parts.num - 1) % 7) + 1 : parts.num;
  const long =
    parts.num === 1 && parts.quality === "P"
      ? "unison"
      : parts.num === 8 && parts.quality === "P"
        ? "octave"
        : `${LONG_QUALITY[parts.quality]} ${ORDINAL[parts.num] ?? `${parts.num}th`}`;
  return {
    semitones: high.midi - low.midi,
    generic: parts.num,
    name,
    quality: parts.quality,
    long,
    tritone: (high.midi - low.midi) % 12 === 6 && (simple === 4 || simple === 5),
    compound: parts.num > 8,
    direction,
    low: low.name,
    high: high.name,
  };
}

// --- Strudel interval strings and intervals in a key ---------------------------------------------

/**
 * Strudel's (tonal's) interval string for an Oak interval name: number first, then quality, with a minus
 * for a descending interval — `M3` → `"3M"`, `m2` down → `"-2m"`, `P8` → `"8P"`. `.transpose("3M")` moves
 * every note up a major third and spells the result by the interval (`C` + `"5d"` = `G♭`, verified on
 * headless Strudel). A unison has no direction.
 */
export function strudelInterval(name: string, direction: "up" | "down" = "up"): string {
  const p = parseInterval(name);
  if (!p) throw new RangeError(`@oak/theory: not an interval: "${name}"`);
  const down = direction === "down" && !(p.num === 1 && p.quality === "P");
  return `${down ? "-" : ""}${p.num}${p.quality}`;
}

export interface StrudelIntervalInfo {
  /** As Strudel writes it: "3M", "-2m". */
  text: string;
  /** Oak's name of the ascending interval: "M3", "m2". */
  name: string;
  quality: IntervalInfo["quality"];
  generic: number;
  /** Signed: −1 for "-2m". */
  semitones: number;
  direction: "up" | "down" | "unison";
}

const STRUDEL_IVL = /^(-?)(\d{1,2})(P|M|m|A|d|AA|dd)$/;
const OAK_IVL = /^(-?)(P|M|m|A|d|AA|dd)(\d{1,2})$/;
/**
 * Reads an interval string the way `.transpose()` does: number first ("3M", "-2m", "8P") or quality first
 * ("M3", "-m2"); `null` for anything else (a plain number of semitones is not an interval name).
 */
export function parseStrudelInterval(text: string): StrudelIntervalInfo | null {
  const t = text.trim();
  const a = STRUDEL_IVL.exec(t);
  const b = a ? null : OAK_IVL.exec(t);
  if (!a && !b) return null;
  const sign = (a ?? b)?.[1] === "-" ? -1 : 1;
  const name = a ? `${a[3]}${a[2]}` : `${b?.[2]}${b?.[3]}`;
  const p = parseInterval(name);
  if (!p) return null;
  const unison = p.num === 1 && p.quality === "P";
  const direction = unison ? "unison" : sign < 0 ? "down" : "up";
  return {
    text: strudelInterval(name, direction === "down" ? "down" : "up"),
    name,
    quality: p.quality,
    generic: p.num,
    semitones: sign * p.semitones,
    direction,
  };
}

/**
 * The interval from one degree of a key to another (degrees 1-based and relative to the major scale, as
 * everywhere in Oak: "b3", "#4"), spelled in the key: 1 → 3 in C major is M3, 3 → 5 is m3, 7 → 4 (up) is
 * d5. `direction: "down"` takes the lower `to` (5 → 1 down is P5 descending); the same degree up is an
 * octave. Compound intervals are not produced: `to` is within the octave from `from`.
 */
export function intervalInKey(
  from: string,
  to: string,
  key: KeySpec,
  opts: { direction?: "up" | "down" } = {},
): IntervalInfo {
  const tonic = parsePcName(key.tonic);
  const a = parseDegreeLabel(from);
  const b = parseDegreeLabel(to);
  if (!tonic || !a || !b)
    throw new RangeError(`@oak/theory: intervalInKey("${from}", "${to}", ${key.tonic} ${key.mode})`);
  const sa = spellDegree(tonic, a.num, a.alt);
  const sb = spellDegree(tonic, b.num, b.alt);
  // `to`'s letter sits 1–7 letter steps above `from`'s (the same letter is the octave above).
  const steps = (((sb.letter - sa.letter) % 7) + 7) % 7 || 7;
  const upOct = 4 + Math.floor((sa.letter + steps) / 7);
  const toOct = opts.direction === "down" ? upOct - 1 : upOct;
  return intervalOf(`${nameOf(sa)}4`, `${nameOf(sb)}${toOct}`, key);
}
