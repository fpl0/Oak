// The scale builder's logic (wave5.md §11, `scale-builder`): degrees spelled above a tonic (♭3 of A is C, ♭5 of C is
// G♭), the pad's default chromatic palette, toggling a degree or a key in or out of the scale, what the built
// scale plays, and the degree each key is above the tonic. The minors are do-based (1 is home; ♭3 ♭6 ♭7 sing me
// le te; raised 6 and 7 are la and ti). Pure: tested with `bun test`.
import type { Degree } from "@oak/api";
import { DEGREE_SYLLABLES } from "@oak/content-kit";
import { keyName, midiRange } from "./normalize.ts";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;
/** Semitones above the tonic of each major-scale degree 1–7. */
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** A tonic's letter index and pitch class ("Bb" → B, 10; "F#" → F, 6), or null. */
export function parseTonic(tonic: string): { letter: number; pc: number } | null {
  const m = /^([A-Ga-g])([#♯]{0,2}|[b♭]{0,2})$/.exec(tonic.trim());
  if (!m) return null;
  const letter = LETTERS.indexOf((m[1] as string).toUpperCase() as (typeof LETTERS)[number]);
  const acc = m[2] ?? "";
  const alt = acc.length * (acc.startsWith("#") || acc.startsWith("♯") ? 1 : -1);
  return { letter, pc: mod12((LETTER_PC[letter] as number) + alt) };
}

/** A degree's number and alteration ("b3" → 3, −1). */
export function degreeParts(d: string): { num: number; alt: number } | null {
  const m = /^(b|#|♭|♯)?([1-7])$/.exec(d.trim());
  if (!m) return null;
  return { num: Number(m[2]), alt: m[1] === "b" || m[1] === "♭" ? -1 : m[1] ? 1 : 0 };
}

/** Semitones of a degree above the tonic (0–11). */
export function degreeSemis(d: string): number {
  const p = degreeParts(d);
  if (!p) return 0;
  return mod12((MAJOR_SEMIS[p.num - 1] as number) + p.alt);
}

/**
 * A degree spelled above a tonic, by letter: the n-th letter from the tonic's, with the accidental the interval
 * needs (A + ♭3 = C, C + ♭5 = G♭, F♯ + 7 = E♯). ASCII accidentals ("Bb"), so the result is a code-spelled name.
 */
export function spellDegreeName(tonic: string, d: string): string | null {
  const t = parseTonic(tonic);
  const p = degreeParts(d);
  if (!t || !p) return null;
  const letter = (t.letter + p.num - 1) % 7;
  const want = mod12(t.pc + (MAJOR_SEMIS[p.num - 1] as number) + p.alt);
  let acc = want - (LETTER_PC[letter] as number);
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  if (Math.abs(acc) > 2) return null;
  return `${LETTERS[letter]}${acc > 0 ? "#".repeat(acc) : "b".repeat(-acc)}`;
}

/** "Bb" → "B♭" for display. */
export function nameDisplay(name: string): string {
  return `${name.slice(0, 1)}${name.slice(1).replace(/#/g, "♯").replace(/b/g, "♭")}`;
}

/**
 * The pad's palette when the content gives none: every semitone above the tonic once, spelled the way the course
 * names the scales Oak teaches (♭3 ♭6 ♭7 of the minors, ♭5 the blue note, ♭2 rather than ♯1).
 */
export const CHROMATIC_PALETTE: readonly Degree[] = [
  "1",
  "b2",
  "2",
  "b3",
  "3",
  "4",
  "b5",
  "5",
  "b6",
  "6",
  "b7",
  "7",
];

/** The degree a semitone count names on the default palette (6 → ♭5). */
export function degreeOfSemis(semis: number): Degree {
  return CHROMATIC_PALETTE[mod12(semis)] as Degree;
}

/** The degree a key is above the tonic, on the default palette's spelling. */
export function degreeOfMidi(midi: number, tonicPc: number): Degree {
  return degreeOfSemis(midi - tonicPc);
}

/** The do-based syllable of a degree (me, le, te in minor; se for the blue ♭5). */
export function syllableOfDegree(d: Degree): string {
  return DEGREE_SYLLABLES[d] ?? "";
}

/** Degrees in scale order: by semitones above the tonic, each once. */
export function sortDegrees(ds: readonly string[]): string[] {
  return [...new Set(ds)].sort((a, b) => degreeSemis(a) - degreeSemis(b));
}

/** Adds a degree to the scale, or takes it out; the result stays in scale order. */
export function toggleDegree(value: readonly (number | string)[], d: string): string[] {
  const ds = value.filter((x): x is string => typeof x === "string");
  return ds.includes(d) ? ds.filter((x) => x !== d) : sortDegrees([...ds, d]);
}

/** Adds a key to the scale, or takes it out; low to high. */
export function toggleMidi(value: readonly (number | string)[], m: number): number[] {
  const ms = value.filter((x): x is number => typeof x === "number");
  return ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].sort((a, b) => a - b);
}

/** The tonic's MIDI note from middle C up (C4–B4), where the pad plays its degrees. */
export function tonicMidi(tonic: string, from = 60): number {
  const t = parseTonic(tonic);
  const pc = t?.pc ?? 0;
  return from + mod12(pc - mod12(from));
}

/** The keyboard's span: the spec's range, else the tonic in octave 4 to the tonic an octave up. */
export function builderRange(spec: {
  tonic: string;
  range?: [string, string] | undefined;
}): [number, number] {
  if (spec.range) return midiRange(spec.range);
  const lo = tonicMidi(spec.tonic);
  return [lo, lo + 12];
}

/**
 * A key's name spelled as the degree it is above the tonic (in G: B♭ for ♭3, D♭ for ♭5), with its octave, so a
 * minor or blues scale reads in its own letters instead of the keyboard's sharps.
 */
export function keyInScale(midi: number, tonic: string): string {
  const t = parseTonic(tonic);
  const name = t ? spellDegreeName(tonic, degreeOfMidi(midi, t.pc)) : null;
  if (!name) return keyName(midi, "sharp");
  // The octave of the written letter (B♯3 sounds as C4): from the letter's own pitch class.
  const letterPc = LETTER_PC[LETTERS.indexOf(name[0] as (typeof LETTERS)[number])] as number;
  const alt = name.length - 1;
  const signed = name.includes("#") ? alt : -alt;
  const octave = Math.floor((midi - letterPc - signed) / 12) - 1;
  return `${nameDisplay(name)}${octave}`;
}

/**
 * What "Play the scale" plays: the notes as built, low to high, then home an octave up when the scale does not
 * already end there, then back down. Degrees play above the tonic in octave 4; keys play as picked.
 */
export function scaleRun(value: readonly (number | string)[], tonic: string): number[] {
  const t = tonicMidi(tonic);
  const ms = value
    .map((x) => (typeof x === "number" ? x : t + degreeSemis(x)))
    .sort((a, b) => a - b)
    .filter((m, i, a) => i === 0 || a[i - 1] !== m);
  if (ms.length === 0) return [];
  const low = ms[0] as number;
  const top = ms.at(-1) as number;
  const tonicPc = parseTonic(tonic)?.pc ?? 0;
  const up = mod12(low) === tonicPc && top - low < 12 ? [...ms, low + 12] : ms;
  return [...up, ...up.slice(0, -1).reverse()];
}

/** The degrees a value holds, whatever its input: keys are read against the tonic. */
export function valueDegrees(value: readonly (number | string)[], tonic: string): Degree[] {
  const pc = parseTonic(tonic)?.pc ?? 0;
  return sortDegrees(
    value.map((x) => (typeof x === "number" ? degreeOfMidi(x, pc) : (x as Degree))),
  ) as Degree[];
}
