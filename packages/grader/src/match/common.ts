// Helpers every matcher shares: F1, swing straightening of both sides, names for lengths and shifts,
// pitch names for messages, and dimension folding.
import type { Dimension, DimScore, KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { chromaticLabel, degreeOf, METERS, spellMidi } from "@oak/theory";
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
/**
 * A written note's length (`rhythm.duration`): `lengthLabel`, except that a dotted value is called by its name in a
 * meter on the quarter ("a dotted quarter", not "3 8ths"; "a dotted 8th", not "3 16ths"), as the staff writes it
 * (Wave 6, U13.L03). In a compound meter a dotted quarter is the beat already ("a beat").
 */
export function noteValueLabel(len: Rat, meter: MeterId): string {
  const m = METERS[meter];
  if (m.tempoUnit === "quarter") {
    const beats = R.mul(R.abs(len), [m.unitsPerBar, 1]);
    if (R.eq(beats, rat(3, 2))) return "a dotted quarter";
    if (R.eq(beats, rat(3, 4))) return "a dotted 8th";
  }
  return lengthLabel(len, meter);
}
/** "an 8th later" / "a beat earlier" for an answer shifted against the target. */
export const shiftLabel = (shift: Rat, meter: MeterId): string =>
  `${lengthLabel(shift, meter)} ${shift[0] > 0 ? "later" : "earlier"}`;

/** Note name for messages: re-spelled from MIDI and the key, never from the code (interfaces §3). */
export const noteName = (midi: number, key: KeySpec | null): string =>
  spellMidi(Math.round(midi), { key }).name;
/** A degree as it is printed: "b7" → "♭7", "#4" → "♯4". */
export const degreeShown = (degree: string): string => degree.replace(/^b/, "♭").replace(/^#/, "♯");
/** A degree and its syllable in a key, or the note name when no key is known. */
export function pitchLabel(
  midi: number,
  key: KeySpec | null,
  direction?: 1 | -1,
): { name: string; syl: string } {
  if (!key) return { name: noteName(midi, null), syl: noteName(midi, null) };
  // A note from outside the key is named by where it goes (U15.L01): G♯ on its way up to A is ♯5 (si), on its
  // way down to G it is ♭6 (le). Notes of the key, and a chromatic note with no direction, keep the key's label.
  // The blue notes keep their own names (♭3, ♭5, ♭7) whichever way a riff moves (U11).
  if (direction !== undefined && !/blues|pentatonic/.test(key.mode)) {
    const c = chromaticLabel(Math.round(midi), key, { direction });
    if (c.chromatic) return { name: degreeShown(c.degree), syl: c.syllable };
  }
  const d = degreeOf(Math.round(midi), key);
  // As the learner reads a degree: ♭7 and ♯4, never the ASCII of the code ("b7", "#4").
  return { name: degreeShown(d.degree), syl: d.syllable };
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

/**
 * The key in force at an onset (contracts §6.8): the entry of the exercise's key plan whose bar the onset has
 * reached, else `fallback`. Bars of a plan are 1-based; with a pickup, cycle 0 is bar 0.
 */
export function keyAtOnset(
  ctx: Pick<NormalizeContext, "keyPlan" | "pickup">,
  onset: Rat,
  fallback: KeySpec | null,
): KeySpec | null {
  const plan = ctx.keyPlan;
  if (!plan || plan.length === 0) return fallback;
  const bar = R.floor(onset) + (ctx.pickup ? 0 : 1);
  let key: KeySpec | null = fallback;
  for (const e of plan) if (e.bar <= bar) key = e.key;
  return key;
}
