// Oak's own drum break, `s("brk")` (contracts §3.2 `snd.brk`: "a one-bar drum break, rendered by Oak and free
// to use (CC0)"). The famous breaks are someone's recording; this one is not. It is rendered here, sample by
// sample, from one-shots of the uzu-drumkit (released under the Unlicense, a public-domain dedication, and
// already in the pack), to an original one-bar groove. The result is dedicated to the public domain (CC0 1.0).
//
// The render is pure arithmetic on the input files: the same inputs always give the same bytes, so the pack
// lock can pin its sha256 (`bun scripts/sounds/check.ts`). mirror.ts writes it as a derived file.

/** Tempo of the recorded bar. `s("brk").loopAt(1)` fits it to any tempo. */
export const BRK_BPM = 96;
export const BRK_SAMPLE_RATE = 44100;
/** Where the break sits below the pack root, and the sample map that names it. */
export const BRK_DIR = "oak-rendered/";
export const BRK_FILE = "brk/oak-break-96.wav";
export const BRK_JSON = "oak-rendered.json";
export const BRK_LICENCE = "CC0 1.0 (rendered by Oak from uzu-drumkit one-shots, Unlicense)";

/** The one-shots the break is built from (paths inside the uzu-drumkit map), all 16-bit PCM. */
export const BRK_SOURCES = {
  kick: "bd/11_bd_mot4i.wav",
  snare: "sd/11_sd_switchangel_3.wav",
  hat: "hh/11_hh_mot4i.wav",
  open: "oh/11_oh_switchangel.wav",
} as const;
export type BrkVoice = keyof typeof BRK_SOURCES;

/**
 * One hit: sixteenth step 0–15, the voice, its level and a fixed push or drag in milliseconds. Levels are
 * relative to each one-shot as it was recorded (the hats are short and quiet, so they get more); the bar is
 * normalised to its peak afterwards.
 */
export interface BrkHit {
  step: number;
  voice: BrkVoice;
  gain: number;
  nudgeMs: number;
}

/**
 * The groove: kick on 1, the "a" of 1 and on 3 with a push into 4; backbeat snare with ghost notes; sixteenth
 * hats with the off-sixteenths lighter; an open hat on the "and" of 4 that the next closed hat chokes. The
 * nudges are a drummer's: ghosts a little late, the pushed kick a little early. Fixed, not random.
 */
export const BRK_GROOVE: readonly BrkHit[] = [
  { step: 0, voice: "kick", gain: 1, nudgeMs: 0 },
  { step: 3, voice: "kick", gain: 0.72, nudgeMs: -3 },
  { step: 8, voice: "kick", gain: 0.95, nudgeMs: 0 },
  { step: 10, voice: "kick", gain: 0.8, nudgeMs: -4 },
  { step: 4, voice: "snare", gain: 1, nudgeMs: 2 },
  { step: 7, voice: "snare", gain: 0.32, nudgeMs: 6 },
  { step: 9, voice: "snare", gain: 0.28, nudgeMs: 7 },
  { step: 12, voice: "snare", gain: 1, nudgeMs: 2 },
  { step: 15, voice: "snare", gain: 0.36, nudgeMs: 5 },
  ...Array.from({ length: 16 }, (_, step): BrkHit | null =>
    step === 14
      ? null
      : {
          step,
          voice: "hat",
          gain: step % 4 === 0 ? 4 : step % 2 === 0 ? 3.4 : 1.8,
          nudgeMs: step % 2 ? 4 : 0,
        },
  ).filter((h): h is BrkHit => h !== null),
  { step: 14, voice: "open", gain: 2, nudgeMs: 0 },
];

/** Stereo position of each voice, −1 (left) to 1 (right), as a drum overhead pair hears the kit. */
const PAN: Record<BrkVoice, number> = { kick: 0, snare: -0.08, hat: 0.32, open: 0.32 };
/** Peak level of the bar, linear (−3 dBFS). */
const PEAK = 10 ** (-3 / 20);
/** Fade at the bar's end so the loop point never clicks, seconds. */
const END_FADE_S = 0.004;
/** How fast a closed hat chokes a ringing open hat, seconds. */
const CHOKE_S = 0.02;

export interface Pcm {
  sampleRate: number;
  /** One Float32Array per channel, −1..1. */
  channels: Float32Array[];
}

const u16 = (b: Uint8Array, o: number) => (b[o] as number) | ((b[o + 1] as number) << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const tag = (b: Uint8Array, o: number) =>
  String.fromCharCode(b[o] ?? 0, b[o + 1] ?? 0, b[o + 2] ?? 0, b[o + 3] ?? 0);

/** Decodes a RIFF/WAVE file: PCM 16 or 24 bit, IEEE float 32, or the extensible form of those. */
export function decodeWav(bytes: Uint8Array): Pcm {
  if (tag(bytes, 0) !== "RIFF" || tag(bytes, 8) !== "WAVE") throw new Error("not a RIFF/WAVE file");
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: Uint8Array | null = null;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const id = tag(bytes, o);
    const size = u32(bytes, o + 4);
    const body = bytes.subarray(o + 8, Math.min(bytes.length, o + 8 + size));
    if (id === "fmt ") {
      format = u16(body, 0);
      channels = u16(body, 2);
      sampleRate = u32(body, 4);
      bits = u16(body, 14);
      if (format === 0xfffe && body.length >= 26) format = u16(body, 24);
    } else if (id === "data") data = body;
    o += 8 + size + (size % 2);
  }
  if (!data || channels < 1 || sampleRate <= 0) throw new Error("WAVE file has no fmt or data chunk");
  const bytesPer = bits / 8;
  const frames = Math.floor(data.length / (bytesPer * channels));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const at = (i * channels + c) * bytesPer;
      let x: number;
      if (format === 3 && bits === 32) x = view.getFloat32(at, true);
      else if (format === 1 && bits === 16) x = view.getInt16(at, true) / 32768;
      else if (format === 1 && bits === 24) {
        const v = (data[at] as number) | ((data[at + 1] as number) << 8) | ((data[at + 2] as number) << 16);
        x = ((v << 8) >> 8) / 8388608;
      } else throw new Error(`unsupported WAVE format ${format}/${bits} bit`);
      (out[c] as Float32Array)[i] = x;
    }
  }
  return { sampleRate, channels: out };
}

/** 16-bit PCM WAV bytes of a stereo (or mono) buffer. */
export function encodeWav(pcm: Pcm): Uint8Array {
  const ch = pcm.channels.length;
  const frames = pcm.channels[0]?.length ?? 0;
  const dataBytes = frames * ch * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const view = new DataView(buf.buffer);
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, (pcm.channels[c] as Float32Array)[i] as number));
      view.setInt16(44 + (i * ch + c) * 2, Math.round(x * 32767), true);
    }
  return buf;
}

/** A one-shot as mono at the render rate (channels averaged; linear resampling if the rate differs). */
function monoAt(pcm: Pcm, rate: number): Float32Array {
  const n = pcm.channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const c of pcm.channels)
    for (let i = 0; i < n; i++) mono[i] = (mono[i] as number) + (c[i] as number) / pcm.channels.length;
  if (pcm.sampleRate === rate) return mono;
  const ratio = pcm.sampleRate / rate;
  const out = new Float32Array(Math.floor(n / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (mono[j] ?? 0) * (1 - f) + (mono[j + 1] ?? 0) * f;
  }
  return out;
}

/** The bar's length in frames at the render rate. */
export const brkFrames = (): number => Math.round((60 / BRK_BPM) * 4 * BRK_SAMPLE_RATE);

/** Renders the break from its one-shots. Deterministic: the same inputs give the same samples. */
export function renderBreak(sources: Record<BrkVoice, Pcm>): Pcm {
  const rate = BRK_SAMPLE_RATE;
  const frames = brkFrames();
  const stepFrames = frames / 16;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const shots = Object.fromEntries(
    (Object.keys(BRK_SOURCES) as BrkVoice[]).map((v) => [v, monoAt(sources[v], rate)]),
  ) as Record<BrkVoice, Float32Array>;
  const hats = BRK_GROOVE.filter((h) => h.voice === "hat")
    .map((h) => Math.round(h.step * stepFrames + (h.nudgeMs / 1000) * rate))
    .sort((a, b) => a - b);
  for (const hit of BRK_GROOVE) {
    const shot = shots[hit.voice];
    const start = Math.max(0, Math.round(hit.step * stepFrames + (hit.nudgeMs / 1000) * rate));
    // equal-power pan
    const angle = ((PAN[hit.voice] + 1) / 2) * (Math.PI / 2);
    const [gl, gr] = [Math.cos(angle) * hit.gain, Math.sin(angle) * hit.gain];
    // an open hat rings until the next closed hat chokes it
    const chokeAt = hit.voice === "open" ? (hats.find((h) => h > start) ?? frames) : Number.POSITIVE_INFINITY;
    const chokeLen = CHOKE_S * rate;
    for (let i = 0; i < shot.length; i++) {
      const at = start + i;
      if (at >= frames) break;
      let env = 1;
      if (at >= chokeAt) {
        env = 1 - (at - chokeAt) / chokeLen;
        if (env <= 0) break;
      }
      const x = (shot[i] as number) * env;
      left[at] = (left[at] as number) + x * gl;
      right[at] = (right[at] as number) + x * gr;
    }
  }
  let peak = 0;
  for (let i = 0; i < frames; i++)
    peak = Math.max(peak, Math.abs(left[i] as number), Math.abs(right[i] as number));
  const scale = peak > 0 ? PEAK / peak : 1;
  const fade = Math.round(END_FADE_S * rate);
  for (let i = 0; i < frames; i++) {
    const tail = frames - i <= fade ? (frames - i) / fade : 1;
    left[i] = (left[i] as number) * scale * tail;
    right[i] = (right[i] as number) * scale * tail;
  }
  return { sampleRate: rate, channels: [left, right] };
}

/** The break as WAV bytes, its one-shots read through `read(path inside uzu-drumkit)`. */
export async function renderBreakWav(read: (path: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const entries = await Promise.all(
    (Object.entries(BRK_SOURCES) as [BrkVoice, string][]).map(
      async ([voice, path]) => [voice, decodeWav(await read(path))] as const,
    ),
  );
  return encodeWav(renderBreak(Object.fromEntries(entries) as Record<BrkVoice, Pcm>));
}
