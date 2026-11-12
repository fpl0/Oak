// Interval answers (U04, contracts §5.4 `text` with `normalize: "interval"`): the generic number first (a 3rd), then
// the quality the number allows (P for 1 4 5 8; M or m for 2 3 6 7; A and d for both), composed into the name the
// grader reads ("m3", "P5"). Forgiving text entry reads through the same normaliser (`@oak/theory`). Pure.
import { normalizeText, parseInterval } from "@oak/theory";

export type IntervalQuality = "P" | "M" | "m" | "A" | "d";

export const INTERVAL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const NUMBER_WORD: Record<number, string> = {
  1: "unison",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "octave",
};
export const QUALITY_WORD: Record<IntervalQuality, string> = {
  P: "perfect",
  M: "major",
  m: "minor",
  A: "augmented",
  d: "diminished",
};

export function numberWord(n: number): string {
  return NUMBER_WORD[n] ?? `${n}th`;
}

/** Perfect numbers take P, A, d; the others M, m, A, d. A diminished unison is not offered. */
export function qualitiesFor(num: number): IntervalQuality[] {
  const simple = ((num - 1) % 7) + 1;
  if (simple === 1 && num === 1) return ["P", "A"];
  return [1, 4, 5].includes(simple) ? ["P", "A", "d"] : ["M", "m", "A", "d"];
}

/** The name the grader reads, or `null` when the quality does not go with the number (M5, P3). */
export function composeInterval(num: number, q: IntervalQuality): string | null {
  const name = `${q}${num}`;
  return parseInterval(name) && qualitiesFor(num).includes(q) ? name : null;
}

/** A typed or composed answer as its parts; `TT` (tritone) has no single number. */
export function splitInterval(
  text: string,
): { name: string; num: number | null; q: IntervalQuality | null } | null {
  let name: string | null = null;
  try {
    name = normalizeText("interval", text);
  } catch {
    name = null;
  }
  if (!name) return null;
  if (name === "TT") return { name, num: null, q: null };
  const p = parseInterval(name);
  if (!p) return null;
  return { name, num: p.num, q: p.quality as IntervalQuality };
}

/** The key for a quality: `p` perfect, `M` (Shift+M) major, `m` minor, `a` augmented, `d` diminished. */
export function qualityForKey(key: string): IntervalQuality | null {
  if (key === "M") return "M";
  if (key === "m") return "m";
  const k = key.toLowerCase();
  if (k === "p") return "P";
  if (k === "a") return "A";
  if (k === "d") return "d";
  return null;
}
