// The shape of the catalog the 300-day simulation of contracts §7.4 introduces, and how it walks a course
// order. The families, decks and the order itself are the course's real ones (content/families.ts and
// content/syllabus.ts), converted by `course-catalog.test-util.ts`; set durations are trialsPerSet ×
// estTrialSec. Test infrastructure: the package never imports the course content.
import type { CompositeGroup, FamilyDomain, FamilyId } from "@oak/content-kit";

export type SimFamilyKind = "P" | "Pr" | "C";
export interface SimFamily {
  id: FamilyId;
  kind: SimFamilyKind;
  domain: FamilyDomain;
  unlock: string;
  mix: CompositeGroup | null;
  masteryLevel: number;
  topLevel: number;
  trialsPerSet: number;
  estTrialSec: number;
  mic: boolean;
  fastRtMs: number;
}

/** The same with explicit gates: level → every lesson that must be completed for it. */
export function maxOpenLevelOf(
  f: Pick<SimFamily, "topLevel">,
  gates: Readonly<Record<number, readonly string[]>>,
  completed: ReadonlySet<string>,
): number {
  let open = 1;
  for (let level = 2; level <= f.topLevel; level++) {
    const gate = gates[level];
    if (gate !== undefined && !gate.every((g) => completed.has(g))) break;
    open = level;
  }
  return open;
}

export type SimSessionKind = "lesson" | "checkpoint" | "capstone" | "gym";
export interface SimEntry {
  id: string;
  kind: SimSessionKind;
}
export function sessionKindOf(id: string): SimSessionKind {
  if (/\.L\d+$/.test(id)) return "lesson";
  if (id.endsWith(".CP") || /^J\.CP\d$/.test(id)) return "checkpoint";
  if (id.startsWith("GYM.") || id.startsWith("CF-T.")) return "gym";
  return "capstone";
}
/** The sessions of a course order (`SimCatalog.order`) as the simulation walks them. */
export function buildTimeline(order: readonly string[]): SimEntry[] {
  return order.map((id) => ({ id, kind: sessionKindOf(id) }));
}
