// The Leaves tab (ux §5.2): every skill as a row, sortable by any column. Pure.
import type { SkillState } from "@oak/api";
import type { MapNode } from "./graph.ts";
import { LEAF_STATUSES, type LeafStatus, leafView } from "./state.ts";

export const LEAF_COLUMNS = [
  "course",
  "name",
  "strand",
  "unit",
  "status",
  "strength",
  "recall",
  "freshness",
] as const;
export type LeafColumn = (typeof LEAF_COLUMNS)[number];

export interface LeafRow {
  node: MapNode;
  status: LeafStatus;
  strength: number | null;
  recall: number | null;
  freshness: number | null;
  drying: boolean;
}

export function leafRows(nodes: readonly MapNode[], states: ReadonlyMap<string, SkillState>): LeafRow[] {
  return nodes.map((node) => {
    const s = states.get(node.id);
    const v = leafView(s);
    const tracked = v.freshness !== null;
    return {
      node,
      status: v.status,
      strength: tracked && s ? s.M : null,
      recall: tracked && s ? s.R : null,
      freshness: v.freshness,
      drying: v.drying,
    };
  });
}

const statusRank = (s: LeafStatus) => LEAF_STATUSES.indexOf(s);

/** Stable sort; empty values (`null`) always go last, whichever the direction. Ties fall back to course order. */
export function sortLeaves(
  rows: readonly LeafRow[],
  by: LeafColumn,
  dir: "asc" | "desc",
  regionOrder: readonly string[],
  unitOrder: readonly string[],
): LeafRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (r: LeafRow): number | string | null => {
    switch (by) {
      case "course":
        return r.node.rank;
      case "name":
        return r.node.name.toLowerCase();
      case "strand":
        return regionOrder.indexOf(r.node.region);
      case "unit":
        return unitOrder.indexOf(r.node.unit);
      case "status":
        return statusRank(r.status);
      case "strength":
        return r.strength;
      case "recall":
        return r.recall;
      case "freshness":
        return r.freshness;
    }
  };
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb !== null) return 1;
    if (kb === null && ka !== null) return -1;
    if (ka !== null && kb !== null && ka !== kb) {
      const c = typeof ka === "string" ? ka.localeCompare(kb as string) : (ka as number) - (kb as number);
      if (c !== 0) return c * sign;
    }
    return a.node.rank - b.node.rank;
  });
}
