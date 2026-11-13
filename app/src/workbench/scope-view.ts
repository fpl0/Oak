// What Oak's scope and spectrum panel draws (Wave 5, docs/design/wave5.md §3.4, §4.4; contracts §3.1 rule 9): the
// geometry of the live wave and spectrum (from the master-bus `ScopeTap` through `@oak/audio`'s `steadyWave` and
// `spectrumBands`), the harmonics of a simple wave labelled by number, frequency and note (A1.L01), and the visual
// probes — the filter curve of `.lpf()` / `.hpf()` / `.bpf()` with its resonance (A1.L02), the ADSR shape (A1.L03)
// and the delay's taps (A1.L04) — computed with `@oak/strudel/probes`. Pure: tested in wave5.test.ts; the panel
// (ScopePanel.tsx) owns the canvas and the frame loop.
import type { SpectrumBand } from "@oak/audio";
import type { LiveHap } from "@oak/strudel";
import {
  type AdsrProbe,
  adsrCurve,
  type DelayProbe,
  delayTaps,
  type FilterProbe,
  filterCurve,
  type HarmonicsProbe,
  logFrequencies,
  type VisualProbe,
} from "@oak/strudel/probes";
import { displayName, freqToMidi, midiToFreq, noteToMidi, spellMidi } from "@oak/theory";

/** Frames a second the panel redraws at most (reduced motion: 10, contracts' "no easing"). */
export const SCOPE_FPS = 30;
export const SCOPE_FPS_REDUCED = 10;

/** The wave as an SVG/canvas polyline across `w` × `h` (−1 at the bottom, +1 at the top). */
export function wavePoints(samples: ArrayLike<number>, w: number, h: number, max = 512): [number, number][] {
  const n = samples.length;
  if (n === 0) return [];
  const step = Math.max(1, Math.floor(n / max));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += step) {
    const v = Math.max(-1, Math.min(1, samples[i] as number));
    out.push([(i / Math.max(1, n - 1)) * w, h / 2 - v * (h / 2 - 2)]);
  }
  return out;
}

/** The wave scaled so its peak fills 90% of the height (silence stays silence: no gain past 40×). */
export function fitWave(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i] as number));
  if (peak <= 0) return samples;
  const k = Math.min(40, 0.9 / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = (samples[i] as number) * k;
  return out;
}

/** The spectrum bands as bars: x, width and height in a `w` × `h` box, `floorDb` at the bottom, 0 dB at the top. */
export function spectrumBars(
  bands: readonly SpectrumBand[],
  w: number,
  h: number,
  floorDb = -100,
): { x: number; w: number; h: number }[] {
  const bw = bands.length > 0 ? w / bands.length : 0;
  return bands.map((b, i) => {
    const level = Math.max(0, Math.min(1, (b.db - floorDb) / -floorDb));
    return { x: i * bw, w: Math.max(1, bw - 1), h: level * h };
  });
}

/** True when the samples are all (near) silent: the panel says "Press Play to see the wave". */
export function isSilent(samples: ArrayLike<number>, floor = 1e-4): boolean {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i] as number) > floor) return false;
  return true;
}

/** The pitch of a hap in Hz (`freq`, a MIDI `note`, a note name), else `null`. */
export function f0OfHap(hap: Pick<LiveHap, "value"> | null | undefined): number | null {
  const v = hap?.value;
  if (!v) return null;
  if (typeof v.freq === "number" && v.freq > 0) return v.freq;
  if (typeof v.note === "number") return midiToFreq(v.note);
  if (typeof v.note === "string") {
    const m = noteToMidi(v.note);
    return m === null ? null : midiToFreq(m);
  }
  return null;
}

/**
 * "A3", from a frequency: the nearest note, spelled in the major key of `tonicHz` when given (the harmonics of A
 * are A, E and C♯, never D♭), else plainly.
 */
export function noteOfHz(hz: number, tonicHz?: number): string {
  const tonic = tonicHz
    ? spellMidi(Math.round(freqToMidi(tonicHz)), { key: null }).name.replace(/-?\d+$/, "")
    : null;
  const key = tonic ? { tonic, mode: "major" as const } : null;
  return displayName(spellMidi(Math.round(freqToMidi(hz)), { key }));
}

export interface HarmonicRow {
  /** 1 is the fundamental. */
  n: number;
  hz: number;
  /** The nearest note ("E4"), "≈" marked when it is more than 10 cents off. */
  note: string;
  near: boolean;
  /** Relative amplitude in the theory series (0–1). */
  amp: number;
}

/** The harmonics probe as rows labelled for a learner: number, frequency, nearest note, theory amplitude. */
export function harmonicRows(p: HarmonicsProbe, f0: number | null, n = 8): HarmonicRow[] {
  return p.amplitudes.slice(0, n).map((amp, i) => {
    const k = i + 1;
    const hz = (f0 ?? 0) * k;
    const midi = hz > 0 ? freqToMidi(hz) : 0;
    return {
      n: k,
      hz: Math.round(hz),
      note: hz > 0 ? noteOfHz(hz, f0 ?? undefined) : "",
      near: hz > 0 && Math.abs(midi - Math.round(midi)) <= 0.1,
      amp,
    };
  });
}

/** "sine: the fundamental alone", "sawtooth: every harmonic, each quieter (1/n)" … */
export function harmonicsCaption(p: HarmonicsProbe): string {
  if (p.source === "partials") return "Your .partials() list: each number is the level of one harmonic.";
  switch (p.wave) {
    case "sine":
      return "A sine is its fundamental alone: no harmonics above it.";
    case "sawtooth":
    case "saw":
      return "A sawtooth has every harmonic, each quieter than the last (1/n): bright and buzzy.";
    case "square":
      return "A square has only the odd harmonics (1, 3, 5 …), each 1/n: hollow and reedy.";
    case "triangle":
      return "A triangle has the odd harmonics too, but they fade fast (1/n²): soft, nearly a sine.";
    default:
      return "The harmonics of this sound.";
  }
}

const fmtHz = (hz: number) =>
  hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10_000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;

/** The filter in words: "Low-pass at 600 Hz, resonance 1: the highs above it fade (12 dB per octave)." */
export function filterCaption(p: FilterProbe): string {
  const what =
    p.filter === "lpf"
      ? `Low-pass at ${fmtHz(p.cutoff)}: the highs above it fade`
      : p.filter === "hpf"
        ? `High-pass at ${fmtHz(p.cutoff)}: the lows below it fade`
        : `Band-pass around ${fmtHz(p.cutoff)}: only a band near it passes`;
  const q =
    p.filter === "bpf" ? "" : p.q > 1.5 ? `; resonance ${round1(p.q)} lifts a peak at the cutoff` : "";
  return `${what} (${p.slope} dB per octave)${q}.`;
}

export function envelopeCaption(p: AdsrProbe): string {
  return `Attack ${sec(p.attack)}, decay ${sec(p.decay)}, sustain ${Math.round(p.sustain * 100)}%, release ${sec(p.release)}.`;
}

export function delayCaption(p: DelayProbe): string {
  const taps = delayTaps(p).length;
  return `Echoes every ${sec(p.time)}, starting at ${Math.round(p.wet * 100)}%, each ${Math.round(Math.min(p.feedback, 0.98) * 100)}% of the one before: ${taps} you can hear.`;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const sec = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${round1(s)} s`);

/** The probe's caption. */
export function probeCaption(p: VisualProbe): string {
  switch (p.kind) {
    case "filter":
      return filterCaption(p);
    case "envelope":
      return envelopeCaption(p);
    case "delay":
      return delayCaption(p);
    case "harmonics":
      return harmonicsCaption(p);
  }
}

export interface ProbeGeometry {
  /** The curve, an SVG path in a `w` × `h` box. */
  path: string;
  /** Vertical marks (the cutoff, the attack's end …) with a label. */
  marks: { x: number; label: string }[];
  /** Bars (delay taps, harmonics), when the probe is drawn as bars. */
  bars: { x: number; w: number; h: number; label: string }[];
  /** Axis labels at the ends. */
  axis: { left: string; right: string };
}

const pathOf = (pts: readonly [number, number][]) =>
  pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** Filter: gain from +18 dB (top) to −36 dB (bottom) over 20 Hz – 20 kHz on a log axis. */
export function filterGeometry(p: FilterProbe, w: number, h: number): ProbeGeometry {
  const freqs = logFrequencies(96);
  const db = filterCurve(p, freqs);
  const top = 18;
  const bottom = -36;
  const y = (d: number) => ((top - Math.max(bottom, Math.min(top, d))) / (top - bottom)) * h;
  const x = (f: number) => (Math.log(f / 20) / Math.log(1000)) * w;
  return {
    path: pathOf(freqs.map((f, i) => [x(f), y(db[i] as number)])),
    marks: [{ x: x(Math.min(20_000, Math.max(20, p.cutoff))), label: fmtHz(p.cutoff) }],
    bars: [],
    axis: { left: "20 Hz", right: "20 kHz" },
  };
}

/** Envelope: level 0–1 over the note's life (a note held `holdSec`, then released). */
export function envelopeGeometry(p: AdsrProbe, w: number, h: number, holdSec = 0.5): ProbeGeometry {
  const hold = Math.max(holdSec, p.attack + p.decay + 0.1);
  const pts = adsrCurve(p, hold);
  const end = (pts[pts.length - 1]?.[0] ?? 1) || 1;
  const x = (t: number) => (t / end) * w;
  const y = (l: number) => h - l * (h - 2) - 1;
  return {
    path: pathOf(pts.map(([t, l]) => [x(t), y(l)])),
    // A mark closer than 10 px to the one before is left out (a 1 ms decay sits on the attack's).
    marks: [
      { x: x(p.attack), label: "A" },
      { x: x(p.attack + p.decay), label: "D" },
      { x: x(hold), label: "R" },
    ].filter((m, i, all) => i === 0 || m.x - (all[i - 1]?.x ?? 0) >= 10),
    bars: [],
    axis: { left: "note on", right: sec(end) },
  };
}

/** Delay: one bar per echo at its time, its height the level. */
export function delayGeometry(p: DelayProbe, w: number, h: number): ProbeGeometry {
  const taps = delayTaps(p, { max: 16 });
  const end = Math.max(p.time * (taps.length + 1), 0.25);
  const x = (t: number) => (t / end) * w;
  return {
    path: "",
    marks: [],
    bars: [
      { x: 0, w: 4, h: h - 2, label: "note" },
      ...taps.map(([t, l], i) => ({ x: x(t), w: 4, h: Math.max(1, l * (h - 2)), label: String(i + 1) })),
    ],
    axis: { left: "0 s", right: sec(end) },
  };
}

/** Harmonics: one bar per harmonic, its height the theory amplitude. */
export function harmonicsGeometry(p: HarmonicsProbe, w: number, h: number, n = 8): ProbeGeometry {
  const amps = p.amplitudes.slice(0, n);
  const bw = w / Math.max(1, amps.length);
  return {
    path: "",
    marks: [],
    bars: amps.map((a, i) => ({
      x: i * bw + bw * 0.2,
      w: bw * 0.6,
      h: Math.max(a > 0 ? 1 : 0, a * (h - 2)),
      label: String(i + 1),
    })),
    axis: { left: "fundamental", right: `harmonic ${amps.length}` },
  };
}

export function probeGeometry(p: VisualProbe, w: number, h: number): ProbeGeometry {
  switch (p.kind) {
    case "filter":
      return filterGeometry(p, w, h);
    case "envelope":
      return envelopeGeometry(p, w, h);
    case "delay":
      return delayGeometry(p, w, h);
    case "harmonics":
      return harmonicsGeometry(p, w, h);
  }
}

/** What to write when the code sets nothing the probe draws. */
export const PROBE_HINTS: Readonly<Record<VisualProbe["kind"], string>> = {
  filter: "Add .lpf() (or .hpf(), .bpf()) and press Run to see its curve.",
  envelope: "Add .attack() or .release() and press Run to see the envelope's shape.",
  delay: "Add .delay() and press Run to see its echoes.",
  harmonics: "Play a wave (sine, sawtooth, square, triangle) and press Run to see its harmonics.",
};

/** Before the first Run: the probe reads the notes the code plays, so it waits for them. */
export const PROBE_BEFORE_RUN: Readonly<Record<VisualProbe["kind"], string>> = {
  filter: "Press Run (or Play) and the filter's curve is drawn from your code.",
  envelope: "Press Run (or Play) and the envelope's shape is drawn from your code.",
  delay: "Press Run (or Play) and the echoes are drawn from your code.",
  harmonics: "Press Run (or Play) and the harmonics of your sound are drawn here.",
};

/** The probe's title. */
export const PROBE_TITLES: Readonly<Record<VisualProbe["kind"], string>> = {
  filter: "Filter",
  envelope: "Envelope",
  delay: "Delay",
  harmonics: "Harmonics",
};

/**
 * The probes a code asks for by itself (the Studio and the Toolbox, where no step names one): the controls its
 * first learner hap sets, in the order the A1 lessons teach them.
 */
export function probesInHap(
  value: Readonly<Record<string, unknown>> | null | undefined,
): VisualProbe["kind"][] {
  if (!value) return [];
  const out: VisualProbe["kind"][] = [];
  const has = (k: string) => value[k] !== undefined;
  if (Array.isArray(value.partials)) out.push("harmonics");
  if (has("cutoff") || has("hcutoff") || has("bandf")) out.push("filter");
  if (has("attack") || has("decay") || has("sustain") || has("release")) out.push("envelope");
  if (typeof value.delay === "number" && value.delay > 0) out.push("delay");
  return out;
}
