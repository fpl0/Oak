// Audibility harness prototype: audible(control, value) renders a short pattern with and without the
// control in an OfflineAudioContext (one throw-away iframe per render) and compares the two buffers.
//
// Offline rendering is deterministic for oscillator/sample sources, so the primary metric is the RMS of
// the SAMPLE-WISE DIFFERENCE relative to the base render: a no-op control gives exactly 0 (-Infinity dB).

import type { RenderRequest } from "./render.ts";

export interface Rendered {
  left: Float32Array;
  right: Float32Array;
  haps: number;
  logs: string[];
}

export interface AudibleRow {
  control: string;
  value: unknown;
  base: string;
  code: string;
  audible: boolean;
  /** 20*log10(rms(with - without) / rms(without)); -Infinity = bit-identical */
  diffDb: number;
  /** repeatability: two renders of the WITH version against each other, same scale as diffDb */
  repeatDb: number;
  /** loudness change in dB (with vs without) */
  levelDb: number;
  /** spectral centroid without -> with, Hz */
  centroidHz: [number, number];
  /** stereo balance (R-L)/(R+L) energy, without -> with */
  balance: [number, number];
  /** energy in the last 40% of the render relative to the whole, without -> with (tails: room/delay/release) */
  tail: [number, number];
  error?: string;
}

const SAMPLE_RATE = 44100;
const DEFAULT_BASE = 'note("c3 e3 g3 c4").s("sawtooth")';
/** -40 dB: the difference signal must be at least 1% of the base signal */
export const AUDIBLE_DB = -40;

let nextId = 1;

/** Render `code` in a fresh iframe realm. */
export function renderInFrame(code: string, seconds = 2.5, cycles = 1, cps = 1, repeat = 1): Promise<Rendered> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = "/render.html";
    const timer = setTimeout(() => done(() => reject(new Error(`render timeout: ${code}`))), 30_000);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
      fn();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "ready") {
        const req: RenderRequest = { type: "render", id, code, seconds, cycles, cps, sampleRate: SAMPLE_RATE, repeat };
        frame.contentWindow?.postMessage(req, location.origin);
      } else if (event.data?.type === "rendered" && event.data.id === id) {
        const { error, left, right, haps, logs } = event.data;
        done(() => (error ? reject(new Error(error)) : resolve({ left, right, haps, logs })));
      }
    };
    window.addEventListener("message", onMessage);
    document.body.append(frame);
  });
}

const rms2 = (a: Float32Array, b: Float32Array, from = 0) => {
  let sum = 0;
  for (let i = from; i < a.length; i++) sum += (a[i] as number) ** 2 + (b[i] as number) ** 2;
  return Math.sqrt(sum / (2 * Math.max(1, a.length - from)));
};
const db = (ratio: number) => (ratio > 0 ? 20 * Math.log10(ratio) : Number.NEGATIVE_INFINITY);
const round = (x: number, digits = 1) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : x);

function diffRms(a: Rendered, b: Rendered) {
  let sum = 0;
  const n = Math.min(a.left.length, b.left.length);
  for (let i = 0; i < n; i++) {
    sum += ((b.left[i] as number) - (a.left[i] as number)) ** 2 + ((b.right[i] as number) - (a.right[i] as number)) ** 2;
  }
  return Math.sqrt(sum / (2 * n));
}

function balance(r: Rendered) {
  let l = 0;
  let rr = 0;
  for (let i = 0; i < r.left.length; i++) {
    l += (r.left[i] as number) ** 2;
    rr += (r.right[i] as number) ** 2;
  }
  return l + rr > 0 ? (rr - l) / (rr + l) : 0;
}

/** Spectral centroid (Hz) of the mono mix: Hann window, radix-2 FFT over the first 2^16 samples. */
function centroid(r: Rendered) {
  const n = 65536;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n && i < r.left.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = (((r.left[i] as number) + (r.right[i] as number)) / 2) * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
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
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  let num = 0;
  let den = 0;
  for (let k = 1; k < n / 2; k++) {
    const mag = Math.hypot(re[k] as number, im[k] as number);
    num += mag * ((k * SAMPLE_RATE) / n);
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

const tailShare = (r: Rendered) => {
  const whole = rms2(r.left, r.right);
  const from = Math.floor(r.left.length * 0.6);
  return whole > 0 ? (rms2(r.left, r.right, from) ** 2 * (r.left.length - from)) / (whole ** 2 * r.left.length) : 0;
};

const literal = (value: unknown) => JSON.stringify(value);
const baseCache = new Map<string, Promise<Rendered>>();
const renderBase = (base: string) => {
  let p = baseCache.get(base);
  if (!p) {
    p = renderInFrame(base);
    baseCache.set(base, p);
  }
  return p;
};

/**
 * audible("lpf", 400) -> compares `base` against `base.lpf(400)`.
 * `base` must be a Strudel expression string; default is a 4-note sawtooth arpeggio.
 */
export async function audible(control: string, value: unknown, base = DEFAULT_BASE): Promise<AudibleRow> {
  const code = `${base}.${control}(${literal(value)})`;
  const row: AudibleRow = {
    control,
    value,
    base,
    code,
    audible: false,
    diffDb: Number.NEGATIVE_INFINITY,
    repeatDb: Number.NEGATIVE_INFINITY,
    levelDb: 0,
    centroidHz: [0, 0],
    balance: [0, 0],
    tail: [0, 0],
  };
  try {
    const without = await renderBase(base);
    const withControl = await renderInFrame(code);
    const baseRms = rms2(without.left, without.right);
    if (baseRms === 0) throw new Error("base render is silent");
    const again = await renderInFrame(code);
    row.diffDb = round(db(diffRms(without, withControl) / baseRms));
    row.repeatDb = round(db(diffRms(withControl, again) / baseRms));
    row.levelDb = round(db(rms2(withControl.left, withControl.right) / baseRms));
    row.centroidHz = [Math.round(centroid(without)), Math.round(centroid(withControl))];
    row.balance = [round(balance(without), 2), round(balance(withControl), 2)];
    row.tail = [round(tailShare(without), 4), round(tailShare(withControl), 4)];
    // audible = clearly above the threshold AND clearly above this control's own run-to-run noise
    row.audible = row.diffDb > AUDIBLE_DB && row.diffDb > row.repeatDb + 20;
  } catch (err) {
    row.error = String((err as Error)?.message ?? err);
  }
  return row;
}

/** Determinism check: two independent renders of the same code must be identical (noise floor). */
export async function noiseFloorDb(base = DEFAULT_BASE) {
  const a = await renderInFrame(base);
  const b = await renderInFrame(base);
  return { base, rms: rms2(a.left, a.right), haps: a.haps, floorDb: db(diffRms(a, b) / rms2(a.left, a.right)) };
}

const LPF_BASE = `${DEFAULT_BASE}.lpf(300)`;
export const DEFAULT_CASES: [control: string, value: unknown, base?: string][] = [
  ["room", 0.6],
  ["delay", 0.5],
  ["lpf", 400],
  ["hpf", 2000],
  ["gain", 0.3],
  ["pan", 0],
  ["distort", 2],
  ["crush", 4],
  ["shape", 0.6],
  ["vowel", "a"],
  ["phaser", 4],
  ["tremolo", 8],
  ["tremolosync", 4],
  ["leslie", 1],
  ["lpenv", 4, LPF_BASE],
  ["attack", 0.1],
  ["release", 0.5],
  // extra: more envelope/filter controls and the no-ops the research flagged
  ["decay", 0.05],
  ["sustain", 0.2],
  ["bpf", 800],
  ["coarse", 8],
  ["vib", 6],
  ["postgain", 0.3],
  ["velocity", 0.3],
  ["lrate", 4],
  ["lsize", 2],
  ["amp", 0.3],
  ["squiz", 2],
  ["triode", 0.5],
  ["ring", 1],
  ["speed", 2, 's("piano")'],
  ["room", 0.6, 's("bd sd")'],
];

export async function audibleTable(cases = DEFAULT_CASES) {
  const floors = [
    await noiseFloorDb(),
    await noiseFloorDb('s("bd sd")'),
    await noiseFloorDb(`${DEFAULT_BASE}.room(0.6)`), // seeded Math.random makes even the reverb IR repeatable
  ];
  const rows: AudibleRow[] = [];
  for (const [control, value, base] of cases) rows.push(await audible(control, value, base));
  return { floors, thresholdDb: AUDIBLE_DB, rows };
}
