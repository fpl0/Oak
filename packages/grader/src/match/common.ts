// Helpers every matcher shares: F1, swing straightening of both sides, names for lengths and shifts,
// pitch names for messages, and dimension folding.
import type { Dimension, DimScore, KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { degreeOf, METERS, spellMidi } from "@oak/theory";
import { straighten, straightenExact, swingRatio, swingSlot } from "../analyze/swing.ts";
import type { MatchResult, NormalizeContext } from "../types.ts";

export const f1 = (matched: number, t: number, a: number): number =>
  t + a === 0 ? 1 : (2 * matched) / (t + a);

/** Both sides straightened when the exercise declares swing (contracts §6.10 item 4). */
export function straightened(events: readonly NEvent[], ctx: NormalizeContext): NEvent[] {
  return ctx.swing && ctx.swing.amount > 0 ? straighten(events, ctx.swing, ctx.meter) : [...events];
}

/**
 * Both sides on the straight grid for comparison: the declared swing is removed from both; without a
 * declaration, an answer that swings against a straight target is straightened by its own measured
 * amount, so its onsets still match and only `rhythm.swing-missing` reports the feel (contracts §6.10).
 */
export function alignFeel(
  target: readonly NEvent[],
  answer: readonly NEvent[],
  ctx: NormalizeContext,
): [NEvent[], NEvent[]] {
  if (ctx.swing && ctx.swing.amount > 0) return [straightened(target, ctx), straightened(answer, ctx)];
  for (const sub of [8, 16] as const) {
    const mA = swingRatio(answer, ctx.meter, sub);
    // A "hard" ratio (≥ 2.4, a dotted 8th and a 16th) is a different rhythm, not a feel.
    if (mA.n < 2 || mA.cls === "straight" || mA.cls === "hard" || !mA.p) continue;
    const mT = swingRatio(target, ctx.meter, sub);
    // Only where the target plays the same subdivision straight: triplets are a rhythm, not a feel.
    if (mT.n < 2 || mT.cls !== "straight") continue;
    const x = R.sub(R.mul(mA.p, [2, 1]), [1, 1]);
    return [[...target], straightenExact(answer, x, swingSlot(ctx.meter, sub))];
  }
  return [[...target], [...answer]];
}

const UNIT_NAMES: Record<string, string> = {
  "1/1": "a bar",
};
/** "a beat", "an 8th", "a 16th", "2 beats", "a triplet 8th" for a length in cycles. */
export function lengthLabel(len: Rat, meter: MeterId): string {
  const a = R.abs(len);
  if (UNIT_NAMES[R.str(a)] && meter === "4/4") return UNIT_NAMES[R.str(a)] as string;
  const m = METERS[meter];
  const beats = R.mul(a, [m.unitsPerBar, 1]);
  const unit = m.tempoUnit === "eighth" ? "8th" : "beat";
  if (R.isInt(beats))
    return beats[0] === 1 ? `${unit === "8th" ? "an" : "a"} ${unit}` : `${beats[0]} ${unit}s`;
  // Fractions of the tempo unit: a quarter splits in 8ths, a dotted quarter in three 8ths, an 8th in 16ths.
  const TABLES: Record<typeof m.tempoUnit, [Rat, string, string][]> = {
    quarter: [
      [rat(1, 2), "8th", "an 8th"],
      [rat(1, 4), "16th", "a 16th"],
      [rat(1, 3), "triplet 8th", "a triplet 8th"],
      [rat(1, 8), "32nd", "a 32nd"],
    ],
    dottedQuarter: [
      [rat(1, 3), "8th", "an 8th"],
      [rat(1, 6), "16th", "a 16th"],
      [rat(1, 12), "32nd", "a 32nd"],
    ],
    eighth: [
      [rat(1, 2), "16th", "a 16th"],
      [rat(1, 4), "32nd", "a 32nd"],
    ],
  };
  const table = TABLES[m.tempoUnit];
  for (const [frac, plural, one] of table) {
    const n = R.div(beats, frac);
    if (R.isInt(n)) return n[0] === 1 ? one : `${n[0]} ${plural}s`;
  }
  return `${R.str(beats)} beat`;
}
/** "an 8th later" / "a beat earlier" for an answer shifted against the target. */
export const shiftLabel = (shift: Rat, meter: MeterId): string =>
  `${lengthLabel(shift, meter)} ${shift[0] > 0 ? "later" : "earlier"}`;

/** Note name for messages: re-spelled from MIDI and the key, never from the code (interfaces §3). */
export const noteName = (midi: number, key: KeySpec | null): string =>
  spellMidi(Math.round(midi), { key }).name;
/** A degree and its syllable in a key, or the note name when no key is known. */
export function pitchLabel(midi: number, key: KeySpec | null): { name: string; syl: string } {
  if (!key) return { name: noteName(midi, null), syl: noteName(midi, null) };
  const d = degreeOf(Math.round(midi), key);
  return { name: d.degree, syl: d.syllable };
}

/** Folds dimension scores into one weighted mean (weights ≤ 0 are reported but not counted). */
export function weightedScore(dims: Partial<Record<Dimension, DimScore>>): number {
  let s = 0;
  let w = 0;
  for (const d of Object.values(dims)) {
    if (!d || d.weight <= 0) continue;
    s += d.score * d.weight;
    w += d.weight;
  }
  return w === 0 ? 0 : s / w;
}

export const emptyResult = (score = 0): MatchResult => ({ score, dims: {}, diagnostics: [] });

export const clampScore = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
