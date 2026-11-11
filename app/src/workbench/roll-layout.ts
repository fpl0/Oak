// Piano-roll layout math (ux §3.4 "Piano roll"): the time window zoomed to the content, the pitch rows
// auto-ranged to the events ±2 semitones (at least 13 rows, 10–18 px each), drum lanes for unpitched
// tracks, the bar/beat grid of the meter, note rectangles and hit testing. Pure numbers: the canvas
// component only paints what this returns.
import type { KeySpec, MeterSpec } from "@oak/content-kit";
import { inKey, rowLabel } from "./music.ts";

export interface RollInputEvent {
  id: string;
  onset: number;
  end: number;
  midi: number | null;
  s?: string;
  drum?: string;
  track: string;
}

export interface RollOptions {
  width: number;
  meter: MeterSpec;
  key: KeySpec | null;
  /** Bars analysed: the window never runs past them. */
  bars: number;
  /** Smallest window, in bars. Default 1. */
  minBars?: number;
  /** Fixed window instead of zoom-to-content: [from cycle, number of bars]. */
  window?: [number, number];
  labels?: "none" | "note" | "degree" | "degree+solfege";
  gutter?: number;
  rulerHeight?: number;
  /** Height the pitch rows aim for. Default 180. */
  pitchHeight?: number;
  laneHeight?: number;
  /** Extra events (ghost notes) that widen the pitch range. */
  extra?: readonly RollInputEvent[];
}

export interface RollRect {
  id: string;
  kind: "note" | "drum";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RowInfo {
  midi: number;
  y: number;
  label: string;
  inKey: boolean;
  tonic: boolean;
}
export interface LaneInfo {
  sound: string;
  y: number;
}
export interface GridLine {
  x: number;
  kind: "bar" | "group" | "beat" | "sub";
  /** 1-based bar number on bar lines. */
  bar?: number;
  /** Draw the bar number (thinned out when bars are narrow, so the numbers never overlap). */
  label?: boolean;
}

/** Bar-number step (1, 2, 4, 8 …) that leaves at least `minPx` per printed number. */
export function barLabelStep(pxPerBar: number, minPx = 26): number {
  for (let step = 1; step <= 1024; step *= 2) if (pxPerBar * step >= minPx) return step;
  return 1024;
}

/** Grid lines closer than this are dropped (a 64-bar roll would otherwise be a grey wash). */
export const MIN_GRID_PX = 6;

export interface RollLayout {
  width: number;
  height: number;
  gutter: number;
  rulerHeight: number;
  /** Window, in cycles. */
  from: number;
  to: number;
  pxPerCycle: number;
  pitch: { lo: number; hi: number; rowH: number; top: number; rows: RowInfo[] } | null;
  drums: { top: number; laneH: number; lanes: LaneInfo[] } | null;
  grid: GridLine[];
  rects: RollRect[];
}

const MIN_ROWS = 13;
const ROW_MIN = 10;
const ROW_MAX = 18;

/** Conventional top-to-bottom order of drum lanes. */
const DRUM_ORDER = [
  "crash",
  "ride",
  "hatOpen",
  "hatClosed",
  "tom",
  "perc",
  "shaker",
  "clap",
  "rim",
  "snare",
  "kick",
];

export function laneOrder(a: { sound: string; drum?: string }, b: { sound: string; drum?: string }): number {
  const ia = a.drum ? DRUM_ORDER.indexOf(a.drum) : -1;
  const ib = b.drum ? DRUM_ORDER.indexOf(b.drum) : -1;
  const ra = ia < 0 ? DRUM_ORDER.length : ia;
  const rb = ib < 0 ? DRUM_ORDER.length : ib;
  return ra - rb || a.sound.localeCompare(b.sound);
}

/** The window to draw: whole bars around the content, at least `minBars`, inside the analysed bars. */
export function contentWindow(
  events: readonly RollInputEvent[],
  bars: number,
  minBars = 1,
): [number, number] {
  if (events.length === 0) return [0, Math.max(1, Math.min(bars || 1, minBars))];
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const e of events) {
    lo = Math.min(lo, e.onset);
    hi = Math.max(hi, e.end);
  }
  let from = Math.max(0, Math.floor(lo + 1e-9));
  let to = Math.max(from + 1, Math.ceil(hi - 1e-9));
  if (bars > 0) to = Math.min(to, Math.max(bars, from + 1));
  if (to - from < minBars) {
    to = from + minBars;
    if (bars > 0 && to > bars) {
      to = Math.max(bars, minBars);
      from = Math.max(0, to - minBars);
    }
  }
  return [from, to];
}

/** Pitch range: events ±2 semitones, widened symmetrically to at least 13 rows. */
export function pitchRange(midis: readonly number[]): { lo: number; hi: number } | null {
  if (midis.length === 0) return null;
  let lo = Math.min(...midis) - 2;
  let hi = Math.max(...midis) + 2;
  while (hi - lo + 1 < MIN_ROWS) {
    if ((hi - lo) % 2 === 0) hi++;
    else lo--;
  }
  return { lo, hi };
}

export function rowHeight(rows: number, target: number): number {
  return Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor(target / Math.max(1, rows))));
}

/** Grid lines inside one bar, as fractions of the bar: groups (felt beats), tempo units, subdivisions. */
export function barGrid(meter: MeterSpec): { at: number; kind: "group" | "beat" | "sub" }[] {
  const out = new Map<string, { at: number; kind: "group" | "beat" | "sub" }>();
  const put = (at: number, kind: "group" | "beat" | "sub") => {
    if (at <= 0 || at >= 1) return;
    const k = at.toFixed(9);
    const rank = { group: 0, beat: 1, sub: 2 };
    const prev = out.get(k);
    if (!prev || rank[kind] < rank[prev.kind]) out.set(k, { at, kind });
  };
  const total = meter.grouping.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const g of meter.grouping) {
    acc += g;
    put(acc / total, "group");
  }
  for (let k = 1; k < meter.unitsPerBar; k++) put(k / meter.unitsPerBar, "beat");
  const subs = meter.den === 8 ? meter.num : meter.unitsPerBar * 2;
  for (let k = 1; k < subs; k++) put(k / subs, "sub");
  return [...out.values()].sort((a, b) => a.at - b.at);
}

export function layoutRoll(events: readonly RollInputEvent[], opts: RollOptions): RollLayout {
  const gutter = opts.gutter ?? 44;
  const rulerHeight = opts.rulerHeight ?? 18;
  const laneH = opts.laneHeight ?? 14;
  const [from, to] = opts.window
    ? [opts.window[0], opts.window[0] + opts.window[1]]
    : contentWindow(events, opts.bars, opts.minBars ?? 1);
  const plotW = Math.max(1, opts.width - gutter);
  const pxPerCycle = plotW / Math.max(1e-9, to - from);
  const x = (c: number) => gutter + (c - from) * pxPerCycle;

  const pitched = events.filter((e) => e.midi !== null);
  const all = [...pitched, ...(opts.extra ?? []).filter((e) => e.midi !== null)];
  const range = pitchRange(all.map((e) => Math.round(e.midi as number)));
  let y = rulerHeight;
  let pitch: RollLayout["pitch"] = null;
  if (range) {
    const rows = range.hi - range.lo + 1;
    const rowH = rowHeight(rows, opts.pitchHeight ?? 180);
    const rowInfo: RowInfo[] = [];
    for (let m = range.hi; m >= range.lo; m--) {
      rowInfo.push({
        midi: m,
        y: y + (range.hi - m) * rowH,
        label: rowLabel(m, opts.key, opts.labels ?? (opts.key ? "degree" : "note")),
        inKey: opts.key ? inKey(m, opts.key) : true,
        tonic: opts.key ? rowLabel(m, opts.key, "degree") === "1" : false,
      });
    }
    pitch = { lo: range.lo, hi: range.hi, rowH, top: y, rows: rowInfo };
    y += rows * rowH;
  }

  const unpitched = events.filter((e) => e.midi === null);
  let drums: RollLayout["drums"] = null;
  if (unpitched.length > 0) {
    const seen = new Map<string, { sound: string; drum?: string }>();
    for (const e of unpitched) {
      const sound = e.s ?? e.track;
      if (!seen.has(sound)) seen.set(sound, e.drum === undefined ? { sound } : { sound, drum: e.drum });
    }
    const ordered = [...seen.values()].sort(laneOrder);
    const top = y + (pitch ? 6 : 0);
    drums = { top, laneH, lanes: ordered.map((l, i) => ({ sound: l.sound, y: top + i * laneH })) };
    y = top + ordered.length * laneH;
  }
  const height = Math.max(y, rulerHeight + 4 * ROW_MIN) + 2;

  const grid: GridLine[] = [];
  const fullGrid = barGrid(opts.meter);
  // Keep a kind of line only if the lines of that kind and coarser are at least MIN_GRID_PX apart.
  const spacing = (kinds: readonly GridLine["kind"][]) =>
    pxPerCycle / (fullGrid.filter((g) => kinds.includes(g.kind)).length + 1);
  const keep = new Set<GridLine["kind"]>(["bar"]);
  if (spacing(["group"]) >= MIN_GRID_PX) keep.add("group");
  if (keep.has("group") && spacing(["group", "beat"]) >= MIN_GRID_PX) keep.add("beat");
  if (keep.has("beat") && spacing(["group", "beat", "sub"]) >= MIN_GRID_PX) keep.add("sub");
  const inBar = fullGrid.filter((g) => keep.has(g.kind));
  const step = barLabelStep(pxPerCycle);
  for (let b = Math.floor(from); b <= Math.ceil(to); b++) {
    if (b >= from - 1e-9 && b <= to + 1e-9)
      grid.push({ x: x(b), kind: "bar", bar: b + 1, label: b % step === 0 });
    for (const g of inBar) {
      const c = b + g.at;
      if (c > from && c < to) grid.push({ x: x(c), kind: g.kind });
    }
  }

  const rects: RollRect[] = [];
  const laneY = new Map(drums?.lanes.map((l) => [l.sound, l.y] as const) ?? []);
  for (const e of events) {
    if (e.end <= from || e.onset >= to) continue;
    const x0 = x(Math.max(from, e.onset));
    const x1 = x(Math.min(to, e.end));
    if (e.midi !== null && pitch) {
      const m = Math.round(e.midi);
      rects.push({
        id: e.id,
        kind: "note",
        x: x0,
        y: pitch.top + (pitch.hi - m) * pitch.rowH + 1,
        w: Math.max(2, x1 - x0 - 1),
        h: pitch.rowH - 2,
      });
    } else if (e.midi === null && drums) {
      const ly = laneY.get(e.s ?? e.track) ?? drums.top;
      const size = Math.min(drums.laneH - 2, 12);
      rects.push({
        id: e.id,
        kind: "drum",
        x: x0 - size / 2 + 1,
        y: ly + (drums.laneH - size) / 2,
        w: size,
        h: size,
      });
    }
  }

  return { width: opts.width, height, gutter, rulerHeight, from, to, pxPerCycle, pitch, drums, grid, rects };
}

/** Cycle under an x position. */
export function cycleAtX(layout: RollLayout, px: number): number {
  return layout.from + (px - layout.gutter) / layout.pxPerCycle;
}
/** x position of a cycle (the playhead). */
export function xOfCycle(layout: RollLayout, cycle: number): number {
  return layout.gutter + (cycle - layout.from) * layout.pxPerCycle;
}

/** The rectangle under a point; drum diamonds get a few pixels of slack. Topmost (last drawn) wins. */
export function hitTest(layout: RollLayout, px: number, py: number): string | null {
  for (let i = layout.rects.length - 1; i >= 0; i--) {
    const r = layout.rects[i] as RollRect;
    const slack = r.kind === "drum" ? 3 : 0;
    if (px >= r.x - slack && px <= r.x + r.w + slack && py >= r.y - slack && py <= r.y + r.h + slack)
      return r.id;
  }
  return null;
}

/** Playhead position inside the window for an ever-growing clock: wraps by the analysed bars. */
export function playheadCycle(audibleCycle: number, bars: number): number {
  if (bars <= 0 || !Number.isFinite(audibleCycle)) return 0;
  return ((audibleCycle % bars) + bars) % bars;
}

/** Default page length of a following roll: longer loops are shown this many bars at a time. */
export const FOLLOW_PAGE_BARS = 16;

/**
 * The window of a roll that follows the playhead on a long loop (a page of `pageBars` bars instead of the
 * whole loop squeezed into the panel). `content` is the zoom-to-content window `[from, to)`; returns null
 * when it already fits. Pages turn at whole pages so the notes never slide: while playing, the page holds the
 * playhead; while stopped, the page the learner chose (clamped). Every page has the same width, so the last
 * one starts early enough to end at `to`.
 */
export function followWindow(
  content: [number, number],
  pageBars: number,
  at: { playhead: number | null; page: number },
): { window: [number, number]; page: number; pages: number } | null {
  const [from, to] = content;
  const size = Math.max(1, Math.floor(pageBars));
  if (to - from <= size) return null;
  const pages = Math.ceil((to - from) / size);
  const page =
    at.playhead !== null && Number.isFinite(at.playhead)
      ? Math.max(0, Math.min(pages - 1, Math.floor((at.playhead - from + 1e-9) / size)))
      : Math.max(0, Math.min(pages - 1, Math.floor(at.page)));
  const start = Math.min(from + page * size, to - size);
  return { window: [start, size], page, pages };
}
