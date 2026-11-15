// Contract §7.10 takes precedence over the older raw-recall ramp in ux §5.2.
import type { SkillState } from "@oak/api";
import { type ThemeName, TREE_COLOURS, type TreeColours } from "../../ui/theme/palette.ts";
import { freshnessLabel, type LeafStatus, leafView, pctText, STATUS_LABEL } from "../state.ts";

/** The tree's colours: the kit's (palette.ts `TREE_COLOURS`, held equal to tokens.css by theme.test.ts). */
export const TREE_PALETTE: Readonly<Record<ThemeName, Omit<TreeColours, "leaf">>> = TREE_COLOURS;

const fills = (theme: ThemeName): Record<LeafStatus, string> => ({
  locked: "none",
  available: "none",
  ...TREE_COLOURS[theme].leaf,
});
const FILLS: Record<ThemeName, Record<LeafStatus, string>> = { paper: fills("paper"), bark: fills("bark") };

// A lobed English oak leaf: exactly 24 × 32 before the small natural tilt.
export const OAK_LEAF =
  "M0 16 C-2 12 -8 13 -7 8 C-15 9 -12 2 -7 2 C-16 -1 -11 -7 -6 -5 C-12 -12 -5 -12 -3 -11 C-5 -16 0 -16 0 -16 C0 -16 5 -16 3 -11 C5 -12 12 -12 6 -5 C11 -7 16 -1 7 2 C12 2 15 9 7 8 C8 13 2 12 0 16 Z";
export const BUD = "M0 13 C-9 6 -6 -3 0 -8 C6 -3 9 6 0 13 Z";

export function leafVisual(state: SkillState | undefined, theme: ThemeName, newlyLearned = false) {
  const view = leafView(state);
  const bud = view.freshness === null;
  return {
    ...view,
    bud,
    fill: FILLS[theme][view.status],
    stroke: bud
      ? view.status === "available"
        ? TREE_PALETTE[theme].accent
        : TREE_PALETTE[theme].ink
      : FILLS[theme][view.status],
    // More ink than gap: a bud not open yet still reads as an outline at the fitted zoom (about 0.6).
    dash: view.status === "locked" ? "3 2" : undefined,
    droop: view.drying ? 10 : 0,
    dryEdge: view.drying,
    ring: view.status === "mastered",
    glow: view.status === "available",
    // SkillState.updatedAt is a recalculation timestamp, not when a skill was first learned.
    // A caller with actual introduction evidence may request the glint; never infer it from updatedAt.
    glint: newlyLearned && !bud,
    veins:
      view.status === "practising" || view.status === "mastered" ? 3 : view.status === "introduced" ? 1 : 0,
  };
}

export function leafDescription(name: string, state: SkillState | undefined, newlyLearned = false): string {
  const view = leafView(state);
  return [
    name,
    STATUS_LABEL[view.status],
    freshnessLabel(view.freshness),
    view.freshness === null ? "" : `Freshness ${pctText(view.freshness)}; recall ${pctText(state?.R)}`,
    view.drying ? "In today's warm-up" : "",
    view.paused ? "Waiting for the mic" : "",
    view.provisional ? "Provisional" : "",
    view.debt ? "Needs a revisit" : "",
    newlyLearned && view.freshness !== null ? "Newly learned" : "",
  ]
    .filter(Boolean)
    .join(". ");
}
