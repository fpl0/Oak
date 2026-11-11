// Key, scale and mode (exercises §3.6, contracts §6.8): Krumhansl–Kessler key estimation, mode estimation
// with the characteristic tone, modulations, and the key a stretch of music is read in.
import type { KeySpec, NEvent, Rat, ScaleMode } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { keyFromScaleCtx, scalePcs } from "@oak/theory";
import { mod12, modeOf, num, pitched } from "./events.ts";

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
/** Tonic spellings used for estimated keys: the usual key-signature names. */
const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/**
 * Duration-weighted pitch-class histogram; the lowest note of every onset (the bass) counts 1.5×.
 * `window` restricts to onsets in [from, to) cycles.
 */
export function pcHistogram(events: readonly NEvent[], window?: readonly [Rat, Rat]): number[] {
  const h = Array.from({ length: 12 }, () => 0);
  const notes = pitched(events).filter(
    (e) => !window || (R.lte(window[0], e.onset) && R.lt(e.onset, window[1])),
  );
  const lowest = new Map<string, number>();
  for (const e of notes) {
    const k = `${e.onset[0]}/${e.onset[1]}`;
    lowest.set(k, Math.min(lowest.get(k) ?? Number.POSITIVE_INFINITY, e.midi));
  }
  for (const e of notes) {
    const w = num(e.clipDur ?? e.dur) * (lowest.get(`${e.onset[0]}/${e.onset[1]}`) === e.midi ? 1.5 : 1);
    h[mod12(e.midi)] = (h[mod12(e.midi)] as number) + w;
  }
  return h;
}

/** The 24 major and minor keys ranked by Krumhansl–Kessler correlation, best first. */
export function keyEstimate(
  events: readonly NEvent[],
  o: { window?: readonly [Rat, Rat] } = {},
): { key: KeySpec; r: number }[] {
  const h = pcHistogram(events, o.window);
  if (h.every((x) => x === 0)) return [];
  const out: { key: KeySpec; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p: readonly number[]): number[] =>
      Array.from({ length: 12 }, (_, i) => p[mod12(i - t)] as number);
    out.push({ key: { tonic: MAJOR_NAMES[t] as string, mode: "major" }, r: pearson(h, rot(MAJOR)) });
    out.push({ key: { tonic: MINOR_NAMES[t] as string, mode: "minor" }, r: pearson(h, rot(MINOR)) });
  }
  return out.sort((a, b) => b.r - a.r);
}

/** Characteristic tone of each diatonic mode, in semitones above the tonic. */
const CHARACTERISTIC: Partial<Record<ScaleMode, number>> = {
  dorian: 9,
  mixolydian: 10,
  lydian: 6,
  phrygian: 1,
  minor: 8,
  locrian: 6,
};
const DIATONIC_MODES: ScaleMode[] = [
  "major",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "minor",
  "locrian",
];
/**
 * Given a tonic, scores each of the seven diatonic modes by how much of the used (duration-weighted)
 * pitch content it covers; `characteristic` is true when the mode's colour tone has ≥ 5% of the weight.
 */
export function modeEstimate(
  events: readonly NEvent[],
  tonicPc: number,
): { mode: ScaleMode; characteristic: boolean; score: number }[] {
  const h = pcHistogram(events);
  const total = h.reduce((a, b) => a + b, 0) || 1;
  return DIATONIC_MODES.map((mode) => {
    const pcs = scalePcs({ tonic: "C", mode }).map((s) => mod12(tonicPc + s));
    const covered = pcs.reduce((a, p) => a + (h[p] as number), 0) / total;
    const ch = CHARACTERISTIC[mode];
    const characteristic = ch !== undefined && (h[mod12(tonicPc + ch)] as number) / total >= 0.05;
    return { mode, characteristic, score: covered };
  }).sort((a, b) => b.score - a.score || Number(b.characteristic) - Number(a.characteristic));
}

/** The key of a stretch of music from the events' own `.scale()` context, when they agree on one. */
export function keyFromContext(events: readonly NEvent[]): KeySpec | null {
  const ctxs = pitched(events)
    .map((e) => e.scaleCtx)
    .filter((s): s is string => typeof s === "string");
  if (ctxs.length === 0) return null;
  const top = modeOf(ctxs.map((s) => s.replace(/-?\d+(?=\s)/, "")));
  const full = ctxs.find((s) => s.replace(/-?\d+(?=\s)/, "") === top);
  return full ? keyFromScaleCtx(full) : null;
}

/**
 * The key a stretch of music is read in (contracts §6.8 item 1): the declared key, then the events' own
 * `scaleCtx`, then the best `keyEstimate`. `null` only for music without pitch.
 */
export function keyOf(
  events: readonly NEvent[],
  declared?: KeySpec | null,
  window?: readonly [Rat, Rat],
): KeySpec | null {
  if (declared) return declared;
  const inWindow = window
    ? events.filter((e) => R.lte(window[0], e.onset) && R.lt(e.onset, window[1]))
    : events;
  return keyFromContext(inWindow) ?? keyEstimate(inWindow)[0]?.key ?? null;
}

/** Whether a set of pitch classes fits a key's scale. */
export const inScale = (pc: number, key: KeySpec): boolean => (scalePcs(key) as number[]).includes(mod12(pc));

/**
 * Key changes in 4-bar windows: a change needs two consecutive windows won by the same new key with a
 * correlation margin ≥ 0.1 over the old one. Windows read the `scaleCtx` first when the events carry one.
 */
export function modulations(
  events: readonly NEvent[],
  bars: number,
  windowBars = 4,
): { bar: number; from: KeySpec; to: KeySpec }[] {
  const keys: (KeySpec | null)[] = [];
  const margins: number[] = [];
  for (let b = 0; b < bars; b += windowBars) {
    const window: [Rat, Rat] = [
      [b, 1],
      [Math.min(bars, b + windowBars), 1],
    ];
    const inWin = events.filter((e) => R.lte(window[0], e.onset) && R.lt(e.onset, window[1]));
    const ctx = keyFromContext(inWin);
    if (ctx) {
      keys.push(ctx);
      margins.push(1);
      continue;
    }
    const est = keyEstimate(inWin);
    keys.push(est[0]?.key ?? null);
    margins.push(est.length > 1 ? (est[0]?.r ?? 0) - (est[1]?.r ?? 0) : 0);
  }
  const same = (a: KeySpec | null, b: KeySpec | null): boolean =>
    !!a && !!b && a.tonic === b.tonic && a.mode === b.mode;
  const out: { bar: number; from: KeySpec; to: KeySpec }[] = [];
  let current = keys[0] ?? null;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i] ?? null;
    if (!k || !current || same(k, current)) continue;
    const confirmed = same(keys[i + 1] ?? null, k) || i === keys.length - 1;
    if (confirmed && ((margins[i] as number) >= 0.1 || (margins[i] as number) === 1)) {
      out.push({ bar: i * windowBars + 1, from: current, to: k });
      current = k;
    }
  }
  return out;
}
