// Keyboard navigation between leaves (ux §5.2: arrows move between leaves, Enter opens the inspector) and the
// pan/zoom arithmetic of the map viewport. Pure.
import type { MapLayout, PlacedNode } from "./layout.ts";

export type Direction = "up" | "down" | "left" | "right";

const centre = (n: PlacedNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/**
 * The leaf an arrow key moves to. Up/down stay in the strand column (the nearest leaf above or below);
 * left/right move to the nearest leaf in the closest column that has one, preferring the same height.
 * Returns `null` at an edge.
 */
export function neighbour(layout: MapLayout, id: string, dir: Direction): string | null {
  const from = layout.byId.get(id);
  if (!from) return layout.nodes[0]?.id ?? null;
  const c = centre(from);
  if (dir === "up" || dir === "down") {
    const sign = dir === "down" ? 1 : -1;
    let best: PlacedNode | null = null;
    for (const n of layout.nodes) {
      if (n.col !== from.col || n.id === from.id) continue;
      const dy = (centre(n).y - c.y) * sign;
      if (dy <= 0) continue;
      if (!best || dy < (centre(best).y - c.y) * sign) best = n;
    }
    return best?.id ?? null;
  }
  const step = dir === "right" ? 1 : -1;
  const cols = layout.columns.length;
  for (let col = from.col + step; col >= 0 && col < cols; col += step) {
    let best: PlacedNode | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const n of layout.nodes) {
      if (n.col !== col) continue;
      const d = Math.abs(centre(n).y - c.y);
      if (d < bestD || (d === bestD && best && n.y < best.y)) {
        best = n;
        bestD = d;
      }
    }
    if (best) return best.id;
  }
  return null;
}

// --- viewport ---------------------------------------------------------------------------------------------

export interface View {
  /** Scale. */
  k: number;
  /** Translation in screen pixels. */
  tx: number;
  ty: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps at least `keep` px of the map on screen in each direction, and never lets a small map drift. */
export function clampView(
  v: View,
  layout: Pick<MapLayout, "width" | "height">,
  vw: number,
  vh: number,
): View {
  const w = layout.width * v.k;
  const h = layout.height * v.k;
  const keep = 80;
  const tx = w <= vw ? clamp(v.tx, 0, vw - w) : clamp(v.tx, vw - w - keep, keep);
  const ty = h <= vh ? clamp(v.ty, 0, Math.max(0, vh - h)) : clamp(v.ty, vh - h - keep, keep);
  return { k: v.k, tx, ty };
}

/** Fit the map's width to the viewport (legible by default: the scale stays within 0.85–1.15). */
export function fitWidth(layout: Pick<MapLayout, "width" | "height">, vw: number, vh: number): View {
  const k = clamp(vw / layout.width, 0.85, 1.15);
  const tx = Math.max(0, (vw - layout.width * k) / 2);
  return clampView({ k, tx, ty: 0 }, layout, vw, vh);
}

/** The whole map on screen (the `0` key's "fit"). */
export function fitAll(layout: Pick<MapLayout, "width" | "height">, vw: number, vh: number): View {
  const k = clamp(Math.min(vw / layout.width, vh / layout.height), ZOOM_MIN, ZOOM_MAX);
  return {
    k,
    tx: Math.max(0, (vw - layout.width * k) / 2),
    ty: Math.max(0, (vh - layout.height * k) / 2),
  };
}

/** Zoom by `factor` keeping the map point under (px, py) still. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = clamp(v.k * factor, ZOOM_MIN, ZOOM_MAX);
  const f = k / v.k;
  return { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f };
}

/**
 * Pans the least distance that brings `rect` (map coordinates) fully into the visible area, leaving `margin`
 * px and keeping clear of a panel `rightInset` px wide on the right.
 */
export function ensureVisible(
  v: View,
  rect: { x: number; y: number; w: number; h: number },
  vw: number,
  vh: number,
  margin = 24,
  rightInset = 0,
): View {
  const left = rect.x * v.k + v.tx;
  const top = rect.y * v.k + v.ty;
  const right = left + rect.w * v.k;
  const bottom = top + rect.h * v.k;
  const maxRight = vw - rightInset - margin;
  let { tx, ty } = v;
  if (left < margin) tx += margin - left;
  else if (right > maxRight) tx -= Math.min(right - maxRight, left - margin);
  if (top < margin) ty += margin - top;
  else if (bottom > vh - margin) ty -= Math.min(bottom - (vh - margin), top - margin);
  return { k: v.k, tx, ty };
}
