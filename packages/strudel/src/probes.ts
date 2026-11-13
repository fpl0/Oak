// Wave 5 seam (docs/design/wave5.md §3.4): read-only "visual probes" a lesson shows beside a sound (A1.L01–L04;
// content-kit `StepUi.probe`, `PROBE_KINDS` filter / envelope / harmonics): the filter curve of `.lpf()` /
// `.hpf()` / `.bpf()` with resonance, the envelope shape of `.attack() .decay() .sustain() .release()`, the
// harmonics of a wave (`s("sawtooth")`, `.partials([…])`), and the taps of `.delay()` with `.delaytime()` and
// `.delayfeedback()` (A1.L04; not a content probe kind yet). Pure math on the values a hap carries — no AudioContext — so the panel, the tests and the
// tutor all draw the same picture. Defaults follow superdough as installed (`node_modules/superdough`:
// `getADSRValues`, `createFilter`, `defaultDefaultValues`); the sound engineer pins them against the audibility
// harness in Build. Import from "@oak/strudel/probes" (no Strudel runtime).

export type FilterKind = "lpf" | "hpf" | "bpf";
export interface FilterProbe {
  kind: "filter";
  filter: FilterKind;
  /** Cutoff (lpf, hpf) or centre (bpf) in Hz. */
  cutoff: number;
  /** `.lpq()` / `.hpq()` / `.bpq()`; superdough's default is 1. */
  q: number;
  /** `ftype`: 12 dB/oct (one biquad, the default) or 24 dB/oct (two in series). */
  slope: 12 | 24;
}
export interface AdsrProbe {
  kind: "envelope";
  /** Seconds, as superdough resolves them (`adsrValues`). */
  attack: number;
  decay: number;
  /** Level 0–1. */
  sustain: number;
  release: number;
}
export interface DelayProbe {
  kind: "delay";
  /** Wet level of the echo (`.delay(x)`). */
  wet: number;
  /** Seconds between taps. */
  time: number;
  /** 0–0.98 (superdough clamps). */
  feedback: number;
}
export interface HarmonicsProbe {
  kind: "harmonics";
  /** Relative amplitude of harmonics 1..n (1 = the fundamental's level). */
  amplitudes: number[];
  /** Where they came from: the wave's own series, or the code's `.partials([…])`. */
  source: "wave" | "partials";
  wave: string | null;
}
export type VisualProbe = FilterProbe | AdsrProbe | DelayProbe | HarmonicsProbe;
/** content-kit `ProbeKind` (filter, envelope, harmonics) plus `delay`. */
export type VisualProbeKind = "filter" | "envelope" | "harmonics" | "delay";

/** superdough's synth envelope when the code sets none of the four (`registerSynthSounds`). */
export const SYNTH_ENVELOPE_DEFAULTS = { attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01 } as const;
export const DELAY_DEFAULTS = { feedback: 0.5, syncCycles: 3 / 16, maxFeedback: 0.98 } as const;
export const FILTER_Q_DEFAULT = 1;

/**
 * The four envelope values superdough plays for what the code set (`getADSRValues`): with none set, the synth
 * defaults; with some set, the missing ones fall to the minimum (sustain to full when only an attack is set),
 * so `.decay(.2)` alone is a decay-only envelope.
 */
export function adsrValues(
  set: { attack?: number; decay?: number; sustain?: number; release?: number },
  defaults: { attack: number; decay: number; sustain: number; release: number } = SYNTH_ENVELOPE_DEFAULTS,
): AdsrProbe {
  const min = 0.001;
  const releaseMin = 0.01;
  const { attack: a, decay: d, sustain: s, release: r } = set;
  if (a === undefined && d === undefined && s === undefined && r === undefined)
    return { kind: "envelope", ...defaults };
  const sustain =
    s !== undefined
      ? s
      : (a !== undefined && d === undefined) || (a === undefined && d === undefined)
        ? 1
        : min;
  return {
    kind: "envelope",
    attack: Math.max(a ?? 0, min),
    decay: Math.max(d ?? 0, min),
    sustain: Math.min(sustain, 1),
    release: Math.max(r ?? 0, releaseMin),
  };
}

/** The envelope as a polyline: `[seconds, level]` from note-on through a held note of `holdSec` to silence. */
export function adsrCurve(p: AdsrProbe, holdSec: number): [number, number][] {
  const peakAt = p.attack;
  const sustainAt = p.attack + p.decay;
  const off = Math.max(holdSec, 0);
  const pts: [number, number][] = [[0, 0]];
  if (off <= peakAt) {
    const lvl = peakAt === 0 ? 1 : off / peakAt;
    pts.push([off, lvl], [off + p.release, 0]);
    return pts;
  }
  pts.push([peakAt, 1]);
  if (off <= sustainAt) {
    const lvl = 1 - (1 - p.sustain) * ((off - peakAt) / Math.max(p.decay, 1e-9));
    pts.push([off, lvl], [off + p.release, 0]);
    return pts;
  }
  pts.push([sustainAt, p.sustain], [off, p.sustain], [off + p.release, 0]);
  return pts;
}

/** `n` frequencies spaced evenly on a log axis from `min` to `max` Hz (the probe's x axis). */
export function logFrequencies(n = 128, min = 20, max = 20_000): number[] {
  if (n < 2) return [min];
  return Array.from({ length: n }, (_, i) => min * (max / min) ** (i / (n - 1)));
}

/**
 * The filter's gain in dB at each frequency: the Web Audio biquad of the spec (RBJ cookbook; for lowpass and
 * highpass `Q` is in dB, for bandpass it is linear), squared for 24 dB/oct. `sampleRate` defaults to 48 kHz.
 */
export function filterCurve(p: FilterProbe, freqs: readonly number[], sampleRate = 48_000): number[] {
  const f0 = Math.min(Math.max(p.cutoff, 1), sampleRate / 2 - 1);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = p.filter === "bpf" ? sin / (2 * Math.max(p.q, 1e-4)) : sin / (2 * 10 ** (p.q / 20));
  let b0: number;
  let b1: number;
  let b2: number;
  if (p.filter === "lpf") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (p.filter === "hpf") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return freqs.map((f) => {
    const w = (2 * Math.PI * f) / sampleRate;
    const [c1, s1, c2, s2] = [Math.cos(w), Math.sin(w), Math.cos(2 * w), Math.sin(2 * w)];
    const nr = b0 + b1 * c1 + b2 * c2;
    const ni = -(b1 * s1 + b2 * s2);
    const dr = a0 + a1 * c1 + a2 * c2;
    const di = -(a1 * s1 + a2 * s2);
    const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
    const db = 20 * Math.log10(Math.max(mag, 1e-12));
    return p.slope === 24 ? 2 * db : db;
  });
}

/** The echoes of a delay: `[seconds, level]` per tap while the level is above `floor` (−60 dB), at most `max`. */
export function delayTaps(p: DelayProbe, opts: { floor?: number; max?: number } = {}): [number, number][] {
  const floor = opts.floor ?? 0.001;
  const max = opts.max ?? 32;
  const fb = Math.min(Math.max(p.feedback, 0), DELAY_DEFAULTS.maxFeedback);
  const out: [number, number][] = [];
  let level = p.wet;
  for (let k = 1; k <= max && level > floor && p.time > 0; k++) {
    out.push([k * p.time, level]);
    level *= fb;
  }
  return out;
}

/**
 * The harmonic series of Strudel's basic waves (the textbook shapes): a sine is its fundamental alone; a sawtooth
 * has every harmonic at 1/n; a square the odd ones at 1/n; a triangle the odd ones at 1/n² (A1.L01).
 */
export function waveHarmonics(wave: string, n = 16): number[] | null {
  const k = Array.from({ length: n }, (_, i) => i + 1);
  switch (wave) {
    case "sine":
      return k.map((h) => (h === 1 ? 1 : 0));
    case "sawtooth":
    case "saw":
      return k.map((h) => 1 / h);
    case "square":
      return k.map((h) => (h % 2 === 1 ? 1 / h : 0));
    case "triangle":
      return k.map((h) => (h % 2 === 1 ? 1 / (h * h) : 0));
    default:
      return null;
  }
}
/** The harmonics probe of a hap: `.partials([…])` when the code sets it, else the wave's own series. */
export function harmonicsOf(value: Readonly<Record<string, unknown>>, n = 16): HarmonicsProbe | null {
  const partials = value.partials;
  if (Array.isArray(partials) && partials.every((x) => typeof x === "number")) {
    const top = Math.max(...(partials as number[]).map(Math.abs), 1e-9);
    return {
      kind: "harmonics",
      amplitudes: (partials as number[]).map((x) => Math.abs(x) / top),
      source: "partials",
      wave: typeof value.s === "string" ? value.s : null,
    };
  }
  const wave = typeof value.s === "string" ? value.s : "triangle";
  const series = waveHarmonics(wave, n);
  return series ? { kind: "harmonics", amplitudes: series, source: "wave", wave } : null;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * The probe a hap's value shows, read from the controls Strudel sets (`.lpf` → `cutoff`, `.lpq` → `resonance`,
 * `.hpf` → `hcutoff`, `.bpf` → `bandf`, the envelope, `.delay*`); `null` when the hap has none of that kind.
 * `cps` turns superdough's default delay sync (3/16 cycle) into seconds.
 */
export function probeOf(
  kind: VisualProbeKind,
  value: Readonly<Record<string, unknown>>,
  cps = 0.5,
): VisualProbe | null {
  const slope = value.ftype === "24db" || value.ftype === 2 ? 24 : 12;
  if (kind === "filter") {
    const lp = num(value.cutoff);
    if (lp !== undefined)
      return { kind, filter: "lpf", cutoff: lp, q: num(value.resonance) ?? FILTER_Q_DEFAULT, slope };
    const hp = num(value.hcutoff);
    if (hp !== undefined)
      return { kind, filter: "hpf", cutoff: hp, q: num(value.hresonance) ?? FILTER_Q_DEFAULT, slope };
    const bp = num(value.bandf);
    if (bp !== undefined)
      return { kind, filter: "bpf", cutoff: bp, q: num(value.bandq) ?? FILTER_Q_DEFAULT, slope };
    return null;
  }
  if (kind === "harmonics") return harmonicsOf(value);
  if (kind === "envelope") {
    const set: { attack?: number; decay?: number; sustain?: number; release?: number } = {};
    for (const k of ["attack", "decay", "sustain", "release"] as const) {
      const v = num(value[k]);
      if (v !== undefined) set[k] = v;
    }
    return adsrValues(set);
  }
  const wet = num(value.delay);
  if (wet === undefined || wet <= 0) return null;
  const sync = num(value.delaysync) ?? DELAY_DEFAULTS.syncCycles;
  return {
    kind,
    wet,
    time: num(value.delaytime) ?? (cps > 0 ? sync / cps : 0),
    feedback: num(value.delayfeedback) ?? DELAY_DEFAULTS.feedback,
  };
}

export { type FakeScopeOptions, fakeScopeTap } from "./scope-fake.ts";
export type { ScopePanel, ScopeSource, ScopeTap } from "./types.ts";
