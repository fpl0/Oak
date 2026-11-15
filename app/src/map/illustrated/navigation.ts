import type { Direction } from "../nav.ts";
import type { TreeLayout } from "./layout.ts";

/** Nearest centre in a 90-degree directional cone. Ties use the teaching rank, then the stable ID. */
export function treeNeighbour(
  layout: Pick<TreeLayout, "nodes" | "byId">,
  id: string,
  direction: Direction,
): string | null {
  const from = layout.byId.get(id);
  if (!from) return layout.nodes[0]?.id ?? null;
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  let best: string | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const to of layout.nodes) {
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;
    const along = (horizontal ? dx : dy) * sign;
    const across = Math.abs(horizontal ? dy : dx);
    if (along <= 0 || across > along) continue;
    const d = dx * dx + dy * dy;
    if (d < distance) {
      distance = d;
      best = to.id;
    }
  }
  return best;
}
