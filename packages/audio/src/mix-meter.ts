// Wave 7 (A2.L01 roles and registers, A2.L05 the mix, AC1 and AC2's mix session): meters for mixing, read from the
// rendered audio of each part, in plain numbers and nothing else.
//
//   a level per part over a whole play-through   dBFS (0 is full scale): the average while the part plays, the
//                                                 average over the whole span, the loudest sample, and how far
//                                                 under the loudest part it sits, in dB
//   the register each part occupies              Hz and the note names they are nearest, from the part's own
//                                                 averaged spectrum: where the lowest 10 %, the middle and the top
//                                                 10 % of its energy lie, its strongest frequency and the lowest
//                                                 strong one (near its lowest notes), and which of the register
//                                                 bands of @oak/theory (`REGISTER_ROLES`) the middle falls in
//   where two parts share a register             the overlap of their middle-80 % spans, Hz and octaves
//   the compressor's gain reduction              dB, measured: the part rendered with its compressor against the same
//                                                 part with the compressor set to 1:1, block by block, the
//                                                 compressor's automatic make-up gain (Web Audio API §1.19) taken
//                                                 out; and the static curve, to say what a setting does
//
// No loudness units are invented and none are borrowed: this is not LUFS, not VU, not "perceived loudness". Each
// part is measured from its own render (the offline renderer of @oak/strudel with `mutes.solo` set: one render per
// part, the same seeded randomness, the same Band), so a part's numbers are its own sound with nothing masking it.
// A part more than 24 dB under the loudest part is not heard in the mix (decision 71; the grader's `levelsView` reads
// the same 24 dB from the code's gains, this from the audio).
//
// Pure functions on Float32Arrays plus one orchestrator that takes the render as a function: unit-testable in bun,
// and the host (lesson, capstone, workbench) owns the render, the cancel button and the drawing.
import { hzToMidi, midiName } from "@oak/pitch";
import { REGISTER_ROLES } from "@oak/theory";

/** PCM of one render: `left`, optionally `right` (mono otherwise), at `sampleRate`. */
export interface PartPcm {
  left: Float32Array;
  right?: Float32Array;
  sampleRate: number;
}

/** Frames per level block: 2048 is 43 ms at 48 kHz. */
export const MIX_BLOCK_FRAMES = 2048;
/** A block quieter than this is silence: a part that rests is not averaged with its rests. */
export const MIX_SILENCE_DB = -70;
/** More than this many dB under the loudest part: not heard in the mix (decision 71). */
export const HEARD_WITHIN_DB = 24;

const db10 = (power: number) => (power > 0 ? 10 * Math.log10(power) : Number.NEGATIVE_INFINITY);
const db20 = (amp: number) => (amp > 0 ? 20 * Math.log10(amp) : Number.NEGATIVE_INFINITY);
const round1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);

// --- level ------------------------------------------------------------------------------------------------------

export interface PartLevel {
  /** Average level while the part plays (RMS over its blocks above `MIX_SILENCE_DB`), dBFS. */
  playingDb: number;
  /** Average level over the whole span, rests included, dBFS. */
  spanDb: number;
  /** Loudest sample, dBFS. */
  peakDb: number;
  /** Share of the span the part plays, 0 to 1. */
  playingShare: number;
  seconds: number;
}

/** Mean of the channels' power per sample at frame `i`. */
const powerAt = (pcm: PartPcm, i: number): number => {
  const l = pcm.left[i] as number;
  if (!pcm.right) return l * l;
  const r = pcm.right[i] as number;
  return (l * l + r * r) / 2;
};

/** The level of one render, block by block (pure). */
export function partLevel(pcm: PartPcm, blockFrames = MIX_BLOCK_FRAMES): PartLevel {
  const n = pcm.left.length;
  let total = 0;
  let playingSq = 0;
  let playingFrames = 0;
  let peak = 0;
  for (let at = 0; at < n; at += blockFrames) {
    const to = Math.min(n, at + blockFrames);
    let sq = 0;
    for (let i = at; i < to; i++) {
      const p = powerAt(pcm, i);
      sq += p;
      const l = Math.abs(pcm.left[i] as number);
      const r = pcm.right ? Math.abs(pcm.right[i] as number) : 0;
      if (l > peak) peak = l;
      if (r > peak) peak = r;
    }
    total += sq;
    if (db10(sq / (to - at)) >= MIX_SILENCE_DB) {
      playingSq += sq;
      playingFrames += to - at;
    }
  }
  return {
    playingDb: round1(db10(playingFrames > 0 ? playingSq / playingFrames : 0)),
    spanDb: round1(db10(n > 0 ? total / n : 0)),
    peakDb: round1(db20(peak)),
    playingShare: n > 0 ? Math.round((playingFrames / n) * 1000) / 1000 : 0,
    seconds: n / pcm.sampleRate,
  };
}

// --- register ---------------------------------------------------------------------------------------------------

/** FFT size of the averaged spectrum: 8192 is 5.9 Hz a bin at 48 kHz, fine enough to tell E1 (41 Hz) from F1. */
export const SPECTRUM_FFT = 8192;
/** Below this the spectrum is not read (sub-audio rumble, DC). */
export const SPECTRUM_MIN_HZ = 20;
/** The lowest strong frequency is the lowest bin within this many dB of the strongest. */
export const LOWEST_WITHIN_DB = 20;

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * The power spectrum of a render averaged over the frames where it plays (Hann window, half overlap, frames below
 * `MIX_SILENCE_DB` left out), one value per bin up to Nyquist. `null` when the render never plays.
 */
export function averagedSpectrum(pcm: PartPcm, fft = SPECTRUM_FFT): Float64Array | null {
  const n = pcm.left.length;
  const hop = fft / 2;
  const win = new Float64Array(fft);
  for (let i = 0; i < fft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fft - 1));
  const sum = new Float64Array(fft / 2 + 1);
  const re = new Float64Array(fft);
  const im = new Float64Array(fft);
  let used = 0;
  for (let at = 0; at + fft <= Math.max(n, fft); at += hop) {
    let sq = 0;
    for (let i = 0; i < fft; i++) {
      const k = at + i;
      const x =
        k < n
          ? pcm.right
            ? ((pcm.left[k] as number) + (pcm.right[k] as number)) / 2
            : (pcm.left[k] as number)
          : 0;
      sq += x * x;
      re[i] = x * (win[i] as number);
      im[i] = 0;
    }
    if (db10(sq / fft) < MIX_SILENCE_DB) continue;
    fftInPlace(re, im);
    for (let b = 0; b <= fft / 2; b++)
      sum[b] = (sum[b] as number) + (re[b] as number) ** 2 + (im[b] as number) ** 2;
    used++;
    if (at + fft >= n) break;
  }
  if (used === 0) return null;
  for (let b = 0; b < sum.length; b++) sum[b] = (sum[b] as number) / used;
  return sum;
}

export interface RegisterReading {
  /** 10 % of the part's energy lies below this frequency, Hz. */
  lowHz: number;
  /** Half of it below this one: the middle of the part. */
  midHz: number;
  /** 90 % below this one. */
  highHz: number;
  /** The strongest frequency. */
  peakHz: number;
  /** The lowest frequency within `LOWEST_WITHIN_DB` of the strongest: near the part's lowest notes. */
  lowestHz: number;
  /** The nearest note names ("A1"). */
  names: { low: string; mid: string; high: string; peak: string; lowest: string };
  /** The register band of @oak/theory the middle falls in (`REGISTER_ROLES`): sub, bass, low-mid, mid or high. */
  role: (typeof REGISTER_ROLES)[number]["role"];
}

const noteOf = (hz: number): string => midiName(Math.round(hzToMidi(hz)));

/** Where a spectrum's energy lies (pure). */
export function registerOfSpectrum(spectrum: Float64Array, sampleRate: number): RegisterReading | null {
  const fft = (spectrum.length - 1) * 2;
  const binHz = sampleRate / fft;
  const first = Math.max(1, Math.ceil(SPECTRUM_MIN_HZ / binHz));
  const last = spectrum.length - 1;
  let total = 0;
  let peak = first;
  for (let b = first; b <= last; b++) {
    total += spectrum[b] as number;
    if ((spectrum[b] as number) > (spectrum[peak] as number)) peak = b;
  }
  if (!(total > 0)) return null;
  const at = (share: number): number => {
    let acc = 0;
    for (let b = first; b <= last; b++) {
      const p = spectrum[b] as number;
      if (acc + p >= share * total) {
        // Interpolated inside the bin.
        const frac = p > 0 ? (share * total - acc) / p : 0;
        return (b - 0.5 + frac) * binHz;
      }
      acc += p;
    }
    return last * binHz;
  };
  const floor = (spectrum[peak] as number) * 10 ** (-LOWEST_WITHIN_DB / 10);
  let lowest = peak;
  for (let b = first; b < peak; b++)
    if ((spectrum[b] as number) >= floor) {
      lowest = b;
      break;
    }
  // Parabolic interpolation of a local maximum in log power.
  const refine = (b: number): number => {
    if (b <= first || b >= last) return b * binHz;
    const a = Math.log((spectrum[b - 1] as number) + 1e-30);
    const c = Math.log((spectrum[b] as number) + 1e-30);
    const d = Math.log((spectrum[b + 1] as number) + 1e-30);
    const den = a - 2 * c + d;
    const off = den !== 0 ? (0.5 * (a - d)) / den : 0;
    return (b + Math.max(-0.5, Math.min(0.5, off))) * binHz;
  };
  // The lowest strong frequency: climb to the top of the peak it starts.
  let top = lowest;
  while (top < last && (spectrum[top + 1] as number) > (spectrum[top] as number)) top++;
  const lowHz = at(0.1);
  const midHz = at(0.5);
  const highHz = at(0.9);
  const peakHz = refine(peak);
  const lowestHz = refine(top);
  return {
    lowHz: round1(lowHz),
    midHz: round1(midHz),
    highHz: round1(highHz),
    peakHz: round1(peakHz),
    lowestHz: round1(lowestHz),
    names: {
      low: noteOf(lowHz),
      mid: noteOf(midHz),
      high: noteOf(highHz),
      peak: noteOf(peakHz),
      lowest: noteOf(lowestHz),
    },
    role: registerRole(hzToMidi(midHz)),
  };
}

/**
 * The register band a MIDI note falls in: the band whose middle is nearest among the bands that contain it. "Sub" is
 * named only below the bass band: a bass line on A1 is a bass, though the sub band reaches it too.
 */
export function registerRole(midi: number): RegisterReading["role"] {
  let inside = REGISTER_ROLES.filter((r) => midi >= r.low && midi <= r.high);
  if (inside.length > 1) inside = inside.filter((r) => r.role !== "sub");
  const pool = inside.length > 0 ? inside : REGISTER_ROLES;
  let best = pool[0] as (typeof REGISTER_ROLES)[number];
  for (const r of pool)
    if (Math.abs(midi - (r.low + r.high) / 2) < Math.abs(midi - (best.low + best.high) / 2)) best = r;
  return best.role;
}

/** Where a render's energy lies, or `null` when it never plays. */
export function partRegister(pcm: PartPcm, fft = SPECTRUM_FFT): RegisterReading | null {
  const s = averagedSpectrum(pcm, fft);
  return s ? registerOfSpectrum(s, pcm.sampleRate) : null;
}

export interface RegisterOverlap {
  a: string;
  b: string;
  lowHz: number;
  highHz: number;
  /** How wide the shared span is, in octaves. */
  octaves: number;
}
/** Two parts whose middle-80 % spans share at least `minOctaves` (default a half octave). */
export function registerOverlaps(
  parts: readonly { part: string; register: RegisterReading | null }[],
  minOctaves = 0.5,
): RegisterOverlap[] {
  const out: RegisterOverlap[] = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i] as (typeof parts)[number];
      const b = parts[j] as (typeof parts)[number];
      if (!a.register || !b.register) continue;
      const lo = Math.max(a.register.lowHz, b.register.lowHz);
      const hi = Math.min(a.register.highHz, b.register.highHz);
      if (!(hi > lo)) continue;
      const octaves = Math.log2(hi / lo);
      if (octaves + 1e-9 >= minOctaves)
        out.push({ a: a.part, b: b.part, lowHz: round1(lo), highHz: round1(hi), octaves: round1(octaves) });
    }
  return out;
}

// --- the mix: every part, measured on its own -------------------------------------------------------------------

export interface PartReading {
  part: string;
  level: PartLevel;
  /** dB under the loudest part (0 for the loudest), from the playing levels; `-Infinity` for a silent part. */
  underLoudestDb: number;
  /** Within `HEARD_WITHIN_DB` of the loudest part and not silent. */
  heard: boolean;
  register: RegisterReading | null;
}
export interface MixReading {
  /** The whole mix, as the listener hears it. */
  mix: { level: PartLevel; register: RegisterReading | null };
  parts: PartReading[];
  /** The loudest part, or `null` when every part is silent. */
  loudest: string | null;
  overlaps: RegisterOverlap[];
}

/** Renders the piece with one part alone (`solo`), or the whole mix (`null`). */
export type SoloRender = (solo: string | null, signal?: AbortSignal) => Promise<PartPcm>;

/** The readings of a mix and its parts from their renders (pure). */
export function readMix(mix: PartPcm, parts: readonly { part: string; pcm: PartPcm }[]): MixReading {
  const rows = parts.map((p) => ({ part: p.part, level: partLevel(p.pcm), register: partRegister(p.pcm) }));
  const top = Math.max(...rows.map((r) => r.level.playingDb), Number.NEGATIVE_INFINITY);
  const loudest = Number.isFinite(top) ? (rows.find((r) => r.level.playingDb === top)?.part ?? null) : null;
  const readings: PartReading[] = rows.map((r) => {
    const under = Number.isFinite(r.level.playingDb)
      ? round1(top - r.level.playingDb)
      : Number.NEGATIVE_INFINITY;
    return {
      ...r,
      underLoudestDb: under,
      heard: Number.isFinite(under) && under <= HEARD_WITHIN_DB + 1e-9,
    };
  });
  return {
    mix: { level: partLevel(mix), register: partRegister(mix) },
    parts: readings,
    loudest,
    overlaps: registerOverlaps(readings),
  };
}

/**
 * Measures a mix part by part: one render of the whole mix, then one per part with that part alone, in order (one
 * render at a time: the offline renderer is one realm per render). `onProgress` gets 0–1 after each render; an
 * aborted `signal` stops before the next render and rejects with an `AbortError`.
 */
export async function measureMix(
  render: SoloRender,
  parts: readonly string[],
  opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {},
): Promise<MixReading> {
  const total = parts.length + 1;
  const check = () => {
    if (opts.signal?.aborted) throw new DOMException("The mix reading was stopped.", "AbortError");
  };
  check();
  const mix = await render(null, opts.signal);
  opts.onProgress?.(1 / total);
  const out: { part: string; pcm: PartPcm }[] = [];
  for (const [k, part] of parts.entries()) {
    check();
    out.push({ part, pcm: await render(part, opts.signal) });
    opts.onProgress?.((k + 2) / total);
  }
  return readMix(mix, out);
}

// --- the compressor ---------------------------------------------------------------------------------------------

/** A compressor's settings, as `.compressor("threshold:ratio:knee:attack:release")` writes them. */
export interface CompressorSettings {
  /** dBFS. */
  threshold: number;
  ratio: number;
  /** dB above the threshold over which the curve bends. */
  knee: number;
  /** Seconds. */
  attack: number;
  release: number;
}
/** What superdough uses for a value the code leaves out (superdough `getCompressor`). */
export const SUPERDOUGH_COMPRESSOR_DEFAULTS: CompressorSettings = {
  threshold: -3,
  ratio: 10,
  knee: 10,
  attack: 0.005,
  release: 0.05,
};
/** Appended to a part's line, this sets its compressor to 1:1 (no change): the "without" render of a measurement. */
export const NEUTRAL_COMPRESSOR = '.compressor("0:1")';

/** Reads `.compressor()`'s argument ("-20:4:10:.002:.1", or a number for the threshold alone). */
export function parseCompressor(value: string | number): CompressorSettings | null {
  const parts =
    typeof value === "number"
      ? [value]
      : value.split(":").map((s) => (s.trim() === "" ? Number.NaN : Number(s)));
  if (parts.length === 0 || parts.length > 5 || !Number.isFinite(parts[0])) return null;
  const d = SUPERDOUGH_COMPRESSOR_DEFAULTS;
  const pick = (i: number, fallback: number) => {
    const v = parts[i];
    return v === undefined || !Number.isFinite(v) ? fallback : v;
  };
  const s: CompressorSettings = {
    threshold: pick(0, d.threshold),
    ratio: pick(1, d.ratio),
    knee: pick(2, d.knee),
    attack: pick(3, d.attack),
    release: pick(4, d.release),
  };
  // The Web Audio ranges (the node clamps to them).
  s.threshold = Math.min(0, Math.max(-100, s.threshold));
  s.ratio = Math.min(20, Math.max(1, s.ratio));
  s.knee = Math.min(40, Math.max(0, s.knee));
  return s;
}

/**
 * The static curve of a Web Audio DynamicsCompressorNode (Web Audio API §1.19.4, "compression curve"): unchanged
 * below the threshold; inside the knee an exponential bend that starts with slope 1 and ends with slope 1/ratio
 * (its constant found so the two meet); above the knee a straight line of slope 1/ratio. Input and output in dBFS.
 * The node's detector follows the absolute sample value, so the input to read it at is the signal's PEAK level: a
 * steady sine read at its peak lands within 0.35 dB of Chrome's own reduction (measured, mix-meter.test.ts).
 */
export function compressionCurveDb(
  inputDb: number,
  s: Pick<CompressorSettings, "threshold" | "ratio" | "knee">,
): number {
  const T = s.threshold;
  const W = s.knee;
  const R = s.ratio;
  if (inputDb <= T || R <= 1) return inputDb;
  const linT = 10 ** (T / 20);
  if (W <= 0) return T + (inputDb - T) / R;
  const k = kneeConstant(T, W, R);
  const knee = (x: number) => linT + (1 - Math.exp(-k * (x - linT))) / k;
  const kneeEndLin = 10 ** ((T + W) / 20);
  const kneeEndOutDb = 20 * Math.log10(knee(kneeEndLin));
  if (inputDb < T + W) return 20 * Math.log10(knee(10 ** (inputDb / 20)));
  return kneeEndOutDb + (inputDb - (T + W)) / R;
}

const kneeCache = new Map<string, number>();
/** The knee's constant `k`: the bend's slope (in dB per dB) at the knee's end equals 1/ratio. */
function kneeConstant(T: number, W: number, R: number): number {
  const key = `${T}:${W}:${R}`;
  const hit = kneeCache.get(key);
  if (hit !== undefined) return hit;
  const linT = 10 ** (T / 20);
  const x = 10 ** ((T + W) / 20);
  // d(dB out)/d(dB in) of y = linT + (1 − e^(−k(x − linT)))/k at x: x·y'(x)/y(x), with y' = e^(−k(x − linT)).
  const slope = (k: number) => {
    const y = linT + (1 - Math.exp(-k * (x - linT))) / k;
    return (x * Math.exp(-k * (x - linT))) / y;
  };
  let lo = 1e-6;
  let hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (slope(mid) > 1 / R) lo = mid;
    else hi = mid;
  }
  const k = Math.sqrt(lo * hi);
  kneeCache.set(key, k);
  return k;
}

/** The static gain reduction at an input level, dB (≥ 0): how much the curve takes off. */
export function staticGainReductionDb(
  inputDb: number,
  s: Pick<CompressorSettings, "threshold" | "ratio" | "knee">,
): number {
  return Math.max(0, inputDb - compressionCurveDb(inputDb, s));
}

/**
 * The make-up gain a DynamicsCompressorNode adds by itself (Web Audio API §1.19.4): the curve's output for a
 * full-scale input, inverted and raised to the power 0.6. In dB: −0.6 × (curve(0 dBFS) − 0).
 */
export function makeupGainDb(s: Pick<CompressorSettings, "threshold" | "ratio" | "knee">): number {
  return -0.6 * compressionCurveDb(0, s);
}

export interface GainReductionReading {
  /** The most the compressor took off in any block, dB. */
  maxDb: number;
  /** The average over the blocks where the part plays, dB. */
  meanDb: number;
  /** Share of the playing blocks with more than 1 dB taken off, 0 to 1. */
  workingShare: number;
  /** The make-up gain the node added (taken out of the numbers above), dB. */
  makeupDb: number;
  /** Blocks measured (where the part plays). */
  blocks: number;
}

/**
 * The compressor's gain reduction, measured: `withPcm` is the part rendered as written, `withoutPcm` the same part
 * with the compressor at 1:1 (`NEUTRAL_COMPRESSOR`), same length and alignment. In each block where the part plays,
 * the reduction is the level without, minus the level with, plus the make-up gain the node adds (so a compressor that
 * takes 6 dB off and adds 3 back reads 6, not 3). Attack and release are in the audio, so the reading includes them.
 */
export function measureGainReduction(
  withPcm: PartPcm,
  withoutPcm: PartPcm,
  settings: Pick<CompressorSettings, "threshold" | "ratio" | "knee">,
  blockFrames = MIX_BLOCK_FRAMES,
): GainReductionReading {
  const makeup = makeupGainDb(settings);
  const n = Math.min(withPcm.left.length, withoutPcm.left.length);
  let max = 0;
  let sum = 0;
  let blocks = 0;
  let working = 0;
  for (let at = 0; at < n; at += blockFrames) {
    const to = Math.min(n, at + blockFrames);
    let a = 0;
    let b = 0;
    for (let i = at; i < to; i++) {
      a += powerAt(withPcm, i);
      b += powerAt(withoutPcm, i);
    }
    const dry = db10(b / (to - at));
    if (dry < MIX_SILENCE_DB) continue;
    const red = Math.max(0, dry - db10(a / (to - at)) + makeup);
    blocks++;
    sum += red;
    if (red > max) max = red;
    if (red > 1) working++;
  }
  return {
    maxDb: round1(max),
    meanDb: round1(blocks > 0 ? sum / blocks : 0),
    workingShare: blocks > 0 ? Math.round((working / blocks) * 1000) / 1000 : 0,
    makeupDb: round1(makeup),
    blocks,
  };
}

// --- words ------------------------------------------------------------------------------------------------------

const dbText = (db: number): string => {
  if (!Number.isFinite(db)) return "silent";
  const r = Math.round(db * 10) / 10;
  return `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)} dB`;
};
const hzText = (hz: number): string =>
  hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;

/** "bass: −18.2 dB while it plays, 6.0 dB under the drums" — one line per part. */
export function levelLine(r: PartReading, loudest: string | null): string {
  if (!Number.isFinite(r.level.playingDb)) return `${r.part}: silent`;
  const base = `${r.part}: ${dbText(r.level.playingDb)} while it plays`;
  if (r.part === loudest || loudest === null) return `${base}, the loudest part`;
  const under = `${dbText(r.underLoudestDb).replace("−", "")} under the ${loudest}`;
  return r.heard ? `${base}, ${under}` : `${base}, ${under}: too quiet to hear in the mix`;
}
/** "bass: most of its sound between 55 Hz (A1) and 220 Hz (A3), centred on 110 Hz (A2)". */
export function registerLine(part: string, r: RegisterReading | null): string {
  if (!r) return `${part}: silent`;
  return `${part}: most of its sound between ${hzText(r.lowHz)} (${r.names.low}) and ${hzText(r.highHz)} (${r.names.high}), centred on ${hzText(r.midHz)} (${r.names.mid})`;
}
/** "The compressor took up to 7.5 dB off, 4.1 dB on average while the part plays." */
export function gainReductionLine(r: GainReductionReading): string {
  if (r.blocks === 0) return "The part never played, so the compressor had nothing to do.";
  if (r.maxDb < 1) return "The compressor barely touched it: less than 1 dB off at any moment.";
  return `The compressor took up to ${r.maxDb.toFixed(1)} dB off, ${r.meanDb.toFixed(1)} dB on average while the part plays.`;
}
