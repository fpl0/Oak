// The circle of fifths as data (U03.L07, wave3 task): twelve positions clockwise from C at the top, majors outside
// and relative minors inside, with the enharmonic majors at the bottom (C♭ beside B, G♭ beside F♯, C♯ beside D♭). Key signatures as
// the staff writes them: the accidentals in order (F C G D A E B, or B E A D G C F) and where each one sits on a
// treble or bass staff. Pure: `bun test`.
import type { KeySpec } from "@oak/content-kit";
import { FLAT_ORDER, fifthsOfKey, keyFromFifths, normalizeText, SHARP_ORDER, signatureOf } from "@oak/theory";

export interface CircleKey {
  /** −7 … 7. */
  fifths: number;
  key: KeySpec;
  /** 0 … 11 clockwise from the top. */
  position: number;
  /** Second spelling at a position (C♭ beside B), drawn beside the first. */
  enharmonic: boolean;
  /** "F♯", "Am", "e♭m"… what the circle prints. */
  label: string;
  /** "F sharp major". */
  spoken: string;
  /** The canonical answer text (`normalizeText("key")`): "F# major". */
  text: string;
}

const glyph = (tonic: string) => tonic.replace(/#/g, "♯").replace(/b/g, "♭");
const spokenTonic = (tonic: string) => tonic.replace(/#/, " sharp").replace(/b$/, " flat");

function entry(fifths: number, mode: "major" | "minor", position: number, enharmonic: boolean): CircleKey {
  const key = keyFromFifths(fifths, mode);
  return {
    fifths,
    key,
    position,
    enharmonic,
    label: mode === "major" ? glyph(key.tonic) : `${glyph(key.tonic)}m`,
    spoken: `${spokenTonic(key.tonic)} ${mode}`,
    text: `${key.tonic} ${mode}`,
  };
}

/** Ring order (clockwise), enharmonic spellings right after the common one. */
const ORDER: [fifths: number, position: number, enharmonic: boolean][] = [
  [0, 0, false],
  [1, 1, false],
  [2, 2, false],
  [3, 3, false],
  [4, 4, false],
  [5, 5, false],
  [-7, 5, true],
  [6, 6, false],
  [-6, 6, true],
  [-5, 7, false],
  [7, 7, true],
  [-4, 8, false],
  [-3, 9, false],
  [-2, 10, false],
  [-1, 11, false],
];

export const CIRCLE_MAJORS: readonly CircleKey[] = ORDER.map(([f, p, e]) => entry(f, "major", p, e));
/** The inner ring: one spelling per position (G♯m, E♭m, B♭m at the bottom), as most circles print it. */
export const CIRCLE_MINORS: readonly CircleKey[] = (
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [-6, 6],
    [-5, 7],
    [-4, 8],
    [-3, 9],
    [-2, 10],
    [-1, 11],
  ] as const
).map(([f, p]) => entry(f, "minor", p, false));

/** The circle entry for a key text or spec (any spelling Oak reads), or `null`. */
export function circleKeyOf(input: string | KeySpec | null | undefined): CircleKey | null {
  if (!input) return null;
  const text = typeof input === "string" ? normalizeText("key", input) : `${input.tonic} ${input.mode}`;
  if (!text) return null;
  return [...CIRCLE_MAJORS, ...CIRCLE_MINORS].find((k) => k.text === text) ?? null;
}

/** Angle of a position in degrees, 0 = top, clockwise. */
export function positionAngle(position: number): number {
  return position * 30;
}

/** x, y of a position on a ring of radius `r` around (cx, cy); enharmonic spellings sit a little clockwise. */
export function ringPoint(
  position: number,
  r: number,
  c: { x: number; y: number },
  offsetDeg = 0,
): { x: number; y: number } {
  const a = ((positionAngle(position) + offsetDeg - 90) * Math.PI) / 180;
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
}

// --- key signatures as written ---------------------------------------------------------------------

export type SigAccidental = (typeof SHARP_ORDER)[number] | (typeof FLAT_ORDER)[number];

/** The accidentals of a value ("F# C#"), in the order placed; unreadable tokens are dropped. */
export function parseSignatureValue(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/♯/g, "#").replace(/♭/g, "b"))
    .filter((t) => /^[A-G](#|b)$/.test(t));
}

export function signatureValue(accs: readonly string[]): string {
  return accs.join(" ");
}

/** The accidentals a key's signature writes, in order ("F# C#" for D major or B minor). */
export function signatureFor(key: KeySpec): string[] {
  const s = signatureOf(fifthsOfKey(key));
  return s.fifths >= 0 ? s.sharps : s.flats;
}

export interface SignatureReading {
  /** The placed accidentals are a key signature (as a set). */
  valid: boolean;
  /** …and in the written order. */
  inOrder: boolean;
  fifths: number | null;
  major: KeySpec | null;
  minor: KeySpec | null;
  /** What the read-back line says. */
  text: string;
}

/** What a placed signature reads as: "D major or B minor", or why it is not one. */
export function readSignature(accs: readonly string[]): SignatureReading {
  const none = { fifths: null, major: null, minor: null };
  if (accs.length === 0)
    return {
      valid: true,
      inOrder: true,
      fifths: 0,
      major: keyFromFifths(0),
      minor: keyFromFifths(0, "minor"),
      text: "No sharps or flats: C major or A minor.",
    };
  const sharps = accs.every((a) => a.endsWith("#"));
  const flats = accs.every((a) => a.endsWith("b"));
  if (!sharps && !flats)
    return {
      valid: false,
      inOrder: false,
      ...none,
      text: "A key signature has sharps or flats, never both.",
    };
  const order: readonly string[] = sharps ? SHARP_ORDER : FLAT_ORDER;
  const want = order.slice(0, accs.length);
  const set = new Set(accs);
  const valid = set.size === accs.length && want.every((a) => set.has(a));
  if (!valid)
    return {
      valid: false,
      inOrder: false,
      ...none,
      text: `Not a key signature: ${sharps ? "sharps" : "flats"} come in the order ${order.map(glyph).join(" ")}.`,
    };
  const fifths = sharps ? accs.length : -accs.length;
  const major = keyFromFifths(fifths);
  const minor = keyFromFifths(fifths, "minor");
  const inOrder = accs.every((a, i) => a === want[i]);
  const names = `${glyph(major.tonic)} major or ${glyph(minor.tonic)} minor`;
  return {
    valid,
    inOrder,
    fifths,
    major,
    minor,
    text: inOrder
      ? `Reads as ${names}.`
      : `The right ${sharps ? "sharps" : "flats"} for ${names}, but written out of order.`,
  };
}

/**
 * Where each accidental of a signature sits on the staff, as a diatonic number (C0 = 0): the standard
 * positions (treble sharps F5 C5 G5 D5 A4 E5 B4, flats B4 E5 A4 D5 G4 C5 F4; bass two octaves lower).
 */
const TREBLE_SHARPS: Record<string, number> = { F: 38, C: 35, G: 39, D: 36, A: 33, E: 37, B: 34 };
const TREBLE_FLATS: Record<string, number> = { B: 34, E: 37, A: 33, D: 36, G: 32, C: 35, F: 31 };
export function signatureDia(acc: string, clef: "treble" | "bass"): number {
  const table = acc.endsWith("#") ? TREBLE_SHARPS : TREBLE_FLATS;
  const dia = table[acc[0] as string] ?? 35;
  return clef === "treble" ? dia : dia - 14;
}

/** The letter of a staff position (the accidental placed there is that letter's). */
export function letterOfDia(dia: number): string {
  return "CDEFGAB"[((dia % 7) + 7) % 7] as string;
}

export { glyph as accidentalGlyph };
