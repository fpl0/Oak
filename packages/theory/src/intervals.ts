// Interval names from spelled notes: "m3", "P5", "A4", "M10". Quality letters: P M m A d (AA dd for doubly).
import { LETTER_SEMIS, letterIndex, mod, parsePcName, type Spelled } from "./pitch.ts";

const PERFECT = new Set([1, 4, 5]);
const INTERVAL_RE = /^(P|M|m|A|d|AA|dd)(\d{1,2})$/;

export interface IntervalParts {
  quality: "P" | "M" | "m" | "A" | "d" | "AA" | "dd";
  /** 1-based interval number: 1 = unison, 8 = octave, 10 = tenth. */
  num: number;
  semitones: number;
}

function refSemis(num: number): number {
  const simple = (num - 1) % 7;
  return (LETTER_SEMIS[simple] as number) + 12 * Math.floor((num - 1) / 7);
}

/** Quality letter for a number and a size in semitones, or `null` when it would need more than two A's or d's. */
export function intervalName(num: number, semitones: number): string | null {
  if (num < 1) return null;
  const simple = ((num - 1) % 7) + 1;
  const diff = semitones - refSemis(num);
  let q: string | undefined;
  if (PERFECT.has(simple)) q = { [-2]: "dd", [-1]: "d", 0: "P", 1: "A", 2: "AA" }[diff];
  else q = { [-3]: "dd", [-2]: "d", [-1]: "m", 0: "M", 1: "A", 2: "AA" }[diff];
  return q ? `${q}${num}` : null;
}

export function parseInterval(text: string): IntervalParts | null {
  const m = INTERVAL_RE.exec(text.trim());
  if (!m) return null;
  const quality = m[1] as IntervalParts["quality"];
  const num = Number(m[2]);
  if (num < 1) return null;
  const simple = ((num - 1) % 7) + 1;
  const perfect = PERFECT.has(simple);
  if (perfect && (quality === "M" || quality === "m")) return null;
  if (!perfect && quality === "P") return null;
  const offs = perfect ? { dd: -2, d: -1, P: 0, A: 1, AA: 2 } : { dd: -3, d: -2, m: -1, M: 0, A: 1, AA: 2 };
  const off = (offs as Record<string, number>)[quality];
  if (off === undefined) return null;
  return { quality, num, semitones: refSemis(num) + off };
}

/** Semitones of an interval name ("m3" → 3, "P8" → 12, "A4" → 6). Throws on an invalid name. */
export function intervalSemitones(name: string): number {
  const p = parseInterval(name);
  if (!p) throw new RangeError(`@oak/theory: not an interval: "${name}"`);
  return p.semitones;
}

interface NoteLike {
  s: Spelled;
  oct: number | null;
}
const NOTE_RE = /^([A-Ga-g])(##|bb|#|b|x|♯|♭|𝄪|𝄫|s|f|ss|ff)?(-?\d+)?$/;
function parseLoose(text: string): NoteLike | null {
  const m = NOTE_RE.exec(text.trim());
  if (!m) return null;
  const acc = (m[2] ?? "").replace(/s/g, "#").replace(/f/g, "b");
  const s = parsePcName(`${m[1]}${acc}`);
  if (!s) return null;
  return { s, oct: m[3] === undefined ? null : Number(m[3]) };
}

/**
 * Interval name between two spelled notes: "m3", "P5", "A4". With octaves on both ("C4", "E5") the interval
 * is compound ("M10") and its direction is ignored; without, `high` is taken as the nearest note at or above `low`.
 */
export function intervalBetween(low: string, high: string): string {
  const a = parseLoose(low);
  const b = parseLoose(high);
  if (!a || !b) throw new RangeError(`@oak/theory: intervalBetween("${low}", "${high}"): not note names`);
  let steps: number;
  let semis: number;
  const semisOf = (n: NoteLike) => (LETTER_SEMIS[n.s.letter] as number) + n.s.alt;
  if (a.oct !== null && b.oct !== null) {
    let lo = a;
    let hi = b;
    const abs = (n: NoteLike) => 12 * (n.oct as number) + semisOf(n);
    const pos = (n: NoteLike) => 7 * (n.oct as number) + n.s.letter;
    if (pos(b) < pos(a) || (pos(b) === pos(a) && abs(b) < abs(a))) {
      lo = b;
      hi = a;
    }
    steps = pos(hi) - pos(lo);
    semis = abs(hi) - abs(lo);
  } else {
    steps = mod(b.s.letter - a.s.letter, 7);
    semis = (LETTER_SEMIS[b.s.letter] as number) - (LETTER_SEMIS[a.s.letter] as number);
    if (b.s.letter < a.s.letter) semis += 12;
    semis += b.s.alt - a.s.alt;
    // Same letter, lower pitch (C♯ → C): the note above is a diminished octave, not a "d1".
    if (steps === 0 && semis < 0) {
      steps = 7;
      semis += 12;
    }
  }
  const name = intervalName(steps + 1, semis);
  if (!name) throw new RangeError(`@oak/theory: intervalBetween("${low}", "${high}"): no interval name`);
  return name;
}

/** Inverts within the octave: m3 → M6, P5 → P4, A4 → d5, P1 → P8, P8 → P1. Compound intervals invert their simple part. */
export function invertInterval(interval: string): string {
  const p = parseInterval(interval);
  if (!p) throw new RangeError(`@oak/theory: not an interval: "${interval}"`);
  let simple = ((p.num - 1) % 7) + 1;
  if (p.num === 8) simple = 8;
  const inv = simple === 8 ? 1 : 9 - simple;
  const q = { P: "P", M: "m", m: "M", A: "d", d: "A", AA: "dd", dd: "AA" }[p.quality];
  return `${q}${inv}`;
}

/** The letter distance of an interval number, for spelling: a third is 2 letters. */
export function letterSteps(num: number): number {
  return (num - 1) % 7;
}

export { letterIndex };
