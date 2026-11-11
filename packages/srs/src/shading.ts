// Skill-map shading (contracts §7.10): freshness relative to each card's own desired retention ρ, so a
// learner who is exactly on schedule sees a fully green tree. The weighted mean is used, never the minimum.
import { MASTERY, SHADING } from "./constants.ts";
import type { CardKind } from "./types.ts";

export interface ShadingCard {
  retrievability: number;
  desiredRetention: number;
  /** ω: 2 for P/Pr family cards (and the composite a graduated family contributes through), 1 otherwise. */
  weight: number;
}

/** `clamp((R − (ρ − 0.30)) / 0.25, 0, 1)`: 1 while R ≥ ρ − 0.05, 0 at R ≤ ρ − 0.30. */
export function freshness(retrievability: number, desiredRetention: number): number {
  const span = SHADING.fadeEnd - SHADING.fadeStart;
  return Math.min(1, Math.max(0, (retrievability - (desiredRetention - SHADING.fadeEnd)) / span));
}
/** ω of a card in R and in F: perceptual and production families weigh double. */
export function cardWeight(kind: CardKind, perceptual: boolean): number {
  if (kind === "composite") return MASTERY.familyCardWeight;
  return kind === "family" && perceptual ? MASTERY.familyCardWeight : 1;
}
/** F_node: the ω-weighted mean freshness of a node's cards (paused cards left out by the caller), or `null` with none. */
export function nodeFreshness(cards: readonly ShadingCard[]): number | null {
  const total = cards.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return null;
  return cards.reduce((sum, c) => sum + c.weight * freshness(c.retrievability, c.desiredRetention), 0) / total;
}
/** `0.35 + 0.65 · F_node`, where F_node is the ω-weighted mean freshness of the node's cards. */
export function nodeOpacity(cards: readonly ShadingCard[]): number | null {
  const f = nodeFreshness(cards);
  return f === null ? null : SHADING.minOpacity + (1 - SHADING.minOpacity) * f;
}
/** R of contracts §7.5: the ω-weighted mean retrievability of a node's cards, or `null` with none. */
export function nodeRetrievability(cards: readonly Pick<ShadingCard, "retrievability" | "weight">[]): number | null {
  const total = cards.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return null;
  return cards.reduce((sum, c) => sum + c.weight * c.retrievability, 0) / total;
}
