// The Oak v1 layout: a deterministic grid. Columns are strands (regions, in map order), rows are units in
// course order; inside a unit row each strand's nodes stack in teaching order. Because a node's prerequisites
// are always taught first (contracts §4.2 rule 1), every edge runs down the page or across one row, and the
// learner reads the course top to bottom. Pure and tested: no overlaps, identical output for the same graph.
import type { MapGraph, MapNode, Region } from "./graph.ts";

export interface LayoutOptions {
  nodeW: number;
  nodeH: number;
  /** Vertical distance between stacked nodes. */
  rowPitch: number;
  colGap: number;
  /** Left gutter for the unit labels. */
  gutter: number;
  /** Extra space between unit rows. */
  unitGap: number;
  padding: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeW: 128,
  nodeH: 28,
  rowPitch: 34,
  colGap: 10,
  gutter: 72,
  unitGap: 18,
  padding: 12,
};

export interface PlacedNode extends MapNode {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Column (strand) index. */
  col: number;
  /** Unit row index. */
  unitRow: number;
  /** Position in its cell (0 = first taught). */
  slot: number;
}

export interface MapEdge {
  from: string;
  to: string;
  /** SVG path data. */
  d: string;
  /** Across strands: drawn dashed (contracts §4.2 rule 4). */
  crossRegion: boolean;
}

export interface MapLayout {
  nodes: PlacedNode[];
  byId: ReadonlyMap<string, PlacedNode>;
  columns: { region: Region; x: number; w: number }[];
  rows: { unit: string; title: string; track: string; y: number; h: number }[];
  edges: MapEdge[];
  width: number;
  height: number;
  options: LayoutOptions;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function edgePath(a: PlacedNode, b: PlacedNode, o: LayoutOptions): string {
  if (a.col === b.col) {
    // Same strand: a bracket in the gap on the column's left, so it never crosses the nodes between.
    const x = a.x;
    const ya = a.y + a.h / 2;
    const yb = b.y + b.h / 2;
    const bx = x - Math.min(5, o.colGap / 2);
    return `M${r1(x)},${r1(ya)} H${r1(bx)} V${r1(yb)} H${r1(x)}`;
  }
  const ax = a.x + a.w / 2;
  const bx = b.x + b.w / 2;
  if (b.y >= a.y + a.h + 2) {
    // Below: from the bottom of the prerequisite to the top of what needs it.
    const y0 = a.y + a.h;
    const y1 = b.y;
    const my = (y0 + y1) / 2;
    return `M${r1(ax)},${r1(y0)} C${r1(ax)},${r1(my)} ${r1(bx)},${r1(my)} ${r1(bx)},${r1(y1)}`;
  }
  // Same band of rows: side to side.
  const right = b.col > a.col;
  const x0 = right ? a.x + a.w : a.x;
  const x1 = right ? b.x : b.x + b.w;
  const y0 = a.y + a.h / 2;
  const y1 = b.y + b.h / 2;
  const mx = (x0 + x1) / 2;
  return `M${r1(x0)},${r1(y0)} C${r1(mx)},${r1(y0)} ${r1(mx)},${r1(y1)} ${r1(x1)},${r1(y1)}`;
}

export function layoutOak(graph: MapGraph, opts: Partial<LayoutOptions> = {}): MapLayout {
  const o: LayoutOptions = { ...DEFAULT_LAYOUT, ...opts };
  const colIndex = new Map(graph.regions.map((r, i) => [r, i]));
  const columns = graph.regions.map((region, i) => ({
    region,
    x: o.padding + o.gutter + i * (o.nodeW + o.colGap),
    w: o.nodeW,
  }));
  // Cells: unit × strand, nodes already in teaching order (buildMapGraph sorts by rank).
  const cells = new Map<string, MapNode[]>();
  for (const n of [...graph.nodes].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    const key = `${n.unit}|${n.region}`;
    const list = cells.get(key);
    if (list) list.push(n);
    else cells.set(key, [n]);
  }
  const nodes: PlacedNode[] = [];
  const rows: MapLayout["rows"] = [];
  let y = o.padding;
  graph.units.forEach((unit, unitRow) => {
    let tallest = 0;
    for (const region of graph.regions)
      tallest = Math.max(tallest, cells.get(`${unit.id}|${region}`)?.length ?? 0);
    if (tallest === 0) return;
    const h = (tallest - 1) * o.rowPitch + o.nodeH;
    for (const region of graph.regions) {
      const col = colIndex.get(region) ?? 0;
      const x = columns[col]?.x ?? 0;
      (cells.get(`${unit.id}|${region}`) ?? []).forEach((n, slot) => {
        nodes.push({ ...n, x, y: y + slot * o.rowPitch, w: o.nodeW, h: o.nodeH, col, unitRow, slot });
      });
    }
    rows.push({ unit: unit.id, title: unit.title, track: unit.track, y, h });
    y += h + o.unitGap + (o.rowPitch - o.nodeH);
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: MapEdge[] = [];
  for (const [from, to] of graph.edges) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) continue;
    edges.push({ from, to, d: edgePath(a, b, o), crossRegion: a.region !== b.region });
  }
  const lastCol = columns.at(-1);
  const width = (lastCol ? lastCol.x + lastCol.w : o.padding + o.gutter) + o.padding;
  const height = rows.length > 0 ? y - o.unitGap - (o.rowPitch - o.nodeH) + o.padding : o.padding * 2;
  return { nodes, byId, columns, rows, edges, width, height, options: o };
}

/** True when two node boxes overlap (touching edges do not count). */
export function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
