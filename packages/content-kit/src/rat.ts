// Exact rational arithmetic on `Rat = readonly [n, d]` (reduced, d > 0; unit = cycles = bars).
// One implementation for the grader, the notation engine, the drill generators and the app.
import type { Rat } from "./schema/common.ts";

function gcd(a: number, b: number): number {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

/** Builds a reduced Rat. Throws on a zero denominator or a non-integer part. */
export function rat(n: number, d = 1): Rat {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0)
    throw new RangeError(`not a rational: ${n}/${d}`);
  const g = gcd(n, d) * (d < 0 ? -1 : 1);
  return [n / g, d / g];
}

export const ZERO: Rat = [0, 1];
export const ONE: Rat = [1, 1];

/** Largest denominator the grader keeps (exercises §0.2); beyond it an evaluation is `eval.too-many-events`. */
export const MAX_DENOMINATOR = 2 ** 20;

export const R = {
  add: (a: Rat, b: Rat): Rat => rat(a[0] * b[1] + b[0] * a[1], a[1] * b[1]),
  sub: (a: Rat, b: Rat): Rat => rat(a[0] * b[1] - b[0] * a[1], a[1] * b[1]),
  mul: (a: Rat, b: Rat): Rat => rat(a[0] * b[0], a[1] * b[1]),
  div: (a: Rat, b: Rat): Rat => rat(a[0] * b[1], a[1] * b[0]),
  neg: (a: Rat): Rat => [-a[0] || 0, a[1]],
  /** Negative, zero or positive, like a sort comparator. */
  cmp: (a: Rat, b: Rat): number => a[0] * b[1] - b[0] * a[1],
  eq: (a: Rat, b: Rat): boolean => a[0] * b[1] === b[0] * a[1],
  lt: (a: Rat, b: Rat): boolean => a[0] * b[1] < b[0] * a[1],
  lte: (a: Rat, b: Rat): boolean => a[0] * b[1] <= b[0] * a[1],
  min: (a: Rat, b: Rat): Rat => (a[0] * b[1] <= b[0] * a[1] ? a : b),
  max: (a: Rat, b: Rat): Rat => (a[0] * b[1] >= b[0] * a[1] ? a : b),
  abs: (a: Rat): Rat => [Math.abs(a[0]), a[1]],
  /** Floor as an integer (the 0-based cycle of an onset). */
  floor: (a: Rat): number => Math.floor(a[0] / a[1]),
  /** Position inside its cycle, in [0, 1). */
  frac: (a: Rat): Rat => rat(((a[0] % a[1]) + a[1]) % a[1], a[1]),
  toNum: (a: Rat): number => a[0] / a[1],
  isInt: (a: Rat): boolean => a[1] === 1,
  /** "1/3", "0", "7/8": the form Strudel's `Fraction.toFraction()` prints. */
  str: (a: Rat): string => (a[1] === 1 ? `${a[0]}` : `${a[0]}/${a[1]}`),
  /** Least common denominator of a list. */
  lcd: (xs: readonly Rat[]): number => xs.reduce((l, x) => (l / gcd(l, x[1])) * x[1], 1),
};

/** Parses "1/3", "-5/4", "2" (as printed by `Fraction.toFraction()`). */
export function parseRat(text: string): Rat {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(text.trim());
  if (!m) throw new RangeError(`not a rational: "${text}"`);
  return rat(Number(m[1]), m[2] === undefined ? 1 : Number(m[2]));
}

/** From a fraction.js value (any major version: number or BigInt fields `s`, `n`, `d`). */
export function fromFraction(f: { s?: bigint | number; n: bigint | number; d: bigint | number }): Rat {
  const sign = f.s === undefined ? 1 : Number(f.s) < 0 ? -1 : 1;
  return rat(sign * Number(f.n), Number(f.d));
}

/** Nearest rational with denominator `den` (for display and for snapping taps to a grid). */
export function nearest(x: number, den: number): Rat {
  return rat(Math.round(x * den), den);
}

/** 1-based bar of an onset: `floor(onset) + 1`. With a pickup, cycle 0 is the pickup bar (bar 0). */
export function barOf(onset: Rat, pickup = false): number {
  return R.floor(onset) + (pickup ? 0 : 1);
}
