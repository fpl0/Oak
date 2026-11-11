// Composite "mixed ear" cards (contracts §7.4): a graduated family is a member of fam.mix.pitch,
// fam.mix.harmony or fam.mix.rhythm. One review is one set of up to 10 trials, 2 per member; with more
// than 5 members they rotate, weighted toward the lowest recent accuracy; at most one sung member per set,
// none in Quiet mode. A member whose credit over its last 6 composite trials falls below 0.65 is recalled.
import { GOVERNOR } from "./constants.ts";
import { hash01 } from "./fsrs.ts";
import type { CompositeMember, CompositeSetPlan } from "./types.ts";

const mean = (v: readonly number[]) => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length);

/** Smoothed recent accuracy of a member, `(hits + 1) / (n + 2)` over its recall window. */
export function memberAccuracy(recentCredits: readonly number[]): number {
  const window = recentCredits.slice(-GOVERNOR.recallWindow);
  return (window.reduce((a, b) => a + b, 0) + 1) / (window.length + 2);
}

/** Whether a member's last 6 composite trials average below 0.65 (it needs its own card back). */
export function memberNeedsRecall(recentCredits: readonly number[]): boolean {
  if (recentCredits.length < GOVERNOR.recallWindow) return false;
  return mean(recentCredits.slice(-GOVERNOR.recallWindow)) < GOVERNOR.recallBelow;
}

/**
 * The members of one composite set. Deterministic for a `setKey` (pass the composite card ID and its rep
 * count). Recalled members are always in; the rest are drawn without replacement with weight
 * `(1 − accuracy) + 0.15`, so every member keeps a chance and weak ones come up more often.
 */
export function planCompositeSet(
  members: readonly CompositeMember[],
  opts: { quiet: boolean; setKey: string },
): CompositeSetPlan {
  const perMember = GOVERNOR.compositeTrialsPerMember;
  const slots = Math.floor(GOVERNOR.compositeTrialsMax / perMember);
  const eligible = members.filter((m) => !(opts.quiet && m.mic));
  const ranked = eligible
    .map((m) => {
      const weight = 1 - memberAccuracy(m.recentCredits) + 0.15;
      // Efraimidis–Spirakis: the largest u^(1/w) wins.
      const u = Math.max(hash01(`${opts.setKey}:${m.family}`), 1e-9);
      return { m, key: m.recalled ? 2 : u ** (1 / weight) };
    })
    .sort((a, b) => b.key - a.key || (a.m.family < b.m.family ? -1 : 1));
  const picked: CompositeMember[] = [];
  let sung = 0;
  for (const { m } of ranked) {
    if (picked.length >= slots) break;
    if (m.mic) {
      if (sung >= 1) continue;
      sung++;
    }
    picked.push(m);
  }
  // Interleave by family ID order of the draw: weakest first is discouraging, so play in a stable shuffle.
  const order = [...picked].sort(
    (a, b) => hash01(`${opts.setKey}:order:${a.family}`) - hash01(`${opts.setKey}:order:${b.family}`),
  );
  return {
    members: order.map((m) => ({ family: m.family, trials: perMember })),
    trials: order.length * perMember,
  };
}

/** Planning estimate of a composite set for a number of members. */
export function compositeSetSec(memberCount: number): number {
  const trials = Math.min(
    GOVERNOR.compositeTrialsMax,
    Math.max(1, memberCount) * GOVERNOR.compositeTrialsPerMember,
  );
  return trials * GOVERNOR.compositeTrialSec;
}
