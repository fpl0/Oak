// "Newly learned" on the Oak (carry f1; wave7.md §5.6): a leaf glints, and unfurls once, for 48 hours after the skill
// was first introduced to this learner. The instant is the server's (`SkillState.introducedAt`, set once and never
// moved); nothing here infers it from `updatedAt`, which moves whenever the skill is recalculated. Pure.
import type { SkillState } from "@oak/api";

/** How long a leaf reads as newly learned. */
export const NEWLY_LEARNED_MS = 48 * 60 * 60 * 1000;

/**
 * The skills introduced in the last 48 hours, as of `now`. A skill still at `new` or `available` is a bud, never
 * "newly learned", whatever its timestamp; an instant in the future (a moved dev clock) counts from now.
 */
export function newlyLearned(
  nodes: readonly Pick<SkillState, "skillId" | "level" | "introducedAt">[] | null | undefined,
  now: number,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const n of nodes ?? []) {
    if (!n.introducedAt || n.level === "new" || n.level === "available") continue;
    const at = Date.parse(n.introducedAt);
    if (Number.isNaN(at)) continue;
    if (now - at < NEWLY_LEARNED_MS && at - now < NEWLY_LEARNED_MS) out.add(n.skillId);
  }
  return out;
}
