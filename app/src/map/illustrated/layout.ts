// Authored unit anchors, computed teaching-order leaves and region-owned twigs. No DOM or learner state.
import { OAK_ANCHORS, OAK_CAPSTONE_UNITS, type OakLimb } from "../../../../content/oak.layout.ts";
import { REGION_ORDER } from "../../lib/content-model.ts";
import type { MapGraph, MapNode, Region } from "../graph.ts";
import type { MapEdge } from "../layout.ts";
import { overlaps } from "../layout.ts";

export const TREE_SIZE = { width: 1600, height: 1000 } as const;
export const GROUND_Y = 700;
export interface TreeLeaf extends MapNode {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  angle: number;
  slot: number;
  limb: OakLimb;
  stem: string;
}
export interface TreeBranch {
  id: string;
  kind: "trunk" | "limb" | "root" | "sprig";
  d: string;
  grain: string;
  spine: readonly Point[];
}
export interface AcornPosition {
  capstoneId: string;
  unit: string;
  x: number;
  y: number;
  stem: string;
}
export interface TreeLayout {
  width: number;
  height: number;
  nodes: TreeLeaf[];
  byId: ReadonlyMap<string, TreeLeaf>;
  regions: Region[];
  branches: TreeBranch[];
  edges: MapEdge[];
  acorns: AcornPosition[];
  /**
   * Places on the ground for released tracks that have no capstone (B-sides: sketches the learner promoted). They
   * lie at the foot of the tree in the order they were released, nearest the trunk first; their places depend only
   * on the graph, so a new B-side never moves an earlier one. At most `FALLEN_ACORNS` are drawn.
   */
  fallen: FallenAcorn[];
}
export interface FallenAcorn {
  x: number;
  y: number;
  /** A small, fixed tilt per place, so a row of acorns on the ground does not read as a grid. */
  angle: number;
}
/** How many B-sides lie under the tree; the album lists every one of them. */
export const FALLEN_ACORNS = 12;

const round = (n: number) => Math.round(n * 100) / 100;
type Point = readonly [number, number];

/** A bent, tapered ribbon; varying tangent and width give the wood a quiet irregularity. */
export function branch(
  id: string,
  kind: TreeBranch["kind"],
  a: Point,
  b: Point,
  width: number,
  bend = 0,
): TreeBranch {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const left: string[] = [];
  const right: string[] = [];
  const centre: string[] = [];
  const spine: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const bow = Math.sin(t * Math.PI) * bend;
    const x = a[0] + dx * t + nx * bow;
    const y = a[1] + dy * t + ny * bow;
    // The trunk keeps its girth; limbs and roots thin faster than a straight wedge, as wood does away from the bole.
    const half = (width * (1 - t) ** (kind === "trunk" ? 0.8 : kind === "root" ? 1.35 : 1.15) + 0.9) / 2;
    left.push(`${round(x + nx * half)},${round(y + ny * half)}`);
    right.push(`${round(x - nx * half)},${round(y - ny * half)}`);
    centre.push(`${round(x)},${round(y)}`);
    spine.push([round(x), round(y)]);
  }
  return {
    id,
    kind,
    d: `M${left.join(" L")} L${right.reverse().join(" L")} Z`,
    grain: `M${centre.join(" L")}`,
    spine,
  };
}

// Widths at the bole. The lower limbs and the roots were drawn as heavy wedges (34 and 60 px) that read as tent
// flaps beside a 82 px trunk; a limb is about a third of the trunk where it leaves it, and a root half that again
// once it is under the ground line.
const wood = (): TreeBranch[] => [
  branch("trunk", "trunk", [805, 722], [798, 285], 78, -12),
  branch("harmony", "limb", [800, 548], [260, 350], 26, -42),
  branch("line", "limb", [800, 545], [1310, 425], 25, 38),
  branch("colour", "limb", [805, 462], [1350, 210], 23, -35),
  branch("jazz", "limb", [800, 413], [500, 92], 20, -18),
  branch("sound", "limb", [800, 385], [1180, 90], 18, 24),
  branch("root-left", "root", [800, 700], [400, 817], 34, 20),
  branch("root-right", "root", [815, 703], [1170, 872], 31, -24),
  branch("root-deep", "root", [801, 710], [695, 966], 27, 16),
];

/** Project an attachment hint onto its limb; no floating twigs when the limb bends. */
function joinOnLimb(hint: Point, limb: OakLimb, branches: readonly TreeBranch[]): Point {
  const candidates = branches.filter((b) =>
    limb === "roots" ? b.kind === "root" : b.id === (limb === "form" ? "trunk" : limb),
  );
  let closest: Point = hint;
  let distance = Number.POSITIVE_INFINITY;
  for (const b of candidates)
    for (let i = 1; i < b.spine.length; i++) {
      const a = b.spine[i - 1];
      const c = b.spine[i];
      if (!a || !c) continue;
      const dx = c[0] - a[0];
      const dy = c[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((hint[0] - a[0]) * dx + (hint[1] - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      const point: Point = [round(a[0] + dx * t), round(a[1] + dy * t)];
      const d = Math.hypot(point[0] - hint[0], point[1] - hint[1]);
      if (d < distance) {
        closest = point;
        distance = d;
      }
    }
  return closest;
}

export function layoutIllustratedOak(graph: MapGraph): TreeLayout {
  const nodes: TreeLeaf[] = [];
  const branches = wood();
  const groups = new Map<string, MapNode[]>();
  for (const n of graph.nodes) {
    const group = groups.get(n.unit) ?? [];
    group.push(n);
    groups.set(n.unit, group);
  }
  for (const [unit, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const anchor = OAK_ANCHORS[unit];
    if (!anchor) throw new Error(`The Oak needs an authored anchor for unit ${unit}`);
    const ordered = [...group].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    const [dx, dy] = anchor.step;
    const len = Math.hypot(dx, dy);
    const normal = [-dy / len, dx / len] as const;
    const tip: Point = [
      anchor.start[0] + dx * (ordered.length - 0.5),
      anchor.start[1] + dy * (ordered.length - 0.5),
    ];
    const join = joinOnLimb(anchor.join, anchor.limb, branches);
    branches.push(branch(`${unit}-join`, "sprig", join, anchor.start, 7, 12));
    branches.push(branch(unit, "sprig", anchor.start, tip, 5));
    ordered.forEach((n, slot) => {
      const side = slot % 2 === 0 ? 1 : -1;
      const sx = anchor.start[0] + dx * slot;
      const sy = anchor.start[1] + dy * slot;
      const cx = round(sx + normal[0] * side * 29);
      const cy = round(sy + normal[1] * side * 29);
      const angle = round(side * 24 + Math.sin(slot * 2.1) * 7);
      const radians = (angle * Math.PI) / 180;
      const tipX = round(cx - Math.sin(radians) * 16);
      const tipY = round(cy + Math.cos(radians) * 16);
      nodes.push({
        ...n,
        x: cx - 20,
        y: cy - 20,
        w: 40,
        h: 40,
        cx,
        cy,
        slot,
        limb: anchor.limb,
        angle,
        stem: `M${round(sx)},${round(sy)} Q${round(cx - side * 5)},${round(sy)} ${tipX},${tipY}`,
      });
    });
  }
  nodes.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [...graph.edges]
    .sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d))
    .flatMap(([from, to]) => {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a || !b) return [];
      const mx = round((a.cx + b.cx) / 2);
      return [
        {
          from,
          to,
          crossRegion: a.region !== b.region,
          d: `M${a.cx},${a.cy} Q${mx},${round(Math.min(a.cy, b.cy) - 25)} ${b.cx},${b.cy}`,
        },
      ];
    });
  const occupied: { x: number; y: number; w: number; h: number }[] = [...nodes];
  const acorns = Object.entries(OAK_CAPSTONE_UNITS).flatMap(([capstoneId, unit]) => {
    const anchor = OAK_ANCHORS[unit];
    if (!anchor || !groups.has(unit)) return [];
    const supports = branches.filter((b) => b.id === `${unit}-join` || b.id === unit);
    for (const drop of [36, 56, 76, 96, 116])
      for (const support of supports)
        for (const index of [8, 14, 20, 2, 5, 11, 17, 23])
          for (const offset of [0, -24, 24, -48, 48, -72, 72]) {
            const at = support.spine[index] ?? anchor.join;
            const x = round(at[0] + offset);
            const y = round(at[1] + drop);
            const box = { x: x - 16, y: y - 12, w: 32, h: 32 };
            if (
              box.x < 24 ||
              box.y < 24 ||
              box.x + box.w > 1576 ||
              box.y + box.h > 976 ||
              occupied.some((n) => overlaps(box, n))
            )
              continue;
            occupied.push(box);
            return [
              {
                capstoneId,
                unit,
                x,
                y,
                stem: `M${at[0]},${at[1]} Q${x},${round(at[1] + drop / 2)} ${x},${y - 5}`,
              },
            ];
          }
    throw new Error(`The Oak needs room for the ${capstoneId} acorn`);
  });
  // B-sides on the ground: just under the ground line, outward from the trunk on both sides, a row above and below.
  // A place is kept only when it clears every leaf, every capstone acorn and the trunk's foot.
  const fallen: FallenAcorn[] = [];
  const ground: Point[] = [];
  for (let step = 0; step < 24; step++)
    for (const side of [1, -1])
      for (const row of [0, 1]) ground.push([round(805 + side * (70 + step * 30)), 724 + row * 22]);
  for (const [x, y] of ground) {
    if (fallen.length >= FALLEN_ACORNS) break;
    const box = { x: x - 14, y: y - 14, w: 28, h: 28 };
    if (box.x < 90 || box.x + box.w > 1510 || occupied.some((n) => overlaps(box, n))) continue;
    occupied.push(box);
    fallen.push({ x, y, angle: round(((fallen.length * 47) % 70) - 35) });
  }
  return {
    ...TREE_SIZE,
    nodes,
    byId,
    branches,
    edges,
    acorns,
    fallen,
    regions: REGION_ORDER.filter((r) => nodes.some((n) => n.region === r)),
  };
}
