// Pure measurements of the audibility harness (spike S3): the sample-wise difference against the base
// render is the primary metric, so a no-op control is exactly −Infinity dB.

export interface Stereo {
  left: Float32Array;
  right: Float32Array;
}

/** −40 dB: the difference signal must be at least 1% of the base signal. */
export const AUDIBLE_DB = -40;

export const db = (ratio: number): number => (ratio > 0 ? 20 * Math.log10(ratio) : Number.NEGATIVE_INFINITY);
export const round = (x: number, digits = 1): number => (Number.isFinite(x) ? Number(x.toFixed(digits)) : x);

export function rms(r: Stereo, from = 0): number {
  let sum = 0;
  const n = r.left.length;
  for (let i = from; i < n; i++) sum += (r.left[i] as number) ** 2 + (r.right[i] as number) ** 2;
  return Math.sqrt(sum / (2 * Math.max(1, n - from)));
}

export function diffRms(a: Stereo, b: Stereo): number {
  let sum = 0;
  const n = Math.min(a.left.length, b.left.length);
  for (let i = 0; i < n; i++) {
    sum +=
      ((b.left[i] as number) - (a.left[i] as number)) ** 2 +
      ((b.right[i] as number) - (a.right[i] as number)) ** 2;
  }
  return Math.sqrt(sum / (2 * Math.max(1, n)));
}

/** (R − L) / (R + L) energy. */
export function balance(r: Stereo): number {
  let l = 0;
  let rr = 0;
  for (let i = 0; i < r.left.length; i++) {
    l += (r.left[i] as number) ** 2;
    rr += (r.right[i] as number) ** 2;
  }
  return l + rr > 0 ? (rr - l) / (rr + l) : 0;
}

/** Spectral centroid (Hz) of the mono mix: Hann window, radix-2 FFT over the first `n` samples. */
export function centroid(r: Stereo, sampleRate: number, n = 65536): number {
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
      const t = re[i] as number;
      re[i] = re[j] as number;
      re[j] = t;
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
    num += mag * ((k * sampleRate) / n);
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

/** Share of the energy in the last 40% of the render (tails: room, delay, release). */
export function tailShare(r: Stereo): number {
  const whole = rms(r);
  const from = Math.floor(r.left.length * 0.6);
  return whole > 0 ? (rms(r, from) ** 2 * (r.left.length - from)) / (whole ** 2 * r.left.length) : 0;
}

/** Audible iff clearly above the threshold AND clearly above the control's own run-to-run noise. */
export function isAudible(diffDb: number, repeatDb: number): boolean {
  return diffDb > AUDIBLE_DB && diffDb > repeatDb + 20;
}

/** −60 dBFS RMS: a sound against silence (quiet hats sit near −40 dBFS on a two-hit phrase). */
export const SOUND_AUDIBLE_DBFS = -60;

/** Long-term magnitude spectrum of the mono mix: Hann frames of `size`, hop size/2, averaged. */
export function averageSpectrum(r: Stereo, size = 4096): Float64Array {
  const out = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  for (let start = 0; start + size <= r.left.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (((r.left[start + i] as number) + (r.right[start + i] as number)) / 2) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++)
      out[k] = (out[k] as number) + Math.hypot(re[k] as number, im[k] as number);
    frames++;
  }
  if (frames > 0) for (let k = 0; k < out.length; k++) out[k] = (out[k] as number) / frames;
  return out;
}

/** Phase-insensitive difference of two renders: rms(|A| − |B|) / rms(|A|) over the average spectrum, in dB. */
export function spectralDiffDb(a: Stereo, b: Stereo): number {
  const sa = averageSpectrum(a);
  const sb = averageSpectrum(b);
  let num = 0;
  let den = 0;
  for (let k = 0; k < sa.length; k++) {
    num += ((sa[k] as number) - (sb[k] as number)) ** 2;
    den += (sa[k] as number) ** 2;
  }
  return den > 0 ? db(Math.sqrt(num / den)) : Number.NEGATIVE_INFINITY;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const cr = Math.cos(ang * k);
        const ci = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

/**
 * For sources that are not bit-repeatable (supersaw's random phases), the sample-wise test cannot tell a
 * change from run-to-run noise: fall back to the phase-insensitive spectrum, which must move clearly more
 * than it does between two renders of the same code.
 */
export function isAudibleSpectral(specDb: number, specRepeatDb: number): boolean {
  return specDb > -30 && specDb > specRepeatDb + 4;
}

/** Stereo width: rms(L − R) / rms(L + R). 0 is mono. */
export function sideRatio(r: Stereo): number {
  let side = 0;
  let mid = 0;
  for (let i = 0; i < r.left.length; i++) {
    const l = r.left[i] as number;
    const rr = r.right[i] as number;
    side += (l - rr) ** 2;
    mid += (l + rr) ** 2;
  }
  return mid > 0 ? Math.sqrt(side / mid) : 0;
}

/** A width change (spread, jux, pan) that clearly exceeds run-to-run noise. */
export function isAudibleWidth(without: number, withControl: number, again: number): boolean {
  const change = Math.abs(withControl - without);
  return change > 0.05 && change > 3 * Math.abs(withControl - again);
}
