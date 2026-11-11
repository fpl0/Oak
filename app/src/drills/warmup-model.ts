// The warm-up's pure decisions: which planned items can run here, in what order (an easy win first), what each
// runs as, and when the minute budget is spent. Tested without React.
import type { DrillSession, FamilyDef, WarmupItem } from "@oak/api";
import { isCompositeGenerator, isPendingGenerator } from "@oak/drills";

export type WarmupStep =
  | {
      kind: "set";
      purpose: DrillSession["purpose"];
      familyIds: string[];
      title: string;
      listenFirst: boolean;
    }
  | { kind: "listen"; familyId: string; level: number }
  | { kind: "facts"; cardIds: string[] }
  | { kind: "skip"; reason: "pending" | "unknown" | "quiet" | "empty" };

/** What one planned item runs as here. */
export function stepOf(item: WarmupItem, defs: ReadonlyMap<string, FamilyDef>, quiet: boolean): WarmupStep {
  if (item.kind === "fact-set")
    return item.cardIds.length > 0
      ? { kind: "facts", cardIds: item.cardIds }
      : { kind: "skip", reason: "empty" };
  const def = item.familyId ? defs.get(item.familyId) : undefined;
  if (item.kind === "listen") {
    if (!def || isPendingGenerator(def.generator) || isCompositeGenerator(def.generator))
      return { kind: "skip", reason: "unknown" };
    return { kind: "listen", familyId: def.id, level: item.level ?? 1 };
  }
  if (quiet && item.mic) return { kind: "skip", reason: "quiet" };
  if (item.kind === "composite-set") {
    const members = item.members.filter((m) => {
      const d = defs.get(m);
      return d && !isPendingGenerator(d.generator) && !(quiet && d.mic === true);
    });
    if (members.length === 0) return { kind: "skip", reason: "empty" };
    return {
      kind: "set",
      purpose: "srs",
      familyIds: members,
      title: def?.title ?? "Mixed review",
      listenFirst: false,
    };
  }
  if (!def) return { kind: "skip", reason: "unknown" };
  if (isPendingGenerator(def.generator) || isCompositeGenerator(def.generator))
    return { kind: "skip", reason: "pending" };
  const purpose: DrillSession["purpose"] =
    item.kind === "anchor" ? "anchor" : item.kind === "repair" ? "repair" : "srs";
  return {
    kind: "set",
    purpose,
    familyIds: [def.id],
    title: def.title,
    listenFirst: item.kind === "blocked-intro",
  };
}

/** Server order, with the anchor (the easy win) moved to the front when it is not there already. */
export function warmupOrder(items: readonly WarmupItem[]): WarmupItem[] {
  const anchor = items.findIndex((i) => i.kind === "anchor");
  if (anchor <= 0) return [...items];
  const out = [...items];
  const [a] = out.splice(anchor, 1);
  out.unshift(a as WarmupItem);
  return out;
}

/** The warm-up stops taking new sets once it has run past its budget by a quarter (leftovers stay due). */
export function budgetSpent(elapsedSec: number, budgetSec: number): boolean {
  return budgetSec > 0 && elapsedSec >= budgetSec * 1.25;
}

/** The learner day an item belongs to (`2026-11-11:w:0`). */
export function dayOfItem(id: string): string {
  return id.split(":")[0] ?? id;
}

/** A stable key of an item across re-plans (IDs are positional). */
export function itemKey(item: WarmupItem): string {
  return `${item.kind}|${item.familyId ?? ""}|${item.members.join(",")}|${item.cardIds.join(",")}`;
}
