// How the node panel names a drill family's state (contracts §7.4; decision 27), honestly: a family that graduated
// is practised in its mixed review, never "done"; a resting family rests there below its mastery level and comes
// back to its own sets, never "mastered"; a mixed review (`fam.mix.*`) says how many families it holds now. Pure.
import type { FamilyDef, FamilyState, SrsCard } from "@oak/api";
import { isResting } from "../drills/resting.ts";

export type FamilyStatusKind = "mixed" | "resting" | "graduated" | "active" | "queued" | "locked" | "not-yet";

export interface FamilyStatus {
  kind: FamilyStatusKind;
  text: string;
  /** A longer line for the title attribute. */
  help: string;
}

export const isComposite = (f: Pick<FamilyDef, "id">): boolean => f.id.startsWith("fam.mix.");

export function familyStatus(
  f: FamilyDef,
  ctx: {
    card: SrsCard["status"] | undefined;
    state: FamilyState | undefined;
    states: ReadonlyMap<string, FamilyState>;
    lessonStatus: ReadonlyMap<string, string>;
  },
): FamilyStatus {
  if (isComposite(f)) {
    const members = [...ctx.states.values()].filter((s) => s.compositeId === f.id && s.graduatedAt !== null);
    const resting = members.filter((s) => s.restingSince != null).length;
    const graduated = members.length - resting;
    if (members.length > 0) {
      const parts: string[] = [];
      if (graduated > 0) parts.push(`${graduated} graduated`);
      if (resting > 0) parts.push(`${resting} resting`);
      return {
        kind: "mixed",
        text: `mixed review of ${members.length} ${members.length === 1 ? "family" : "families"}`,
        help: `${parts.join(", ")}: each comes up for two trials whenever this review is drawn, and goes back to its own sets if it slips.`,
      };
    }
    if (ctx.card === "active")
      return {
        kind: "active",
        text: "in your reviews",
        help: "A mixed review: families join it as they graduate or rest.",
      };
  }
  if (isResting(f, ctx.state))
    return {
      kind: "resting",
      text: "resting in mixed practice",
      help: "It still comes up in mixed practice, and returns to its own sets where it left off.",
    };
  // Graduated below its mastery level (a gated ladder at its highest open level, contracts §7.4): in mixed
  // practice for now, not "solid" — the Practice hub says the same.
  if (ctx.state?.graduatedAt && ctx.state.level < f.masteryLevel)
    return {
      kind: "resting",
      text: "in mixed practice for now",
      help: `At level ${ctx.state.level}, below level ${f.masteryLevel} where it counts as mastered: it is practised inside its mixed review for now, and returns to its own sets where it left off.`,
    };
  if (ctx.card === "graduated" || (ctx.state?.graduatedAt && ctx.state.compositeId))
    return {
      kind: "graduated",
      text: "graduated into mixed practice",
      help: "Solid over many days: it is practised inside its mixed review now, and comes back on its own if it slips.",
    };
  if (ctx.card === "active")
    return { kind: "active", text: "in your reviews", help: "Its own sets come up in your warm-ups." };
  if (ctx.card === "deferred")
    return {
      kind: "queued",
      text: "queued for later",
      help: "Its first set is planned as soon as there is room in a warm-up.",
    };
  if ((ctx.lessonStatus.get(f.unlock.lesson) ?? "locked") === "locked")
    return {
      kind: "locked",
      text: `opens with ${f.unlock.lesson}`,
      help: "Its lesson opens later in the course.",
    };
  return {
    kind: "not-yet",
    text: "not in your reviews yet",
    help: "It joins your reviews after the lesson that seeds it.",
  };
}
