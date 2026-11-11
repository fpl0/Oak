// The thumbnail's geometry: the same strand × unit grid as the map, compressed so each leaf is a dot and
// the whole course fits a 180 to 240 px card. Pure and tested (no overlaps, deterministic).
import type { MapGraph } from "./graph.ts";

export interface GlanceDot {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface GlanceLayout {
  width: number;
  height: number;
  dots: GlanceDot[];
  /** Unit row bands (for the "now" band). */
  rows: { unit: string; y: number; h: number }[];
}

/** Dots per row inside one strand cell before it wraps onto a second line. */
const PER_LINE = 5;

export function glanceLayout(graph: MapGraph, width: number): GlanceLayout {
  const cols = Math.max(1, graph.regions.length);
  const pad = 2;
  const colW = (width - pad * 2) / cols;
  const pitch = Math.max(3, Math.min(6, (colW - 2) / PER_LINE));
  const r = pitch * 0.38;
  const colIndex = new Map(graph.regions.map((g, i) => [g, i]));
  const cells = new Map<string, string[]>();
  for (const n of [...graph.nodes].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    const k = `${n.unit}|${n.region}`;
    const list = cells.get(k);
    if (list) list.push(n.id);
    else cells.set(k, [n.id]);
  }
  const dots: GlanceDot[] = [];
  const rows: GlanceLayout["rows"] = [];
  let y = pad;
  for (const u of graph.units) {
    let lines = 0;
    for (const g of graph.regions)
      lines = Math.max(lines, Math.ceil((cells.get(`${u.id}|${g}`)?.length ?? 0) / PER_LINE));
    if (lines === 0) continue;
    for (const g of graph.regions) {
      const col = colIndex.get(g) ?? 0;
      (cells.get(`${u.id}|${g}`) ?? []).forEach((id, i) => {
        dots.push({
          id,
          x: pad + col * colW + 1 + (i % PER_LINE) * pitch + pitch / 2,
          y: y + Math.floor(i / PER_LINE) * pitch + pitch / 2,
          r,
        });
      });
    }
    const h = lines * pitch;
    rows.push({ unit: u.id, y, h });
    y += h + 1.5;
  }
  return { width, height: Math.ceil(y + pad), dots, rows };
}
