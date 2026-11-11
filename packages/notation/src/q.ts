// Small exact-rational helpers on top of @oak/content-kit's `R` that only the quantizer needs.
import { R, type Rat, rat } from "@oak/content-kit";

export const Z: Rat = [0, 1];

export function isPow2(x: number): boolean {
  return x > 0 && Number.isInteger(x) && (x & (x - 1)) === 0;
}
/** floor(a / step) * step. */
export function floorTo(a: Rat, step: Rat): Rat {
  const q = R.div(a, step);
  return R.mul(rat(Math.floor(q[0] / q[1])), step);
}
export function isMultipleOf(a: Rat, step: Rat): boolean {
  return R.div(a, step)[1] === 1;
}
/** On the binary grid of whole-note fractions down to `1/finest`. */
export function onBinaryGrid(x: Rat, finest = 32): boolean {
  return isPow2(x[1]) && x[1] <= finest;
}
export function oddPart(x: number): number {
  let k = x;
  while (k % 2 === 0 && k > 0) k /= 2;
  return k;
}
/** Nearest rational to a float with a denominator up to `maxDen` (continued fractions). */
export function toRat(x: number, maxDen = 1000): Rat {
  if (Number.isInteger(x)) return rat(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(v - a) < 1e-12) break;
    v = 1 / (v - a);
  }
  return rat(h1, k1);
}
export const key = (x: Rat): string => R.str(x);
