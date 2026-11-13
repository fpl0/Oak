// Transcribe's time arithmetic (ux §9 Transcription Studio "BeatGrid"; contracts §6.12): tap tempo, the bar grid
// laid over the learner's audio from its tempo and first downbeat, the A–B loop set at the playhead, and the
// transport steps (rate ±5 %, ±1 semitone, ±5 cents). Pure, so every rule is unit-tested.
import type { MeterId } from "@oak/content-kit";
import { barSeconds, METERS } from "@oak/theory";

/** Transcribe's rate range (contracts §6.12: 25–100 %; `TranscriptionSettingsSchema.rate` stores at most 1). */
export const RATE_MIN = 0.25;
export const RATE_MAX = 1;
export const RATE_STEP = 0.05;
export const SEMITONE_MIN = -12;
export const SEMITONE_MAX = 12;
export const CENTS_MIN = -50;
export const CENTS_MAX = 50;
export const CENTS_STEP = 5;
/** Taps kept for tap tempo (ux §9: "tap tempo (`T`, 8 taps)"). */
export const TAPS_KEPT = 8;
/** A pause longer than this starts a new tap run. */
export const TAP_RESET_SEC = 2.5;
export const BPM_MIN = 30;
export const BPM_MAX = 300;
/** Shortest A–B loop the transport accepts, seconds. */
export const MIN_LOOP_SEC = 0.1;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, step: number) => Math.round(x / step) * step;

export const stepRate = (rate: number, dir: 1 | -1): number =>
  Math.round(clamp(round(rate, RATE_STEP) + dir * RATE_STEP, RATE_MIN, RATE_MAX) * 100) / 100;
export const clampRate = (rate: number): number =>
  Math.round(clamp(Number.isFinite(rate) ? rate : 1, RATE_MIN, RATE_MAX) * 100) / 100;
export const stepSemitones = (st: number, dir: 1 | -1): number =>
  clamp(Math.round(st) + dir, SEMITONE_MIN, SEMITONE_MAX);
export const stepCents = (c: number, dir: 1 | -1): number =>
  clamp(round(c, CENTS_STEP) + dir * CENTS_STEP, CENTS_MIN, CENTS_MAX);

export const formatRate = (rate: number): string => `${Math.round(rate * 100)} %`;
export const formatSemitones = (st: number): string =>
  st === 0 ? "0 st" : `${st > 0 ? "+" : "−"}${Math.abs(st)} st`;
export const formatCents = (c: number): string => (c === 0 ? "0¢" : `${c > 0 ? "+" : "−"}${Math.abs(c)}¢`);

/** m:ss.s */
export function formatTime(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1)}`;
}

// --- tap tempo ---------------------------------------------------------------------------------------

/** Adds a tap (source seconds) to a run: a long pause, or a tap that goes back in time, starts a new run. */
/** Longest gap between the engine's position updates that the playhead is extrapolated across (seconds). */
export const STAMP_FRESH_SEC = 0.25;

/**
 * The playhead now, between the engine's position updates: the last update (`stamp`: its time and the
 * `performance.now()` it came at) moved on at the playback rate, capped at the end. With no update yet, or one
 * older than `STAMP_FRESH_SEC` (playback just started or resumed; the stamp is the paused position), it is the
 * transport's own time: extrapolating from a stale stamp jumped ahead, and the next tap reset the tap run.
 */
export function playheadAt(
  stamp: { t: number; at: number },
  nowMs: number,
  time: number,
  rate: number,
  durationS: number,
): number {
  if (stamp.at <= 0 || nowMs - stamp.at > STAMP_FRESH_SEC * 1000) return time;
  return Math.min(durationS, stamp.t + ((nowMs - stamp.at) / 1000) * rate);
}

export function addTap(taps: readonly number[], t: number): number[] {
  const last = taps.at(-1);
  if (last !== undefined && (t - last > TAP_RESET_SEC || t <= last)) return [t];
  return [...taps, t].slice(-TAPS_KEPT);
}

/**
 * Seconds per beat of a tap run: the least-squares slope of tap time against tap number (steadier than the mean
 * gap when one tap is early). `null` with fewer than 3 taps.
 */
export function beatSecOf(taps: readonly number[]): number | null {
  const n = taps.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = taps.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * ((taps[i] as number) - my);
    den += (i - mx) ** 2;
  }
  const slope = num / den;
  return slope > 0 ? slope : null;
}

/** BPM (in the meter's tempo unit, one tap per unit) from a tap run, to one decimal; `null` until 3 taps. */
export function bpmFromTaps(taps: readonly number[]): number | null {
  const beat = beatSecOf(taps);
  if (beat === null) return null;
  const bpm = 60 / beat;
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return Math.round(bpm * 10) / 10;
}

/**
 * The first downbeat from a tap run whose first tap the learner put on a bar's first beat: the fitted time of
 * tap 0 (so one early tap does not move the grid).
 */
export function downbeatFromTaps(taps: readonly number[]): number | null {
  const beat = beatSecOf(taps);
  if (beat === null) return null;
  const n = taps.length;
  const mean = taps.reduce((a, b) => a + b, 0) / n;
  return Math.max(0, mean - beat * ((n - 1) / 2));
}

// --- the bar grid -------------------------------------------------------------------------------------

export interface BarGrid {
  /** Source seconds of bar 1's first beat. */
  downbeatS: number;
  /** Seconds per bar at rate 1. */
  barSec: number;
}

export function gridOf(bpm: number | null, meter: MeterId | null, downbeatS: number | null): BarGrid | null {
  if (bpm === null || !(bpm > 0)) return null;
  return { downbeatS: Math.max(0, downbeatS ?? 0), barSec: barSeconds(bpm, METERS[meter ?? "4/4"]) };
}

/** 0-based bar at source time `t` (fractional; negative before the first downbeat). */
export const barAt = (grid: BarGrid, t: number): number => (t - grid.downbeatS) / grid.barSec;
/** Source time of 0-based bar `bar`'s line. */
export const timeOfBar = (grid: BarGrid, bar: number): number => grid.downbeatS + bar * grid.barSec;

/** Bar lines (source seconds) inside [0, durationS]; bars before the first downbeat are left out. */
export function barLines(grid: BarGrid, durationS: number): { bar: number; t: number }[] {
  const out: { bar: number; t: number }[] = [];
  for (let b = 0; ; b++) {
    const t = timeOfBar(grid, b);
    if (t > durationS + 1e-9 || b > 4000) break;
    out.push({ bar: b, t });
  }
  return out;
}

/**
 * Which bars carry a number on the waveform: every bar when there is room, otherwise every 2nd, 4th, 8th … bar, so
 * the numbers never run into each other (a 40-minute song at fit shows a few dozen, not 1200 on top of each other).
 */
export function barLabelEvery(pxPerBar: number, bars = 99): number {
  if (!(pxPerBar > 0)) return 1;
  // Room for the widest number: "1201" needs more than "9".
  const minPx = 12 + 8 * String(Math.max(1, Math.round(bars))).length;
  let k = 1;
  while (k * pxPerBar < minPx && k < 4096) k *= 2;
  return k;
}

/** Previous / next bar line from `t` (Alt+←/→): a time just after a line counts as on it. */
export function stepBar(grid: BarGrid, t: number, dir: 1 | -1, durationS: number): number {
  const at = barAt(grid, t);
  const near = Math.round(at);
  const onLine = Math.abs(at - near) < 0.02;
  const bar = dir > 0 ? (onLine ? near + 1 : Math.ceil(at)) : onLine ? near - 1 : Math.floor(at);
  return clamp(timeOfBar(grid, Math.max(0, bar)), 0, durationS);
}

// --- the A–B loop -----------------------------------------------------------------------------------

export interface Loop {
  startS: number;
  endS: number;
}

/** A and B in either order, inside the file, at least `MIN_LOOP_SEC` long; otherwise `null`. */
export function loopOf(a: number, b: number, durationS: number): Loop | null {
  const s = clamp(Math.min(a, b), 0, durationS);
  const e = clamp(Math.max(a, b), 0, durationS);
  return e - s >= MIN_LOOP_SEC ? { startS: s, endS: e } : null;
}

/**
 * `[` and `]` at the playhead (ux §7.10): `[` moves A, `]` moves B. With no loop yet, `[` starts one from the
 * playhead to a bar later (or 4 s), `]` ends one that runs from the start of the file.
 */
export function setLoopPoint(
  loop: Loop | null,
  which: "A" | "B",
  t: number,
  durationS: number,
  grid: BarGrid | null,
): Loop | null {
  const span = grid ? grid.barSec : 4;
  if (which === "A") return loopOf(t, loop && loop.endS > t ? loop.endS : t + span, durationS);
  return loopOf(loop && loop.startS < t ? loop.startS : Math.max(0, t - span), t, durationS);
}

/** The loop snapped to whole bars of the grid (pattern sources loop in bars). */
export function snapLoop(loop: Loop, grid: BarGrid): { fromBar: number; bars: number } {
  const a = Math.floor(barAt(grid, loop.startS) + 1e-6);
  const b = Math.ceil(barAt(grid, loop.endS) - 1e-6);
  const fromBar = Math.max(0, a);
  return { fromBar, bars: Math.max(1, b - fromBar) };
}

/**
 * Seconds a loop end may sit off a bar line and still count as on it: a bar loop stays a bar loop when the learner
 * then nudges bar 1 by 10 ms, or sets it with taps.
 */
const ON_LINE_SEC = 0.03;

/** Whether both ends of a loop sit on the grid's bar lines. */
export function onBarLines(loop: Loop, grid: BarGrid): boolean {
  const off = (t: number) => {
    const b = barAt(grid, t);
    return Math.abs(b - Math.round(b)) * grid.barSec;
  };
  return off(loop.startS) <= ON_LINE_SEC && off(loop.endS) <= ON_LINE_SEC;
}

/**
 * The loop in bars of the grid, exactly: fractional when it does not sit on bar lines (half a beat in bar 3 is
 * `{ fromBar: 2.25, bars: 0.125 }`). Own audio loops what the learner marked, never a whole bar around it.
 */
export function loopInBars(loop: Loop, grid: BarGrid): { fromBar: number; bars: number } {
  if (onBarLines(loop, grid)) return barsOfLoop(loop, grid);
  return { fromBar: barAt(grid, loop.startS), bars: (loop.endS - loop.startS) / grid.barSec };
}

/**
 * The whole bars a loop covers: the nearest lines when it sits on them (a few ms off after a nudge of bar 1),
 * otherwise every bar it touches (`snapLoop`).
 */
export function barsOfLoop(loop: Loop, grid: BarGrid): { fromBar: number; bars: number } {
  if (!onBarLines(loop, grid)) return snapLoop(loop, grid);
  const fromBar = Math.max(0, Math.round(barAt(grid, loop.startS)));
  return { fromBar, bars: Math.max(1, Math.round(barAt(grid, loop.endS)) - fromBar) };
}

/** Bars of the material as a loop in seconds (pattern sources: bar `fromBar` for `bars`). */
export const loopOfBars = (grid: BarGrid, fromBar: number, bars: number): Loop => ({
  startS: timeOfBar(grid, fromBar),
  endS: timeOfBar(grid, fromBar + bars),
});

/**
 * Alt+←/→ with a loop on: the loop moves a bar earlier or later, keeping its length (bar by bar through a song);
 * it stops at the start and the end of the material. Without a grid it moves by its own length.
 */
export function shiftLoop(loop: Loop, grid: BarGrid | null, dir: 1 | -1, durationS: number): Loop {
  if (!grid) {
    const len = loop.endS - loop.startS;
    const start = clamp(loop.startS + dir * len, 0, Math.max(0, durationS - len));
    return { startS: start, endS: start + len };
  }
  if (!onBarLines(loop, grid)) {
    // A loop inside a bar (half a beat, a fill) moves a bar at a time and keeps its own length and place.
    const len = loop.endS - loop.startS;
    const next = loop.startS + dir * grid.barSec;
    if (next < 0 || next + len > durationS) return loop;
    return { startS: next, endS: next + len };
  }
  const { fromBar, bars } = barsOfLoop(loop, grid);
  const last = Math.max(0, Math.floor(barAt(grid, durationS) + 1e-6) - bars);
  const to = clamp(fromBar + dir, 0, last);
  return loopOfBars(grid, to, bars);
}

/**
 * "bars 3–4" / "bar 2" for a loop, 1-based, or seconds when there is no grid. With a pickup (a song's bar 0,
 * contracts §6.11) the bars count from the first full bar: "pickup", "pickup + bars 1–4", "bars 4–8".
 */
export function loopLabel(loop: Loop | null, grid: BarGrid | null, pickup = false): string {
  if (!loop) return "Off";
  if (!grid) return `${formatTime(loop.startS)}–${formatTime(loop.endS)}`;
  const { fromBar, bars } = barsOfLoop(loop, grid);
  const first = pickup ? fromBar : fromBar + 1;
  const last = first + bars - 1;
  const where =
    pickup && first === 0
      ? bars === 1
        ? "pickup"
        : last === 1
          ? "pickup + bar 1"
          : `pickup + bars 1–${last}`
      : bars === 1
        ? `bar ${first}`
        : `bars ${first}–${last}`;
  // A loop inside the bars says exactly what it plays (and where), never a whole bar it does not play.
  if (!onBarLines(loop, grid)) return `${formatTime(loop.startS)}–${formatTime(loop.endS)} in ${where}`;
  return where;
}

// --- own audio: setting the bars (Wave 5) ------------------------------------------------------------

/** Seconds per beat (tempo unit) of a grid in a meter. */
export const beatSecOfGrid = (grid: BarGrid, meter: MeterId | null): number =>
  grid.barSec / (METERS[meter ?? "4/4"]?.unitsPerBar ?? 4);

/**
 * Bar 1 a beat earlier or later ("nudge by a beat": the learner tapped from beat 2 or 4, so the bar lines sit a
 * beat off). `null` when it would move before the start of the recording.
 */
export function nudgeDownbeat(downbeatS: number, beatSec: number, dir: 1 | -1): number | null {
  const next = Math.round((downbeatS + dir * beatSec) * 1000) / 1000;
  return next < 0 ? null : next;
}

/** Half or double the tempo (a tap run on every other beat, or on the eighths), inside the BPM range. */
export function scaleTempo(bpm: number, factor: 0.5 | 2): number | null {
  const next = Math.round(bpm * factor * 10) / 10;
  return next < BPM_MIN || next > BPM_MAX ? null : next;
}

/** Where the off-beat eighth sits in its beat: half way straight, two thirds swung (`swingBy(1/3, …)`, §6.10). */
export const offBeatAt = (swing: boolean): number => (swing ? 2 / 3 : 1 / 2);

/**
 * The beat and eighth ticks inside one bar, as fractions of the bar: each beat, then its off-beat eighth at the
 * straight or swung place.
 */
export function beatTicks(unitsPerBar: number, swing: boolean): { at: number; kind: "beat" | "off" }[] {
  const out: { at: number; kind: "beat" | "off" }[] = [];
  for (let k = 0; k < unitsPerBar; k++) {
    out.push({ at: k / unitsPerBar, kind: "beat" });
    out.push({ at: (k + offBeatAt(swing)) / unitsPerBar, kind: "off" });
  }
  return out;
}

/** The tap-along steps of a first run: how many taps so far, out of the eight that set the bars. */
export function tapProgress(taps: readonly number[]): { count: number; of: number; done: boolean } {
  return { count: Math.min(taps.length, TAPS_KEPT), of: TAPS_KEPT, done: taps.length >= TAPS_KEPT };
}
