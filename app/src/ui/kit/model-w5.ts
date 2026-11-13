// Pure logic behind the Wave 5 kit pieces (SectionRibbon, BarGrid, LineChart, ScopeFrame, ControlReadout), kept
// apart from React so the rules are unit-tested (model-w5.test.ts).
import { snapValue } from "./model.ts";

// --- bars -----------------------------------------------------------------------------------------

/**
 * The bar number a learner reads for a 0-based bar index. With a pickup, bar 0 is the pickup and bars count from
 * the first full bar (contracts §6.10, carry-over c4), so index 1 is "bar 1"; without one, index 0 is "bar 1".
 * The pickup itself has no number (`null`).
 */
export function barNumber(index: number, pickup = false): number | null {
  if (pickup) return index === 0 ? null : index;
  return index + 1;
}

/** "bar 5", "bars 5–8", "the pickup", "the pickup and bars 1–4". */
export function barSpanText(startBar: number, bars: number, pickup = false): string {
  const n = Math.max(1, Math.round(bars));
  const first = barNumber(startBar, pickup);
  const last = barNumber(startBar + n - 1, pickup);
  if (first === null) {
    if (last === null) return "the pickup";
    return last === 1 ? "the pickup and bar 1" : `the pickup and bars 1–${last}`;
  }
  return first === last ? `bar ${first}` : `bars ${first}–${last}`;
}

// --- section ribbon --------------------------------------------------------------------------------

/** What the ribbon needs of a section (a `FormViewSection` from app/src/lib/form-view.ts fits as is). */
export interface RibbonSection {
  /** Unique within the piece: "verse", "chorus2". */
  tag: string;
  /** What the block prints: "Verse", "Chorus 2". */
  text: string;
  /** A, B, A, B by first appearance. */
  letter: string;
  /** 0-based first bar and length in bars. */
  startBar: number;
  bars: number;
  /** Mean energy 0–1, drawn as the block's fill; absent: no fill. */
  energy?: number;
}

/** The bars the ribbon spans: the given total, or the end of the last section when that is later. */
export function ribbonSpan(sections: readonly RibbonSection[], totalBars?: number): number {
  const end = sections.reduce((m, s) => Math.max(m, s.startBar + Math.max(1, s.bars)), 0);
  return Math.max(1, Math.round(totalBars ?? 0), end);
}

/** A letter's tone among the six part colours (A = 0, B = 1 …, wrapping); never the only cue (the letter shows). */
export function letterTone(letter: string): number {
  const c = letter.trim().toUpperCase().charCodeAt(0);
  return Number.isFinite(c) && c >= 65 && c <= 90 ? (c - 65) % 6 : 0;
}

export type RibbonKeyAction =
  | { kind: "move"; index: number }
  | { kind: "loop"; index: number }
  | { kind: "stop" }
  | null;

/**
 * The action of a key on a focused section (one tab stop for the ribbon): arrows move, Home/End go to the ends,
 * Enter or Space loops the focused section (again: stops), Escape stops the loop. Modified keys are not the
 * ribbon's (the global keymap's).
 */
export function ribbonKey(
  e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  index: number,
  count: number,
  looping: boolean,
): RibbonKeyAction {
  if (count === 0 || e.altKey || e.ctrlKey || e.metaKey) return null;
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return { kind: "move", index: clamp(index + 1) };
    case "ArrowLeft":
    case "ArrowUp":
      return { kind: "move", index: clamp(index - 1) };
    case "Home":
      return { kind: "move", index: 0 };
    case "End":
      return { kind: "move", index: count - 1 };
    case "Enter":
    case " ":
      return looping ? { kind: "stop" } : { kind: "loop", index: clamp(index) };
    case "Escape":
      return { kind: "stop" };
    default:
      return null;
  }
}

/** The accessible name of a section block. */
export function sectionName(s: RibbonSection, pickup = false, looping = false, playing = false): string {
  const parts = [`${s.text} (${s.letter})`, barSpanText(s.startBar, s.bars, pickup)];
  if (s.energy !== undefined) parts.push(`energy ${percent(s.energy)}`);
  if (playing) parts.push("playing now");
  if (looping) parts.push("looping");
  return parts.join(", ");
}

// --- bar grid -------------------------------------------------------------------------------------

/**
 * The cell a key moves to in a grid of `count` cells, `perRow` a line (a 12-bar chart: 3 lines of 4). Arrows move
 * one cell (left/right cross line ends), up/down one line, Home/End the line's ends, Mod+Home/End the grid's ends.
 * `null`: not a grid key.
 */
export function gridMove(
  e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  index: number,
  count: number,
  perRow: number,
): number | null {
  if (count === 0 || e.altKey) return null;
  const row = Math.max(1, perRow);
  const mod = Boolean(e.ctrlKey || e.metaKey);
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  const lineStart = index - (index % row);
  switch (e.key) {
    case "ArrowRight":
      return mod ? null : clamp(index + 1);
    case "ArrowLeft":
      return mod ? null : clamp(index - 1);
    case "ArrowDown":
      return mod ? null : index + row < count ? index + row : index;
    case "ArrowUp":
      return mod ? null : index - row >= 0 ? index - row : index;
    case "Home":
      return mod ? 0 : lineStart;
    case "End":
      return mod ? count - 1 : clamp(lineStart + row - 1);
    default:
      return null;
  }
}

/** The lines of a grid: `[[0,1,2,3],[4,5,6,7],[8,9,10,11]]` for 12 cells, 4 a line. */
export function gridRows(count: number, perRow: number): number[][] {
  const row = Math.max(1, Math.round(perRow));
  const out: number[][] = [];
  for (let i = 0; i < Math.max(0, count); i += row)
    out.push(Array.from({ length: Math.min(row, count - i) }, (_, k) => i + k));
  return out;
}

// --- line chart -----------------------------------------------------------------------------------

/** Points of a series in a 0–1 box (x left to right, y up), each value clamped to [min, max]. */
export function chartPoints(values: readonly number[], min = 0, max = 1): [number, number][] {
  const n = values.length;
  const span = max - min || 1;
  return values.map((v, i) => {
    const x = n <= 1 ? 0.5 : i / (n - 1);
    const y = (Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)) - min) / span;
    return [x, y];
  });
}

/** An SVG path through the points, in a `w × h` box with y downwards; `area` closes it to the baseline. */
export function chartPath(points: readonly [number, number][], w: number, h: number, area = false): string {
  if (points.length === 0) return "";
  const xy = points.map(([x, y]) => `${round2(x * w)} ${round2(h - y * h)}`);
  const line = `M ${xy.join(" L ")}`;
  if (!area) return line;
  const first = points[0] as [number, number];
  const last = points[points.length - 1] as [number, number];
  return `${line} L ${round2(last[0] * w)} ${h} L ${round2(first[0] * w)} ${h} Z`;
}

/** One sentence that says what the chart shows, for its accessible name. */
export function chartSummary(
  values: readonly number[],
  labels: readonly string[] | undefined,
  what: string,
  format: (v: number) => string = percent,
): string {
  if (values.length === 0) return `${what}: nothing to show yet.`;
  let lo = 0;
  let hi = 0;
  values.forEach((v, i) => {
    if (v < (values[lo] as number)) lo = i;
    if (v > (values[hi] as number)) hi = i;
  });
  const at = (i: number) => labels?.[i] ?? `point ${i + 1}`;
  if (lo === hi || values[lo] === values[hi])
    return `${what}: level at ${format(values[0] as number)} throughout.`;
  return `${what}: lowest ${format(values[lo] as number)} at ${at(lo)}, highest ${format(values[hi] as number)} at ${at(hi)}.`;
}

export function percent(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)} %`;
}

// --- scales and axes (the scope / spectrum frame) --------------------------------------------------

export type AxisScale = "linear" | "log";

export interface AxisSpec {
  scale: AxisScale;
  min: number;
  max: number;
  /** "Hz", "s", "ms", "dB" or "" (plain numbers). */
  unit: string;
  /** The axis name read by screen readers and shown beside the ticks ("Frequency"). */
  label: string;
  /** Explicit tick values; default: nice ticks for the scale. */
  ticks?: readonly number[];
}

/** Position 0–1 of `v` on an axis (clamped). */
export function axisFraction(v: number, a: Pick<AxisSpec, "scale" | "min" | "max">): number {
  if (a.scale === "log") {
    const lo = Math.log(Math.max(1e-9, a.min));
    const hi = Math.log(Math.max(1e-9, a.max));
    const f = (Math.log(Math.max(1e-9, v)) - lo) / (hi - lo || 1);
    return Math.min(1, Math.max(0, f));
  }
  return Math.min(1, Math.max(0, (v - a.min) / (a.max - a.min || 1)));
}

/** The value at position 0–1 on an axis. */
export function axisValue(f: number, a: Pick<AxisSpec, "scale" | "min" | "max">): number {
  const t = Math.min(1, Math.max(0, f));
  if (a.scale === "log") {
    const lo = Math.log(Math.max(1e-9, a.min));
    const hi = Math.log(Math.max(1e-9, a.max));
    return Math.exp(lo + t * (hi - lo));
  }
  return a.min + t * (a.max - a.min);
}

/** About `count` round ticks over [min, max] (1, 2, 2.5 or 5 × a power of ten), inclusive where they land. */
export function linearTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min) || count < 1) return [min];
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const places = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    out.push(Number(v.toFixed(places)));
  return out;
}

/** Ticks of a log axis: 1, 2, 5 × each power of ten inside [min, max] (20 50 100 200 500 1k … for Hz). */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const out: number[] = [];
  for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++)
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(Number(v.toPrecision(3)));
    }
  return out;
}

export function axisTicks(a: AxisSpec): number[] {
  if (a.ticks) return [...a.ticks];
  return a.scale === "log" ? logTicks(a.min, a.max) : linearTicks(a.min, a.max, 4);
}

/** A value with its unit as Oak prints it: "440 Hz", "1.2 kHz", "250 ms", "0.8 s", "−12 dB", "0.25". */
export function unitLabel(v: number, unit: string, opts: { compact?: boolean } = {}): string {
  const sp = opts.compact ? "" : " ";
  const minus = (s: string) => s.replace(/^-/, "−");
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "Hz": {
      if (Math.abs(v) >= 1000) return minus(`${trim(v / 1000, v >= 10_000 ? 0 : 1)}${sp}kHz`);
      return minus(`${trim(v, Math.abs(v) < 10 ? 1 : 0)}${sp}Hz`);
    }
    case "s":
      if (Math.abs(v) < 1 && v !== 0) return minus(`${trim(v * 1000, Math.abs(v) < 0.01 ? 1 : 0)}${sp}ms`);
      return minus(`${trim(v, 2)}${sp}s`);
    case "ms":
      return minus(`${trim(v, Math.abs(v) < 10 ? 1 : 0)}${sp}ms`);
    case "dB":
      return minus(`${trim(v, Math.abs(v) < 10 ? 1 : 0)}${sp}dB`);
    case "%":
      return `${Math.round(v * 100)}${sp}%`;
    default:
      return minus(trim(v, Math.abs(v) < 1 ? 3 : Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0));
  }
}

/**
 * Which tick labels to print so none overlap: `positions` are the label centres in px (the first label is drawn
 * from its left edge and the last up to its right edge, as the frame anchors them), `widths` their widths. The
 * first and the last are kept whenever they fit together; the rest greedily from the left with `gap` px between.
 */
export function thinTicks(positions: readonly number[], widths: readonly number[], gap = 6): boolean[] {
  const n = positions.length;
  const span = (i: number): [number, number] => {
    const p = positions[i] ?? 0;
    const w = widths[i] ?? 0;
    if (i === 0 && n > 1) return [p, p + w];
    if (i === n - 1 && n > 1) return [p - w, p];
    return [p - w / 2, p + w / 2];
  };
  const keep = positions.map(() => false);
  if (n === 0) return keep;
  keep[0] = true;
  let right = span(0)[1];
  const last = n - 1;
  const lastLeft = span(last)[0];
  for (let i = 1; i < last; i++) {
    const [l, r] = span(i);
    if (l >= right + gap && r + gap <= lastLeft) {
      keep[i] = true;
      right = r;
    }
  }
  // Middle labels stop short of the last one, so only a first label it touches can push the last out.
  if (n > 1) keep[last] = lastLeft >= right + gap;
  return keep;
}

/** About how wide a tick label is in px at the frame's 11 px tabular text. */
export function labelWidth(text: string): number {
  return Math.ceil(text.length * 6.2);
}

/**
 * The redraw interval of a live canvas: none (every animation frame) normally; 100 ms (at most 10 a second,
 * docs/design/wave5.md §4.4) under reduced motion.
 */
export function frameInterval(reducedMotion: boolean): number {
  return reducedMotion ? 100 : 0;
}

// --- control read-out (the A1 sound lessons: cutoff, resonance, attack, release, delay…) ------------

export interface ControlSpec {
  min: number;
  max: number;
  scale: AxisScale;
  /**
   * Linear: the arrow step, Alt the fine step, Shift / PageUp / PageDown the coarse step (as FineSlider).
   * Log: the steps are fractions of an octave (a doubling): default 1/12, fine 1/48, coarse 1.
   */
  step?: number;
  fine?: number;
  coarse?: number;
}

const LOG_STEPS = { step: 1 / 12, fine: 1 / 48, coarse: 1 };

/** A log value rounded to three significant figures (800, 1210, 0.0123), so steps read as numbers people write. */
export function roundSignificant(v: number, digits = 3): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  return Number(v.toPrecision(digits));
}

/** Clamps and rounds a control value to its grid (linear) or to three significant figures (log). */
export function snapControl(v: number, spec: ControlSpec): number {
  if (spec.scale === "log") return Math.min(spec.max, Math.max(spec.min, roundSignificant(v)));
  const step = spec.step ?? (spec.max - spec.min) / 100;
  return snapValue(v, spec.min, spec.max, Math.min(step, spec.fine ?? step));
}

/** The value a key press moves the control to, or `null` when the key is not the control's. */
export function controlKeyValue(
  e: { key: string; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  value: number,
  spec: ControlSpec,
): number | null {
  if (e.metaKey || e.ctrlKey) return null;
  const log = spec.scale === "log";
  const step = spec.step ?? (log ? LOG_STEPS.step : (spec.max - spec.min) / 100);
  const fine = spec.fine ?? (log ? LOG_STEPS.fine : step);
  const coarse = spec.coarse ?? (log ? LOG_STEPS.coarse : step * 10);
  const delta = e.altKey ? fine : e.shiftKey ? coarse : step;
  const move = (d: number) => {
    if (!log) return snapControl(value + d, spec);
    const next = snapControl(value * 2 ** d, spec);
    // Three significant figures can round a tiny step back onto the same value: take one more digit then.
    if (next !== value || d === 0) return next;
    return Math.min(spec.max, Math.max(spec.min, roundSignificant(value * 2 ** d, 4)));
  };
  switch (e.key) {
    case "ArrowRight":
    case "ArrowUp":
      return move(delta);
    case "ArrowLeft":
    case "ArrowDown":
      return move(-delta);
    case "PageUp":
      return move(coarse);
    case "PageDown":
      return move(-coarse);
    case "Home":
      return spec.min;
    case "End":
      return spec.max;
    default:
      return null;
  }
}

/** The value under a pointer at `fraction` of the track. */
export function controlPointerValue(fraction: number, spec: ControlSpec): number {
  return snapControl(axisValue(fraction, spec), spec);
}

// --- helpers --------------------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `n` with at most `places` decimals and no trailing zeros. */
function trim(n: number, places: number): string {
  return String(Number(n.toFixed(places)));
}
