// On-screen keyboard math (ux §3.4 "Keyboard"): two octaves centred on the key, white/black key
// geometry, and the typing map relative to the tonic (A = 1, W = ♭2 … K = 1′). Pure.
import type { KeySpec } from "@oak/content-kit";
import { pcOf } from "@oak/theory";

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
export function isBlack(midi: number): boolean {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

/**
 * Two octaves (25 keys, both ends on a white key when possible): from the tonic below the content's
 * centre (C3 tonic octave when nothing sounds), shifted down when the content does not fit.
 */
export function keyboardRange(key: KeySpec | null, midis: readonly number[]): { lo: number; hi: number } {
  const tonicPc = key ? pcOf(key.tonic) : 0;
  const centre = midis.length ? (Math.min(...midis) + Math.max(...midis)) / 2 : 60;
  // The tonic at or below centre − 6, so the two octaves are roughly centred on the content.
  let lo = Math.floor((centre - 12 - tonicPc) / 12) * 12 + tonicPc;
  if (centre - lo > 18) lo += 12;
  if (midis.length && Math.min(...midis) < lo) lo -= 12;
  // White-key edges read better: step down to a white key.
  while (isBlack(lo)) lo--;
  let hi = lo + 24;
  while (isBlack(hi)) hi++;
  return { lo, hi };
}

export interface KeyRect {
  midi: number;
  black: boolean;
  x: number;
  w: number;
}

/** Key rectangles for a width: white keys tile the width, black keys sit on the boundaries. */
export function keyRects(lo: number, hi: number, width: number): KeyRect[] {
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const ww = width / Math.max(1, whites.length);
  const out: KeyRect[] = whites.map((m, i) => ({ midi: m, black: false, x: i * ww, w: ww }));
  const bw = ww * 0.6;
  for (let m = lo; m <= hi; m++) {
    if (!isBlack(m)) continue;
    const left = whites.indexOf(m - 1);
    if (left < 0) continue;
    out.push({ midi: m, black: true, x: (left + 1) * ww - bw / 2, w: bw });
  }
  return out;
}

/** Computer keys → semitones above the tonic (ux §3.4: A=1, W=♭2, S=2 … K=1′). */
export const TYPING_MAP: Readonly<Record<string, number>> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

/** MIDI for a typed key, relative to the tonic in `octave` (4 = the tonic above middle C). */
export function typedMidi(letter: string, key: KeySpec | null, octave: number): number | null {
  const semis = TYPING_MAP[letter.toLowerCase()];
  if (semis === undefined) return null;
  const tonicPc = key ? pcOf(key.tonic) : 0;
  return (octave + 1) * 12 + tonicPc + semis;
}
