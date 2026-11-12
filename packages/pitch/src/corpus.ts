// The pitch-tracking fixture corpus (Wave 3 gate: "≥ 95 % of voiced frames within ±25 cents, octave errors
// < 2 %"). Deterministic, generated from code: no audio files are committed. Every clip carries its own ground
// truth (the fundamental the synthesiser actually produced, and where there is no voice at all), so the gate in
// `gate.ts` can score the real worklet path (detector → tracker) frame by frame, in Bun and in the browser.
//
// The voice model is a source-filter singer: a harmonic glottal source (spectral tilt, an adjustable first
// harmonic for the weak-fundamental octave trap, jitter and shimmer), shaped by a cascade of vowel formants,
// plus aspiration noise. Pitch contours carry vibrato (rate, depth, onset), scoops into the note, slow drift and
// note-to-note glides; notes can start on a consonant (a noise burst or a sibilant). Backgrounds: white and pink
// noise at fixed SNRs, mains hum, a fan, keyboard clicks, breaths, and a backing track leaking out of the
// headphones (bass, chords, kick and hats) at a low level.
//
// Pure and isomorphic (no Node APIs): the voice e2e page builds its fake-microphone WAV from the same clips.
import { mulberry32 } from "./synth.ts";

/** The classes the gate reports separately. */
export const CORPUS_CLASSES = [
  "steady",
  "vibrato",
  "scoop-drift",
  "breathy",
  "noise",
  "weak-fundamental",
  "glide-legato",
  "consonant",
  "silence-room",
  "bleed",
] as const;
export type CorpusClass = (typeof CORPUS_CLASSES)[number];

/** Control rate of the truth tracks and the synthesiser's envelopes, in samples. */
export const TRUTH_STEP = 32;

export type Vowel = "a" | "e" | "i" | "o" | "u";
/** Formant frequencies (Hz) and bandwidths of sung vowels (adult averages; sopranos tune F1 up, below). */
const FORMANTS: Record<Vowel, readonly [number, number][]> = {
  a: [
    [730, 80],
    [1090, 90],
    [2440, 120],
    [3400, 150],
  ],
  e: [
    [530, 60],
    [1840, 90],
    [2480, 120],
    [3400, 150],
  ],
  i: [
    [290, 60],
    [2250, 90],
    [3000, 120],
    [3600, 150],
  ],
  o: [
    [570, 70],
    [840, 80],
    [2410, 120],
    [3400, 150],
  ],
  u: [
    [320, 60],
    [870, 80],
    [2240, 120],
    [3400, 150],
  ],
};

export interface VoiceTimbre {
  vowel: Vowel;
  /** Gain of the first harmonic relative to the source's own, dB (−24: a weak fundamental). Default 0. */
  h1Db?: number;
  /** Source roll-off in dB per octave after lip radiation (default −6). */
  tiltDb?: number;
  /** Cycle-to-cycle pitch wobble, fraction (0.004 = 0.4 %). Default 0.003. */
  jitter?: number;
  /** Amplitude wobble, fraction. Default 0.03. */
  shimmer?: number;
  /** Aspiration noise relative to the voiced level, dB (−18 breathy, −30 normal). Default −32. */
  breathDb?: number;
}

export interface NoteSpec {
  midi: number;
  /** Seconds, consonant excluded. */
  dur: number;
  vibrato?: { rateHz: number; cents: number; onsetSec?: number };
  /** The note starts this many cents flat (negative: sharp) and slides up over `scoopSec` (default 0.12 s). */
  scoopCents?: number;
  scoopSec?: number;
  /** Linear drift over the note, cents (end minus start). */
  driftCents?: number;
  /** A consonant before the vowel: a stop burst ("t", "k", "d") or a sibilant ("s"). */
  consonant?: "t" | "k" | "d" | "s";
  /** Level of this note relative to the phrase, dB. */
  gainDb?: number;
}

export type ClipPart =
  | { kind: "gap"; sec: number }
  /** Notes sung in one breath when `legato`, otherwise each note is articulated on its own. */
  | { kind: "phrase"; notes: NoteSpec[]; legato?: boolean; glideSec?: number };

export type Background =
  | { kind: "white"; db: number }
  | { kind: "pink"; db: number }
  | { kind: "hum"; hz: 50 | 60; db: number }
  | { kind: "fan"; db: number }
  | { kind: "clicks"; db: number; perSec: number }
  | { kind: "breaths"; db: number }
  | { kind: "bleed"; db: number; bpm?: number };

export interface ClipSpec {
  id: string;
  cls: CorpusClass;
  sampleRate?: number;
  /** RMS of the voiced part, dBFS. Default −20. */
  levelDb?: number;
  timbre: VoiceTimbre;
  parts: ClipPart[];
  /** Background layers; a white or pink layer may give its level as an SNR against the voice instead. */
  background?: (Background | { kind: "white-snr" | "pink-snr"; snrDb: number })[];
  /** The lowest note of the singer's range (MIDI): a low voice gets the 0.85 clarity gate (contracts §8.1). */
  rangeLow: number;
  seed?: number;
}

export interface CorpusClip {
  id: string;
  cls: CorpusClass;
  sampleRate: number;
  samples: Float32Array;
  /** Fundamental of the voice every `TRUTH_STEP` samples, Hz; 0 where there is no voice. */
  f0: Float32Array;
  /** Voice envelope every `TRUTH_STEP` samples, 0 to 1 (1 = the note's sustained level). */
  env: Float32Array;
  /** What a learner calibrating in this room would have stored: the background's level and the range. */
  profile: { noiseFloorDb: number; rangeLow: number };
  /** Seconds. */
  duration: number;
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const dbAmp = (db: number) => 10 ** (db / 20);

/** |H(f)| of a cascade of two-pole resonators (Klatt): 1 at DC, F/B at each formant peak. */
function formantGain(formants: readonly [number, number][], f: number): number {
  let g = 1;
  for (const [F, B] of formants) {
    const d = F * F - f * f;
    g *= (F * F) / Math.sqrt(d * d + B * B * f * f);
  }
  return g;
}

/** Smoothed random walk in [−1, 1] with correlation time `tauSec`, sampled every control step. */
function wobble(n: number, stepSec: number, tauSec: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  const a = Math.exp(-stepSec / tauSec);
  const k = Math.sqrt(1 - a * a) * Math.sqrt(3);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = a * v + k * (rand() * 2 - 1);
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

interface Timeline {
  /** Control-rate midi (NaN: no voice) and envelope. */
  midi: Float32Array;
  env: Float32Array;
  /** Consonant noise envelope per control step (0 to 1) and its kind (0 none, 1 burst, 2 sibilant). */
  cons: Float32Array;
  consKind: Uint8Array;
  steps: number;
}

function buildTimeline(spec: ClipSpec, sr: number, rand: () => number): Timeline {
  const stepSec = TRUTH_STEP / sr;
  let total = 0;
  for (const p of spec.parts) {
    if (p.kind === "gap") total += p.sec;
    else for (const n of p.notes) total += n.dur + consonantSec(n);
  }
  const steps = Math.ceil(total / stepSec) + 1;
  const midi = new Float32Array(steps).fill(Number.NaN);
  const env = new Float32Array(steps);
  const cons = new Float32Array(steps);
  const consKind = new Uint8Array(steps);
  let t = 0;
  const at = (sec: number) => Math.min(steps - 1, Math.max(0, Math.round(sec / stepSec)));
  for (const p of spec.parts) {
    if (p.kind === "gap") {
      t += p.sec;
      continue;
    }
    const legato = p.legato ?? false;
    const glide = p.glideSec ?? 0.06;
    const notes = p.notes;
    for (let ni = 0; ni < notes.length; ni++) {
      const n = notes[ni] as NoteSpec;
      // The consonant (only the first note of a legato phrase may have one).
      const cs = legato && ni > 0 ? 0 : consonantSec(n);
      if (cs > 0) {
        const kind = n.consonant === "s" ? 2 : 1;
        const a = at(t);
        const b = at(t + cs);
        for (let i = a; i < b; i++) {
          const u = (i - a) / Math.max(1, b - a);
          // A stop: 15 ms closure, then a burst that decays; a sibilant swells and stops at the vowel.
          const e =
            kind === 1
              ? u < 0.3
                ? 0
                : Math.exp(-((u - 0.3) * 6))
              : Math.sin(Math.PI * Math.min(1, u * 1.1));
          cons[i] = e;
          consKind[i] = kind;
        }
        t += cs;
      }
      const a = at(t);
      const b = at(t + n.dur);
      const vib = n.vibrato;
      const phase = rand() * 2 * Math.PI;
      const next = legato ? notes[ni + 1] : undefined;
      const gain = dbAmp(n.gainDb ?? 0);
      const attack = legato && ni > 0 ? 0 : 0.04;
      const release = legato && next ? 0 : 0.06;
      for (let i = a; i < b; i++) {
        const u = (i - a) * stepSec; // seconds into the note
        let m = n.midi;
        const scoopSec = n.scoopSec ?? 0.12;
        if (n.scoopCents && u < scoopSec) m -= (n.scoopCents / 100) * (1 - smooth(u / scoopSec));
        if (n.driftCents) m += (n.driftCents / 100) * (u / n.dur);
        if (vib) {
          const depth = vib.onsetSec ? Math.min(1, u / vib.onsetSec) : 1;
          m += (vib.cents / 100) * depth * Math.sin(2 * Math.PI * vib.rateHz * u + phase);
        }
        // A legato glide into the next note over the last `glide` seconds.
        if (next && u > n.dur - glide) m += (next.midi - n.midi) * smooth((u - (n.dur - glide)) / glide);
        midi[i] = m;
        let e = gain;
        if (attack > 0 && u < attack) e *= smooth(u / attack);
        if (release > 0 && u > n.dur - release) e *= smooth((n.dur - u) / release);
        env[i] = e;
      }
      t += n.dur;
    }
  }
  return { midi, env, cons, consKind, steps };
}

function consonantSec(n: NoteSpec): number {
  if (!n.consonant) return 0;
  return n.consonant === "s" ? 0.12 : 0.05;
}

/** One-pole filters for noise colouring. */
function highpass(x: Float32Array, sr: number, hz: number): Float32Array {
  const out = new Float32Array(x.length);
  const rc = 1 / (2 * Math.PI * hz);
  const a = rc / (rc + 1 / sr);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < x.length; i++) {
    const y = a * (prevY + (x[i] as number) - prevX);
    prevX = x[i] as number;
    prevY = y;
    out[i] = y;
  }
  return out;
}
function lowpass(x: Float32Array, sr: number, hz: number): Float32Array {
  const out = new Float32Array(x.length);
  const a = 1 - Math.exp((-2 * Math.PI * hz) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * ((x[i] as number) - y);
    out[i] = y;
  }
  return out;
}
function white(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}
/** Paul Kellet's economy pink filter. */
function pink(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return out;
}
function rmsOfRange(x: Float32Array, mask?: (i: number) => boolean): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    if (mask && !mask(i)) continue;
    const v = x[i] as number;
    s += v * v;
    c++;
  }
  return c > 0 ? Math.sqrt(s / c) : 0;
}
function scaleTo(x: Float32Array, db: number): Float32Array {
  const r = rmsOfRange(x);
  if (r > 0) {
    const k = dbAmp(db) / r;
    for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * k;
  }
  return x;
}

/** The singer: additive harmonics with per-block formant gains, jitter, shimmer and aspiration. */
function synthVoice(tl: Timeline, timbre: VoiceTimbre, sr: number, rand: () => number): Float32Array {
  const n = tl.steps * TRUTH_STEP;
  const out = new Float32Array(n);
  const stepSec = TRUTH_STEP / sr;
  const formants = FORMANTS[timbre.vowel];
  const h1 = dbAmp(timbre.h1Db ?? 0);
  const tilt = timbre.tiltDb ?? -6;
  const jit = wobble(tl.steps, stepSec, 0.012, rand);
  const shim = wobble(tl.steps, stepSec, 0.02, rand);
  const jitter = timbre.jitter ?? 0.003;
  const shimmer = timbre.shimmer ?? 0.03;
  const maxHz = Math.min(5200, sr / 2 - 400);
  let phase = 0;
  const amps = new Float64Array(81); // indices 1…80 (K is at most 80)
  for (let s = 0; s < tl.steps; s++) {
    const m = tl.midi[s] as number;
    const e = tl.env[s] as number;
    if (!(e > 0) || Number.isNaN(m)) continue;
    const f0 = midiHz(m) * (1 + jitter * (jit[s] as number));
    const K = Math.min(80, Math.floor(maxHz / f0));
    // Sopranos tune the first formant up to the fundamental when it would sit below it (formant tuning).
    const fm = formants.map(([F, B]) => [F, B] as [number, number]);
    if ((fm[0] as [number, number])[0] < f0) (fm[0] as [number, number])[0] = f0 * 1.05;
    let norm = 0;
    for (let k = 1; k <= K; k++) {
      const a = 10 ** ((tilt * Math.log2(k)) / 20) * formantGain(fm, k * f0) * (k === 1 ? h1 : 1);
      amps[k] = a;
      norm += a * a;
    }
    const g = (e * (1 + shimmer * (shim[s] as number))) / Math.sqrt(norm / 2 || 1);
    const dphi = (2 * Math.PI * f0) / sr;
    const base = s * TRUTH_STEP;
    for (let j = 0; j < TRUTH_STEP; j++) {
      phase += dphi;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      // sin(kφ) by rotation: z_k = z_{k−1} · z_1.
      const c1 = Math.cos(phase);
      const s1 = Math.sin(phase);
      let c = c1;
      let si = s1;
      let v = (amps[1] as number) * si;
      for (let k = 2; k <= K; k++) {
        const nc = c * c1 - si * s1;
        si = si * c1 + c * s1;
        c = nc;
        v += (amps[k] as number) * si;
      }
      out[base + j] = g * v;
    }
  }
  // Aspiration: high-passed noise riding the voice envelope.
  const breathDb = timbre.breathDb ?? -32;
  const asp = highpass(white(n, rand), sr, 1200);
  const voiceRms = rmsOfRange(out, (i) => (tl.env[Math.floor(i / TRUTH_STEP)] as number) > 0.5);
  const aspRms = rmsOfRange(asp);
  const k = aspRms > 0 ? (voiceRms * dbAmp(breathDb)) / aspRms : 0;
  for (let i = 0; i < n; i++) {
    const e = tl.env[Math.floor(i / TRUTH_STEP)] as number;
    if (e > 0) out[i] = (out[i] as number) + k * e * (asp[i] as number);
  }
  // Consonants: bursts and sibilants at the voice's scale.
  const burst = highpass(white(n, rand), sr, 1500);
  const sib = highpass(highpass(white(n, rand), sr, 3500), sr, 3500);
  for (let i = 0; i < n; i++) {
    const s = Math.floor(i / TRUTH_STEP);
    const ce = tl.cons[s] as number;
    if (ce > 0) {
      const src = tl.consKind[s] === 2 ? sib : burst;
      out[i] =
        (out[i] as number) + voiceRms * (tl.consKind[s] === 2 ? 0.7 : 1.4) * ce * (src[i] as number) * 2.5;
    }
  }
  return out;
}

/** A short backing track (bass, chords, kick, hats) as it leaks out of closed headphones. */
export function backingTrack(seconds: number, sr: number, seed: number, bpm = 100): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  const beat = 60 / bpm;
  // C – A minor – F – G, one chord a bar; the bass on beats 1 and 3.
  const roots = [36, 33, 29, 31];
  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  const addTone = (midi: number, at: number, dur: number, amp: number, harmonics: number, decay: number) => {
    const f = midiHz(midi);
    const a = Math.round(at * sr);
    const b = Math.min(n, Math.round((at + dur) * sr));
    for (let i = a; i < b; i++) {
      const t = (i - a) / sr;
      let v = 0;
      for (let k = 1; k <= harmonics; k++) v += Math.sin(2 * Math.PI * f * k * t) / k;
      out[i] = (out[i] as number) + amp * Math.exp(-t / decay) * v;
    }
  };
  for (let beatI = 0; beatI * beat < seconds; beatI++) {
    const t = beatI * beat;
    const bar = Math.floor(beatI / 4) % 4;
    const inBar = beatI % 4;
    if (inBar === 0 || inBar === 2) addTone(roots[bar] as number, t, beat * 1.8, 0.5, 6, 0.6);
    if (inBar === 0) for (const m of chords[bar] as number[]) addTone(m, t, beat * 3.5, 0.18, 3, 1.2);
    // Kick: a falling sine; hats: short noise on the off-beats.
    const a = Math.round(t * sr);
    for (let i = a; i < Math.min(n, a + Math.round(0.25 * sr)); i++) {
      const u = (i - a) / sr;
      const f = 50 + 100 * Math.exp(-u * 30);
      out[i] = (out[i] as number) + 0.8 * Math.exp(-u * 12) * Math.sin(2 * Math.PI * f * u);
    }
    const h = Math.round((t + beat / 2) * sr);
    for (let i = h; i < Math.min(n, h + Math.round(0.05 * sr)); i++)
      out[i] = (out[i] as number) + 0.15 * Math.exp(-((i - h) / sr) * 80) * (rand() * 2 - 1);
  }
  // Headphone leakage loses the deep bass: a gentle high-pass.
  return highpass(out, sr, 120);
}

function backgroundLayer(b: Background, n: number, sr: number, rand: () => number): Float32Array {
  switch (b.kind) {
    case "white":
      return scaleTo(white(n, rand), b.db);
    case "pink":
      return scaleTo(pink(n, rand), b.db);
    case "hum": {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        x[i] =
          Math.sin(2 * Math.PI * b.hz * t) +
          0.5 * Math.sin(2 * Math.PI * 2 * b.hz * t + 0.3) +
          0.3 * Math.sin(2 * Math.PI * 3 * b.hz * t + 1.1);
      }
      return scaleTo(x, b.db);
    }
    case "fan":
      return scaleTo(lowpass(lowpass(pink(n, rand), sr, 400), sr, 600), b.db);
    case "clicks": {
      const x = new Float32Array(n);
      const src = highpass(white(n, rand), sr, 2000);
      const every = sr / b.perSec;
      for (let at = Math.round(every * rand()); at < n; at += Math.round(every * (0.5 + rand()))) {
        for (let i = at; i < Math.min(n, at + Math.round(0.03 * sr)); i++)
          x[i] = (src[i] as number) * Math.exp(-((i - at) / sr) * 200);
      }
      // `db` is the level of a click, not of the whole clip.
      const peak = rmsOfRange(x, (i) => x[i] !== 0);
      const k = peak > 0 ? dbAmp(b.db) / peak : 0;
      for (let i = 0; i < n; i++) x[i] = (x[i] as number) * k;
      return x;
    }
    case "breaths": {
      // Breaths in and out through the mouth: band-limited noise swelling over about 0.6 s, every 2 s.
      const src = lowpass(highpass(white(n, rand), sr, 500), sr, 3000);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const u = (i / sr) % 2;
        x[i] = u < 0.6 ? (src[i] as number) * Math.sin((Math.PI * u) / 0.6) : 0;
      }
      const r = rmsOfRange(x, (i) => x[i] !== 0);
      const k = r > 0 ? dbAmp(b.db) / r : 0;
      for (let i = 0; i < n; i++) x[i] = (x[i] as number) * k;
      return x;
    }
    case "bleed":
      return scaleTo(backingTrack(n / sr, sr, Math.floor(rand() * 1e9), b.bpm), b.db);
  }
}

/** Renders one clip: the mixed signal, its truth tracks and the profile a learner in that room would have. */
export function renderClip(spec: ClipSpec): CorpusClip {
  const sr = spec.sampleRate ?? 48000;
  const rand = mulberry32(spec.seed ?? hashId(spec.id));
  const tl = buildTimeline(spec, sr, rand);
  const voice = synthVoice(tl, spec.timbre, sr, rand);
  const n = voice.length;
  const level = spec.levelDb ?? -20;
  // Scale the voice so its sustained part sits at `level` dBFS.
  const sustained = (i: number) => (tl.env[Math.floor(i / TRUTH_STEP)] as number) > 0.5;
  const vr = rmsOfRange(voice, sustained);
  const hasVoice = vr > 0;
  if (hasVoice) {
    const k = dbAmp(level) / vr;
    for (let i = 0; i < n; i++) voice[i] = (voice[i] as number) * k;
  }
  // A quiet room under everything (−72 dBFS of pink noise), then the clip's own background.
  const bgLayers: { x: Float32Array; inRoom: boolean }[] = [{ x: scaleTo(pink(n, rand), -72), inRoom: true }];
  for (const b of spec.background ?? []) {
    // Bleed is not in the room when the learner calibrates (nothing plays during the quiet check).
    if (b.kind === "white-snr") bgLayers.push({ x: scaleTo(white(n, rand), level - b.snrDb), inRoom: true });
    else if (b.kind === "pink-snr")
      bgLayers.push({ x: scaleTo(pink(n, rand), level - b.snrDb), inRoom: true });
    else bgLayers.push({ x: backgroundLayer(b as Background, n, sr, rand), inRoom: b.kind !== "bleed" });
  }
  const samples = new Float32Array(n);
  const room = new Float32Array(n);
  for (const { x, inRoom } of bgLayers) {
    for (let i = 0; i < n; i++) {
      samples[i] = (samples[i] as number) + (x[i] as number);
      if (inRoom) room[i] = (room[i] as number) + (x[i] as number);
    }
  }
  for (let i = 0; i < n; i++)
    samples[i] = Math.max(-1, Math.min(1, (samples[i] as number) + (voice[i] as number)));
  const f0 = new Float32Array(tl.steps);
  for (let s = 0; s < tl.steps; s++) {
    const m = tl.midi[s] as number;
    f0[s] = (tl.env[s] as number) > 0 && !Number.isNaN(m) ? midiHz(m) : 0;
  }
  // The quiet check measures the room's median frame level (as `Calibration.noiseFloor` does).
  const noiseFloorDb = medianFrameDb(room, sr);
  return {
    id: spec.id,
    cls: spec.cls,
    sampleRate: sr,
    samples,
    f0,
    env: tl.env,
    profile: { noiseFloorDb, rangeLow: spec.rangeLow },
    duration: n / sr,
  };
}

function medianFrameDb(x: Float32Array, sr: number): number {
  const win = 2048;
  const hop = Math.round(sr / 50);
  const dbs: number[] = [];
  for (let a = 0; a + win <= x.length; a += hop) {
    let s = 0;
    for (let i = a; i < a + win; i++) s += (x[i] as number) ** 2;
    dbs.push(10 * Math.log10(s / win + 1e-20));
  }
  dbs.sort((p, q) => p - q);
  return dbs.length > 0 ? (dbs[dbs.length >> 1] as number) : -120;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- the corpus -------------------------------------------------------------------------------

/** Adult singers, bass to soprano (lowest and highest comfortable notes, MIDI) and a vowel each sings on. */
export const SINGERS = [
  { id: "bass", low: 40, high: 64, vowel: "o" as Vowel, h1Db: -4 }, // E2–E4
  { id: "baritone", low: 43, high: 67, vowel: "a" as Vowel, h1Db: -2 }, // G2–G4
  { id: "tenor", low: 48, high: 72, vowel: "e" as Vowel, h1Db: 0 }, // C3–C5
  { id: "alto", low: 53, high: 77, vowel: "u" as Vowel, h1Db: 0 }, // F3–F5
  { id: "mezzo", low: 55, high: 79, vowel: "a" as Vowel, h1Db: 0 }, // G3–G5
  { id: "soprano", low: 60, high: 81, vowel: "i" as Vowel, h1Db: 0 }, // C4–A5
] as const;

type Singer = (typeof SINGERS)[number];

/** Three notes across a singer's range: near the bottom, the middle, near the top. */
function across(s: Singer): number[] {
  return [s.low + 1, Math.round((s.low + s.high) / 2), s.high - 1];
}
/** A five-note scale-degree pattern in the singer's comfort zone (1 2 3 5 1′ of a major key). */
function pattern(s: Singer): number[] {
  const tonic = s.low + 5;
  return [0, 2, 4, 7, 12].map((d) => tonic + d);
}

const LEAD: ClipPart = { kind: "gap", sec: 0.35 };
const TAIL: ClipPart = { kind: "gap", sec: 0.3 };

function notesOf(midis: number[], dur: number, over: Partial<NoteSpec> = {}): NoteSpec[] {
  return midis.map((midi) => ({ midi, dur, ...over }));
}
function separated(notes: NoteSpec[], gap = 0.18): ClipPart[] {
  const parts: ClipPart[] = [LEAD];
  notes.forEach((n, i) => {
    parts.push({ kind: "phrase", notes: [n] });
    if (i < notes.length - 1) parts.push({ kind: "gap", sec: gap });
  });
  parts.push(TAIL);
  return parts;
}

/** Every clip of the corpus, as specs (render with `renderClip`). Deterministic. */
export function corpusSpecs(): ClipSpec[] {
  const specs: ClipSpec[] = [];
  for (const s of SINGERS) {
    const timbre = (over: Partial<VoiceTimbre> = {}): VoiceTimbre => ({
      vowel: s.vowel,
      h1Db: s.h1Db,
      ...over,
    });
    const base = { rangeLow: s.low };
    // steady: plain held notes across the range, a soft and a loud singer.
    specs.push({
      ...base,
      id: `steady/${s.id}`,
      cls: "steady",
      timbre: timbre(),
      levelDb: s.id === "alto" ? -32 : s.id === "tenor" ? -12 : -20,
      parts: separated(notesOf(across(s), 0.7)),
    });
    // vibrato: 4.5–7 Hz, ±20 to ±90 cents, with and without a delayed onset.
    const vib = [
      { rateHz: 5.2, cents: 35, onsetSec: 0.25 },
      { rateHz: 6.3, cents: 70 },
      { rateHz: 4.6, cents: 90, onsetSec: 0.15 },
    ];
    specs.push({
      ...base,
      id: `vibrato/${s.id}`,
      cls: "vibrato",
      timbre: timbre(),
      parts: separated(
        across(s).map(
          (midi, i): NoteSpec => ({ midi, dur: 0.9, vibrato: vib[i] as NonNullable<NoteSpec["vibrato"]> }),
        ),
      ),
    });
    // scoops into the note (−80 to −200 cents) and slow drift (±35 cents over a note).
    specs.push({
      ...base,
      id: `scoop-drift/${s.id}`,
      cls: "scoop-drift",
      timbre: timbre(),
      parts: separated([
        { midi: across(s)[0] as number, dur: 0.8, scoopCents: 150, scoopSec: 0.15, driftCents: -30 },
        {
          midi: across(s)[1] as number,
          dur: 0.8,
          scoopCents: 200,
          scoopSec: 0.1,
          vibrato: { rateHz: 5.5, cents: 25 },
        },
        { midi: across(s)[2] as number, dur: 0.8, scoopCents: -80, driftCents: 35 },
      ]),
    });
    // breathy: strong aspiration and shimmer, more jitter.
    specs.push({
      ...base,
      id: `breathy/${s.id}`,
      cls: "breathy",
      timbre: timbre({ breathDb: -14, jitter: 0.006, shimmer: 0.08 }),
      levelDb: -26,
      parts: separated(notesOf(pattern(s).slice(0, 3), 0.6, { vibrato: { rateHz: 5, cents: 20 } })),
    });
    // noise: the same notes under white and pink noise at 30, 20 and 15 dB SNR (and 10 dB: below the
    // contract's floor + 12 dB gate, Oak should withhold rather than guess).
    for (const snr of [30, 20, 15, 10] as const) {
      specs.push({
        ...base,
        id: `noise/${s.id}/snr${snr}`,
        cls: "noise",
        timbre: timbre(),
        background: [{ kind: snr % 20 === 0 ? "white-snr" : "pink-snr", snrDb: snr }],
        parts: separated(notesOf(pattern(s).slice(1, 4), 0.55, { vibrato: { rateHz: 5.5, cents: 25 } })),
      });
    }
    // weak fundamental: the first harmonic 18 to 30 dB down, the second boosted by a formant on it.
    specs.push({
      ...base,
      id: `weak-fundamental/${s.id}`,
      cls: "weak-fundamental",
      timbre: timbre({ h1Db: -24, vowel: s.low < 50 ? "u" : "o", tiltDb: -3 }),
      parts: separated(notesOf(across(s), 0.65, { vibrato: { rateHz: 5.8, cents: 30 } })),
    });
    specs.push({
      ...base,
      id: `weak-fundamental/${s.id}/deep`,
      cls: "weak-fundamental",
      timbre: timbre({ h1Db: -30, vowel: "a", tiltDb: -2 }),
      levelDb: -24,
      parts: separated(notesOf(pattern(s), 0.45)),
    });
    // glide-legato: a sung degree pattern in one breath, with glides, and an octave leap.
    const p = pattern(s);
    specs.push({
      ...base,
      id: `glide-legato/${s.id}`,
      cls: "glide-legato",
      timbre: timbre(),
      parts: [
        LEAD,
        {
          kind: "phrase",
          legato: true,
          glideSec: 0.08,
          notes: [...p, p[2] as number, p[0] as number].map((midi) => ({
            midi,
            dur: 0.42,
            vibrato: { rateHz: 5.5, cents: 20, onsetSec: 0.2 },
          })),
        },
        { kind: "gap", sec: 0.25 },
        {
          kind: "phrase",
          legato: true,
          glideSec: 0.18, // portamento
          notes: [p[0] as number, p[4] as number, p[3] as number, p[0] as number].map((midi) => ({
            midi,
            dur: 0.5,
          })),
        },
        TAIL,
      ],
    });
    // consonant onsets: "ta", "ka", "da", "sa" on each note.
    const cons = ["t", "k", "d", "s"] as const;
    specs.push({
      ...base,
      id: `consonant/${s.id}`,
      cls: "consonant",
      timbre: timbre(),
      parts: separated(
        pattern(s)
          .slice(0, 4)
          .map((midi, i): NoteSpec => ({ midi, dur: 0.35, consonant: cons[i % 4] as (typeof cons)[number] })),
        0.1,
      ),
    });
    // bleed: the backing track leaking under the voice, and on its own between phrases.
    for (const db of [-58, -50] as const) {
      specs.push({
        ...base,
        id: `bleed/${s.id}/${-db}`,
        cls: "bleed",
        timbre: timbre(),
        background: [{ kind: "bleed", db }],
        parts: [
          { kind: "gap", sec: 1.6 },
          ...separated(notesOf(pattern(s).slice(0, 3), 0.5, { vibrato: { rateHz: 5.5, cents: 25 } })).slice(
            1,
          ),
          { kind: "gap", sec: 1.2 },
        ],
      });
    }
  }
  // silence and room noise: nothing here may be called a voice.
  const rooms: { id: string; bg: Background[] }[] = [
    { id: "quiet-room", bg: [] },
    { id: "pink-60", bg: [{ kind: "pink", db: -60 }] },
    { id: "pink-50", bg: [{ kind: "pink", db: -50 }] },
    { id: "hum-50", bg: [{ kind: "hum", hz: 50, db: -54 }] },
    { id: "hum-60", bg: [{ kind: "hum", hz: 60, db: -50 }] },
    { id: "fan", bg: [{ kind: "fan", db: -46 }] },
    {
      id: "keyboard",
      bg: [
        { kind: "clicks", db: -28, perSec: 6 },
        { kind: "pink", db: -62 },
      ],
    },
    {
      id: "breaths",
      bg: [
        { kind: "breaths", db: -36 },
        { kind: "pink", db: -64 },
      ],
    },
    { id: "white-48", bg: [{ kind: "white", db: -48 }] },
  ];
  for (const r of rooms) {
    specs.push({
      id: `silence-room/${r.id}`,
      cls: "silence-room",
      timbre: { vowel: "a" },
      rangeLow: 48,
      background: r.bg,
      parts: [{ kind: "gap", sec: 2.5 }],
    });
  }
  // 44.1 kHz devices: one clip of each voiced kind at the other common rate.
  for (const s of [SINGERS[0], SINGERS[5]]) {
    specs.push({
      id: `steady/${s.id}/44k1`,
      cls: "steady",
      sampleRate: 44100,
      rangeLow: s.low,
      timbre: { vowel: s.vowel, h1Db: s.h1Db },
      parts: separated(notesOf(across(s), 0.6, { vibrato: { rateHz: 5.5, cents: 40 } })),
    });
  }
  return specs;
}

const VOWELS: readonly Vowel[] = ["a", "e", "i", "o", "u"];

/**
 * A held-out variant of a clip: other notes (moved −3 to +3 semitones, kept inside the singer's range), the next
 * vowel, another first-harmonic level (±3 dB), other vibrato rates and other random seeds. The detector's
 * thresholds were set on variant 0; the corpus test checks the gate on unseen variants too.
 */
export function variantOf(spec: ClipSpec, variant: number): ClipSpec {
  if (variant === 0) return spec;
  const shift = ((variant * 5) % 7) - 3;
  const hi = spec.rangeLow + 24;
  const move = (m: number) => {
    let x = m + shift;
    if (x > hi) x -= 12;
    if (x < spec.rangeLow) x += 12;
    return x;
  };
  const vi = VOWELS.indexOf(spec.timbre.vowel);
  const parts: ClipPart[] = spec.parts.map((p) =>
    p.kind === "gap"
      ? p
      : {
          ...p,
          notes: p.notes.map((n) => ({
            ...n,
            midi: move(n.midi),
            ...(n.vibrato
              ? { vibrato: { ...n.vibrato, rateHz: n.vibrato.rateHz * (variant % 2 ? 1.12 : 0.9) } }
              : {}),
          })),
        },
  );
  return {
    ...spec,
    id: `${spec.id}#v${variant}`,
    seed: hashId(`${spec.id}#v${variant}`),
    timbre: {
      ...spec.timbre,
      vowel: VOWELS[(vi + variant) % VOWELS.length] as Vowel,
      ...(spec.timbre.h1Db !== undefined ? { h1Db: spec.timbre.h1Db + (variant % 2 ? -3 : 3) } : {}),
    },
    parts,
  };
}

/** The whole corpus (or a held-out `variant`), rendered. About 5 minutes of audio; takes a few seconds. */
export function renderCorpus(filter?: (spec: ClipSpec) => boolean, variant = 0): CorpusClip[] {
  return corpusSpecs()
    .filter((s) => (filter ? filter(s) : true))
    .map((s) => renderClip(variantOf(s, variant)));
}
