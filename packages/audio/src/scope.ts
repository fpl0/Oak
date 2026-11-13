// Wave 5 seam (docs/design/wave5.md §3.4): what Oak's scope and spectrum panel draws from the samples the
// `ScopeTap` (`@oak/strudel`) hands it — a steady wave (trigger on a rising zero crossing, so a held note stands
// still), log-spaced spectrum bands, and the level of each harmonic of a known fundamental (A1.L01 "waves and
// harmonics"). Pure functions on Float32Arrays; the panel (workbench) owns the drawing and the frame loop.

/** Index of the first rising crossing of `level` in the first half of the window (0 when there is none). */
export function triggerIndex(wave: ArrayLike<number>, level = 0): number {
  const half = Math.floor(wave.length / 2);
  for (let i = 1; i < half; i++)
    if ((wave[i - 1] as number) < level && (wave[i] as number) >= level) return i;
  return 0;
}

/** `count` samples of the wave from its trigger point (the scope's steady view). */
export function steadyWave(wave: ArrayLike<number>, count = Math.floor(wave.length / 2)): Float32Array {
  const start = triggerIndex(wave);
  const out = new Float32Array(Math.max(0, Math.min(count, wave.length - start)));
  for (let i = 0; i < out.length; i++) out[i] = wave[start + i] as number;
  return out;
}

export interface SpectrumBand {
  lowHz: number;
  highHz: number;
  /** Loudest bin in the band, dBFS (−Infinity mapped to `floorDb`). */
  db: number;
}
/** The spectrum (dBFS per bin, `fftSize / 2` bins) folded into `bands` log-spaced bands from `minHz` to `maxHz`. */
export function spectrumBands(
  spectrum: ArrayLike<number>,
  sampleRate: number,
  o: { bands?: number; minHz?: number; maxHz?: number; floorDb?: number } = {},
): SpectrumBand[] {
  const bands = o.bands ?? 48;
  const minHz = o.minHz ?? 30;
  const maxHz = Math.min(o.maxHz ?? 16_000, sampleRate / 2);
  const floorDb = o.floorDb ?? -100;
  const binHz = sampleRate / 2 / spectrum.length;
  const out: SpectrumBand[] = [];
  for (let b = 0; b < bands; b++) {
    const lowHz = minHz * (maxHz / minHz) ** (b / bands);
    const highHz = minHz * (maxHz / minHz) ** ((b + 1) / bands);
    const from = Math.max(0, Math.floor(lowHz / binHz));
    const to = Math.min(spectrum.length - 1, Math.max(from, Math.ceil(highHz / binHz) - 1));
    let db = floorDb;
    for (let i = from; i <= to; i++) {
      const v = spectrum[i] as number;
      if (Number.isFinite(v) && v > db) db = v;
    }
    out.push({ lowHz, highHz, db });
  }
  return out;
}

/**
 * The level (dBFS) of harmonics 1..n of `f0`: the loudest bin within half a bin-width of each harmonic's
 * frequency. A harmonic above Nyquist is `null`.
 */
export function harmonicLevels(
  spectrum: ArrayLike<number>,
  sampleRate: number,
  f0: number,
  n = 8,
): (number | null)[] {
  const binHz = sampleRate / 2 / spectrum.length;
  return Array.from({ length: n }, (_, k) => {
    const f = f0 * (k + 1);
    if (f >= sampleRate / 2) return null;
    const c = f / binHz;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = Math.max(0, Math.floor(c - 1)); i <= Math.min(spectrum.length - 1, Math.ceil(c + 1)); i++)
      best = Math.max(best, spectrum[i] as number);
    return best;
  });
}
