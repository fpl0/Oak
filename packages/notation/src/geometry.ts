// Staff geometry and hit-testing (Wave 3 seam, docs/design/wave3.md §3.1). The DOM layer
// (render.dom.ts `measureStaff`) measures a rendered staff once per render into a `StaffGeometry`, in the
// coordinates the pointer uses (client pixels); everything here is pure arithmetic on that object, so the
// staff-input widget's pointer → (bar, beat slot, staff step → pitch) mapping is tested in Bun.
import type { KeySpec, MeterSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { stepToPitch, xToOnset } from "./edit.ts";
import type { Staff } from "./types.ts";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One five-line (or one-line) staff of one system, as measured. */
export interface StaffBandGeometry {
  /** Which staff of the Score this is (`RH`/`LH` on a grand staff). */
  staff: Staff["id"];
  clef: Staff["clef"];
  /** System (line of music) index, 0 = top. */
  system: number;
  /** y of the top staff line and the distance between two lines. */
  topLineY: number;
  lineSpacing: number;
  /** The vertical band this staff answers to (ledger lines included; halfway to the neighbouring staff). */
  y0: number;
  y1: number;
  /**
   * Measured x range of each engraved bar on this system; `cycle` is the 0-based cycle of the bar. `ticks`
   * (from `measureStaff`) are the x of each engraved item of the staff's first voice (note-head or rest
   * centre) with its onset: abcjs spaces notes by length, not by time, so `xToOnset` interpolates between
   * them; without ticks the bar is read as linear in time.
   */
  bars: BarGeometry[];
}
/** One engraved bar of a staff band. */
export interface BarGeometry {
  x0: number;
  x1: number;
  cycle: number;
  ticks?: { x: number; onset: Rat }[];
}

/** One engraved note or chord (`n` = the `oak-e{n}` index of the render's idMap). */
export interface NoteGeometry {
  n: number;
  staff: Staff["id"];
  /** Union box of the note's glyphs (heads, stem, accidentals). */
  box: Box;
  /** One box per notehead, low to high (chord members). */
  heads: Box[];
}

export interface StaffGeometry {
  staves: StaffBandGeometry[];
  notes: NoteGeometry[];
}

export interface HitContext {
  meter: MeterSpec;
  key: KeySpec | null;
  /** Snap unit in whole notes (1/16 = a sixteenth). Default [1, 16]. */
  grid?: Rat;
}

/** Where a pointer is on the staff. */
export interface StaffHit {
  staff: Staff["id"];
  clef: Staff["clef"];
  system: number;
  /** 0-based cycle (bar) under the pointer. */
  cycle: number;
  /** The snapped onset in cycles (bar + position). */
  onset: Rat;
  /** Grid slot inside the bar, 0-based (with the default grid, sixteenth number). */
  slot: number;
  /** Half-spaces below the top line (0 = top line, 8 = bottom line; negative above, > 8 below). */
  step: number;
  /** The pitch at `step` in this clef with the key signature applied; `null` on a percussion staff. */
  pitch: SpelledPitch | null;
  /** The engraved note under the pointer, if any (`n`). */
  note: number | null;
}

function inBox(b: Box, x: number, y: number, slop: number): boolean {
  return x >= b.x - slop && x <= b.x + b.width + slop && y >= b.y - slop && y <= b.y + b.height + slop;
}

/** The staff band a y belongs to (the nearest one when y falls between bands). */
export function staffAt(geom: StaffGeometry, y: number): StaffBandGeometry | null {
  let best: StaffBandGeometry | null = null;
  let dist = Number.POSITIVE_INFINITY;
  for (const s of geom.staves) {
    if (y >= s.y0 && y <= s.y1) return s;
    const d = Math.min(Math.abs(y - s.y0), Math.abs(y - s.y1));
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

/** The note under a point: the smallest note box containing it (with `slop` pixels of tolerance). */
export function noteAt(geom: StaffGeometry, point: { x: number; y: number }, slop = 2): number | null {
  let hit: NoteGeometry | null = null;
  for (const n of geom.notes) {
    if (!inBox(n.box, point.x, point.y, slop)) continue;
    if (!hit || n.box.width * n.box.height < hit.box.width * hit.box.height) hit = n;
  }
  return hit ? hit.n : null;
}

/** The chord member under a point: the index (low to high) of the nearest notehead, or `null`. */
export function headAt(note: NoteGeometry, point: { x: number; y: number }): number | null {
  let best = -1;
  let dist = Number.POSITIVE_INFINITY;
  note.heads.forEach((h, i) => {
    const d = Math.hypot(h.x + h.width / 2 - point.x, h.y + h.height / 2 - point.y);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best < 0 ? null : best;
}

/** Pointer → (staff, bar, beat slot, staff step → pitch, note under it). `null` outside every bar. */
export function hitTest(
  geom: StaffGeometry,
  point: { x: number; y: number },
  ctx: HitContext,
): StaffHit | null {
  const band = staffAt(geom, point.y);
  if (!band) return null;
  const grid = ctx.grid ?? ([1, 16] as Rat);
  const onset = xToOnset(point.x, band.bars, ctx.meter, grid);
  if (!onset) return null;
  const cycle = R.floor(onset);
  const inBar = R.sub(onset, [cycle, 1]);
  const W = rat(ctx.meter.num, ctx.meter.den);
  const slot = Math.round(R.toNum(R.div(R.mul(inBar, W), grid)));
  const step = Math.round(((point.y - band.topLineY) * 2) / band.lineSpacing);
  const pitch = band.clef === "perc" ? null : stepToPitch(step, band.clef, ctx.key);
  return {
    staff: band.staff,
    clef: band.clef,
    system: band.system,
    cycle,
    onset,
    slot,
    step,
    pitch,
    note: noteAt(geom, point),
  };
}

/** The y of a staff step on a band (inverse of the step arithmetic): where a ghost note is drawn. */
export function stepY(band: Pick<StaffBandGeometry, "topLineY" | "lineSpacing">, step: number): number {
  return band.topLineY + (step * band.lineSpacing) / 2;
}

/** The x of an onset on a band (inverse of `xToOnset` without snapping); `null` when the bar is not on it. */
export function onsetX(band: Pick<StaffBandGeometry, "bars">, onset: Rat): number | null {
  const cycle = R.floor(onset);
  const bar = band.bars.find((b) => b.cycle === cycle);
  if (!bar) return null;
  const frac = R.toNum(R.sub(onset, [cycle, 1]));
  const pts = barPoints(bar);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as [number, number];
    const b = pts[i] as [number, number];
    if (frac <= b[1] + 1e-12)
      return b[1] === a[1] ? b[0] : a[0] + ((frac - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
  }
  return bar.x1;
}

/** The (x, fraction of the bar) points of a bar: its start, each tick, its end; fractions never decrease. */
export function barPoints(bar: BarGeometry): [number, number][] {
  const pts: [number, number][] = [[bar.x0, 0]];
  for (const t of [...(bar.ticks ?? [])].sort((a, b) => a.x - b.x)) {
    const f = R.toNum(R.sub(t.onset, [bar.cycle, 1]));
    const last = pts[pts.length - 1] as [number, number];
    if (f >= last[1] && f < 1 && t.x > last[0]) pts.push([t.x, f]);
  }
  pts.push([Math.max(bar.x1, (pts[pts.length - 1] as [number, number])[0]), 1]);
  return pts;
}
/** The fraction of the bar at `x` (piecewise linear between the bar's points), clamped to 0 … 1. */
export function barFraction(bar: BarGeometry, x: number): number {
  const pts = barPoints(bar);
  if (x <= (pts[0] as [number, number])[0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as [number, number];
    const b = pts[i] as [number, number];
    if (x <= b[0]) return b[0] === a[0] ? b[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return 1;
}

/**
 * Thrown by a seam whose body is not written yet. Since Wave 3 `measureStaff` and `placeAnnotations` are
 * built and nothing in the package throws it; it stays exported so callers that catch it keep compiling.
 */
export class NotationNotBuiltError extends Error {
  readonly code = "notation_not_built";
  constructor(what: string) {
    super(`@oak/notation: ${what} is not built yet (Wave 3, docs/design/wave3.md §3.1)`);
    this.name = "NotationNotBuiltError";
  }
}
