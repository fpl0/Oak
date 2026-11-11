// Seeded randomness. Every trial is reproducible from its stored seed (exercises §4.1).
import type { FamilyId } from "@oak/content-kit";
import type { Rng } from "./types.ts";

/** xmur3-style string hash to an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** `mulberry32(seed)` wrapped with the helpers generators need. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number => {
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo)
      throw new RangeError(`rng.int: bad range [${lo}, ${hi}]`);
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("rng.pick: empty list");
    return items[Math.floor(next() * items.length)] as T;
  };
  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    if (items.length === 0 || items.length !== weights.length)
      throw new RangeError("rng.weighted: items and weights must be non-empty and of equal length");
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return pick(items);
    let x = next() * total;
    for (let i = 0; i < items.length; i++) {
      x -= Math.max(0, weights[i] as number);
      if (x < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { next, int, pick, weighted, shuffle, seed: seed >>> 0 };
}

/** The seed of trial `index` of a set: `hash(familyId, setId, trialIndex)`. */
export function trialSeed(family: FamilyId, setId: string, index: number): number {
  return hashString(`${family}|${setId}|${index}`);
}
