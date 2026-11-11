// Pitch maths shared by the detector, the tracker and the graders. Pure; safe inside an AudioWorklet.

export function hzToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
/** Signed cents from `targetMidi` to `midi`, folded into (−600, 600] when `fold` is set. */
export function centsFrom(midi: number, targetMidi: number, fold = false): number {
  const cents = (midi - targetMidi) * 100;
  if (!fold) return cents;
  const folded = ((((cents + 600) % 1200) + 1200) % 1200) - 600;
  return folded === -600 ? 600 : folded;
}
/** Linear RMS to dBFS, amplitude convention. */
export function rmsDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
}
/** dBFS to linear RMS. */
export function dbToRms(db: number): number {
  return 10 ** (db / 20);
}
/** Root mean square of a buffer. */
export function rmsOf(buf: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] as number;
    sum += v * v;
  }
  return buf.length === 0 ? 0 : Math.sqrt(sum / buf.length);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
/** Median absolute deviation around the median. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}
/** The `p` quantile (0 to 1) by linear interpolation. */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const x = Math.min(1, Math.max(0, p)) * (s.length - 1);
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (x - lo);
}
export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
/**
 * A neutral sharp-spelled name for a MIDI number ("C#4"), for diagnostics and logs only. Display that
 * knows the key must re-spell from the MIDI number with `spellMidi` of @oak/theory.
 */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${SHARP_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
