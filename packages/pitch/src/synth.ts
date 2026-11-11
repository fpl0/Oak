/** Deterministic test-signal synthesis shared by bun tests and the fixture generator. Pure. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Wave = "sine" | "saw" | "voice";

export interface ToneSpec {
  hz: number;
  seconds: number;
  sampleRate: number;
  wave?: Wave;
  amp?: number;
  /** vibrato depth in cents (peak) and rate in Hz */
  vibratoCents?: number;
  vibratoHz?: number;
  /** seconds before vibrato reaches full depth */
  vibratoOnset?: number;
  /** white noise RMS relative to full scale, in dB (e.g. -40). Omit for none. */
  noiseDb?: number;
  seed?: number;
  /** linear fade in/out seconds */
  fade?: number;
}

/** Harmonic amplitude tables. Additive synthesis => band-limited, exact fundamental. */
function harmonicAmp(wave: Wave, k: number): number {
  if (wave === "sine") return k === 1 ? 1 : 0;
  if (wave === "saw") return 1 / k;
  // "voice": a rough sung "ah" — strong low harmonics with a formant bump near the 3rd-5th
  const table = [1, 0.7, 0.55, 0.6, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03];
  return table[k - 1] ?? 0;
}

export function tone(spec: ToneSpec): Float32Array {
  const { hz, seconds, sampleRate } = spec;
  const wave = spec.wave ?? "sine";
  const amp = spec.amp ?? 0.5;
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const rand = mulberry32(spec.seed ?? 1);
  const noiseAmp = spec.noiseDb === undefined ? 0 : 10 ** (spec.noiseDb / 20) * Math.sqrt(3); // uniform [-a,a] has rms a/sqrt(3)
  const vibC = spec.vibratoCents ?? 0;
  const vibHz = spec.vibratoHz ?? 5.5;
  const vibOnset = spec.vibratoOnset ?? 0;
  const maxK = wave === "sine" ? 1 : wave === "voice" ? 10 : 64;
  let norm = 0;
  for (let k = 1; k <= maxK; k++) norm += harmonicAmp(wave, k);
  const fade = Math.round((spec.fade ?? 0) * sampleRate);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const depth = vibOnset > 0 ? Math.min(1, t / vibOnset) : 1;
    const f = vibC ? hz * 2 ** ((vibC * depth * Math.sin(2 * Math.PI * vibHz * t)) / 1200) : hz;
    phase += (2 * Math.PI * f) / sampleRate;
    let v = 0;
    for (let k = 1; k <= maxK; k++) {
      if (k * f >= sampleRate / 2) break;
      const a = harmonicAmp(wave, k);
      if (a) v += a * Math.sin(k * phase);
    }
    v = (v / norm) * (wave === "sine" ? 1 : 1.6); // keep non-sine waves at a comparable level
    let env = 1;
    if (fade > 0) env = Math.min(1, i / fade, (n - 1 - i) / fade);
    out[i] = amp * env * v + (noiseAmp ? noiseAmp * (rand() * 2 - 1) : 0);
  }
  return out;
}

export function silence(seconds: number, sampleRate: number, noiseDb?: number, seed = 7): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  if (noiseDb !== undefined) {
    const rand = mulberry32(seed);
    const a = 10 ** (noiseDb / 20) * Math.sqrt(3);
    for (let i = 0; i < n; i++) out[i] = a * (rand() * 2 - 1);
  }
  return out;
}

export function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 16-bit PCM mono WAV (the format Chromium"s --use-file-for-fake-audio-capture expects). */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] as number));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

export function decodeWav16(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = v.getUint32(24, true);
  const n = v.getUint32(40, true) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = v.getInt16(44 + i * 2, true) / 32768;
  return { samples, sampleRate };
}

/** The 3-note "sung" melody used by the fixture and by tests. Times in seconds. */
export const SUNG_NOTES = [
  { note: "A3", midi: 57, hz: 220, start: 0.4, dur: 0.6 },
  { note: "C#4", midi: 61, hz: 220 * 2 ** (4 / 12), start: 1.1, dur: 0.6 },
  { note: "E4", midi: 64, hz: 220 * 2 ** (7 / 12), start: 1.8, dur: 0.6 },
] as const;
export const SUNG_TOTAL_SECONDS = 3.0;

export function sungSequence(sampleRate: number, o: { legato?: boolean } = {}): Float32Array {
  const parts: Float32Array[] = [];
  let cursor = 0;
  SUNG_NOTES.forEach((n, i) => {
    const gap = n.start - cursor;
    if (o.legato && i > 0) {
      // fill the gap by extending the previous note: no silence between notes
      parts.push(
        tone({
          hz: (SUNG_NOTES[i - 1] as { hz: number }).hz,
          seconds: gap,
          sampleRate,
          wave: "voice",
          amp: 0.4,
          noiseDb: -50,
          seed: 20 + i,
        }),
      );
    } else {
      parts.push(silence(gap, sampleRate, -50, 10 + i));
    }
    parts.push(
      tone({
        hz: n.hz,
        seconds: n.dur,
        sampleRate,
        wave: "voice",
        amp: 0.4,
        vibratoCents: 15,
        vibratoHz: 5.5,
        vibratoOnset: 0.15,
        noiseDb: -50,
        seed: 30 + i,
        fade: o.legato ? 0 : 0.03,
      }),
    );
    cursor = n.start + n.dur;
  });
  parts.push(silence(SUNG_TOTAL_SECONDS - cursor, sampleRate, -50, 99));
  return concat(parts);
}
